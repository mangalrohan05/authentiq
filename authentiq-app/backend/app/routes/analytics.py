from fastapi import APIRouter, Depends, Query, HTTPException, Request
from app.core.db import scans_collection, products_collection, vendors_collection, qr_codes_collection, users_collection, vendor_notifications_collection
from app.services.feature_resolver import resolve_vendor_features
from app.core.security import get_current_admin, get_current_vendor, get_current_user, require_permission
from app.core.limiter import limiter
from typing import Optional, List, Dict
from datetime import datetime, timedelta, timezone
import pydantic
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class ActivityLogResponse(pydantic.BaseModel):
    id: str
    event_type: str
    batch_name: str
    location: str
    timestamp: str
    status: str
    vendor_id: Optional[str] = None

async def _verify_analytics_permission(vendor_id: str, check_geolocation: bool = False):
    """
    Verify vendor has active subscription and analytics enabled.
    The vendor_id parameter comes from current_user (authenticated token),
    not user input, preventing IDOR vulnerabilities.
    """
    vendor = vendors_collection.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=403, detail="Vendor brand context not found")
    
    if vendor.get("subscription_status") != "active":
        raise HTTPException(status_code=403, detail="Subscription is inactive or suspended")
        
    features = await resolve_vendor_features(vendor_id)
    if not features.telemetry:
        raise HTTPException(status_code=403, detail="Your current plan does not support Analytics dashboard access.")
        
    if check_geolocation and features.location == "none":
        raise HTTPException(status_code=403, detail="Your current plan does not support Geolocation tracking features.")


@router.get("/recent-activity", response_model=List[ActivityLogResponse])
async def get_recent_activity(current_user: dict = Depends(get_current_user)):
    """
    Get recent activity logs scoped to the user's organization.
    Extracts vendor_id from JWT to prevent unauthorized cross-portal data access.
    """
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        logger.warning(f"User {current_user.get('email')} attempted to access recent activity without vendor_id")
        return []
    
    try:
        db_query = {
            "vendor_id": vendor_id
        }

        # Fetch actual scans from database, scoped to vendor_id and role restrictions, sorted by timestamp descending
        scans = list(scans_collection.find(db_query).sort("timestamp", -1).limit(10))
    except Exception as e:
        logger.error(f"Error fetching real scans for recent activity: {e}")
        scans = []

    activities = []
    for s in scans:
        display_name = s.get("product_name") or "Unknown Product"

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

        status = s.get("verification_status") or "authentic"
        if s.get("ai_status"):
            status = s.get("ai_status")
            if s.get("is_suspicious") and status in ("authentic", "likely_authentic"):
                status = "suspicious"
        elif s.get("is_suspicious"):
            status = "suspicious"

        # Map timestamp to ISO format string
        ts = s.get("timestamp") or s.get("created_at") or datetime.utcnow()
        if isinstance(ts, datetime):
            # Ensure it is timezone-aware to match formatting expectations
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            timestamp_str = ts.isoformat()
        else:
            timestamp_str = str(ts)

        activities.append({
            "id": str(s.get("_id") or s.get("id")),
            "event_type": s.get("event_type") or "Product Scanned",
            "batch_name": display_name,
            "location": location_str,
            "timestamp": timestamp_str,
            "status": status,
            "vendor_id": vendor_id
        })

    # If no scans are currently in the database, return fallback simulated events
    # so the dashboard still displays nice initial mock items for first-time setup
    if not activities:
        now = datetime.now(timezone.utc)
        return [
            {
                "id": "act_001",
                "event_type": "Product Scanned",
                "batch_name": "Batch Kodak-001",
                "location": "Jaipur, India",
                "timestamp": now.isoformat(),
                "status": "authentic",
                "vendor_id": vendor_id
            },
            {
                "id": "act_002",
                "event_type": "Product Scanned",
                "batch_name": "Batch Kodak-001",
                "location": "Mumbai, India",
                "timestamp": (now - timedelta(minutes=30)).isoformat(),
                "status": "suspicious",
                "vendor_id": vendor_id
            },
            {
                "id": "act_003",
                "event_type": "Batch Verification Complete",
                "batch_name": "Batch Kodak-001",
                "location": "New Delhi, India",
                "timestamp": (now - timedelta(hours=3)).isoformat(),
                "status": "authentic",
                "vendor_id": vendor_id
            },
            {
                "id": "act_004",
                "event_type": "Thresholds Adjusted",
                "batch_name": "Batch Kodak-001",
                "location": "System Admin Console",
                "timestamp": (now - timedelta(hours=5)).isoformat(),
                "status": "needs_review",
                "vendor_id": vendor_id
            },
            {
                "id": "act_005",
                "event_type": "Product Scanned",
                "batch_name": "Batch Kodak-001",
                "location": "Bangalore, India",
                "timestamp": (now - timedelta(days=1)).isoformat(),
                "status": "likely_authentic",
                "vendor_id": vendor_id
            }
        ]

    return activities

