from fastapi.testclient import TestClient
from app.main import app
from app.core.db import users_collection, vendors_collection, scans_collection, products_collection, invitations_collection
from app.core import security
from datetime import datetime, timedelta
from bson import ObjectId
import uuid
import pytest

def test_hierarchical_scoping_flow():
    client = TestClient(app)

    # 1. Setup test vendors
    vendor_a_id = f"vendor-a-{uuid.uuid4().hex[:6]}"
    vendor_b_id = f"vendor-b-{uuid.uuid4().hex[:6]}"
    
    vendors_collection.insert_one({
        "id": vendor_a_id,
        "vendor_name": "Vendor A Scoping Org",
        "assigned_plan": "business",
        "subscription_status": "active",
        "total_users_limit": 10,
        "created_at": datetime.utcnow()
    })
    vendors_collection.insert_one({
        "id": vendor_b_id,
        "vendor_name": "Vendor B Scoping Org",
        "assigned_plan": "business",
        "subscription_status": "active",
        "total_users_limit": 10,
        "created_at": datetime.utcnow()
    })

    # 2. Setup Users for Vendor A
    # Admin A1
    admin_a1_email = f"admin_a1@{vendor_a_id}.com"
    admin_a1_inserted = users_collection.insert_one({
        "name": "Admin A1",
        "email": admin_a1_email,
        "password_hash": "dummy_hash",
        "role": "Administrator",
        "vendor_id": vendor_a_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })
    admin_a1_id = str(admin_a1_inserted.inserted_id)

    # Admin A2 (unlinked to Admin A1, but in same org)
    admin_a2_email = f"admin_a2@{vendor_a_id}.com"
    admin_a2_inserted = users_collection.insert_one({
        "name": "Admin A2",
        "email": admin_a2_email,
        "password_hash": "dummy_hash",
        "role": "Administrator",
        "vendor_id": vendor_a_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })
    admin_a2_id = str(admin_a2_inserted.inserted_id)

    # Manager A (invited/created by Admin A1)
    manager_a_email = f"manager_a@{vendor_a_id}.com"
    manager_a_inserted = users_collection.insert_one({
        "name": "Manager A",
        "email": manager_a_email,
        "password_hash": "dummy_hash",
        "role": "Manager",
        "vendor_id": vendor_a_id,
        "status": "active",
        "created_at": datetime.utcnow(),
        "invited_by": admin_a1_email
    })
    manager_a_id = str(manager_a_inserted.inserted_id)

    # Viewer A (invited/created by Admin A2)
    viewer_a_email = f"viewer_a@{vendor_a_id}.com"
    viewer_a_inserted = users_collection.insert_one({
        "name": "Viewer A",
        "email": viewer_a_email,
        "password_hash": "dummy_hash",
        "role": "Viewer",
        "vendor_id": vendor_a_id,
        "status": "active",
        "created_at": datetime.utcnow(),
        "invited_by": admin_a2_email
    })
    viewer_a_id = str(viewer_a_inserted.inserted_id)

    # 3. Setup Users for Vendor B
    # Admin B
    admin_b_email = f"admin_b@{vendor_b_id}.com"
    admin_b_inserted = users_collection.insert_one({
        "name": "Admin B",
        "email": admin_b_email,
        "password_hash": "dummy_hash",
        "role": "Administrator",
        "vendor_id": vendor_b_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })
    admin_b_id = str(admin_b_inserted.inserted_id)

    # Generate JWT tokens
    access_token_expires = timedelta(minutes=30)
    token_admin_a1 = security.create_access_token(data={"sub": admin_a1_email, "role": "Administrator", "id": admin_a1_id}, expires_delta=access_token_expires)
    token_admin_a2 = security.create_access_token(data={"sub": admin_a2_email, "role": "Administrator", "id": admin_a2_id}, expires_delta=access_token_expires)
    token_manager_a = security.create_access_token(data={"sub": manager_a_email, "role": "Manager", "id": manager_a_id}, expires_delta=access_token_expires)
    token_admin_b = security.create_access_token(data={"sub": admin_b_email, "role": "Administrator", "id": admin_b_id}, expires_delta=access_token_expires)

    headers_a1 = {"Authorization": f"Bearer {token_admin_a1}"}
    headers_a2 = {"Authorization": f"Bearer {token_admin_a2}"}
    headers_ma = {"Authorization": f"Bearer {token_manager_a}"}
    headers_b = {"Authorization": f"Bearer {token_admin_b}"}

    try:
        # ──────────────────────────────────────────────────────────────────────
        # Test 1: Invited user accepted stores invited_by context
        # ──────────────────────────────────────────────────────────────────────
        invite_id = f"invite-{uuid.uuid4().hex[:6]}"
        invited_email = f"new_viewer_a1@{vendor_a_id}.com"
        invitations_collection.insert_one({
            "id": invite_id,
            "email": invited_email,
            "role": "Viewer",
            "vendor_id": vendor_a_id,
            "invited_by": admin_a1_email,
            "status": "pending",
            "created_at": datetime.utcnow()
        })

        res_accept = client.post("/auth/invitation/accept", json={
            "token": invite_id,
            "name": "Accepted Viewer",
            "password": "SecurePassword123!"
        })
        assert res_accept.status_code == 201

        # Check DB
        new_user = users_collection.find_one({"email": invited_email})
        assert new_user is not None
        assert new_user.get("invited_by") == admin_a1_email
        print("[PASSED] Test 1: Accepted invitation sets invited_by correctly.")

        # ──────────────────────────────────────────────────────────────────────
        # Test 2: Manually created team member stores invited_by context
        # ──────────────────────────────────────────────────────────────────────
        manual_email = f"manual_viewer_a1@{vendor_a_id}.com"
        res_create = client.post("/vendor/team/create-member", json={
            "name": "Manual Viewer",
            "email": manual_email,
            "password": "SecurePassword123!",
            "role": "Viewer"
        }, headers=headers_a1)
        assert res_create.status_code == 201

        new_manual_user = users_collection.find_one({"email": manual_email})
        assert new_manual_user is not None
        assert new_manual_user.get("invited_by") == admin_a1_email
        print("[PASSED] Test 2: Manually created member sets invited_by correctly.")

        # ──────────────────────────────────────────────────────────────────────
        # Test 3: Product activity (ADD / DELETE) stores user_email
        # ──────────────────────────────────────────────────────────────────────
        # Create product
        res_prod_create = client.post("/product/create", json={
            "name": "Scoping Test Watch",
            "brand": "Luxe",
            "description": "Scoping Test",
            "sku": f"SKU-{uuid.uuid4().hex[:6]}",
            "mrp": 1500.0,
            "hsn_code": "9101",
            "manufacturer_name": "Luxe Mfg",
            "manufacturer_address": "123 Street"
        }, headers=headers_a1)
        assert res_prod_create.status_code == 200
        product_id = res_prod_create.json()["product_id"]

        # Verify activity logs
        added_log = scans_collection.find_one({"event_type": "Product Added", "product_id": product_id})
        assert added_log is not None
        assert added_log.get("user_email") == admin_a1_email
        print("[PASSED] Test 3a: Product creation logged user_email correctly.")

        # Delete product
        res_prod_delete = client.delete(f"/product/{product_id}", headers=headers_a1)
        assert res_prod_delete.status_code == 200

        deleted_log = scans_collection.find_one({"event_type": "Product Deleted", "product_id": product_id})
        assert deleted_log is not None
        assert deleted_log.get("user_email") == admin_a1_email
        print("[PASSED] Test 3b: Product deletion logged user_email correctly.")

        # ──────────────────────────────────────────────────────────────────────
        # Test 4: Scoping and Isolation in /analytics/recent-activity
        # ──────────────────────────────────────────────────────────────────────
        # Clear scans from vendor A so we can control activity list
        scans_collection.delete_many({"vendor_id": vendor_a_id})

        # Insert activities performed by different users
        # 1. Activity by Admin A1
        scans_collection.insert_one({
            "event_type": "Product Added",
            "product_name": "A1 Product",
            "vendor_id": vendor_a_id,
            "user_email": admin_a1_email,
            "timestamp": datetime.utcnow() - timedelta(minutes=5)
        })
        # 2. Activity by Manager A (linked to Admin A1)
        scans_collection.insert_one({
            "event_type": "Product Added",
            "product_name": "Linked Manager Product",
            "vendor_id": vendor_a_id,
            "user_email": manager_a_email,
            "timestamp": datetime.utcnow() - timedelta(minutes=4)
        })
        # 3. Activity by Admin A2 (unlinked Admin in same org)
        scans_collection.insert_one({
            "event_type": "Product Added",
            "product_name": "Unlinked Admin Product",
            "vendor_id": vendor_a_id,
            "user_email": admin_a2_email,
            "timestamp": datetime.utcnow() - timedelta(minutes=3)
        })
        # 4. Activity by Viewer A (linked to Admin A2, unlinked to A1)
        scans_collection.insert_one({
            "event_type": "Product Added",
            "product_name": "Unlinked Viewer Product",
            "vendor_id": vendor_a_id,
            "user_email": viewer_a_email,
            "timestamp": datetime.utcnow() - timedelta(minutes=2)
        })
        # 5. Customer scan event (no user_email)
        scans_collection.insert_one({
            "event_type": "Product Scanned",
            "product_name": "Customer Scan",
            "vendor_id": vendor_a_id,
            "user_email": None,
            "timestamp": datetime.utcnow() - timedelta(minutes=1)
        })
        # 6. Activity from completely different vendor (Vendor B)
        scans_collection.insert_one({
            "event_type": "Product Added",
            "product_name": "Vendor B Product",
            "vendor_id": vendor_b_id,
            "user_email": admin_b_email,
            "timestamp": datetime.utcnow()
        })

        # --- A. Check Admin A1 Fetch ---
        res_a1 = client.get("/analytics/recent-activity", headers=headers_a1)
        assert res_a1.status_code == 200
        activities_a1 = res_a1.json()
        
        # Admin A1 should see all activities under vendor_a:
        # - Admin A1 own activities (A1 Product)
        # - Manager A activities (Linked Manager Product)
        # - Customer scan (Customer Scan)
        # - Admin A2 activities (Unlinked Admin Product)
        # - Viewer A activities (Unlinked Viewer Product)
        # BUT NOT:
        # - Vendor B activities (cross-tenant)
        names_a1 = [a["batch_name"] for a in activities_a1]
        assert "A1 Product" in names_a1
        assert "Linked Manager Product" in names_a1
        assert "Customer Scan" in names_a1
        assert "Unlinked Admin Product" in names_a1
        assert "Unlinked Viewer Product" in names_a1
        assert "Vendor B Product" not in names_a1
        print("[PASSED] Test 4a: Administrator sees all workspace activities.")

        # --- B. Check Manager A Fetch ---
        res_ma = client.get("/analytics/recent-activity", headers=headers_ma)
        assert res_ma.status_code == 200
        activities_ma = res_ma.json()

        # Manager A should see all activities under vendor_a:
        # - Admin A1 own activities (A1 Product)
        # - Manager A activities (Linked Manager Product)
        # - Customer scan (Customer Scan)
        # - Admin A2 activities (Unlinked Admin Product)
        # - Viewer A activities (Unlinked Viewer Product)
        # BUT NOT:
        # - Vendor B activities (cross-tenant)
        names_ma = [a["batch_name"] for a in activities_ma]
        assert "A1 Product" in names_ma
        assert "Linked Manager Product" in names_ma
        assert "Customer Scan" in names_ma
        assert "Unlinked Admin Product" in names_ma
        assert "Unlinked Viewer Product" in names_ma
        assert "Vendor B Product" not in names_ma
        print("[PASSED] Test 4b: Manager sees all workspace activities.")

        # --- C. Check Admin A2 Fetch ---
        res_a2 = client.get("/analytics/recent-activity", headers=headers_a2)
        assert res_a2.status_code == 200
        activities_a2 = res_a2.json()
 
        # Admin A2 should see all activities under vendor_a:
        # - Admin A1 own activities (A1 Product)
        # - Manager A activities (Linked Manager Product)
        # - Customer scan (Customer Scan)
        # - Admin A2 activities (Unlinked Admin Product)
        # - Viewer A activities (Unlinked Viewer Product)
        # BUT NOT:
        # - Vendor B activities (cross-tenant)
        names_a2 = [a["batch_name"] for a in activities_a2]
        assert "A1 Product" in names_a2
        assert "Linked Manager Product" in names_a2
        assert "Customer Scan" in names_a2
        assert "Unlinked Admin Product" in names_a2
        assert "Unlinked Viewer Product" in names_a2
        assert "Vendor B Product" not in names_a2
        print("[PASSED] Test 4c: Admin A2 sees all workspace activities.")

    finally:
        # Cleanup DB
        vendors_collection.delete_many({"id": {"$in": [vendor_a_id, vendor_b_id]}})
        users_collection.delete_many({"_id": {"$in": [
            ObjectId(admin_a1_id), ObjectId(admin_a2_id), ObjectId(manager_a_id), ObjectId(viewer_a_id), ObjectId(admin_b_id)
        ]}})
        users_collection.delete_many({"email": {"$in": [invited_email, manual_email]}})
        invitations_collection.delete_many({"vendor_id": vendor_a_id})
        scans_collection.delete_many({"vendor_id": {"$in": [vendor_a_id, vendor_b_id]}})
        products_collection.delete_many({"vendor_id": vendor_a_id})
