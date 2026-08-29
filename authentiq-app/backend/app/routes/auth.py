import logging
import secrets
from datetime import timedelta, datetime

from fastapi import APIRouter, Depends, HTTPException, status, Request

from app.core import security
from app.core.db import users_collection, vendors_collection, plans_collection, invitations_collection
from app.core.limiter import limiter
from app.schemas.user import UserCreate, UserResponse, TokenWithRole, LoginRequest, CheckoutRegisterRequest, InvitationAcceptRequest
from app.schemas.profile import ForgotPasswordRequest, ResetPasswordRequest
from app.schemas.profile import VerifyPasswordRequest
from app.services.email_service import send_password_reset_email, send_user_creation_email
from app.services.password_policy import validate_password_strength

logger = logging.getLogger(__name__)

router = APIRouter()

from app.core.audit import log_vendor_action


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(user: UserCreate):
    """
    Register a new user (admin or vendor).
    Prevents duplicate emails.
    """
    # Check for duplicate email
    if users_collection.find_one({"email": user.email}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    password_hash = security.get_password_hash(user.password)
    new_user = {
        "name": user.name.strip(),
        "email": user.email.lower().strip(),
        "password_hash": password_hash,
        "role": user.role,
        "vendor_id": user.vendor_id,
        "status": "active",
        "created_at": datetime.utcnow(),
    }
    result = users_collection.insert_one(new_user)

    return {
        "id": str(result.inserted_id),
        "name": new_user["name"],
        "email": new_user["email"],
        "role": new_user["role"],
        "vendor_id": new_user["vendor_id"],
        "created_at": new_user["created_at"],
    }


@router.post("/login", response_model=TokenWithRole)
@limiter.limit("5/minute")
async def login(request: Request, credentials: LoginRequest):
    """
    Authenticate with email + password.
    Returns JWT access token plus role/name for frontend routing.
    """
    user = users_collection.find_one({"email": credentials.email.lower().strip()})
    if not user or not security.verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.get("status") == "inactive":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )

    # Check if user belongs to a vendor that is inactive or suspended
    vendor_id = user.get("vendor_id")
    if vendor_id:
        vendor = vendors_collection.find_one({"id": vendor_id})
        if vendor and vendor.get("subscription_status") in ("inactive", "suspended"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled",
            )

    user_agent = request.headers.get("User-Agent", "unknown")
    users_collection.update_one(
        {"email": user["email"]},
        {
            "$set": {
                "last_login": datetime.utcnow(),
                "last_login_user_agent": user_agent[:512],
            }
        },
    )

    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user["email"], "role": user["role"]},
        expires_delta=access_token_expires,
    )

    # Fetch plan details for vendor
    plan_details = None
    # Check user's verification_status first (for new vendor onboarding flow)
    verification_status = user.get("verification_status", "verified")
    
    if user.get("role") in ("vendor", "Administrator", "Manager", "Viewer") and user.get("vendor_id"):
        vendor = vendors_collection.find_one({"id": user["vendor_id"]})
        if vendor:
            # Only use vendor's verification_status if user doesn't have one set
            if verification_status == "verified":
                verification_status = vendor.get("verification_status", "verified")
            assigned_plan = vendor.get("assigned_plan") or "free_trial"
            if assigned_plan:
                plan = plans_collection.find_one({"id": assigned_plan})
                if plan:
                    # Exclude internal _id
                    plan.pop("_id", None)
                    plan_details = plan.copy()
                    plan_details["limits"] = plan_details.get("limits", {}).copy()
                    if vendor.get("total_users_limit") is not None:
                        plan_details["limits"]["max_users"] = vendor["total_users_limit"]
                    if vendor.get("total_skus_limit") is not None:
                        plan_details["limits"]["max_products"] = vendor["total_skus_limit"]
                    if vendor.get("total_brands_limit") is not None:
                        plan_details["limits"]["max_brands"] = vendor["total_brands_limit"]

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user["role"],
        "name": user.get("name", ""),
        "email": user["email"],
        "plan": plan_details,
        "verification_status": verification_status,
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(security.get_current_user)):
    """
    Return the currently authenticated user's profile.
    Used by frontend to restore session from stored token.
    """
    plan_details = None
    # Check user's verification_status first (for new vendor onboarding flow)
    verification_status = current_user.get("verification_status", "verified")
    
    if current_user.get("role") in ("vendor", "Administrator", "Manager", "Viewer") and current_user.get("vendor_id"):
        vendor = vendors_collection.find_one({"id": current_user["vendor_id"]})
        if vendor:
            # Only use vendor's verification_status if user doesn't have one set
            if verification_status == "verified":
                verification_status = vendor.get("verification_status", "verified")
            assigned_plan = vendor.get("assigned_plan") or "free_trial"
            if assigned_plan:
                plan = plans_collection.find_one({"id": assigned_plan})
                if plan:
                    plan.pop("_id", None)
                    plan_details = plan.copy()
                    plan_details["limits"] = plan_details.get("limits", {}).copy()
                    if vendor.get("total_users_limit") is not None:
                        plan_details["limits"]["max_users"] = vendor["total_users_limit"]
                    if vendor.get("total_skus_limit") is not None:
                        plan_details["limits"]["max_products"] = vendor["total_skus_limit"]
                    if vendor.get("total_brands_limit") is not None:
                        plan_details["limits"]["max_brands"] = vendor["total_brands_limit"]

    return {
        "id": current_user.get("id", ""),
        "name": current_user.get("name", ""),
        "email": current_user.get("email", ""),
        "role": current_user.get("role", ""),
        "vendor_id": current_user.get("vendor_id"),
        "created_at": current_user.get("created_at", datetime.utcnow()),
        "plan": plan_details,
        "verification_status": verification_status,
    }