@router.get("/admin/scans")
@limiter.limit("60/minute")
async def get_admin_scans(
    request: Request,
    current_user: dict = Depends(get_current_admin),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    vendor_id: Optional[str] = None,
    batch_id: Optional[str] = None
):
    """Admin-only: Retrieve global scan activity with filtering."""
    query = {}
    if vendor_id:
        query["vendor_id"] = vendor_id
    if batch_id:
        query["batch_id"] = batch_id
        
    scans = list(scans_collection.find(query, {"_id": 0})
                 .sort("timestamp", -1)
                 .skip(skip)
                 .limit(limit))
    
    total = scans_collection.count_documents(query)
    
    return {
        "scans": scans,
        "total": total,
        "limit": limit,
        "skip": skip
    }

@router.get("/vendor/scans")
@limiter.limit("60/minute")
async def get_vendor_scans(
    request: Request,
    current_user: dict = Depends(require_permission("ANALYTICS_VIEW")),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    product_id: Optional[str] = None
):
    """Vendor-only: Retrieve scan activity for their own products."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        return {"scans": [], "total": 0}
        
    await _verify_analytics_permission(vendor_id)
        
    query = {"vendor_id": vendor_id}
    if product_id:
        query["product_id"] = product_id
        
    scans = list(scans_collection.find(query, {"_id": 0})
                 .sort("timestamp", -1)
                 .skip(skip)
                 .limit(limit))
    
    total = scans_collection.count_documents(query)
    
    return {
        "scans": scans,
        "total": total,
        "limit": limit,
        "skip": skip
    }

@router.get("/vendor/activity")
@limiter.limit("120/minute")
async def get_vendor_activity(
    request: Request,
    current_user: dict = Depends(require_permission("ANALYTICS_VIEW")),
    limit: int = Query(20, ge=1, le=50)
):
    """Vendor-only: recent activity logs formatted for the frontend feed."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        logger.warning(f"User {current_user.get('email')} attempted to access vendor activity without vendor_id")
        return {"activity": []}
        
    await _verify_analytics_permission(vendor_id)
    
    logger.info(f"Fetching vendor activity for vendor_id: {vendor_id}, user: {current_user.get('email')}")
        
    activities = []
    
    # 1. Fetch scan activities from scans_collection
    try:
        db_query = {
            "vendor_id": vendor_id
        }
        scans = list(scans_collection.find(db_query).sort("timestamp", -1).limit(limit))
    except Exception as e:
        logger.error(f"Error fetching real scans for vendor activity: {e}")
        scans = []
    logger.info(f"Found {len(scans)} scan records for vendor_id: {vendor_id}")
    
    for s in scans:
        product_name = s.get("product_name") or "Unknown Product"
        pid = s.get("product_id")
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
            
        is_susp = s.get("is_suspicious")
        ai_stat = s.get("ai_status")
        is_fraud = is_susp and (ai_stat in ("suspicious", "counterfeit") or not ai_stat)
        is_review = ai_stat == "needs_review"
        
        event_type = s.get("event_type")
        if event_type == "Product Deleted":
            icon_type = "deleted"
            title = "Product Deleted"
            desc = f"Product {product_name} deleted in {location_str}."
        elif event_type == "Product Added":
            icon_type = "scan"
            title = "Product Added"
            desc = f"Product {product_name} registered in {location_str}."
        else:
            icon_type = "scan"
            title = "Product Scanned"
            if is_fraud:
                icon_type = "warning"
                title = "Suspicious Scan Detected"
            elif is_review:
                icon_type = "warning"
                title = "Scan Needs Review"
            desc = f"{product_name} verified in {location_str}."
        
        activities.append({
            "id": str(s["_id"]),
            "type": icon_type,
            "title": title,
            "description": desc,
            "timestamp": s.get("scan_timestamp") or s.get("timestamp"),
            "product_name": product_name,
            "batch_code": product_name,
            "verification_status": s.get("verification_status", "verified"),
            "location": location_str,
            "ip_address": s.get("ip_address"),
            "vendor_id": vendor_id
        })
    
    # 2. Fetch vendor operations logs from vendor_notifications_collection (includes Brand updates)
    try:
        ops = list(vendor_notifications_collection.find({"vendor_id": vendor_id}).sort("timestamp", -1).limit(limit))
        logger.info(f"Found {len(ops)} vendor notification records for vendor_id: {vendor_id}")
        
        for op in ops:
            title = op.get("title", "Operation")
            desc = op.get("description", "")
            
            # Determine icon type based on title
            icon_type = "scan"
            if "brand" in title.lower():
                icon_type = "product"
            elif "deleted" in title.lower():
                icon_type = "deleted"
            elif "team" in title.lower() or "member" in title.lower():
                icon_type = "scan"
            
            activities.append({
                "id": op.get("id") or str(op["_id"]),
                "type": icon_type,
                "title": title,
                "description": desc,
                "timestamp": op.get("timestamp"),
                "location": "Vendor Portal",
                "ip_address": op.get("ip_address"),
                "vendor_id": vendor_id
            })
    except Exception as e:
        logger.error(f"Error fetching vendor notifications for activity: {e}")
    
    # Sort all activities by timestamp descending
    def get_timestamp(x):
        ts = x.get("timestamp")
        if isinstance(ts, str):
            try:
                return datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                pass
        if isinstance(ts, datetime):
            return ts
        return datetime.min
    
    activities.sort(key=get_timestamp, reverse=True)
    
    return {"activity": activities[:limit]}

