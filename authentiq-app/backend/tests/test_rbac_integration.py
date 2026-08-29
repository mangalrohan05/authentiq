from fastapi.testclient import TestClient
from app.main import app
from app.core.db import users_collection, vendors_collection, plans_collection, products_collection, invitations_collection
from app.core import security
from datetime import datetime, timedelta
import uuid

def test_rbac_and_plan_limits():
    client = TestClient(app)

    # 1. Setup a test plan and organization/vendor
    test_vendor_id = f"test-vendor-{uuid.uuid4().hex[:6]}"
    test_plan_id = "business"  # exists in default plans (limits: max_products: 25, max_users: 5)
    
    vendors_collection.insert_one({
        "id": test_vendor_id,
        "vendor_name": f"Test Brand {test_vendor_id}",
        "assigned_plan": test_plan_id,
        "subscription_status": "active",
        "created_at": datetime.utcnow()
    })

    # 2. Setup users for each role (Administrator, Manager, Viewer)
    roles = ["Administrator", "Manager", "Viewer"]
    tokens = {}
    
    for role in roles:
        email = f"{role.lower()}@{test_vendor_id}.com"
        users_collection.delete_one({"email": email})
        users_collection.insert_one({
            "name": f"Test {role}",
            "email": email,
            "password_hash": "dummy_hash",
            "role": role,
            "vendor_id": test_vendor_id,
            "status": "active",
            "created_at": datetime.utcnow()
        })
        # Generate JWT access token
        access_token_expires = timedelta(minutes=30)
        token = security.create_access_token(
            data={"sub": email, "role": role},
            expires_delta=access_token_expires
        )
        tokens[role] = token

    # ── RULE 1: Viewer is Read-Only (e.g. Cannot create products) ──
    viewer_headers = {"Authorization": f"Bearer {tokens['Viewer']}"}
    prod_data = {
        "name": "Test Product Viewer",
        "brand": "Test Brand",
        "description": "Viewer shouldn't be allowed to create",
        "sku": "SKU-VIEWER-1"
    }
    res = client.post("/product/create", json=prod_data, headers=viewer_headers)
    assert res.status_code == 403, f"Expected 403 for Viewer creating product, got {res.status_code}: {res.text}"
    print("[PASSED] Viewer product creation blocked (403).")

    # ── RULE 2: Manager can create products ──
    manager_headers = {"Authorization": f"Bearer {tokens['Manager']}"}
    prod_data_mgr = {
        "name": "Test Product Manager",
        "brand": "Test Brand",
        "description": "Manager is allowed to create",
        "sku": "SKU-MGR-1"
    }
    res = client.post("/product/create", json=prod_data_mgr, headers=manager_headers)
    assert res.status_code in (200, 201), f"Expected 200/201 for Manager creating product, got {res.status_code}: {res.text}"
    print("[PASSED] Manager product creation allowed.")

    # ── RULE 3: Manager cannot invite Administrator ──
    res = client.post(
        "/vendor/team/invite",
        json={"email": "newadmin@test.com", "role": "Administrator"},
        headers=manager_headers
    )
    assert res.status_code == 403, f"Expected 403 for Manager inviting Administrator, got {res.status_code}: {res.text}"
    print("[PASSED] Manager blocked from inviting Administrator.")

    # Manager can invite Viewer
    res = client.post(
        "/vendor/team/invite",
        json={"email": f"newviewer-{uuid.uuid4().hex[:4]}@test.com", "role": "Viewer"},
        headers=manager_headers
    )
    assert res.status_code in (200, 201), f"Expected 200/201 for Manager inviting Viewer, got {res.status_code}: {res.text}"
    print("[PASSED] Manager allowed to invite Viewer.")

    # ── RULE 4: Administrator can invite Manager ──
    admin_headers = {"Authorization": f"Bearer {tokens['Administrator']}"}
    res = client.post(
        "/vendor/team/invite",
        json={"email": f"newmgr-{uuid.uuid4().hex[:4]}@test.com", "role": "Manager"},
        headers=admin_headers
    )
    assert res.status_code in (200, 201), f"Expected 200/201 for Administrator inviting Manager, got {res.status_code}: {res.text}"
    print("[PASSED] Administrator allowed to invite Manager.")

    # ── RULE 5: Limit Enforcement ──
    # Let's set the SKU limit for this vendor to 1 SKU (via total_skus_limit override)
    vendors_collection.update_one({"id": test_vendor_id}, {"$set": {"total_skus_limit": 1}})
    
    # Manager tries to create a second product
    res = client.post("/product/create", json={
        "name": "Test Product Limit 2",
        "brand": "Test Brand",
        "description": "This should fail because limit is 1",
        "sku": "SKU-LIMIT-2"
    }, headers=manager_headers)
    assert res.status_code == 403, f"Expected 403 due to SKU limit reached, got {res.status_code}: {res.text}"
    assert "allows up to 1 SKUs" in res.json()["detail"], f"Expected limit prompt in message, got {res.json()['detail']}"
    print("[PASSED] Plan limit enforced on product creation (403).")

    # ── RULE 6: Vendor Plan Renewal and Plan Switch ──
    # Administrator can renew plan
    res = client.post("/admin/plans/my-plan/renew", headers=admin_headers)
    assert res.status_code == 200, f"Expected 200 for plan renewal, got {res.status_code}: {res.text}"
    print("[PASSED] Administrator successfully renewed plan.")

    # Administrator can change plan
    res = client.post("/admin/plans/my-plan/change", json={"plan_id": "free_trial"}, headers=admin_headers)
    assert res.status_code == 200, f"Expected 200 for plan change, got {res.status_code}: {res.text}"
    v = vendors_collection.find_one({"id": test_vendor_id})
    assert v.get("assigned_plan") == "free_trial", f"Expected plan to be 'free_trial', got {v.get('assigned_plan')}"
    print("[PASSED] Administrator successfully changed plan.")

    # ── RULE 7: Manager cannot see Administrator email ──
    # Create a pending invite for an Administrator and a Viewer
    invitations_collection.insert_many([
        {
            "id": f"invite-admin-{uuid.uuid4().hex[:4]}",
            "email": f"invited_admin@{test_vendor_id}.com",
            "role": "Administrator",
            "vendor_id": test_vendor_id,
            "invited_by": f"administrator@{test_vendor_id}.com",
            "status": "pending",
            "created_at": datetime.utcnow()
        },
        {
            "id": f"invite-viewer-{uuid.uuid4().hex[:4]}",
            "email": f"invited_viewer@{test_vendor_id}.com",
            "role": "Viewer",
            "vendor_id": test_vendor_id,
            "invited_by": f"administrator@{test_vendor_id}.com",
            "status": "pending",
            "created_at": datetime.utcnow()
        }
    ])

    # Fetch team members as Manager
    res = client.get("/vendor/team/members", headers=manager_headers)
    assert res.status_code == 200, f"Expected 200 for Manager get team members, got {res.status_code}: {res.text}"
    members = res.json()
    
    # Assert that administrator's email is masked
    admin_member = next((m for m in members if m["role"] == "Administrator"), None)
    assert admin_member is not None, "Administrator member not found in list"
    assert admin_member["email"] == "***", f"Expected masked email for administrator, got {admin_member['email']}"

    # Assert that Manager's own email is NOT masked
    mgr_member = next((m for m in members if m["role"] == "Manager"), None)
    assert mgr_member is not None, "Manager member not found in list"
    assert mgr_member["email"] == f"manager@{test_vendor_id}.com", f"Expected raw email for manager, got {mgr_member['email']}"

    # Fetch pending invitations as Manager
    res = client.get("/vendor/team/invitations", headers=manager_headers)
    assert res.status_code == 200, f"Expected 200 for Manager get pending invitations, got {res.status_code}: {res.text}"
    invites = res.json()

    # Assert that administrator invitation's email is masked
    admin_invite = next((i for i in invites if i["role"] == "Administrator"), None)
    assert admin_invite is not None, "Administrator invite not found in list"
    assert admin_invite["email"] == "***", f"Expected masked email for administrator invite, got {admin_invite['email']}"

    # Assert that Viewer invitation's email is NOT masked
    viewer_invite = next((i for i in invites if i["email"] == f"invited_viewer@{test_vendor_id}.com"), None)
    assert viewer_invite is not None, "Viewer invite not found in list"
    assert viewer_invite["email"] == f"invited_viewer@{test_vendor_id}.com", f"Expected raw email for viewer invite, got {viewer_invite['email']}"

    print("[PASSED] Manager blocked from seeing Administrator emails in team members and invitations.")

    # Clean up test records
    vendors_collection.delete_one({"id": test_vendor_id})
    users_collection.delete_many({"email": {"$regex": f".*@{test_vendor_id}\\.com"}})
    products_collection.delete_many({"vendor_id": test_vendor_id})
    invitations_collection.delete_many({"vendor_id": test_vendor_id})
    print("All RBAC integration tests passed successfully!")

