from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Literal
from datetime import datetime

# Feature flags are now resolved via feature_resolver and Managed by PlanFeaturesBase and VendorFeatureOverride

class PlanLimits(BaseModel):
    max_products: int = 10
    max_batches: int = 5
    max_scans_per_month: int = 500

class PlanBase(BaseModel):
    name: str
    description: Optional[str] = None
    active: bool = True
    limits: PlanLimits
    base_price: Optional[float] = 0.0
    billing_cycle: Optional[str] = "monthly"
    is_customizable: Optional[bool] = False
    feature_ids: Optional[List[str]] = []

class PlanCreate(PlanBase):
    pass

class PlanUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None
    limits: Optional[PlanLimits] = None
    base_price: Optional[float] = None
    billing_cycle: Optional[str] = None
    is_customizable: Optional[bool] = None
    feature_ids: Optional[List[str]] = None

class PlanResponse(PlanBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

# ── Subscription Management Schemas ───────────────────────────────────────────

SubscriptionStatus = Literal["active", "suspended", "inactive", "expired"]

class VendorSubscriptionStatusUpdate(BaseModel):
    status: SubscriptionStatus

class PlanUsage(BaseModel):
    products_used: int = 0
    batches_used: int = 0
    scans_this_month: int = 0

class VendorPlanResponse(BaseModel):
    vendor_id: str
    vendor_name: str
    assigned_plan: Optional[str] = None
    plan_name: Optional[str] = None
    subscription_status: str = "inactive"
    plan_assigned_at: Optional[datetime] = None
    assigned_by: Optional[str] = None
    limits: Optional[dict] = None
    usage: PlanUsage = PlanUsage()

class PlanHistoryEntry(BaseModel):
    plan_id: str
    changed_at: datetime
    changed_by: str
    previous_status: Optional[str] = None

class PlanWithFeatures(PlanResponse):
    """Plan response with resolved feature details."""
    features: List[dict] = []  # Resolved feature objects
    vendor_id: str
    vendor_name: str
    assigned_plan: Optional[str] = None
    plan_name: Optional[str] = None
    subscription_status: str = "inactive"
    plan_assigned_at: Optional[datetime] = None
    assigned_by: Optional[str] = None
    limits: Optional[dict] = None
    usage: PlanUsage = PlanUsage()

class PlanHistoryEntry(BaseModel):
    plan_id: str
    changed_at: datetime
    changed_by: str
    previous_status: Optional[str] = None
