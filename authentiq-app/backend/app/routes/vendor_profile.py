"""
Vendor profile, security, notifications, and account management APIs.
"""

from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from bson import ObjectId

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from app.core import security
from app.core.db import (
    plans_collection,
    products_collection,
    users_collection,
    vendors_collection,
)
from app.core.limiter import limiter
from app.schemas.profile import (
    ChangePasswordRequest,
    CompanyDetailsUpdate,
    DeactivateAccountRequest,
    DeleteAccountRequest,
    NotificationPreferences,
    NotificationPreferencesUpdate,
    VendorProfileUpdate,
)
from app.services.email_service import send_password_reset_email
from app.services.password_policy import validate_password_strength

logger = logging.getLogger(__name__)

from app.core.audit import log_vendor_action

router = APIRouter()

LOGO_ROOT = os.path.join("static", "vendor_logos")
ALLOWED_LOGO_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
MAX_LOGO_BYTES = 2 * 1024 * 1024

DEFAULT_NOTIFICATIONS = NotificationPreferences().model_dump()


def _default_notifications(raw: Optional[dict]) -> dict:
    merged = dict(DEFAULT_NOTIFICATIONS)
    if raw and isinstance(raw, dict):
        merged.update({k: v for k, v in raw.items() if k in merged})
    return merged


def _get_vendor_for_user(current_user: dict) -> dict:
    """
    Get vendor for authenticated user with validation.
    The vendor_id comes from the authenticated token, not user input,
    so this is not an IDOR vulnerability - it's a safe lookup.
    """
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=404, detail="Vendor record not linked to this account")
    vendor = vendors_collection.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


def _plan_details(vendor: dict) -> Optional[dict]:
    plan_id = vendor.get("assigned_plan") or "free_trial"
    if not plan_id:
        return None
    plan = plans_collection.find_one({"id": plan_id})
    if plan:
        plan.pop("_id", None)
        limits = plan.get("limits", {}).copy()
        if vendor.get("total_users_limit") is not None:
            limits["max_users"] = vendor.get("total_users_limit")
        if vendor.get("total_skus_limit") is not None:
            limits["max_products"] = vendor.get("total_skus_limit")
        if vendor.get("total_brands_limit") is not None:
            limits["max_brands"] = vendor.get("total_brands_limit")
        plan["limits"] = limits
    return plan


def _build_profile_response(current_user: dict, vendor: dict) -> dict:
    plan = _plan_details(vendor)
    logo = vendor.get("profile_image") or vendor.get("logo_url")
    qr_logo = vendor.get("qr_logo_image") or vendor.get("qr_logo_url")
    return {
        "user": {
            "id": current_user.get("id"),
            "name": current_user.get("name"),
            "email": current_user.get("email"),
            "role": current_user.get("role"),
            "status": current_user.get("status", "active"),
            "created_at": current_user.get("created_at"),
            "last_login": current_user.get("last_login"),
            "last_login_user_agent": current_user.get("last_login_user_agent"),
        },
        "vendor": {
            "id": vendor.get("id"),
            "vendor_name": vendor.get("vendor_name"),
            "company_name": vendor.get("company_name") or vendor.get("vendor_name"),
            "brand_display_name": vendor.get("brand_display_name") or vendor.get("vendor_name"),
            "assigned_plan": vendor.get("assigned_plan"),
            "subscription_status": vendor.get("subscription_status", "active"),
            "account_status": vendor.get("account_status", vendor.get("subscription_status", "active")),
            "created_at": vendor.get("created_at"),
            "profile_image": logo,
            "qr_logo_image": qr_logo,
            "support_email": vendor.get("support_email"),
            "contact_number": vendor.get("contact_number"),
            "website_url": vendor.get("website_url"),
            "business_address": vendor.get("business_address"),
            "country": vendor.get("country"),
            "tax_id": vendor.get("tax_id"),
            "business_email": vendor.get("business_email") or vendor.get("contact_email"),
            "notification_preferences": _default_notifications(
                vendor.get("notification_preferences")
            ),
        },
        "plan": plan,
        "verification_status": vendor.get("verification_status", "verified" if vendor.get("subscription_status") == "active" else "pending"),
    }


