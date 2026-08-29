"""
Configuration for alignment + ROI pixel verification (v4 pipeline).
"""

from __future__ import annotations

import os
from typing import Any, Dict, Tuple

ALIGNMENT_ENABLED = os.getenv("AUTHENTIQ_ALIGNMENT_ENABLED", "true").lower() in (
    "1",
    "true",
    "yes",
)

ORB_MAX_FEATURES = int(os.getenv("AUTHENTIQ_ORB_FEATURES", "2500"))
ORB_MATCH_RATIO = float(os.getenv("AUTHENTIQ_ORB_MATCH_RATIO", "0.75"))
ALIGN_MIN_GOOD_MATCHES = int(os.getenv("AUTHENTIQ_ALIGN_MIN_MATCHES", "12"))
ALIGN_MIN_INLIERS = int(os.getenv("AUTHENTIQ_ALIGN_MIN_INLIERS", "10"))
ALIGN_MAX_REPROJ_ERR = float(os.getenv("AUTHENTIQ_ALIGN_MAX_REPROJ_ERR", "5.0"))

# Regions where small print/logo differences matter for fraud
FRAUD_SENSITIVE_REGIONS: Tuple[str, ...] = (
    "logo",
    "hologram",
    "serial",
    "label",
    "qr",
    "seal",
)

# High semantic match + low aligned ROI → penalize (counterfeit / wrong variant)
FRAUD_GLOBAL_HIGH = float(os.getenv("AUTHENTIQ_FRAUD_GLOBAL_HIGH", "0.85"))
FRAUD_ROI_LOW = float(os.getenv("AUTHENTIQ_FRAUD_ROI_LOW", "0.60"))
FRAUD_PENALTY_MAX = float(os.getenv("AUTHENTIQ_FRAUD_PENALTY_MAX", "0.25"))

# Minimum aligned ROI score to include in ensemble (below = unreliable warp)
ALIGN_ROI_MIN_FOR_ENSEMBLE = float(os.getenv("AUTHENTIQ_ALIGN_ROI_MIN_ENSEMBLE", "0.35"))

# When global CLIP is strong, never let ensemble fall below this fraction of global
GLOBAL_SIM_SCORE_FLOOR = float(os.getenv("AUTHENTIQ_GLOBAL_SCORE_FLOOR", "0.88"))


def pipeline_config_snapshot() -> Dict[str, Any]:
    return {
        "alignment_enabled": ALIGNMENT_ENABLED,
        "orb_max_features": ORB_MAX_FEATURES,
        "align_min_matches": ALIGN_MIN_GOOD_MATCHES,
        "align_min_inliers": ALIGN_MIN_INLIERS,
        "fraud_sensitive_regions": list(FRAUD_SENSITIVE_REGIONS),
        "fraud_global_high": FRAUD_GLOBAL_HIGH,
        "fraud_roi_low": FRAUD_ROI_LOW,
    }
