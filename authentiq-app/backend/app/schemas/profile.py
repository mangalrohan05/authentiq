from pydantic import BaseModel, Field
from typing import Any, Dict, List, Literal, Optional
from datetime import datetime


class NotificationPreferences(BaseModel):
    email_alerts: bool = True
    scan_anomaly_alerts: bool = True
    verification_reports: bool = True
    security_notifications: bool = True
    weekly_analytics_summary: bool = False


class VendorProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    brand_display_name: Optional[str] = None
    email: Optional[str] = None
    business_email: Optional[str] = None
    contact_number: Optional[str] = None
    website_url: Optional[str] = None
    business_address: Optional[str] = None
    country: Optional[str] = None
    tax_id: Optional[str] = None
    support_email: Optional[str] = None


class CompanyDetailsUpdate(BaseModel):
    """
    Legal entity (company-level) details for a vendor.
    One company can own multiple brands. GSTIN and PAN are validated
    strictly against their format regex — the API returns 422 on mismatch.
    """
    legal_company_name: Optional[str] = None
    company_type: Optional[Literal[
        "Pvt Ltd", "LLP", "Proprietorship", "Partnership", "Public Ltd"
    ]] = None
    # GSTIN: 15-char alphanumeric — 2 digit state code + 10 char PAN + 1 entity + Z + 1 checksum
    gstin: Optional[str] = Field(
        None,
        pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$",
        description="15-character GSTIN (e.g. 27AACCP1234A1Z5)",
    )
    # PAN: 5 alpha + 4 digits + 1 alpha
    pan: Optional[str] = Field(
        None,
        pattern=r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$",
        description="10-character PAN (e.g. AACCP1234A)",
    )
    cin: Optional[str] = None
    reg_address_line1: Optional[str] = None
    reg_address_line2: Optional[str] = None
    reg_city: Optional[str] = None
    reg_state: Optional[str] = None
    reg_pin: Optional[str] = None
    reg_country: Optional[str] = "India"
    industry_sector: Optional[Literal[
        "FMCG", "Pharma", "Agro", "Liquor", "Electronics", "Manufacturing", "Other"
    ]] = None
    company_website: Optional[str] = None
    # Primary contact details (pre-filled from auth user, editable)
    contact_full_name: Optional[str] = None
    contact_work_email: Optional[str] = None
    contact_mobile: Optional[str] = None
    contact_designation: Optional[str] = None

    # Trademark Details
    tm_status: Optional[str] = None
    tm_number: Optional[str] = None
    tm_app_file: Optional[str] = None
    tm_cert_file: Optional[str] = None
    brand_auth_file: Optional[str] = None

    # Verification Files
    gst_cert_file: Optional[str] = None
    inc_doc_file: Optional[str] = None
    pharma_drug_license_file: Optional[str] = None
    fssai_license_file: Optional[str] = None
    excise_license_file: Optional[str] = None

    # Verification Statuses
    gst_cert_status: Optional[str] = None
    inc_doc_status: Optional[str] = None
    pharma_drug_license_status: Optional[str] = None
    fssai_license_status: Optional[str] = None
    excise_license_status: Optional[str] = None
    tm_app_status: Optional[str] = None
    tm_cert_status: Optional[str] = None
    brand_auth_status: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)
    confirm_password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)
    confirm_password: str


class NotificationPreferencesUpdate(BaseModel):
    preferences: NotificationPreferences


class DeactivateAccountRequest(BaseModel):
    confirm: bool = False


class DeleteAccountRequest(BaseModel):
    confirm_text: str = ""


class VerifyPasswordRequest(BaseModel):
    password: str

