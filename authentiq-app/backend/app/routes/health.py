"""
Liveness / readiness probes + Prometheus metrics (audit 3.3 / 3.4).

  * GET /healthz  — liveness: 200 as long as the process is up.
  * GET /readyz   — readiness: 200 when the app can serve (DB reachable); 503 if
                    the critical dependency (DB) is down. The body reports each
                    subsystem (db, clip_model, vlm, broker) so orchestrators and
                    dashboards can see *what* is degraded, not just up/down.
  * GET /metrics  — Prometheus exposition (503 if prometheus-client is absent).

These are public (no auth) so load balancers / k8s probes can reach them.
"""

from __future__ import annotations

import logging
import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response

from app.core.observability import metrics_available, render_metrics

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Health"])


@router.get("/healthz")
async def healthz():
    """Liveness — cheap, no dependency checks."""
    return {"status": "ok"}


def _db_status() -> tuple[str, bool]:
    try:
        from app.core.db import users_collection

        users_collection.find_one({}, {"_id": 1})
        try:
            from app.core.db import is_mock  # type: ignore

            return ("mock" if is_mock else "ok"), True
        except Exception:
            return "ok", True
    except Exception as exc:
        return f"down: {exc}", False


def _clip_status() -> str:
    try:
        from app.services.openclip_service import get_model_singleton

        s = get_model_singleton()
        if getattr(s, "model", None) is not None:
            return "loaded"
        err = getattr(s, "_load_error", None)
        return f"error: {err}" if err else "loading"
    except Exception as exc:
        return f"unknown: {exc}"


def _vlm_status() -> str:
    try:
        from app.services import vlm_config as vcfg

        if not vcfg.VLM_ENABLED:
            return "disabled"
        return "configured" if vcfg.VLM_API_URL else "not_configured"
    except Exception as exc:
        return f"unknown: {exc}"


def _broker_status() -> str:
    """Celery/Redis broker reachability (informational — the app has an in-process
    fallback for embeddings and verification, so a down broker is degraded, not fatal)."""
    url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    try:
        import redis  # type: ignore

        redis.from_url(url, socket_connect_timeout=1, socket_timeout=1).ping()
        return "ok"
    except Exception:
        return "unavailable (in-process fallback active)"


@router.get("/readyz")
async def readyz():
    """Readiness — 503 only if the critical dependency (DB) is unreachable."""
    db, db_ok = _db_status()
    components = {
        "database": db,
        "clip_model": _clip_status(),
        "vlm": _vlm_status(),
        "broker": _broker_status(),
    }
    ready = db_ok
    body = {"status": "ready" if ready else "not_ready", "components": components}
    return JSONResponse(status_code=200 if ready else 503, content=body)


@router.get("/metrics")
async def metrics():
    """Prometheus exposition for scraping."""
    body, content_type = render_metrics()
    return Response(
        content=body,
        media_type=content_type,
        status_code=200 if metrics_available() else 503,
    )
