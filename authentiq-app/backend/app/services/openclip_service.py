"""
OpenCLIP-based image embedding and similarity service.

Singleton pattern — model is loaded LAZILY (only on first AI endpoint call).
Import of this module is instantaneous and does NOT block the event loop.

Thread-safe for concurrent requests.
"""

import logging
import os
import numpy as np
from io import BytesIO
from typing import Optional, Dict, List, Tuple
import threading

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────────────────
# Model Configuration
# ────────────────────────────────────────────────────────────────────────────

MODEL_NAME = "ViT-B-32"
PRETRAINED_DATASET = os.getenv("OPENCLIP_PRETRAINED", "laion2b_s34b_b79k")
# Fallback if primary weights cannot be downloaded (e.g. HF 403 / offline)
PRETRAINED_FALLBACK = os.getenv("OPENCLIP_PRETRAINED_FALLBACK", "openai")
EMBEDDING_DIM = 512  # ViT-B-32 produces 512-dim embeddings
EMBEDDING_STRATEGY_VERSION = "v3_global_yolo_region_patch_ocr"

# Similarity thresholds (category-matched + top-2 scoring)
AUTHENTICITY_THRESHOLDS = {
    "highly_authentic": 0.90,      # >= 0.90 → highly_authentic
    "likely_authentic": 0.80,      # 0.80–0.89 → likely_authentic
    "needs_review": 0.65,          # 0.65–0.79 → needs_review
    "suspicious": 0.0,             # < 0.65 → suspicious
}

# ────────────────────────────────────────────────────────────────────────────
# Lazy Singleton Model Holder
# ────────────────────────────────────────────────────────────────────────────

