"""
Advanced feature matching service with SuperPoint+LightGlue (preferred) and ORB+BFMatcher (fallback).

Provides local feature matching, keypoint detection, and match ratio calculation
for image authentication pipeline.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# Configuration
FEATURE_MATCHING_METHOD = os.getenv("AUTHENTIQ_FEATURE_METHOD", "auto")  # "auto", "superpoint", "orb"
FEATURE_MATCH_THRESHOLD = float(os.getenv("AUTHENTIQ_FEATURE_MATCH_THRESHOLD", "0.75"))
RANSAC_THRESHOLD = float(os.getenv("AUTHENTIQ_RANSAC_THRESHOLD", "0.70"))

_cv2 = None
_superpoint_available = False
_lightglue_available = False


def _check_dependencies():
    """Check which feature matching libraries are available."""
    global _cv2, _superpoint_available, _lightglue_available
    
    if _cv2 is None:
        try:
            import cv2  # type: ignore
            _cv2 = cv2
        except ImportError:
            _cv2 = False
            logger.warning("[FeatureMatching] OpenCV not available")
    
    # Check for SuperPoint and LightGlue
    try:
        import torch  # type: ignore
        from kornia.feature import SuperPoint  # type: ignore
        _superpoint_available = True
    except ImportError:
        _superpoint_available = False
        logger.debug("[FeatureMatching] SuperPoint not available")
    
    try:
        import lightglue  # type: ignore
        _lightglue_available = True
    except ImportError:
        _lightglue_available = False
        logger.debug("[FeatureMatching] LightGlue not available")


def _bytes_to_bgr(image_bytes: bytes) -> Optional[np.ndarray]:
    """Convert image bytes to BGR numpy array."""
    cv2 = _cv2_module()
    if cv2 is None:
        return None
    try:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception as exc:
        logger.warning("[FeatureMatching] Decode failed: %s", exc)
        return None


def _cv2_module():
    """Lazy load OpenCV."""
    global _cv2
    if _cv2 is None:
        _check_dependencies()
    return _cv2 if _cv2 is not False else None


def match_features_orb(
    img1: np.ndarray,
    img2: np.ndarray,
) -> Dict[str, Any]:
    """
    ORB feature matching with BFMatcher (fallback method).
    
    Args:
        img1: First image (BGR numpy array)
        img2: Second image (BGR numpy array)
    
    Returns:
        Dict with keypoints, matches, match ratio, and RANSAC score
    """
    cv2 = _cv2_module()
    if cv2 is None:
        return {
            "method": "orb",
            "success": False,
            "error": "opencv_not_available",
        }
    
    try:
        # Convert to grayscale
        gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
        
        # Detect ORB keypoints
        orb = cv2.ORB_create(nfeatures=2500)
        kp1, des1 = orb.detectAndCompute(gray1, None)
        kp2, des2 = orb.detectAndCompute(gray2, None)
        
        if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
            return {
                "method": "orb",
                "success": False,
                "error": "insufficient_keypoints",
                "keypoints1": len(kp1) if kp1 else 0,
                "keypoints2": len(kp2) if kp2 else 0,
            }
        
        # Match features
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        knn = bf.knnMatch(des1, des2, k=2)
        
        # Apply Lowe's ratio test
        good_matches = []
        for pair in knn:
            if len(pair) == 2:
                m, n = pair
                if m.distance < FEATURE_MATCH_THRESHOLD * n.distance:
                    good_matches.append(m)
        
        match_ratio = len(good_matches) / min(len(kp1), len(kp2)) if kp1 and kp2 else 0.0
        
        # RANSAC verification
        src_pts = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        
        H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
        inliers = int(mask.ravel().sum()) if mask is not None else 0
        outliers = len(good_matches) - inliers
        ransac_score = inliers / len(good_matches) if good_matches else 0.0
        
        return {
            "method": "orb",
            "success": True,
            "keypoints1": len(kp1),
            "keypoints2": len(kp2),
            "good_matches": len(good_matches),
            "match_ratio": match_ratio,
            "inliers": inliers,
            "outliers": outliers,
            "ransac_score": ransac_score,
            "passes_ransac_threshold": ransac_score >= RANSAC_THRESHOLD,
            "homography_available": H is not None,
            "H": H,
        }
        
    except Exception as exc:
        logger.error(f"[FeatureMatching] ORB matching failed: {exc}")
        return {
            "method": "orb",
            "success": False,
            "error": str(exc),
        }


def match_features_superpoint(
    img1: np.ndarray,
    img2: np.ndarray,
) -> Dict[str, Any]:
    """
    SuperPoint + LightGlue feature matching (preferred method).
    
    Args:
        img1: First image (BGR numpy array)
        img2: Second image (BGR numpy array)
    
    Returns:
        Dict with keypoints, matches, match ratio, and RANSAC score
    """
    try:
        import torch  # type: ignore
        from kornia.feature import SuperPoint  # type: ignore
        from kornia.feature.lightglue import LightGlue  # type: ignore
        
        # Convert BGR to RGB and normalize
        img1_rgb = cv2.cvtColor(img1, cv2.COLOR_BGR2RGB) / 255.0
        img2_rgb = cv2.cvtColor(img2, cv2.COLOR_BGR2RGB) / 255.0
        
        # Convert to tensor
        img1_tensor = torch.from_numpy(img1_rgb).permute(2, 0, 1).unsqueeze(0).float()
        img2_tensor = torch.from_numpy(img2_rgb).permute(2, 0, 1).unsqueeze(0).float()
        
        # Initialize SuperPoint
        superpoint = SuperPoint(max_num_keypoints=2500).eval()
        
        # Extract features
        feats1 = superpoint(img1_tensor)
        feats2 = superpoint(img2_tensor)
        
        # Initialize LightGlue matcher
        matcher = LightGlue("superpoint").eval()
        
        # Match features
        with torch.no_grad():
            matches = matcher({"image0": feats1, "image1": feats2})
        
        # Extract match statistics
        num_matches = len(matches["matches0"])
        keypoints1 = len(feats1["keypoints"])
        keypoints2 = len(feats2["keypoints"])
        
        match_ratio = num_matches / min(keypoints1, keypoints2) if keypoints1 and keypoints2 else 0.0
        
        # RANSAC verification using OpenCV
        if num_matches >= 4:
            src_pts = matches["keypoints0"][matches["matches0"]].cpu().numpy()
            dst_pts = matches["keypoints1"][matches["matches0"]].cpu().numpy()
            
            cv2 = _cv2_module()
            if cv2 is not None:
                H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
                inliers = int(mask.ravel().sum()) if mask is not None else 0
                outliers = num_matches - inliers
                ransac_score = inliers / num_matches if num_matches else 0.0
            else:
                inliers = num_matches  # Fallback if no OpenCV
                outliers = 0
                ransac_score = 1.0
        else:
            inliers = 0
            outliers = 0
            ransac_score = 0.0
        
        return {
            "method": "superpoint_lightglue",
            "success": True,
            "keypoints1": keypoints1,
            "keypoints2": keypoints2,
            "good_matches": num_matches,
            "match_ratio": match_ratio,
            "inliers": inliers,
            "outliers": outliers,
            "ransac_score": ransac_score,
            "passes_ransac_threshold": ransac_score >= RANSAC_THRESHOLD,
            "homography_available": True,
            "H": H if 'H' in locals() else None,
        }
        
    except Exception as exc:
        logger.error(f"[FeatureMatching] SuperPoint matching failed: {exc}")
        return {
            "method": "superpoint_lightglue",
            "success": False,
            "error": str(exc),
        }


def match_features(
    image1_bytes: bytes,
    image2_bytes: bytes,
    method: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Main entry point for feature matching with automatic method selection.
    
    Priority order:
    1. SuperPoint + LightGlue (if available and method="auto" or "superpoint")
    2. ORB + BFMatcher (fallback)
    
    Args:
        image1_bytes: First image bytes
        image2_bytes: Second image bytes
        method: "auto", "superpoint", or "orb". If None, uses AUTHENTIQ_FEATURE_METHOD env var
    
    Returns:
        Dict with matching results including match_ratio and ransac_score
    """
    _check_dependencies()
    
    if method is None:
        method = FEATURE_MATCHING_METHOD
    
    # Decode images
    img1 = _bytes_to_bgr(image1_bytes)
    img2 = _bytes_to_bgr(image2_bytes)
    
    if img1 is None or img2 is None:
        return {
            "success": False,
            "error": "image_decode_failed",
            "method_used": "none",
        }
    
    # Method selection
    if method == "superpoint" or (method == "auto" and _superpoint_available and _lightglue_available):
        result = match_features_superpoint(img1, img2)
        if not result.get("success") and method == "auto":
            logger.info("[FeatureMatching] SuperPoint failed, falling back to ORB")
            result = match_features_orb(img1, img2)
            result["fallback_used"] = True
    else:
        result = match_features_orb(img1, img2)
        if method == "auto" and not _superpoint_available:
            result["fallback_reason"] = "superpoint_not_available"
    
    result["method_requested"] = method
    return result


def feature_config_snapshot() -> Dict[str, Any]:
    """Return current feature matching configuration."""
    _check_dependencies()
    return {
        "feature_matching_method": FEATURE_MATCHING_METHOD,
        "feature_match_threshold": FEATURE_MATCH_THRESHOLD,
        "ransac_threshold": RANSAC_THRESHOLD,
        "superpoint_available": _superpoint_available,
        "lightglue_available": _lightglue_available,
        "opencv_available": _cv2 is not False,
    }