def test_cross_vendor_product_access():
    client = TestClient(app)

    # 1. Setup Vendor A and their product
    vendor_a_id = f"vendor-a-{uuid.uuid4().hex[:6]}"
    vendors_collection.insert_one({
        "id": vendor_a_id,
        "vendor_name": f"Vendor A",
        "assigned_plan": "business",
        "subscription_status": "active",
        "created_at": datetime.utcnow()
    })

    # Create Vendor A's product
    product_a_id = f"product-a-{uuid.uuid4().hex[:6]}"
    products_collection.insert_one({
        "id": product_a_id,
        "vendor_id": vendor_a_id,
        "name": "Vendor A Product",
        "sku": "SKU-A-1",
        "timestamp": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "reference_images": []
    })

    # 2. Setup Vendor B and their user (Manager or Administrator)
    vendor_b_id = f"vendor-b-{uuid.uuid4().hex[:6]}"
    vendors_collection.insert_one({
        "id": vendor_b_id,
        "vendor_name": f"Vendor B",
        "assigned_plan": "business",
        "subscription_status": "active",
        "created_at": datetime.utcnow()
    })

    email_b = f"manager@{vendor_b_id}.com"
    users_collection.insert_one({
        "name": "Manager B",
        "email": email_b,
        "password_hash": "dummy_hash",
        "role": "Manager",
        "vendor_id": vendor_b_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })

    # Generate JWT access token for Vendor B
    access_token_expires = timedelta(minutes=30)
    token_b = security.create_access_token(
        data={"sub": email_b, "role": "Manager"},
        expires_delta=access_token_expires
    )
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 3. Attempt to access Vendor A's product using Vendor B's token
    res = client.get(f"/product/{product_a_id}", headers=headers_b)
    
    # 4. Verify we receive 403 Access denied
    assert res.status_code == 403, f"Expected 403 Forbidden, got {res.status_code}: {res.text}"
    assert res.json()["detail"] == "Access denied", f"Expected detail 'Access denied', got {res.json()['detail']}"

    # 5. Clean up test records
    vendors_collection.delete_many({"id": {"$in": [vendor_a_id, vendor_b_id]}})
    users_collection.delete_one({"email": email_b})
    products_collection.delete_one({"id": product_a_id})
    print("Cross-vendor product access test passed successfully!")

if __name__ == "__main__":
    test_rbac_and_plan_limits()
    test_cross_vendor_product_access()