class _OpenCLIPModelSingleton:
    """
    Thread-safe lazy singleton for OpenCLIP model.

    IMPORTANT: The model is NOT loaded on instantiation.
    Call `ensure_loaded()` (or any inference function) to trigger loading.
    This keeps backend startup instant — model loads only when the first
    AI verification endpoint is called.
    """

    _instance: Optional["_OpenCLIPModelSingleton"] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        # Prevent re-running __init__ on subsequent calls
        if self._initialized:
            return
        self._initialized = True

        # Model fields — None until ensure_loaded() is called
        self.model = None
        self.preprocess = None
        self.device = None
        self.tokenizer = None

        # Loading state
        self._load_lock = threading.Lock()
        self._loaded = False
        self._load_failed = False
        self._load_error: Optional[str] = None
        self._pretrained_used: Optional[str] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def ensure_loaded(self) -> bool:
        """
        Load the model if not already loaded.
        Returns True on success, False on failure.
        Thread-safe — only one thread loads; others wait on the lock.
        """
        if self._loaded:
            return True
        if self._load_failed:
            return False

        with self._load_lock:
            # Double-check inside lock
            if self._loaded:
                return True
            if self._load_failed:
                return False

            return self._load_model()

    def is_ready(self) -> bool:
        return self._loaded and not self._load_failed

    def get_model(self):
        return self.model

    def get_preprocess(self):
        return self.preprocess

    def get_device(self):
        return self.device

    # ------------------------------------------------------------------
    # Internal loader
    # ------------------------------------------------------------------

    def _load_model(self) -> bool:
        """
        Load OpenCLIP model and preprocessing pipeline.
        Must be called inside self._load_lock.
        Returns True on success, False on failure (never raises).
        """
        try:
            # Lazy imports — torch/open_clip only imported when actually needed.
            # This prevents import-time side-effects on backend startup.
            import torch
            import open_clip

            logger.info(
                f"[OpenCLIP] Loading model: {MODEL_NAME} / {PRETRAINED_DATASET} "
                "(first AI request — this may take a moment)"
            )

            # Determine device
            if torch.cuda.is_available():
                self.device = torch.device("cuda")
                logger.info("[OpenCLIP] Using CUDA GPU for inference")
            elif torch.backends.mps.is_available():
                self.device = torch.device("mps")
                logger.info("[OpenCLIP] Using Apple Silicon (MPS) for inference")
            else:
                self.device = torch.device("cpu")
                logger.info("[OpenCLIP] Using CPU for inference")

            # Alternative embedding backend (DINOv2 / SigLIP) — opt-in via
            # AUTHENTIQ_EMBEDDING_BACKEND. Default stays OpenCLIP so existing
            # deployments and their cached embeddings are unaffected.
            from app.services import embedding_backends as _backends

            backend_id = _backends.active_backend_id()
            if backend_id != _backends.DEFAULT_BACKEND:
                spec = _backends.BACKENDS[backend_id]
                logger.info(
                    "[Embedding] Loading backend '%s' (%s, dim=%d) instead of OpenCLIP",
                    backend_id, spec["label"], spec["dim"],
                )
                self.model, self.preprocess = _backends.load_backend(backend_id, self.device)
                self._loaded = True
                self._pretrained_used = spec["pretrained"]
                logger.info(
                    "[Embedding] %s loaded successfully on %s", spec["label"], self.device
                )
                return True

            # Load model and preprocessing (primary tag, then optional fallback)
            pretrained_used = PRETRAINED_DATASET
            try:
                self.model, _, self.preprocess = open_clip.create_model_and_transforms(
                    MODEL_NAME,
                    pretrained=PRETRAINED_DATASET,
                    device=self.device,
                )
            except Exception as primary_err:
                if PRETRAINED_FALLBACK and PRETRAINED_FALLBACK != PRETRAINED_DATASET:
                    logger.warning(
                        "[OpenCLIP] Primary weights '%s' failed (%s); trying fallback '%s'",
                        PRETRAINED_DATASET,
                        primary_err,
                        PRETRAINED_FALLBACK,
                    )
                    pretrained_used = PRETRAINED_FALLBACK
                    self.model, _, self.preprocess = open_clip.create_model_and_transforms(
                        MODEL_NAME,
                        pretrained=PRETRAINED_FALLBACK,
                        device=self.device,
                    )
                else:
                    raise

            # Set model to eval mode (disables dropout, batch norm updates)
            self.model.eval()

            self._loaded = True
            self._pretrained_used = pretrained_used
            logger.info(
                f"[OpenCLIP] Model loaded successfully on {self.device} "
                f"(pretrained={pretrained_used})"
            )
            return True

        except ImportError as e:
            self._load_failed = True
            self._load_error = f"OpenCLIP/Torch not installed: {e}"
            logger.error(f"[OpenCLIP] {self._load_error}")
            return False

        except Exception as e:
            self._load_failed = True
            self._load_error = str(e)
            logger.error(f"[OpenCLIP] Failed to load model: {e}", exc_info=True)
            return False


# ────────────────────────────────────────────────────────────────────────────
# Module-level singleton accessor
#
# NOTE: We do NOT instantiate here at module scope.
# The singleton is created lazily on first call to get_model_singleton().
# This means importing this module has ZERO startup cost.
# ────────────────────────────────────────────────────────────────────────────

_singleton_holder: Optional[_OpenCLIPModelSingleton] = None
_singleton_create_lock = threading.Lock()


def get_model_singleton() -> _OpenCLIPModelSingleton:
    """Return the global model singleton (creates it on first call, lazy)."""
    global _singleton_holder
    if _singleton_holder is None:
        with _singleton_create_lock:
            if _singleton_holder is None:
                _singleton_holder = _OpenCLIPModelSingleton()
    return _singleton_holder


def get_active_model_signature() -> Dict[str, str]:
    """Model + weights tag for embedding compatibility checks.

    Includes the selected backend, because DINOv2/SigLIP embeddings live in a
    different space (and dimensionality) than OpenCLIP's. Without this, switching
    backends would silently compare vectors across incompatible spaces instead of
    treating the cached ones as stale and regenerating them.
    """
    from app.services import embedding_backends as _backends

    singleton = get_model_singleton()
    backend_id = _backends.active_backend_id()
    if backend_id != _backends.DEFAULT_BACKEND:
        spec = _backends.BACKENDS[backend_id]
        return {"model": spec["model"], "pretrained": spec["pretrained"]}
    pretrained = getattr(singleton, "_pretrained_used", None) or PRETRAINED_DATASET
    return {"model": MODEL_NAME, "pretrained": pretrained}