@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest):
    """
    Request a password reset link. Always returns success to avoid email enumeration.
    """
    email = body.email.lower().strip()
    user = users_collection.find_one({"email": email, "role": {"$in": ["vendor", "Administrator", "Manager", "Viewer"]}})
    if user:
        token = secrets.token_urlsafe(32)
        expiry = datetime.utcnow() + timedelta(hours=1)
        users_collection.update_one(
            {"email": email},
            {
                "$set": {
                    "password_reset_token": token,
                    "password_reset_expiry": expiry,
                }
            },
        )
        send_password_reset_email(email, token)
    else:
        logger.info("[Auth] Forgot password requested for unknown email: %s", email)

    return {
        "message": "If an account exists for this email, a reset link has been sent.",
    }


@router.post("/reset-password")
@limiter.limit("10/minute")
async def reset_password(request: Request, body: ResetPasswordRequest):
    """Reset password using a valid token from email."""
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    ok, errors = validate_password_strength(body.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail={"errors": errors})

    user = users_collection.find_one(
        {
            "password_reset_token": body.token,
            "password_reset_expiry": {"$gt": datetime.utcnow()},
        }
    )
    if not user:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset token. Request a new reset link.",
        )

    users_collection.update_one(
        {"email": user["email"]},
        {
            "$set": {"password_hash": security.get_password_hash(body.new_password)},
            "$unset": {"password_reset_token": "", "password_reset_expiry": ""},
        },
    )
    return {"message": "Password reset successfully. You can sign in now."}


@router.get("/reset-password/validate")
@limiter.limit("30/minute")
async def validate_reset_token(request: Request, token: str):
    user = users_collection.find_one(
        {
            "password_reset_token": token,
            "password_reset_expiry": {"$gt": datetime.utcnow()},
        }
    )
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    return {"valid": True, "email_hint": user["email"][:3] + "***"}


@router.post("/logout")
async def logout():
    """
    Logout endpoint (client-side token invalidation).
    The frontend removes the stored token. No server-side session to destroy.
    """
    return {"message": "Logged out successfully. Please remove your token from storage."}


