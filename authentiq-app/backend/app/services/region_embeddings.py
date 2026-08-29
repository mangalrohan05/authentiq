"""
OpenCLIP embeddings for YOLO/heuristic authenticity regions.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.services.openclip_service import cosine_similarity, embed_pil_images_batch
from app.services.region_detection import detect_authenticity_regions, regions_to_crops
from app.services.region_scoring_config import normalized_region_weights

logger = logging.getLogger(__name__)

EMBEDDING_STRATEGY_VERSION = "v4_align_orb_roi_ssim_ensemble"


def generate_region_embeddings_from_bytes(
    image_bytes: bytes,
    *,
    use_yolo: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Detect regions and embed each crop.
    Returns {regions: [{region_type, bbox, vector, confidence, source}], meta}
    """
    regions, meta = detect_authenticity_regions(image_bytes, use_yolo=use_yolo)
    if not regions:
        return {"regions": [], "meta": meta}

    with_crops = regions_to_crops(image_bytes, regions)
    pil_list = [r["crop"] for r in with_crops]
    vectors = embed_pil_images_batch(pil_list)

    embedded: List[Dict[str, Any]] = []
    for reg, vec in zip(with_crops, vectors):
        if not vec:
            continue
        embedded.append(
            {
                "region_type": reg["region_type"],
                "bbox": reg["bbox"],
                "confidence": reg.get("confidence", 0.0),
                "source": reg.get("source", "unknown"),
                "vector": vec,
            }
        )
    meta["embedded_count"] = len(embedded)
    return {"regions": embedded, "meta": meta}


def max_region_similarity_by_type(
    customer_regions: List[Dict[str, Any]],
    reference_regions: List[Dict[str, Any]],
) -> Dict[str, float]:
    """Best cosine per region_type between customer and reference region sets."""
    scores: Dict[str, float] = {}
    for crt in customer_regions:
        cv = crt.get("vector")
        if not cv:
            continue
        rt = crt.get("region_type", "detail")
        for rrt in reference_regions:
            if rrt.get("region_type") != rt:
                continue
            rv = rrt.get("vector")
            if not rv:
                continue
            sim = cosine_similarity(cv, rv)
            scores[rt] = max(scores.get(rt, 0.0), sim)
    return scores


def aggregate_regional_score(
    per_type_scores: Dict[str, float],
) -> float:
    if not per_type_scores:
        return 0.0
    weights = normalized_region_weights({k: 1.0 for k in per_type_scores})
    total = 0.0
    wsum = 0.0
    for rt, sim in per_type_scores.items():
        w = weights.get(rt, 1.0 / len(per_type_scores))
        total += w * sim
        wsum += w
    return float(total / wsum) if wsum > 0 else 0.0


def compare_region_sets(
    customer_regions: List[Dict[str, Any]],
    reference_regions_list: List[List[Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    Compare customer regions against multiple reference images' region sets.
    """
    best_per_type: Dict[str, float] = {}
    for ref_regions in reference_regions_list:
        per_type = max_region_similarity_by_type(customer_regions, ref_regions)
        for rt, sim in per_type.items():
            best_per_type[rt] = max(best_per_type.get(rt, 0.0), sim)

    regional_score = aggregate_regional_score(best_per_type)
    return {
        "regional_score": regional_score,
        "region_scores": {k: round(v, 4) for k, v in best_per_type.items()},
    }
