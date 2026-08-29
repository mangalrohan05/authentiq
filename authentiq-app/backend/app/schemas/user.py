from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    """Schema for creating a new user (admin or vendor)."""
    name: str
    email: str
    password: str
    role: Optional[str] = "vendor"
    vendor_id: Optional[str] = None  # link vendor users to their vendor record


class LoginRequest(BaseModel):
    """Schema for JSON-based login (email + password)."""
    email: str
    password: str


class UserResponse(BaseModel):
    """Public-facing user representation (no password)."""
    id: str
    name: str
    email: str
    role: str
    vendor_id: Optional[str] = None
    created_at: datetime
    verification_status: Optional[str] = "verified"
    feature_overrides: Optional[list] = None  # Feature overrides for this user


class Token(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str


class TokenWithRole(BaseModel):
    """Extended JWT token response that also returns role + name for frontend routing."""
    access_token: str
    token_type: str
    role: str
    name: str
    email: str
    verification_status: Optional[str] = "verified"

class UserStatusUpdate(BaseModel):
    """Schema for toggling a user's status."""
    status: str

class UserPasswordReset(BaseModel):
    """Schema for resetting a user's password."""
    new_password: str


class AdminPasswordVerify(BaseModel):
    """Schema for admin password verification for critical actions."""
    admin_password: str


class CheckoutRegisterRequest(BaseModel):
    """Schema for registers from the main website checkout flow."""
    legalName: str
    companyType: str
    gstin: Optional[str] = None
    pan: Optional[str] = None
    cin: Optional[str] = None
    addressLine1: Optional[str] = None
    addressLine2: Optional[str] = None
    city: Optional[str] = None
    stateName: Optional[str] = None
    pinCode: Optional[str] = None
    selectedCountry: Optional[str] = "India"
    industry: str
    website: Optional[str] = None

    # Contact Details
    fullName: str
    email: str
    phone: str
    designation: str
    password: str

    # Plan Details
    planName: str
    extraUsers: int = 0
    extraSKUs: int = 0
    extraBrands: int = 0
    totalUsers: int = 0
    totalSKUs: int = 0
    totalBrands: int = 0


class InvitationAcceptRequest(BaseModel):
    """Schema for accepting a workspace invitation."""
    token: str
    name: str
    password: str


