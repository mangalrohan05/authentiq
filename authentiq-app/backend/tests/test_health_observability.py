"""Health probes + observability (audit items 3.3 / 3.4).

Exercises /healthz, /readyz, /metrics and the request-id/timing middleware via
the FastAPI TestClient (mock-mode DB — no external services).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz_ok_with_tracing_headers():
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    # RequestContextMiddleware injects these on every response.
    assert r.headers.get("X-Request-ID")
    assert r.headers.get("X-Response-Time-ms")


def test_request_id_is_echoed_when_supplied():
    r = client.get("/healthz", headers={"X-Request-ID": "abc-123"})
    assert r.headers.get("X-Request-ID") == "abc-123"


def test_readyz_reports_all_components():
    r = client.get("/readyz")
    assert r.status_code in (200, 503)
    body = r.json()
    assert body["status"] in ("ready", "not_ready")
    for key in ("database", "clip_model", "vlm", "broker"):
        assert key in body["components"]
    # Mock-mode DB is reachable → ready.
    assert body["components"]["database"] in ("ok", "mock")


def test_metrics_exposition_after_a_request():
    client.get("/healthz")  # ensure at least one labelled sample exists
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "http_requests_total" in r.text