@router.post("/checkout-register", status_code=201)
async def checkout_register(payload: CheckoutRegisterRequest):
    """
    Unified checkout registration from the main website.
    Creates both the vendor company record and the primary admin user login.
    """
    import uuid
    # Check for duplicate email
    if users_collection.find_one({"email": payload.email.lower().strip()}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # 1. Map planName to database assigned_plan ID
    plan_mapping = {
        "Free Trial": "free_trial",
        "Starter": "free_trial",
        "Business": "business",
        "Business Pro": "business_pro",
        "Enterprise": "enterprise"
    }
    assigned_plan = plan_mapping.get(payload.planName, "free_trial")

    # 2. Create Vendor record
    vendor_id = str(uuid.uuid4())
    
    # We initialize document files and statuses to None/pending
    new_vendor = {
        "id": vendor_id,
        "vendor_name": payload.legalName.strip(),
        "company_name": payload.legalName.strip(),
        "assigned_plan": assigned_plan,
        "subscription_status": "active",
        "verification_status": "pending",
        "created_at": datetime.utcnow(),
        
        # Company Details
        "legal_company_name": payload.legalName.strip(),
        "company_type": payload.companyType,
        "gstin": payload.gstin.strip() if payload.gstin else None,
        "pan": payload.pan.strip() if payload.pan else None,
        "cin": payload.cin.strip() if payload.cin else None,
        "reg_address_line1": payload.addressLine1.strip() if payload.addressLine1 else None,
        "reg_address_line2": payload.addressLine2.strip() if payload.addressLine2 else None,
        "reg_city": payload.city.strip() if payload.city else None,
        "reg_state": payload.stateName if payload.stateName else None,
        "reg_pin": payload.pinCode.strip() if payload.pinCode else None,
        "reg_country": payload.selectedCountry if payload.selectedCountry else "India",
        "industry_sector": payload.industry,
        "company_website": payload.website.strip() if payload.website else None,
        
        # Contact Details
        "contact_full_name": payload.fullName.strip(),
        "contact_work_email": payload.email.lower().strip(),
        "contact_mobile": f"+91{payload.phone.strip()}" if not payload.phone.startswith("+") else payload.phone.strip(),
        "contact_designation": payload.designation.strip(),
        
        # Compliance Document Files
        "gst_cert_file": None,
        "inc_doc_file": None,
        "pharma_drug_license_file": None,
        "fssai_license_file": None,
        "excise_license_file": None,
        
        # Verification Statuses
        "gst_cert_status": None,
        "inc_doc_status": None,
        "pharma_drug_license_status": None,
        "fssai_license_status": None,
        "excise_license_status": None,
        "tm_app_status": None,
        "tm_cert_status": None,
        "brand_auth_status": None,
        
        # Extra limits configuration if they customized during checkout
        "extra_users": payload.extraUsers,
        "extra_skus": payload.extraSKUs,
        "extra_brands": payload.extraBrands,
        "total_users_limit": payload.totalUsers,
        "total_skus_limit": payload.totalSKUs,
        "total_brands_limit": payload.totalBrands,
    }

    from bson import ObjectId
    user_oid = ObjectId()
    user_id_str = str(user_oid)

    # Set owner_id on vendor record
    new_vendor["owner_id"] = user_id_str

    # Insert vendor
    vendors_collection.insert_one(new_vendor)

    # 3. Create User record
    password_hash = security.get_password_hash(payload.password)
    new_user = {
        "_id": user_oid,
        "name": payload.fullName.strip(),
        "email": payload.email.lower().strip(),
        "password_hash": password_hash,
        "role": "Administrator",
        "vendor_id": vendor_id,
        "status": "active",
        "created_at": datetime.utcnow(),
    }
    users_collection.insert_one(new_user)

    return {
        "status": "success",
        "message": "Vendor registered successfully",
        "vendor_id": vendor_id,
        "email": payload.email.lower().strip()
    }


@router.post("/invitation/accept", status_code=201)
@limiter.limit("5/minute")
async def accept_invitation(request: Request, payload: InvitationAcceptRequest):
    """
    Accept a workspace invitation, registering the user in the database.
    """
    # 1. Look up invitation
    invite = invitations_collection.find_one({"id": payload.token})
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found or invalid token",
        )
    
    if invite.get("status") != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invitation has already been {invite.get('status')}",
        )
        
    email = invite["email"].lower().strip()
    
    # 2. Check if user already exists
    if users_collection.find_one({"email": email}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address is already registered",
        )
        
    # 3. Validate password strength
    ok, errors = validate_password_strength(payload.password)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"errors": errors}
        )
        
    # 4. Create user
    password_hash = security.get_password_hash(payload.password)
    new_user = {
        "name": payload.name.strip(),
        "email": email,
        "password_hash": password_hash,
        "role": invite["role"],
        "vendor_id": invite["vendor_id"],
        "status": "active",
        "created_at": datetime.utcnow(),
        "invited_by": invite.get("invited_by"),
    }
    users_collection.insert_one(new_user)
    
    # 5. Mark invitation as accepted
    invitations_collection.update_one(
        {"id": payload.token},
        {"$set": {"status": "accepted", "accepted_at": datetime.utcnow()}}
    )
    
    log_vendor_action(invite["vendor_id"], email, "Invitation Accepted", {"description": f"User {email} accepted invitation and joined organization."})
    
    return {
        "status": "success",
        "message": "Invitation accepted successfully. You can now log in.",
        "email": email
    }


