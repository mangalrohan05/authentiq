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


def batch_cosine_matrix(vecs_a: List[List[float]], vecs_b: List[List[float]]) -> Any:
    """Compute all pairwise cosine similarities in one matrix multiply."""
    import numpy as np
    A = np.array(vecs_a, dtype=np.float32)
    B = np.array(vecs_b, dtype=np.float32)
    # Normalize rows (add epsilon to avoid division by zero)
    A = A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-8)
    B = B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-8)
    return A @ B.T  # Shape: (len_a, len_b)


def structured_patch_similarity(
    customer_patches: List[Dict[str, Any]],
    reference_patches: List[Dict[str, Any]],
    cosine_fn,
) -> float:
    """Match patches by region name, return weighted average."""
    if not customer_patches or not reference_patches:
        return 0.0
    
    ref_by_region = {}
    for rp in reference_patches:
        region = rp.get("region", "unknown")
        if rp.get("vector"):
            ref_by_region.setdefault(region, []).append(rp["vector"])
    
    matched_scores = []
    for cp in customer_patches:
        region = cp.get("region", "unknown")
        cv = cp.get("vector")
        if not cv or region not in ref_by_region:
            continue
        # Best match within same region
        best = max(cosine_fn(cv, rv) for rv in ref_by_region[region])
        matched_scores.append(best)
    
    if not matched_scores:
        return 0.0
    return float(sum(matched_scores) / len(matched_scores))


def compute_patch_stats(
    customer_patches: List[Dict[str, Any]],
    reference_patches: List[Dict[str, Any]],
    cosine_fn,
) -> Dict[str, Any]:
    """
    Compute aggregate patch-level similarity statistics using batched matrix multiplication.
    """
    if not customer_patches or not reference_patches:
        return {"avg": 0.0, "min": 0.0, "max": 0.0, "count": 0}

    c_vecs = [p["vector"] for p in customer_patches if p.get("vector")]
    r_vecs = [p["vector"] for p in reference_patches if p.get("vector")]

    if not c_vecs or not r_vecs:
        return {"avg": 0.0, "min": 0.0, "max": 0.0, "count": 0}

    # Use batched cosine matrix computation
    sim_matrix = batch_cosine_matrix(c_vecs, r_vecs)
    
    # Flatten to list of floats for stats
    all_sims = sim_matrix.flatten().tolist()
    
    if not all_sims:
        return {"avg": 0.0, "min": 0.0, "max": 0.0, "count": 0}

    return {
        "avg":   round(float(sum(all_sims) / len(all_sims)), 4),
        "min":   round(float(min(all_sims)), 4),
        "max":   round(float(max(all_sims)), 4),
        "count": len(all_sims),
    }
