"""
AI-powered product authenticity verification routes.

Provides endpoints for:
- Generating embeddings for customer verification images
- Comparing against official product reference embeddings
- Returning authenticity confidence scores

PERFORMANCE NOTES:
- The OpenCLIP model loads LAZILY — only when the first verify-product call arrives.
- All Torch inference runs in a thread-pool executor so the FastAPI event loop
  is never blocked by CPU-bound AI work.
- Auth, scan, and all other routes are completely unaffected by AI load time.
"""

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from app.core.limiter import limiter
from app.core.db import products_collection, scans_collection, vendors_collection
from app.services.openclip_service import (
    generate_embedding_from_bytes,
    assess_authenticity,
    health_check,
    get_model_singleton,
)
from app.services.embedding_jobs import (
    ensure_product_embeddings_ready,
    get_cached_reference_embeddings,
)
from app.services.calibration_layer import calibrator
from app.services.verification_matching import (
    canonical_customer_slot,
    run_verification_scoring,
    CORE_SCORING_SLOTS,
)
from datetime import datetime
import asyncio
import uuid
import logging
from typing import List, Optional
from functools import partial

logger = logging.getLogger(__name__)

router = APIRouter()

# ────────────────────────────────────────────────────────────────────────────
# Configuration
# ────────────────────────────────────────────────────────────────────────────

ALLOWED_VERIFICATION_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_VERIFICATION_IMAGE_BYTES = 5 * 1024 * 1024  # 5MB
MAX_VERIFICATION_IMAGES = 5  # Max images per verification request

DEFAULT_VERIFY_SLOT_ORDER = list(CORE_SCORING_SLOTS)


# ────────────────────────────────────────────────────────────────────────────
# Health Check
# ────────────────────────────────────────────────────────────────────────────

@router.get("/health")
@limiter.limit("60/minute")
async def ai_health(request: Request):
    """Check if AI verification service is ready."""
    return health_check()


# ────────────────────────────────────────────────────────────────────────────
# Product Verification
# ────────────────────────────────────────────────────────────────────────────

