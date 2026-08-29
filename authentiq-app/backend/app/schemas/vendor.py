from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class VendorCreate(BaseModel):
    vendor_name: str
    assigned_plan: Optional[str] = None

class VendorResponse(BaseModel):
    id: str
    vendor_name: str
    assigned_plan: Optional[str] = None
    subscription_status: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AdminVendorCreate(BaseModel):
    """Schema for admin to create a vendor with user credentials and plan assignment."""
    name: str
    email: str
    password: str
    company_name: str
    plan_id: Optional[str] = None
