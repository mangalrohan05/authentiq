from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse
from app.schemas.qr import QRGenerate, QRResponse, QRGenerateBulk
from app.core.db import qr_codes_collection, products_collection
from app.core.security import get_current_vendor
from app.core.limiter import limiter
from app.services.feature_resolver import resolve_vendor_features
import uuid
from datetime import datetime, timedelta
import os
import pandas as pd
from io import StringIO

router = APIRouter()

# In a real app, this would be the public URL of the frontend
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# QR codes expire after 1 year by default
QR_EXPIRY_DAYS = 365


@router.post("/generate")
@limiter.limit("10/minute")
async def generate_qr(
    request: Request,
    data: QRGenerate,
    current_user: dict = Depends(get_current_vendor),
):
    """Vendor-only: generate a QR code for a product."""
    vendor_id = current_user.get("vendor_id")
    # Verify product exists
    product = products_collection.find_one({"id": data.product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Security: Ensure vendor owns this product
    if product.get("vendor_id") and product.get("vendor_id") != vendor_id:
        raise HTTPException(status_code=403, detail="Access denied: product belongs to another vendor")

    # Check if QR already exists for this product
    existing_qr = qr_codes_collection.find_one({"product_id": data.product_id})
    if existing_qr:
        return {
            "qr_id": existing_qr["qr_id"],
            "verification_url": f"{FRONTEND_URL}/verify/{existing_qr['qr_id']}",
            "product_id": data.product_id,
            "message": "Existing QR retrieved",
        }

    qr_id = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(days=QR_EXPIRY_DAYS)
    qr_entry = {
        "qr_id": qr_id,
        "product_id": data.product_id,
        "timestamp": datetime.utcnow(),
        "scan_count": 0,
        "expires_at": expires_at,
        "status": "active"
    }

    qr_codes_collection.insert_one(qr_entry)

    verification_url = f"{FRONTEND_URL}/verify/{qr_id}"

    # Update the product with the generated QR code
    products_collection.update_one(
        {"id": data.product_id},
        {"$set": {"qr_id": qr_id, "verification_url": verification_url}},
    )

    return {
        "qr_id": qr_id,
        "verification_url": verification_url,
        "product_id": data.product_id,
    }


@router.post("/generate-bulk")
@limiter.limit("10/minute")
async def generate_bulk_qr(
    request: Request,
    data: QRGenerateBulk,
    current_user: dict = Depends(get_current_vendor),
):
    """Vendor-only: generate multiple unique QR codes for a product."""
    vendor_id = current_user.get("vendor_id")
    # Verify product exists
    product = products_collection.find_one({"id": data.product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Security: Ensure vendor owns this product
    if product.get("vendor_id") and product.get("vendor_id") != vendor_id:
        raise HTTPException(status_code=403, detail="Access denied: product belongs to another vendor")
        
    # Feature Gating: bulk_qr
    features = await resolve_vendor_features(vendor_id)
    if not features.bulk_qr:
        raise HTTPException(status_code=403, detail="Your current plan does not support bulk QR generation.")

    # Enforce count limit (50 max for now, or whatever is specified)
    count = data.count if data.count and 0 < data.count <= 100 else 50

    qr_entries = []
    verification_urls = []
    expires_at = datetime.utcnow() + timedelta(days=QR_EXPIRY_DAYS)

    for _ in range(count):
        qr_id = str(uuid.uuid4())
        verification_url = f"{FRONTEND_URL}/verify/{qr_id}"
        
        qr_entry = {
            "qr_id": qr_id,
            "product_id": data.product_id,
            "timestamp": datetime.utcnow(),
            "scan_count": 0,
            "expires_at": expires_at,
            "status": "active"
        }
        qr_entries.append(qr_entry)
        verification_urls.append(verification_url)

    if qr_entries:
        qr_codes_collection.insert_many(qr_entries)

    # If the product doesn't already have one, update with the first generated QR code details
    if not product.get("qr_id"):
        products_collection.update_one(
            {"id": data.product_id},
            {"$set": {"qr_id": qr_entries[0]["qr_id"], "verification_url": verification_urls[0]}},
        )

    return {
        "product_id": data.product_id,
        "count": count,
        "qrs": [
            {"qr_id": item["qr_id"], "verification_url": f"{FRONTEND_URL}/verify/{item['qr_id']}"}
            for item in qr_entries
        ]
    }


@router.get("/{product_id}/export-qrs")
async def export_product_qrs(
    product_id: str,
    current_user: dict = Depends(get_current_vendor),
):
    """Vendor-only: Export all QR codes generated for a specific product to CSV."""
    vendor_id = current_user.get("vendor_id")
    # Verify product exists and belongs to vendor
    product = products_collection.find_one({"id": product_id, "vendor_id": vendor_id})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or access denied")

    # Feature Gating: csv_export
    features = await resolve_vendor_features(vendor_id)
    if not features.csv_export:
        raise HTTPException(status_code=403, detail="Your current plan does not support data exporting.")

    qrs = list(qr_codes_collection.find({"product_id": product_id}))
    
    csv_data = []
    for idx, qr in enumerate(qrs, 1):
        csv_data.append({
            "Serial Number": idx,
            "QR ID": qr.get("qr_id"),
            "Verification URL": f"{FRONTEND_URL}/verify/{qr.get('qr_id')}",
            "Scan Count": qr.get("scan_count", 0),
            "Status": qr.get("status", "active"),
            "Created At": qr.get("timestamp").isoformat() if qr.get("timestamp") else ""
        })

    df = pd.DataFrame(csv_data)
    stream = StringIO()
    df.to_csv(stream, index=False)

    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=qr_codes_export_{product_id}_{datetime.utcnow().strftime('%Y%m%d%H%M')}.csv"
    return response
