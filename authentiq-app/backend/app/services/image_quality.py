"""
Image quality checks for vendor reference uploads and customer verification uploads.

Vendor checks (validate_reference_image_bytes):
    - Higher thresholds, studio-quality expectations.

Customer checks (validate_customer_image_bytes):
    - Lower thresholds tuned for phone-camera conditions.
    - Returns quality_flags[] and user-facing reshoot_instructions[].
    - Non-blocking by default — callers decide whether to hard-reject or soft-warn.
"""

from __future__ import annotations

import hashlib
import os
from io import BytesIO
from typing import Any, Dict, List, Optional

import numpy as np
import logging
from PIL import Image, ImageFilter

logger = logging.getLogger(__name__)

# ── Vendor reference thresholds (strict) ──────────────────────────────────────
MIN_REFERENCE_WIDTH = 400
MIN_REFERENCE_HEIGHT = 400
MIN_BLUR_VARIANCE = 80.0
MIN_BRIGHTNESS = 35.0
MAX_BRIGHTNESS = 220.0

# ── Customer upload thresholds (lenient — phone cameras) ──────────────────────
# `CUSTOMER_MIN_*` is now ADVISORY (warn + guide a reshoot); only images below the
# HARD floor are actually rejected. See the "advisory gate" note on the critical
# flags below (audit item 1.12).
CUSTOMER_MIN_WIDTH = 300
CUSTOMER_MIN_HEIGHT = 300

# Configurable quality thresholds (admin-tunable via environment variables)
QUALITY_MIN_BLUR = float(os.getenv("AUTHENTIQ_QUALITY_MIN_BLUR", "25.0"))
QUALITY_MIN_BRIGHTNESS = float(os.getenv("AUTHENTIQ_QUALITY_MIN_BRIGHTNESS", "15.0"))
QUALITY_MAX_BRIGHTNESS = float(os.getenv("AUTHENTIQ_QUALITY_MAX_BRIGHTNESS", "245.0"))
QUALITY_MIN_CONTRAST = float(os.getenv("AUTHENTIQ_QUALITY_MIN_CONTRAST", "10.0"))
QUALITY_MIN_PRODUCT_AREA_RATIO = float(os.getenv("AUTHENTIQ_QUALITY_MIN_PRODUCT_AREA_RATIO", "0.08"))
QUALITY_MAX_GLARE_RATIO = float(os.getenv("AUTHENTIQ_QUALITY_MAX_GLARE_RATIO", "0.15"))
QUALITY_OVERALL_THRESHOLD = float(os.getenv("AUTHENTIQ_QUALITY_OVERALL_THRESHOLD", "0.45"))

# ── Advisory gate: HARD-REJECT thresholds (audit 1.12) ────────────────────────
# The customer quality gate is advisory. Only genuinely UNUSABLE images fail; a
# merely-suboptimal image (soft glare, a bit small/dark) passes with quality_flags
# and reshoot guidance so the VLM still gets a look instead of a false reject.
# Previously `too_small` and any `glare_ratio > 0.15` hard-rejected valid photos —
# `extreme_glare` even reused the SOFT 0.15 threshold. These are now separate,
# much looser, env-tunable "extreme" limits.
QUALITY_HARD_MIN_WIDTH = int(os.getenv("AUTHENTIQ_QUALITY_HARD_MIN_WIDTH", "160"))
QUALITY_HARD_MIN_HEIGHT = int(os.getenv("AUTHENTIQ_QUALITY_HARD_MIN_HEIGHT", "160"))
QUALITY_EXTREME_BLUR = float(os.getenv("AUTHENTIQ_QUALITY_EXTREME_BLUR", "5.0"))
QUALITY_EXTREME_DARK = float(os.getenv("AUTHENTIQ_QUALITY_EXTREME_DARK", "8.0"))
QUALITY_EXTREME_BRIGHT = float(os.getenv("AUTHENTIQ_QUALITY_EXTREME_BRIGHT", "252.0"))
QUALITY_EXTREME_GLARE_RATIO = float(os.getenv("AUTHENTIQ_QUALITY_EXTREME_GLARE_RATIO", "0.35"))

