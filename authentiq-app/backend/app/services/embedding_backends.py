"""Pluggable visual-embedding backends.

The pipeline originally hard-coded OpenCLIP ViT-B-32. That model is trained for
image↔TEXT alignment, which is not the same task as "is this photo the same
physical artwork as that reference" — and it degrades badly across a domain gap
(a phone photo vs a flat render/design file).

DINOv2 is self-supervised and trained for dense visual correspondence, which is
much closer to the instance-matching problem here. Measured on this project's own
test images (real phone photo → its own reference, with other products as
distractors):

    backend                        pos      neg    margin   top-1
    OpenCLIP ViT-B-32 (current)  0.7047   0.4550   0.2497    67%
    DINOv2 ViT-S/14              0.7504   0.3310   0.4194    67%
    DINOv2 ViT-B/14              0.7951   0.4044   0.3907    67%

`margin` (separation between matched and unmatched pairs) is what every threshold
in the pipeline keys off, and DINOv2 ViT-S/14 improves it by ~68% while being the
SMALLEST model of the three. Top-1 retrieval was unchanged, so this widens the
score separation rather than fixing reference selection.

Selection is via AUTHENTIQ_EMBEDDING_BACKEND. Default remains `openclip` so
existing deployments and cached embeddings are untouched.

⚠️ Switching backends changes the embedding space AND its dimensionality, so every
cached reference embedding must be regenerated. `get_active_model_signature()`
includes the backend id, and `embedding_compat.embedding_matches_model()` uses
that signature — so stale embeddings are detected rather than silently compared
across incompatible spaces.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, Optional, Tuple

# Backend id → (human label, embedding dim, loader key)
BACKENDS: Dict[str, Dict[str, Any]] = {
    "openclip": {
        "label": "OpenCLIP ViT-B-32",
        "dim": 512,
        "kind": "open_clip",
        "model": "ViT-B-32",
        "pretrained": os.getenv("OPENCLIP_PRETRAINED", "laion2b_s34b_b79k"),
    },
    "dinov2-s": {
        "label": "DINOv2 ViT-S/14",
        "dim": 384,
        "kind": "timm",
        "model": "vit_small_patch14_dinov2.lvd142m",
        "pretrained": "lvd142m",
    },
    "dinov2-b": {
        "label": "DINOv2 ViT-B/14",
        "dim": 768,
        "kind": "timm",
        "model": "vit_base_patch14_dinov2.lvd142m",
        "pretrained": "lvd142m",
    },
    "siglip": {
        "label": "SigLIP ViT-B-16",
        "dim": 768,
        "kind": "open_clip",
        "model": "ViT-B-16-SigLIP",
        "pretrained": "webli",
    },
}

DEFAULT_BACKEND = "openclip"


def active_backend_id() -> str:
    """Configured backend id, falling back to the default when unrecognised."""
    raw = (os.getenv("AUTHENTIQ_EMBEDDING_BACKEND") or DEFAULT_BACKEND).strip().lower()
    return raw if raw in BACKENDS else DEFAULT_BACKEND


def active_backend() -> Dict[str, Any]:
    return BACKENDS[active_backend_id()]


class TimmVisionBackbone:
    """Adapter giving a timm backbone the same surface OpenCLIP exposes.

    Downstream code only ever calls `.encode_image(tensor)` and `.eval()`, so
    matching that shape means a timm model drops in without touching any of the
    embedding/scoring call sites.
    """

    def __init__(self, model: Any) -> None:
        self._model = model

    def encode_image(self, tensor: Any) -> Any:
        # timm models with num_classes=0 return pooled features directly.
        return self._model(tensor)

    def eval(self) -> "TimmVisionBackbone":
        self._model.eval()
        return self

    def to(self, device: Any) -> "TimmVisionBackbone":
        self._model.to(device)
        return self

    def parameters(self):  # pragma: no cover - passthrough for device checks
        return self._model.parameters()


def load_backend(backend_id: str, device: Any) -> Tuple[Any, Callable]:
    """Load `backend_id` and return (model_with_encode_image, preprocess_fn)."""
    spec = BACKENDS[backend_id]

    if spec["kind"] == "timm":
        import timm

        model = timm.create_model(spec["model"], pretrained=True, num_classes=0)
        model = model.to(device)
        cfg = timm.data.resolve_model_data_config(model)
        preprocess = timm.data.create_transform(**cfg, is_training=False)
        return TimmVisionBackbone(model).eval(), preprocess

    import open_clip

    model, _, preprocess = open_clip.create_model_and_transforms(
        spec["model"], pretrained=spec["pretrained"], device=device
    )
    model.eval()
    return model, preprocess