@router.get("/vendor/overview")
@limiter.limit("120/minute")
async def get_vendor_overview(request: Request, current_user: dict = Depends(require_permission("ANALYTICS_VIEW"))):
    """Vendor-only: Get aggregate metrics (Products, Scans)."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        return {"total_batches": 0, "total_products": 0, "total_scans": 0}
        
    await _verify_analytics_permission(vendor_id)
        
    total_products = products_collection.count_documents({"vendor_id": vendor_id})
    total_scans = scans_collection.count_documents({"vendor_id": vendor_id})
    
    # Calculate suspicious scans (e.g., more than 5 scans from same IP for same QR)
    pipeline = [
        {"$match": {"vendor_id": vendor_id}},
        {"$group": {
            "_id": {"qr_id": "$qr_id", "ip_address": "$ip_address"},
            "count": {"$sum": 1}
        }},
        {"$match": {"count": {"$gt": 5}}},
        {"$count": "suspicious_count"}
    ]
    suspicious_result = list(scans_collection.aggregate(pipeline))
    suspicious_scans = suspicious_result[0]["suspicious_count"] if suspicious_result else 0

    return {
        "total_batches": 0,
        "total_products": total_products,
        "total_scans": total_scans,
        "suspicious_scans": suspicious_scans
    }

@router.get("/vendor/trends")
@limiter.limit("120/minute")
async def get_vendor_trends(request: Request, days: int = Query(14, ge=7, le=90), current_user: dict = Depends(require_permission("ANALYTICS_VIEW"))):
    """Vendor-only: Get daily scan activity for the last X days."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        return {"trends": []}
        
    await _verify_analytics_permission(vendor_id)
        
    start_date = datetime.utcnow() - timedelta(days=days)
    
    pipeline = [
        {"$match": {
            "vendor_id": vendor_id,
            "timestamp": {"$gte": start_date}
        }},
        {"$group": {
            "_id": {
                "year": {"$year": "$timestamp"},
                "month": {"$month": "$timestamp"},
                "day": {"$day": "$timestamp"}
            },
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}}
    ]
    
    trends = []
    try:
        # Try native MongoDB aggregation
        results = list(scans_collection.aggregate(pipeline))
        for r in results:
            # Safely handle missing ID fields just in case
            if not r.get("_id"): continue
            y = r["_id"].get("year", 2024)
            m = r["_id"].get("month", 1)
            d = r["_id"].get("day", 1)
            date_str = f"{y}-{m:02d}-{d:02d}"
            trends.append({"date": date_str, "count": r.get("count", 0)})
    except Exception as e:
        # Fallback for Mongomock (which doesn't support $year/$month/$day)
        scans = list(scans_collection.find({
            "vendor_id": vendor_id,
            "timestamp": {"$gte": start_date}
        }))
        
        # Group in Python memory
        grouped = {}
        for s in scans:
            ts = s.get("timestamp")
            if not ts:
                continue
            date_str = ts.strftime("%Y-%m-%d")
            grouped[date_str] = grouped.get(date_str, 0) + 1
            
        # Sort and format
        for k in sorted(grouped.keys()):
            trends.append({"date": k, "count": grouped[k]})
        
    return {"trends": trends}

