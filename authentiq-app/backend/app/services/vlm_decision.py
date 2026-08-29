"""
VLM decision layer (v7) — turns the VLM's structured judgement into the final
authenticity score + verdict, replacing the old weighted-average ensemble and
its optimistic score floors.

Core principle (the fix for "minor counterfeits still score high"):
    the score is NOT an average. A single CRITICAL defect — a missing/altered
    security feature, a wrong logo/brand mark, a bad barcode, or an identity
    metadata mismatch — VETOES the score down to `VLM_CRITICAL_VETO_CAP`, no
    matter how visually similar the rest of the product is.

Also handles the two non-VLM outcomes:
    * gross-mismatch  -> clearly a different product (CLIP pre-filter)  => suspicious
    * VLM unavailable -> fail closed                                    => needs_review
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.services import vlm_config as cfg
from app.services.calibration_layer import calibrator

logger = logging.getLogger(__name__)


def _band_status(score: float, thresholds: Dict[str, float]) -> str:
    highly = thresholds.get("highly_authentic", 0.90)
    likely = thresholds.get("likely_authentic", 0.80)
    review = thresholds.get("needs_review", 0.65)
    if score >= highly:
        return "authentic"
    if score >= likely:
        return "likely_authentic"
    if score >= review:
        return "needs_review"
    return "suspicious"


def _risk_for_status(status: str) -> str:
    return {
        "authentic": "low",
        "likely_authentic": "low",
        "needs_review": "medium",
        "suspicious": "high",
        "counterfeit": "high",
    }.get(status, "medium")


def _base_from_verdict(verdict: str) -> float:
    return {
        "authentic": 0.88,
        "suspicious": 0.45,
        "counterfeit": 0.10,
        "unknown": 0.50,
    }.get(verdict, 0.50)


def _summarize(defects: List[Dict[str, Any]], meta_mismatches: List[str], limit: int = 4) -> str:
    parts: List[str] = []
    crit = [d for d in defects if d["severity"] == "critical"]
    major = [d for d in defects if d["severity"] == "major"]
    for d in (crit + major)[:limit]:
        where = f" ({d['view']})" if d.get("view") else ""
        parts.append(f"{d['severity'].upper()}: {d['attribute']}{where} — {d['description']}".strip())
    if meta_mismatches:
        parts.append("Metadata mismatch on: " + ", ".join(sorted(set(meta_mismatches))))
    return " | ".join(parts)


def _critical_metadata_mismatches(vlm: Dict[str, Any]) -> List[str]:
    fields: List[str] = []
    for m in vlm.get("metadata_consistency") or []:
        field = str(m.get("field", "")).strip().lower().replace(" ", "_")
        if m.get("match") is False and field in cfg.CRITICAL_METADATA_FIELDS:
            fields.append(field)
    return fields


def _security_attribute_failures(vlm: Dict[str, Any]) -> List[str]:
    failures: List[str] = []
    checks = vlm.get("attribute_checks") or {}
    for attr in cfg.SECURITY_ATTRIBUTES:
        if str(checks.get(attr, "")).strip().lower() == "mismatch":
            failures.append(attr)
    return failures


def decide_from_vlm(
    vlm: Dict[str, Any],
    thresholds: Dict[str, float],
) -> Dict[str, Any]:
    """Compute the final decision from an *available* VLM result."""
    defects = vlm.get("defects") or []
    counts = {"critical": 0, "major": 0, "minor": 0}
    for d in defects:
        counts[d.get("severity", "minor")] = counts.get(d.get("severity", "minor"), 0) + 1

    meta_mismatches = _critical_metadata_mismatches(vlm)
    security_failures = _security_attribute_failures(vlm)

    base = vlm.get("authenticity_probability")
    if base is None:
        base = _base_from_verdict(vlm.get("verdict", "unknown"))

    # Per-defect penalties (bounded) — majors/minors erode the probability.
    major_pen = min(counts["major"] * cfg.VLM_MAJOR_DEFECT_PENALTY, cfg.VLM_MAJOR_PENALTY_CAP)
    minor_pen = min(counts["minor"] * cfg.VLM_MINOR_DEFECT_PENALTY, cfg.VLM_MINOR_PENALTY_CAP)
    score = max(0.0, min(1.0, float(base) - major_pen - minor_pen))

    veto_reasons: List[str] = []
    if counts["critical"] > 0:
        veto_reasons.append(f"{counts['critical']} critical defect(s)")
    if security_failures:
        veto_reasons.append("security attribute mismatch: " + ", ".join(security_failures))
    if meta_mismatches:
        veto_reasons.append("identity metadata mismatch: " + ", ".join(meta_mismatches))

    veto_applied = bool(veto_reasons)
    if veto_applied:
        score = min(score, cfg.VLM_CRITICAL_VETO_CAP)
    if vlm.get("verdict") == "counterfeit":
        score = min(score, cfg.VLM_COUNTERFEIT_VERDICT_CAP)

    # Calibration (audit 1.8): map the raw veto-adjusted score to a calibrated
    # probability BEFORE banding, so thresholds act on a calibrated probability.
    # Identity pass-through until a labelled dataset has been fitted AND
    # AUTHENTIQ_CALIBRATION_ENABLED=true, so this is a safe no-op by default.
    raw_score = score
    score = max(0.0, min(1.0, calibrator.apply(raw_score)))

    status = _band_status(score, thresholds)
    # A veto (or explicit counterfeit verdict) must never present as authentic.
    if (veto_applied or vlm.get("verdict") == "counterfeit") and status in ("authentic", "likely_authentic"):
        status = "suspicious"

    summary = _summarize(defects, meta_mismatches)
    explanation = vlm.get("explanation") or ""
    if summary:
        explanation = (explanation + "  ▸ " + summary).strip() if explanation else summary
    if not explanation:
        explanation = {
            "authentic": "VLM verified the customer images against every reference view and the registered metadata with no discrepancies.",
            "likely_authentic": "VLM found the customer images consistent with the genuine references and metadata.",
            "needs_review": "VLM found some ambiguity; manual review recommended.",
            "suspicious": "VLM flagged discrepancies inconsistent with a genuine unit.",
        }.get(status, "VLM verification complete.")

    return {
        "final_score": round(score, 6),
        "raw_score": round(raw_score, 6),
        "calibration_applied": calibrator.is_active(),
        "status": status,
        "risk_level": _risk_for_status(status),
        "explanation": explanation,
        "verdict_source": "vlm_veto" if veto_applied else "vlm",
        "veto_applied": veto_applied,
        "veto_reasons": veto_reasons,
        "defect_counts": counts,
        "metadata_mismatches": meta_mismatches,
        "security_failures": security_failures,
        "vlm_verdict": vlm.get("verdict"),
        "vlm_probability": vlm.get("authenticity_probability"),
    }


def decide_identity_match(clip_sim: float, slots: List[str]) -> Dict[str, Any]:
    """Customer upload is pixel-identical to the registered references.

    The deterministic signals (CLIP ≈ 1, ORB/RANSAC ≈ 1, per-region SSIM ≈ 1) have
    already established this is the same artwork on every scored slot, so the VLM
    is not consulted — it can only add noise (it has been observed inventing a
    "missing ®" defect on a byte-identical image).
    """
    slot_list = ", ".join(sorted(slots)) if slots else "all"
    return {
        "final_score": round(float(cfg.IDENTITY_SCORE), 6),
        "status": "authentic",
        "risk_level": "low",
        "explanation": (
            "The uploaded images are an exact match to this product's registered "
            f"reference images on every checked view ({slot_list}) — verified by "
            "visual embedding, feature-geometry and pixel-level structural "
            "comparison."
        ),
        "verdict_source": "identity_match",
        "veto_applied": False,
        "veto_reasons": [],
        "defect_counts": {"critical": 0, "major": 0, "minor": 0},
        "metadata_mismatches": [],
        "security_failures": [],
        "vlm_verdict": None,
        "vlm_probability": None,
        "identity_match_slots": sorted(slots),
    }


def decide_gross_mismatch(clip_sim: float) -> Dict[str, Any]:
    """CLIP pre-filter says this is clearly a different product; skip the VLM."""
    return {
        "final_score": round(max(0.0, min(cfg.CLIP_GROSS_MISMATCH_MIN, float(clip_sim))), 6),
        "status": "suspicious",
        "risk_level": "high",
        "explanation": (
            "The uploaded images do not match this product's reference views at all "
            f"(best visual similarity {clip_sim:.2f}). Likely a different or wrong product."
        ),
        "verdict_source": "clip_gross_mismatch",
        "veto_applied": True,
        "veto_reasons": ["clip_gross_mismatch"],
        "defect_counts": {"critical": 0, "major": 0, "minor": 0},
        "metadata_mismatches": [],
        "security_failures": [],
        "vlm_verdict": None,
        "vlm_probability": None,
    }


def decide_unavailable(reason: str, clip_sim: Optional[float] = None) -> Dict[str, Any]:
    """VLM could not run. Fail closed (needs_review) unless dev-configured open."""
    if cfg.VLM_FAIL_MODE == "open" and clip_sim is not None:
        # Dev-only: use CLIP similarity but CAP below 'authentic' so a look-alike
        # can never auto-pass without the VLM having actually verified it.
        score = min(float(clip_sim), 0.79)
        status = "needs_review" if score >= 0.65 else "suspicious"
        return {
            "final_score": round(score, 6),
            "status": status,
            "risk_level": _risk_for_status(status),
            "explanation": (
                "VLM verifier unavailable — provisional result from visual similarity only "
                f"({reason}). Capped below 'authentic'; enable the VLM for a real decision."
            ),
            "verdict_source": "fail_open_clip",
            "veto_applied": False,
            "veto_reasons": [reason],
            "defect_counts": {"critical": 0, "major": 0, "minor": 0},
            "metadata_mismatches": [],
            "security_failures": [],
            "vlm_verdict": None,
            "vlm_probability": None,
        }

    # Fail closed.
    return {
        "final_score": 0.50,
        "status": "needs_review",
        "risk_level": "medium",
        "explanation": (
            "The AI authenticity verifier could not be reached, so this unit was not "
            f"confirmed and is routed for manual review ({reason})."
        ),
        "verdict_source": "fail_closed",
        "veto_applied": False,
        "veto_reasons": [reason],
        "defect_counts": {"critical": 0, "major": 0, "minor": 0},
        "metadata_mismatches": [],
        "security_failures": [],
        "vlm_verdict": None,
        "vlm_probability": None,
    }