@router.post("/verify-product")
@limiter.limit("30/minute")
async def verify_product(
    request: Request,
    product_id: str,
    qr_id: Optional[str] = None,
    image_types: Optional[str] = Form(
        None,
        description="Comma-separated slots: front,back,label (defaults to order when 3 files)",
    ),
    files: List[UploadFile] = File(...),
):
    """
    Verify product authenticity by comparing customer-uploaded images
    against official product reference embeddings.
    
    Args:
        product_id: Product ID to verify
        qr_id: QR code ID (for audit logging)
        files: Customer verification images
    
    Returns:
        Verification result with confidence scores and authenticity status
    """
    
    # Validate product exists
    product = products_collection.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Validate reference images exist
    reference_images = product.get("reference_images", [])
    if not reference_images:
        raise HTTPException(
            status_code=400,
            detail="Product has no reference images for comparison"
        )
    
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
                "message": "AI verification service is unavailable.",
                "technical": singleton._load_error,
            },
        )

    embed_state = await ensure_product_embeddings_ready(product_id, allow_inline_generation=True)
    product = await loop.run_in_executor(None, lambda: products_collection.find_one({"id": product_id})) or product
    cached_images, reference_embeddings, _reference_categories = (
        get_cached_reference_embeddings(product)
    )

    if not reference_embeddings:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "EmbeddingsMissing",
                "message": "Product reference embeddings not ready or missing.",
                "embeddings_status": embed_state.get("embeddings_status"),
                "retry_after_seconds": 15,
            },
        )

    logger.info(
        "Embeddings ready for product %s: %d reference vectors",
        product_id,
        len(reference_embeddings),
    )

    # Validate customer images
    if not files:
        raise HTTPException(status_code=400, detail="No verification images provided")
    
    if len(files) > MAX_VERIFICATION_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_VERIFICATION_IMAGES} verification images allowed"
        )
    
    if image_types:
        slot_list = [
            canonical_customer_slot(s.strip())
            for s in image_types.split(",")
            if s.strip()
        ]
    elif len(files) == 3:
        slot_list = list(DEFAULT_VERIFY_SLOT_ORDER)
    else:
        slot_list = ["front"] * len(files)

    vendor_doc = None
    vid = product.get("vendor_id")
    if vid:
        vendor_doc = vendors_collection.find_one({"id": vid})

    customer_embeddings = []

    for idx, file in enumerate(files):
        # Validate file type
        if file.content_type not in ALLOWED_VERIFICATION_IMAGE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type: {file.content_type}. "
                       "Only JPG, PNG, and WEBP allowed."
            )

        # Validate file size
        contents = await file.read()
        if len(contents) > MAX_VERIFICATION_IMAGE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File {file.filename} too large. Max 5MB."
            )

        # Generate embedding — runs in thread pool so Torch inference never
        # blocks the FastAPI event loop (sync CPU-bound call).
        result = await loop.run_in_executor(
            None,
            partial(generate_embedding_from_bytes, contents, file.filename or "unknown"),
        )
        if not result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=f"Failed to process image {file.filename}: {result.get('error')}"
            )

        slot = slot_list[idx] if idx < len(slot_list) else "front"
        entry = {
            "image_type": slot,
            "filename": file.filename,
            "embedding": result.get("embedding"),
            "image_bytes": contents,
        }
        customer_embeddings.append(entry)

    scoring = await loop.run_in_executor(
        None,
        lambda: run_verification_scoring(
            customer_embeddings,
            cached_images,
            product=product,
            vendor=vendor_doc,
        ),
    )

    aggregate_confidence = scoring["aggregate_confidence"]
    per_image_results = scoring["per_image_comparisons"]
    thresholds = scoring.get("thresholds", {})
    # v7: prefer the authoritative VLM decision (veto / fail-closed aware).
    authenticity = scoring.get("authenticity") or assess_authenticity(
        aggregate_confidence, thresholds
    )

    response = {
        "verification_id": str(uuid.uuid4()),
        "product_id": product_id,
        "qr_id": qr_id,
        "status": authenticity.get("status"),
        "ai_verdict": authenticity.get("status"),
        "risk_level": authenticity.get("risk_level"),
        "verification_strength": authenticity.get("verification_strength"),
        "confidence_score": aggregate_confidence,
        "weighted_final_score": scoring.get("weighted_final_score", aggregate_confidence),
        "global_similarity": scoring.get("global_similarity"),
        "region_scores": scoring.get("region_scores"),
        "explanation": authenticity.get("explanation"),
        "per_image_results": per_image_results,
        "vlm_report": scoring.get("vlm_report"),
        "vlm_result": scoring.get("vlm_report"),
        "scoring_debug": scoring.get("scoring_debug"),
        "inference_device": scoring.get("device"),
        "processing_time_ms": scoring.get("processing_time_ms"),
        "identity_boost_applied": scoring.get("identity_boost_applied"),
        "num_images_verified": len(customer_embeddings),
        "num_reference_images": len(reference_embeddings),
        "verified_at": datetime.utcnow().isoformat(),
        "thresholds": thresholds,
    }
    
    # Log verification to database (for audit trail)
    try:
        _log_verification(product_id, qr_id, response)
    except Exception as e:
        logger.error(f"Failed to log verification: {e}")
        # Don't fail the response if logging fails
    
    return response


def _log_verification(product_id: str, qr_id: Optional[str], result: dict) -> None:
    """Log verification attempt for audit trail."""
    try:
        verification_record = {
            "id": result.get("verification_id"),
            "product_id": product_id,
            "qr_id": qr_id,
            "status": result.get("status"),
            "risk_level": result.get("risk_level"),
            "confidence_score": result.get("confidence_score"),
            "num_images": result.get("num_images_verified"),
            "created_at": datetime.utcnow(),
        }
        
        # Insert into a verification_logs collection
        # This is optional but useful for analytics
        # For now, we'll skip if collection doesn't exist
        try:
            from app.core.db import verification_sessions_collection
            
            # Log calibration data point
            calibrator.log_data_point(
                raw_score=result.get("confidence_score", 0.0),
                metadata={
                    "session_id": result.get("verification_id"),
                    "qr_id": qr_id,
                    "product_id": product_id,
                },
                collection=verification_sessions_collection,
            )
            
            from app.core.db import verification_logs_collection
            verification_logs_collection.insert_one(verification_record)
        except:
            logger.debug("Verification logs collection not available")
    
    except Exception as e:
        logger.error(f"Error logging verification: {e}")


