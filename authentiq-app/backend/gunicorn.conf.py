"""
Gunicorn production config (audit 3.2) — multiple uvicorn workers behind one
master, instead of a single `uvicorn --reload` process.

    Production:  gunicorn app.main:app -c gunicorn.conf.py
    Development: uvicorn app.main:app --reload --port 8000   (unchanged)

Put Nginx (TLS, gzip, timeouts) in front. IMPORTANT: each worker loads its own
OpenCLIP + YOLO models into memory, so scale workers by RAM, not just CPU, and
keep the heavy GPU/VLM inference on a separate tier (see docs/DEPLOYMENT_OPS.md).
"""

import multiprocessing
import os

bind = os.getenv("BIND", "0.0.0.0:8000")

# Each worker preloads models → memory-bound. Default conservative; override with
# WEB_CONCURRENCY once you know the per-worker RAM footprint.
_default_workers = min((multiprocessing.cpu_count() * 2) + 1, 4)
workers = int(os.getenv("WEB_CONCURRENCY", str(_default_workers)))

# Uvicorn worker gives us ASGI + websockets (needs uvicorn[standard]).
worker_class = "uvicorn.workers.UvicornWorker"

# Generous timeout so the first (cold) scan's model load doesn't kill the worker;
# the async verify path (audit 1.11) keeps long VLM calls off the request thread.
timeout = int(os.getenv("GUNICORN_TIMEOUT", "120"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "5"))

# Recycle workers periodically to bound any memory growth from the ML stack.
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "1000"))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", "100"))

accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info").lower()
