import os
import uuid
from datetime import datetime
from typing import Optional

import qrcode

COMPANY_QR_STATIC_ROOT = os.path.join("static", "company_qr")


def build_company_verify_url(company_id: str) -> str:
    frontend_base = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{frontend_base}/verify/company/{company_id}"


def create_company_qr_image(company_id: str, verify_url: str) -> str:
    os.makedirs(COMPANY_QR_STATIC_ROOT, exist_ok=True)
    filename = f"{company_id}_{uuid.uuid4().hex[:8]}.png"
    abs_path = os.path.join(COMPANY_QR_STATIC_ROOT, filename)

    img = qrcode.make(verify_url)
    img.save(abs_path)
    return f"/static/company_qr/{filename}"


def build_company_qr_document(company_id: str) -> dict:
    verification_url = build_company_verify_url(company_id)
    image_url = create_company_qr_image(company_id, verification_url)
    return {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "qr_code_url": verification_url,
        "verification_url": verification_url,
        "image_url": image_url,
        "created_at": datetime.utcnow(),
    }


def normalize_company_qr(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    out = dict(doc)
    out.pop("_id", None)
    return out
