"""
Brand CRUD routes — vendor-scoped.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from app.core import security
from app.core.db import brands_collection, vendors_collection, plans_collection
from app.core.limits import enforce_organization_limit
from app.schemas.brand import BrandCreate, BrandUpdate

logger = logging.getLogger(__name__)

from app.core.audit import log_vendor_action

router = APIRouter()

BRAND_LOGO_ROOT = os.path.join("static", "brand_logos")
ALLOWED_LOGO_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_LOGO_BYTES = 2 * 1024 * 1024   # 2 MB


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_vendor_id(current_user: dict) -> str:
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="No vendor linked to this account")
    return vendor_id


def _get_brand_or_404(brand_id: str, vendor_id: str) -> dict:
    brand = brands_collection.find_one({"id": brand_id, "vendor_id": vendor_id})
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found or access denied")
    return brand


def _serialize_brand(b: dict) -> dict:
    b.pop("_id", None)
    return b


def _logo_ext(file: UploadFile) -> str:
    ct = file.content_type or ""
    if "jpeg" in ct or "jpg" in ct:
        return ".jpg"
    if "webp" in ct:
        return ".webp"
    return ".png"


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_brands(current_user: dict = Depends(security.get_current_vendor)):
    """Return all brands owned by the current vendor."""
    vendor_id = _get_vendor_id(current_user)
    brands = list(brands_collection.find({"vendor_id": vendor_id}, {"_id": 0}).sort("created_at", 1))
    return {"brands": brands}


@router.post("", status_code=201)
async def create_brand(
    body: BrandCreate,
    current_user: dict = Depends(security.require_permission("BRAND_CREATE")),
):
    """Create a new brand under the current vendor."""
    vendor_id = _get_vendor_id(current_user)

    # Enforce plan brand limits
    enforce_organization_limit(vendor_id, "max_brands")

    if not body.product_categories or len(body.product_categories) == 0:
        raise HTTPException(
            status_code=400,
            detail="At least one product category is required",
        )

    # Uniqueness check — brand name must be unique per vendor
    existing = brands_collection.find_one({"vendor_id": vendor_id, "brand_name": body.brand_name})
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Brand '{body.brand_name}' already exists for this vendor",
        )

    brand_id = str(uuid.uuid4())
    now = datetime.utcnow()
    doc = {
        "id": brand_id,
        "vendor_id": vendor_id,
        "brand_name": body.brand_name,
        "brand_display_name": body.brand_display_name or body.brand_name,
        "brand_logo_url": None,
        "brand_tagline": body.brand_tagline,
        "product_categories": body.product_categories or [],
        "status": "active",
        "created_at": now,
        "updated_at": now,
    }
    brands_collection.insert_one(doc)
    log_vendor_action(vendor_id, current_user.get("email"), "Brand Created", {"description": f"Brand '{body.brand_name}' registered."})
    doc.pop("_id", None)
    logger.info("Brand created: vendor=%s brand=%s", vendor_id, brand_id)
    return doc


@router.get("/{brand_id}")
async def get_brand(
    brand_id: str,
    current_user: dict = Depends(security.get_current_vendor),
):
    vendor_id = _get_vendor_id(current_user)
    return _serialize_brand(_get_brand_or_404(brand_id, vendor_id))


@router.patch("/{brand_id}")
async def update_brand(
    brand_id: str,
    body: BrandUpdate,
    current_user: dict = Depends(security.require_permission("BRAND_EDIT")),
):
    """Update brand details (all fields optional)."""
    vendor_id = _get_vendor_id(current_user)
    _get_brand_or_404(brand_id, vendor_id)

    if body.product_categories is not None and len(body.product_categories) == 0:
        raise HTTPException(
            status_code=400,
            detail="At least one product category is required",
        )

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.utcnow()
    brands_collection.update_one({"id": brand_id}, {"$set": updates})
    log_vendor_action(vendor_id, current_user.get("email"), "Brand Updated", {"description": f"Brand '{brand.get('brand_name')}' details updated."})
    updated = brands_collection.find_one({"id": brand_id}, {"_id": 0})
    return updated


@router.delete("/{brand_id}")
async def delete_brand(
    brand_id: str,
    hard: bool = False,
    current_user: dict = Depends(security.require_permission("BRAND_DELETE")),
):
    """Soft-delete or hard-delete a brand.
    If hard=True, permanently deletes the brand if no active products are linked.
    """
    vendor_id = _get_vendor_id(current_user)
    brand = _get_brand_or_404(brand_id, vendor_id)
    
    if hard:
        # Check if there are active products linked to this brand
        from app.core.db import products_collection
        linked_products_count = products_collection.count_documents(
            {"brand_id": brand_id, "archived": {"$ne": True}}
        )
        if linked_products_count > 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot permanently delete this brand as there are active products associated with it. Archive the products first."
            )
        
        # Delete brand logo if exists
        logo_url = brand.get("brand_logo_url")
        if logo_url:
            rel = logo_url.lstrip("/")
            if os.path.exists(rel):
                try:
                    os.remove(rel)
                except Exception as e:
                    logger.warning("Could not delete brand logo file %s: %s", rel, e)
                    
        # Remove directory if empty
        target_dir = os.path.join(BRAND_LOGO_ROOT, vendor_id, brand_id)
        if os.path.exists(target_dir):
            try:
                import shutil
                shutil.rmtree(target_dir)
            except Exception:
                pass
                
        # Perform permanent database deletion
        brands_collection.delete_one({"id": brand_id})
        log_vendor_action(vendor_id, current_user.get("email"), "Brand Deleted", {"description": f"Brand '{brand.get('brand_name')}' permanently deleted."})
        return {"message": "Brand permanently deleted", "brand_id": brand_id, "hard": True}
        
    else:
        # Soft-delete: set status to 'inactive'
        brands_collection.update_one(
            {"id": brand_id},
            {"$set": {"status": "inactive", "updated_at": datetime.utcnow()}},
        )
        log_vendor_action(vendor_id, current_user.get("email"), "Brand Deactivated", {"description": f"Brand '{brand.get('brand_name')}' deactivated."})
        return {"message": "Brand deactivated successfully", "brand_id": brand_id, "hard": False}


@router.post("/{brand_id}/logo")
async def upload_brand_logo(
    brand_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(security.require_permission("BRAND_EDIT")),
):
    """Upload or replace the brand logo. Accepts PNG / WEBP, max 2 MB."""
    vendor_id = _get_vendor_id(current_user)
    _get_brand_or_404(brand_id, vendor_id)

    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Logo must be JPG, PNG, or WEBP")

    contents = await file.read()
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="Logo must be under 2 MB")

    ext = _logo_ext(file)
    target_dir = os.path.join(BRAND_LOGO_ROOT, vendor_id, brand_id)
    os.makedirs(target_dir, exist_ok=True)

    filename = f"logo_{uuid.uuid4()}{ext}"
    abs_path = os.path.join(target_dir, filename)
    with open(abs_path, "wb") as f:
        f.write(contents)

    url_path = f"/static/brand_logos/{vendor_id}/{brand_id}/{filename}"
    brands_collection.update_one(
        {"id": brand_id},
        {"$set": {"brand_logo_url": url_path, "updated_at": datetime.utcnow()}},
    )
    return {"brand_logo_url": url_path, "message": "Brand logo updated"}


@router.delete("/{brand_id}/logo")
async def delete_brand_logo(
    brand_id: str,
    current_user: dict = Depends(security.require_permission("BRAND_EDIT")),
):
    """Remove the brand logo."""
    vendor_id = _get_vendor_id(current_user)
    brand = _get_brand_or_404(brand_id, vendor_id)

    logo_url = brand.get("brand_logo_url")
    if logo_url:
        rel = logo_url.lstrip("/")
        if os.path.exists(rel):
            try:
                os.remove(rel)
            except Exception as e:
                logger.warning("Could not delete brand logo file %s: %s", rel, e)

    brands_collection.update_one(
        {"id": brand_id},
        {"$unset": {"brand_logo_url": ""}, "$set": {"updated_at": datetime.utcnow()}},
    )
    log_vendor_action(vendor_id, current_user.get("email"), "Brand Logo Removed", {"description": f"Brand logo removed for '{brand.get('brand_name')}'."})
    return {"message": "Brand logo removed"}
