from fastapi import APIRouter, Depends, HTTPException, Request
from typing import List, Dict, Any
from app.core.db import vendor_feature_overrides_collection, admin_audit_log_collection, vendors_collection, plan_features_collection
from app.core.security import get_current_admin
from app.schemas.feature import VendorFeatureOverrideCreate, VendorFeatureOverrideResponse, PlanFeaturesBase
from app.services.feature_resolver import invalidate_vendor_features_cache, CACHE_TTL_SECONDS
from datetime import datetime
import uuid

router = APIRouter()

FEATURE_KEYS = ["location", "csv_export", "bulk_qr", "telemetry", "case_level", "api_webhooks", "sso"]

FEATURES_LIST = [
    {
        "id": "location",
        "name": "Location Tracking",
        "description": "Geographic tracking of scans (none, region_level, full_heatmaps)",
        "category": "analytics",
        "is_active": True
    },
    {
        "id": "csv_export",
        "name": "CSV Export",
        "description": "Export QR codes and scan telemetry as CSV",
        "category": "exports",
        "is_active": True
    },
    {
        "id": "bulk_qr",
        "name": "Bulk QR Generation",
        "description": "Generate QR codes in bulk batches",
        "category": "qr",
        "is_active": True
    },
    {
        "id": "telemetry",
        "name": "Analytics Telemetry",
        "description": "Detailed telemetry and stats on scans",
        "category": "analytics",
        "is_active": True
    },
    {
        "id": "case_level",
        "name": "Case Level CRUD",
        "description": "Case-level authentication and management (basic, full)",
        "category": "verification",
        "is_active": True
    },
    {
        "id": "api_webhooks",
        "name": "API Webhooks",
        "description": "Developer API keys and event webhooks",
        "category": "integration",
        "is_active": True
    },
    {
        "id": "sso",
        "name": "SSO & Team",
        "description": "Single Sign-On and team collaboration options",
        "category": "security",
        "is_active": True
    }
]

@router.get("", response_model=Dict[str, Any])
async def get_all_features(request: Request, current_user: dict = Depends(get_current_admin)):
    """Admin-only: Get all available platform features with metadata."""
    return {"features": FEATURES_LIST}

@router.get("/vendor/{vendor_id}/overrides", response_model=Dict[str, Any])
async def get_vendor_overrides(request: Request, vendor_id: str, current_user: dict = Depends(get_current_admin)):
    """Admin-only: Get all overrides for a vendor alongside base plan defaults."""
    vendor = vendors_collection.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
        
    plan_slug = vendor.get("assigned_plan") or "free_trial"
    plan_features = plan_features_collection.find_one({"plan_slug": plan_slug})
    
    if not plan_features:
        defaults = PlanFeaturesBase(plan_slug=plan_slug).dict()
    else:
        defaults = PlanFeaturesBase(plan_slug=plan_slug).dict()
        defaults.update({k: v for k, v in plan_features.items() if k != "_id"})
        
    overrides_cursor = vendor_feature_overrides_collection.find({"vendor_id": vendor_id}, {"_id": 0})
    overrides = list(overrides_cursor)
    
    return {
        "vendor_id": vendor_id,
        "plan_slug": plan_slug,
        "defaults": {k: defaults.get(k) for k in FEATURE_KEYS},
        "overrides": overrides,
        "limits": {
            "total_users_limit": vendor.get("total_users_limit"),
            "total_skus_limit": vendor.get("total_skus_limit"),
            "total_brands_limit": vendor.get("total_brands_limit"),
        }
    }