# ────────────────────────────────────────────────────────────────────────────
# Batch Verification Status
# ────────────────────────────────────────────────────────────────────────────

@router.get("/verification-status/{verification_id}")
@limiter.limit("60/minute")
async def get_verification_status(
    request: Request,
    verification_id: str,
):
    """
    Retrieve verification result by ID.
    
    Note: Verifications are returned immediately, so this is mainly for
    fetching historical records if stored in database.
    """
    # In current implementation, verifications are returned immediately
    # This endpoint is a placeholder for future enhancements like
    # storing verification history
    
    raise HTTPException(
        status_code=404,
        detail="Verification history not yet enabled. "
               "Verifications are returned immediately in the response."
    )


# ────────────────────────────────────────────────────────────────────────────
# Region debug (YOLO + heuristics visualization)
# ────────────────────────────────────────────────────────────────────────────

@router.post("/region-debug")
@limiter.limit("20/minute")
async def region_debug(
    request: Request,
    file: UploadFile = File(...),
    return_image: bool = Form(False),
):
    """
    Debug YOLO/heuristic region proposals on a single image.
    Set return_image=true to receive base64 JPEG with bounding boxes drawn.
    """
    import base64

    from app.services.region_detection import detect_authenticity_regions, render_debug_overlay
    from app.services.region_embeddings import generate_region_embeddings_from_bytes
    from app.services.yolo_service import health_check as yolo_health

    contents = await file.read()
    regions, det_meta = detect_authenticity_regions(contents)
    embedded = generate_region_embeddings_from_bytes(contents)

    payload = {
        "yolo_health": yolo_health(),
        "detection_meta": det_meta,
        "regions": [
            {k: v for k, v in r.items() if k != "crop"}
            for r in (embedded.get("regions") or [])
        ],
        "region_count": len(embedded.get("regions") or []),
    }
    if return_image:
        overlay = render_debug_overlay(contents, regions)
        payload["debug_image_base64"] = base64.b64encode(overlay).decode("ascii")
    return payload


# ────────────────────────────────────────────────────────────────────────────
# Update Thresholds (Admin endpoint)
# ────────────────────────────────────────────────────────────────────────────

@router.put("/update-thresholds")
@limiter.limit("10/minute")
async def update_authenticity_thresholds(
    request: Request,
    thresholds: dict,
):
    """
    Update authenticity confidence thresholds (admin only).
    
    This is a placeholder for admin functionality.
    In production, add authentication/authorization checks.
    """
    # Validate thresholds
    required_keys = {"highly_authentic", "likely_authentic", "suspicious"}
    if not required_keys.issubset(thresholds.keys()):
        raise HTTPException(
            status_code=400,
            detail=f"Thresholds must include: {required_keys}"
        )
    
    # Validate threshold values are in descending order
    vals = [
        thresholds["highly_authentic"],
        thresholds["likely_authentic"],
        thresholds["suspicious"],
    ]
    
    if not all(vals[i] >= vals[i+1] for i in range(len(vals)-1)):
        raise HTTPException(
            status_code=400,
            detail="Thresholds must be in descending order"
        )
    
    from app.services.openclip_service import AUTHENTICITY_THRESHOLDS

    AUTHENTICITY_THRESHOLDS.update(thresholds)

    return {
        "status": "success",
        "message": "Thresholds updated (global defaults)",
        "current_thresholds": dict(AUTHENTICITY_THRESHOLDS),
    }