# Rejection reason templates
_REJECT_BLURRY = "Image is too blurry. Please retake the photo."
_REJECT_MOTION_BLUR = "Motion blur detected. Please hold your camera steady."
_REJECT_TOO_DARK = "Lighting is too poor. Please take the photo in a brighter environment."
_REJECT_OVEREXPOSED = "Image is overexposed. Move away from direct bright light or reduce flash glare."
_REJECT_LOW_CONTRAST = "Image contrast is too low. Ensure the product stands out clearly against the background."
_REJECT_LOW_RES = "Low-resolution image ({w}x{h}). Please upload a higher resolution photo."
_REJECT_NOT_VISIBLE = "Product not visible in the photo. Make sure the product is centered and clearly visible."
_REJECT_MULTIPLE_PRODUCTS = "Multiple products detected. Please isolate a single product inside the frame."
_REJECT_TOO_SMALL = "Product occupies too little area of the image. Move closer and fill the frame."
_REJECT_CLIPPED = "Product is partially outside the frame. Please make sure the entire product is visible."
_REJECT_OCCLUSION = "Occlusion detected (hand, fingers, or object covering the product). Keep the product surface clear."
_REJECT_GLARE = "Excessive glare or reflections detected on the product. Change your angle or reduce lighting."
_REJECT_TILT = "Extreme camera tilt detected. Please capture the product from a straight-on angle."


# Brightness at which a pixel counts as a blown-out (clipped) highlight.
_GLARE_SATURATION_LEVEL = int(os.getenv("AUTHENTIQ_QUALITY_GLARE_LEVEL", "250"))
# A single saturated region larger than this fraction of the frame is taken to be
# a genuinely white/light subject or backdrop — not glare.
_GLARE_MAX_BLOB_FRACTION = float(os.getenv("AUTHENTIQ_QUALITY_GLARE_MAX_BLOB", "0.05"))


def _specular_glare_ratio(gray: "np.ndarray") -> float:
    """Fraction of the frame covered by genuine SPECULAR highlights.

    A naive "count every pixel brighter than X" measure cannot distinguish a
    blown-out reflection from a subject that is simply WHITE. That made white or
    light packaging (sugar, salt, a white label) measure ~0.47 "glare" and get
    hard-rejected by the quality gate before the AI ever saw it.

    Real specular glare is a small number of COMPACT saturated blobs. A white
    product or bright backdrop is one large contiguous region. So we count only
    saturated pixels belonging to components smaller than
    `_GLARE_MAX_BLOB_FRACTION` of the frame, and ignore the large ones.

    Falls back to the plain saturated-pixel ratio if labelling is unavailable.
    """
    total = gray.size
    if total == 0:
        return 0.0
    saturated = gray >= _GLARE_SATURATION_LEVEL
    if not saturated.any():
        return 0.0

    try:
        from scipy import ndimage
    except Exception:  # scipy missing → conservative previous behaviour
        return float(saturated.sum() / total)

    labels, count = ndimage.label(saturated)
    if count == 0:
        return 0.0
    # bincount index 0 is the background (non-saturated) label — drop it.
    sizes = np.bincount(labels.ravel())[1:]
    max_blob = _GLARE_MAX_BLOB_FRACTION * total
    specular = float(sizes[sizes <= max_blob].sum())
    return specular / total


def _blur_variance(image: Image.Image) -> float:
    """Laplacian-approximation sharpness via Pillow FIND_EDGES variance."""
    gray = image.convert("L")
    edges = gray.filter(ImageFilter.FIND_EDGES)
    arr = np.asarray(edges, dtype=np.float32)
    return float(arr.var())


def _mean_brightness(image: Image.Image) -> float:
    arr = np.asarray(image.convert("L"), dtype=np.float32)
    return float(arr.mean())


# ── Vendor reference validation (UNCHANGED public API) ────────────────────────

