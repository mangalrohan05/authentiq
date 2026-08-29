from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.db import products_collection, qr_codes_collection, scans_collection, vendors_collection, users_collection, brands_collection, audit_logs_collection, admin_audit_log_collection
from app.core.audit import log_admin_action
from app.core.security import get_current_admin
from app.core.limiter import limiter
from app.core import security
from app.schemas.vendor import VendorCreate, AdminVendorCreate
from app.schemas.user import UserCreate, UserResponse, UserStatusUpdate, UserPasswordReset, AdminPasswordVerify
from datetime import datetime
import uuid
from bson import ObjectId

router = APIRouter()


@router.get("/analytics")
# @limiter.limit("200/minute")
async def get_analytics(request: Request, current_user: dict = Depends(get_current_admin)):
    """Admin-only: platform-wide analytics."""
    total_products = products_collection.count_documents({})
    total_qrs = qr_codes_collection.count_documents({})
    total_scans = scans_collection.count_documents({})

    return {
        "total_products": total_products,
        "total_qrs": total_qrs,
        "total_scans": total_scans,
    }


@router.get("/activity")
# @limiter.limit("200/minute")
async def get_activity(request: Request, current_user: dict = Depends(get_current_admin)):
    """Admin-only: recent activity logs formatted for the frontend feed."""
    def parse_dt(val):
        if not val:
            return datetime.min
        if isinstance(val, datetime):
            return val
        if isinstance(val, str):
            try:
                return datetime.fromisoformat(val.replace("Z", "+00:00"))
            except Exception:
                try:
                    return datetime.strptime(val, "%Y-%m-%d %H:%M:%S")
                except Exception:
                    return datetime.min
        return datetime.min

    # Build vendor ID to name map
    vendors_map = {}
    try:
        for v in vendors_collection.find({}, {"id": 1, "vendor_name": 1}):
            v_id = v.get("id")
            v_name = v.get("vendor_name")
            if v_id and v_name:
                vendors_map[v_id] = v_name
    except Exception as e:
        print(f"Error mapping vendors: {e}")

    activities = []

    # Only include security alerts (suspicious scans, AI-flagged content, etc.)

    # 1. Security Alerts - Suspicious scans, AI-flagged content
    try:
        suspicious_scans = list(scans_collection.find({
            "is_suspicious": True,
            "ai_status": {"$in": ["suspicious", "counterfeit", "needs_review"]}
        }).sort("timestamp", -1).limit(50))
        for s in suspicious_scans:
            product_name = s.get("product_name") or "Unknown Product"
            pid = s.get("product_id")
            vendor_id = s.get("vendor_id")
            if pid:
                product = products_collection.find_one({"id": pid}, {"_id": 0, "name": 1})
                if product:
                    product_name = product["name"]
                    
            location_str = "Unknown Location"
            loc = s.get("location")
            if loc:
                if isinstance(loc, dict):
                    city = loc.get("city") or ""
                    state = loc.get("state") or ""
                    country = loc.get("country") or ""
                    parts = [p.strip() for p in [city, state, country] if p and p.strip()]
                    if parts:
                        location_str = ", ".join(parts)
                elif isinstance(loc, str):
                    location_str = loc
            
            ai_stat = s.get("ai_status")
            if ai_stat == "counterfeit":
                title = "Counterfeit Product Detected"
                icon_type = "warning"
            elif ai_stat == "suspicious":
                title = "Suspicious Scan Detected"
                icon_type = "warning"
            else:
                title = "Scan Needs Review"
                icon_type = "warning"
            
            desc = f"{product_name} verified in {location_str}. Flagged for review."
            
            dt = s.get("scan_timestamp") or s.get("timestamp")
            activities.append({
                "id": str(s["_id"]),
                "type": icon_type,
                "title": title,
                "description": desc,
                "timestamp": dt,
                "product_name": product_name,
                "batch_code": product_name,
                "verification_status": s.get("verification_status", "verified"),
                "location": location_str,
                "ip_address": s.get("ip_address"),
                "vendor_id": vendor_id
            })
    except Exception as e:
        print(f"Error fetching suspicious scans: {e}")
    # 2. Security-related Admin Actions (vendor status changes, plan assignments, etc.)
    try:
        audit_logs = list(audit_logs_collection.find({
            "action": {"$in": ["vendor_subscription_status_changed", "user_status_changed", "vendor_plan_assigned"]}
        }).sort("timestamp", -1).limit(50))
        for log in audit_logs:
            action = log.get("action")
            dt = log.get("timestamp") or log.get("created_at")
            admin_email = log.get("admin_email", "admin")
            details = log.get("details", {})
            target_id = log.get("target_id")
            
            title = "Admin Action"
            desc = f"Action {action} performed by {admin_email}"
            vendor_id = None
            
            if action == "user_status_changed":
                status_str = details.get('status', 'unknown')
                title = f"Vendor User {'Activated' if status_str == 'active' else 'Deactivated'}"
                desc = f"Vendor user {details.get('email', target_id)} was {'activated' if status_str == 'active' else 'deactivated'} by {admin_email}."
            elif action == "vendor_plan_assigned":
                title = "Plan Assigned to Vendor"
                vendor_name = vendors_map.get(target_id) or details.get('vendor_name') or target_id
                desc = f"Plan '{details.get('plan_name')}' assigned to vendor {vendor_name} by {admin_email}."
                vendor_id = target_id
            elif action == "vendor_subscription_status_changed":
                title = "Vendor Subscription Updated"
                vendor_name = vendors_map.get(target_id) or target_id
                desc = f"Vendor subscription status updated to '{details.get('status')}' for {vendor_name} by {admin_email}."
                vendor_id = target_id

            activities.append({
                "id": str(log["_id"]),
                "type": "warning",
                "title": title,
                "description": desc,
                "timestamp": dt,
                "product_name": None,
                "vendor_id": vendor_id,
                "batch_code": None,
                "verification_status": "verified",
                "location": "Admin Control Panel",
                "ip_address": log.get("ip_address")
            })
    except Exception as e:
        print(f"Error fetching audit logs: {e}")

    # 4. Audit Logs (Admin Actions)
    try:
        audit_logs = list(audit_logs_collection.find().sort("timestamp", -1).limit(50))
        for log in audit_logs:
            action = log.get("action")
            dt = log.get("timestamp") or log.get("created_at")
            admin_email = log.get("admin_email", "admin")
            details = log.get("details", {})
            target_id = log.get("target_id")
            
            title = "Admin Action"
            desc = f"Action {action} performed by {admin_email}"
            
            if action == "vendor_created":
                title = "Vendor Created"
                desc = f"Vendor brand '{details.get('vendor_name')}' created by {admin_email}."
            elif action == "user_status_changed":
                status_str = details.get('status', 'unknown')
                title = f"Vendor User {'Activated' if status_str == 'active' else 'Deactivated'}"
                desc = f"Vendor user {details.get('email', target_id)} was {'activated' if status_str == 'active' else 'deactivated'} by {admin_email}."
            elif action == "user_password_reset":
                title = "Vendor User Password Reset"
                desc = f"Password for vendor user {details.get('email', target_id)} was reset by {admin_email}."
            elif action == "user_deleted":
                title = "Vendor User Deleted"
                desc = f"Vendor user {details.get('email', target_id)} was deleted by {admin_email}."
            elif action == "plan_created":
                title = "Subscription Plan Created"
                desc = f"Plan '{details.get('name')}' created by {admin_email}."
            elif action == "plan_updated":
                title = "Subscription Plan Updated"
                desc = f"Plan '{details.get('name')}' updated by {admin_email}."
            elif action == "vendor_plan_assigned":
                title = "Plan Assigned to Vendor"
                vendor_name = vendors_map.get(target_id) or details.get('vendor_name') or target_id
                desc = f"Plan '{details.get('plan_name')}' assigned to vendor {vendor_name} by {admin_email}."
            elif action == "vendor_subscription_status_changed":
                title = "Vendor Subscription Updated"
                vendor_name = vendors_map.get(target_id) or target_id
                desc = f"Vendor subscription status updated to '{details.get('status')}' for {vendor_name} by {admin_email}."
            elif action == "admin_password_changed":
                title = "Admin Password Changed"
                desc = f"Admin account password for {details.get('email', target_id)} changed by {admin_email}."

            activities.append({
                "id": str(log["_id"]),
                "type": "vendor_portal",
                "title": title,
                "description": desc,
                "timestamp": dt,
                "product_name": None,
                "batch_code": None,
                "verification_status": "verified",
                "location": "Admin Control Panel",
                "ip_address": log.get("ip_address")
            })
    except Exception as e:
        print(f"Error fetching audit logs: {e}")

    # 5. Admin Audit Log (Feature Overrides & Limits)
    try:
        admin_audit_logs = list(admin_audit_log_collection.find().sort("timestamp", -1).limit(50))
        for log in admin_audit_logs:
            action = log.get("action")
            dt = log.get("timestamp")
            admin_email = log.get("admin_email", "admin")
            vendor_id = log.get("vendor_id")
            vendor_name = vendors_map.get(vendor_id) or vendor_id
            details = log.get("details", {})
            
            title = "Admin Operation"
            desc = f"Operation {action} on vendor {vendor_name} by {admin_email}"
            
            if action == "UPSERT_FEATURE_OVERRIDE":
                title = "Vendor Feature Override Updated"
                desc = f"Feature override '{details.get('feature_key')}' set to '{details.get('override_value')}' for vendor {vendor_name} by {admin_email}. Reason: {details.get('reason') or 'No reason provided'}."
            elif action == "DELETE_FEATURE_OVERRIDE":
                title = "Vendor Feature Override Removed"
                desc = f"Feature override '{details.get('feature_key')}' removed for vendor {vendor_name} by {admin_email}."
            elif action == "UPDATE_VENDOR_LIMITS":
                title = "Vendor Resource Limits Updated"
                limits_str = ", ".join([f"{k}: {v}" for k, v in details.items() if v is not None])
                desc = f"Limits updated for vendor {vendor_name} by {admin_email}. New Limits: {limits_str}."

            activities.append({
                "id": str(log.get("_id") or log.get("log_id", uuid.uuid4())),
                "type": "vendor_portal",
                "title": title,
                "description": desc,
                "timestamp": dt,
                "product_name": None,
                "batch_code": None,
                "verification_status": "verified",
                "location": "Admin Control Panel",
                "ip_address": None
            })
    except Exception as e:
        print(f"Error fetching admin audit logs: {e}")

    # Sort activities by timestamp descending
    activities.sort(key=lambda x: parse_dt(x["timestamp"]), reverse=True)
    
    # Slice to top 50 items
    activities = activities[:50]

    # Convert python datetime objects to ISO format string
    for act in activities:
        ts = act["timestamp"]
        if isinstance(ts, datetime):
            act["timestamp"] = ts.isoformat()

    return {"activity": activities}


