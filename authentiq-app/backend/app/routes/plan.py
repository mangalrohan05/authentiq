from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.db import plans_collection, vendors_collection, products_collection, scans_collection, vendor_feature_overrides_collection, plan_features_collection
from app.core.security import get_current_admin, get_current_vendor
from app.core.limiter import limiter
from app.schemas.plan import PlanCreate, PlanUpdate, PlanResponse, VendorSubscriptionStatusUpdate
from datetime import datetime, timezone
import uuid
from app.services.feature_resolver import resolve_vendor_features, invalidate_vendor_features_cache
from app.core.audit import log_admin_action

router = APIRouter()

# ── Utility ───────────────────────────────────────────────────────────────────

def _get_plan_or_404(plan_id: str) -> dict:
    plan = plans_collection.find_one({"id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan

def _get_vendor_or_404(vendor_id: str) -> dict:
    vendor = vendors_collection.find_one({"id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor

def _compute_usage(vendor_id: str) -> dict:
    """Compute real-time usage counts for a vendor."""
    from app.core.db import users_collection, invitations_collection, scans_collection
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    products_used = products_collection.count_documents({"vendor_id": vendor_id})
    batches_used = 0
    scans_this_month = scans_collection.count_documents({
        "vendor_id": vendor_id,
        "timestamp": {"$gte": month_start}
    })

    # Users count (active users + pending invitations)
    active_users = users_collection.count_documents({"vendor_id": vendor_id})
    pending_invites = invitations_collection.count_documents({"vendor_id": vendor_id, "status": "pending"})
    users_count = active_users + pending_invites

    # Storage size of reference images in bytes
    storage_bytes = 0
    products = list(products_collection.find({"vendor_id": vendor_id}))
    for p in products:
        for img in p.get("reference_images", []):
            storage_bytes += img.get("size_bytes", 0)

    # API calls usage (estimated based on scans + product counts)
    api_calls_count = scans_this_month * 3 + products_used * 5

    return {
        "products_used": products_used,
        "batches_used": batches_used,
        "scans_this_month": scans_this_month,
        "users_count": users_count,
        "storage_bytes": storage_bytes,
        "api_calls_count": api_calls_count,
    }

async def _build_vendor_subscription(vendor: dict) -> dict:
    """Build a full subscription response dict for a vendor."""
    vendor_id = vendor.get("id") or str(vendor.get("_id"))
    plan_id = vendor.get("assigned_plan") or "free_trial"
    plan = plans_collection.find_one({"id": plan_id}, {"_id": 0}) if plan_id else None
    usage = _compute_usage(vendor_id)
    features = await resolve_vendor_features(vendor_id)
    
    limits = plan.get("limits", {}).copy() if plan else {}
    if vendor.get("total_users_limit") is not None:
        limits["max_users"] = vendor.get("total_users_limit")
    if vendor.get("total_skus_limit") is not None:
        limits["max_products"] = vendor.get("total_skus_limit")
    if vendor.get("total_brands_limit") is not None:
        limits["max_brands"] = vendor.get("total_brands_limit")

    # Seed default storage limits
    plan_name = plan["name"] if plan else "Free Trial"
    if plan_name == "Free Trial":
        limits["max_storage_bytes"] = 1 * 1024 * 1024 * 1024  # 1 GB
        limits["max_api_calls"] = 1000
    elif plan_name == "Business":
        limits["max_storage_bytes"] = 10 * 1024 * 1024 * 1024  # 10 GB
        limits["max_api_calls"] = 50000
    else:  # Business Pro / Enterprise
        limits["max_storage_bytes"] = 100 * 1024 * 1024 * 1024  # 100 GB
        limits["max_api_calls"] = 500000

    return {
        "vendor_id": vendor_id,
        "vendor_name": vendor.get("vendor_name", ""),
        "assigned_plan": plan_id,
        "plan_name": plan["name"] if plan else "Not Assigned",
        "subscription_status": vendor.get("subscription_status", "inactive"),
        "plan_assigned_at": vendor.get("plan_assigned_at"),
        "assigned_by": vendor.get("plan_assigned_by"),
        "features": features.dict(),
        "limits": limits,
        "usage": usage,
    }



# ── Plan CRUD ─────────────────────────────────────────────────────────────────

@router.post("", response_model=PlanResponse, status_code=201)
@limiter.limit("50/minute")
async def create_plan(request: Request, plan: PlanCreate, current_user: dict = Depends(get_current_admin)):
    """Admin-only: Create a new subscription plan."""
    if plans_collection.find_one({"name": plan.name}):
        raise HTTPException(status_code=400, detail="Plan with this name already exists")

    plan_dict = plan.model_dump()
    plan_dict["id"] = f"plan_{uuid.uuid4().hex[:8]}"
    plan_dict["created_at"] = datetime.utcnow()
    
    # Extract feature_ids if present
    feature_ids = plan_dict.pop("feature_ids", []) or []
    
    plans_collection.insert_one(plan_dict.copy())
    
    location_val = "full_heatmaps" if "location" in feature_ids else "none"
    case_level_val = "full" if "case_level" in feature_ids else "basic"
    plan_features_data = {
        "plan_slug": plan_dict["id"],
        "location": location_val,
        "csv_export": "csv_export" in feature_ids,
        "bulk_qr": "bulk_qr" in feature_ids,
        "telemetry": "telemetry" in feature_ids,
        "case_level": case_level_val,
        "api_webhooks": "api_webhooks" in feature_ids,
        "sso": "sso" in feature_ids,
        "created_at": datetime.utcnow()
    }
    plan_features_collection.update_one(
        {"plan_slug": plan_dict["id"]},
        {"$set": plan_features_data},
        upsert=True
    )
    
    plan_dict["feature_ids"] = feature_ids
    
    admin_id = current_user.get("id", "unknown")
    admin_email = current_user.get("email", "admin")
    log_admin_action(
        admin_id=admin_id,
        admin_email=admin_email,
        action="plan_created",
        target_type="plan",
        target_id=plan_dict["id"],
        details={"name": plan_dict["name"]},
        ip_address=request.client.host if request.client else None
    )
    
    return plan_dict


@router.get("", response_model=dict)
@limiter.limit("100/minute")
async def get_plans(request: Request, current_user: dict = Depends(get_current_admin)):
    """Admin-only: List all plans."""
    plans = list(plans_collection.find({}, {"_id": 0}).sort("created_at", 1))
    for p in plans:
        plan_id = p.get("id")
        features_doc = plan_features_collection.find_one({"plan_slug": plan_id})
        feature_ids = []
        if features_doc:
            if features_doc.get("location") in ("region_level", "full_heatmaps"):
                feature_ids.append("location")
            if features_doc.get("csv_export") is True:
                feature_ids.append("csv_export")
            if features_doc.get("bulk_qr") is True:
                feature_ids.append("bulk_qr")
            if features_doc.get("telemetry") is True:
                feature_ids.append("telemetry")
            if features_doc.get("case_level") == "full":
                feature_ids.append("case_level")
            if features_doc.get("api_webhooks") is True:
                feature_ids.append("api_webhooks")
            if features_doc.get("sso") is True:
                feature_ids.append("sso")
        p["feature_ids"] = feature_ids
    return {"plans": plans}




# ── Vendor Subscription Management ────────────────────────────────────────────

@router.get("/vendors")
@limiter.limit("100/minute")
async def list_vendor_subscriptions(request: Request, current_user: dict = Depends(get_current_admin)):
    """Admin-only: List all vendors with subscription details and real-time usage."""
    vendors = list(vendors_collection.find({}))
    result = []
    for v in vendors:
        result.append(await _build_vendor_subscription(v))
    return {"subscriptions": result}


@router.get("/vendor/{vendor_id}")
@limiter.limit("100/minute")
async def get_vendor_subscription(request: Request, vendor_id: str, current_user: dict = Depends(get_current_admin)):
    """Admin-only: Get current plan + real-time usage for a specific vendor."""
    vendor = _get_vendor_or_404(vendor_id)
    return await _build_vendor_subscription(vendor)


@router.post("/vendor/{vendor_id}/assign")
@limiter.limit("50/minute")
async def assign_plan_to_vendor(
    request: Request,
    vendor_id: str,
    plan_id: str,
    current_user: dict = Depends(get_current_admin)
):
    """Admin-only: Assign or change a plan for a vendor. Archives previous plan in history."""
    vendor = _get_vendor_or_404(vendor_id)
    plan = _get_plan_or_404(plan_id)

    now = datetime.utcnow()

    # Archive previous plan assignment in history array
    history_entry = {
        "plan_id": vendor.get("assigned_plan"),
        "status": vendor.get("subscription_status", "inactive"),
        "changed_at": now,
        "changed_by": current_user.get("email", "admin"),
    }

    vendors_collection.update_one(
        {"id": vendor_id},
        {
            "$set": {
                "assigned_plan": plan_id,
                "subscription_status": "active",
                "plan_assigned_at": now,
                "plan_assigned_by": current_user.get("email", "admin"),
            },
            "$push": {"plan_history": history_entry}
        }
    )

    # Reset manual feature overrides and invalidate resolved feature cache for vendor
    vendor_feature_overrides_collection.delete_many({"vendor_id": vendor_id})
    invalidate_vendor_features_cache(vendor_id)

    admin_id = current_user.get("id", "unknown")
    admin_email = current_user.get("email", "admin")
    log_admin_action(
        admin_id=admin_id,
        admin_email=admin_email,
        action="vendor_plan_assigned",
        target_type="vendor",
        target_id=vendor_id,
        details={"plan_id": plan_id, "plan_name": plan.get("name")},
        ip_address=request.client.host if request.client else None
    )

    return {
        "message": f"Plan '{plan['name']}' assigned to vendor '{vendor.get('vendor_name')}' successfully.",
        "vendor_id": vendor_id,
        "plan_id": plan_id,
        "subscription_status": "active",
        "assigned_at": now.isoformat(),
    }


@router.patch("/vendor/{vendor_id}/status")
@limiter.limit("50/minute")
async def update_vendor_subscription_status(
    request: Request,
    vendor_id: str,
    payload: VendorSubscriptionStatusUpdate,
    current_user: dict = Depends(get_current_admin)
):
    """Admin-only: Suspend, reactivate, or deactivate a vendor subscription."""
    vendor = _get_vendor_or_404(vendor_id)

    now = datetime.utcnow()
    previous_status = vendor.get("subscription_status", "inactive")

    history_entry = {
        "plan_id": vendor.get("assigned_plan"),
        "status": payload.status,
        "previous_status": previous_status,
        "changed_at": now,
        "changed_by": current_user.get("email", "admin"),
    }

    vendors_collection.update_one(
        {"id": vendor_id},
        {
            "$set": {
                "subscription_status": payload.status,
                "status_updated_at": now,
                "status_updated_by": current_user.get("email", "admin"),
            },
            "$push": {"plan_history": history_entry}
        }
    )

    admin_id = current_user.get("id", "unknown")
    admin_email = current_user.get("email", "admin")
    log_admin_action(
        admin_id=admin_id,
        admin_email=admin_email,
        action="vendor_subscription_status_changed",
        target_type="vendor",
        target_id=vendor_id,
        details={"status": payload.status, "previous_status": previous_status},
        ip_address=request.client.host if request.client else None
    )

    return {
        "message": f"Vendor subscription status updated to '{payload.status}'.",
        "vendor_id": vendor_id,
        "subscription_status": payload.status,
        "previous_status": previous_status,
        "updated_at": now.isoformat(),
    }


# ── Vendor-facing: My Plan ────────────────────────────────────────────────────

@router.get("/my-plan")
@limiter.limit("200/minute")
async def get_my_plan(request: Request, current_user: dict = Depends(get_current_vendor)):
    """Vendor: Get own assigned plan details + feature flags for frontend gating."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=400, detail="Vendor account is not linked to a brand")

    vendor = vendors_collection.find_one({"id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor brand not found")

    plan_id = vendor.get("assigned_plan") or "free_trial"
    plan = plans_collection.find_one({"id": plan_id}, {"_id": 0}) if plan_id else None
    usage = _compute_usage(vendor_id)
    features = await resolve_vendor_features(vendor_id)

    limits = plan.get("limits", {}).copy() if plan else {}
    if vendor.get("total_users_limit") is not None:
        limits["max_users"] = vendor.get("total_users_limit")
    if vendor.get("total_skus_limit") is not None:
        limits["max_products"] = vendor.get("total_skus_limit")
    if vendor.get("total_brands_limit") is not None:
        limits["max_brands"] = vendor.get("total_brands_limit")

    # Seed default storage limits
    plan_name = plan["name"] if plan else "Free Trial"
    if plan_name == "Free Trial":
        limits["max_storage_bytes"] = 1 * 1024 * 1024 * 1024  # 1 GB
        limits["max_api_calls"] = 1000
    elif plan_name == "Business":
        limits["max_storage_bytes"] = 10 * 1024 * 1024 * 1024  # 10 GB
        limits["max_api_calls"] = 50000
    else:  # Business Pro / Enterprise
        limits["max_storage_bytes"] = 100 * 1024 * 1024 * 1024  # 100 GB
        limits["max_api_calls"] = 500000

    return {
        "vendor_id": vendor_id,
        "assigned_plan": plan_id,
        "plan_name": plan["name"] if plan else "Free Trial",
        "subscription_status": vendor.get("subscription_status", "active"),
        "features": features.dict(),
        "limits": limits,
        "usage": usage,
    }


@router.post("/my-plan/renew")
async def renew_my_plan(request: Request, current_user: dict = Depends(get_current_vendor)):
    """Vendor: Renew own active plan for another cycle."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=400, detail="Vendor account is not linked to a brand")

    vendor = vendors_collection.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor brand not found")

    now = datetime.utcnow()
    vendors_collection.update_one(
        {"id": vendor_id},
        {
            "$set": {
                "subscription_status": "active",
                "plan_assigned_at": now
            }
        }
    )

    # Reset manual feature overrides and invalidate resolved feature cache for vendor
    vendor_feature_overrides_collection.delete_many({"vendor_id": vendor_id})
    invalidate_vendor_features_cache(vendor_id)

    return {"message": "Plan renewed successfully", "plan_assigned_at": now}


@router.post("/my-plan/change")
async def change_my_plan(request: Request, payload: dict, current_user: dict = Depends(get_current_vendor)):
    """Vendor: Change own subscription plan."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=400, detail="Vendor account is not linked to a brand")

    plan_id = payload.get("plan_id")
    if not plan_id:
        raise HTTPException(status_code=400, detail="Plan ID is required")

    plan = plans_collection.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    now = datetime.utcnow()
    # When switching plans, reset any customized resource count overrides
    vendors_collection.update_one(
        {"id": vendor_id},
        {
            "$set": {
                "assigned_plan": plan_id,
                "subscription_status": "active",
                "plan_assigned_at": now
            },
            "$unset": {
                "total_users_limit": "",
                "total_skus_limit": "",
                "total_brands_limit": ""
            }
        }
    )

    # Reset manual feature overrides and invalidate resolved feature cache for vendor
    vendor_feature_overrides_collection.delete_many({"vendor_id": vendor_id})
    invalidate_vendor_features_cache(vendor_id)

    return {"message": f"Plan updated to {plan['name']} successfully", "assigned_plan": plan_id}


# ── Generic Parameter Routes ──────────────────────────────────────────────────

@router.put("/{plan_id}", response_model=PlanResponse)
@limiter.limit("50/minute")
async def update_plan(request: Request, plan_id: str, payload: PlanUpdate, current_user: dict = Depends(get_current_admin)):
    """Admin-only: Update an existing plan. (Must be at bottom to not shadow other routes)"""
    existing = plans_collection.find_one({"id": plan_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Plan not found")

    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "name" in update_data and update_data["name"] != existing["name"]:
        if plans_collection.find_one({"name": update_data["name"]}):
            raise HTTPException(status_code=400, detail="Plan with this name already exists")

    # Extract feature_ids if present
    feature_ids = update_data.pop("feature_ids", None)
    
    if feature_ids is not None:
        location_val = "full_heatmaps" if "location" in feature_ids else "none"
        case_level_val = "full" if "case_level" in feature_ids else "basic"
        plan_features_data = {
            "location": location_val,
            "csv_export": "csv_export" in feature_ids,
            "bulk_qr": "bulk_qr" in feature_ids,
            "telemetry": "telemetry" in feature_ids,
            "case_level": case_level_val,
            "api_webhooks": "api_webhooks" in feature_ids,
            "sso": "sso" in feature_ids,
        }
        plan_features_collection.update_one(
            {"plan_slug": plan_id},
            {"$set": plan_features_data},
            upsert=True
        )

    update_data["updated_at"] = datetime.utcnow()
    plans_collection.update_one({"id": plan_id}, {"$set": update_data})
    
    updated = plans_collection.find_one({"id": plan_id}, {"_id": 0})
    
    # Lookup updated features to return them
    features_doc = plan_features_collection.find_one({"plan_slug": plan_id})
    ret_feature_ids = []
    if features_doc:
        if features_doc.get("location") in ("region_level", "full_heatmaps"):
            ret_feature_ids.append("location")
        if features_doc.get("csv_export") is True:
            ret_feature_ids.append("csv_export")
        if features_doc.get("bulk_qr") is True:
            ret_feature_ids.append("bulk_qr")
        if features_doc.get("telemetry") is True:
            ret_feature_ids.append("telemetry")
        if features_doc.get("case_level") == "full":
            ret_feature_ids.append("case_level")
        if features_doc.get("api_webhooks") is True:
            ret_feature_ids.append("api_webhooks")
        if features_doc.get("sso") is True:
            ret_feature_ids.append("sso")
    updated["feature_ids"] = ret_feature_ids
    
    admin_id = current_user.get("id", "unknown")
    admin_email = current_user.get("email", "admin")
    log_admin_action(
        admin_id=admin_id,
        admin_email=admin_email,
        action="plan_updated",
        target_type="plan",
        target_id=plan_id,
        details={"name": updated.get("name")},
        ip_address=request.client.host if request.client else None
    )
    
    return updated

