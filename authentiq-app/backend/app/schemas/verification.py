from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class UploadedImageMetadata(BaseModel):
    image_type: str  # 'front', 'packaging', 'label', 'proof'
    filename: str
    file_size: int
    content_type: str
    stored_path: str
    uploaded_at: datetime

class AIResultSchema(BaseModel):
    authenticity_score: int
    status: str  # 'likely_authentic', 'suspicious', 'likely_fake'
    confidence: str  # 'low', 'medium', 'high'
    anomalies: List[str]
    recommendation: str
    processed_at: datetime

class VerificationSessionResponse(BaseModel):
    session_id: str
    qr_id: str
    status: str  # 'pending_upload', 'pending_ai', 'completed_authentic', 'completed_suspicious', 'failed'
    uploaded_images: List[UploadedImageMetadata]
    ai_result: Optional[AIResultSchema] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