def validate_reference_image_bytes(
    contents: bytes,
    *,
    existing_hashes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Returns quality report with warnings (non-blocking) and pass flag.
    Used for vendor reference image uploads only.
    Relaxed validation to reduce false rejections during product setup.
    """
    warnings: List[str] = []
    try:
        image = Image.open(BytesIO(contents)).convert("RGB")
    except Exception as exc:
        return {
            "passed": False,
            "warnings": [f"Could not decode image: {exc}"],
            "metrics": {},
        }

    w, h = image.size
    metrics = {
        "width": w,
        "height": h,
        "blur_variance": round(_blur_variance(image), 2),
        "brightness": round(_mean_brightness(image), 2),
    }

    # Relaxed resolution check - only warn for extremely low resolution
    if w < 200 or h < 200:
        warnings.append(
            f"Resolution is very low ({w}×{h}). Use at least 400×400 for best results."
        )

    # Relaxed blur check - only warn for extremely blurry images
    if metrics["blur_variance"] < 30.0:
        warnings.append("Image appears blurry. Retake with a steady camera and sharp focus.")

    # Relaxed brightness checks - wider acceptable range
    if metrics["brightness"] < 20.0:
        warnings.append("Image is too dark. Improve lighting on the product and label.")
    if metrics["brightness"] > 240.0:
        warnings.append("Image is overexposed. Reduce glare or harsh lighting.")

    digest = hashlib.sha256(contents).hexdigest()
    if existing_hashes and digest in existing_hashes:
        warnings.append("This file appears identical to another reference image already uploaded.")

    # Always pass for now - warnings are informational only
    return {
        "passed": True,
        "warnings": warnings,
        "metrics": metrics,
        "content_hash": digest,
    }


# ── Customer verification image quality gate (NEW) ────────────────────────────

def validate_customer_image_bytes(
    contents: bytes,
    *,
    image_type: str = "image",
) -> Dict[str, Any]:
    """
    Advanced pre-processing quality assessment stage for customer-uploaded images.
    
    Evaluates:
        - Sharpness (OpenCV Laplacian variance)
        - Brightness & Contrast (Grayscale mean & standard deviation)
        - Specular glare (LAB/Grayscale thresholding)
        - Perceptual score approximation
        - YOLOv8 product visibility, bounding box area, clipping, and hand/person occlusion
        
    Args:
        contents: Raw image bytes
        image_type: Slot name ("front", "back", "label")
        
    Returns:
        Quality validation report including accepted state, scores, flags, and instructions.
    """
    import cv2
    from app.services.yolo_service import detect_raw_boxes

    slot_label = image_type.replace("_", " ").lower()
    quality_flags: List[str] = []
    reshoot_instructions: List[str] = []

    # 1. Image Decoding and Resolution Check
    try:
        nparr = np.frombuffer(contents, np.uint8)
        img_np = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_np is None:
            raise ValueError("OpenCV decoding returned None")
        h, w = img_np.shape[:2]
        gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
    except Exception as exc:
        return {
            "passed": False,
            "accepted": False,
            "quality_flags": ["decode_error"],
            "reshoot_instructions": [
                f"The {slot_label} image could not be read ({exc}). "
                "Please try capturing a new photo."
            ],
            "metrics": {},
            "scoring": {
                "blur_score": 0.0,
                "brightness_score": 0.0,
                "visibility_score": 0.0,
                "occlusion_score": 0.0,
                "overall_quality": 0.0
            }
        }

    if w < QUALITY_HARD_MIN_WIDTH or h < QUALITY_HARD_MIN_HEIGHT:
        # Genuinely unusable resolution — hard reject.
        quality_flags.append("too_tiny")
        reshoot_instructions.append(_REJECT_LOW_RES.format(w=w, h=h))
    elif w < CUSTOMER_MIN_WIDTH or h < CUSTOMER_MIN_HEIGHT:
        # Below the preferred size but still usable — advisory only (not a reject).
        quality_flags.append("too_small")
        reshoot_instructions.append(_REJECT_LOW_RES.format(w=w, h=h))

    # 2. Blur / Sharpness Check (Laplacian Variance)
    # Normalize resolution to 500px width for consistent variance across devices
    target_w = 500
    if w > target_w:
        scale = target_w / w
        target_h = int(h * scale)
        small_gray = cv2.resize(gray, (target_w, target_h), interpolation=cv2.INTER_AREA)
    else:
        small_gray = gray
    blur_variance = float(cv2.Laplacian(small_gray, cv2.CV_64F).var())
    blur_score = min(1.0, blur_variance / 80.0)
    
    # Check for blur threshold
    if blur_variance < QUALITY_MIN_BLUR:
        quality_flags.append("blurry")
        if blur_variance < (QUALITY_MIN_BLUR * 0.5):
            reshoot_instructions.append(_REJECT_MOTION_BLUR)
        else:
            reshoot_instructions.append(_REJECT_BLURRY)

    # 3. Brightness and Contrast Check
    mean_brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    
    # Map brightness to 0.0-1.0 score centered at 128
    brightness_score = max(0.0, 1.0 - (abs(mean_brightness - 128) / 128.0))
    contrast_score = min(1.0, contrast / 50.0)

    if mean_brightness < QUALITY_MIN_BRIGHTNESS:
        quality_flags.append("too_dark")
        reshoot_instructions.append(_REJECT_TOO_DARK)
    elif mean_brightness > QUALITY_MAX_BRIGHTNESS:
        quality_flags.append("overexposed")
        reshoot_instructions.append(_REJECT_OVEREXPOSED)

    if contrast < QUALITY_MIN_CONTRAST:
        quality_flags.append("low_contrast")
        reshoot_instructions.append(_REJECT_LOW_CONTRAST)

    # 4. Specular Glare Check — measures blown-out REFLECTIONS, not whiteness.
    # (See _specular_glare_ratio: a white label/product is no longer mistaken for
    # glare, which previously hard-rejected valid photos of light packaging.)
    glare_ratio = _specular_glare_ratio(gray)
    glare_score = max(0.0, 1.0 - (glare_ratio / QUALITY_MAX_GLARE_RATIO))
    
    if glare_ratio > QUALITY_MAX_GLARE_RATIO:
        quality_flags.append("excessive_glare")
        reshoot_instructions.append(_REJECT_GLARE)

    # 5. YOLO Object Detection for Visibility, Clipping, Occlusion, Multiple products
    visibility_score = 1.0
    occlusion_score = glare_score  # Start from glare score baseline
    
    yolo_boxes, _ = detect_raw_boxes(image_bytes=contents)
    
    product_boxes = []
    person_boxes = []
    for box in yolo_boxes:
        cls_name = str(box.get("class_name", "")).lower()
        if cls_name == "person":
            person_boxes.append(box)
        else:
            product_boxes.append(box)

    area_ratio = 0.0
    if not product_boxes:
        # If no product classes are found, evaluate general visibility
        # Lenient: assume product is visible if contrast is fine
        visibility_score = 1.0 if contrast >= QUALITY_MIN_CONTRAST else 0.85
        quality_flags.append("product_not_visible")
        reshoot_instructions.append(_REJECT_NOT_VISIBLE)
    else:
        # Focus on the largest detected product box
        box_areas = []
        for box in product_boxes:
            bx1, by1, bx2, by2 = box["bbox"]
            box_areas.append((bx2 - bx1) * (by2 - by1))
        main_idx = int(np.argmax(box_areas))
        main_box = product_boxes[main_idx]
        x1, y1, x2, y2 = main_box["bbox"]
        box_w, box_h = x2 - x1, y2 - y1
        area_ratio = (box_w * box_h) / (w * h)
        
        # Visibility check based on size
        if area_ratio < QUALITY_MIN_PRODUCT_AREA_RATIO:
            quality_flags.append("product_too_small")
            reshoot_instructions.append(_REJECT_TOO_SMALL)
            visibility_score = min(visibility_score, area_ratio / QUALITY_MIN_PRODUCT_AREA_RATIO)
        else:
            visibility_score = min(visibility_score, float(main_box.get("confidence", 0.90)))

        # Border clipping check
        border_padding = 6
        if x1 <= border_padding or y1 <= border_padding or x2 >= w - border_padding or y2 >= h - border_padding:
            quality_flags.append("product_clipped")
            reshoot_instructions.append(_REJECT_CLIPPED)
            visibility_score = min(visibility_score, 0.70)

        # Camera Tilt Check (Aspect ratio check)
        aspect_ratio = box_w / box_h if box_h > 0 else 1.0
        if aspect_ratio < 0.15 or aspect_ratio > 6.0:
            quality_flags.append("extreme_tilt")
            reshoot_instructions.append(_REJECT_TILT)
            visibility_score = min(visibility_score, 0.50)

        # Multiple products check
        multiple_detected = False
        main_class = main_box.get("class_name")
        for box in product_boxes:
            if box is main_box:
                continue
            if box.get("class_name") == main_class and box.get("confidence", 0) > 0.40:
                # Check overlap (Intersection over Union)
                bx1, by1, bx2, by2 = box["bbox"]
                ix1 = max(x1, bx1)
                iy1 = max(y1, by1)
                ix2 = min(x2, bx2)
                iy2 = min(y2, by2)
                inter_area = max(0, ix2 - ix1) * max(0, iy2 - iy1)
                union_area = box_w * box_h + (bx2 - bx1) * (by2 - by1) - inter_area
                iou = inter_area / union_area if union_area > 0 else 0.0
                if iou < 0.25:
                    multiple_detected = True
                    break
        if multiple_detected:
            quality_flags.append("multiple_products")
            reshoot_instructions.append(_REJECT_MULTIPLE_PRODUCTS)
            visibility_score = min(visibility_score, 0.40)

        # Occlusion check: Overlapping person (hand/fingers) box
        person_occlusion = False
        for pbox in person_boxes:
            px1, py1, px2, py2 = pbox["bbox"]
            ix1 = max(x1, px1)
            iy1 = max(y1, py1)
            ix2 = min(x2, px2)
            iy2 = min(y2, py2)
            if ix2 > ix1 and iy2 > iy1:
                inter_area = (ix2 - ix1) * (iy2 - iy1)
                overlap_ratio = inter_area / (box_w * box_h)
                if overlap_ratio > 0.35:  # Allow minor partial obstructions. Reject only >35% occlusion.
                    person_occlusion = True
                    break
        if person_occlusion:
            quality_flags.append("occluded")
            reshoot_instructions.append(_REJECT_OCCLUSION)
            occlusion_score = min(occlusion_score, 0.25)

    # 6. Overall Quality Score System
    # Calculate no-reference perceptual quality score mapping
    blur_img = cv2.medianBlur(gray, 3)
    diff = cv2.absdiff(gray, blur_img)
    noise_variance = float(np.var(diff))
    noise_score = max(0.0, 1.0 - (noise_variance / 50.0))
    
    perceptual_score = float(0.4 * blur_score + 0.3 * contrast_score + 0.2 * brightness_score + 0.1 * noise_score)
    
    # Calculate overall quality score
    overall_quality = float((blur_score + brightness_score + visibility_score + occlusion_score) / 4.0)
    
    # Advisory gate (audit 1.12): reject ONLY genuinely-unusable images. Merely
    # suboptimal photos (a bit small/soft/bright, ordinary glare) pass WITH
    # quality_flags + reshoot guidance so the VLM still gets to inspect them,
    # instead of the old behaviour that hard-rejected valid images (`too_small`
    # was critical; `extreme_glare` even reused the SOFT 0.15 glare threshold).
    critical_flags = {"decode_error", "too_tiny"}
    if blur_variance < QUALITY_EXTREME_BLUR:  # extremely/severely blurred
        critical_flags.add("extreme_blur")
        if "extreme_blur" not in quality_flags:
            quality_flags.append("extreme_blur")
        if _REJECT_MOTION_BLUR not in reshoot_instructions:
            reshoot_instructions.append(_REJECT_MOTION_BLUR)
    if mean_brightness < QUALITY_EXTREME_DARK:  # extremely dark
        critical_flags.add("extreme_dark")
        if "extreme_dark" not in quality_flags:
            quality_flags.append("extreme_dark")
        if _REJECT_TOO_DARK not in reshoot_instructions:
            reshoot_instructions.append(_REJECT_TOO_DARK)
    if mean_brightness > QUALITY_EXTREME_BRIGHT:  # extremely overexposed
        critical_flags.add("extreme_overexposed")
        if "extreme_overexposed" not in quality_flags:
            quality_flags.append("extreme_overexposed")
        if _REJECT_OVEREXPOSED not in reshoot_instructions:
            reshoot_instructions.append(_REJECT_OVEREXPOSED)
    if glare_ratio > QUALITY_EXTREME_GLARE_RATIO:  # only EXTREME glare rejects
        critical_flags.add("extreme_glare")
        if "extreme_glare" not in quality_flags:
            quality_flags.append("extreme_glare")
        if _REJECT_GLARE not in reshoot_instructions:
            reshoot_instructions.append(_REJECT_GLARE)

    has_critical = any(f in quality_flags for f in critical_flags)
    passed = not has_critical


    # Logging image quality metrics, scores, and final rejection reason
    logger.info(
        "[Image Quality] slot=%s, resolution=%dx%d, blur_variance=%.2f (score=%.2f), "
        "brightness=%.2f (score=%.2f), contrast=%.2f (score=%.2f), glare_ratio=%.4f (score=%.2f), "
        "product_detected=%s, passed=%s, flags=%s",
        image_type, w, h, blur_variance, blur_score,
        mean_brightness, brightness_score, contrast, contrast_score, glare_ratio, glare_score,
        bool(product_boxes), passed, quality_flags
    )
    if not passed:
        logger.warning(
            "[Image Quality Rejected] slot=%s, critical_flags=%s, instructions=%s",
            image_type, [f for f in quality_flags if f in critical_flags], reshoot_instructions
        )

    metrics = {
        "width": w,
        "height": h,
        "blur_variance": round(blur_variance, 2),
        "brightness": round(mean_brightness, 2),
        "contrast": round(contrast, 2),
        "glare_ratio": round(glare_ratio, 4),
        "noise_variance": round(noise_variance, 2),
        "product_area_ratio": round(area_ratio, 4) if product_boxes else 0.0
    }

    scoring = {
        "blur_score": round(blur_score, 4),
        "brightness_score": round(brightness_score, 4),
        "visibility_score": round(visibility_score, 4),
        "occlusion_score": round(occlusion_score, 4),
        "perceptual_score": round(perceptual_score, 4),
        "overall_quality": round(overall_quality, 4),
        "accepted": passed
    }

    return {
        "passed": passed,
        "accepted": passed,
        "quality_flags": quality_flags,
        "reshoot_instructions": reshoot_instructions,
        "metrics": metrics,
        "scoring": scoring
    }
