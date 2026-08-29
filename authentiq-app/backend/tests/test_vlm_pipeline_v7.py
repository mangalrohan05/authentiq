"""
Unit tests for the v7 VLM-primary decision layer and the Qwen2.5-VL service
output handling. These run WITHOUT torch, a GPU, a live VLM, or a network — they
validate the decision logic and JSON handling in isolation.

Run:  pytest tests/test_vlm_pipeline_v7.py -q
"""

from __future__ import annotations

from app.services import vlm_config as cfg
from app.services import vlm_decision
from app.services.qwen_vl_service import (
    _normalize_result,
    _parse_model_json,
    _build_metadata_block,
)

THRESHOLDS = {
    "highly_authentic": 0.90,
    "likely_authentic": 0.80,
    "needs_review": 0.65,
    "suspicious": 0.0,
}


def _vlm(**kw):
    base = {
        "available": True,
        "verdict": "authentic",
        "authenticity_probability": 0.92,
        "attribute_checks": {},
        "defects": [],
        "metadata_consistency": [],
        "explanation": "",
    }
    base.update(kw)
    return base


# ── Core requirement: minor counterfeit must NOT score high ──────────────────
def test_critical_defect_vetoes_high_visual_similarity():
    """A near-identical look-alike (prob 0.9) with ONE critical defect (missing
    hologram) must be vetoed below the authentic band. This is the whole point."""
    vlm = _vlm(
        verdict="suspicious",
        authenticity_probability=0.90,
        defects=[{"attribute": "security_features", "view": "label",
                  "description": "hologram missing", "severity": "critical"}],
    )
    d = vlm_decision.decide_from_vlm(vlm, THRESHOLDS)
    assert d["veto_applied"] is True
    assert d["final_score"] <= cfg.VLM_CRITICAL_VETO_CAP
    assert d["status"] in ("suspicious",)


def test_security_attribute_mismatch_is_critical():
    vlm = _vlm(verdict="authentic", authenticity_probability=0.95,
               attribute_checks={"logo": "mismatch", "colors": "match"})
    d = vlm_decision.decide_from_vlm(vlm, THRESHOLDS)
    assert d["veto_applied"] is True
    assert d["final_score"] <= cfg.VLM_CRITICAL_VETO_CAP


def test_identity_metadata_mismatch_vetoes():
    vlm = _vlm(
        verdict="authentic", authenticity_probability=0.93,
        metadata_consistency=[
            {"field": "brand", "printed_value": "Acmee", "expected_value": "Acme", "match": False},
        ],
    )
    d = vlm_decision.decide_from_vlm(vlm, THRESHOLDS)
    assert d["veto_applied"] is True
    assert "brand" in d["metadata_mismatches"]
    assert d["final_score"] <= cfg.VLM_CRITICAL_VETO_CAP


def test_noncritical_metadata_mismatch_does_not_veto():
    # MRP mismatch is a 'major' concern but not an identity veto by itself.
    vlm = _vlm(
        verdict="suspicious", authenticity_probability=0.85,
        defects=[{"attribute": "batch_serial", "view": "label",
                  "description": "MRP differs", "severity": "major"}],
        metadata_consistency=[
            {"field": "mrp", "printed_value": "120", "expected_value": "99", "match": False},
        ],
    )
    d = vlm_decision.decide_from_vlm(vlm, THRESHOLDS)
    assert d["veto_applied"] is False
    # one major defect erodes but does not floor the score
    assert d["final_score"] < 0.85


def test_clean_authentic_stays_high():
    vlm = _vlm(verdict="authentic", authenticity_probability=0.94, defects=[])
    d = vlm_decision.decide_from_vlm(vlm, THRESHOLDS)
    assert d["veto_applied"] is False
    assert d["status"] in ("authentic", "likely_authentic")
    assert d["final_score"] >= 0.80


def test_minor_defects_are_tolerated():
    vlm = _vlm(verdict="authentic", authenticity_probability=0.93,
               defects=[{"attribute": "print_quality", "view": "front",
                         "description": "slight blur", "severity": "minor"}])
    d = vlm_decision.decide_from_vlm(vlm, THRESHOLDS)
    assert d["veto_applied"] is False
    assert d["final_score"] >= 0.80  # a single minor blemish shouldn't sink it


def test_counterfeit_verdict_capped():
    vlm = _vlm(verdict="counterfeit", authenticity_probability=0.55, defects=[])
    d = vlm_decision.decide_from_vlm(vlm, THRESHOLDS)
    assert d["final_score"] <= cfg.VLM_COUNTERFEIT_VERDICT_CAP


# ── Fail-closed / pre-filter behaviour ───────────────────────────────────────
def test_unavailable_fails_closed_to_review(monkeypatch):
    monkeypatch.setattr(cfg, "VLM_FAIL_MODE", "closed")
    d = vlm_decision.decide_unavailable("vlm_no_response", clip_sim=0.95)
    assert d["status"] == "needs_review"      # NEVER 'authentic' on similarity alone
    assert d["verdict_source"] == "fail_closed"


def test_gross_mismatch_is_suspicious():
    d = vlm_decision.decide_gross_mismatch(0.12)
    assert d["status"] == "suspicious"
    assert d["final_score"] <= cfg.CLIP_GROSS_MISMATCH_MIN


