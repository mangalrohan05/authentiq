import os
import logging
import warnings
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Suppress PyTorch DataLoader warning when running on CPU without accelerator
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=".*pin_memory.*"
)

# Load environment variables first, before imports that might rely on config
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routes import (
    auth,
    product,
    qr,
    scan,
    admin,
    analytics,
    data_sync,
    plan,
    ai,
    vendor_profile,
    company_qr,
    brand,
    team,
    admin_features,
    health,
)
from app.core.websocket_manager import manager
from slowapi.errors import RateLimitExceeded

from app.core.limiter import limiter
from app.core.observability import (
    RequestContextMiddleware,
    configure_logging,
    init_sentry,
)

# Structured logging (JSON when LOG_FORMAT=json) + optional Sentry, installed
# before anything logs (audit 3.3).
configure_logging()
init_sentry()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Preload OpenCLIP once at startup in a background thread so the first
    verification request does not pay the full model download/load cost.
    Also performs environment checks at startup.
    """
    # ── Startup Environment checks ───────────────────────────────────────────
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        logger.warning(
            "[Startup] DATABASE_URL is not set in environment! "
            "Falling back to default 'mongodb://localhost:27017' which may fail in production."
        )
    elif "localhost" in db_url or "127.0.0.1" in db_url:
        logger.info(
            "[Startup] DATABASE_URL is pointing to a local MongoDB instance: %s",
            db_url,
        )
    
    logger.info("[Startup] CORS Allowed Origins: %s", ALLOWED_ORIGINS)

    import asyncio
    from app.services.openclip_service import get_model_singleton
    from app.services.yolo_service import get_yolo_singleton

    async def _preload():
        loop = asyncio.get_event_loop()
        
        # Preload OpenCLIP model
        clip_ok = await loop.run_in_executor(None, get_model_singleton().ensure_loaded)
        if clip_ok:
            logger.info("[OpenCLIP] Model preloaded at startup")
        else:
            err = get_model_singleton()._load_error
            logger.warning(
                "[OpenCLIP] Startup preload failed — verification will retry load: %s",
                err,
            )

        # Preload YOLOv8 model
        yolo_ok = await loop.run_in_executor(None, get_yolo_singleton().ensure_loaded)
        if yolo_ok:
            logger.info("[YOLO] Model preloaded at startup")
        else:
            err = get_yolo_singleton()._load_error
            logger.warning(
                "[YOLO] Startup preload failed — verification will retry load: %s",
                err,
            )

    preload_task = asyncio.create_task(_preload())

    async def _keep_vlm_warm():
        # Pin the VLM in memory so scans never pay the ~70s cold-start reload
        # (Ollama unloads the model after idle). Warms immediately, then re-pins
        # on an interval shorter than the unload timer. No-op for non-Ollama.
        from app.services.qwen_vl_service import warm_up_model
        from app.services import vlm_config as _vcfg
        if not (_vcfg.VLM_ENABLED and _vcfg.VLM_KEEP_WARM_ENABLED):
            return
        loop = asyncio.get_event_loop()
        while True:
            ok = await loop.run_in_executor(None, warm_up_model)
            if ok:
                logger.info("[VLM] model warm/pinned (keep_alive=%s)", _vcfg.VLM_KEEP_ALIVE)
            await asyncio.sleep(max(30, _vcfg.VLM_KEEP_WARM_INTERVAL_S))

    warm_task = asyncio.create_task(_keep_vlm_warm())
    yield
    preload_task.cancel()
    warm_task.cancel()
    for _t in (preload_task, warm_task):
        try:
            await _t
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Authentiq Backend", version="2.0.0", lifespan=lifespan)

# Create static/uploads folder and mount static files serving
os.makedirs("static/uploads", exist_ok=True)
os.makedirs("static/reference_images", exist_ok=True)
os.makedirs("static/vendor_logos", exist_ok=True)
os.makedirs("static/company_qr", exist_ok=True)
os.makedirs("static/brand_logos", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# ── Rate Limiting ─────────────────────────────────────────────────────────────
# Attach the limiter to app.state so @limiter.limit() decorators can resolve it.
# NOTE: We intentionally do NOT add SlowAPIMiddleware here.
#
# SlowAPIMiddleware, when added via add_middleware(), becomes the OUTERMOST layer
# in Starlette's LIFO middleware stack. This means it processes requests BEFORE
# CORSMiddleware, causing CORS headers to be absent on rate-limited (429)
# responses — the browser then blocks them as CORS violations.
#
# The decorator-based approach (@limiter.limit() on individual routes) works
# correctly with just app.state.limiter set, and the exception handler below
# ensures 429 responses are always valid JSON with proper CORS headers injected.
app.state.limiter = limiter

# ── CORS ─────────────────────────────────────────────────────────────────────
# CORSMiddleware MUST be the outermost layer so it:
#   1. Responds to OPTIONS preflight requests immediately
#   2. Adds Access-Control-Allow-* headers to ALL responses (including errors)
#
# With Starlette's LIFO middleware ordering, add_middleware() calls are reversed
# when building the stack — the FIRST middleware added is OUTERMOST.
# Therefore CORSMiddleware is added first and only.
#
# Configurable via ALLOWED_ORIGINS env var (comma-separated list).
# Dev defaults include both :3000 and :3001 (Next.js may auto-assign 3001
# if :3000 is already occupied by another process).
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001"
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# LAN / alternate localhost ports (e.g. phone testing at http://192.168.x.x:3000)
_LOCAL_ORIGIN_REGEX = os.getenv(
    "ALLOWED_ORIGIN_REGEX",
    r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=_LOCAL_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining",
        "X-Request-ID", "X-Response-Time-ms",
    ],
    max_age=600,  # preflight cache: 10 minutes
)

# Request-id + latency + Prometheus metrics (audit 3.3). Added AFTER CORS so CORS
# stays the OUTERMOST layer (Starlette builds the stack LIFO) — request tracing
# then wraps the routes but never strips CORS headers off error responses.
app.add_middleware(RequestContextMiddleware)

# ── Rate Limit Error Handler ──────────────────────────────────────────────────
# Returns clean JSON with a Retry-After header on 429 responses.
# CORS headers are added by CORSMiddleware (outermost layer) on the way out,
# so the browser never sees a CORS violation on rate-limit errors.
async def _json_rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    retry_after = getattr(exc, "retry_after", 5)
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Rate limit exceeded. Please wait before retrying.",
            "retry_after": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )

app.add_exception_handler(RateLimitExceeded, _json_rate_limit_handler)

# ── Global Exception Handler ──────────────────────────────────────────────────
# Prevents unhandled 500 errors from bypassing CORSMiddleware.
# By catching all unhandled Exceptions here and returning a JSONResponse,
# the response passes through CORSMiddleware, which attaches CORS headers.
# This ensures the frontend receives the actual 500 error instead of a CORS error.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
    )


# ── REST Routes ───────────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(vendor_profile.router, prefix="/vendor/profile", tags=["Vendor Profile"])
app.include_router(product.router, prefix="/product", tags=["Products"])
app.include_router(qr.router, prefix="/qr", tags=["QR Management"])
app.include_router(scan.router, prefix="/scan", tags=["Scans"])          # ← PUBLIC: no auth
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
app.include_router(data_sync.router, prefix="/data", tags=["Import/Export"])
app.include_router(plan.router, prefix="/admin/plans", tags=["Plans"])
app.include_router(admin_features.router, prefix="/admin/features", tags=["Features"])
app.include_router(ai.router, prefix="/ai", tags=["AI Verification"])  # ← AI verification
app.include_router(company_qr.router, tags=["Company QR"])
app.include_router(brand.router, prefix="/vendor/brands", tags=["Brands"])
app.include_router(team.router, prefix="/vendor/team", tags=["Team Management"])
# Health / readiness / metrics at the root (audit 3.3 / 3.4) — public, no prefix.
app.include_router(health.router, tags=["Health"])

# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Real-time push channel for dashboard clients.
    Clients connect here and receive JSON events when scans,
    batches, or products are created.
    Supports ping/pong heartbeat keepalive.
    """
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if "ping" in data:
                import json
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except Exception:
                    pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        logger.warning(f"WebSocket connection error: {exc}")
        manager.disconnect(websocket)

# ── Health ────────────────────────────────────────────────────────────────────
# --- Uvicorn Hot-Reload Trigger / Health Check ---
@app.get("/")
async def root():
    return {"message": "Authentiq Backend API v2 — Secure"}

@app.get("/health")
async def health_check():
    from app.services.openclip_service import health_check as openclip_health
    from app.services.yolo_service import health_check as yolo_health

    return {
        "status": "healthy",
        "ai": openclip_health(),
        "yolo": yolo_health(),
    }
