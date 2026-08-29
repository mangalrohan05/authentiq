"""
Reference-image embedding lifecycle: generation, persistence, and product-level status.

All OpenCLIP inference runs in thread executors; this module coordinates DB updates
and gives verification a safe fallback when background jobs have not finished.

Now uses asyncio for parallel image processing.
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.core.db import products_collection
from app.services.openclip_service import (
    generate_embedding_from_path,
    get_active_model_signature,
    get_model_singleton,
)
from app.services.ocr_service import extract_text_from_image_bytes
from app.services.patch_embeddings import (
    PATCH_VIEW_TYPES,
    generate_patch_embeddings_from_bytes,
)
from app.services.region_embeddings import (
    EMBEDDING_STRATEGY_VERSION,
    generate_region_embeddings_from_bytes,
)
from app.services.region_scoring_config import YOLO_ENABLED
from app.services.embedding_compat import embedding_matches_model, normalize_view_type
from app.services.image_paths import resolve_image_fs_path

logger = logging.getLogger(__name__)

# In-flight product jobs (avoid duplicate concurrent runs for same product)
_active_jobs: set[str] = set()
_jobs_lock = threading.Lock()


def summarize_embeddings(reference_images: List[dict]) -> Dict[str, Any]:
    """Compute aggregate embedding readiness for a product."""
    images = reference_images or []
    total = len(images)
    ready = sum(
        1
        for img in images
        if img.get("embedding_cached") and img.get("embedding_vector")
    )
    pending = total - ready

    if total == 0:
        status = "none"
    elif ready == 0:
        status = "pending"
    elif ready < total:
        # At least one embedding ready — verification can proceed with available images.
        # Images without embeddings are skipped during scoring.
        status = "ready"
    else:
        status = "ready"

    return {
        "embeddings_status": status,
        "embeddings_ready_count": ready,
        "embeddings_total_count": total,
        "embeddings_pending_count": pending,
    }


async def _update_product_embedding_summary(product_id: str, images: List[dict]) -> None:
    """Update product embedding summary in database (async-friendly)."""
    summary = summarize_embeddings(images)
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: products_collection.update_one(
            {"id": product_id},
            {
                "$set": {
                    "reference_images": images,
                    **summary,
                    "embeddings_updated_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
            },
        ),
    )


async def generate_embedding_for_reference_image(
    product_id: str,
    image_id: str,
    image_path: str,
) -> bool:
    """
    Generate and persist embedding for one reference image (async).
    Returns True on success.
    """
    abs_path = resolve_image_fs_path(image_path)
    if not abs_path or not os.path.isfile(abs_path):
        logger.error(
            "[Embedding] Image file not found for product=%s image=%s path=%s",
            product_id,
            image_id,
            abs_path,
        )
        return False

    logger.info(
        "[Embedding] Started product=%s image=%s path=%s",
        product_id,
        image_id,
        abs_path,
    )

    # Run CPU-bound embedding generation in executor
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, generate_embedding_from_path, abs_path)
    
    if not result.get("success"):
        logger.error(
            "[Embedding] Failed product=%s image=%s: %s",
            product_id,
            image_id,
            result.get("error"),
        )
        return False

    # Fetch product from database (run in executor to avoid blocking)
    product = await loop.run_in_executor(None, lambda: products_collection.find_one({"id": product_id}))
    if not product:
        logger.error("[Embedding] Product %s not found when saving", product_id)
        return False

    images = product.get("reference_images", [])
    found = False
    embedding_vector = result.get("embedding")
    for img in images:
        if img.get("id") == image_id:
            img["embedding_cached"] = True
            img["embedding_cached_at"] = datetime.utcnow()
            img["embedding_vector"] = embedding_vector
            img["embedding_model"] = result.get("embedding_model")
            img["embedding_pretrained"] = result.get("embedding_pretrained")
            img["embedding_strategy_version"] = result.get(
                "embedding_strategy_version", EMBEDDING_STRATEGY_VERSION
            )
            img["embedding_error"] = None
            view = normalize_view_type(img.get("view_type"))
            try:
                with open(abs_path, "rb") as raw_f:
                    raw_bytes = raw_f.read()
            except OSError:
                raw_bytes = None
            if raw_bytes and view in PATCH_VIEW_TYPES:
                img["patch_embeddings"] = generate_patch_embeddings_from_bytes(raw_bytes)
                ocr_text, ocr_engine = extract_text_from_image_bytes(raw_bytes)
                img["ocr_text_normalized"] = ocr_text
                img["ocr_engine"] = ocr_engine
            if raw_bytes and YOLO_ENABLED:
                region_payload = generate_region_embeddings_from_bytes(raw_bytes)
                img["region_embeddings"] = region_payload.get("regions") or []
                img["region_detection_meta"] = region_payload.get("meta")
            found = True
            break

    if not found:
        logger.error(
            "[Embedding] Image %s not in product %s reference_images",
            image_id,
            product_id,
        )
        return False

    await _update_product_embedding_summary(product_id, images)
    logger.info("[Embedding] Saved product=%s image=%s", product_id, image_id)
    return True


async def process_product_pending_embeddings(product_id: str) -> Dict[str, int]:
    """
    Process all reference images on a product that lack cached embeddings (async).
    Uses asyncio.gather for parallel processing of multiple images.
    Intended for background tasks or verify-time fallback.
    """
    loop = asyncio.get_event_loop()
    product = await loop.run_in_executor(None, lambda: products_collection.find_one({"id": product_id}))
    if not product:
        return {"success": 0, "failed": 0, "skipped": 0}

    images = product.get("reference_images", [])
    
    # Separate images that need processing vs already cached
    pending_images = []
    skipped = 0
    
    for img in images:
        if img.get("embedding_cached") and img.get("embedding_vector"):
            skipped += 1
        else:
            pending_images.append(img)
    
    if not pending_images:
        return {"success": 0, "failed": 0, "skipped": skipped}
    
    # Process images in parallel using asyncio.gather
    tasks = []
    for img in pending_images:
        image_id = img.get("id")
        url = img.get("url", "")
        task = generate_embedding_for_reference_image(product_id, image_id, url)
        tasks.append(task)
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    success = sum(1 for r in results if r is True)
    failed = sum(1 for r in results if r is False or isinstance(r, Exception))
    
    # Mark failures on images for observability
    if failed > 0:
        product = await loop.run_in_executor(None, lambda: products_collection.find_one({"id": product_id}))
        if product:
            updated_images = product.get("reference_images", [])
            for idx, img in enumerate(pending_images):
                result = results[idx]
                if result is False or isinstance(result, Exception):
                    image_id = img.get("id")
                    for ref in updated_images:
                        if ref.get("id") == image_id:
                            ref["embedding_error"] = "generation_failed"
                            ref["embedding_cached"] = False
            await _update_product_embedding_summary(product_id, updated_images)

    return {"success": success, "failed": failed, "skipped": skipped}


def schedule_product_embedding_job(product_id: str) -> None:
    """Schedule pending embeddings. Prefers Celery/Redis; falls back to in-process execution on broker/connection issues."""
    if os.getenv("USE_REDIS", "true").lower() == "true":
        try:
            from app.tasks.embedding_tasks import process_product_embeddings_task
            # Dispatch task to Celery worker queue
            process_product_embeddings_task.delay(product_id)
            logger.info(f"[Embedding] Dispatched Celery task for product_id={product_id}")
            
            # Instantly mark status as "processing"
            products_collection.update_one(
                {"id": product_id},
                {
                    "$set": {
                        "embeddings_status": "processing",
                        "updated_at": datetime.utcnow(),
                    }
                },
            )
            return
        except Exception as cel_err:
            logger.warning(
                f"[Embedding] Celery task dispatch failed: {cel_err}. "
                "Running fallback local in-process background thread..."
            )
    else:
        logger.info(
            "[Embedding] Redis is disabled via USE_REDIS env var. "
            "Running fallback local in-process background thread..."
        )

    async def _run_async():
        with _jobs_lock:
            if product_id in _active_jobs:
                return
            _active_jobs.add(product_id)

        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: products_collection.update_one(
                    {"id": product_id},
                    {
                        "$set": {
                            "embeddings_status": "processing",
                            "updated_at": datetime.utcnow(),
                        }
                    },
                ),
            )
            stats = await process_product_pending_embeddings(product_id)
            logger.info(
                "[Embedding] Job finished product=%s stats=%s",
                product_id,
                stats,
            )
        except Exception as e:
            logger.error(
                "[Embedding] Job error product=%s: %s",
                product_id,
                e,
                exc_info=True,
            )
        finally:
            with _jobs_lock:
                _active_jobs.discard(product_id)

    # Create asyncio task if event loop is running, otherwise use thread as fallback
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(_run_async())
        else:
            # Fallback to threading if no event loop is running
            def _run_thread():
                asyncio.run(_run_async())
            thread = threading.Thread(
                target=_run_thread,
                name=f"embed-{product_id[:8]}",
                daemon=True,
            )
            thread.start()
    except RuntimeError:
        # No event loop, use threading fallback
        def _run_thread():
            asyncio.run(_run_async())
        thread = threading.Thread(
            target=_run_thread,
            name=f"embed-{product_id[:8]}",
            daemon=True,
        )
        thread.start()


def get_cached_reference_embeddings(
    product: dict,
) -> Tuple[List[dict], List[List[float]], List[str]]:
    """Return cached images compatible with the active model weights."""
    reference_images = product.get("reference_images", [])
    model_sig = get_active_model_signature()
    cached = [
        img
        for img in reference_images
        if img.get("embedding_cached")
        and img.get("embedding_vector")
        and embedding_matches_model(img, model_sig)
    ]
    if not cached:
        from app.services.embedding_compat import EXPECTED_EMBEDDING_DIM

        legacy = [
            img
            for img in reference_images
            if img.get("embedding_vector")
            and len(img.get("embedding_vector") or []) == EXPECTED_EMBEDDING_DIM
        ]
        if legacy:
            logger.warning(
                "[Embedding] Using %d legacy reference vector(s) for product %s",
                len(legacy),
                product.get("id"),
            )
            cached = legacy
    skipped = sum(
        1
        for img in reference_images
        if img.get("embedding_cached")
        and img.get("embedding_vector")
        and img not in cached
    )
    if skipped:
        logger.warning(
            "[Embedding] Skipped %d reference vector(s) with mismatched OpenCLIP weights for product %s",
            skipped,
            product.get("id"),
        )
    vectors = [img.get("embedding_vector") for img in cached]
    categories = [img.get("view_type") for img in cached]
    return cached, vectors, categories


async def ensure_product_embeddings_ready(
    product_id: str,
    *,
    allow_inline_generation: bool = True,
) -> Dict[str, Any]:
    """
    Ensure product has at least one cached reference embedding before verification (async).

    If images exist but embeddings are missing, optionally runs inline generation
    (blocking the caller thread — use from executor in async routes).
    """
    loop = asyncio.get_event_loop()
    product = await loop.run_in_executor(None, lambda: products_collection.find_one({"id": product_id}))
    if not product:
        return {"ready": False, "reason": "product_not_found"}

    reference_images = product.get("reference_images", [])
    if not reference_images:
        return {"ready": False, "reason": "no_reference_images"}

    _, vectors, _ = get_cached_reference_embeddings(product)
    summary = summarize_embeddings(reference_images)
    
    if summary.get("embeddings_status") == "ready":
        return {"ready": True, "reason": "ready", **summary}

    if not allow_inline_generation:
        return {"ready": False, "reason": "embeddings_pending", **summary}

    singleton = get_model_singleton()
    if not singleton.ensure_loaded():
        return {
            "ready": False,
            "reason": "ai_unavailable",
            "error": singleton._load_error or "OpenCLIP model failed to load",
        }

    stats = await process_product_pending_embeddings(product_id)
    product = await loop.run_in_executor(None, lambda: products_collection.find_one({"id": product_id})) or product
    _, vectors, _ = get_cached_reference_embeddings(product)
    summary = summarize_embeddings(product.get("reference_images", []))

    if vectors:
        return {"ready": True, "reason": "generated_inline", "stats": stats, **summary}

    return {
        "ready": False,
        "reason": "embeddings_failed",
        "stats": stats,
        **summary,
        "error": singleton._load_error,
    }


def get_product_embedding_status(product_id: str) -> Optional[Dict[str, Any]]:
    """Public status payload for vendor UI / polling."""
    product = products_collection.find_one({"id": product_id}, {"_id": 0})
    if not product:
        return None

    images = product.get("reference_images", [])
    summary = summarize_embeddings(images)
    singleton = get_model_singleton()

    ai_status = "healthy" if singleton.is_ready() else (
        "error" if singleton._load_failed else "not_loaded"
    )

    return {
        "product_id": product_id,
        **summary,
        "ai_service": {
            "status": ai_status,
            "loaded": singleton.is_ready(),
            "error": singleton._load_error if singleton._load_failed else None,
        },
        "images": [
            {
                "id": img.get("id"),
                "view_type": img.get("view_type"),
                "embedding_cached": bool(
                    img.get("embedding_cached") and img.get("embedding_vector")
                ),
                "embedding_error": img.get("embedding_error"),
            }
            for img in images
        ],
    }
