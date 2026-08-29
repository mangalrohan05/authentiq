from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form, status
from typing import Optional
from app.schemas.product import ProductCreate, ProductUpdate, QRCustomizationUpdate
from app.core.limiter import limiter
from app.core.db import (
    products_collection,
    vendors_collection,
    plans_collection,
    company_qr_collection,
    brands_collection,
    scans_collection,
)
from app.core.security import get_current_user, get_current_vendor, require_permission
from app.core.limits import enforce_organization_limit
from app.core.websocket_manager import manager
from app.services.embedding_jobs import (
    schedule_product_embedding_job,
    get_product_embedding_status,
    summarize_embeddings,
)
from app.services.image_quality import validate_reference_image_bytes
import uuid
import asyncio
from datetime import datetime
import os
import logging

logger = logging.getLogger(__name__)

from app.core.audit import log_vendor_action

router = APIRouter()


def require_write_permission(current_user: dict = Depends(get_current_user)):
    """
    Dependency to ensure user has write permissions.
    Viewers are restricted to read-only access.
    """
    if current_user.get("role") == "Viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Viewers have read-only access and cannot perform write operations."
        )
    return current_user

REFERENCE_IMAGE_ROOT = os.path.join("static", "reference_images")
ALLOWED_REFERENCE_IMAGE_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
ALLOWED_REFERENCE_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_REFERENCE_VIEW_TYPES = {
    "front",
    "front_view",
    "label",
    "back",
    "back_view",
    "side",
    "side_view",
    "packaging",
    "labels",
    "holograms",
    "seals",
    "barcode_qr",
    "other",
    "additional_markers",
}
MAX_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024


def _validate_reference_view_type(view_type: str) -> None:
    if view_type not in ALLOWED_REFERENCE_VIEW_TYPES:
        raise HTTPException(status_code=400, detail="Invalid reference image view type.")


async def _read_validated_reference_image(file: UploadFile) -> tuple[bytes, int]:
    if file.content_type not in ALLOWED_REFERENCE_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only JPG, JPEG, PNG, and WEBP are allowed."
        )

    contents = await file.read()
    file_size = len(contents)
    if file_size > MAX_REFERENCE_IMAGE_BYTES:
        raise HTTPException(
            status_code=400,
            detail="File is too large. Maximum size is 5MB."
        )
    return contents, file_size


def _reference_image_extension(file: UploadFile) -> str:
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext in ALLOWED_REFERENCE_IMAGE_EXTENSIONS:
        return ext
    if file.content_type == "image/jpeg" or file.content_type == "image/jpg":
        return ".jpg"
    if file.content_type == "image/png":
        return ".png"
    if file.content_type == "image/webp":
        return ".webp"
    return ".bin"


def _reference_image_path(vendor_id: str, product_id: str, filename: str) -> str:
    return os.path.join(REFERENCE_IMAGE_ROOT, vendor_id, product_id, filename)


def get_strict_group(view_type: str) -> Optional[str]:
    if view_type in {"front", "front_view"}:
        return "front"
    if view_type in {"back", "back_view"}:
        return "back"
    if view_type in {"label", "labels"}:
        return "label"
    return None