@router.get("")
async def get_vendor_profile(current_user: dict = Depends(security.get_current_vendor)):
    vendor = _get_vendor_for_user(current_user)
    return _build_profile_response(current_user, vendor)


@router.patch("")
async def update_vendor_profile(
    body: VendorProfileUpdate,
    current_user: dict = Depends(security.get_current_vendor),
):
    vendor = _get_vendor_for_user(current_user)
    vendor_id = vendor["id"]
    user_updates: Dict[str, Any] = {}
    vendor_updates: Dict[str, Any] = {"updated_at": datetime.utcnow()}

    if body.full_name is not None:
        name = body.full_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Full name cannot be empty")
        user_updates["name"] = name

    if body.company_name is not None:
        vendor_updates["company_name"] = body.company_name.strip()
        vendor_updates["vendor_name"] = body.company_name.strip()

    if body.brand_display_name is not None:
        vendor_updates["brand_display_name"] = body.brand_display_name.strip()

    if body.email is not None:
        email = body.email.strip().lower()
        if email and "@" not in email:
            raise HTTPException(status_code=400, detail="Invalid email format")
        user_updates["email"] = email

    if body.business_email is not None:
        vendor_updates["business_email"] = body.business_email.strip().lower()

    if body.contact_number is not None:
        vendor_updates["contact_number"] = body.contact_number.strip()

    if body.website_url is not None:
        vendor_updates["website_url"] = body.website_url.strip()

    if body.business_address is not None:
        vendor_updates["business_address"] = body.business_address.strip()

    if body.country is not None:
        vendor_updates["country"] = body.country.strip()

    if body.tax_id is not None:
        vendor_updates["tax_id"] = body.tax_id.strip()

    if body.support_email is not None:
        email = body.support_email.strip().lower()
        if email and "@" not in email:
            raise HTTPException(status_code=400, detail="Invalid support email")
        vendor_updates["support_email"] = email

    if user_updates:
        users_collection.update_one({"_id": ObjectId(current_user["id"])}, {"$set": user_updates})

    if len(vendor_updates) > 1:
        if current_user.get("role") not in ["Administrator", "admin", "vendor"]:
            raise HTTPException(status_code=403, detail="Only Administrators can update vendor organization details.")
        vendors_collection.update_one({"id": vendor_id}, {"$set": vendor_updates})
        log_vendor_action(vendor_id, current_user.get("email"), "Organization Profile Updated", {"description": "Updated vendor organization profile settings."})
    elif user_updates:
        log_vendor_action(vendor_id, current_user.get("email"), "User Profile Updated", {"description": f"Updated personal profile settings."})

    updated_user = users_collection.find_one({"_id": ObjectId(current_user["id"])})
    updated_user["id"] = str(updated_user.pop("_id"))
    updated_user.pop("password_hash", None)
    updated_vendor = vendors_collection.find_one({"id": vendor_id})
    return _build_profile_response(updated_user, updated_vendor)