# ────────────────────────────────────────────────────────────────────────────
# Embedding Generation
# ────────────────────────────────────────────────────────────────────────────

def generate_embedding_from_path(image_path: str) -> Dict:
    """
    Generate embedding from image file path.

    This is a SYNCHRONOUS, CPU-bound function.
    Callers in async context MUST run it in a thread executor:
        await loop.run_in_executor(None, generate_embedding_from_path, path)

    Args:
        image_path: File system path to image

    Returns:
        Dict with embedding, metadata, and success status
    """
    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        return generate_embedding_from_bytes(image_bytes, image_path)

    except FileNotFoundError:
        logger.error(f"[OpenCLIP] Image file not found: {image_path}")
        return {
            "embedding": None,
            "model": f"OpenCLIP-{MODEL_NAME}",
            "success": False,
            "error": "File not found",
        }
    except Exception as e:
        logger.error(f"[OpenCLIP] Error reading image file {image_path}: {e}")
        return {
            "embedding": None,
            "model": f"OpenCLIP-{MODEL_NAME}",
            "success": False,
            "error": str(e),
        }


def generate_embedding_from_bytes(image_bytes: bytes, source: str = "bytes") -> Dict:
    """
    Generate embedding from image bytes.

    This is a SYNCHRONOUS, CPU-bound function.
    Callers in async context MUST run it in a thread executor:
        await loop.run_in_executor(None, generate_embedding_from_bytes, data, name)

    Args:
        image_bytes: Raw image bytes
        source: Source description (for logging)

    Returns:
        Dict with embedding, metadata, and success status
    """
    singleton = get_model_singleton()

    # Ensure model is loaded (blocks this thread only, not the event loop)
    if not singleton.ensure_loaded():
        return {
            "embedding": None,
            "model": f"OpenCLIP-{MODEL_NAME}",
            "success": False,
            "error": f"AI service unavailable: {singleton._load_error}",
        }

    try:
        # Lazy imports inside function — only executed when actually needed
        import torch
        from PIL import Image

        # Load and preprocess image
        image = Image.open(BytesIO(image_bytes)).convert("RGB")

        # Resize image if it's too large to prevent memory overload
        max_dim = 1024
        if image.width > max_dim or image.height > max_dim:
            resample_filter = getattr(Image, "Resampling", Image).LANCZOS
            image.thumbnail((max_dim, max_dim), resample_filter)

        preprocess = singleton.get_preprocess()
        device = singleton.get_device()
        model = singleton.get_model()

        image_tensor = preprocess(image).unsqueeze(0).to(device)

        # Generate embedding (synchronous Torch call — runs in thread)
        with torch.no_grad():
            image_features = model.encode_image(image_tensor)
            # L2-normalize embedding
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

        # Convert to numpy and serialize to Python list
        embedding_np = image_features.cpu().numpy()
        embedding_list = embedding_np.flatten().tolist()

        pretrained_tag = getattr(singleton, "_pretrained_used", None) or PRETRAINED_DATASET
        return {
            "embedding": embedding_list,
            "model": f"OpenCLIP-{MODEL_NAME}",
            "embedding_model": MODEL_NAME,
            "embedding_pretrained": pretrained_tag,
            "embedding_strategy_version": EMBEDDING_STRATEGY_VERSION,
            "success": True,
            "embedding_dim": len(embedding_list),
        }

    except Exception as e:
        logger.error(f"[OpenCLIP] Error generating embedding from {source}: {e}")
        return {
            "embedding": None,
            "model": f"OpenCLIP-{MODEL_NAME}",
            "success": False,
            "error": str(e),
        }


