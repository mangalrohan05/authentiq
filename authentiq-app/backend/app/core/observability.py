"""
Observability: structured logging, request-id tracing, Prometheus metrics, Sentry
(audit item 3.3).

Everything here degrades gracefully:
  * `LOG_FORMAT=json` emits one JSON object per log line (for a log aggregator);
    anything else keeps the human-readable console format.
  * Prometheus metrics work only if `prometheus-client` is installed; otherwise the
    /metrics endpoint returns 503 and the middleware still adds request-id + timing.
  * Sentry initialises only when `SENTRY_DSN` is set AND `sentry-sdk` is installed.

A per-request id (`X-Request-ID`, generated if absent) is put on a contextvar so it
appears in every log line for that request and is echoed back in the response header,
giving you request tracing without a full tracing backend.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from contextvars import ContextVar
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ── Request-id context ────────────────────────────────────────────────────────
_request_id: ContextVar[str] = ContextVar("request_id", default="-")


def get_request_id() -> str:
    return _request_id.get()


# ── Structured logging ────────────────────────────────────────────────────────
class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id.get()
        return True


class JsonLogFormatter(logging.Formatter):
    """One compact JSON object per record, including the current request id."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    """Install the request-id filter and (optionally) the JSON formatter on root."""
    root = logging.getLogger()
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    root.setLevel(level)

    fmt: logging.Formatter
    if os.getenv("LOG_FORMAT", "console").lower() == "json":
        fmt = JsonLogFormatter()
    else:
        fmt = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s [req:%(request_id)s] %(message)s"
        )

    id_filter = _RequestIdFilter()
    if not root.handlers:
        handler = logging.StreamHandler()
        root.addHandler(handler)
    for handler in root.handlers:
        handler.setFormatter(fmt)
        handler.addFilter(id_filter)


# ── Prometheus metrics (optional) ─────────────────────────────────────────────
try:
    from prometheus_client import (  # type: ignore
        CONTENT_TYPE_LATEST,
        Counter,
        Histogram,
        generate_latest,
    )

    _PROM = True
    _REQUESTS = Counter(
        "http_requests_total", "Total HTTP requests", ["method", "path", "status"]
    )
    _LATENCY = Histogram(
        "http_request_duration_seconds", "HTTP request latency (s)", ["method", "path"]
    )
except Exception:  # prometheus-client not installed
    _PROM = False
    CONTENT_TYPE_LATEST = "text/plain"  # type: ignore


def metrics_available() -> bool:
    return _PROM


def render_metrics() -> tuple[bytes, str]:
    """Return (body, content_type) for the /metrics endpoint."""
    if not _PROM:
        return b"prometheus-client not installed\n", "text/plain"
    return generate_latest(), CONTENT_TYPE_LATEST


def _route_template(request: Request) -> str:
    """Low-cardinality label: the matched route template, not the raw path."""
    route = request.scope.get("route")
    tmpl = getattr(route, "path", None)
    return tmpl or "unmatched"


# ── Middleware: request-id + latency + metrics ───────────────────────────────
class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        token = _request_id.set(rid)
        start = time.perf_counter()
        status_code = 500
        try:
            response: Response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            elapsed = time.perf_counter() - start
            path = _route_template(request)
            if _PROM:
                try:
                    _REQUESTS.labels(request.method, path, str(status_code)).inc()
                    _LATENCY.labels(request.method, path).observe(elapsed)
                except Exception:
                    pass
            # Attach tracing headers when we have a response object.
            try:
                response.headers["X-Request-ID"] = rid
                response.headers["X-Response-Time-ms"] = f"{elapsed * 1000:.1f}"
            except Exception:
                pass
            _request_id.reset(token)


# ── Sentry (optional, env-gated) ─────────────────────────────────────────────
def init_sentry() -> bool:
    """Initialise Sentry only if SENTRY_DSN is set and sentry-sdk is installed."""
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return False
    try:
        import sentry_sdk  # type: ignore

        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("SENTRY_ENVIRONMENT", os.getenv("ENV", "development")),
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
        )
        logging.getLogger(__name__).info("[Observability] Sentry initialised")
        return True
    except Exception as exc:  # sentry-sdk missing or bad DSN
        logging.getLogger(__name__).warning("[Observability] Sentry init skipped: %s", exc)
        return False
