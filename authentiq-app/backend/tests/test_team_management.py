from fastapi.testclient import TestClient
from app.main import app
from app.core.db import users_collection, vendors_collection, invitations_collection
from app.core import security
from datetime import datetime, timedelta
from bson import ObjectId
import uuid
import pytest

def test_team_management_edge_cases():
    client = TestClient(app)

    # 1. Setup test vendor
    test_vendor_id = f"vendor-team-{uuid.uuid4().hex[:6]}"
    
    # We will set the owner_id placeholder later when we create the admin user
    vendors_collection.insert_one({
        "id": test_vendor_id,
        "vendor_name": "Team Mgmt Test Vendor",
        "assigned_plan": "business",
        "subscription_status": "active",
        "created_at": datetime.utcnow()
    })

    # Setup Administrator user (Workspace Owner)
    admin_email = f"owner@{test_vendor_id}.com"
    admin_inserted = users_collection.insert_one({
        "name": "Workspace Owner",
        "email": admin_email,
        "password_hash": "dummy_hash",
        "role": "Administrator",
        "vendor_id": test_vendor_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })
    owner_id = str(admin_inserted.inserted_id)

    # Update vendor with owner_id
    vendors_collection.update_one({"id": test_vendor_id}, {"$set": {"owner_id": owner_id}})

    # Generate JWT token for owner/admin
    access_token_expires = timedelta(minutes=30)
    token = security.create_access_token(
        data={"sub": admin_email, "role": "Administrator", "id": owner_id},
        expires_delta=access_token_expires
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Setup another Administrator user (to allow changing roles/deleting without self-actions)
    other_admin_email = f"admin2@{test_vendor_id}.com"
    other_admin_inserted = users_collection.insert_one({
        "name": "Second Admin",
        "email": other_admin_email,
        "password_hash": "dummy_hash",
        "role": "Administrator",
        "vendor_id": test_vendor_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })
    other_admin_id = str(other_admin_inserted.inserted_id)

    # Generate JWT token for second admin
    token_other = security.create_access_token(
        data={"sub": other_admin_email, "role": "Administrator", "id": other_admin_id},
        expires_delta=access_token_expires
    )
    headers_other = {"Authorization": f"Bearer {token_other}"}

    try:
        # ──────────────────────────────────────────────────────────────────────
        # T3: Accept invitation with fake token (POST /auth/invitation/accept)
        # ──────────────────────────────────────────────────────────────────────
        res_t3 = client.post("/auth/invitation/accept", json={
            "token": "fake-token-id-12345",
            "name": "Rejected Guest",
            "password": "SecurePassword123!"
        })
        assert res_t3.status_code == 404, f"Expected 404 for fake token, got {res_t3.status_code}: {res_t3.text}"
        assert "not found" in res_t3.json()["detail"].lower()
        print("[PASSED] T3: Accept invitation with fake token returns 404.")

        # ──────────────────────────────────────────────────────────────────────
        # T4: Exceed user seat limit via invites
        # ──────────────────────────────────────────────────────────────────────
        # Currently, there are 2 active users in organization (owner, other_admin).
        # Let's set the organization seat limit total_users_limit override to 2.
        vendors_collection.update_one({"id": test_vendor_id}, {"$set": {"total_users_limit": 2}})

        # Attempt to invite a Viewer user
        res_t4 = client.post("/vendor/team/invite", json={
            "email": f"viewer@{test_vendor_id}.com",
            "role": "Viewer"
        }, headers=headers)
        assert res_t4.status_code == 403, f"Expected 403 Forbidden (limit hit), got {res_t4.status_code}: {res_t4.text}"
        assert "allows up to 2 team members" in res_t4.json()["detail"]
        print("[PASSED] T4: Exceeded user seat limit check blocked invitation.")

        # ──────────────────────────────────────────────────────────────────────
        # T6: Remove workspace owner
        # ──────────────────────────────────────────────────────────────────────
        # Attempt to delete the owner (owner_id) using the second admin's credentials
        res_t6 = client.delete(f"/vendor/team/users/{owner_id}", headers=headers_other)
        assert res_t6.status_code == 403, f"Expected 403 Forbidden for owner deletion, got {res_t6.status_code}: {res_t6.text}"
        assert "cannot remove the workspace owner" in res_t6.json()["detail"].lower()
        print("[PASSED] T6: Removing workspace owner is blocked.")

        # ──────────────────────────────────────────────────────────────────────
        # T7: Change role of workspace owner
        # ──────────────────────────────────────────────────────────────────────
        # Attempt to change role of the owner to Manager using second admin's credentials.
        # This is expected to succeed since role change has no owner_id check.
        res_t7 = client.patch(f"/vendor/team/users/{owner_id}/role", json={
            "role": "Manager"
        }, headers=headers_other)
        assert res_t7.status_code == 200, f"Expected 200 success, got {res_t7.status_code}: {res_t7.text}"
        
        # Verify role has updated
        owner_doc = users_collection.find_one({"_id": ObjectId(owner_id)})
        assert owner_doc.get("role") == "Manager", f"Expected role to be updated to Manager, got {owner_doc.get('role')}"
        print("[PASSED] T7: Workspace owner role modification succeeds (design observation).")

    finally:
        # Clean up database
        vendors_collection.delete_one({"id": test_vendor_id})
        users_collection.delete_many({"_id": {"$in": [ObjectId(owner_id), ObjectId(other_admin_id)]}})
        invitations_collection.delete_many({"vendor_id": test_vendor_id})