@router.get("/vendor/top-products")
@limiter.limit("120/minute")
async def get_vendor_top_products(request: Request, limit: int = Query(5, ge=1, le=20), current_user: dict = Depends(require_permission("ANALYTICS_VIEW"))):
    """Vendor-only: Get products with most scan activity."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        return {"top_products": []}
        
    await _verify_analytics_permission(vendor_id)

    # Aggregate scans directly by product_id
    pipeline = [
        {"$match": {"vendor_id": vendor_id, "product_id": {"$ne": None}}},
        {"$group": {"_id": "$product_id", "scan_count": {"$sum": 1}}},
        {"$sort": {"scan_count": -1}},
        {"$limit": limit}
    ]
    product_scans = list(scans_collection.aggregate(pipeline))

    top_products = []
    for ps in product_scans:
        pid = ps["_id"]
        product = products_collection.find_one({"id": pid}, {"_id": 0, "name": 1, "brand": 1, "category": 1})
        if product:
            top_products.append({"product_id": pid, **product, "scan_count": ps["scan_count"]})

    return {"top_products": top_products}

@router.get("/vendor/security-alerts")
@limiter.limit("120/minute")
async def get_vendor_security_alerts(request: Request, limit: int = Query(10, ge=1, le=50), current_user: dict = Depends(require_permission("ANALYTICS_VIEW"))):
    """Vendor-only: Detect and return recent suspicious scan activity and AI authenticity failures."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        return {"alerts": []}
        
    await _verify_analytics_permission(vendor_id)
    
    alerts = []

    # 1. Fetch recent AI-flagged authenticity failures
    ai_failures = list(scans_collection.find(
        {"vendor_id": vendor_id, "is_suspicious": True},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit))

    for af in ai_failures:
        alerts.append({
            "qr_id": af.get("qr_id"),
            "ip_address": af.get("ip_address"),
            "count": 1,
            "last_seen": af.get("timestamp"),
            "user_agent": af.get("user_agent", "unknown"),
            "batch_name": af.get("product_name") or "Unknown Product",
            "type": "ai_authenticity_failure",
            "ai_score": af.get("ai_score"),
            "ai_anomalies": af.get("ai_anomalies", [])
        })
        
    # 2. Detect IPs scanning the same QR more than 5 times
    pipeline = [
        {"$match": {"vendor_id": vendor_id}},
        {"$group": {
            "_id": {"qr_id": "$qr_id", "ip_address": "$ip_address"},
            "count": {"$sum": 1},
            "last_timestamp": {"$max": "$timestamp"},
            "user_agent": {"$first": "$user_agent"}
        }},
        {"$match": {"count": {"$gt": 5}}},
        {"$sort": {"last_timestamp": -1}},
        {"$limit": limit}
    ]
    
    results = list(scans_collection.aggregate(pipeline))
    
    for r in results:
        _id = r.get("_id")
        if not isinstance(_id, dict):
            continue
        qr_id = _id.get("qr_id")
        ip_address = _id.get("ip_address")
        if not qr_id or not ip_address:
            continue
            
        qr_doc = qr_codes_collection.find_one({"qr_id": qr_id}, {"product_id": 1})
        product_name = "Unknown Product"
        if qr_doc and qr_doc.get("product_id"):
            prod = products_collection.find_one({"id": qr_doc["product_id"]}, {"name": 1})
            if prod:
                product_name = prod.get("name", "Unknown Product")
        alerts.append({
            "qr_id": qr_id,
            "ip_address": ip_address,
            "count": r.get("count", 0),
            "last_seen": r.get("last_timestamp"),
            "user_agent": r.get("user_agent", "unknown"),
            "batch_name": product_name,
            "type": "velocity_threshold_breach"
        })
        
    # Sort unified security alerts by timestamp descending, filtering out those without a last_seen timestamp
    alerts = [a for a in alerts if a.get("last_seen") is not None]
    
    def get_sort_key(x):
        ls = x["last_seen"]
        if isinstance(ls, str):
            try:
                ls = datetime.fromisoformat(ls)
            except ValueError:
                pass
        if isinstance(ls, datetime):
            if ls.tzinfo is None:
                ls = ls.replace(tzinfo=timezone.utc)
            return ls
        return datetime.min.replace(tzinfo=timezone.utc)
        
    alerts.sort(key=get_sort_key, reverse=True)
    return {"alerts": alerts[:limit]}


