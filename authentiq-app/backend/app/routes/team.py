import logging
import uuid
from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status, Request

from app.core.db import users_collection, invitations_collection, vendors_collection
from app.core.security import require_role
from app.core.limits import enforce_organization_limit
from app.schemas.team import TeamInviteRequest, RoleUpdateRequest, TeamMemberCreateRequest

logger = logging.getLogger(__name__)

from app.core.audit import log_vendor_action

router = APIRouter()

@router.get("/members")
async def get_team_members(current_user: dict = Depends(require_role(["Administrator", "Manager"]))):
    """
    List all active users in the current vendor's organization.
    """
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid vendor context"
        )
    
    # Query active users
    users = list(users_collection.find({"vendor_id": vendor_id}))
    
    result = []
    for u in users:
        email = u.get("email", "")
        # Managers are not allowed to see the email of administrators (role "Administrator" or "vendor")
        if current_user.get("role") == "Manager" and u.get("role") in ("Administrator", "vendor"):
            email = "***"
        result.append({
            "id": str(u["_id"]),
            "name": u.get("name", ""),
            "email": email,
            "role": u.get("role", ""),
            "status": u.get("status", "active"),
            "created_at": u.get("created_at", datetime.utcnow())
        })
    return result

@router.post("/invite", status_code=201)
async def invite_team_member(
    payload: TeamInviteRequest,
    current_user: dict = Depends(require_role(["Administrator", "Manager"]))
):
    """
    Invite a new user to the organization.
    Checks subscription seat limits.
    Enforces role hierarchy (Managers can only invite Viewers).
    """
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid vendor context"
        )

    # 1. Enforce user limits (active users + pending invites)
    enforce_organization_limit(vendor_id, "max_users")

    # 2. Enforce role constraints
    invited_role = payload.role
    if invited_role not in ("Administrator", "Manager", "Viewer"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {invited_role}. Must be 'Administrator', 'Manager', or 'Viewer'."
        )

    if current_user.get("role") == "Manager" and invited_role != "Viewer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managers are only permitted to invite 'Viewer' team members."
        )

    if invited_role == "Administrator":
        admin_users_count = users_collection.count_documents({
            "vendor_id": vendor_id,
            "role": {"$in": ["Administrator", "vendor"]}
        })
        admin_invites_count = invitations_collection.count_documents({
            "vendor_id": vendor_id,
            "role": "Administrator",
            "status": "pending"
        })
        if (admin_users_count + admin_invites_count) >= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only one Administrator is allowed per organization. An administrator already exists or has a pending invitation."
            )

    email = payload.email.lower().strip()

    # 3. Check if user already exists
    if users_collection.find_one({"email": email}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email is already registered."
        )

    # 4. Check if pending invitation already exists
    existing_invite = invitations_collection.find_one({
        "vendor_id": vendor_id,
        "email": email,
        "status": "pending"
    })
    if existing_invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An invitation is already pending for this email address."
        )

    # 5. Create invitation
    invite_id = str(uuid.uuid4())
    invitation = {
        "id": invite_id,
        "email": email,
        "role": invited_role,
        "vendor_id": vendor_id,
        "invited_by": current_user.get("email"),
        "status": "pending",
        "created_at": datetime.utcnow()
    }
    invitations_collection.insert_one(invitation)
    log_vendor_action(vendor_id, current_user.get("email"), "Team Member Invited", {"description": f"Invited {email} as {invited_role}."})

    # Log/Print invitation link for dev mode
    invite_url = f"http://localhost:3000/vendor/accept-invitation?token={invite_id}"
    logger.info(f"[Team Invite] Invitation created: {invite_url}")
    print(f"\n[Authentiq DEV] Workspace invitation link:\n  {invite_url}\n")

    return {
        "status": "success",
        "message": f"Invitation sent successfully to {email}",
        "invitation_id": invite_id
    }

@router.delete("/users/{user_id}")
async def remove_team_member(
    user_id: str,
    current_user: dict = Depends(require_role(["Administrator", "Manager"]))
):
    """
    Remove a user from the organization.
    Administrators can remove any user except themselves.
    Managers can only remove users with the Viewer role.
    """
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid vendor context"
        )

    # 1. Prevent self-deletion
    if user_id == current_user.get("id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove yourself from the workspace."
        )

    # 2. Look up target user
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format."
        )

    # The vendor_id comes from current_user (authenticated token), not user input
    # This prevents IDOR - users can only access their own organization's users
    target_user = users_collection.find_one({"_id": oid, "vendor_id": vendor_id})
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in this organization."
        )

    # 3. Role-based deletion rules
    current_role = current_user.get("role")
    target_role = target_user.get("role")
    
    if current_role == "Manager":
        # Managers can only delete Viewers
        if target_role != "Viewer":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Managers can only remove users with the Viewer role."
            )

    # 4. Prevent deleting the workspace owner if they are the owner
    vendor = vendors_collection.find_one({"id": vendor_id})
    if vendor and vendor.get("owner_id") == user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot remove the workspace owner. Transfer ownership first."
        )

    # 4. Remove user
    users_collection.delete_one({"_id": oid})
    log_vendor_action(vendor_id, current_user.get("email"), "Team Member Removed", {"description": f"Removed user {target_user.get('email')}."})

    return {
        "status": "success",
        "message": f"User {target_user.get('email')} removed successfully from organization."
    }

