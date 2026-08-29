"""
Perceptual hashing (pHash) service for near-duplicate customer submission detection.

Uses the imagehash library (pure Python, wraps Pillow) to generate 64-bit
perceptual hashes and compare them with Hamming distance.

Threat model addressed:
    - Fraudulent repeat submissions: same counterfeit photo uploaded for
      multiple QR codes or multiple scans of the same product.
    - pHash is robust to minor resizes and JPEG re-compression, making it
      effective even when images are slightly modified between uploads.

NOT used for:
    - Exact-duplicate detection (use SHA-256 content hash for that).
    - Similarity scoring (use OpenCLIP embeddings for that).

Threshold guidance:
    Hamming distance 0   = pixel-identical (after resize to 8×8)
    Hamming distance ≤ 8 = near-identical (very likely same photo)
    Hamming distance ≤ 10= suspicious (plan default)
    Hamming distance ≤ 16= similar but may be different photos
    Hamming distance > 20= different images

Configurable via:
    AUTHENTIQ_PHASH_THRESHOLD  (int, default 10)
"""

from __future__ import annotations

import logging
import os
from io import BytesIO
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Default Hamming distance threshold for near-duplicate flagging
PHASH_DUPLICATE_THRESHOLD: int = int(
    os.getenv("AUTHENTIQ_PHASH_THRESHOLD", "8")
)


def generate_phash(image_bytes: bytes) -> Optional[str]:
    """
    Generate a 64-bit perceptual hash (pHash) from raw image bytes.

    pHash is computed by:
        1. Resize image to 32×32 (DCT-based hash uses 8×8 frequency block)
        2. Apply DCT to capture frequency content
        3. Threshold against median → 64-bit binary string

    Args:
        image_bytes: Raw bytes of any Pillow-supported image format.

    Returns:
        Hex string representation of the 64-bit pHash, or None on failure.
    """
    try:
        import imagehash  # type: ignore
        from PIL import Image

        img = Image.open(BytesIO(image_bytes)).convert("RGB")
        phash = imagehash.phash(img)
        return str(phash)
    except ImportError:
        logger.warning(
            "[pHash] imagehash library not installed. "
            "Run: pip install imagehash>=4.3.1"
        )
        return None
    except Exception as exc:
        logger.warning("[pHash] Failed to generate pHash: %s", exc)
        return None


def hamming_distance(hash_a: str, hash_b: str) -> int:
    """
    Compute the Hamming distance between two pHash hex strings.

    Hamming distance = number of bit positions that differ.
    Lower = more similar.

    Args:
        hash_a: pHash hex string (output of generate_phash).
        hash_b: pHash hex string to compare against.

    Returns:
        Integer bit-difference (0 = identical, 64 = completely different).
        Returns 64 (max distance) on parse error.
    """
    try:
        import imagehash  # type: ignore

        h_a = imagehash.hex_to_hash(hash_a)
        h_b = imagehash.hex_to_hash(hash_b)
        return int(h_a - h_b)
    except Exception as exc:
        logger.warning("[pHash] Hamming distance computation failed: %s", exc)
        return 64  # Return max distance on error — fail safe (don't false-flag)


def check_near_duplicate(
    new_hash: str,
    stored_hashes: List[str],
    *,
    threshold: int = PHASH_DUPLICATE_THRESHOLD,
) -> Dict[str, Any]:
    """
    Check whether a new image pHash is suspiciously similar to any stored hash.

    Scans stored_hashes linearly — suitable for O(hundreds) comparisons.
    For very large hash stores, consider a VP-tree or LSH index.

    Args:
        new_hash:      pHash of the incoming customer image.
        stored_hashes: Previously recorded pHashes for this product/session scope.
        threshold:     Hamming distance at or below which images are flagged.

    Returns:
        {
            "is_duplicate": bool,       — True if any stored hash is within threshold
            "min_distance": int,        — Smallest Hamming distance found
            "closest_match": str|None,  — The stored hash with minimum distance
            "flagged": bool,            — Alias for is_duplicate (for response clarity)
            "threshold_used": int,
            "hashes_checked": int,
        }
    """
    if not stored_hashes:
        return {
            "is_duplicate": False,
            "min_distance": 64,
            "closest_match": None,
            "flagged": False,
            "threshold_used": threshold,
            "hashes_checked": 0,
        }

    min_dist = 64
    closest: Optional[str] = None

    for stored in stored_hashes:
        if not stored:
            continue
        d = hamming_distance(new_hash, stored)
        if d < min_dist:
            min_dist = d
            closest = stored

    is_dup = min_dist <= threshold
    return {
        "is_duplicate": is_dup,
        "min_distance": min_dist,
        "closest_match": closest,
        "flagged": is_dup,
        "threshold_used": threshold,
        "hashes_checked": len(stored_hashes),
    }


def fetch_stored_phashes(
    verification_sessions_collection,
    product_id: str,
    exclude_qr_id: Optional[str] = None,
    limit: int = 500,
) -> List[str]:
    """
    Retrieve pHash values from recent verification sessions for a product.

    Only fetches sessions that have phash_values stored (i.e., sessions
    created after this feature was deployed).

    Args:
        verification_sessions_collection: PyMongo collection handle.
        product_id: Product to scope the lookup.
        exclude_qr_id: Optional QR ID to exclude (prevents self-duplicates).
        limit: Maximum number of recent sessions to scan (performance guard).

    Returns:
        Flat list of pHash strings across all images in matching sessions.
    """
    if verification_sessions_collection is None:
        return []

    hashes: List[str] = []
    try:
        query = {
            "product_id": product_id,
            "phash_values": {"$exists": True, "$ne": None},
        }
        if exclude_qr_id:
            query["qr_id"] = {"$ne": exclude_qr_id}

        cursor = (
            verification_sessions_collection
            .find(
                query,
                {"phash_values": 1, "_id": 0},
            )
            .sort("created_at", -1)
            .limit(limit)
        )
        for doc in cursor:
            phash_values = doc.get("phash_values") or {}
            for h in phash_values.values():
                if h:
                    hashes.append(str(h))
    except Exception as exc:
        logger.warning("[pHash] Failed to fetch stored hashes: %s", exc)
    return hashes
