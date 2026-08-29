"""
Product Authentication Profile builder.

At product-creation time (after reference images are uploaded) this builds a
rich, VLM-derived ground-truth profile of the GENUINE product from the vendor's
metadata + the reference images, and caches it on the product document. Scan
time then compares against this cached profile instead of re-deriving it — the
"metadata understanding" work is moved OUT of the hot scan path (lower latency,
higher accuracy).

Runs in a background thread (non-blocking on the upload response) with a short
debounce so several rapid reference-image uploads coalesce into a single build.
Failures are non-fatal: the scan path falls back to raw-metadata prompting.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime
from typing import Any, Dict, List

from app.core.db import products_collection
from app.services.image_paths import resolve_image_fs_path
from app.services.qwen_vl_service import extract_product_profile

logger = logging.getLogger(__name__)

PROFILE_BUILD_DEBOUNCE_S = float(os.getenv("AUTHENTIQ_PROFILE_DEBOUNCE", "6"))

# Vendor-declared fields handed to the profiler as ground truth.
_PROFILE_METADATA_FIELDS = [
    "name", "brand", "brand_name", "variant_name", "category", "description",
    "sku", "serial_number", "barcode", "hsn_code", "batch_number", "pack_size",
    "net_quantity", "mrp", "manufacturer_name", "manufacturer_address",
    "country_of_origin",
]

_building_lock = threading.Lock()
_building: set = set()
_rebuild_requested: set = set()


def _declared_metadata(product: Dict[str, Any]) -> Dict[str, Any]:
    return {k: product.get(k) for k in _PROFILE_METADATA_FIELDS if product.get(k) not in (None, "")}


def _load_reference_images(product: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for img in product.get("reference_images", []) or []:
        path = resolve_image_fs_path(img.get("url", ""))
        if not path or not os.path.isfile(path):
            continue
        try:
            with open(path, "rb") as f:
                out.append({"view": img.get("view_type") or "reference", "bytes": f.read()})
        except OSError as exc:
            logger.warning("[Profile] Could not read reference %s: %s", path, exc)
    return out


def build_and_store_profile(product_id: str) -> Dict[str, Any]:
    """Synchronously build + persist the authentication profile. Returns the profile dict."""
    product = products_collection.find_one({"id": product_id})
    if not product:
        return {"status": "failed", "error": "product_not_found"}

    refs = _load_reference_images(product)
    declared = _declared_metadata(product)

    products_collection.update_one(
        {"id": product_id},
        {"$set": {
            "authentication_profile.status": "pending",
            "authentication_profile.updated_at": datetime.utcnow(),
        }},
    )

    profile = extract_product_profile(refs, declared)
    profile["generated_at"] = datetime.utcnow()
    profile["reference_view_count"] = len(refs)

    products_collection.update_one({"id": product_id}, {"$set": {"authentication_profile": profile}})
    logger.info(
        "[Profile] product=%s status=%s refs=%d", product_id, profile.get("status"), len(refs)
    )
    return profile


def _worker(product_id: str) -> None:
    with _building_lock:
        if product_id in _building:
            _rebuild_requested.add(product_id)  # a build is already running; ask it to redo
            return
        _building.add(product_id)
    try:
        time.sleep(PROFILE_BUILD_DEBOUNCE_S)  # coalesce rapid multi-image uploads
        while True:
            with _building_lock:
                _rebuild_requested.discard(product_id)
            try:
                build_and_store_profile(product_id)
            except Exception as exc:
                logger.warning("[Profile] build failed for %s: %s", product_id, exc, exc_info=True)
            with _building_lock:
                if product_id not in _rebuild_requested:
                    break
    finally:
        with _building_lock:
            _building.discard(product_id)
            _rebuild_requested.discard(product_id)


def schedule_profile_build(product_id: str) -> None:
    """Fire-and-forget background (re)build of a product's authentication profile."""
    try:
        threading.Thread(
            target=_worker, args=(product_id,), daemon=True, name=f"profile-{product_id[:8]}"
        ).start()
    except Exception as exc:
        logger.warning("[Profile] could not schedule build for %s: %s", product_id, exc)
