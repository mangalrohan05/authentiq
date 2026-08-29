"""
ROI-level SSIM, MSE, and color similarity on homography-aligned image pairs.

Targets small counterfeit differences (logo, hologram, serial) that global CLIP can miss.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.services.pipeline_config import FRAUD_SENSITIVE_REGIONS
from app.services.region_detection import detect_authenticity_regions
from app.services.region_scoring_config import REGION_CATEGORY_WEIGHTS

logger = logging.getLogger(__name__)

_cv2 = None
_skimage_ssim = None


def _cv2_module():
    global _cv2
    if _cv2 is None:
        try:
            import cv2  # type: ignore

            _cv2 = cv2
        except ImportError:
            _cv2 = False
    return _cv2 if _cv2 is not False else None


def _ssim_fn():
    global _skimage_ssim
    if _skimage_ssim is None:
        try:
            from skimage.metrics import structural_similarity as ssim  # type: ignore

            _skimage_ssim = ssim
        except ImportError:
            _skimage_ssim = False
    return _skimage_ssim if _skimage_ssim is not False else None


def _crop_bgr(image: np.ndarray, bbox: List[int]) -> np.ndarray:
    h, w = image.shape[:2]
    x1, y1, x2, y2 = bbox
    x1 = max(0, min(w - 1, x1))
    y1 = max(0, min(h - 1, y1))
    x2 = max(x1 + 1, min(w, x2))
    y2 = max(y1 + 1, min(h, y2))
    return image[y1:y2, x1:x2]


def _resize_gray(crop: np.ndarray, size: int = 128) -> np.ndarray:
    cv2 = _cv2_module()
    if cv2 is None:
        return crop
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop
    return cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)


def _ssim_similarity(a: np.ndarray, b: np.ndarray) -> float:
    ssim = _ssim_fn()
    if ssim is None:
        # Fallback: normalized correlation on flattened pixels
        fa = a.astype(np.float32).ravel()
        fb = b.astype(np.float32).ravel()
        if fa.size == 0:
            return 0.0
        fa -= fa.mean()
        fb -= fb.mean()
        denom = (np.linalg.norm(fa) * np.linalg.norm(fb)) + 1e-8
        return float(np.clip(np.dot(fa, fb) / denom, 0.0, 1.0))
    try:
        score = float(ssim(a, b, data_range=255))
        return float(np.clip(score, 0.0, 1.0))
    except Exception as exc:
        logger.debug("[ROI] SSIM failed: %s", exc)
        return 0.0


def _mse_similarity(a: np.ndarray, b: np.ndarray) -> float:
    if a.shape != b.shape:
        return 0.0
    mse = float(np.mean((a.astype(np.float32) - b.astype(np.float32)) ** 2))
    # Map MSE on 0–255 scale to 0–1 similarity
    return float(1.0 / (1.0 + mse / 400.0))


def _color_similarity(a: np.ndarray, b: np.ndarray) -> float:
    cv2 = _cv2_module()
    if cv2 is None:
        return 0.5
    try:
        ha = cv2.cvtColor(a, cv2.COLOR_BGR2HSV)
        hb = cv2.cvtColor(b, cv2.COLOR_BGR2HSV)
        hist_a = cv2.calcHist([ha], [0, 1, 2], None, [16, 8, 8], [0, 180, 0, 256, 0, 256])
        hist_b = cv2.calcHist([hb], [0, 1, 2], None, [16, 8, 8], [0, 180, 0, 256, 0, 256])
        cv2.normalize(hist_a, hist_a)
        cv2.normalize(hist_b, hist_b)
        corr = float(cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_CORREL))
        return float(np.clip((corr + 1.0) / 2.0, 0.0, 1.0))
    except Exception:
        return 0.5


def _region_weight(region_type: str) -> float:
    return float(REGION_CATEGORY_WEIGHTS.get(region_type, 0.08))


def compare_aligned_roi_metrics(
    reference_bytes: bytes,
    aligned_customer_bytes: bytes,
) -> Dict[str, Any]:
    """
    Compare fraud-sensitive ROIs on aligned customer vs reference (same geometry).
    """
    cv2 = _cv2_module()
    empty: Dict[str, Any] = {
        "align_roi_score": None,
        "region_pixel_scores": {},
        "mean_ssim": None,
        "mean_mse_sim": None,
        "mean_color_sim": None,
        "regions_compared": 0,
    }
    if cv2 is None:
        empty["message"] = "opencv_not_installed"
        return empty

    ref_arr = np.frombuffer(reference_bytes, dtype=np.uint8)
    cust_arr = np.frombuffer(aligned_customer_bytes, dtype=np.uint8)
    ref = cv2.imdecode(ref_arr, cv2.IMREAD_COLOR)
    cust = cv2.imdecode(cust_arr, cv2.IMREAD_COLOR)
    if ref is None or cust is None:
        empty["message"] = "decode_failed"
        return empty

    if ref.shape[:2] != cust.shape[:2]:
        cust = cv2.resize(cust, (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_AREA)

    regions, _meta = detect_authenticity_regions(reference_bytes, use_yolo=True)
    sensitive = {r for r in FRAUD_SENSITIVE_REGIONS}
    region_scores: Dict[str, Dict[str, float]] = {}
    weighted_sum = 0.0
    weight_total = 0.0

    for reg in regions:
        rtype = reg.get("region_type", "")
        if rtype not in sensitive:
            continue
        bbox = reg.get("bbox")
        if not bbox or len(bbox) != 4:
            continue

        ref_crop = _crop_bgr(ref, bbox)
        cust_crop = _crop_bgr(cust, bbox)
        if ref_crop.size == 0 or cust_crop.size == 0:
            continue

        ref_g = _resize_gray(ref_crop)
        cust_g = _resize_gray(cust_crop)
        ssim_s = _ssim_similarity(ref_g, cust_g)
        mse_s = _mse_similarity(ref_g, cust_g)
        color_s = _color_similarity(ref_crop, cust_crop)
        combined = float(0.50 * ssim_s + 0.30 * mse_s + 0.20 * color_s)

        region_scores[rtype] = {
            "ssim": round(ssim_s, 4),
            "mse_sim": round(mse_s, 4),
            "color_sim": round(color_s, 4),
            "combined": round(combined, 4),
        }
        w = _region_weight(rtype)
        weighted_sum += combined * w
        weight_total += w

    if not region_scores:
        empty["message"] = "no_regions"
        return empty

    align_roi = float(weighted_sum / weight_total) if weight_total > 0 else float(
        np.mean([v["combined"] for v in region_scores.values()])
    )
    ssims = [v["ssim"] for v in region_scores.values()]
    mses = [v["mse_sim"] for v in region_scores.values()]
    colors = [v["color_sim"] for v in region_scores.values()]

    empty.update(
        {
            "align_roi_score": round(align_roi, 4),
            "region_pixel_scores": region_scores,
            "mean_ssim": round(float(np.mean(ssims)), 4),
            "mean_mse_sim": round(float(np.mean(mses)), 4),
            "mean_color_sim": round(float(np.mean(colors)), 4),
            "regions_compared": len(region_scores),
            "message": "ok",
        }
    )
    return empty


def apply_roi_fraud_penalty(
    ensemble_score: float,
    global_sim: float,
    align_roi_sim: Optional[float],
    *,
    global_high: float,
    roi_low: float,
    max_penalty: float,
    alignment_reliable: bool = True,
) -> Tuple[float, bool, float]:
    """
    If CLIP thinks images match but aligned ROIs disagree, apply a penalty (small-diff fraud).
    Skipped when homography was unreliable (bad warp would fake a counterfeit signal).
    """
    if not alignment_reliable or align_roi_sim is None:
        return ensemble_score, False, 0.0
    if global_sim < global_high or align_roi_sim >= roi_low:
        return ensemble_score, False, 0.0
    gap = roi_low - align_roi_sim
    penalty = min(max_penalty, gap * 0.45)
    adjusted = float(max(0.0, ensemble_score - penalty))
    return adjusted, True, round(penalty, 4)
