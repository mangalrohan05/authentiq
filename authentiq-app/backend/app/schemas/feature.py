from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class ResolvedFeatures(BaseModel):
    """Single source of truth for a vendor's resolved features."""
    location: Literal['none', 'region_level', 'full_heatmaps']
    csv_export: bool
    bulk_qr: bool
    telemetry: bool
    case_level: Literal['basic', 'full']
    api_webhooks: bool
    sso: bool

class PlanFeaturesBase(BaseModel):
    plan_slug: str
    location: Literal['none', 'region_level', 'full_heatmaps'] = 'none'
    csv_export: bool = False
    bulk_qr: bool = False
    telemetry: bool = False
    case_level: Literal['basic', 'full'] = 'basic'
    api_webhooks: bool = False
    sso: bool = False

class VendorFeatureOverrideCreate(BaseModel):
    feature_key: Literal['location', 'csv_export', 'bulk_qr', 'telemetry', 'case_level', 'api_webhooks', 'sso']
    override_value: str  # Can be boolean (as string "true"/"false") or enum value depending on feature domain
    reason: Optional[str] = None

class VendorFeatureOverrideResponse(BaseModel):
    vendor_id: str
    feature_key: str
    override_value: str
    granted_by: str
    reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
