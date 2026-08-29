import logging
from typing import Dict, Any
from app.core.db import vendors_collection, plan_features_collection, vendor_feature_overrides_collection
from app.core.cache import cache_store
from app.schemas.feature import ResolvedFeatures, PlanFeaturesBase

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 300  # 5 minutes

def get_vendor_features_cache_key(vendor_id: str) -> str:
    return f"vendor_features:{vendor_id}"

async def resolve_vendor_features(vendor_id: str) -> ResolvedFeatures:
    """
    Resolve the feature set for a vendor.
    1. Check Cache
    2. Fetch vendor -> plan_slug
    3. Fetch plan_features for plan_slug
    4. Fetch vendor_feature_overrides for vendor_id
    5. Overlay overrides on plan defaults
    6. Cache and return
    """
    cache_key = get_vendor_features_cache_key(vendor_id)
    cached_features = cache_store.get(cache_key)
    if cached_features:
        return ResolvedFeatures(**cached_features)

    # 1. Fetch vendor's assigned plan
    vendor = vendors_collection.find_one({"id": vendor_id})
    if not vendor:
        logger.warning(f"Vendor {vendor_id} not found. Returning empty free_trial features.")
        return ResolvedFeatures(**PlanFeaturesBase(plan_slug="free_trial").dict())

    plan_slug = vendor.get("assigned_plan") or "free_trial"

    # 2. Fetch plan defaults
    plan_features = plan_features_collection.find_one({"plan_slug": plan_slug})
    if not plan_features:
        logger.warning(f"Plan features for {plan_slug} not found. Returning defaults.")
        plan_features = PlanFeaturesBase(plan_slug=plan_slug).dict()
    else:
        # Convert to dictionary if it's a mongo document
        plan_features = {k: v for k, v in plan_features.items() if k != "_id"}
        # Ensure fallback
        defaults = PlanFeaturesBase(plan_slug=plan_slug).dict()
        defaults.update(plan_features)
        plan_features = defaults

    # 3. Fetch overrides
    overrides_cursor = vendor_feature_overrides_collection.find({"vendor_id": vendor_id})
    overrides = {o["feature_key"]: o["override_value"] for o in overrides_cursor}

    # 4. Apply overrides
    resolved_dict = {}
    for key in ["location", "csv_export", "bulk_qr", "telemetry", "case_level", "api_webhooks", "sso"]:
        if key in overrides:
            val = overrides[key]
            # Convert string boolean if needed
            if val in ["true", "True"]: val = True
            elif val in ["false", "False"]: val = False
            resolved_dict[key] = val
        else:
            resolved_dict[key] = plan_features.get(key)

    resolved = ResolvedFeatures(**resolved_dict)
    
    # 5. Cache result
    cache_store.set(cache_key, resolved.dict(), CACHE_TTL_SECONDS)
    
    return resolved

def invalidate_vendor_features_cache(vendor_id: str) -> None:
    """Invalidate the cached features for a vendor."""
    cache_key = get_vendor_features_cache_key(vendor_id)
    cache_store.invalidate(cache_key)
