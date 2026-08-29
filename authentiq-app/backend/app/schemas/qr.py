from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class QRGenerate(BaseModel):
    product_id: str

class QRResponse(BaseModel):
    qr_id: str
    verification_url: str
    product_id: str
    timestamp: datetime

class QRGenerateBulk(BaseModel):
    product_id: str
    count: Optional[int] = 50