@router.patch("/users/{user_id}/role")
async def update_team_member_role(
    user_id: str,
    payload: RoleUpdateRequest,
    current_user: dict = Depends(require_role(["Administrator"]))
):
    """
    Update a team member's role. Only Administrators can perform this.
    """
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid vendor context"
        )

    # 1. Prevent changing self role
    if user_id == current_user.get("id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role."
        )

    # 2. Validate role
    new_role = payload.role
    if new_role not in ("Administrator", "Manager", "Viewer"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role. Must be 'Administrator', 'Manager', or 'Viewer'."
        )

    # 3. Look up target user
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format."
        )

    target_user = users_collection.find_one({"_id": oid, "vendor_id": vendor_id})
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in this organization."
        )

    if new_role == "Administrator":
        other_admins = users_collection.count_documents({
            "vendor_id": vendor_id,
            "role": {"$in": ["Administrator", "vendor"]},
            "_id": {"$ne": oid}
        })
        if other_admins >= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only one Administrator is allowed per organization."
            )

    # 4. Update role
    users_collection.update_one(
        {"_id": oid},
        {"$set": {"role": new_role}}
    )
    log_vendor_action(vendor_id, current_user.get("email"), "Team Role Updated", {"description": f"Updated role of user {target_user.get('email')} to {new_role}."})

    return {
        "status": "success",
        "message": f"Role updated successfully to {new_role} for {target_user.get('email')}."
    }

@router.get("/invitations")
async def get_pending_invitations(current_user: dict = Depends(require_role(["Administrator", "Manager"]))):
    """
    List all pending invitations for the current vendor's organization.
    """
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid vendor context"
        )

    invites = list(invitations_collection.find({"vendor_id": vendor_id, "status": "pending"}))
    
    # Pre-cache user roles to avoid N+1 queries
    inviter_emails = [i.get("invited_by") for i in invites if i.get("invited_by")]
    inviters = list(users_collection.find({"email": {"$in": inviter_emails}}, {"email": 1, "role": 1}))
    inviter_role_map = {u["email"]: u.get("role") for u in inviters if u.get("email")}

    result = []
    for inv in invites:
        email = inv.get("email", "")
        # Managers are not allowed to see the email of administrators (role "Administrator" or "vendor")
        if current_user.get("role") == "Manager" and inv.get("role") in ("Administrator", "vendor"):
            email = "***"
        
        invited_by_email = inv.get("invited_by", "")
        invited_by_role = inviter_role_map.get(invited_by_email)

        result.append({
            "id": inv["id"],
            "email": email,
            "role": inv.get("role", ""),
            "invited_by": invited_by_email,
            "invited_by_role": invited_by_role,
            "status": inv.get("status", "pending"),
            "created_at": inv.get("created_at", datetime.utcnow())
        })
    return result

@router.delete("/invitations/{invitation_id}")
async def cancel_team_invitation(
    invitation_id: str,
    current_user: dict = Depends(require_role(["Administrator", "Manager"]))
):
    """
    Cancel/revoke a pending invitation.
    """
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid vendor context"
        )

    invite = invitations_collection.find_one({"id": invitation_id, "vendor_id": vendor_id})
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found."
        )

    # Enforce role logic: Managers can only cancel invitations initiated by a Manager
    if current_user.get("role") == "Manager":
        inviter_user = users_collection.find_one({"email": invite.get("invited_by")})
        if not inviter_user or inviter_user.get("role") != "Manager":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Managers are only permitted to cancel invitations initiated by a Manager."
            )

    # Delete or set status to cancelled
    invitations_collection.delete_one({"id": invitation_id})
    log_vendor_action(vendor_id, current_user.get("email"), "Invitation Cancelled", {"description": f"Cancelled invitation for {invite.get('email')}."})

    return {
        "status": "success",
        "message": f"Invitation for {invite.get('email')} cancelled successfully."
    }


@router.post("/create-member", status_code=201)
async def create_team_member(
    payload: TeamMemberCreateRequest,
    current_user: dict = Depends(require_role(["Administrator"]))
):
    """
    Administrator-only: Manually create a new team member with email, password and role.
    Checks seat limits and role constraints (max 1 Administrator).
    Sends a confirmation/welcome email to the user.
    """
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid vendor context"
        )

    # 1. Enforce user limits (active users + pending invites)
    enforce_organization_limit(vendor_id, "max_users")

    # 2. Enforce role constraints (Must be Administrator, Manager, or Viewer)
    role = payload.role
    if role not in ("Administrator", "Manager", "Viewer"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {role}. Must be 'Administrator', 'Manager', or 'Viewer'."
        )

    # Enforce limit of 1 Administrator per tree
    if role == "Administrator":
        admin_users_count = users_collection.count_documents({
            "vendor_id": vendor_id,
            "role": {"$in": ["Administrator", "vendor"]}
        })
        admin_invites_count = invitations_collection.count_documents({
            "vendor_id": vendor_id,
            "role": "Administrator",
            "status": "pending"
        })
        if (admin_users_count + admin_invites_count) >= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only one Administrator is allowed per organization. An administrator already exists or has a pending invitation."
            )

    email = payload.email.lower().strip()

    # 3. Check if user already exists
    if users_collection.find_one({"email": email}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email is already registered."
        )

    # 4. Hash password (use the shared scheme so verify_password matches)
    from app.core.security import get_password_hash
    password_hash = get_password_hash(payload.password)

    # 5. Create user immediately
    new_user = {
        "name": payload.name,
        "email": email,
        "password_hash": password_hash,
        "role": role,
        "vendor_id": vendor_id,
        "status": "active",
        "created_at": datetime.utcnow(),
        "invited_by": current_user.get("email"),
    }
    users_collection.insert_one(new_user)
    log_vendor_action(vendor_id, current_user.get("email"), "Team Member Created", {"description": f"Created team member {email} as {role}."})

    # 6. Send user creation email
    from app.services.email_service import send_user_creation_email
    await send_user_creation_email(
        to_email=email,
        name=payload.name,
        password=payload.password,
        vendor_id=vendor_id
    )

    return {
        "status": "success",
        "message": f"Team member {email} created manually and confirmation email sent successfully."
    }
