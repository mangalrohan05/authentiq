"""
Unit tests for the Product Authentication Profile (metadata-at-creation).

Covers the pure logic without torch / a live VLM:
  - render_profile_spec turns the structured extraction into a scan-time spec
  - _ground_truth_block prefers a ready profile, falls back to raw metadata
  - _instruction_block embeds the profile spec at scan time
  - extract_product_profile handles ready / disabled / no-reference cases

Run:  PYTHONPATH=. pytest tests/test_product_profile.py -q
"""

from __future__ import annotations

import app.services.qwen_vl_service as q
import app.services.vlm_config as cfg


_EXTRACTED = {
    "summary": "AuraGlow Vitamin C Serum 30ml",
    "readable_text": {"label": ["SKU AG-VCS-030", "Batch AGX24J07", "MRP 1299"]},
    "identifiers": {"barcode": "8901526701234", "batch_format": "AGX##J##", "serial_format": "none"},
    "security_features": [
        {"feature": "hologram", "view": "label", "location": "bottom-right",
         "appearance": "rainbow GENUINE seal"}
    ],
    "visual_signature": {"logo": "AuraGlow wordmark, top-center", "colors": ["purple", "white"]},
    "must_have": ["rainbow hologram seal", "batch code AGX##J##"],
}
_DECLARED = {"name": "AuraGlow Serum", "brand": "AuraGlow", "mrp": 1299}


def test_render_profile_spec_includes_key_evidence():
    spec = q.render_profile_spec(_EXTRACTED, _DECLARED)
    for token in ("hologram", "AGX24J07", "AuraGlow", "8901526701234"):
        assert token in spec, f"expected {token!r} in spec"


def test_render_profile_spec_falls_back_when_empty():
    spec = q.render_profile_spec({}, _DECLARED)
    # empty extraction -> falls back to the raw metadata block
    assert "AuraGlow" in spec


def test_ground_truth_prefers_ready_profile():
    prod = {"name": "X", "authentication_profile": {"status": "ready", "spec": "THE-PROFILE-SPEC"}}
    block = q._ground_truth_block(prod)
    assert "THE-PROFILE-SPEC" in block
    assert "AUTHENTICATION PROFILE" in block


def test_ground_truth_falls_back_without_ready_profile():
    for prof in (None, {"status": "pending"}, {"status": "failed"}, {"status": "ready", "spec": "  "}):
        prod = {"name": "X", "brand": "B", "authentication_profile": prof}
        assert "Registered product metadata" in q._ground_truth_block(prod)


def test_instruction_block_embeds_profile_spec():
    prod = {"authentication_profile": {"status": "ready", "spec": "UNIQUE-SPEC-MARKER-123"}}
    instr = q._instruction_block(prod)
    assert "UNIQUE-SPEC-MARKER-123" in instr


def test_extract_profile_ready_with_mocked_vlm(monkeypatch):
    monkeypatch.setattr(cfg, "VLM_ENABLED", True)
    monkeypatch.setattr(cfg, "VLM_API_URL", "http://x")
    monkeypatch.setattr(cfg, "VLM_DEV_MOCK", False)
    monkeypatch.setattr(q, "_call_api", lambda messages: _EXTRACTED)
    prof = q.extract_product_profile([{"view": "label", "bytes": b"\x89PNG\r\n\x1a\nxx"}], _DECLARED)
    assert prof["status"] == "ready"
    assert prof["spec"] and "hologram" in prof["spec"]
    assert prof["extracted"] == _EXTRACTED


def test_extract_profile_disabled():
    orig = cfg.VLM_ENABLED
    cfg.VLM_ENABLED = False
    try:
        prof = q.extract_product_profile([{"view": "x", "bytes": b"x"}], {})
        assert prof["status"] == "failed" and prof["error"] == "vlm_disabled"
    finally:
        cfg.VLM_ENABLED = orig


def test_extract_profile_no_references(monkeypatch):
    monkeypatch.setattr(cfg, "VLM_ENABLED", True)
    monkeypatch.setattr(cfg, "VLM_API_URL", "http://x")
    monkeypatch.setattr(cfg, "VLM_DEV_MOCK", False)
    prof = q.extract_product_profile([], _DECLARED)
    assert prof["status"] == "failed" and prof["error"] == "no_reference_images"


def test_extract_profile_vlm_error(monkeypatch):
    monkeypatch.setattr(cfg, "VLM_ENABLED", True)
    monkeypatch.setattr(cfg, "VLM_API_URL", "http://x")
    monkeypatch.setattr(cfg, "VLM_DEV_MOCK", False)
    monkeypatch.setattr(q, "_call_api", lambda messages: {"__error__": "http_400"})
    prof = q.extract_product_profile([{"view": "label", "bytes": b"\x89PNG\r\n\x1a\nxx"}], _DECLARED)
    assert prof["status"] == "failed" and "http_400" in prof["error"]


if __name__ == "__main__":
    import types

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
    raise SystemExit(1 if failed else 0)