@router.post("/logo")
async def upload_vendor_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(security.require_permission("PROFILE_MANAGE")),
):
    vendor = _get_vendor_for_user(current_user)
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Logo must be JPG, PNG, or WEBP")

    contents = await file.read()
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="Logo must be under 2MB")

    ext = ".png"
    if file.content_type and "jpeg" in file.content_type or "jpg" in (file.content_type or ""):
        ext = ".jpg"
    elif file.content_type and "webp" in file.content_type:
        ext = ".webp"

    target_dir = os.path.join(LOGO_ROOT, vendor["id"])
    os.makedirs(target_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    abs_path = os.path.join(target_dir, filename)
    with open(abs_path, "wb") as f:
        f.write(contents)

    url_path = f"/static/vendor_logos/{vendor['id']}/{filename}"
    vendors_collection.update_one(
        {"id": vendor["id"]},
        {"$set": {"profile_image": url_path, "logo_url": url_path, "updated_at": datetime.utcnow()}},
    )
    return {"profile_image": url_path, "message": "Logo updated"}


@router.post("/qr-logo")
async def upload_vendor_qr_logo(
    file: UploadFile = File(...),
    current_user: dict = Depends(security.require_permission("PROFILE_MANAGE")),
):
    vendor = _get_vendor_for_user(current_user)
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Logo must be JPG, PNG, or WEBP")

    contents = await file.read()
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(status_code=400, detail="Logo must be under 2MB")

    ext = ".png"
    if file.content_type and "jpeg" in file.content_type or "jpg" in (file.content_type or ""):
        ext = ".jpg"
    elif file.content_type and "webp" in file.content_type:
        ext = ".webp"

    target_dir = os.path.join(LOGO_ROOT, vendor["id"])
    os.makedirs(target_dir, exist_ok=True)
    filename = f"qr_logo_{uuid.uuid4()}{ext}"
    abs_path = os.path.join(target_dir, filename)
    with open(abs_path, "wb") as f:
        f.write(contents)

    url_path = f"/static/vendor_logos/{vendor['id']}/{filename}"
    vendors_collection.update_one(
        {"id": vendor["id"]},
        {"$set": {"qr_logo_image": url_path, "qr_logo_url": url_path, "updated_at": datetime.utcnow()}},
    )
    return {"qr_logo_image": url_path, "message": "QR Logo updated"}


@router.delete("/logo")
async def delete_vendor_logo(
    current_user: dict = Depends(security.require_permission("PROFILE_MANAGE")),
):
    vendor = _get_vendor_for_user(current_user)
    profile_image = vendor.get("profile_image")
    if profile_image:
        relative_path = profile_image.lstrip("/")
        if os.path.exists(relative_path):
            try:
                os.remove(relative_path)
            except Exception as e:
                logger.error(f"Failed to delete logo file {relative_path}: {e}")

    vendors_collection.update_one(
        {"id": vendor["id"]},
        {"$unset": {"profile_image": "", "logo_url": ""}, "$set": {"updated_at": datetime.utcnow()}},
    )
    return {"message": "Profile picture removed successfully"}


@router.delete("/qr-logo")
async def delete_vendor_qr_logo(
    current_user: dict = Depends(security.require_permission("PROFILE_MANAGE")),
):
    vendor = _get_vendor_for_user(current_user)
    qr_logo_image = vendor.get("qr_logo_image")
    if qr_logo_image:
        relative_path = qr_logo_image.lstrip("/")
        if os.path.exists(relative_path):
            try:
                os.remove(relative_path)
            except Exception as e:
                logger.error(f"Failed to delete qr logo file {relative_path}: {e}")

    vendors_collection.update_one(
        {"id": vendor["id"]},
        {"$unset": {"qr_logo_image": "", "qr_logo_url": ""}, "$set": {"updated_at": datetime.utcnow()}},
    )
    log_vendor_action(vendor["id"], current_user.get("email"), "QR Logo Removed", {"description": "Removed QR center branding logo."})
    return {"message": "QR Logo removed successfully"}


@router.patch("/password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(security.get_current_vendor),
):
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match")

    ok, errors = validate_password_strength(body.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail={"errors": errors})

    user = users_collection.find_one({"_id": ObjectId(current_user["id"])})
    if not user or not security.verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    users_collection.update_one(
        {"_id": ObjectId(current_user["id"])},
        {
            "$set": {
                "password_hash": security.get_password_hash(body.new_password),
                "password_changed_at": datetime.utcnow(),
            },
            "$unset": {"password_reset_token": "", "password_reset_expiry": ""},
        },
    )
    log_vendor_action(vendor_id, current_user.get("email"), "Password Changed", {"description": "User changed their account security password."})
    return {"message": "Password updated successfully"}


@router.get("/notifications")
async def get_notification_preferences(
    current_user: dict = Depends(security.get_current_vendor),
):
    vendor = _get_vendor_for_user(current_user)
    return {"preferences": _default_notifications(vendor.get("notification_preferences"))}


@router.patch("/notifications")
async def update_notification_preferences(
    body: NotificationPreferencesUpdate,
    current_user: dict = Depends(security.require_permission("PROFILE_MANAGE")),
):
    vendor = _get_vendor_for_user(current_user)
    prefs = body.preferences.model_dump()
    vendors_collection.update_one(
        {"id": vendor["id"]},
        {"$set": {"notification_preferences": prefs, "updated_at": datetime.utcnow()}},
    )
    log_vendor_action(vendor["id"], current_user.get("email"), "Notification Settings Updated", {"description": "Updated system update and notification channel preferences."})
    return {"preferences": prefs, "message": "Notification preferences saved"}


@router.get("/company")
async def get_company_details(current_user: dict = Depends(security.get_current_vendor)):
    """Return company/legal entity details stored on the vendor document."""
    vendor = _get_vendor_for_user(current_user)
    company_fields = [
        "legal_company_name", "company_type", "gstin", "pan", "cin",
        "reg_address_line1", "reg_address_line2", "reg_city", "reg_state",
        "reg_pin", "reg_country", "industry_sector", "company_website",
        "contact_full_name", "contact_work_email", "contact_mobile", "contact_designation",
        "tm_status", "tm_number",
        "tm_app_file", "tm_cert_file", "brand_auth_file",
        "gst_cert_file", "inc_doc_file",
        "pharma_drug_license_file", "fssai_license_file", "excise_license_file",
        "gst_cert_status", "inc_doc_status",
        "pharma_drug_license_status", "fssai_license_status", "excise_license_status",
        "tm_app_status", "tm_cert_status", "brand_auth_status",
    ]
    return {k: vendor.get(k) for k in company_fields}


@router.patch("/company")
async def update_company_details(
    body: CompanyDetailsUpdate,
    current_user: dict = Depends(security.require_permission("PROFILE_MANAGE")),
):
    """Save company/legal entity details. Enforces company details locking once registered."""
    vendor = _get_vendor_for_user(current_user)
    is_registered = (vendor.get("verification_status", "pending") == "verified")
    
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Company registration details that are locked once registered
    locked_fields = {
        "legal_company_name", "company_type", "gstin", "pan", "cin",
        "reg_address_line1", "reg_address_line2", "reg_city", "reg_state",
        "reg_pin", "reg_country", "industry_sector", "company_website",
        "tm_status", "tm_number", "tm_app_file", "tm_cert_file", "brand_auth_file",
        "gst_cert_file", "inc_doc_file", "pharma_drug_license_file", 
        "fssai_license_file", "excise_license_file"
    }

    if is_registered:
        # Check if they are trying to modify any of the locked fields
        for field in locked_fields:
            if field in updates and updates[field] != vendor.get(field):
                raise HTTPException(
                    status_code=403,
                    detail=f"Field '{field}' is locked after registration and cannot be modified."
                )

    updates["updated_at"] = datetime.utcnow()
    vendors_collection.update_one({"id": vendor["id"]}, {"$set": updates})
    log_vendor_action(vendor["id"], current_user.get("email"), "Company Details Updated", {"description": "Updated company registration and legal compliance details."})
    updated_vendor = vendors_collection.find_one({"id": vendor["id"]}, {"_id": 0})
    company_fields = [
        "legal_company_name", "company_type", "gstin", "pan", "cin",
        "reg_address_line1", "reg_address_line2", "reg_city", "reg_state",
        "reg_pin", "reg_country", "industry_sector", "company_website",
        "contact_full_name", "contact_work_email", "contact_mobile", "contact_designation",
        "tm_status", "tm_number",
        "tm_app_file", "tm_cert_file", "brand_auth_file",
        "gst_cert_file", "inc_doc_file",
        "pharma_drug_license_file", "fssai_license_file", "excise_license_file",
        "gst_cert_status", "inc_doc_status",
        "pharma_drug_license_status", "fssai_license_status", "excise_license_status",
        "tm_app_status", "tm_cert_status", "brand_auth_status",
    ]
    return {"message": "Company details updated", **{k: updated_vendor.get(k) for k in company_fields}}


@router.get("/session")
async def get_session_info(
    request: Request,
    current_user: dict = Depends(security.get_current_vendor),
):
    ua = request.headers.get("User-Agent", "Unknown")
    return {
        "current_session": {
            "email": current_user.get("email"),
            "last_login": current_user.get("last_login"),
            "user_agent": current_user.get("last_login_user_agent") or ua,
            "device_summary": _device_summary(current_user.get("last_login_user_agent") or ua),
        },
        "note": "JWT sessions are stateless; logout clears this device only.",
    }


@router.post("/sessions/logout-all")
async def logout_all_devices(current_user: dict = Depends(security.get_current_vendor)):
    """
    Placeholder for multi-device revocation.
    With stateless JWT, clients must discard tokens locally.
    """
    users_collection.update_one(
        {"email": current_user["email"]},
        {"$set": {"sessions_invalidated_at": datetime.utcnow()}},
    )
    return {
        "message": "All sessions marked for sign-out. Please sign in again on each device.",
    }


@router.get("/export")
async def export_account_data(current_user: dict = Depends(security.get_current_vendor)):
    vendor = _get_vendor_for_user(current_user)
    vendor_id = vendor["id"]
    products = list(products_collection.find({"vendor_id": vendor_id}, {"_id": 0}))
    for p in products:
        p.pop("embedding_vector", None)
        for img in p.get("reference_images", []) or []:
            img.pop("embedding_vector", None)
    return {
        "exported_at": datetime.utcnow().isoformat(),
        "user": {
            "name": current_user.get("name"),
            "email": current_user.get("email"),
            "created_at": current_user.get("created_at"),
        },
        "vendor": {
            k: vendor.get(k)
            for k in (
                "id",
                "vendor_name",
                "company_name",
                "support_email",
                "assigned_plan",
                "subscription_status",
                "created_at",
            )
        },
        "products_count": len(products),
        "batches_count": 0,
        "products": products,
        "batches": [],
    }


@router.post("/deactivate")
async def deactivate_account(
    body: DeactivateAccountRequest,
    current_user: dict = Depends(security.require_permission("WORKSPACE_DELETE")),
):
    if not body.confirm:
        raise HTTPException(status_code=400, detail="Confirmation required")
    vendor = _get_vendor_for_user(current_user)
    vendors_collection.update_one(
        {"id": vendor["id"]},
        {
            "$set": {
                "account_status": "deactivated",
                "subscription_status": "inactive",
                "deactivated_at": datetime.utcnow(),
            }
        },
    )
    users_collection.update_one(
        {"email": current_user["email"]},
        {"$set": {"status": "inactive"}},
    )
    return {"message": "Vendor portal deactivated. Contact support to reactivate."}


@router.post("/delete-request")
async def request_account_deletion(
    body: DeleteAccountRequest,
    current_user: dict = Depends(security.require_permission("WORKSPACE_DELETE")),
):
    if body.confirm_text.strip().upper() != "DELETE":
        raise HTTPException(
            status_code=400,
            detail='Type DELETE to confirm account deletion request',
        )
    vendor = _get_vendor_for_user(current_user)
    vendors_collection.update_one(
        {"id": vendor["id"]},
        {
            "$set": {
                "deletion_requested_at": datetime.utcnow(),
                "account_status": "deletion_pending",
            }
        },
    )
    logger.info("Account deletion requested vendor=%s user=%s", vendor["id"], current_user["email"])
    return {
        "message": "Deletion request recorded. Our team will process this within 30 days.",
    }


def _device_summary(user_agent: str) -> str:
    ua = user_agent or ""
    if "Chrome" in ua:
        browser = "Chrome"
    elif "Firefox" in ua:
        browser = "Firefox"
    elif "Safari" in ua:
        browser = "Safari"
    else:
        browser = "Browser"
    if "Mobile" in ua or "Android" in ua or "iPhone" in ua:
        return f"{browser} on Mobile"
    if "Mac" in ua:
        return f"{browser} on macOS"
    if "Windows" in ua:
        return f"{browser} on Windows"
    return browser


from pydantic import BaseModel

class AddonsUpdateRequest(BaseModel):
    extraUsers: int
    extraSKUs: int
    extraBrands: int
    totalUsers: int
    totalSKUs: int
    totalBrands: int


@router.post("/onboarding/complete")
async def complete_onboarding_endpoint(
    body: CompanyDetailsUpdate,
    current_user: dict = Depends(security.get_current_vendor),
):
    """
    Onboarding completion endpoint.
    Takes compliance details, sets compliance statuses to 'Verified',
    attaches mock document names if not provided, and sets verification_status to 'verified'.
    """
    vendor = _get_vendor_for_user(current_user)
    
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    
    # Map fields to database attributes
    db_updates = {}
    field_mapping = {
        "legal_company_name": "legal_company_name",
        "company_type": "company_type",
        "gstin": "gstin",
        "pan": "pan",
        "cin": "cin",
        "reg_address_line1": "reg_address_line1",
        "reg_address_line2": "reg_address_line2",
        "reg_city": "reg_city",
        "reg_state": "reg_state",
        "reg_pin": "reg_pin",
        "reg_country": "reg_country",
        "industry_sector": "industry_sector",
        "company_website": "company_website",
        "contact_full_name": "contact_full_name",
        "contact_work_email": "contact_work_email",
        "contact_mobile": "contact_mobile",
        "contact_designation": "contact_designation",
        "tm_status": "tm_status",
        "tm_number": "tm_number",
        "tm_app_file": "tm_app_file",
        "tm_cert_file": "tm_cert_file",
        "brand_auth_file": "brand_auth_file",
        "gst_cert_file": "gst_cert_file",
        "inc_doc_file": "inc_doc_file",
        "pharma_drug_license_file": "pharma_drug_license_file",
        "fssai_license_file": "fssai_license_file",
        "excise_license_file": "excise_license_file"
    }
    
    for k, v in updates.items():
        if k in field_mapping:
            db_updates[field_mapping[k]] = v
            
    # Set compliance statuses to "Verified"
    db_updates["gst_cert_status"] = "Verified" if db_updates.get("gstin") else None
    db_updates["inc_doc_status"] = "Verified"
    db_updates["pharma_drug_license_status"] = "Verified" if db_updates.get("pharma_drug_license_file") or updates.get("pharma_drug_license_file") else None
    db_updates["fssai_license_status"] = "Verified" if db_updates.get("fssai_license_file") or updates.get("fssai_license_file") else None
    db_updates["excise_license_status"] = "Verified" if db_updates.get("excise_license_file") else None
    db_updates["tm_app_status"] = "Verified" if db_updates.get("tm_app_file") else None
    db_updates["tm_cert_status"] = "Verified" if db_updates.get("tm_cert_file") else None
    db_updates["brand_auth_status"] = "Verified" if db_updates.get("brand_auth_file") else None
    
    # Set verification files if they weren't provided or set default simulator ones
    if not db_updates.get("gst_cert_file") and db_updates.get("gstin"):
        db_updates["gst_cert_file"] = f"gst_certificate_{vendor['id']}.pdf"
    if not db_updates.get("inc_doc_file"):
        db_updates["inc_doc_file"] = f"certificate_of_incorporation_{vendor['id']}.pdf"
    
    industry = db_updates.get("industry_sector") or vendor.get("industry_sector")
    if industry == "Pharma" and not db_updates.get("pharma_drug_license_file"):
        db_updates["pharma_drug_license_file"] = f"drug_license_{vendor['id']}.pdf"
    elif industry == "FMCG" and not db_updates.get("fssai_license_file"):
        db_updates["fssai_license_file"] = f"fssai_license_{vendor['id']}.pdf"
    elif industry == "Liquor" and not db_updates.get("excise_license_file"):
        db_updates["excise_license_file"] = f"excise_license_{vendor['id']}.pdf"

    # Set verification_status to verified
    db_updates["verification_status"] = "verified"
    db_updates["updated_at"] = datetime.utcnow()
    
    vendors_collection.update_one({"id": vendor["id"]}, {"$set": db_updates})
    
    updated_vendor = vendors_collection.find_one({"id": vendor["id"]})
    return _build_profile_response(current_user, updated_vendor)


@router.post("/addons/update")
async def update_addons_endpoint(
    body: AddonsUpdateRequest,
    current_user: dict = Depends(security.get_current_vendor),
):
    """
    Update vendor add-ons configuration (extra users, SKUs, and brands).
    """
    vendor = _get_vendor_for_user(current_user)
    
    updates = {
        "extra_users": body.extraUsers,
        "extra_skus": body.extraSKUs,
        "extra_brands": body.extraBrands,
        "total_users_limit": body.totalUsers,
        "total_skus_limit": body.totalSKUs,
        "total_brands_limit": body.totalBrands,
        "updated_at": datetime.utcnow(),
    }
    
    vendors_collection.update_one({"id": vendor["id"]}, {"$set": updates})
    
    updated_vendor = vendors_collection.find_one({"id": vendor["id"]})
    return _build_profile_response(current_user, updated_vendor)
