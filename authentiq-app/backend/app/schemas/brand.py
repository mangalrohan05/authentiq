"""
Pydantic schemas for the Brand entity.

A Brand belongs to one Vendor (legal entity) but a vendor can have many brands.
Examples: Prataap Snacks Ltd. (vendor) → Bikaji, Yellow Diamond, Rich Feast (brands).
"""

from __future__ import annotations

from typing import List, Literal, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class BrandCreate(BaseModel):
    brand_name: str = Field(..., min_length=1, max_length=120)
    brand_display_name: Optional[str] = Field(None, max_length=120)
    brand_tagline: Optional[str] = Field(None, max_length=240)
    product_categories: Optional[List[str]] = Field(default_factory=list)


class BrandUpdate(BaseModel):
    brand_name: Optional[str] = Field(None, min_length=1, max_length=120)
    brand_display_name: Optional[str] = Field(None, max_length=120)
    brand_tagline: Optional[str] = Field(None, max_length=240)
    product_categories: Optional[List[str]] = None
    status: Optional[Literal["active", "inactive"]] = None


class BrandResponse(BaseModel):
    id: str
    vendor_id: str
    brand_name: str
    brand_display_name: Optional[str] = None
    brand_logo_url: Optional[str] = None
    brand_tagline: Optional[str] = None
    product_categories: List[str] = Field(default_factory=list)
    status: str = "active"
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