# ── Identity short-circuit ───────────────────────────────────────────────────
# Numbers below are taken from a REAL observed scan: the 'label' slot was
# byte-identical to its reference (CLIP 1.0 / RANSAC 1.0 / SSIM 0.999) yet the
# VLM still invented a "the ® is missing" defect and the unit failed. The fast
# path exists to stop the VLM overriding proof.
def _identical_slot():
    return {
        "global_similarity": 1.0,
        "feature_match_result": {
            "success": True, "ransac_score": 1.0, "match_ratio": 1.0,
            "inliers": 2500, "outliers": 0,
        },
        "region_pixel_scores": {
            "logo": {"ssim": 0.999}, "label": {"ssim": 0.9993},
            "serial": {"ssim": 0.9993}, "hologram": {"ssim": 0.9984},
            "qr": {"ssim": 0.9979},
        },
    }


def _different_slot():
    return {
        "global_similarity": 0.4762,
        "feature_match_result": {
            "success": True, "ransac_score": 0.3893, "match_ratio": 0.0524,
            "inliers": 51, "outliers": 80,
        },
        "region_pixel_scores": {
            "logo": {"ssim": 0.3023}, "label": {"ssim": 0.1463},
            "qr": {"ssim": 0.0009},
        },
    }


def test_identity_shortcircuit_fires_when_all_slots_identical():
    from app.services.verification_matching import _identity_matched_slots
    slots = _identity_matched_slots({
        "front": _identical_slot(), "back": _identical_slot(), "label": _identical_slot(),
    })
    assert slots is not None
    assert sorted(slots) == ["back", "front", "label"]


def test_identity_shortcircuit_refuses_partial_match():
    """SECURITY: a genuine front + counterfeit back must NOT take the fast path."""
    from app.services.verification_matching import _identity_matched_slots
    assert _identity_matched_slots({
        "front": _identical_slot(),
        "back": _different_slot(),      # not identical → VLM must still adjudicate
        "label": _identical_slot(),
    }) is None


def test_identity_shortcircuit_needs_minimum_slots():
    """A single identical slot is not enough evidence on its own."""
    from app.services.verification_matching import _identity_matched_slots
    assert cfg.IDENTITY_MIN_SLOTS >= 2
    assert _identity_matched_slots({"label": _identical_slot()}) is None


def test_identity_shortcircuit_requires_pixel_evidence():
    """No SSIM data → cannot claim identity, even with perfect CLIP and RANSAC."""
    from app.services.verification_matching import _identity_matched_slots
    a, b = _identical_slot(), _identical_slot()
    a["region_pixel_scores"] = {}
    b["region_pixel_scores"] = {}
    assert _identity_matched_slots({"front": a, "back": b}) is None


def test_identity_shortcircuit_one_tampered_region_vetoes_slot():
    """SSIM is checked with min(), so a single altered region sinks the slot."""
    from app.services.verification_matching import _identity_matched_slots
    tampered = _identical_slot()
    tampered["region_pixel_scores"]["hologram"] = {"ssim": 0.41}
    assert _identity_matched_slots({"front": _identical_slot(), "back": tampered}) is None


def test_identity_match_decision_is_authentic():
    d = vlm_decision.decide_identity_match(1.0, ["front", "back", "label"])
    assert d["status"] == "authentic"
    assert d["veto_applied"] is False
    assert d["verdict_source"] == "identity_match"
    assert d["final_score"] >= THRESHOLDS["highly_authentic"]


# ── VLM service output handling ──────────────────────────────────────────────
def test_parse_model_json_handles_fences():
    fenced = "```json\n{\"verdict\": \"authentic\", \"authenticity_probability\": 0.8}\n```"
    parsed = _parse_model_json(fenced)
    assert parsed and parsed["verdict"] == "authentic"


def test_parse_model_json_handles_prose_wrapping():
    messy = 'Here is my answer: {"verdict":"counterfeit","authenticity_probability":0.1} done'
    parsed = _parse_model_json(messy)
    assert parsed and parsed["verdict"] == "counterfeit"


def test_normalize_clamps_and_sanitizes():
    raw = {
        "authenticity_probability": 1.7,         # out of range -> clamp to 1.0
        "verdict": "AUTHENTIC",                    # case-insensitive
        "attribute_checks": {"logo": "MATCH"},
        "defects": [{"attribute": "logo", "severity": "catastrophic"}],  # bad severity -> minor
        "metadata_consistency": [{"field": "brand", "match": "false"}],  # string -> bool
    }
    norm = _normalize_result(raw, method="api")
    assert norm["authenticity_probability"] == 1.0
    assert norm["verdict"] == "authentic"
    assert norm["defects"][0]["severity"] == "minor"
    assert norm["metadata_consistency"][0]["match"] is False


def test_metadata_block_includes_registered_fields():
    block = _build_metadata_block({
        "name": "Widget", "brand": "Acme", "mrp": 99, "manufacturer_name": "Acme Corp",
        "country_of_origin": "India", "sku": "WX-1",
    })
    assert "Widget" in block and "Acme" in block and "WX-1" in block
    assert "India" in block


if __name__ == "__main__":
    import sys
    import types

    # tiny monkeypatch shim so the file also runs without pytest
    class _MP:
        def setattr(self, obj, name, val):
            setattr(obj, name, val)

    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and isinstance(v, types.FunctionType)]
    failed = 0
    for fn in fns:
        try:
            fn(_MP()) if fn.__code__.co_argcount else fn()
            print(f"PASS {fn.__name__}")
        except Exception as exc:  # noqa
            failed += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