def embed_pil_images_batch(images: List) -> List[Optional[List[float]]]:
    """
    Batch-encode multiple PIL images in one forward pass when possible.
    Returns list aligned with input images (None on failure per image).
    """
    if not images:
        return []

    singleton = get_model_singleton()
    if not singleton.ensure_loaded():
        return [None] * len(images)

    try:
        import torch
        from PIL import Image

        preprocess = singleton.get_preprocess()
        device = singleton.get_device()
        model = singleton.get_model()

        tensors = []
        valid_idx = []
        for idx, img in enumerate(images):
            if img is None:
                continue
            if not isinstance(img, Image.Image):
                continue
            im = img
            max_dim = 1024
            if im.width > max_dim or im.height > max_dim:
                resample = getattr(Image, "Resampling", Image).LANCZOS
                im = im.copy()
                im.thumbnail((max_dim, max_dim), resample)
            tensors.append(preprocess(im))
            valid_idx.append(idx)

        if not tensors:
            return [None] * len(images)

        batch = torch.stack(tensors).to(device)
        with torch.no_grad():
            features = model.encode_image(batch)
            features = features / features.norm(dim=-1, keepdim=True)

        features_np = features.cpu().numpy()
        results: List[Optional[List[float]]] = [None] * len(images)
        for out_i, src_i in enumerate(valid_idx):
            results[src_i] = features_np[out_i].flatten().tolist()
        return results

    except Exception as e:
        logger.error(f"[OpenCLIP] Batch embed failed: {e}")
        return [None] * len(images)


# ────────────────────────────────────────────────────────────────────────────
# Similarity Computation
# ────────────────────────────────────────────────────────────────────────────

def cosine_similarity(embedding1: List[float], embedding2: List[float]) -> float:
    """
    Compute cosine similarity between two embeddings.

    Args:
        embedding1: First embedding vector
        embedding2: Second embedding vector

    Returns:
        Cosine similarity score (0.0 to 1.0)
    """
    try:
        emb1 = np.array(embedding1, dtype=np.float32)
        emb2 = np.array(embedding2, dtype=np.float32)

        similarity = np.dot(emb1, emb2) / (
            np.linalg.norm(emb1) * np.linalg.norm(emb2) + 1e-8
        )

        return float(np.clip(similarity, 0.0, 1.0))

    except Exception as e:
        logger.error(f"[OpenCLIP] Error computing cosine similarity: {e}")
        return 0.0


def compare_embeddings(
    query_embedding: List[float],
    reference_embeddings: List[List[float]],
    reference_categories: Optional[List[str]] = None,
) -> Dict:
    """
    Compare query embedding against multiple reference embeddings.

    Args:
        query_embedding: Customer-uploaded image embedding
        reference_embeddings: List of official product reference embeddings
        reference_categories: Categories for each reference embedding

    Returns:
        Dict with per-image similarities and aggregate score
    """
    try:
        if not reference_embeddings:
            return {
                "success": False,
                "error": "No reference embeddings available",
                "per_image_similarities": [],
                "average_similarity": 0.0,
                "max_similarity": 0.0,
                "min_similarity": 0.0,
            }

        similarities = []

        for idx, ref_embedding in enumerate(reference_embeddings):
            sim = cosine_similarity(query_embedding, ref_embedding)
            category = reference_categories[idx] if reference_categories else None

            similarities.append({
                "index": idx,
                "category": category,
                "similarity": sim,
            })

        similarity_scores = [s["similarity"] for s in similarities]

        return {
            "success": True,
            "per_image_similarities": similarities,
            "average_similarity": float(np.mean(similarity_scores)),
            "max_similarity": float(np.max(similarity_scores)),
            "min_similarity": float(np.min(similarity_scores)),
            "num_comparisons": len(similarities),
        }

    except Exception as e:
        logger.error(f"[OpenCLIP] Error comparing embeddings: {e}")
        return {
            "success": False,
            "error": str(e),
            "per_image_similarities": [],
            "average_similarity": 0.0,
            "max_similarity": 0.0,
            "min_similarity": 0.0,
        }


