"""Model compatibility checks for stored reference embeddings."""

from __future__ import annotations

import logging
from typing import Dict, Optional, Set

logger = logging.getLogger(__name__)

# OpenCLIP ViT-B-32 produces 512-dimensional vectors
EXPECTED_EMBEDDING_DIM = 512

# OpenCLIP vectors stay valid across pipeline upgrades (v4 adds ORB/ROI, same ViT weights).
COMPATIBLE_EMBEDDING_STRATEGIES: Set[Optional[str]] = {
    None,
    "",
    "v2_global_patch_ocr",
    "v3_global_yolo_region_patch_ocr",
    "v4_align_orb_roi_ssim_ensemble",
}


def normalize_view_type(view_type: Optional[str]) -> str:
    if not view_type:
        return ""
    return str(view_type).strip().lower().replace("-", "_")


def embedding_matches_model(ref_image: dict, model_sig: Dict[str, str]) -> bool:
    """
    True if stored embedding can be compared with the active OpenCLIP model.

    Only OpenCLIP model + pretrained tag must match. Strategy version is metadata
    and must not invalidate existing product reference embeddings after pipeline upgrades.
    """
    vec = ref_image.get("embedding_vector")
    if not vec or not isinstance(vec, (list, tuple)):
        return False
    if len(vec) != EXPECTED_EMBEDDING_DIM:
        return False

    stored_pretrained = ref_image.get("embedding_pretrained")
    stored_model = ref_image.get("embedding_model")
    if stored_pretrained and stored_pretrained != model_sig.get("pretrained"):
        return False
    if stored_model and stored_model != model_sig.get("model"):
        return False

    stored_version = ref_image.get("embedding_strategy_version")
    if stored_version and stored_version not in COMPATIBLE_EMBEDDING_STRATEGIES:
        logger.info(
            "[Verify] Unknown embedding_strategy_version=%s; allowing compare (model/pretrained ok)",
            stored_version,
        )
    return True