@router.get("/products")
# @limiter.limit("200/minute")
async def get_admin_products(request: Request, current_user: dict = Depends(get_current_admin)):
    """Admin-only: all products across all vendors."""
    products = list(products_collection.find({}, {"_id": 0}).sort("timestamp", -1))
    return {"products": products}


@router.post("/vendor/create")
# @limiter.limit("200/minute")
async def create_vendor(request: Request, vendor: VendorCreate, current_user: dict = Depends(get_current_admin)):
    """Admin-only: register a new vendor brand."""
    existing = vendors_collection.find_one({"vendor_name": vendor.vendor_name})
    if existing:
        existing["id"] = str(existing.get("_id"))
        del existing["_id"]
        return existing

    vendor_id = str(uuid.uuid4())
    new_vendor = {
        "id": vendor_id,
        "vendor_name": vendor.vendor_name,
        "assigned_plan": "free_trial",
        "subscription_status": "active",
        "created_at": datetime.utcnow(),
    }
    vendors_collection.insert_one(new_vendor.copy())
    
    admin_id = current_user.get("id", "unknown")
    admin_email = current_user.get("email", "admin")
    log_admin_action(
        admin_id=admin_id,
        admin_email=admin_email,
        action="vendor_created",
        target_type="vendor",
        target_id=vendor_id,
        details={"vendor_name": vendor.vendor_name},
        ip_address=request.client.host if request.client else None
    )
    
    return new_vendor


