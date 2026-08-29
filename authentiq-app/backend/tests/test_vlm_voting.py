"""Self-consistency voting aggregation + orchestration (audit item 1.5).

Pure-logic + a mocked VLM call — no network or model.
"""

from __future__ import annotations

from app.services import qwen_vl_service as qv
from app.services import vlm_config as cfg


def _norm(verdict, prob, defects=None, checks=None, meta=None):
    return {
        "available": True,
        "method": "api",
        "verdict": verdict,
        "authenticity_probability": prob,
        "attribute_checks": checks or {},
        "defects": defects or [],
        "metadata_consistency": meta or [],
        "explanation": "",
        "raw": {},
        "error": None,
    }


def test_median_probability_and_majority_verdict():
    runs = [_norm("authentic", 0.90), _norm("counterfeit", 0.20), _norm("authentic", 0.85)]
    agg = qv._aggregate_votes(runs, 3)
    assert agg["authenticity_probability"] == 0.85     # median of 0.20/0.85/0.90
    assert agg["verdict"] == "authentic"               # 2 of 3
    assert agg["vote_count"] == 3


def test_tie_breaks_to_more_suspicious():
    runs = [_norm("authentic", 0.8), _norm("counterfeit", 0.3)]
    agg = qv._aggregate_votes(runs, 2)
    assert agg["verdict"] == "counterfeit"             # 1–1 tie → conservative


def test_minority_defect_is_dropped_majority_kept():
    crit = {"attribute": "logo", "view": "front", "description": "wrong glyph", "severity": "critical"}
    # Present in only 1 of 3 runs → below majority threshold (2) → dropped.
    runs = [_norm("authentic", 0.9, defects=[crit]), _norm("authentic", 0.88), _norm("authentic", 0.91)]
    assert qv._aggregate_votes(runs, 3)["defects"] == []

    # Present in 2 of 3 runs → kept, so the downstream veto can fire.
    runs2 = [_norm("suspicious", 0.5, defects=[crit]), _norm("suspicious", 0.4, defects=[crit]), _norm("authentic", 0.9)]
    kept = qv._aggregate_votes(runs2, 3)["defects"]
    assert len(kept) == 1 and kept[0]["severity"] == "critical"


def test_metadata_mismatch_needs_majority():
    m = {"field": "brand", "printed_value": "Acme", "expected_value": "ACME", "match": False}
    runs = [_norm("suspicious", 0.5, meta=[m]), _norm("suspicious", 0.5, meta=[m]), _norm("authentic", 0.9)]
    agg = qv._aggregate_votes(runs, 3)
    assert [x["field"] for x in agg["metadata_consistency"]] == ["brand"]


def test_attribute_checks_majority_conservative():
    runs = [
        _norm("authentic", 0.9, checks={"logo": "match"}),
        _norm("suspicious", 0.5, checks={"logo": "mismatch"}),
        _norm("suspicious", 0.5, checks={"logo": "mismatch"}),
    ]
    assert qv._aggregate_votes(runs, 3)["attribute_checks"]["logo"] == "mismatch"


def test_voting_orchestration_with_mocked_calls(monkeypatch):
    monkeypatch.setattr(cfg, "VLM_ENABLED", True)
    monkeypatch.setattr(cfg, "VLM_DEV_MOCK", False)
    monkeypatch.setattr(cfg, "VLM_SELF_CONSISTENCY_N", 3)
    # Skip the real prompt build (avoids region detection / encoding here).
    monkeypatch.setattr(qv, "_build_messages", lambda c, r, p: [{"role": "user", "content": []}])

    raws = iter([
        {"authenticity_probability": 0.9, "verdict": "authentic", "defects": []},
        {"authenticity_probability": 0.2, "verdict": "counterfeit",
         "defects": [{"attribute": "hologram", "severity": "critical", "description": "missing"}]},
        {"authenticity_probability": 0.88, "verdict": "authentic", "defects": []},
    ])
    monkeypatch.setattr(qv, "_call_api", lambda messages, temperature=None: next(raws))

    result = qv.verify_product_authenticity_voting(
        [{"view": "front", "bytes": b"x"}], [], product=None
    )
    assert result["available"] is True
    assert result["verdict"] == "authentic"            # 2 of 3
    assert result["method"] == "api_voting_3"
    # The lone critical defect (1 of 3) must not survive to trigger a veto.
    assert result["defects"] == []
