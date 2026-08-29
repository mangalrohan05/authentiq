"""
Central configuration for the VLM-primary authentication pipeline (v7).

The verification pipeline was migrated from a hard-coded weighted-average
ensemble (which was structurally blind to *minor* counterfeits — a wrong logo
glyph or a missing hologram barely moves an average of global similarity
signals) to a **Vision-Language-Model-as-adjudicator** design:

    CLIP  -> cheap retrieval + gross-mismatch pre-filter only
    VLM   -> the authenticity decision, using full product metadata + every
             reference view (front / back / label / hologram / seal / ...)

This module holds every tunable for that design. Defaults target a
**self-hosted Qwen2.5-VL** server exposed through an OpenAI-compatible API
(vLLM `vllm serve Qwen/Qwen2.5-VL-7B-Instruct`, or Ollama). Nothing here sends
data off-premise unless you point AUTHENTIQ_VLM_API_URL at a remote endpoint.

Fail-closed by design: if the VLM is unreachable, the pipeline returns
`needs_review` — it never silently "passes" a product on visual similarity
alone (the old mock-fallback behaviour that boosted look-alike counterfeits).
"""

from __future__ import annotations

import os
from typing import Any, Dict


def _env_bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


# ── Master switch ───────────────────────────────────────────────────────────
# When enabled, the VLM verdict is authoritative. When disabled, the pipeline
# falls back to CLIP-retrieval similarity ONLY as a coarse signal and always
# routes to needs_review at best (never "authentic") — see vlm_decision.
VLM_ENABLED: bool = _env_bool("AUTHENTIQ_VLM_ENABLED", True)

# ── Endpoint (OpenAI-compatible /v1/chat/completions) ────────────────────────
# vLLM example:  http://localhost:8000/v1/chat/completions
# Ollama example: http://localhost:11434/v1/chat/completions
VLM_API_URL: str = os.getenv("AUTHENTIQ_VLM_API_URL", os.getenv("AUTHENTIQ_QWENVL_API_URL", ""))
VLM_API_KEY: str = os.getenv("AUTHENTIQ_VLM_API_KEY", os.getenv("AUTHENTIQ_QWENVL_API_KEY", ""))
VLM_MODEL: str = os.getenv("AUTHENTIQ_VLM_MODEL", os.getenv("AUTHENTIQ_QWENVL_MODEL", "Qwen/Qwen2.5-VL-7B-Instruct"))

# ── Request behaviour ────────────────────────────────────────────────────────
VLM_TIMEOUT_S: float = _env_float("AUTHENTIQ_VLM_TIMEOUT", 90.0)
VLM_MAX_RETRIES: int = _env_int("AUTHENTIQ_VLM_MAX_RETRIES", 2)
VLM_RETRY_BACKOFF_S: float = _env_float("AUTHENTIQ_VLM_RETRY_BACKOFF", 1.5)
VLM_MAX_TOKENS: int = _env_int("AUTHENTIQ_VLM_MAX_TOKENS", 1536)
VLM_TEMPERATURE: float = _env_float("AUTHENTIQ_VLM_TEMPERATURE", 0.1)

# ── Image payload control (keeps latency / VRAM bounded) ─────────────────────
# Long-side pixel cap applied before base64 encoding. Qwen2.5-VL handles high
# resolution natively; 1024 keeps fine print legible while bounding tokens.
VLM_IMAGE_MAX_DIM: int = _env_int("AUTHENTIQ_VLM_IMAGE_MAX_DIM", 1024)
VLM_JPEG_QUALITY: int = _env_int("AUTHENTIQ_VLM_JPEG_QUALITY", 90)
# Hard cap on total images sent in one request. IMPORTANT: your VLM server must
# permit at least this many images per prompt — for vLLM start it with
#   --limit-mm-per-prompt image=<AUTHENTIQ_VLM_MAX_IMAGES>
VLM_MAX_IMAGES: int = _env_int("AUTHENTIQ_VLM_MAX_IMAGES", 12)
# Max reference images to attach per view type (best CLIP match first).
VLM_MAX_REFS_PER_VIEW: int = _env_int("AUTHENTIQ_VLM_MAX_REFS_PER_VIEW", 1)

