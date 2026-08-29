from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
import os
import hashlib
import base64
from .db import users_collection

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE-ME-IN-PRODUCTION-use-openssl-rand-hex-32")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))  # 1 hour default (reduced for security hardening)

# ── Crypto ────────────────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None


# ── Password Utilities ────────────────────────────────────────────────────────
def _prehash_password(password: str) -> str:
    """Pre-hash password with SHA-256 (base64-encoded) before bcrypt.

    bcrypt silently truncates input at 72 bytes, which can cause
    two different passwords to produce the same hash if they share
    the same first 72 bytes. SHA-256 pre-hashing sidesteps this
    limitation while remaining safe because bcrypt still applies
    its own per-hash salt.
    """
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # New scheme: SHA-256 pre-hash then bcrypt (avoids bcrypt's 72-byte truncation).
    try:
        if pwd_context.verify(_prehash_password(plain_password), hashed_password):
            return True
    except Exception:
        pass
    # Backward-compat: hashes created before pre-hashing was introduced were
    # bcrypt'd from the raw password. Accept them so existing users can still
    # log in without a forced password reset. New hashes use the pre-hash path.
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    return pwd_context.hash(_prehash_password(password))


# ── Token Utilities ───────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def _decode_token(token: str) -> TokenData:
    """Decode JWT and return TokenData; raises 401 on any failure."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        role: str = payload.get("role")
        if email is None:
            raise credentials_exception
        return TokenData(email=email, role=role)
    except JWTError:
        raise credentials_exception


# ── Auth Dependencies ─────────────────────────────────────────────────────────

async def get_current_user(request: Request, token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    """Dependency: any authenticated user."""
    # Standard JWT Authentication
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token_data = _decode_token(token)

    user = users_collection.find_one({"email": token_data.email})
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if user.get("status") == "inactive":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )
    user["id"] = str(user.get("_id"))
    user.pop("_id", None)
    user.pop("password_hash", None)  # never expose hash
    return user


async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency: admin-only. Returns 403 if role is not 'admin'."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def get_current_vendor(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency: workspace-authorized user. Returns 403 if role is not authorized."""
    if current_user.get("role") not in ("vendor", "Administrator", "Manager", "Viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vendor access required",
        )
    return current_user


# ── Role & Permission Middleware ─────────────────────────────────────────────

def require_permission(permission: str):
    """Dependency: Enforce role-based permission access control."""
    async def dependency(current_user: dict = Depends(get_current_user)):
        role = current_user.get("role")
        
        # Centralized roles and their corresponding permissions
        role_permissions = {
            "Administrator": {
                "BILLING_MANAGE", "WORKSPACE_DELETE", "INVITE_USERS", "ASSIGN_ROLES",
                "BRAND_CREATE", "BRAND_EDIT", "BRAND_DELETE", "SKU_CREATE", "SKU_EDIT", "SKU_DELETE",
                "IMAGE_UPLOAD", "BATCH_CREATE", "ANALYTICS_VIEW", "HEATMAP_VIEW", "PROFILE_MANAGE"
            },
            "Manager": {
                "INVITE_USERS",  # only Viewers (validated inside endpoint logic)
                "BRAND_CREATE", "BRAND_EDIT", "BRAND_DELETE", "SKU_CREATE", "SKU_EDIT", "SKU_DELETE",
                "IMAGE_UPLOAD", "BATCH_CREATE", "ANALYTICS_VIEW", "HEATMAP_VIEW"
            },
            "Viewer": {
                "ANALYTICS_VIEW", "HEATMAP_VIEW"
            },
            "admin": {
                "BILLING_MANAGE", "WORKSPACE_DELETE", "INVITE_USERS", "ASSIGN_ROLES",
                "BRAND_CREATE", "BRAND_EDIT", "BRAND_DELETE", "SKU_CREATE", "SKU_EDIT", "SKU_DELETE",
                "IMAGE_UPLOAD", "BATCH_CREATE", "ANALYTICS_VIEW", "HEATMAP_VIEW", "PROFILE_MANAGE",
                "SYSTEM_ADMIN"
            },
            "vendor": {  # Backwards compatibility legacy role (treated as Administrator)
                "BILLING_MANAGE", "WORKSPACE_DELETE", "INVITE_USERS", "ASSIGN_ROLES",
                "BRAND_CREATE", "BRAND_EDIT", "BRAND_DELETE", "SKU_CREATE", "SKU_EDIT", "SKU_DELETE",
                "IMAGE_UPLOAD", "BATCH_CREATE", "ANALYTICS_VIEW", "HEATMAP_VIEW", "PROFILE_MANAGE"
            }
        }
        
        user_perms = role_permissions.get(role, set())
        if permission not in user_perms and "SYSTEM_ADMIN" not in user_perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required permission: {permission}"
            )
        return current_user
    return dependency


def require_role(allowed_roles: list[str]):
    """Dependency: Enforce specific user roles."""
    async def dependency(current_user: dict = Depends(get_current_user)):
        role = current_user.get("role")
        check_role = "Administrator" if role == "vendor" else role
        if check_role not in allowed_roles and role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Role '{role}' is not authorized."
            )
        return current_user
    return dependency