# ────────────────────────────────────────────────────────────────────────────
# Authenticity Assessment
# ────────────────────────────────────────────────────────────────────────────


def verification_strength_label(confidence_score: float) -> str:
    """
    Customer-facing match strength from weighted similarity score.
    Not the same as risk_level (fraud risk).
    """
    if confidence_score >= 0.92:
        return "high"
    if confidence_score >= 0.80:
        return "medium"
    if confidence_score >= 0.65:
        return "low"
    return "very_low"


def assess_authenticity(
    confidence_score: float,
    custom_thresholds: Optional[Dict[str, float]] = None,
) -> Dict:
    """
    Assess authenticity based on confidence score.

    Args:
        confidence_score: Similarity score (0.0 to 1.0)
        custom_thresholds: Optional custom threshold dict

    Returns:
        Dict with status, risk level, and explanation
    """
    thresholds = custom_thresholds or AUTHENTICITY_THRESHOLDS

    highly = thresholds.get("highly_authentic", 0.92)
    likely = thresholds.get("likely_authentic", 0.80)
    review = thresholds.get("needs_review", thresholds.get("suspicious", 0.65))

    if confidence_score >= highly:
        status = "authentic"
        risk_level = "low"
        explanation = "Product images closely match official reference views."
    elif confidence_score >= likely:
        status = "likely_authentic"
        risk_level = "low"
        explanation = "Product images likely match official reference views."
    elif confidence_score >= review:
        status = "needs_review"
        risk_level = "medium"
        explanation = "Product images show partial similarity. Manual review recommended."
    else:
        status = "suspicious"
        risk_level = "high"
        explanation = "Product images do not align with official references. Exercise caution."

    return {
        "status": status,
        "risk_level": risk_level,
        "verification_strength": verification_strength_label(confidence_score),
        "explanation": explanation,
        "confidence_score": confidence_score,
    }


# ────────────────────────────────────────────────────────────────────────────
# Batch Processing
# ────────────────────────────────────────────────────────────────────────────

def generate_embeddings_batch(
    image_sources: List[Tuple[str, str]],
) -> List[Dict]:
    """
    Generate embeddings for multiple images.

    This is a SYNCHRONOUS function — run in executor from async context.

    Args:
        image_sources: List of (path_or_bytes, source_type) tuples
                      source_type: "path" or "bytes"

    Returns:
        List of embedding results
    """
    results = []

    for source, source_type in image_sources:
        try:
            if source_type == "path":
                result = generate_embedding_from_path(source)
            elif source_type == "bytes":
                result = generate_embedding_from_bytes(source)
            else:
                result = {
                    "embedding": None,
                    "success": False,
                    "error": f"Unknown source type: {source_type}",
                }
            results.append(result)
        except Exception as e:
            logger.error(f"[OpenCLIP] Batch processing error for {source}: {e}")
            results.append({
                "embedding": None,
                "success": False,
                "error": str(e),
            })

    return results


# ────────────────────────────────────────────────────────────────────────────
# Health Check
# ────────────────────────────────────────────────────────────────────────────

def health_check() -> Dict:
    """
    Check OpenCLIP service status WITHOUT triggering model load.
    Returns 'not_loaded' if the model hasn't been requested yet (normal on cold start).
    """
    singleton = get_model_singleton()

    if singleton._load_failed:
        return {
            "status": "error",
            "message": singleton._load_error or "Model failed to load",
            "model": MODEL_NAME,
            "loaded": False,
        }

    if not singleton._loaded:
        return {
            "status": "not_loaded",
            "message": "Model not yet loaded — will load on first verification request",
            "model": MODEL_NAME,
            "pretrained": PRETRAINED_DATASET,
            "loaded": False,
        }

    return {
        "status": "healthy",
        "model": MODEL_NAME,
        "pretrained": getattr(singleton, "_pretrained_used", None) or PRETRAINED_DATASET,
        "device": str(singleton.get_device()),
        "embedding_dim": EMBEDDING_DIM,
        "loaded": True,
    }
