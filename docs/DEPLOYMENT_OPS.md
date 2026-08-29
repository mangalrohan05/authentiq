# Deployment & Operations (audit §3 — Reliability & Operations)

Operational runbook for the reliability fixes. Complements `DEPLOYMENT.md`.

## Health & readiness probes (3.4)

| Endpoint | Purpose | Use |
|---|---|---|
| `GET /healthz` | Liveness — process is up | k8s `livenessProbe`; cheap, no dependency checks |
| `GET /readyz` | Readiness — can serve traffic | k8s `readinessProbe` / LB gate. `200` when the DB is reachable, `503` if not. Body reports each subsystem (`database`, `clip_model`, `vlm`, `broker`) so you can see *what* is degraded |
| `GET /metrics` | Prometheus exposition | Scrape target (`http_requests_total`, `http_request_duration_seconds`) |

The WebSocket endpoint `/ws` now works: `uvicorn[standard]` pulls in `websockets`,
fixing the "No supported WebSocket library" degradation.

## Observability (3.3)

- **Structured logs:** set `LOG_FORMAT=json` (default `console`) for one JSON object
  per line, ready for a log aggregator. `LOG_LEVEL` controls verbosity.
- **Request tracing:** every request gets an `X-Request-ID` (generated if the client
  didn't send one), echoed in the response header and stamped on every log line for
  that request. Latency is returned as `X-Response-Time-ms`.
- **Error tracking (Sentry):** set `SENTRY_DSN` to enable (optional
  `SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_ENVIRONMENT`). No-op if unset.
- **Metrics:** scrape `/metrics`. Degrades to `503` if `prometheus-client` is absent.

## Running in production (3.2)

Dev is unchanged (`uvicorn app.main:app --reload --port 8000`). For production use
Gunicorn with uvicorn workers behind Nginx (TLS/gzip/timeouts):

```bash
gunicorn app.main:app -c gunicorn.conf.py
```

- Scale workers with `WEB_CONCURRENCY`. **Each worker loads its own OpenCLIP + YOLO
  models**, so scale by RAM, not just CPU, and keep the GPU/VLM inference on a
  **separate tier** (below) rather than fanning it across web workers.

## Async workers — Redis + Celery (3.1)

Heavy work (reference-image embeddings, and VLM verification via the audit-1.11 job
path) should run off the request thread. The code already prefers Celery and falls
back to in-process execution when the broker is down, so the app never hard-depends
on Redis — but for real throughput, run them:

```bash
# 1) Redis
redis-server                      # or a managed Redis; set REDIS_URL

# 2) Celery worker (embeddings)
celery -A app.core.celery_app.celery_app worker --loglevel=info
```

- `REDIS_URL` (default `redis://localhost:6379/0`) configures the broker/back-end.
- `/readyz` reports broker reachability under `components.broker`. `unavailable`
  there means the in-process fallback is carrying the load (degraded, not down).
- VLM verification also has an in-process job store + polling
  (`POST /scan/{qr}/verify-ai?background=true` → `GET /scan/verify-jobs/{id}`); moving
  it onto a dedicated Celery queue is the durable upgrade.

## Model serving — GPU / warm pool (3.5)

Ollama single-instance unloads the model after idle → cold-start latency spikes. For
production, serve Qwen2.5-VL on a **dedicated GPU tier with a warm pool**:

```bash
pip install "vllm>=0.6.3"
vllm serve Qwen/Qwen2.5-VL-7B-Instruct \
  --port 8000 --limit-mm-per-prompt image=12 --max-model-len 32768
```

Then point `AUTHENTIQ_VLM_API_URL` at it. vLLM keeps the model resident (no unload),
batches concurrent requests (helps the audit-1.5 self-consistency voting), and scales
horizontally behind a load balancer. Keep this tier separate from the web workers so a
slow inference never consumes request capacity. The existing model-pin/keep-alive is
the interim stopgap; a warm vLLM/Triton pool is the real fix.
