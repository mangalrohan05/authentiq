from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime


class ProductReferenceImage(BaseModel):
    id: str
    filename: str
    url: str
    view_type: Literal[
        "front",
        "front_view",
        "back",
        "back_view",
        "side",
        "side_view",
        "packaging",
        "labels",
        "holograms",
        "seals",
        "barcode_qr",
        "other",
        "additional_markers",
    ]
    size_bytes: int
    content_type: str
    uploaded_at: datetime
    embedding_cached: bool = False
    embedding_cached_at: Optional[datetime] = None
    embedding_vector: Optional[List[float]] = None


class ProductBase(BaseModel):
    name: str = Field(..., min_length=1)
    brand: str = Field(..., min_length=1)
    description: Optional[str] = None
    sku: Optional[str] = None
    serial_number: Optional[str] = None
    category: Optional[str] = None
    # batch_id removed — products now belong directly to vendor

    # ── Brand association ─────────────────────────────────────────────────────
    # brand_id links this product to a registered Brand document.
    # The legacy `brand` string field is kept for backward compatibility.
    brand_id: Optional[str] = None

    # ── Extended registration fields ──────────────────────────────────────────
    variant_name: Optional[str] = None          # e.g. "Aloo Bhujia 200g"
    pack_size: Optional[str] = None             # e.g. "12×200g"
    mrp: Optional[float] = None                 # Maximum Retail Price (INR)
    barcode: Optional[str] = None               # EAN-13 / UPC-A barcode
    hsn_code: Optional[str] = None              # HSN code for GST classification
    manufacturer_name: Optional[str] = None
    manufacturer_address: Optional[str] = None
    country_of_origin: Optional[str] = None
    product_status: Optional[Literal["active", "recalled"]] = "active"
    notes: Optional[str] = None                 # Internal remarks / QC notes


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    """Partial update schema — all fields optional."""
    name: Optional[str] = None
    brand: Optional[str] = None
    description: Optional[str] = None
    sku: Optional[str] = None
    serial_number: Optional[str] = None
    category: Optional[str] = None

    # Brand association
    brand_id: Optional[str] = None

    # Extended registration fields
    variant_name: Optional[str] = None
    pack_size: Optional[str] = None
    mrp: Optional[float] = None
    barcode: Optional[str] = None
    hsn_code: Optional[str] = None
    manufacturer_name: Optional[str] = None
    manufacturer_address: Optional[str] = None
    country_of_origin: Optional[str] = None
    product_status: Optional[Literal["active", "recalled"]] = None
    notes: Optional[str] = None


class ProductResponse(ProductBase):
    id: str
    vendor_id: Optional[str] = None
    timestamp: datetime
    updated_at: Optional[datetime] = None
    # Retaining batch_number as optional field for backward compatibility handling
    batch_number: Optional[str] = None
    reference_images: List[ProductReferenceImage] = Field(default_factory=list)
    # VLM-derived genuine-product spec built once at creation (metadata-at-creation).
    # {status, spec, extracted, model, generated_at, reference_view_count, error}
    authentication_profile: Optional[dict] = None

    class Config:
        from_attributes = True


class QRCustomizationUpdate(BaseModel):
    qr_primary_color: Optional[str] = None
    qr_secondary_color: Optional[str] = None
    qr_use_logo: Optional[bool] = None

