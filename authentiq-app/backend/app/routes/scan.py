from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.core.db import (
    qr_codes_collection,
    products_collection,
    scans_collection,
    vendors_collection,
    users_collection,
)
from app.core.websocket_manager import manager
from app.core.cache import cache_store
from datetime import datetime, timedelta
from app.core.limiter import limiter
from app.services.openclip_service import (
    generate_embedding_from_bytes,
    assess_authenticity,
    get_model_singleton,
)
from app.services.embedding_jobs import (
    ensure_product_embeddings_ready,
    get_cached_reference_embeddings,
    schedule_product_embedding_job,
)
from app.services.verification_matching import (
    canonical_customer_slot,
    run_verification_scoring,
)
from app.services.image_quality import validate_customer_image_bytes
from app.services.calibration_layer import calibrator
from app.services.verification_jobs import store as verification_job_store
from app.services.phash_service import (
    generate_phash,
    check_near_duplicate,
    fetch_stored_phashes,
)

import logging
import urllib.request
import json
import asyncio
import uuid
import os
import re
from typing import Optional, Any
from pymongo import ReturnDocument

router = APIRouter()
logger = logging.getLogger(__name__)

DEFAULT_BRAND_SUPPORT_EMAIL = os.getenv(
    "AUTHENTIQ_DEFAULT_SUPPORT_EMAIL", "vendor@authentiq.com"
)


def _normalize_email(value: Any) -> Optional[str]:
    if value is None or not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned or "@" not in cleaned:
        return None
    return cleaned


def _email_from_vendor_doc(vendor: Optional[dict]) -> Optional[str]:
    if not vendor:
        return None
    for key in (
        "support_email",
        "contact_email",
        "email",
        "vendor_email",
        "owner_email",
    ):
        found = _normalize_email(vendor.get(key))
        if found:
            return found
    return None


def _email_from_vendor_id(vendor_id: Optional[str], requesting_vendor_id: Optional[str] = None) -> Optional[str]:
    """
    Resolve vendor email with authorization check to prevent IDOR.
    requesting_vendor_id is the vendor_id of the authenticated user making the request.
    For public endpoints (no auth), requesting_vendor_id will be None and we only return
    the support email if the vendor is the one associated with the batch/product being scanned.
    """
    if not vendor_id:
        return None
    
    # For public scan endpoints, only allow access if the vendor_id matches the batch/product
    # This prevents unauthorized vendor data enumeration
    if requesting_vendor_id is not None and requesting_vendor_id != vendor_id:
        logger.warning(f"IDOR attempt prevented: vendor {requesting_vendor_id} tried to access vendor {vendor_id}")
        return None
    
    vendor = vendors_collection.find_one({"id": vendor_id}, {"_id": 0})
    found = _email_from_vendor_doc(vendor)
    if found:
        return found
    for query in (
        {"vendor_id": vendor_id, "role": "vendor"},
        {"vendor_id": vendor_id},
    ):
        user = users_collection.find_one(query, {"_id": 0, "email": 1})
        found = _normalize_email(user.get("email") if user else None)
        if found:
            return found
    return None


def _resolve_vendor_id(product: dict) -> Optional[str]:
    product_vendor = product.get("vendor_id")
    if product_vendor:
        return str(product_vendor)

    brand = (product.get("brand") or "").strip()
    if brand:
        vendor = vendors_collection.find_one(
            {
                "vendor_name": {
                    "$regex": f"^{re.escape(brand)}$",
                    "$options": "i",
                }
            },
            {"_id": 0, "id": 1},
        )
        if not vendor:
            vendor = vendors_collection.find_one(
                {"vendor_name": {"$regex": re.escape(brand), "$options": "i"}},
                {"_id": 0, "id": 1},
            )
        if vendor and vendor.get("id"):
            return str(vendor["id"])

    return None


def resolve_brand_contact_email(product: dict) -> str:
    """Resolve a customer-facing support email with defensive fallbacks."""
    vendor_id = _resolve_vendor_id(product)
    if vendor_id:
        found = _email_from_vendor_id(vendor_id)
        if found:
            logger.debug("brand_contact_email resolved via vendor_id=%s", vendor_id)
            return found

    default_email = _normalize_email(DEFAULT_BRAND_SUPPORT_EMAIL)
    if default_email:
        logger.debug(
            "brand_contact_email using default fallback (vendor_id=%s)",
            vendor_id,
        )
        return default_email

    return "vendor@authentiq.com"


def _clean_city_name(name: str) -> str:
    if not name:
        return ""
    # Remove suffixes like Municipal Corporation, Municipality, District, etc.
    cleaned = re.sub(
        r"\s+(Municipal\s+Corporation|Corporation|Municipality|District|Division|Cantonment|Cantt)\b",
        "",
        name,
        flags=re.IGNORECASE
    )
    return cleaned.strip()


