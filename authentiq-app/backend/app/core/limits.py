from fastapi import HTTPException, status
from app.core.db import (
    vendors_collection,
    plans_collection,
    brands_collection,
    products_collection,
    users_collection,
    invitations_collection,
)

def enforce_organization_limit(vendor_id: str, limit_type: str):
    """
    Check if the organization has reached its plan limit for a resource type.
    Raises HTTPException 403 Forbidden with upgrade prompt if limit is hit.
    
    Supported limit_types:
      - "max_brands"
      - "max_products" (SKUs)
      - "max_users"
    """
    vendor = vendors_collection.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
        
    if vendor.get("subscription_status") != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your organization's subscription is inactive or suspended. Please contact billing.",
        )
        
    plan_id = vendor.get("assigned_plan") or "free_trial"
    plan = plans_collection.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Assigned plan definition not found",
        )

    # Resolve limits prioritizing database overrides (purchased custom limits)
    limits = plan.get("limits", {})
    
    if limit_type == "max_brands":
        limit = vendor.get("total_brands_limit")
        if limit is None:
            limit = limits.get("max_brands", 1)
            
        # If limit is 0 but plan has -1 (unlimited), use plan limit instead
        if limit == 0 and limits.get("max_brands") == -1:
            limit = -1
            
        if limit != -1:
            current_count = brands_collection.count_documents({"vendor_id": vendor_id, "status": "active"})
            if current_count >= limit:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Your current plan allows up to {limit} Brand(s). Upgrade to Growth Plan or contact support to continue.",
                )

    elif limit_type == "max_products":
        limit = vendor.get("total_skus_limit")
        if limit is None:
            limit = limits.get("max_products", 1)
            
        # If limit is 0 but plan has -1 (unlimited), use plan limit instead
        if limit == 0 and limits.get("max_products") == -1:
            limit = -1
            
        if limit != -1:
            current_count = products_collection.count_documents({"vendor_id": vendor_id})
            if current_count >= limit:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Your current plan allows up to {limit} SKUs. Upgrade to Growth Plan to continue.",
                )

    elif limit_type == "max_users":
        limit = vendor.get("total_users_limit")
        if limit is None:
            limit = limits.get("max_users", 1)
            
        # If limit is 0 but plan has -1 (unlimited), use plan limit instead
        if limit == 0 and limits.get("max_users") == -1:
            limit = -1
            
        if limit != -1:
            # Active users in the organization
            active_users = users_collection.count_documents({"vendor_id": vendor_id})
            # Pending invitations in the organization
            pending_invites = invitations_collection.count_documents({"vendor_id": vendor_id, "status": "pending"})
            
            if (active_users + pending_invites) >= limit:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Your current plan allows up to {limit} team members (active + pending). Upgrade to invite more users.",
                )
