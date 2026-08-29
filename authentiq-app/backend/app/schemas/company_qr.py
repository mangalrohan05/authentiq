from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel


class CompanyQRResponse(BaseModel):
    id: str
    company_id: str
    qr_code_url: str
    verification_url: str
    image_url: str
    created_at: datetime


class CompanyVerificationProduct(BaseModel):
    id: str
    name: str
    brand: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None


class CompanyVerificationBatch(BaseModel):
    id: str
    batch_name: str
    created_at: Optional[datetime] = None
    qr_id: Optional[str] = None
    verification_url: Optional[str] = None
    product: Optional[CompanyVerificationProduct] = None


class CompanyVerificationResponse(BaseModel):
    company: dict
    batches: List[CompanyVerificationBatch]
    products: List[CompanyVerificationProduct]
