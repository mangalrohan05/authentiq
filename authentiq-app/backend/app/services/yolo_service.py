"""
YOLOv8 region proposal service for authenticity-critical ROIs.

Uses Ultralytics YOLO as a region detector only — classification remains OpenCLIP.
Lazy-loaded singleton with CUDA → MPS → CPU fallback.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from app.services.region_scoring_config import YOLO_CONF, YOLO_MAX_DETECTIONS, YOLO_MODEL

logger = logging.getLogger(__name__)

# HEURISTIC: YOLOv8n was trained on COCO general objects; this mapping is approximate.
# Map default COCO class names to authenticity region types for regional OpenCLIP evaluation.
COCO_TO_AUTH_REGION: Dict[str, str] = {
    "bottle": "packaging",
    "cup": "packaging",
    "bowl": "packaging",
    "wine glass": "packaging",
    "vase": "packaging",
    "handbag": "logo",
    "tie": "logo",
    "suitcase": "packaging",
    "backpack": "packaging",
    "book": "label",
    "laptop": "label",
    "keyboard": "text",
    "cell phone": "qr",
    "remote": "text",
    "clock": "serial",
    "scissors": "seal",
    "toothbrush": "text",
    "fork": "text",
    "knife": "text",
    "spoon": "text",
    "banana": "packaging",
    "orange": "packaging",
    "apple": "packaging",
    "sandwich": "packaging",
    "donut": "packaging",
    "cake": "packaging",
}


class _YOLOModelSingleton:
    _instance: Optional["_YOLOModelSingleton"] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.model = None
        self.device: Optional[str] = None
        self._load_lock = threading.Lock()
        self._loaded = False
        self._load_failed = False
        self._load_error: Optional[str] = None
        self._model_name: Optional[str] = None

    def ensure_loaded(self) -> bool:
        if self._loaded:
            return True
        if self._load_failed:
            return False
        with self._load_lock:
            if self._loaded:
                return True
            if self._load_failed:
                return False
            return self._load_model()

    def _resolve_device(self) -> str:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def _load_model(self) -> bool:
        try:
            from ultralytics import YOLO

            device = self._resolve_device()
            model_path = YOLO_MODEL
            if not os.path.isabs(model_path) and not os.path.isfile(model_path):
                # Ultralytics will download yolov8n.pt on first use
                pass

            logger.info("[YOLO] Loading %s on %s (first use)", model_path, device)
            self.model = YOLO(model_path)
            self.device = device
            self._model_name = model_path
            self._loaded = True
            logger.info("[YOLO] Ready on %s", device)
            return True
        except ImportError as exc:
            self._load_failed = True
            self._load_error = f"ultralytics not installed: {exc}"
            logger.warning("[YOLO] %s", self._load_error)
            return False
        except Exception as exc:
            self._load_failed = True
            self._load_error = str(exc)
            logger.error("[YOLO] Load failed: %s", exc, exc_info=True)
            return False

    def is_ready(self) -> bool:
        return self._loaded and not self._load_failed


_singleton: Optional[_YOLOModelSingleton] = None
_create_lock = threading.Lock()


def get_yolo_singleton() -> _YOLOModelSingleton:
    global _singleton
    if _singleton is None:
        with _create_lock:
            if _singleton is None:
                _singleton = _YOLOModelSingleton()
    return _singleton


def detect_raw_boxes(
    image_path: Optional[str] = None,
    image_bytes: Optional[bytes] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Run YOLO inference. Returns list of dicts:
    {region_type, bbox [x1,y1,x2,y2], confidence, source: "yolo", class_name}
    """
    meta: Dict[str, Any] = {
        "yolo_available": False,
        "device": None,
        "inference_ms": 0.0,
        "detection_count": 0,
    }
    singleton = get_yolo_singleton()
    if not singleton.ensure_loaded():
        meta["error"] = singleton._load_error
        return [], meta

    try:
        from io import BytesIO

        import numpy as np
        from PIL import Image

        t0 = time.perf_counter()
        if image_bytes:
            img = Image.open(BytesIO(image_bytes)).convert("RGB")
            source = np.array(img)
        elif image_path:
            source = image_path
        else:
            return [], meta

        # Ultralytics accepts path or ndarray
        results = singleton.model.predict(
            source,
            conf=YOLO_CONF,
            max_det=YOLO_MAX_DETECTIONS,
            verbose=False,
            device=singleton.device,
        )
        meta["inference_ms"] = round((time.perf_counter() - t0) * 1000, 2)
        meta["yolo_available"] = True
        meta["device"] = singleton.device

        boxes: List[Dict[str, Any]] = []
        if not results:
            return boxes, meta

        r0 = results[0]
        names = r0.names or {}
        xyxy = r0.boxes.xyxy.cpu().numpy() if r0.boxes is not None else []
        confs = r0.boxes.conf.cpu().numpy() if r0.boxes is not None else []
        clss = r0.boxes.cls.cpu().numpy() if r0.boxes is not None else []

        for box, conf, cls_id in zip(xyxy, confs, clss):
            cls_name = names.get(int(cls_id), str(int(cls_id)))
            region_type = COCO_TO_AUTH_REGION.get(str(cls_name).lower(), "detail")
            x1, y1, x2, y2 = [int(v) for v in box]
            boxes.append(
                {
                    "region_type": region_type,
                    "bbox": [x1, y1, x2, y2],
                    "confidence": float(conf),
                    "source": "yolo",
                    "class_name": cls_name,
                }
            )
        meta["detection_count"] = len(boxes)
        return boxes, meta

    except Exception as exc:
        logger.warning("[YOLO] Inference failed: %s", exc)
        meta["error"] = str(exc)
        return [], meta


def health_check() -> Dict[str, Any]:
    singleton = get_yolo_singleton()
    if singleton._load_failed:
        return {
            "status": "error",
            "message": singleton._load_error,
            "loaded": False,
        }
    if not singleton._loaded:
        return {
            "status": "not_loaded",
            "message": "YOLO loads on first regional verification request",
            "model": YOLO_MODEL,
            "loaded": False,
        }
    return {
        "status": "healthy",
        "model": singleton._model_name or YOLO_MODEL,
        "device": singleton.device,
        "loaded": True,
    }