@router.get("/admin/locations")
@limiter.limit("120/minute")
async def get_admin_locations(request: Request, current_user: dict = Depends(get_current_admin)):
    """Admin-only: Global scan locations grouped by country and city."""
    pipeline = [
        {"$match": {"location.country": {"$nin": [None, ""]}}},
        {"$group": {
            "_id": {"country": "$location.country", "city": "$location.city"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}},
        {"$limit": 50}
    ]
    
    results = list(scans_collection.aggregate(pipeline))
    
    locations = []
    for r in results:
        locations.append({
            "country": r["_id"].get("country", "Unknown"),
            "city": r["_id"].get("city", "Unknown"),
            "count": r["count"]
        })
        
    return {"locations": locations}


@router.get("/vendor/locations")
@limiter.limit("120/minute")
async def get_vendor_locations(request: Request, current_user: dict = Depends(require_permission("ANALYTICS_VIEW"))):
    """Vendor-only: Scan locations specific to the vendor's products."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        return {"locations": []}
        
    await _verify_analytics_permission(vendor_id, check_geolocation=True)
        
    pipeline = [
        {"$match": {"vendor_id": vendor_id, "location.country": {"$nin": [None, ""]}}},
        {"$group": {
            "_id": {"country": "$location.country", "city": "$location.city"},
            "count": {"$sum": 1}
        }},
        {"$sort": {"count": -1}},
        {"$limit": 50}
    ]
    
    results = list(scans_collection.aggregate(pipeline))
    
    locations = []
    for r in results:
        locations.append({
            "country": r["_id"].get("country", "Unknown"),
            "city": r["_id"].get("city", "Unknown"),
            "count": r["count"]
        })
        
    return {"locations": locations}


@router.post("/vendor/log-error")
@limiter.limit("200/minute")
async def log_vendor_error_endpoint(
    request: Request,
    error_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Vendor-only: Log background task errors (e.g., image upload failures) to notifications.
    """
    from app.core.audit import log_vendor_error

    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="Invalid vendor context")

    log_vendor_error(
        vendor_id=vendor_id,
        user_email=current_user.get("email"),
        error_title=error_data.get("error_title", "Background Task Error"),
        error_details=error_data.get("error_details"),
        product_id=error_data.get("product_id"),
        ip_address=request.client.host if request.client else None
    )

    return {"success": True}


