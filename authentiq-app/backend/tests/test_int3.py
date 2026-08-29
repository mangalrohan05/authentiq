from fastapi.testclient import TestClient
from app.main import app
from app.core.db import users_collection, vendors_collection, products_collection, invitations_collection
from app.core import security
from datetime import datetime
from app.core.limiter import limiter
import uuid
import pytest

def test_integration_3_invite_accept_login_access():
    # Disable rate limiting for this test to avoid 429 when running the full suite
    limiter.enabled = False
    client = TestClient(app)

    # 1. Setup a test vendor
    test_vendor_id = f"vendor-int3-{uuid.uuid4().hex[:6]}"
    vendors_collection.insert_one({
        "id": test_vendor_id,
        "vendor_name": "INT3 Test Vendor",
        "assigned_plan": "business",
        "subscription_status": "active",
        "created_at": datetime.utcnow()
    })

    # 2. Setup Administrator user
    admin_email = f"admin@{test_vendor_id}.com"
    admin_inserted = users_collection.insert_one({
        "name": "Admin User",
        "email": admin_email,
        "password_hash": "dummy_hash",
        "role": "Administrator",
        "vendor_id": test_vendor_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })
    admin_id = str(admin_inserted.inserted_id)

    # Generate access token for Administrator
    admin_token = security.create_access_token(data={"sub": admin_email, "role": "Administrator", "id": admin_id})
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # New Manager details
    manager_email = f"invited-manager@{test_vendor_id}.com"
    manager_password = "SecurePassword123!"
    manager_name = "Invited Manager"

    try:
        # 3. Invite a Manager
        invite_res = client.post("/vendor/team/invite", json={
            "email": manager_email,
            "role": "Manager"
        }, headers=admin_headers)
        assert invite_res.status_code == 201, f"Expected 201, got {invite_res.status_code}: {invite_res.text}"
        invitation_id = invite_res.json()["invitation_id"]

        # Verify it was written to invitations collection
        invite_doc = invitations_collection.find_one({"id": invitation_id})
        assert invite_doc is not None
        assert invite_doc["status"] == "pending"

        # 4. Accept invitation
        accept_res = client.post("/auth/invitation/accept", json={
            "token": invitation_id,
            "name": manager_name,
            "password": manager_password
        })
        assert accept_res.status_code == 201, f"Expected 201, got {accept_res.status_code}: {accept_res.text}"
        assert accept_res.json()["status"] == "success"

        # Verify user is created in database
        manager_doc = users_collection.find_one({"email": manager_email})
        assert manager_doc is not None
        assert manager_doc["role"] == "Manager"
        assert manager_doc["status"] == "active"

        # Verify invitation is updated to accepted
        invite_doc_after = invitations_collection.find_one({"id": invitation_id})
        assert invite_doc_after["status"] == "accepted"

        # 5. Login as the new Manager
        login_res = client.post("/auth/login", json={
            "email": manager_email,
            "password": manager_password
        })
        assert login_res.status_code == 200, f"Expected 200, got {login_res.status_code}: {login_res.text}"
        login_data = login_res.json()
        manager_token = login_data["access_token"]
        manager_headers = {"Authorization": f"Bearer {manager_token}"}

        # 6. Verify role access
        # Managers can query team members
        members_res = client.get("/vendor/team/members", headers=manager_headers)
        assert members_res.status_code == 200, f"Expected 200, got {members_res.status_code}: {members_res.text}"
        members_list = [m["email"] for m in members_res.json()]
        # Since Administrator's email is masked for Manager, it will be "***", but manager_email itself should be in the list
        assert manager_email in members_list

        # Managers can create products
        prod_res = client.post("/product/create", json={
            "name": "INT3 Test Product",
            "brand": "Brand A",
            "sku": f"SKU-INT3-{uuid.uuid4().hex[:4]}"
        }, headers=manager_headers)
        assert prod_res.status_code in (200, 201), f"Expected 200/201, got {prod_res.status_code}: {prod_res.text}"
        created_prod_id = prod_res.json()["id"]

        # Verify that listing products works for the new Manager
        list_res = client.get("/product/list", headers=manager_headers)
        assert list_res.status_code == 200, f"Expected 200, got {list_res.status_code}: {list_res.text}"
        prod_ids = [p["id"] for p in list_res.json()["products"]]
        assert created_prod_id in prod_ids

        print("[PASSED] INT3: Full lifecycle (invite -> accept -> login -> verify access) succeeded.")

    finally:
        # Re-enable rate limiting
        limiter.enabled = True
        # Clean up database records
        vendors_collection.delete_one({"id": test_vendor_id})
        users_collection.delete_many({"vendor_id": test_vendor_id})
        products_collection.delete_many({"vendor_id": test_vendor_id})
        invitations_collection.delete_many({"vendor_id": test_vendor_id})
