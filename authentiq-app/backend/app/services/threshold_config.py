"""
Configurable authenticity thresholds: product → brand (vendor) → global defaults.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from app.services.openclip_service import AUTHENTICITY_THRESHOLDS

DEFAULT_THRESHOLDS: Dict[str, float] = dict(AUTHENTICITY_THRESHOLDS)


def _coerce_thresholds(raw: Optional[Dict[str, Any]]) -> Optional[Dict[str, float]]:
    if not raw or not isinstance(raw, dict):
        return None
    mapping = {
        "highly_authentic": raw.get("highly_authentic", raw.get("authentic_threshold")),
        "likely_authentic": raw.get("likely_authentic", raw.get("likely_threshold")),
        "needs_review": raw.get("needs_review", raw.get("review_threshold")),
        "suspicious": raw.get("suspicious", 0.0),
    }
    try:
        return {
            "highly_authentic": float(mapping["highly_authentic"]),
            "likely_authentic": float(mapping["likely_authentic"]),
            "needs_review": float(mapping["needs_review"]),
            "suspicious": float(mapping.get("suspicious") or 0.0),
        }
    except (TypeError, ValueError):
        return None


def resolve_verification_thresholds(
    product: Optional[dict] = None,
    vendor: Optional[dict] = None,
) -> Dict[str, float]:
    """
    Priority: product.verification_thresholds → vendor.verification_thresholds
    → env JSON (not implemented) → AUTHENTICITY_THRESHOLDS.
    """
    for source in (
        (product or {}).get("verification_thresholds"),
        (vendor or {}).get("verification_thresholds"),
    ):
        parsed = _coerce_thresholds(source)
        if parsed:
            return {**DEFAULT_THRESHOLDS, **parsed}

    env_authentic = os.getenv("AUTHENTIQ_THRESHOLD_AUTHENTIC")
    env_likely = os.getenv("AUTHENTIQ_THRESHOLD_LIKELY")
    env_review = os.getenv("AUTHENTIQ_THRESHOLD_REVIEW")
    if env_authentic and env_likely and env_review:
        try:
            return {
                "highly_authentic": float(env_authentic),
                "likely_authentic": float(env_likely),
                "needs_review": float(env_review),
                "suspicious": 0.0,
            }
        except ValueError:
            pass

    return dict(DEFAULT_THRESHOLDS)
