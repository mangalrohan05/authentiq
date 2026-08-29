"""
Local patch crops for detail-heavy verification (labels, holograms, etc.).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

from app.services.openclip_service import embed_pil_images_batch

logger = logging.getLogger(__name__)

EMBEDDING_STRATEGY_VERSION = "v2_global_patch_ocr"

PATCH_VIEW_TYPES = frozenset(
    {"labels", "holograms", "barcode_qr", "seals", "label"}
)

# Slots that use patch + OCR fusion
PATCH_ENABLED_SLOTS = frozenset({"label"})

GLOBAL_PATCH_BLEND = {"global": 0.6, "patch": 0.4}
LABEL_VISUAL_OCR_BLEND = {"visual": 0.7, "ocr": 0.3}


def pil_from_bytes(image_bytes: bytes) -> Optional[Image.Image]:
    from io import BytesIO

    try:
        return Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        logger.warning("[Patch] Invalid image bytes: %s", exc)
        return None


def extract_patch_crops(image: Image.Image) -> List[Tuple[str, Image.Image]]:
    """
    Center, quadrants, and a high-detail center crop (larger fraction, upscaled for detail).
    """
    w, h = image.size
    if w < 32 or h < 32:
        return [("full", image.copy())]

    crops: List[Tuple[str, Image.Image]] = []

    # High-detail center (75% of frame, min dimension preserved)
    cw, ch = int(w * 0.75), int(h * 0.75)
    cx, cy = (w - cw) // 2, (h - ch) // 2
    detail = image.crop((cx, cy, cx + cw, cy + ch))
    long_edge = max(detail.size)
    if long_edge < 512:
        scale = min(2.0, 512 / max(long_edge, 1))
        detail = detail.resize(
            (int(detail.width * scale), int(detail.height * scale)),
            Image.Resampling.LANCZOS,
        )
    crops.append(("detail_center", detail))

    # Standard center 60%
    cw2, ch2 = int(w * 0.6), int(h * 0.6)
    cx2, cy2 = (w - cw2) // 2, (h - ch2) // 2
    crops.append(("center", image.crop((cx2, cy2, cx2 + cw2, cy2 + ch2))))

    hw, hh = w // 2, h // 2
    crops.append(("quadrant_tl", image.crop((0, 0, hw, hh))))
    crops.append(("quadrant_tr", image.crop((hw, 0, w, hh))))
    crops.append(("quadrant_bl", image.crop((0, hh, hw, h))))
    crops.append(("quadrant_br", image.crop((hw, hh, w, h))))

    return crops


def generate_patch_embeddings_from_bytes(
    image_bytes: bytes,
) -> List[Dict[str, Any]]:
    """Compute patch embeddings for storage or on-the-fly verify."""
    image = pil_from_bytes(image_bytes)
    if not image:
        return []

    crop_list = extract_patch_crops(image)
    pil_images = [c[1] for c in crop_list]
    vectors = embed_pil_images_batch(pil_images)
    out: List[Dict[str, Any]] = []
    for (region, _), vec in zip(crop_list, vectors):
        if vec:
            out.append({"region": region, "vector": vec})
    return out


def max_patch_similarity(
    customer_patches: List[Dict[str, Any]],
    reference_patches: List[Dict[str, Any]],
    cosine_fn,
) -> float:
    if not customer_patches or not reference_patches:
        return 0.0
    best = 0.0
    for cp in customer_patches:
        cv = cp.get("vector")
        if not cv:
            continue
        for rp in reference_patches:
            rv = rp.get("vector")
            if rv:
                best = max(best, cosine_fn(cv, rv))
    return float(best)


def compute_patch_stats(
    customer_patches: List[Dict[str, Any]],
    reference_patches: List[Dict[str, Any]],
    cosine_fn,
) -> Dict[str, Any]:
    """
    Compute aggregate patch-level similarity statistics between a customer image
    and reference image patches.

    Returns avg, min, and max cosine similarity across all (customer × reference)
    patch pair comparisons, plus a count of comparisons made.

    The min score is particularly useful as a "weakest link" tamper signal:
    a very low min alongside a high average suggests localized tampering,
    e.g. an authentic label with a counterfeit hologram overlay.

    Args:
        customer_patches:   List of patch dicts with "vector" key.
        reference_patches:  List of patch dicts with "vector" key.
        cosine_fn:          Callable(vec_a, vec_b) -> float in [0, 1].

    Returns:
        {
            "avg":   float,  — mean similarity across all patch pairs
            "min":   float,  — minimum similarity (weakest link)
            "max":   float,  — maximum similarity (best matching patch)
            "count": int,    — number of patch pairs compared
        }
        Returns zeros dict if either patch list is empty.
    """
    if not customer_patches or not reference_patches:
        return {"avg": 0.0, "min": 0.0, "max": 0.0, "count": 0}

    all_sims: List[float] = []
    for cp in customer_patches:
        cv = cp.get("vector")
        if not cv:
            continue
        for rp in reference_patches:
            rv = rp.get("vector")
            if rv:
                all_sims.append(cosine_fn(cv, rv))

    if not all_sims:
        return {"avg": 0.0, "min": 0.0, "max": 0.0, "count": 0}

    return {
        "avg":   round(float(sum(all_sims) / len(all_sims)), 4),
        "min":   round(float(min(all_sims)), 4),
        "max":   round(float(max(all_sims)), 4),
        "count": len(all_sims),
    }