@router.post("/vendor/create-full")
# @limiter.limit("50/minute")
async def create_vendor_full(request: Request, data: AdminVendorCreate, current_user: dict = Depends(get_current_admin)):
    """
    Admin-only: Create a vendor with user credentials and plan assignment.
    The user is created with 'pending' verification_status to trigger first-time login flow.
    """
    # Check if email already exists
    if users_collection.find_one({"email": data.email.lower()}):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create vendor record
    vendor_id = str(uuid.uuid4())
    new_vendor = {
        "id": vendor_id,
        "vendor_name": data.company_name,
        "legal_company_name": data.company_name,
        "assigned_plan": data.plan_id or "free_trial",
        "subscription_status": "active",
        "created_at": datetime.utcnow(),
    }
    if data.plan_id:
        new_vendor["plan_assigned_at"] = datetime.utcnow()
        new_vendor["plan_assigned_by"] = current_user.get("email", "admin")
    
    vendors_collection.insert_one(new_vendor)
    
    # Create user account with pending verification status
    password_hash = security.get_password_hash(data.password)
    new_user = {
        "name": data.name.strip(),
        "email": data.email.lower().strip(),
        "password_hash": password_hash,
        "role": "Administrator",
        "vendor_id": vendor_id,
        "status": "active",
        "verification_status": "pending",  # Triggers first-time login flow
        "created_at": datetime.utcnow(),
    }
    result = users_collection.insert_one(new_user)
    new_user["id"] = str(result.inserted_id)
    
    # Remove sensitive fields from response
    del new_user["_id"]
    del new_user["password_hash"]
    
    return {
        "message": "Vendor created successfully. User will be prompted to complete onboarding on first login.",
        "vendor": {
            "id": vendor_id,
            "vendor_name": data.company_name,
            "assigned_plan": data.plan_id or "free_trial",
            "subscription_status": "active",
        },
        "user": new_user
    }