# ── High-resolution security-region crops (audit 1.4) ────────────────────────
# Downscaling the whole image to VLM_IMAGE_MAX_DIM destroys the fine detail that
# actually distinguishes a counterfeit — micro-print, hologram texture, the ®
# glyph, batch/QR print quality. In ADDITION to the full images, we attach
# high-resolution crops of detected security regions (logo/hologram/qr/barcode/
# serial/label) so the model can inspect those details at real resolution. This
# is the highest-ROI zero-shot accuracy gain in the audit.
VLM_REGION_CROPS_ENABLED: bool = _env_bool("AUTHENTIQ_VLM_REGION_CROPS", True)
# Long-side cap for an individual region crop. A crop covers a small area, so
# even at 768 the effective resolution of that region is far higher than the
# same region inside a 1024px full image.
VLM_CROP_MAX_DIM: int = _env_int("AUTHENTIQ_VLM_CROP_MAX_DIM", 768)
# Max crops attached per customer image (kept small to bound prompt size / VRAM).
VLM_MAX_CROPS_PER_IMAGE: int = _env_int("AUTHENTIQ_VLM_MAX_CROPS_PER_IMAGE", 3)

# ── Self-consistency voting (audit 1.5) ──────────────────────────────────────
# A single VLM pass has high variance — the same image can flip verdict run to
# run. Run the judgement N times and aggregate: median probability, and keep only
# the defects / metadata-mismatches a MAJORITY of runs agree on. This yields
# stable, reproducible decisions and won't let one flaky run pass a fake or fail
# a genuine. N=1 disables voting (single pass — original behaviour).
VLM_SELF_CONSISTENCY_N: int = _env_int("AUTHENTIQ_VLM_SELF_CONSISTENCY_N", 3)
# Slightly higher temperature than the single-pass default so the runs have
# something to disagree on (near-deterministic votes would add little).
VLM_SELF_CONSISTENCY_TEMPERATURE: float = _env_float(
    "AUTHENTIQ_VLM_SELF_CONSISTENCY_TEMPERATURE", 0.4
)
# Max concurrent VLM calls while voting (client-side; the server may serialise).
VLM_SELF_CONSISTENCY_MAX_PARALLEL: int = _env_int(
    "AUTHENTIQ_VLM_SELF_CONSISTENCY_MAX_PARALLEL", 3
)

# ── Model keep-warm (fixes the ~70s cold-start) ──────────────────────────────
# A local Ollama VLM unloads the multi-GB model after idle, so the FIRST scan
# after a pause pays a ~70s cold reload — enough to blow past the request timeout
# and surface as a 500. Keep it pinned in memory: warm on startup and re-pin on an
# interval shorter than the unload timer. Ollama-only (vLLM/Triton keep the model
# resident already); the runtime is detected from AUTHENTIQ_VLM_API_URL.
# keep_alive=-1 means "keep loaded forever".
VLM_KEEP_WARM_ENABLED: bool = _env_bool("AUTHENTIQ_VLM_KEEP_WARM", True)
VLM_KEEP_WARM_INTERVAL_S: int = _env_int("AUTHENTIQ_VLM_KEEP_WARM_INTERVAL", 120)
VLM_KEEP_ALIVE: str = os.getenv("AUTHENTIQ_VLM_KEEP_ALIVE", "-1")

# ── Fail / dev policy ────────────────────────────────────────────────────────
# "closed"  -> VLM unavailable => needs_review (safe default, never auto-pass).
# "open"    -> VLM unavailable => fall through to CLIP similarity band
#              (still capped below "authentic"; use only in dev).
VLM_FAIL_MODE: str = os.getenv("AUTHENTIQ_VLM_FAIL_MODE", "closed").strip().lower()
# Explicit, non-production dev stub. Returns a NEUTRAL needs_review-style result
# (never a similarity-based "authentic" boost). Must be turned on deliberately.
VLM_DEV_MOCK: bool = _env_bool("AUTHENTIQ_VLM_DEV_MOCK", False)

# ── Gross-mismatch pre-filter (CLIP) ─────────────────────────────────────────
# If the best CLIP retrieval similarity across all slots is below this, the
# upload is a clearly different product — short-circuit to suspicious and skip
# the (expensive) VLM call entirely.
CLIP_GROSS_MISMATCH_MIN: float = _env_float("AUTHENTIQ_CLIP_GROSS_MISMATCH_MIN", 0.35)

