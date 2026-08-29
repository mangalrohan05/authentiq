"""
ORB feature matching + RANSAC homography to warp customer photos onto reference geometry.

Handles different capture angles and scales before ROI pixel metrics (SSIM/MSE/color).
"""

from __future__ import annotations

import logging
from io import BytesIO
from typing import Any, Dict, Optional, Tuple

import numpy as np
from PIL import Image

from app.services.pipeline_config import (
    ALIGN_MAX_REPROJ_ERR,
    ALIGN_MIN_GOOD_MATCHES,
    ALIGN_MIN_INLIERS,
    ALIGNMENT_ENABLED,
    ORB_MATCH_RATIO,
    ORB_MAX_FEATURES,
)

logger = logging.getLogger(__name__)

_cv2 = None


def _cv2_module():
    global _cv2
    if _cv2 is None:
        try:
            import cv2  # type: ignore

            _cv2 = cv2
        except ImportError:
            _cv2 = False
    return _cv2 if _cv2 is not False else None


def _bytes_to_bgr(image_bytes: bytes) -> Optional[np.ndarray]:
    cv2 = _cv2_module()
    if cv2 is None:
        return None
    try:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception as exc:
        logger.warning("[Align] decode failed: %s", exc)
        return None


def _bgr_to_jpeg_bytes(bgr: np.ndarray, quality: int = 92) -> bytes:
    cv2 = _cv2_module()
    ok, buf = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        raise ValueError("JPEG encode failed")
    return buf.tobytes()


def align_customer_to_reference(
    customer_bytes: bytes,
    reference_bytes: bytes,
    *,
    H: Optional[np.ndarray] = None,
    inlier_count: int = 0,
    good_matches: int = 0,
) -> Dict[str, Any]:
    """
    Warp customer image onto the reference canvas using ORB + homography (RANSAC).

    Returns:
        success, aligned_bytes, inlier_count, good_matches, message, homography_available
    """
    base: Dict[str, Any] = {
        "success": False,
        "aligned_bytes": None,
        "inlier_count": 0,
        "good_matches": 0,
        "message": "alignment_disabled",
        "homography_available": False,
    }
    if not ALIGNMENT_ENABLED:
        return base

    cv2 = _cv2_module()
    if cv2 is None:
        base["message"] = "opencv_not_installed"
        return base

    cust = _bytes_to_bgr(customer_bytes)
    ref = _bytes_to_bgr(reference_bytes)
    if cust is None or ref is None:
        base["message"] = "decode_failed"
        return base

    ref_h, ref_w = ref.shape[:2]
    
    if H is not None:
        # Optimization: use precomputed homography matrix from feature matching
        base["good_matches"] = good_matches
        base["inlier_count"] = inlier_count
    else:
        cust_gray = cv2.cvtColor(cust, cv2.COLOR_BGR2GRAY)
        ref_gray = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)

        orb = cv2.ORB_create(nfeatures=ORB_MAX_FEATURES)
        kp1, des1 = orb.detectAndCompute(cust_gray, None)
        kp2, des2 = orb.detectAndCompute(ref_gray, None)

        if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
            base["message"] = "insufficient_keypoints"
            return base

        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        try:
            knn = bf.knnMatch(des1, des2, k=2)
        except cv2.error as exc:
            base["message"] = f"match_failed:{exc}"
            return base

        good = []
        for pair in knn:
            if len(pair) != 2:
                continue
            m, n = pair
            if m.distance < ORB_MATCH_RATIO * n.distance:
                good.append(m)

        base["good_matches"] = len(good)
        if len(good) < ALIGN_MIN_GOOD_MATCHES:
            base["message"] = "insufficient_matches"
            return base

        src_pts = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)

        H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, ALIGN_MAX_REPROJ_ERR)
        if H is None:
            base["message"] = "homography_failed"
            return base

        inliers = int(mask.ravel().sum()) if mask is not None else 0
        base["inlier_count"] = inliers
        if inliers < ALIGN_MIN_INLIERS:
            base["message"] = "insufficient_inliers"
            return base

    aligned = cv2.warpPerspective(cust, H, (ref_w, ref_h), flags=cv2.INTER_LINEAR)
    try:
        aligned_bytes = _bgr_to_jpeg_bytes(aligned)
    except ValueError:
        base["message"] = "encode_failed"
        return base

    base.update(
        {
            "success": True,
            "aligned_bytes": aligned_bytes,
            "message": "ok",
            "homography_available": True,
        }
    )
    return base


def alignment_meta_for_api(meta: Dict[str, Any]) -> Dict[str, Any]:
    """Strip binary payloads before JSON API responses."""
    if not meta:
        return {}
    return {k: v for k, v in meta.items() if k != "aligned_bytes"}


def pil_from_bytes(image_bytes: bytes) -> Optional[Image.Image]:
    try:
        return Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return None
