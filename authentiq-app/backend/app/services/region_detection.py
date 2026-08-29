"""
Authenticity region proposals: YOLO detections + heuristic fallbacks.

Heuristics ensure useful ROIs when COCO classes do not match product photos.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image

from app.services.region_scoring_config import YOLO_ENABLED
from app.services.yolo_service import detect_raw_boxes

logger = logging.getLogger(__name__)

HEURISTIC_REGIONS = (
    ("logo", 0.20, 0.15, 0.80, 0.55),  # upper-center brand area
    ("label", 0.15, 0.40, 0.85, 0.75),
    ("serial", 0.10, 0.72, 0.90, 0.92),  # bottom strip
    ("hologram", 0.55, 0.25, 0.95, 0.55),  # right-upper security mark
    ("qr", 0.02, 0.02, 0.35, 0.35),  # top-left QR corner
    ("packaging", 0.05, 0.05, 0.95, 0.95),
)


def _pil_from_bytes(image_bytes: bytes) -> Optional[Image.Image]:
    from io import BytesIO

    try:
        return Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        logger.warning("[Region] Invalid image: %s", exc)
        return None


def _crop_box(image: Image.Image, bbox: List[int], pad: float = 0.02) -> Image.Image:
    w, h = image.size
    x1, y1, x2, y2 = bbox
    pw = int((x2 - x1) * pad)
    ph = int((y2 - y1) * pad)
    x1 = max(0, x1 - pw)
    y1 = max(0, y1 - ph)
    x2 = min(w, x2 + pw)
    y2 = min(h, y2 + ph)
    if x2 - x1 < 8 or y2 - y1 < 8:
        return image.copy()
    return image.crop((x1, y1, x2, y2))


def heuristic_regions(image: Image.Image) -> List[Dict[str, Any]]:
    w, h = image.size
    out: List[Dict[str, Any]] = []
    for region_type, x0, y0, x1, y1 in HEURISTIC_REGIONS:
        bbox = [
            int(w * x0),
            int(h * y0),
            int(w * x1),
            int(h * y1),
        ]
        out.append(
            {
                "region_type": region_type,
                "bbox": bbox,
                "confidence": 0.5,
                "source": "heuristic",
                "class_name": region_type,
            }
        )
    return out


def merge_regions(
    yolo_boxes: List[Dict[str, Any]],
    heuristic_boxes: List[Dict[str, Any]],
    *,
    min_confidence: float = 0.2,
) -> List[Dict[str, Any]]:
    """Prefer YOLO per region_type; fill gaps with heuristics."""
    by_type: Dict[str, Dict[str, Any]] = {}
    for box in yolo_boxes:
        if box.get("confidence", 0) < min_confidence:
            continue
        rt = box["region_type"]
        prev = by_type.get(rt)
        if prev is None or box["confidence"] > prev.get("confidence", 0):
            by_type[rt] = box

    for box in heuristic_boxes:
        rt = box["region_type"]
        if rt not in by_type:
            by_type[rt] = box

    return list(by_type.values())


def detect_authenticity_regions(
    image_bytes: bytes,
    *,
    use_yolo: Optional[bool] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Full region proposal pipeline.
    Returns (regions_with_crops as separate step, meta).
    """
    meta: Dict[str, Any] = {"yolo_used": False, "heuristic_count": 0, "yolo_count": 0}
    image = _pil_from_bytes(image_bytes)
    if not image:
        return [], {**meta, "error": "invalid_image"}

    yolo_boxes: List[Dict[str, Any]] = []
    yolo_meta: Dict[str, Any] = {}
    enabled = YOLO_ENABLED if use_yolo is None else use_yolo

    if enabled:
        yolo_boxes, yolo_meta = detect_raw_boxes(image_bytes=image_bytes)
        meta.update(yolo_meta)
        meta["yolo_used"] = bool(yolo_meta.get("yolo_available"))
        meta["yolo_count"] = len(yolo_boxes)

    heur = heuristic_regions(image)
    meta["heuristic_count"] = len(heur)
    merged = merge_regions(yolo_boxes, heur)
    meta["merged_count"] = len(merged)
    return merged, meta


def regions_to_crops(
    image_bytes: bytes,
    regions: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Attach PIL crops to region dicts (for embedding)."""
    image = _pil_from_bytes(image_bytes)
    if not image:
        return []
    out: List[Dict[str, Any]] = []
    for reg in regions:
        crop = _crop_box(image, reg["bbox"])
        out.append({**reg, "crop": crop})
    return out


def render_debug_overlay(image_bytes: bytes, regions: List[Dict[str, Any]]) -> bytes:
    """Draw bounding boxes for debug mode; returns JPEG bytes."""
    from io import BytesIO

    image = _pil_from_bytes(image_bytes)
    if not image:
        return image_bytes

    try:
        from PIL import ImageDraw, ImageFont
    except ImportError:
        return image_bytes

    draw = ImageDraw.Draw(image)
    for reg in regions:
        bbox = reg.get("bbox")
        if not bbox:
            continue
        draw.rectangle(bbox, outline=(0, 220, 80), width=3)
        label = f"{reg.get('region_type')} {reg.get('confidence', 0):.2f}"
        draw.text((bbox[0], max(0, bbox[1] - 14)), label, fill=(0, 220, 80))

    buf = BytesIO()
    image.save(buf, format="JPEG", quality=90)
    return buf.getvalue()