@router.get("/vendors")
# @limiter.limit("200/minute")
async def get_admin_vendors(request: Request, current_user: dict = Depends(get_current_admin)):
    """Admin-only: list all vendors with enriched product/batch metrics and subscription info."""
    pipeline = [
        {
            "$lookup": {
                "from": "products",
                "localField": "id",
                "foreignField": "vendor_id",
                "as": "vendor_products"
            }
        },
        {
            "$lookup": {
                "from": "brands",
                "localField": "id",
                "foreignField": "vendor_id",
                "as": "brand_data"
            }
        },
        {
            "$addFields": {
                "products": {"$size": "$vendor_products"},
                "batches": 0
            }
        },
        {
            "$project": {
                "_id": 0,
                "id": {"$ifNull": ["$id", {"$toString": "$_id"}]},
                "name": "$vendor_name",
                "status": "Active",
                "products": 1,
                "batches": 1,
                "created_at": 1,
                "assigned_plan": {"$ifNull": ["$assigned_plan", None]},
                "subscription_status": {"$ifNull": ["$subscription_status", "inactive"]},
                "plan_assigned_at": {"$ifNull": ["$plan_assigned_at", None]},
                "brands": {
                     "$map": {
                         "input": "$brand_data",
                         "as": "b",
                         "in": {
                             "name": "$$b.brand_display_name",
                             "logo_url": "$$b.brand_logo_url",
                             "created_at": "$$b.created_at"
                         }
                     }
                 },
                "legal_company_name": 1,
                "gst_cert_status": 1,
                "inc_doc_status": 1,
                "tm_app_status": 1,
                "tm_cert_status": 1,
                "brand_auth_status": 1,
                "pharma_drug_license_status": 1,
                "fssai_license_status": 1,
                "excise_license_status": 1,
                "industry_sector": 1,
            }
        }
    ]
    formatted_vendors = list(vendors_collection.aggregate(pipeline))
    return {"vendors": formatted_vendors}



@router.get("/vendor-users")
# @limiter.limit("200/minute")
async def get_vendor_users(request: Request, current_user: dict = Depends(get_current_admin)):
    """Admin-only: list all vendor user credentials."""
    users = list(users_collection.find({"role": {"$in": ["vendor", "Administrator", "Manager", "Viewer"]}}, {"password_hash": 0}))
    for u in users:
        u["id"] = str(u.pop("_id"))
        if "status" not in u:
            u["status"] = "active"
    return {"users": users}


