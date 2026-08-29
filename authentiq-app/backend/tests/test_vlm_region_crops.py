"""High-res security-region crops are attached to the VLM prompt (audit item 1.4).

Verifies that _build_messages adds close-up crops in addition to the full images,
stays within the VLM_MAX_IMAGES budget, and can be turned off. No network/model:
region proposals fall back to heuristics on a synthetic image.
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

from app.services import qwen_vl_service as qv
from app.services import vlm_config as cfg


def _jpeg(w: int = 800, h: int = 800) -> bytes:
    arr = np.random.randint(0, 255, (h, w, 3), dtype=np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _count_images(messages):
    user = messages[1]["content"]
    return sum(1 for c in user if c.get("type") == "image_url")


def _has_closeup(messages) -> bool:
    # Match the per-crop LABEL ("CLOSE-UP — slot: ...") specifically, not the
    # instruction paragraph that merely mentions close-up crops exist.
    user = messages[1]["content"]
    return any(c.get("type") == "text" and "CLOSE-UP — slot:" in c.get("text", "") for c in user)


def test_crops_are_attached_and_within_budget(monkeypatch):
    monkeypatch.setattr(cfg, "VLM_REGION_CROPS_ENABLED", True)
    monkeypatch.setattr(cfg, "VLM_MAX_CROPS_PER_IMAGE", 3)
    img = _jpeg()
    customer = [{"view": "front", "bytes": img}]
    reference = [{"view": "front", "bytes": img}]

    messages = qv._build_messages(customer, reference, product=None)
    assert messages is not None
    n_images = _count_images(messages)
    # 1 reference + 1 customer full + at least 1 close-up crop.
    assert n_images >= 3
    assert n_images <= cfg.VLM_MAX_IMAGES
    assert _has_closeup(messages)


def test_crops_can_be_disabled(monkeypatch):
    monkeypatch.setattr(cfg, "VLM_REGION_CROPS_ENABLED", False)
    img = _jpeg()
    messages = qv._build_messages(
        [{"view": "front", "bytes": img}], [{"view": "front", "bytes": img}], product=None
    )
    assert _count_images(messages) == 2       # just the two full images
    assert _has_closeup(messages) is False


def test_total_images_never_exceed_budget(monkeypatch):
    monkeypatch.setattr(cfg, "VLM_REGION_CROPS_ENABLED", True)
    monkeypatch.setattr(cfg, "VLM_MAX_IMAGES", 6)
    monkeypatch.setattr(cfg, "VLM_MAX_CROPS_PER_IMAGE", 3)
    img = _jpeg()
    customer = [{"view": v, "bytes": img} for v in ("front", "back", "label")]
    reference = [{"view": v, "bytes": img} for v in ("front", "back", "label")]
    messages = qv._build_messages(customer, reference, product=None)
    assert _count_images(messages) <= 6
