from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.db import (
    company_qr_collection,
    products_collection,
    vendors_collection,
)
from app.core.limiter import limiter
from app.core.security import get_current_user
from app.schemas.company_qr import CompanyQRResponse
from app.services.company_qr_service import (
    build_company_qr_document,
    normalize_company_qr,
)

router = APIRouter()


def _assert_company_access(current_user: dict, company_id: str) -> None:
    role = current_user.get("role")
    if role == "admin":
        return
    if role in ("vendor", "Administrator", "Manager", "Viewer") and current_user.get("vendor_id") == company_id:
        return
    raise HTTPException(status_code=403, detail="Access denied")


@router.post("/company/{company_id}/generate-qr", response_model=CompanyQRResponse)
@limiter.limit("20/minute")
async def generate_company_qr(
    request: Request,
    company_id: str,
    current_user: dict = Depends(get_current_user),
):
    _assert_company_access(current_user, company_id)

    vendor = vendors_collection.find_one({"id": company_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Company not found")

    existing = company_qr_collection.find_one({"company_id": company_id}, {"_id": 0})
    if existing:
        return existing

    doc = build_company_qr_document(company_id)
    company_qr_collection.insert_one(doc)
    return doc


@router.get("/company/{company_id}/qr", response_model=CompanyQRResponse)
@limiter.limit("60/minute")
async def get_company_qr(
    request: Request,
    company_id: str,
    current_user: dict = Depends(get_current_user),
):
    _assert_company_access(current_user, company_id)
    doc = company_qr_collection.find_one({"company_id": company_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Company QR not found")
    return doc


@router.get("/verify/company/{company_id}")
@limiter.limit("120/minute")
async def verify_company(company_id: str, request: Request):
    vendor = vendors_collection.find_one({"id": company_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(status_code=404, detail="Company not found")

    products = list(
        products_collection.find(
            {"vendor_id": company_id, "archived": {"$ne": True}},
            {"_id": 0, "id": 1, "name": 1, "brand": 1, "sku": 1, "category": 1},
        )
    )

    return {
        "company": {
            "id": vendor.get("id"),
            "vendor_name": vendor.get("vendor_name"),
            "company_name": vendor.get("company_name"),
            "support_email": vendor.get("support_email"),
        },
        "batches": [],
        "products": products,
    }