async def _get_location(ip: str) -> dict:
    """
    Attempt an IP-based geolocation lookup via ip-api.com (free, no key).
    Uses built-in urllib in an executor to avoid external dependencies like httpx.
    """
    if ip in ("127.0.0.1", "::1", "testclient"):
        return {"city": "Local", "state": "Development", "country": "System", "lat": None, "lon": None}
    
    def fetch_sync():
        try:
            url = f"http://ip-api.com/json/{ip}?fields=status,city,regionName,country,lat,lon"
            with urllib.request.urlopen(url, timeout=2.0) as response:
                return json.loads(response.read().decode())
        except Exception:
            return None

    try:
        # Run synchronous urllib call in a thread pool to avoid blocking the event loop
        data = await asyncio.get_event_loop().run_in_executor(None, fetch_sync)
        if data and data.get("status") == "success":
            return {
                "city": _clean_city_name(data.get("city", "")),
                "state": data.get("regionName", ""),
                "country": data.get("country", ""),
                "lat": data.get("lat"),
                "lon": data.get("lon"),
            }
    except Exception as e:
        logger.warning(f"Geolocation lookup failed for {ip}: {e}")
    return {"city": "", "state": "", "country": "", "lat": None, "lon": None}


def _get_client_ip(request: Request) -> str:
    """Extract client IP, preferring X-Forwarded-For for proxy support."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Take the first IP in the list (client)
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

@router.get("/{qr_id}")
# @limiter.limit("30/minute")
async def scan_qr(request: Request, qr_id: str, location_str: Optional[str] = None):
    logger.info(f"Scanning QR ID: {qr_id} with location_str: {location_str}")

    # ── 1. Fetch QR code and check expiration ────────────────────────────────
    qr = qr_codes_collection.find_one({"qr_id": qr_id})
    if not qr:
        raise HTTPException(status_code=404, detail="Invalid QR Code")
    
    # Check if QR code has expired
    expires_at = qr.get("expires_at")
    if expires_at and datetime.utcnow() > expires_at:
        raise HTTPException(status_code=410, detail="This QR code has expired. Please contact the vendor for a new code.")
    
    # Check if QR code has been revoked
    if qr.get("status") == "revoked":
        raise HTTPException(status_code=403, detail="This QR code has been revoked due to suspicious activity.")

    # ── 2. Atomic increment and fetch updated state ──────────────────────────
    try:
        updated_qr = qr_codes_collection.find_one_and_update(
            {"qr_id": qr_id},
            {"$inc": {"scan_count": 1}},
            return_document=ReturnDocument.AFTER
        )
    except Exception as e:
        logger.error(f"Error updating scan count for {qr_id}: {e}")
        raise HTTPException(status_code=500, detail="Database error during scan update")

    if not updated_qr:
        raise HTTPException(status_code=404, detail="Invalid QR Code")

    # Invalidate status cache to ensure next status check fetches fresh data
    cache_store.invalidate(f"qr_status:{qr_id}")

    product_id = updated_qr["product_id"]

    # ── 2. Get product directly ───────────────────
    product = products_collection.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Linked product not found")

    products = [product]
    vendor_id = product.get("vendor_id")

    # ── 3. Capture IP & metadata & resolve geolocation ───────────────────────
    # Server-side IP geolocation is already implemented as fallback in _get_location()
    client_ip = _get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "unknown")
    referrer = request.headers.get("Referer", "") # Standard header is Referer
    
    if location_str:
        parts = [p.strip() for p in location_str.split(",")]
        city = _clean_city_name(parts[0]) if len(parts) > 0 else ""
        state = parts[1] if len(parts) > 1 else ""
        country = parts[2] if len(parts) > 2 else (parts[1] if len(parts) > 1 else "")
        location = {
            "city": city,
            "state": state,
            "country": country,
            "lat": None,
            "lon": None
        }
    else:
        location = await _get_location(client_ip)

    # ── 4. Velocity Detection - Check for impossible travel patterns ─────────────
    # Flag scans that appear in distant locations within short timeframes
    is_suspicious = False
    try:
        # Get recent scans for this QR code (last 30 minutes)
        recent_scans = list(scans_collection.find({
            "qr_id": qr_id,
            "timestamp": {"$gte": datetime.utcnow() - timedelta(minutes=30)}
        }).sort("timestamp", -1).limit(5))
        
        if recent_scans and location.get("lat") and location.get("lon"):
            for recent_scan in recent_scans:
                recent_loc = recent_scan.get("location", {})
                recent_lat = recent_loc.get("lat")
                recent_lon = recent_loc.get("lon")
                recent_time = recent_scan.get("timestamp")
                
                if recent_lat and recent_lon and recent_time:
                    # Calculate distance using Haversine formula (approximate)
                    from math import radians, sin, cos, sqrt, atan2
                    lat1, lon1 = radians(recent_lat), radians(recent_lon)
                    lat2, lon2 = radians(location["lat"]), radians(location["lon"])
                    
                    dlat = lat2 - lat1
                    dlon = lon2 - lon1
                    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
                    c = 2 * atan2(sqrt(a), sqrt(1-a))
                    distance_km = 6371 * c  # Earth's radius in km
                    
                    time_diff_hours = (datetime.utcnow() - recent_time).total_seconds() / 3600
                    
                    # Flag if distance > 500km in < 30 minutes (impossible travel)
                    if distance_km > 500 and time_diff_hours < 0.5:
                        logger.warning(
                            f"Velocity anomaly detected for QR {qr_id}: "
                            f"{distance_km:.1f}km in {time_diff_hours:.1f}h"
                        )
                        # Mark this scan as suspicious
                        is_suspicious = True
                        break
    except Exception as e:
        logger.error(f"Error in velocity detection: {e}")

    # ── 5. Log the scan event with enriched metadata ─────────────────────────
    try:
        now = datetime.utcnow()
        actual_product_name = "Unknown Product"
        if product:
            actual_product_name = product.get("name", "Unknown Product")

        activity_str = f"Product Scanned: {actual_product_name}"
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")

        # Format scanned place
        place_str = "Local, System"
        if location:
            if isinstance(location, dict):
                city = location.get("city") or ""
                state = location.get("state") or ""
                country = location.get("country") or ""
                if city == "Local" and country == "System":
                    place_str = "Local, System"
                else:
                    parts = [p.strip() for p in [city, state, country] if p and p.strip()]
                    if parts:
                        place_str = ", ".join(parts)
            elif isinstance(location, str):
                if "Local" in location or "System" in location:
                    place_str = "Local, System"
                else:
                    place_str = location

        logger.info(f"[{activity_str}, {date_str}, {time_str}, {place_str}]")

        scans_collection.insert_one({
            "qr_id": qr_id,
            "product_id": product_id,
            "product_name": actual_product_name,
            "event_type": "Product Scanned",
            "vendor_id": vendor_id,
            "verification_status": "verified",
            "timestamp": now,
            "scan_timestamp": now,
            "created_at": now,
            "ip_address": client_ip,
            "user_agent": user_agent,
            "referrer": referrer,
            "location": location,
            "is_suspicious": is_suspicious,
            "velocity_anomaly_detected": is_suspicious
        })
    except Exception as e:
        logger.error(f"Error logging scan event: {e}")

    # ── 5. Broadcast real-time update ────────────────────────────────────────
    try:
        await manager.broadcast({
            "type": "scan_update",
            "qr_id": qr_id,
            "vendor_id": vendor_id,
            "scan_count": updated_qr["scan_count"],
            "location": location,
        })
    except Exception as e:
        logger.warning(f"WebSocket broadcast failed: {e}")

    # ── 6. Return response (unchanged contract) ──────────────────────────────
    return {
        "status": "verified",
        "batch": None,
        "products": products,
        "scan_count": updated_qr["scan_count"],
        "is_first_scan": updated_qr["scan_count"] == 1,
    }


# ── AI AUTHENTICITY AND SCAN STATUS PIPELINES ──────────────────────────────────

try:
    from app.core.db import verification_sessions_collection
except Exception as e:
    logger.warning(f"Could not import verification_sessions_collection: {e}")
    # Fallback if collection doesn't exist
    verification_sessions_collection = None

UPLOAD_DIR = "static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("/{qr_id}/status")
async def get_scan_status(qr_id: str):
    # Check cache first
    cache_key = f"qr_status:{qr_id}"
    cached_res = cache_store.get(cache_key)
    if cached_res is not None:
        logger.info(f"Cache hit for QR ID status: {qr_id}")
        return cached_res

    logger.info(f"Checking status for QR ID: {qr_id}")
    qr = qr_codes_collection.find_one({"qr_id": qr_id}, {"_id": 0})
    if not qr:
        raise HTTPException(status_code=404, detail="Invalid QR Code: code not registered in registry.")
    
    # Handle status states
    status_state = qr.get("status", "active")
    if status_state == "revoked":
        raise HTTPException(status_code=400, detail="Revoked QR Code: this code has been flagged as suspicious or counterfeit.")
    if status_state == "expired":
        raise HTTPException(status_code=400, detail="Expired QR Code: this verification window has expired.")
    
    product_id = qr.get("product_id")
    products: list = []
    if product_id:
        # Include archived products — issued QR codes must remain verifiable.
        product = products_collection.find_one({"id": product_id}, {"_id": 0})
        if product:
            products = [product]

    embeddings_ready = False
    if products:
        ref = products[0].get("reference_images", [])
        embeddings_ready = any(
            img.get("embedding_cached") and img.get("embedding_vector") for img in ref
        )

    brand_contact_email = resolve_brand_contact_email(products[0]) if products else "vendor@authentiq.com"

    response_data = {
        "status": status_state,
        "qr_id": qr_id,
        "scan_count": qr.get("scan_count", 0),
        "created_at": qr.get("created_at"),
        "batch": None,
        "products": products,
        "embeddings_ready": embeddings_ready,
        "brand_contact_email": brand_contact_email,
    }
    
    # Cache for 30 seconds
    cache_store.set(cache_key, response_data, 30.0)
    return response_data


class _BufferedUpload:
    """Minimal UploadFile stand-in backed by in-memory bytes (audit 1.11).

    An UploadFile's stream closes once the request returns, so for the background
    path we read the bytes up front and pass one of these to the verification core,
    which only uses `.content_type`, `.filename`, and `await .read()`.
    """

    def __init__(self, data: bytes, filename: Optional[str], content_type: Optional[str]) -> None:
        self._data = data
        self.filename = filename or "upload"
        self.content_type = content_type or "application/octet-stream"

    async def read(self, *_args, **_kwargs) -> bytes:
        return self._data


@router.post("/{qr_id}/verify-ai")
async def verify_product_ai(
    request: Request,
    qr_id: str,
    front: UploadFile = File(...),
    back: Optional[UploadFile] = File(None),
    packaging: Optional[UploadFile] = File(None),
    label: UploadFile = File(...),
    proof: Optional[UploadFile] = File(None),
    location_str: Optional[str] = Form(None),
    background: bool = Form(False),
):
    """AI-powered product authenticity verification.

    Synchronous by default (unchanged behaviour). Pass `background=true` to run the
    slow (60–90 s cold) VLM verification as a background job and get back a
    `job_id`; poll `GET /scan/verify-jobs/{job_id}` for the result. This keeps the
    request from holding the connection open long enough to hit the reverse-proxy
    timeout — the "HTTP 500 on first scan" symptom (audit 1.11).
    """
    client_ip = _get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "unknown")

    if not background:
        result = await _verify_ai_core(
            qr_id, front, back, packaging, label, proof, location_str, client_ip, user_agent
        )
        return JSONResponse(content=result)

    # Background: read the uploads NOW (streams close after we return), then run the
    # SAME core in a job and hand back a poll handle.
    async def _snapshot(f: Optional[UploadFile]) -> Optional[_BufferedUpload]:
        if f is None:
            return None
        return _BufferedUpload(await f.read(), getattr(f, "filename", None), getattr(f, "content_type", None))

    snap_front, snap_back, snap_pack, snap_label, snap_proof = [
        await _snapshot(f) for f in (front, back, packaging, label, proof)
    ]
    job_id = verification_job_store.submit_coro(
        _verify_ai_core,
        qr_id, snap_front, snap_back, snap_pack, snap_label, snap_proof,
        location_str, client_ip, user_agent,
    )
    logger.info("[Verify] Queued background verification job %s for QR %s", job_id, qr_id)
    return JSONResponse(
        status_code=202,
        content={"job_id": job_id, "status": "processing", "poll_url": f"/scan/verify-jobs/{job_id}"},
    )


@router.get("/verify-jobs/{job_id}")
async def get_verify_job(job_id: str):
    """Poll a background verification job (audit 1.11).

    Returns {"status": "queued"|"processing"} while running, {"status": "done",
    "result": <same body as the sync endpoint>} when finished, or re-raises the
    original error (same status code) if the job failed.
    """
    job = verification_job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Verification job not found or expired")
    if job["status"] == "done":
        return JSONResponse(content={"status": "done", "result": job["result"]})
    if job["status"] == "error":
        raise HTTPException(status_code=job.get("status_code") or 500, detail=job["error"])
    return JSONResponse(content={"status": job["status"]})


async def _verify_ai_core(
    qr_id: str,
    front,
    back,
    packaging,
    label,
    proof,
    location_str: Optional[str],
    client_ip: str,
    user_agent: str,
):
    """
    AI-powered product authenticity verification using OpenCLIP embeddings.

    Compares customer-uploaded images against official product reference embeddings.
    Returns a JSON-encodable dict (the route wrapper wraps it in a JSONResponse, and
    the background job stores it for polling). `client_ip` / `user_agent` are supplied
    by the caller so this core has no dependency on the live Request object.
    """
    logger.info(f"AI Verification requested for QR: {qr_id}")
    
    # ── 1. VALIDATE QR & BATCH ────────────────────────────────────────────────
    qr = qr_codes_collection.find_one({"qr_id": qr_id})
    if not qr:
        raise HTTPException(status_code=404, detail="QR Code not found in registry")
    
    status_state = qr.get("status", "active")
    if status_state == "revoked":
        raise HTTPException(status_code=400, detail="Revoked QR Code: flagged as suspicious or counterfeit")
    if status_state == "expired":
        raise HTTPException(status_code=400, detail="Expired QR Code: verification window expired")
    
    product_id = qr.get("product_id")
    if not product_id:
        raise HTTPException(status_code=404, detail="Product ID not found in QR code")
    
    # ── 2. GET PRODUCT & VALIDATE REFERENCE EMBEDDINGS ────────────────────────
    product = products_collection.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    vendor_id = product.get("vendor_id")
    
    reference_images = product.get("reference_images", [])
    if not reference_images:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "NoReferenceImages",
                "message": "This product has no vendor reference images. AI verification is unavailable.",
            },
        )

    # Ensure OpenCLIP is loaded once (in executor — blocks worker thread only).
    loop = asyncio.get_event_loop()
    model_ok = await loop.run_in_executor(
        None, get_model_singleton().ensure_loaded
    )
    if not model_ok:
        singleton = get_model_singleton()
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIServiceUnavailable",
                "message": "AI verification service is unavailable. "
                "Ensure OpenCLIP dependencies are installed and model weights can be loaded.",
                "technical": singleton._load_error,
            },
        )

    # Generate missing reference embeddings inline if needed (verify-time fallback).
    embed_state = await ensure_product_embeddings_ready(product_id, allow_inline_generation=True)
    product = await loop.run_in_executor(None, lambda: products_collection.find_one({"id": product_id})) or product

    cached_embeddings, reference_embeddings, reference_categories = (
        get_cached_reference_embeddings(product)
    )

    if embed_state.get("embeddings_status") != "ready" and embed_state.get("reason") in (
        "embeddings_pending",
        "embeddings_failed",
    ):
        schedule_product_embedding_job(product_id)

    if embed_state.get("embeddings_status") != "ready":
        reason = embed_state.get("reason", "embeddings_missing")
        if reason == "ai_unavailable":
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "AIServiceUnavailable",
                    "message": embed_state.get("error")
                    or "AI model could not be loaded.",
                },
            )
        raise HTTPException(
            status_code=422,
            detail={
                "error": "EmbeddingsMissing",
                "message": (
                    "Product embeddings are not ready yet. "
                    "Wait a moment after the vendor uploads reference images, then try again."
                ),
                "embeddings_status": embed_state.get("embeddings_status"),
                "embeddings_ready_count": embed_state.get("embeddings_ready_count", 0),
                "embeddings_total_count": embed_state.get("embeddings_total_count", 0),
                "retry_after_seconds": 15,
            },
        )

    logger.info(
        "Embeddings ready for product %s: %d/%d reference images",
        product_id,
        len(cached_embeddings),
        len(reference_images),
    )
    
    # ── 3. VALIDATE & PROCESS CUSTOMER IMAGES ────────────────────────────────
    allowed_types = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    max_size = 5 * 1024 * 1024  # 5MB

    uploaded_metadata = []
    customer_embeddings = []
    quality_report: dict = {}     # keyed by slot — quality flags per image
    phash_values: dict = {}       # keyed by slot — pHash hex per image
    any_reshoot_needed = False    # True if any slot has quality issues

    back_upload = back or packaging
    if not back_upload:
        raise HTTPException(
            status_code=400,
            detail="Back view image is required (form field: back or legacy packaging).",
        )

    # Fetch stored pHashes for this product to detect near-duplicates
    stored_phashes: list = await loop.run_in_executor(
        None,
        lambda: fetch_stored_phashes(verification_sessions_collection, product_id, exclude_qr_id=qr_id),
    )

    # Process required + optional uploads (proof stored but not scored)
    uploads = [("front", front), ("back", back_upload), ("label", label)]
    if proof:
        uploads.append(("proof", proof))

    for image_type, upload_file in uploads:
        # Validate type
        if upload_file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid {image_type} file type. Only JPG, PNG, WEBP allowed."
            )

        # Read & validate size
        contents = await upload_file.read()
        file_size = len(contents)
        if file_size > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"File {upload_file.filename} exceeds 5MB limit"
            )

        # ── Phase 1.1: Customer image quality gate ────────────────────────────
        slot_label = canonical_customer_slot(image_type)
        quality_check = await loop.run_in_executor(
            None,
            lambda c=contents, t=image_type: validate_customer_image_bytes(c, image_type=t),
        )
        quality_report[slot_label] = quality_check
        if not quality_check["passed"]:
            any_reshoot_needed = True
            logger.info(
                "[Verify] Quality flags on %s for QR %s: %s",
                image_type, qr_id, quality_check["quality_flags"],
            )

        # ── Phase 1.4: pHash dedup ────────────────────────────────────────────
        img_phash = await loop.run_in_executor(
            None, lambda c=contents: generate_phash(c)
        )
        if img_phash:
            phash_values[slot_label] = img_phash
            all_hashes_for_check = stored_phashes + [
                h for k, h in phash_values.items() if k != slot_label and h
            ]

        # Save to disk for logging
        ext = os.path.splitext(upload_file.filename or "image")[1]
        if not ext or ext.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            ext = "." + upload_file.content_type.split("/")[-1]

        secure_filename = f"{uuid.uuid4()}{ext}"
        stored_path = os.path.join(UPLOAD_DIR, secure_filename)

        with open(stored_path, "wb") as f:
            f.write(contents)

        stored_type = canonical_customer_slot(image_type)
        uploaded_metadata.append({
            "image_type": stored_type,
            "filename": upload_file.filename,
            "file_size": file_size,
            "content_type": upload_file.content_type,
            "stored_path": f"/static/uploads/{secure_filename}",
            "uploaded_at": datetime.utcnow(),
            "quality_flags": quality_check.get("quality_flags", []),
            "phash": img_phash,
        })

        # Generate customer image embedding (executor — CPU-bound Torch work).
        embedding_result = await loop.run_in_executor(
            None, generate_embedding_from_bytes, contents, upload_file.filename
        )
        if not embedding_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=f"Failed to process {image_type} image: {embedding_result.get('error')}"
            )

        cust_entry = {
            "image_type": stored_type,
            "embedding": embedding_result.get("embedding"),
            "image_bytes": contents,
        }
        customer_embeddings.append(cust_entry)

    # Raise early rejection if quality checks fail and hard rejection is enabled
    if any_reshoot_needed and os.getenv("AUTHENTIQ_QUALITY_HARD_REJECT", "true").lower() in ("true", "1", "yes"):
        errors = []
        failed_slots = []
        instructions_summary = []
        for slot_k, report in quality_report.items():
            if not report["passed"]:
                failed_slots.append(slot_k.upper())
                errors.append({
                    "slot": slot_k,
                    "quality_flags": report["quality_flags"],
                    "reshoot_instructions": report["reshoot_instructions"],
                    "metrics": report.get("metrics"),
                    "scoring": report.get("scoring")
                })
                if report["reshoot_instructions"]:
                    instructions_summary.append(f"[{slot_k.upper()}] {report['reshoot_instructions'][0]}")
        
        if failed_slots:
            slots_str = ", ".join(failed_slots)
            summary_str = " ".join(instructions_summary)
            msg = f"Image quality check failed for slot(s): {slots_str}. {summary_str}"
            
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "ImageQualityRejected",
                    "message": msg,
                    "failed_slots": failed_slots,
                    "quality_details": errors,
                }
            )
    # ── Phase 1.4: Aggregate pHash duplicate detection ────────────────────────
    all_phashes_list = [h for h in phash_values.values() if h]
    duplicate_detection: dict = {"checked": False, "results": {}}
    if all_phashes_list and stored_phashes:
        dup_results = {}
        for slot_k, h in phash_values.items():
            if h:
                dup_results[slot_k] = check_near_duplicate(h, stored_phashes)
        any_flagged = any(r.get("flagged") for r in dup_results.values())
        min_dist = min(
            (r.get("min_distance", 64) for r in dup_results.values()),
            default=64,
        )
        duplicate_detection = {
            "checked": True,
            "flagged": any_flagged,
            "min_hamming_distance": min_dist,
            "per_slot": dup_results,
        }
    else:
        duplicate_detection = {
            "checked": False,
            "flagged": False,
            "note": "No prior submissions found for this product.",
        }

    vendor_doc = None
    if vendor_id:
        vendor_doc = vendors_collection.find_one({"id": vendor_id})

    # ── 4. CATEGORY-MATCHED SCORING (global + patch + OCR fusion) ───────────
    try:
        scoring = await loop.run_in_executor(
            None,
            lambda: run_verification_scoring(
                customer_embeddings,
                cached_embeddings,
                product=product,
                vendor=vendor_doc,
            ),
        )
    except Exception as exc:
        logger.error(f"[Verify] Scoring failed for QR {qr_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "ScoringError",
                "message": f"Verification scoring failed: {str(exc)}",
            }
        )

    if scoring.get("missing_slots"):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "MissingVerificationSlots",
                "message": f"Required verification images missing: {', '.join(scoring['missing_slots'])}",
                "missing_slots": scoring["missing_slots"],
            },
        )

    per_image_comparisons = scoring["per_image_comparisons"]
    aggregate_confidence = scoring["aggregate_confidence"]
    # v7: the VLM decision (with critical-defect veto / fail-closed) is
    # authoritative. Fall back to raw-score banding only if it is absent.
    authenticity_result = scoring.get("authenticity") or assess_authenticity(
        aggregate_confidence,
        scoring.get("thresholds"),
    )
    vlm_report = scoring.get("vlm_report")

    # If the VLM verifier could not run at all (fail-closed), the AI never actually
    # assessed this product. Do NOT present the placeholder 50% / "manual review"
    # verdict — that reads as a real (and misleading) result. Surface a clear error
    # instead so the consumer is never shown a false authenticity outcome. The
    # frontend renders this as an error banner (and retries once on 5xx for a cold
    # model), never as a verdict. NOTE: this is only the *unavailable* case
    # (verdict_source == "fail_closed"); a genuine VLM-assessed "needs_review" (the
    # model ran but was uncertain) is a real verdict and is left untouched.
    if authenticity_result.get("verdict_source") == "fail_closed":
        logger.warning(
            "[Verify] VLM unavailable for QR %s (%s) — returning 503, no verdict shown to user",
            qr_id, authenticity_result.get("veto_reasons"),
        )
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AIServiceUnavailable",
                "message": (
                    "We couldn't complete authentication right now — the AI verification "
                    "service is temporarily unavailable. Please try again in a moment."
                ),
            },
        )

    # ── 5. BUILD SESSION DOCUMENT ──────────────────────────────────────────────
    session_id = f"v_session_{uuid.uuid4().hex[:12]}"
    now = datetime.utcnow()

    is_suspicious = authenticity_result.get("status") in (
        "suspicious",
        "needs_review",
        "counterfeit",
    ) or duplicate_detection.get("flagged", False)   # pHash flag escalates suspicion

    status_map = {
        "authentic": "completed_authentic",
        "likely_authentic": "completed_authentic",
        "needs_review": "completed_suspicious",
        "suspicious": "completed_suspicious",
        "counterfeit": "completed_suspicious",
    }
    session_status = status_map.get(authenticity_result.get("status"), "failed")

    # client_ip / user_agent are provided by the route wrapper (no Request here).
    if location_str:
        parts = [p.strip() for p in location_str.split(",")]
        city = _clean_city_name(parts[0]) if len(parts) > 0 else ""
        state = parts[1] if len(parts) > 1 else ""
        country = parts[2] if len(parts) > 2 else (parts[1] if len(parts) > 1 else "")
        location = {
            "city": city,
            "state": state,
            "country": country,
            "lat": None,
            "lon": None
        }
    else:
        location = await _get_location(client_ip)

    # Gather score_breakdown from per_image_comparisons (first scored slot)
    top_score_breakdown = None
    for pic in per_image_comparisons:
        if pic.get("score_breakdown"):
            top_score_breakdown = pic["score_breakdown"]
            break

    # Aggregate reshoot instructions across all slots
    all_reshoot_instructions = []
    for slot_k, qr in quality_report.items():
        for instr in qr.get("reshoot_instructions", []):
            all_reshoot_instructions.append(f"[{slot_k.upper()}] {instr}")

    ai_report = {
        "authenticity_score": aggregate_confidence,
        "weighted_final_score": scoring.get("weighted_final_score", aggregate_confidence),
        "global_similarity": scoring.get("global_similarity"),
        "region_scores": scoring.get("region_scores"),
        "status": authenticity_result.get("status"),
        "ai_verdict": authenticity_result.get("status"),
        "risk_level": authenticity_result.get("risk_level"),
        "verification_strength": authenticity_result.get("verification_strength"),
        "confidence": aggregate_confidence,
        "explanation": authenticity_result.get("explanation"),
        "per_image_results": per_image_comparisons,
        "score_breakdown": top_score_breakdown,           # CLIP retrieval breakdown (not authoritative)
        "vlm_report": vlm_report,                          # v7: VLM verdict, defects, metadata checks
        "vlm_result": vlm_report,                          # alias for frontend consumers
        "scoring_debug": scoring.get("scoring_debug"),
        "inference_device": scoring.get("device"),
        "processing_time_ms": scoring.get("processing_time_ms"),
        "identity_boost_applied": scoring.get("identity_boost_applied"),
        "anomalies": [],
        "recommendation": "Accept" if aggregate_confidence >= 0.80 else "Review",
        "processed_at": now.isoformat(),
    }
    
    session_doc = {
        "session_id": session_id,
        "qr_id": qr_id,
        "batch_id": None,
        "product_id": product_id,
        "vendor_id": vendor_id,
        "status": session_status,
        "uploaded_images": uploaded_metadata,
        "ai_result": ai_report,
        "quality_report": quality_report,            # Phase 1.1 — per-slot quality flags
        "phash_values": phash_values,                # Phase 1.4 — pHash for dedup
        "duplicate_detection": duplicate_detection,  # Phase 1.4 — near-duplicate check
        "metadata": {
            "ip_address": client_ip,
            "user_agent": user_agent,
            "location": location,
            "scan_timestamp": now,
        },
        "fraud_flag": is_suspicious,
        "created_at": now,
        "updated_at": now
    }
    
    # Log to verification sessions collection if available
    try:
        if verification_sessions_collection is not None:
            verification_sessions_collection.insert_one(session_doc)
            
            # Log calibration data point
            calibrator.log_data_point(
                raw_score=aggregate_confidence,
                metadata={
                    "session_id": session_id,
                    "qr_id": qr_id,
                    "product_id": product_id,
                    "vendor_id": vendor_id,
                },
                collection=verification_sessions_collection,
            )
    except Exception as e:
        logger.error(f"Failed to log verification session: {e}")
    
    # ── 6. UPDATE SCAN COUNTS & BROADCAST ──────────────────────────────────────
    try:
        # Increment QR scan count atomically
        updated_qr = qr_codes_collection.find_one_and_update(
            {"qr_id": qr_id},
            {"$inc": {"scan_count": 1}},
            return_document=ReturnDocument.AFTER
        )
        
        # Invalidate status cache for this QR code
        cache_store.invalidate(f"qr_status:{qr_id}")
        
        scan_count = updated_qr["scan_count"] if updated_qr else (qr.get("scan_count", 0) + 1)
        
        # Log scan event
        actual_product_name = "Unknown Product"
        if product_id:
            product = products_collection.find_one({"id": product_id})
            if product:
                actual_product_name = product.get("name", "Unknown Product")

        activity_str = f"Product Scanned: {actual_product_name}"
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M:%S")

        # Format scanned place
        place_str = "Local, System"
        if location:
            if isinstance(location, dict):
                city = location.get("city") or ""
                state = location.get("state") or ""
                country = location.get("country") or ""
                if city == "Local" and country == "System":
                    place_str = "Local, System"
                else:
                    parts = [p.strip() for p in [city, state, country] if p and p.strip()]
                    if parts:
                        place_str = ", ".join(parts)
            elif isinstance(location, str):
                if "Local" in location or "System" in location:
                    place_str = "Local, System"
                else:
                    place_str = location

        logger.info(f"[{activity_str}, {date_str}, {time_str}, {place_str}]")

        scans_collection.insert_one({
            "qr_id": qr_id,
            "product_id": product_id,
            "product_name": actual_product_name,
            "event_type": "Product Scanned",
            "vendor_id": vendor_id,
            "verification_status": "verified",
            "timestamp": now,
            "created_at": now,
            "ip_address": client_ip,
            "user_agent": user_agent,
            "location": location,
            "is_suspicious": is_suspicious,
            "ai_verified": True,
            "ai_score": aggregate_confidence,
            "ai_status": authenticity_result.get("status"),
        })
        
        # WebSocket broadcast for real-time analytics
        await manager.broadcast({
            "type": "scan_update",
            "qr_id": qr_id,
            "vendor_id": vendor_id,
            "scan_count": scan_count,
            "location": location,
            "is_suspicious": is_suspicious,
            "ai_verified": True,
            "ai_status": authenticity_result.get("status")
        })
    except Exception as e:
        logger.error(f"Error logging verification scan: {e}")
    
    # ── 7. RETURN RESULT ──────────────────────────────────────────────────────
    session_doc.pop("_id", None)

    # Surface quality & dedup info at the top level for frontend convenience
    session_doc["quality_report"] = quality_report
    session_doc["reshoot_instructions"] = all_reshoot_instructions
    session_doc["any_reshoot_needed"] = any_reshoot_needed
    session_doc["duplicate_detection"] = duplicate_detection

    # jsonable_encoder converts datetime → ISO string and ObjectId → str so
    # FastAPI can serialize the response without raising a 500. The route wrapper
    # wraps this dict in a JSONResponse (sync) or stores it for polling (background).
    return jsonable_encoder(session_doc)