@router.post("/vendor-users", status_code=201)
# @limiter.limit("200/minute")
async def create_vendor_user(request: Request, user: UserCreate, current_user: dict = Depends(get_current_admin)):
    """Admin-only: create a new vendor login credential."""
    if users_collection.find_one({"email": user.email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    password_hash = security.get_password_hash(user.password)
    role = user.role
    if role == "vendor" or not role:
        role = "Administrator"
    new_user = {
        "name": user.name.strip(),
        "email": user.email.lower().strip(),
        "password_hash": password_hash,
        "role": role,
        "vendor_id": user.vendor_id,
        "status": "active",
        "created_at": datetime.utcnow(),
    }
    result = users_collection.insert_one(new_user)
    new_user["id"] = str(result.inserted_id)
    del new_user["_id"]
    del new_user["password_hash"]
    return new_user


@router.patch("/vendor-users/{user_id}/status")
# @limiter.limit("200/minute")
async def update_vendor_user_status(request: Request, user_id: str, status_update: UserStatusUpdate, current_user: dict = Depends(get_current_admin)):
    """Admin-only: toggle vendor user status."""
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    target_user = users_collection.find_one({"_id": obj_id, "role": {"$in": ["vendor", "Administrator", "Manager", "Viewer"]}})
    if not target_user:
        raise HTTPException(status_code=404, detail="Vendor user not found")
        
    users_collection.update_one(
        {"_id": obj_id},
        {"$set": {"status": status_update.status}}
    )
    
    admin_id = current_user.get("id", "unknown")
    admin_email = current_user.get("email", "admin")
    log_admin_action(
        admin_id=admin_id,
        admin_email=admin_email,
        action="user_status_changed",
        target_type="user",
        target_id=user_id,
        details={"status": status_update.status, "email": target_user.get("email")},
        ip_address=request.client.host if request.client else None
    )
    return {"message": f"Status updated to {status_update.status}"}


@router.patch("/vendor-users/{user_id}/reset-password")
# @limiter.limit("200/minute")
async def reset_vendor_user_password(request: Request, user_id: str, payload: UserPasswordReset, current_user: dict = Depends(get_current_admin)):
    """Admin-only: reset vendor user password."""
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    target_user = users_collection.find_one({"_id": obj_id, "role": {"$in": ["vendor", "Administrator", "Manager", "Viewer", "admin"]}})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    new_hash = security.get_password_hash(payload.new_password)
    users_collection.update_one(
        {"_id": obj_id},
        {"$set": {"password_hash": new_hash}}
    )
    
    admin_id = current_user.get("id", "unknown")
    admin_email = current_user.get("email", "admin")
    
    if target_user.get("role") == "admin":
        action = "admin_password_changed"
        target_type = "admin"
    else:
        action = "user_password_reset"
        target_type = "user"
        
    log_admin_action(
        admin_id=admin_id,
        admin_email=admin_email,
        action=action,
        target_type=target_type,
        target_id=user_id,
        details={"email": target_user.get("email")},
        ip_address=request.client.host if request.client else None
    )
    
    return {"message": "Password reset successfully"}


@router.delete("/vendor-users/{user_id}")
# @limiter.limit("200/minute")
async def delete_vendor_user(request: Request, user_id: str, current_user: dict = Depends(get_current_admin)):
    """Admin-only: hard delete a vendor user credential."""
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    target_user = users_collection.find_one({"_id": obj_id, "role": {"$in": ["vendor", "Administrator", "Manager", "Viewer"]}})
    if not target_user:
        raise HTTPException(status_code=404, detail="Vendor user not found")
        
    users_collection.delete_one({"_id": obj_id})
    
    admin_id = current_user.get("id", "unknown")
    admin_email = current_user.get("email", "admin")
    log_admin_action(
        admin_id=admin_id,
        admin_email=admin_email,
        action="user_deleted",
        target_type="user",
        target_id=user_id,
        details={"email": target_user.get("email")},
        ip_address=request.client.host if request.client else None
    )
    return {"message": "Vendor user deleted successfully"}


@router.delete("/vendor/{vendor_id}")
# @limiter.limit("50/minute")
async def delete_vendor(request: Request, vendor_id: str, payload: AdminPasswordVerify, current_user: dict = Depends(get_current_admin)):
    """
    Admin-only: Delete a vendor with password verification.
    Cascades to: vendor users, products, brands, QR codes, scans, and all related data.
    """
    from app.core.db import qr_codes_collection, brands_collection
    
    # Verify admin password
    admin_user = users_collection.find_one({"email": current_user.get("email")})
    if not admin_user:
        raise HTTPException(status_code=404, detail="Admin user not found")
    
    if not security.verify_password(payload.admin_password, admin_user.get("password_hash", "")):
        raise HTTPException(status_code=403, detail="Incorrect admin password")
    
    # Verify vendor exists
    vendor = vendors_collection.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    # Cascade delete all related data
    # 1. Delete vendor users
    users_collection.delete_many({"vendor_id": vendor_id})
    
    # 2. Delete products and their reference images
    products = list(products_collection.find({"vendor_id": vendor_id}))
    for product in products:
        # Reference images are stored as URLs/files - they remain on disk but DB references are removed
        pass
    products_collection.delete_many({"vendor_id": vendor_id})
    
    # 3. Delete QR codes
    qr_codes_collection.delete_many({"vendor_id": vendor_id})
    
    # 4. Delete brands
    brands_collection.delete_many({"vendor_id": vendor_id})
    
    # 5. Delete scans
    scans_collection.delete_many({"vendor_id": vendor_id})
    
    # 6. Delete the vendor record itself
    vendors_collection.delete_one({"id": vendor_id})
    
    return {
        "message": f"Vendor '{vendor.get('vendor_name')}' and all associated data deleted successfully",
        "vendor_id": vendor_id,
        "deleted_at": datetime.utcnow().isoformat()
    }