# ── Identity short-circuit (mirror image of the gross-mismatch pre-filter) ────
# When the customer upload is *pixel-identical* to the registered reference for
# EVERY scored slot — CLIP ≈ 1, ORB/RANSAC ≈ 1, and per-region SSIM ≈ 1 — the
# deterministic signals have already proven this is the same artwork. Running a
# 7B VLM over it adds nothing but a chance to hallucinate a defect (observed:
# "the ® is missing", invented on a byte-identical image), so we short-circuit
# to authentic and skip the VLM entirely.
#
# SECURITY NOTE: a real customer photographing their physical unit will never
# produce a byte-identical match to the brand's own reference file — so this
# firing in production means someone submitted the reference image itself
# (a replay), not a genuine photo. Keep this ON for vendor testing; consider
# turning it OFF (or pairing it with pHash replay detection) in production.
IDENTITY_SHORTCIRCUIT_ENABLED: bool = _env_bool("AUTHENTIQ_IDENTITY_SHORTCIRCUIT", True)
# Every threshold below must be met, on every scored slot, for the fast path.
IDENTITY_MIN_GLOBAL: float = _env_float("AUTHENTIQ_IDENTITY_MIN_GLOBAL", 0.99)
IDENTITY_MIN_RANSAC: float = _env_float("AUTHENTIQ_IDENTITY_MIN_RANSAC", 0.99)
IDENTITY_MIN_SSIM: float = _env_float("AUTHENTIQ_IDENTITY_MIN_SSIM", 0.99)
# Guard against a single-slot upload trivially passing: require at least this
# many independently-verified slots before trusting the fast path.
IDENTITY_MIN_SLOTS: int = _env_int("AUTHENTIQ_IDENTITY_MIN_SLOTS", 2)
# Score awarded on the fast path (must land in the 'authentic' band).
IDENTITY_SCORE: float = _env_float("AUTHENTIQ_IDENTITY_SCORE", 0.98)

# ── Decision layer (see vlm_decision.py) ─────────────────────────────────────
# A single CRITICAL defect (missing/altered security feature, swapped logo,
# identity-metadata mismatch) vetoes the score to at most this value, no matter
# how visually similar the rest of the product is. This is the core fix for
# "minor counterfeit still scored high".
VLM_CRITICAL_VETO_CAP: float = _env_float("AUTHENTIQ_VLM_CRITICAL_VETO_CAP", 0.30)
VLM_COUNTERFEIT_VERDICT_CAP: float = _env_float("AUTHENTIQ_VLM_COUNTERFEIT_CAP", 0.30)
# Per-defect penalties subtracted from the VLM's authenticity probability.
VLM_MAJOR_DEFECT_PENALTY: float = _env_float("AUTHENTIQ_VLM_MAJOR_PENALTY", 0.18)
VLM_MINOR_DEFECT_PENALTY: float = _env_float("AUTHENTIQ_VLM_MINOR_PENALTY", 0.06)
VLM_MAJOR_PENALTY_CAP: float = _env_float("AUTHENTIQ_VLM_MAJOR_PENALTY_CAP", 0.45)
VLM_MINOR_PENALTY_CAP: float = _env_float("AUTHENTIQ_VLM_MINOR_PENALTY_CAP", 0.20)

# Product metadata fields whose mismatch is treated as an identity (critical)
# failure — a genuine unit cannot have a different brand/manufacturer/barcode.
CRITICAL_METADATA_FIELDS = frozenset(
    {
        "name",
        "brand",
        "brand_name",
        "manufacturer_name",
        "manufacturer",
        "barcode",
        "sku",
        "serial_number",
    }
)

# Attribute checks the VLM is asked to perform. "security" attributes are the
# ones whose failure is auto-critical (they are the hardest for counterfeiters
# to reproduce and the whole point of anti-counterfeit verification).
VLM_ATTRIBUTES = (
    "logo",
    "brand_text",
    "label_text",
    "fonts",
    "colors",
    "security_features",  # hologram / seal / watermark / microprint
    "barcode_qr",
    "batch_serial",
    "packaging",
    "shape",
    "print_quality",
)
SECURITY_ATTRIBUTES = frozenset({"security_features", "logo", "barcode_qr"})


def vlm_config_snapshot() -> Dict[str, Any]:
    """Non-secret view of the active VLM configuration (for debug payloads)."""
    return {
        "enabled": VLM_ENABLED,
        "endpoint_configured": bool(VLM_API_URL),
        "model": VLM_MODEL,
        "timeout_s": VLM_TIMEOUT_S,
        "max_retries": VLM_MAX_RETRIES,
        "max_images": VLM_MAX_IMAGES,
        "max_refs_per_view": VLM_MAX_REFS_PER_VIEW,
        "image_max_dim": VLM_IMAGE_MAX_DIM,
        "fail_mode": VLM_FAIL_MODE,
        "dev_mock": VLM_DEV_MOCK,
        "clip_gross_mismatch_min": CLIP_GROSS_MISMATCH_MIN,
        "identity_shortcircuit": {
            "enabled": IDENTITY_SHORTCIRCUIT_ENABLED,
            "min_global": IDENTITY_MIN_GLOBAL,
            "min_ransac": IDENTITY_MIN_RANSAC,
            "min_ssim": IDENTITY_MIN_SSIM,
            "min_slots": IDENTITY_MIN_SLOTS,
        },
        "critical_veto_cap": VLM_CRITICAL_VETO_CAP,
        "major_defect_penalty": VLM_MAJOR_DEFECT_PENALTY,
        "minor_defect_penalty": VLM_MINOR_DEFECT_PENALTY,
    }
