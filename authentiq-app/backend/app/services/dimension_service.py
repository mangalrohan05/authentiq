"""
Dimension and aspect ratio similarity service for image authentication.

Extracts image metadata (width, height, aspect ratio) and computes
dimension similarity scores between customer and reference images.
"""

from __future__ import annotations

import logging
import os
from io import BytesIO
from typing import Any, Dict, Optional, Tuple

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Configuration
DIMENSION_SIMILARITY_THRESHOLD = float(
    os.getenv("AUTHENTIQ_DIMENSION_THRESHOLD", "0.90")
)


def extract_image_metadata(image_bytes: bytes) -> Dict[str, Any]:
    """
    Extract width, height, and aspect ratio from image bytes.

    Args:
        image_bytes: Raw image bytes

    Returns:
        Dict with width, height, aspect_ratio, and metadata extraction status
    """
    try:
        img = Image.open(BytesIO(image_bytes))
        width, height = img.size
        aspect_ratio = width / height if height > 0 else 0.0

        return {
            "width": width,
            "height": height,
            "aspect_ratio": aspect_ratio,
            "extraction_success": True,
        }
    except Exception as exc:
        logger.error(f"[Dimension] Failed to extract image metadata: {exc}")
        return {
            "width": 0,
            "height": 0,
            "aspect_ratio": 0.0,
            "extraction_success": False,
            "error": str(exc),
        }


def compute_dimension_similarity(
    reference_metadata: Dict[str, Any],
    query_metadata: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Compute dimension similarity score based on aspect ratio comparison.

    Formula:
        dimension_similarity = 1 - (
            abs(reference_aspect_ratio - query_aspect_ratio)
            / max(reference_aspect_ratio, query_aspect_ratio)
        )

    Args:
        reference_metadata: Metadata from reference image
        query_metadata: Metadata from query/customer image

    Returns:
        Dict with similarity score (0-1), aspect ratios, and threshold comparison
    """
    ref_ar = reference_metadata.get("aspect_ratio", 0.0)
    query_ar = query_metadata.get("aspect_ratio", 0.0)

    if ref_ar <= 0 or query_ar <= 0:
        return {
            "dimension_similarity": 0.0,
            "reference_aspect_ratio": ref_ar,
            "query_aspect_ratio": query_ar,
            "aspect_ratio_diff": 0.0,
            "passes_threshold": False,
            "threshold": DIMENSION_SIMILARITY_THRESHOLD,
            "error": "Invalid aspect ratio values",
        }

    # Compute similarity score
    max_ar = max(ref_ar, query_ar)
    ar_diff = abs(ref_ar - query_ar)
    similarity = 1.0 - (ar_diff / max_ar) if max_ar > 0 else 0.0
    similarity = float(np.clip(similarity, 0.0, 1.0))

    passes_threshold = similarity >= DIMENSION_SIMILARITY_THRESHOLD

    return {
        "dimension_similarity": similarity,
        "reference_aspect_ratio": ref_ar,
        "query_aspect_ratio": query_ar,
        "aspect_ratio_diff": ar_diff,
        "passes_threshold": passes_threshold,
        "threshold": DIMENSION_SIMILARITY_THRESHOLD,
    }


def compute_dimension_similarity_from_bytes(
    reference_bytes: bytes,
    query_bytes: bytes,
) -> Dict[str, Any]:
    """
    Convenience function to compute dimension similarity directly from image bytes.

    Args:
        reference_bytes: Reference image bytes
        query_bytes: Query/customer image bytes

    Returns:
        Dict with similarity score and full metadata
    """
    ref_meta = extract_image_metadata(reference_bytes)
    query_meta = extract_image_metadata(query_bytes)

    if not ref_meta.get("extraction_success") or not query_meta.get("extraction_success"):
        return {
            "dimension_similarity": 0.0,
            "reference_metadata": ref_meta,
            "query_metadata": query_meta,
            "error": "Failed to extract metadata from one or both images",
        }

    similarity_result = compute_dimension_similarity(ref_meta, query_meta)

    return {
        **similarity_result,
        "reference_metadata": ref_meta,
        "query_metadata": query_meta,
    }


def dimension_config_snapshot() -> Dict[str, Any]:
    """Return current dimension similarity configuration."""
    return {
        "dimension_similarity_threshold": DIMENSION_SIMILARITY_THRESHOLD,
    }
