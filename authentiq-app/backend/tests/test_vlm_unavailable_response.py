"""VLM-unavailable is surfaced as an error, not a fake verdict.

The scan route returns HTTP 503 when `verdict_source == "fail_closed"` so the
consumer is never shown a placeholder 50% / "manual review" result the AI never
produced. These tests lock in the discriminator that route logic keys on:
  * a VLM-unavailable decision IS `fail_closed`,
  * a genuine (VLM-ran) `needs_review` is NOT `fail_closed` and must still render.
Pure-logic: no endpoint/DB/model needed.
"""

from __future__ import annotations

from app.services import vlm_config, vlm_decision

THRESHOLDS = {"highly_authentic": 0.90, "likely_authentic": 0.80, "needs_review": 0.65}


def test_vlm_unavailable_is_fail_closed():
    dec = vlm_decision.decide_unavailable("vlm_no_response")
    # Default production posture is fail-closed; only then do we 503.
    if vlm_config.VLM_FAIL_MODE == "closed":
        assert dec["verdict_source"] == "fail_closed"
        assert dec["status"] == "needs_review"
        assert dec["final_score"] == 0.50


def test_genuine_needs_review_is_not_fail_closed():
    # VLM ran and was uncertain (0.70 → needs_review band) with no veto → a REAL
    # verdict that must still be shown, not converted to a 503.
    vlm = {
        "available": True,
        "verdict": "suspicious",
        "authenticity_probability": 0.70,
        "defects": [],
        "attribute_checks": {},
        "metadata_consistency": [],
    }
    dec = vlm_decision.decide_from_vlm(vlm, THRESHOLDS)
    assert dec["status"] == "needs_review"
    assert dec["verdict_source"] != "fail_closed"


def test_counterfeit_verdict_is_not_fail_closed():
    vlm = {
        "available": True,
        "verdict": "counterfeit",
        "authenticity_probability": 0.10,
        "defects": [{"attribute": "logo", "severity": "critical", "description": "wrong", "view": "front"}],
        "attribute_checks": {},
        "metadata_consistency": [],
    }
    dec = vlm_decision.decide_from_vlm(vlm, THRESHOLDS)
    assert dec["verdict_source"] != "fail_closed"  # a real (bad) verdict — still shown
