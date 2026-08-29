from fastapi.testclient import TestClient
from app.main import app
from app.core.db import users_collection, vendors_collection, plans_collection
from app.core import security
from datetime import datetime, timedelta
from bson import ObjectId
import uuid
import pytest

def test_auth_and_plan_edge_cases():
    client = TestClient(app)

    # 1. Setup test vendor
    test_vendor_id = f"vendor-ap-{uuid.uuid4().hex[:6]}"
    vendors_collection.insert_one({
        "id": test_vendor_id,
        "vendor_name": "Auth Plan Edge Case Vendor",
        "assigned_plan": "business",
        "subscription_status": "inactive", # Start as inactive for PL1
        "created_at": datetime.utcnow()
    })

    # Setup inactive user (for A3)
    inactive_email = f"inactive@{test_vendor_id}.com"
    password = "SecurePassword123!"
    password_hash = security.get_password_hash(password)
    users_collection.insert_one({
        "name": "Inactive User",
        "email": inactive_email,
        "password_hash": password_hash,
        "role": "Viewer",
        "vendor_id": test_vendor_id,
        "status": "inactive", # inactive status
        "created_at": datetime.utcnow()
    })

    # Setup active Administrator user
    admin_email = f"admin@{test_vendor_id}.com"
    users_collection.insert_one({
        "name": "Active Admin",
        "email": admin_email,
        "password_hash": password_hash,
        "role": "Administrator",
        "vendor_id": test_vendor_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })

    # Setup a global Superuser/Admin for the plan status endpoint (PL1, PL6)
    super_admin_email = f"superadmin@{test_vendor_id}.com"
    users_collection.insert_one({
        "name": "Super Admin",
        "email": super_admin_email,
        "password_hash": password_hash,
        "role": "admin", # Global admin role
        "vendor_id": test_vendor_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })

    # Generate token for Super Admin
    super_token = security.create_access_token(
        data={"sub": super_admin_email, "role": "admin"}
    )
    super_headers = {"Authorization": f"Bearer {super_token}"}

    # Generate token for active vendor Admin
    active_token = security.create_access_token(
        data={"sub": admin_email, "role": "Administrator"}
    )
    active_headers = {"Authorization": f"Bearer {active_token}"}

    try:
        # ──────────────────────────────────────────────────────────────────────
        # A3: Login with inactive account / deactivated vendor
        # ──────────────────────────────────────────────────────────────────────
        # Case 1: Inactive user (user status = 'inactive')
        res_a3_user = client.post("/auth/login", json={
            "email": inactive_email,
            "password": password
        })
        assert res_a3_user.status_code == 403, f"Expected 403 Forbidden, got {res_a3_user.status_code}: {res_a3_user.text}"
        assert "account is disabled" in res_a3_user.json()["detail"].lower()

        # Case 2: Active user, but Vendor is deactivated ('inactive')
        res_a3_vendor_inactive = client.post("/auth/login", json={
            "email": admin_email,
            "password": password
        })
        assert res_a3_vendor_inactive.status_code == 403, f"Expected 403 Forbidden, got {res_a3_vendor_inactive.status_code}: {res_a3_vendor_inactive.text}"
        assert "account is disabled" in res_a3_vendor_inactive.json()["detail"].lower()

        # Case 3: Active user, but Vendor is suspended ('suspended')
        vendors_collection.update_one({"id": test_vendor_id}, {"$set": {"subscription_status": "suspended"}})
        res_a3_vendor_suspended = client.post("/auth/login", json={
            "email": admin_email,
            "password": password
        })
        assert res_a3_vendor_suspended.status_code == 403, f"Expected 403 Forbidden, got {res_a3_vendor_suspended.status_code}: {res_a3_vendor_suspended.text}"
        assert "account is disabled" in res_a3_vendor_suspended.json()["detail"].lower()

        # Restore vendor to 'inactive' state for the PL1 test that runs later
        vendors_collection.update_one({"id": test_vendor_id}, {"$set": {"subscription_status": "inactive"}})
        print("[PASSED] A3: Login with inactive account / deactivated vendor blocked with 403.")

        # ──────────────────────────────────────────────────────────────────────
        # A5: JWT tampered / expired token
        # ──────────────────────────────────────────────────────────────────────
        # Tampered signature
        tampered_token = active_token[:-5] + "xxxxx"
        res_a5_tampered = client.get("/product/list", headers={"Authorization": f"Bearer {tampered_token}"})
        assert res_a5_tampered.status_code == 401, f"Expected 401 Unauthorized for tampered token, got {res_a5_tampered.status_code}: {res_a5_tampered.text}"

        # Expired token
        expired_token = security.create_access_token(
            data={"sub": admin_email, "role": "Administrator"},
            expires_delta=timedelta(seconds=-10) # Expired 10s ago
        )
        res_a5_expired = client.get("/product/list", headers={"Authorization": f"Bearer {expired_token}"})
        assert res_a5_expired.status_code == 401, f"Expected 401 Unauthorized for expired token, got {res_a5_expired.status_code}: {res_a5_expired.text}"
        print("[PASSED] A5: Tampered and expired JWTs blocked with 401.")

        # ──────────────────────────────────────────────────────────────────────
        # A9: Forgot password — unknown email
        # ──────────────────────────────────────────────────────────────────────
        res_a9 = client.post("/auth/forgot-password", json={
            "email": f"unknown-email-{uuid.uuid4().hex[:6]}@domain.com"
        })
        assert res_a9.status_code == 200, f"Expected 200 OK, got {res_a9.status_code}: {res_a9.text}"
        assert "reset link has been sent" in res_a9.json()["message"]
        print("[PASSED] A9: Forgot password with unknown email returns 200 silently.")

        # ──────────────────────────────────────────────────────────────────────
        # A10: Password reset with expired token
        # ──────────────────────────────────────────────────────────────────────
        # Set a token on the admin user that is already expired
        expired_reset_token = "expired-token-12345"
        users_collection.update_one(
            {"email": admin_email},
            {
                "$set": {
                    "password_reset_token": expired_reset_token,
                    "password_reset_expiry": datetime.utcnow() - timedelta(minutes=10) # 10 mins ago
                }
            }
        )
        res_a10 = client.post("/auth/reset-password", json={
            "token": expired_reset_token,
            "new_password": "NewSecurePassword123!",
            "confirm_password": "NewSecurePassword123!"
        })
        assert res_a10.status_code == 400, f"Expected 400, got {res_a10.status_code}: {res_a10.text}"
        assert "invalid or expired" in res_a10.json()["detail"].lower()
        print("[PASSED] A10: Password reset with expired token returns 400.")

        # ──────────────────────────────────────────────────────────────────────
        # A11: Password reset with already-used token
        # ──────────────────────────────────────────────────────────────────────
        # Set a valid reset token on the admin user
        valid_reset_token = "valid-token-12345"
        users_collection.update_one(
            {"email": admin_email},
            {
                "$set": {
                    "password_reset_token": valid_reset_token,
                    "password_reset_expiry": datetime.utcnow() + timedelta(minutes=10) # 10 mins from now
                }
            }
        )
        # First attempt: reset should succeed
        res_a11_first = client.post("/auth/reset-password", json={
            "token": valid_reset_token,
            "new_password": "NewSecurePassword123!",
            "confirm_password": "NewSecurePassword123!"
        })
        assert res_a11_first.status_code == 200, f"Expected 200 success, got {res_a11_first.status_code}: {res_a11_first.text}"

        # Second attempt: same token should fail
        res_a11_second = client.post("/auth/reset-password", json={
            "token": valid_reset_token,
            "new_password": "NewSecurePassword123!",
            "confirm_password": "NewSecurePassword123!"
        })
        assert res_a11_second.status_code == 400, f"Expected 400, got {res_a11_second.status_code}: {res_a11_second.text}"
        assert "invalid or expired" in res_a11_second.json()["detail"].lower()
        print("[PASSED] A11: Replaying reset token returns 400.")

        # ──────────────────────────────────────────────────────────────────────
        # PL1: Deactivate already-inactive vendor subscription
        # ──────────────────────────────────────────────────────────────────────
        # Vendor was created with subscription_status = "inactive". Let's patch status to inactive.
        res_pl1 = client.patch(f"/admin/plans/vendor/{test_vendor_id}/status", json={
            "status": "inactive"
        }, headers=super_headers)
        assert res_pl1.status_code == 200, f"Expected 200 OK, got {res_pl1.status_code}: {res_pl1.text}"
        assert res_pl1.json()["subscription_status"] == "inactive"
        print("[PASSED] PL1: Deactivating already inactive subscription returns 200.")

        # ──────────────────────────────────────────────────────────────────────
        # PL6: Plan limits override at vendor level
        # ──────────────────────────────────────────────────────────────────────
        # Assign plan to vendor (sets subscription to active)
        client.post(f"/admin/plans/vendor/{test_vendor_id}/assign?plan_id=business", headers=super_headers)

        # Set custom limits override on vendor document
        vendors_collection.update_one({"id": test_vendor_id}, {"$set": {"total_skus_limit": 3}})

        # Verify that get_my_plan returns the custom limit
        res_pl6 = client.get("/admin/plans/my-plan", headers=active_headers)
        assert res_pl6.status_code == 200, f"Expected 200 OK, got {res_pl6.status_code}: {res_pl6.text}"
        limits = res_pl6.json()["limits"]
        assert limits["max_products"] == 3, f"Expected override limit to be 3, got {limits['max_products']}"
        print("[PASSED] PL6: Plan limits override verified successfully.")

        # ──────────────────────────────────────────────────────────────────────
        # A4: Rate-limit on login (tested last)
        # ──────────────────────────────────────────────────────────────────────
        # We use a separate rate limit test user so it doesn't interfere with others
        rate_limit_email = f"ratelimit@{test_vendor_id}.com"
        users_collection.insert_one({
            "name": "Rate Limit User",
            "email": rate_limit_email,
            "password_hash": password_hash,
            "role": "Viewer",
            "vendor_id": test_vendor_id,
            "status": "active",
            "created_at": datetime.utcnow()
        })

        # Fire 6 rapid login requests
        responses = []
        for i in range(6):
            res = client.post("/auth/login", json={
                "email": rate_limit_email,
                "password": password
            })
            responses.append(res)
        
        # Verify that at least the 6th response has 429 status code
        status_codes = [r.status_code for r in responses]
        assert 429 in status_codes, f"Expected a 429 rate limit error in {status_codes}"
        print(f"[PASSED] A4: Login rate-limiting triggered successfully. Responses: {status_codes}")

    finally:
        # Clean up database
        vendors_collection.delete_one({"id": test_vendor_id})
        users_collection.delete_many({"vendor_id": test_vendor_id})