@router.put("/vendor/{vendor_id}/overrides", response_model=VendorFeatureOverrideResponse)
async def upsert_vendor_override(
    request: Request, 
    vendor_id: str, 
    payload: VendorFeatureOverrideCreate, 
    current_user: dict = Depends(get_current_admin)
):
    """Admin-only: Create or update a feature override for a vendor."""
    vendor = vendors_collection.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
        
    if payload.feature_key not in FEATURE_KEYS:
        raise HTTPException(status_code=400, detail="Invalid feature key")

    now = datetime.utcnow()
    admin_email = current_user.get("email", "unknown_admin")
    admin_id = current_user.get("id", "unknown_admin_id")

    query = {"vendor_id": vendor_id, "feature_key": payload.feature_key}
    update_data = {
        "vendor_id": vendor_id,
        "feature_key": payload.feature_key,
        "override_value": payload.override_value,
        "granted_by": admin_email,
        "reason": payload.reason,
        "updated_at": now
    }
    
    # Upsert the override
    result = vendor_feature_overrides_collection.update_one(
        query,
        {
            "$set": update_data,
            "$setOnInsert": {"created_at": now}
        },
        upsert=True
    )

    # Log to audit log
    admin_audit_log_collection.insert_one({
        "log_id": str(uuid.uuid4()),
        "admin_id": admin_id,
        "admin_email": admin_email,
        "vendor_id": vendor_id,
        "action": "UPSERT_FEATURE_OVERRIDE",
        "details": {
            "feature_key": payload.feature_key,
            "override_value": payload.override_value,
            "reason": payload.reason
        },
        "timestamp": now
    })

    # Invalidate Cache
    invalidate_vendor_features_cache(vendor_id)

    doc = vendor_feature_overrides_collection.find_one(query, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=500, detail="Failed to retrieve saved override")
    return VendorFeatureOverrideResponse(**doc)

@router.delete("/vendor/{vendor_id}/overrides/{feature_key}")
async def delete_vendor_override(
    request: Request, 
    vendor_id: str, 
    feature_key: str, 
    current_user: dict = Depends(get_current_admin)
):
    """Admin-only: Remove a feature override for a vendor."""
    if feature_key not in FEATURE_KEYS:
        raise HTTPException(status_code=400, detail="Invalid feature key")
        
    result = vendor_feature_overrides_collection.delete_one({
        "vendor_id": vendor_id,
        "feature_key": feature_key
    })
    
    if result.deleted_count > 0:
        now = datetime.utcnow()
        admin_email = current_user.get("email", "unknown_admin")
        admin_id = current_user.get("id", "unknown_admin_id")
        
        # Log to audit log
        admin_audit_log_collection.insert_one({
            "log_id": str(uuid.uuid4()),
            "admin_id": admin_id,
            "admin_email": admin_email,
            "vendor_id": vendor_id,
            "action": "DELETE_FEATURE_OVERRIDE",
            "details": {
                "feature_key": feature_key
            },
            "timestamp": now
        })
        
        # Invalidate Cache
        invalidate_vendor_features_cache(vendor_id)
        
    return {"message": "Override removed successfully"}

@router.put("/vendor/{vendor_id}/limits")
async def update_vendor_limits(
    request: Request,
    vendor_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_admin)
):
    """Admin-only: Update resource limits for a vendor."""
    vendor = vendors_collection.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
        
    update_data = {}
    if "total_users_limit" in payload:
        if payload["total_users_limit"] is None:
            vendors_collection.update_one({"id": vendor_id}, {"$unset": {"total_users_limit": ""}})
        else:
            update_data["total_users_limit"] = int(payload["total_users_limit"])
            
    if "total_skus_limit" in payload:
        if payload["total_skus_limit"] is None:
            vendors_collection.update_one({"id": vendor_id}, {"$unset": {"total_skus_limit": ""}})
        else:
            update_data["total_skus_limit"] = int(payload["total_skus_limit"])
            
    if "total_brands_limit" in payload:
        if payload["total_brands_limit"] is None:
            vendors_collection.update_one({"id": vendor_id}, {"$unset": {"total_brands_limit": ""}})
        else:
            update_data["total_brands_limit"] = int(payload["total_brands_limit"])

    if update_data:
        vendors_collection.update_one({"id": vendor_id}, {"$set": update_data})
        
    now = datetime.utcnow()
    admin_email = current_user.get("email", "unknown_admin")
    admin_audit_log_collection.insert_one({
        "log_id": str(uuid.uuid4()),
        "admin_email": admin_email,
        "vendor_id": vendor_id,
        "action": "UPDATE_VENDOR_LIMITS",
        "details": payload,
        "timestamp": now
    })
        
    return {"message": "Vendor limits updated successfully"}
