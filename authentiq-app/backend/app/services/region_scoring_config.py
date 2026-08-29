"""
Configurable weights for hybrid global + YOLO regional OpenCLIP verification.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional

# Slot-level blend: global vs YOLO regional (patch/OCR applied after this visual score)
SLOT_VISUAL_BLEND: Dict[str, float] = {
    "global": float(os.getenv("AUTHENTIQ_SLOT_BLEND_GLOBAL", "0.55")),
    "regional": float(os.getenv("AUTHENTIQ_SLOT_BLEND_REGIONAL", "0.45")),
}

# Within regional score: weight per detected region category (normalized at runtime)
REGION_CATEGORY_WEIGHTS: Dict[str, float] = {
    "logo": float(os.getenv("AUTHENTIQ_REGION_WEIGHT_LOGO", "0.25")),
    "label": float(os.getenv("AUTHENTIQ_REGION_WEIGHT_LABEL", "0.20")),
    "hologram": float(os.getenv("AUTHENTIQ_REGION_WEIGHT_HOLOGRAM", "0.15")),
    "qr": float(os.getenv("AUTHENTIQ_REGION_WEIGHT_QR", "0.10")),
    "serial": float(os.getenv("AUTHENTIQ_REGION_WEIGHT_SERIAL", "0.10")),
    "packaging": float(os.getenv("AUTHENTIQ_REGION_WEIGHT_PACKAGING", "0.10")),
    "seal": float(os.getenv("AUTHENTIQ_REGION_WEIGHT_SEAL", "0.05")),
    "text": float(os.getenv("AUTHENTIQ_REGION_WEIGHT_TEXT", "0.05")),
}

# Final product score (optional extended mode — default keeps slot weights)
FINAL_SCORE_WEIGHTS: Dict[str, float] = {
    "global": float(os.getenv("AUTHENTIQ_FINAL_WEIGHT_GLOBAL", "0.40")),
    "logo": float(os.getenv("AUTHENTIQ_FINAL_WEIGHT_LOGO", "0.25")),
    "label": float(os.getenv("AUTHENTIQ_FINAL_WEIGHT_LABEL", "0.20")),
    "hologram": float(os.getenv("AUTHENTIQ_FINAL_WEIGHT_HOLOGRAM", "0.15")),
}

YOLO_ENABLED = os.getenv("AUTHENTIQ_YOLO_ENABLED", "true").lower() in ("1", "true", "yes")
YOLO_MODEL = os.getenv("AUTHENTIQ_YOLO_MODEL", "yolov8n.pt")
YOLO_CONF = float(os.getenv("AUTHENTIQ_YOLO_CONF", "0.25"))
YOLO_MAX_DETECTIONS = int(os.getenv("AUTHENTIQ_YOLO_MAX_DET", "12"))
YOLO_DEBUG_VIZ = os.getenv("AUTHENTIQ_YOLO_DEBUG", "false").lower() in ("1", "true", "yes")

# High global + regional agreement → calibration boost for genuine re-uploads
IDENTITY_BOOST_ENABLED = os.getenv("AUTHENTIQ_IDENTITY_BOOST", "true").lower() in (
    "1",
    "true",
    "yes",
)
IDENTITY_BOOST_MIN_GLOBAL = float(os.getenv("AUTHENTIQ_IDENTITY_BOOST_MIN_GLOBAL", "0.97"))
IDENTITY_BOOST_MIN_REGIONAL = float(os.getenv("AUTHENTIQ_IDENTITY_BOOST_MIN_REGIONAL", "0.95"))
IDENTITY_BOOST_TARGET = float(os.getenv("AUTHENTIQ_IDENTITY_BOOST_TARGET", "0.96"))


def normalized_region_weights(active_categories: Dict[str, float]) -> Dict[str, float]:
    """Renormalize category weights over categories present in this comparison."""
    if not active_categories:
        return {}
    total = sum(
        REGION_CATEGORY_WEIGHTS.get(k, 0.05) * v for k, v in active_categories.items()
    )
    if total <= 0:
        n = len(active_categories)
        return {k: 1.0 / n for k in active_categories}
    out = {}
    for k in active_categories:
        base = REGION_CATEGORY_WEIGHTS.get(k, 0.05)
        out[k] = (base * active_categories[k]) / total
    return out


def scoring_config_snapshot() -> Dict[str, Any]:
    return {
        "yolo_enabled": YOLO_ENABLED,
        "yolo_model": YOLO_MODEL,
        "yolo_conf": YOLO_CONF,
        "slot_visual_blend": dict(SLOT_VISUAL_BLEND),
        "region_category_weights": dict(REGION_CATEGORY_WEIGHTS),
        "final_score_weights": dict(FINAL_SCORE_WEIGHTS),
        "identity_boost": {
            "enabled": IDENTITY_BOOST_ENABLED,
            "min_global": IDENTITY_BOOST_MIN_GLOBAL,
            "min_regional": IDENTITY_BOOST_MIN_REGIONAL,
            "target": IDENTITY_BOOST_TARGET,
        },
    }


def load_custom_weights_json(raw: Optional[str]) -> Optional[Dict[str, float]]:
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return {str(k): float(v) for k, v in data.items()}
    except (json.JSONDecodeError, TypeError, ValueError):
        return None