@router.post("/verify-password")
async def verify_password(
    request: Request,
    payload: VerifyPasswordRequest,
    current_user: dict = Depends(security.get_current_user)
):
    """
    Verify the current user's password for critical actions.
    Used for re-authentication before sensitive operations.
    """
    user = users_collection.find_one({"email": current_user.get("email")})
    if not user:
      raise HTTPException(status_code=404, detail="User not found")
    
    if not security.verify_password(payload.password, user.get("password_hash")):
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")
    
    return {"status": "success", "message": "Password verified"}


@router.post("/create-user-manually", status_code=201)
async def create_user_manually(
    request: Request,
    user_data: UserCreate,
    current_user: dict = Depends(security.get_current_admin)
):
    """
    Administrator-only: Manually create a new user with email notification.
    User is created with status 'pending_confirmation' and receives credentials via email.
    """
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="Invalid vendor context")
    
    # Check for duplicate email
    if users_collection.find_one({"email": user_data.email.lower().strip()}):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate password strength
    ok, errors = validate_password_strength(user_data.password)
    if not ok:
        raise HTTPException(status_code=400, detail={"errors": errors})
    
    # Enforce role hierarchy limits
    if user_data.role == "Administrator":
        # Check if there's already an Administrator in this organization
        existing_admin = users_collection.find_one({
            "vendor_id": vendor_id,
            "role": "Administrator"
        })
        if existing_admin:
            raise HTTPException(
                status_code=403,
                detail="Only 1 Administrator is allowed per organization"
            )
    elif user_data.role in ["Manager", "Viewer"]:
        # Check plan limits for Managers and Viewers
        vendor = vendors_collection.find_one({"id": vendor_id})
        if not vendor:
            raise HTTPException(status_code=404, detail="Vendor not found")
        
        plan_id = vendor.get("assigned_plan") or "free_trial"
        plan = plans_collection.find_one({"id": plan_id})
        if plan:
            limits = plan.get("limits", {})
            current_users = users_collection.count_documents({"vendor_id": vendor_id})
            
            if user_data.role == "Manager":
                max_managers = limits.get("max_managers", 5)
                current_managers = users_collection.count_documents({
                    "vendor_id": vendor_id,
                    "role": "Manager"
                })
                if current_managers >= max_managers:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Manager limit reached: Maximum {max_managers} allowed"
                    )
            elif user_data.role == "Viewer":
                max_viewers = limits.get("max_viewers", 10)
                current_viewers = users_collection.count_documents({
                    "vendor_id": vendor_id,
                    "role": "Viewer"
                })
                if current_viewers >= max_viewers:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Viewer limit reached: Maximum {max_viewers} allowed"
                    )
    
    # Create user with pending_confirmation status
    password_hash = security.get_password_hash(user_data.password)
    new_user = {
        "name": user_data.name.strip(),
        "email": user_data.email.lower().strip(),
        "password_hash": password_hash,
        "role": user_data.role,
        "vendor_id": vendor_id,
        "status": "pending_confirmation",
        "created_at": datetime.utcnow(),
    }
    result = users_collection.insert_one(new_user)
    user_id = str(result.inserted_id)
    
    # Send email with credentials and activation link
    try:
        await send_user_creation_email(
            to_email=user_data.email,
            name=user_data.name,
            password=user_data.password,
            vendor_id=vendor_id
        )
    except Exception as e:
        logger.error(f"Failed to send user creation email: {e}")
        # Don't fail the operation if email fails
    
    # Log audit action
    from app.core.audit import log_admin_action
    log_admin_action(
        admin_id=str(current_user.get("_id", current_user.get("id"))),
        admin_email=current_user.get("email"),
        action="user_created_manually",
        target_type="user",
        target_id=user_id,
        details={
            "email": user_data.email,
            "role": user_data.role,
            "vendor_id": vendor_id
        },
        ip_address=request.client.host if request.client else None
    )
    
    return {
        "id": user_id,
        "name": new_user["name"],
        "email": new_user["email"],
        "role": new_user["role"],
        "vendor_id": vendor_id,
        "status": new_user["status"],
        "message": "User created successfully. Confirmation email sent."
    }