@router.post("/create")
@limiter.limit("200/minute")
async def create_product(
    request: Request,
    product: ProductCreate,
    current_user: dict = Depends(require_write_permission),
):
    """Vendor-only: register a standalone product (no batch required)."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="Invalid vendor context")

    # SKU uniqueness check per vendor
    # Note: A compound unique index on (vendor_id, sku) should be created in db.py
    # to enforce uniqueness at the database level and prevent race conditions.
    if product.sku:
        existing = products_collection.find_one({"vendor_id": vendor_id, "sku": product.sku})
        if existing:
            raise HTTPException(status_code=409, detail=f"SKU '{product.sku}' already exists for this vendor")

    # Enforce SKU/product limit
    enforce_organization_limit(vendor_id, "max_products")


    product_dict = product.model_dump()
    product_id = str(uuid.uuid4())
    product_dict["id"] = product_id
    product_dict["vendor_id"] = vendor_id
    product_dict["timestamp"] = datetime.utcnow()
    product_dict["updated_at"] = datetime.utcnow()
    product_dict["reference_images"] = []
    product_dict.update(summarize_embeddings([]))
    # Remove batch_id if accidentally passed (backward compat — ignored)
    product_dict.pop("batch_id", None)

    # If brand_id is provided, auto-populate the legacy brand string for backward compat
    if product_dict.get("brand_id"):
        brand_doc = brands_collection.find_one({"id": product_dict["brand_id"], "vendor_id": vendor_id})
        if not brand_doc:
            raise HTTPException(status_code=404, detail="Brand not found or access denied")
        if not product_dict.get("brand"):
            product_dict["brand"] = brand_doc.get("brand_name", "")

    products_collection.insert_one(product_dict)

    log_vendor_action(vendor_id, current_user.get("email"), "Product Registered", {"description": f"Product '{product.name}' was created."})

    try:
        from app.services.logging_service import log_product_activity
        log_product_activity(action="ADD", product_name=product.name, vendor_id=vendor_id, product_id=product_id, user_email=current_user.get("email"))
    except Exception as e:
        logger.warning(f"Failed to log product creation event: {e}")

    try:
        await manager.broadcast({"type": "product_update", "product_id": product_id})
    except Exception:
        pass

    return {"id": product_id, "product_id": product_id, "name": product.name, "brand": product.brand}


@router.get("/list")
@limiter.limit("200/minute")
async def get_products(
    request: Request,
    brand_id: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
):
    """Authenticated: flat list of products, scoped by vendor with pagination support.

    Optional query param ``brand_id`` filters products to a specific brand.
    """
    query = {"archived": {"$ne": True}}
    if current_user.get("role") in ("vendor", "Administrator", "Manager", "Viewer"):
        vendor_id = current_user.get("vendor_id")
        if not vendor_id:
            return {
                "products": [],
                "pagination": {
                    "total": 0,
                    "page": page,
                    "limit": limit,
                    "pages": 0
                }
            }
        query["vendor_id"] = vendor_id

    # Filter by active brand when a brand_id is supplied
    if brand_id:
        query["brand_id"] = brand_id

    page = max(1, page)
    limit = max(1, min(100, limit))
    skip = (page - 1) * limit

    # Count total documents matching query
    total_count = products_collection.count_documents(query)

    # Use database projection to exclude large embedding vector lists
    projection = {
        "_id": 0,
        "front_embedding": 0,
        "back_embedding": 0,
        "label_embedding": 0,
        "receipt_embedding": 0
    }

    products = list(
        products_collection.find(query, projection)
        .sort("timestamp", -1)
        .skip(skip)
        .limit(limit)
    )

    product_ids = [p["id"] for p in products if p.get("id")]
    vendor_ids = list({p.get("vendor_id") for p in products if p.get("vendor_id")})
    company_qr_map = {}
    if vendor_ids:
        qr_rows = list(
            company_qr_collection.find({"company_id": {"$in": vendor_ids}}, {"_id": 0})
        )
        company_qr_map = {row.get("company_id"): row for row in qr_rows if row.get("company_id")}

    # Enrich each product with QR details for registry table
    for p in products:
        p["batch_count"] = 0

        company_qr = company_qr_map.get(p.get("vendor_id"))
        p["qrCode"] = company_qr.get("id") if company_qr else None
        p["verificationUrl"] = (
            company_qr.get("verification_url") or company_qr.get("qr_code_url")
            if company_qr
            else None
        )
        p["qrGenerated"] = bool(company_qr)
        p["generatedAt"] = company_qr.get("created_at") if company_qr else None

    return {
        "products": products,
        "pagination": {
            "total": total_count,
            "page": page,
            "limit": limit,
            "pages": (total_count + limit - 1) // limit if limit > 0 else 1
        }
    }


@router.get("/{product_id}")
@limiter.limit("200/minute")
async def get_product(request: Request, product_id: str, current_user: dict = Depends(get_current_user)):
    """Authenticated: get a single product."""
    product = products_collection.find_one({"id": product_id, "archived": {"$ne": True}}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Vendor isolation
    if current_user.get("role") in ("vendor", "Administrator", "Manager", "Viewer"):
        if product.get("vendor_id") != current_user.get("vendor_id"):
            raise HTTPException(status_code=403, detail="Access denied")

    product["batches"] = []

    return product


@router.patch("/{product_id}")
@limiter.limit("200/minute")
async def update_product(
    request: Request,
    product_id: str,
    payload: ProductUpdate,
    current_user: dict = Depends(require_write_permission),
):
    """Vendor-only: update an existing product."""
    vendor_id = current_user.get("vendor_id")
    product = products_collection.find_one({"id": product_id, "vendor_id": vendor_id, "archived": {"$ne": True}})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or access denied")

    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.utcnow()
    products_collection.update_one({"id": product_id}, {"$set": update_data})
    log_vendor_action(vendor_id, current_user.get("email"), "Product Updated", {"description": f"Product '{product.get('name')}' updated."})
    return {"message": "Product updated successfully", "product_id": product_id}


@router.delete("/{product_id}")
@limiter.limit("200/minute")
async def archive_product(
    request: Request,
    product_id: str,
    current_user: dict = Depends(require_write_permission),
):
    """Vendor-only: archive a product (soft delete)."""
    vendor_id = current_user.get("vendor_id")
    product = products_collection.find_one({"id": product_id, "vendor_id": vendor_id, "archived": {"$ne": True}})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or access denied")

    # Strict Rules Compliance:
    # 1. Zero Mutation: Do not reference, update, or modify any existing log rows in the database.
    # 2. Append-Only Logging: Only trigger a new INSERT (insert_one) for 'Product Deleted'.
    # 3. Preservation: Leave the original 'Product Added' row completely untouched.
    # 4. Logic Check: No 'onUpdate' or 'onModify' event/database listeners are triggered.
    try:
        from app.services.logging_service import log_product_activity
        log_product_activity(action="DELETE", product_name=product.get("name", ""), vendor_id=vendor_id, product_id=product_id, user_email=current_user.get("email"))
    except Exception as e:
        logger.warning(f"Failed to log product deletion event: {e}")

    products_collection.update_one(
        {"id": product_id},
        {"$set": {"archived": True, "updated_at": datetime.utcnow()}}
    )
    log_vendor_action(vendor_id, current_user.get("email"), "Product Archived", {"description": f"Product '{product.get('name')}' soft-deleted (archived)."})
    return {"message": "Product archived successfully"}


@router.post("/{product_id}/reference-images")
@limiter.limit("50/minute")
async def upload_reference_image(
    request: Request,
    product_id: str,
    view_type: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(require_write_permission),
):
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="Invalid vendor context")

    product = products_collection.find_one({"id": product_id, "vendor_id": vendor_id, "archived": {"$ne": True}})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or access denied")

    _validate_reference_view_type(view_type)
    contents, file_size = await _read_validated_reference_image(file)

    # Check for duplicate uploads by content hash to prevent duplicates
    import hashlib
    content_hash = hashlib.sha256(contents).hexdigest()
    existing_images = product.get("reference_images", [])
    for img in existing_images:
        if img.get("content_hash") == content_hash:
            # Return existing image instead of creating duplicate
            logger.info(f"Duplicate image detected for product {product_id}, returning existing image")
            return {
                "id": img.get("id"),
                "filename": img.get("filename"),
                "url": img.get("url"),
                "view_type": img.get("view_type"),
                "size_bytes": img.get("size_bytes"),
                "content_type": img.get("content_type"),
                "uploaded_at": img.get("uploaded_at"),
                "embedding_cached": img.get("embedding_cached", False),
                "embedding_cached_at": img.get("embedding_cached_at"),
                "embedding_vector": img.get("embedding_vector"),
                "content_hash": img.get("content_hash"),
                "quality_warnings": img.get("quality_warnings", []),
                "quality_metrics": img.get("quality_metrics", {}),
                "phash": img.get("phash"),
                "duplicate": True,
            }

    existing_hashes = [
        img.get("content_hash")
        for img in product.get("reference_images", [])
        if img.get("content_hash")
    ]
    quality_report = validate_reference_image_bytes(
        contents, existing_hashes=existing_hashes
    )

    # Perform pHash similarity check for strict views (front, back, label)
    # Relaxed threshold to avoid false positives during initial product setup
    from app.services.phash_service import generate_phash, hamming_distance
    new_phash = generate_phash(contents)
    new_group = get_strict_group(view_type)

    if new_group and new_phash:
        for img in product.get("reference_images", []):
            existing_group = get_strict_group(img.get("view_type"))
            if existing_group and existing_group != new_group:
                existing_phash = img.get("phash")
                if not existing_phash:
                    try:
                        existing_url = img.get("url")
                        if existing_url:
                            fn = os.path.basename(existing_url)
                            fp = _reference_image_path(vendor_id, product_id, fn)
                            if os.path.exists(fp):
                                with open(fp, "rb") as f:
                                    existing_bytes = f.read()
                                existing_phash = generate_phash(existing_bytes)
                                if existing_phash:
                                    products_collection.update_one(
                                        {"id": product_id, "reference_images.id": img["id"]},
                                        {"$set": {"reference_images.$.phash": existing_phash}}
                                    )
                    except Exception as exc:
                        logger.warning(f"Could not compute pHash for existing image {img.get('id')}: {exc}")

                if existing_phash:
                    distance = hamming_distance(new_phash, existing_phash)
                    # Relaxed threshold from 12 to 5 to reduce false positives
                    if distance < 5:
                        raise HTTPException(
                            status_code=400,
                            detail=f"The uploaded image is too similar to the existing {img.get('view_type').replace('_', ' ')} image (Hamming distance {distance} < 5). Please upload a different image."
                        )

    target_dir = os.path.join(REFERENCE_IMAGE_ROOT, vendor_id, product_id)
    os.makedirs(target_dir, exist_ok=True)

    unique_filename = f"{uuid.uuid4()}{_reference_image_extension(file)}"
    stored_path = os.path.join(target_dir, unique_filename)

    with open(stored_path, "wb") as f:
        f.write(contents)

    image_id = str(uuid.uuid4())
    url_path = f"/static/reference_images/{vendor_id}/{product_id}/{unique_filename}"
    
    image_metadata = {
        "id": image_id,
        "filename": file.filename,
        "url": url_path,
        "view_type": view_type,
        "size_bytes": file_size,
        "content_type": file.content_type,
        "uploaded_at": datetime.utcnow(),
        "embedding_cached": False,
        "embedding_cached_at": None,
        "embedding_vector": None,
        "content_hash": quality_report.get("content_hash"),
        "quality_warnings": quality_report.get("warnings", []),
        "quality_metrics": quality_report.get("metrics", {}),
        "phash": new_phash,
    }

    products_collection.update_one(
        {"id": product_id},
        {
            "$push": {"reference_images": image_metadata},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    logger.info(f"Image upload success for product {product_id}, image: {image_id}")

    # Schedule embedding job in background without blocking response
    # This is fire-and-forget - embeddings will be processed asynchronously
    try:
        schedule_product_embedding_job(product_id)
    except Exception as embed_err:
        logger.warning(f"Failed to schedule embedding job for product {product_id}: {embed_err}")
        # Don't fail the upload if embedding scheduling fails

    # Build/refresh the VLM authentication profile in the background (metadata-at-
    # creation): understand the genuine product ONCE here so scans only compare.
    # Debounced so multiple reference uploads coalesce into one build.
    try:
        from app.services.product_profile import schedule_profile_build
        schedule_profile_build(product_id)
    except Exception as prof_err:
        logger.warning(f"Failed to schedule profile build for product {product_id}: {prof_err}")

    response = dict(image_metadata)
    if quality_report.get("warnings"):
        response["quality_passed"] = quality_report.get("passed", True)
    return response


@router.get("/{product_id}/embedding-status")
@limiter.limit("120/minute")
async def get_embedding_status(
    request: Request,
    product_id: str,
    current_user: dict = Depends(get_current_vendor),
):
    """Vendor-only: poll reference embedding generation progress."""
    vendor_id = current_user.get("vendor_id")
    product = products_collection.find_one({"id": product_id, "vendor_id": vendor_id, "archived": {"$ne": True}})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or access denied")

    status = get_product_embedding_status(product_id)
    if not status:
        raise HTTPException(status_code=404, detail="Product not found")
    return status


@router.post("/{product_id}/build-profile")
@limiter.limit("20/minute")
async def build_product_profile(
    request: Request,
    product_id: str,
    current_user: dict = Depends(get_current_vendor),
):
    """Vendor-only: (re)build the VLM authentication profile for a product.

    Runs the heavy 'understand the genuine product' analysis once, from the
    vendor metadata + reference images, and caches it on the product — so scans
    compare against a known spec instead of re-deriving it each time.
    """
    vendor_id = current_user.get("vendor_id")
    product = products_collection.find_one(
        {"id": product_id, "vendor_id": vendor_id, "archived": {"$ne": True}}
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or access denied")
    if not product.get("reference_images"):
        raise HTTPException(
            status_code=400,
            detail="Upload reference images before building the authentication profile.",
        )

    from app.services.product_profile import build_and_store_profile
    loop = asyncio.get_event_loop()
    profile = await loop.run_in_executor(None, build_and_store_profile, product_id)
    return {
        "product_id": product_id,
        "status": profile.get("status"),
        "spec": profile.get("spec"),
        "reference_view_count": profile.get("reference_view_count"),
        "error": profile.get("error"),
    }


@router.get("/{product_id}/profile-status")
@limiter.limit("120/minute")
async def get_profile_status(
    request: Request,
    product_id: str,
    current_user: dict = Depends(get_current_vendor),
):
    """Vendor-only: poll the authentication-profile build status + view the spec."""
    vendor_id = current_user.get("vendor_id")
    product = products_collection.find_one(
        {"id": product_id, "vendor_id": vendor_id, "archived": {"$ne": True}}
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or access denied")
    prof = product.get("authentication_profile") or {}
    return {
        "product_id": product_id,
        "status": prof.get("status", "none"),
        "spec": prof.get("spec"),
        "reference_view_count": prof.get("reference_view_count"),
        "generated_at": prof.get("generated_at"),
        "error": prof.get("error"),
    }


@router.get("/{product_id}/reference-images")
@limiter.limit("100/minute")
async def get_reference_images(
    request: Request,
    product_id: str,
    current_user: dict = Depends(get_current_vendor),
):
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="Invalid vendor context")

    product = products_collection.find_one({"id": product_id, "vendor_id": vendor_id, "archived": {"$ne": True}})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or access denied")

    return product.get("reference_images") or []


@router.delete("/{product_id}/reference-images/{image_id}")
@limiter.limit("50/minute")
async def delete_reference_image(
    request: Request,
    product_id: str,
    image_id: str,
    current_user: dict = Depends(require_write_permission),
):
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="Invalid vendor context")

    product = products_collection.find_one({"id": product_id, "vendor_id": vendor_id, "archived": {"$ne": True}})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or access denied")

    images = product.get("reference_images") or []
    target_image = None
    for img in images:
        if img.get("id") == image_id:
            target_image = img
            break

    if not target_image:
        raise HTTPException(status_code=404, detail="Image not found in product reference images")

    url_path = target_image.get("url")
    if url_path:
        filename = os.path.basename(url_path)
        file_path = _reference_image_path(vendor_id, product_id, filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

    products_collection.update_one(
        {"id": product_id},
        {
            "$pull": {"reference_images": {"id": image_id}},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    return {"message": "Reference image deleted successfully"}


@router.put("/{product_id}/reference-images/{image_id}")
@limiter.limit("50/minute")
async def replace_reference_image(
    request: Request,
    product_id: str,
    image_id: str,
    view_type: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("IMAGE_UPLOAD")),
):
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="Invalid vendor context")

    product = products_collection.find_one({"id": product_id, "vendor_id": vendor_id, "archived": {"$ne": True}})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or access denied")

    images = product.get("reference_images") or []
    target_image = None
    for img in images:
        if img.get("id") == image_id:
            target_image = img
            break

    if not target_image:
        raise HTTPException(status_code=404, detail="Image to replace not found")

    _validate_reference_view_type(view_type)
    contents, file_size = await _read_validated_reference_image(file)

    # Perform pHash similarity check for strict views (front, back, label)
    from app.services.phash_service import generate_phash, hamming_distance
    new_phash = generate_phash(contents)
    new_group = get_strict_group(view_type)
    
    if new_group and new_phash:
        for img in images:
            if img.get("id") == image_id:
                continue
            existing_group = get_strict_group(img.get("view_type"))
            if existing_group and existing_group != new_group:
                existing_phash = img.get("phash")
                if not existing_phash:
                    try:
                        existing_url = img.get("url")
                        if existing_url:
                            fn = os.path.basename(existing_url)
                            fp = _reference_image_path(vendor_id, product_id, fn)
                            if os.path.exists(fp):
                                with open(fp, "rb") as f:
                                    existing_bytes = f.read()
                                existing_phash = generate_phash(existing_bytes)
                                if existing_phash:
                                    img["phash"] = existing_phash
                                    products_collection.update_one(
                                        {"id": product_id, "reference_images.id": img["id"]},
                                        {"$set": {"reference_images.$.phash": existing_phash}}
                                    )
                    except Exception as exc:
                        logger.warning(f"Could not compute pHash for existing image {img.get('id')}: {exc}")
                
                if existing_phash:
                    distance = hamming_distance(new_phash, existing_phash)
                    if distance < 12:
                        raise HTTPException(
                            status_code=400,
                            detail=f"The replacement image is too similar to the existing {img.get('view_type').replace('_', ' ')} image (Hamming distance {distance} < 12). Please upload a different image."
                        )

    old_url_path = target_image.get("url")
    if old_url_path:
        old_filename = os.path.basename(old_url_path)
        old_file_path = _reference_image_path(vendor_id, product_id, old_filename)
        if os.path.exists(old_file_path):
            try:
                os.remove(old_file_path)
            except Exception:
                pass

    target_dir = os.path.join(REFERENCE_IMAGE_ROOT, vendor_id, product_id)
    os.makedirs(target_dir, exist_ok=True)

    unique_filename = f"{uuid.uuid4()}{_reference_image_extension(file)}"
    stored_path = os.path.join(target_dir, unique_filename)

    with open(stored_path, "wb") as f:
        f.write(contents)

    new_url_path = f"/static/reference_images/{vendor_id}/{product_id}/{unique_filename}"
    
    updated_image_metadata = {
        "id": image_id,
        "filename": file.filename,
        "url": new_url_path,
        "view_type": view_type,
        "size_bytes": file_size,
        "content_type": file.content_type,
        "uploaded_at": datetime.utcnow(),
        "embedding_cached": False,
        "embedding_cached_at": None,
        "embedding_vector": None,
        "phash": new_phash,
    }

    # Replace image in Python (mongomock-safe; avoids positional $ operator).
    images = product.get("reference_images", [])
    replaced = False
    for idx, img in enumerate(images):
        if img.get("id") == image_id:
            images[idx] = updated_image_metadata
            replaced = True
            break
    if not replaced:
        raise HTTPException(status_code=404, detail="Image to replace not found")

    summary = summarize_embeddings(images)
    products_collection.update_one(
        {"id": product_id},
        {
            "$set": {
                "reference_images": images,
                "updated_at": datetime.utcnow(),
                **summary,
            }
        },
    )
    log_vendor_action(vendor_id, current_user.get("email"), "Product Image Replaced", {"description": f"Replaced reference image {image_id} for product '{product.get('name')}'."})

    logger.info(f"Image upload success for product {product_id}, replaced image: {image_id}")
    schedule_product_embedding_job(product_id)

    response = dict(updated_image_metadata)
    status = get_product_embedding_status(product_id)
    if status:
        response["embeddings_status"] = status.get("embeddings_status")
    return response


@router.patch("/{product_id}/qr-customization")
@limiter.limit("100/minute")
async def update_product_qr_customization(
    request: Request,
    product_id: str,
    payload: QRCustomizationUpdate,
    current_user: dict = Depends(require_write_permission),
):
    """Vendor-only: update QR code customization settings for a product."""
    vendor_id = current_user.get("vendor_id")
    product = products_collection.find_one({"id": product_id, "vendor_id": vendor_id, "archived": {"$ne": True}})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found or access denied")

    update_data = {}
    if payload.qr_primary_color is not None:
        update_data["qr_primary_color"] = payload.qr_primary_color
    if payload.qr_secondary_color is not None:
        update_data["qr_secondary_color"] = payload.qr_secondary_color
    if payload.qr_use_logo is not None:
        update_data["qr_use_logo"] = payload.qr_use_logo

    if not update_data:
        raise HTTPException(status_code=400, detail="No customization fields to update")

    products_collection.update_one({"id": product_id}, {"$set": update_data})
    log_vendor_action(vendor_id, current_user.get("email"), "QR Code Customized", {"description": f"Customized QR colors/logo for product '{product.get('name')}'."})

    try:
        await manager.broadcast({
            "type": "product_update",
            "product_id": product_id
        })
    except Exception:
        pass

    return {"message": "QR Customization updated successfully", "product_id": product_id}