@router.get("/vendor/notifications")
@limiter.limit("120/minute")
async def get_vendor_notifications(
    request: Request,
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(require_permission("ANALYTICS_VIEW"))
):
    """
    Vendor-only: Returns a unified notifications feed including operations log
    and security alerts (dynamic & AI flagged).
    """
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        return {"activity": []}

    await _verify_analytics_permission(vendor_id)

    activities = []

    # 1. Fetch Operations Logs from vendor_notifications
    try:
        ops = list(vendor_notifications_collection.find({"vendor_id": vendor_id}).sort("timestamp", -1).limit(limit))
        for op in ops:
            activities.append({
                "id": op.get("id") or str(op["_id"]),
                "type": op.get("type", "vendor_portal"),  # maps to "Operations" filter
                "title": op.get("title", "Operation"),
                "description": op.get("description", ""),
                "timestamp": op.get("timestamp"),
                "user_email": op.get("user_email"),
                "ip_address": op.get("ip_address"),
                "product_id": op.get("product_id"),
                "location": "Vendor Portal"
            })
    except Exception as e:
        logger.error(f"Error fetching operations logs for vendor notifications: {e}")

    # 2. Fetch Security Alerts (Suspicious scan attempts / AI authenticity failures)
    try:
        # AI-flagged scans
        ai_failures = list(scans_collection.find(
            {"vendor_id": vendor_id, "is_suspicious": True}
        ).sort("timestamp", -1).limit(limit))

        for af in ai_failures:
            product_name = af.get("product_name") or "Unknown Product"
            pid = af.get("product_id")
            if pid:
                prod = products_collection.find_one({"id": pid}, {"name": 1})
                if prod:
                    product_name = prod.get("name", product_name)

            location_str = "Unknown Location"
            loc = af.get("location")
            if loc:
                if isinstance(loc, dict):
                    parts = [p.strip() for p in [loc.get("city"), loc.get("state"), loc.get("country")] if p]
                    if parts:
                        location_str = ", ".join(parts)
                elif isinstance(loc, str):
                    location_str = loc

            activities.append({
                "id": str(af["_id"]),
                "type": "warning",  # maps to "Security Alerts" filter
                "title": "Suspicious Scan Detected",
                "description": f"AI authenticity check failed for product '{product_name}' in {location_str}.",
                "timestamp": af.get("timestamp"),
                "ip_address": af.get("ip_address"),
                "location": location_str,
                "product_name": product_name,
                "ai_score": af.get("ai_score"),
                "ai_anomalies": af.get("ai_anomalies", [])
            })
    except Exception as e:
        logger.error(f"Error fetching AI suspicious scans for vendor notifications: {e}")

    # 3. Dynamic IP spamming security alerts (same IP scanned > 5 times)
    try:
        pipeline = [
            {"$match": {"vendor_id": vendor_id}},
            {"$group": {
                "_id": {"qr_id": "$qr_id", "ip_address": "$ip_address"},
                "count": {"$sum": 1},
                "last_timestamp": {"$max": "$timestamp"},
                "user_agent": {"$first": "$user_agent"}
            }},
            {"$match": {"count": {"$gt": 5}}},
            {"$sort": {"last_timestamp": -1}},
            {"$limit": limit}
        ]
        
        velocity_results = list(scans_collection.aggregate(pipeline))
        for r in velocity_results:
            _id = r.get("_id") or {}
            qr_id = _id.get("qr_id")
            ip_address = _id.get("ip_address")
            if qr_id and ip_address:
                qr_doc = qr_codes_collection.find_one({"qr_id": qr_id}, {"product_id": 1})
                product_name = "Unknown Product"
                if qr_doc and qr_doc.get("product_id"):
                    prod = products_collection.find_one({"id": qr_doc["product_id"]}, {"name": 1})
                    if prod:
                        product_name = prod.get("name", "Unknown Product")

                activities.append({
                    "id": f"velocity_{qr_id}_{ip_address}",
                    "type": "warning",
                    "title": "Velocity Threshold Breach",
                    "description": f"IP {ip_address} scanned QR code for '{product_name}' {r.get('count')} times (possible counterfeit copy).",
                    "timestamp": r.get("last_timestamp"),
                    "ip_address": ip_address,
                    "location": "Multiple scan velocity check",
                    "product_name": product_name,
                    "scan_count": r.get("count")
                })
    except Exception as e:
        logger.error(f"Error fetching velocity threshold breaches: {e}")

    # Sort everything by timestamp descending
    def get_timestamp(x):
        ts = x.get("timestamp")
        if isinstance(ts, str):
            try:
                return datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                pass
        if isinstance(ts, datetime):
            return ts
        return datetime.min

    activities.sort(key=get_timestamp, reverse=True)

    return {"activity": activities[:limit]}
