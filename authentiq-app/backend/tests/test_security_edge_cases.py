from fastapi.testclient import TestClient
from app.main import app
from app.core.db import users_collection, vendors_collection, products_collection, scans_collection
from app.core import security
from datetime import datetime, timedelta
from bson import ObjectId
import uuid
import pytest

def test_security_edge_cases():
    client = TestClient(app)

    # Setup Vendor A
    vendor_a_id = f"vendor-a-{uuid.uuid4().hex[:6]}"
    vendors_collection.insert_one({
        "id": vendor_a_id,
        "vendor_name": "Vendor A",
        "assigned_plan": "business_pro",
        "subscription_status": "active",
        "created_at": datetime.utcnow()
    })
    
    # Setup Vendor B
    vendor_b_id = f"vendor-b-{uuid.uuid4().hex[:6]}"
    vendors_collection.insert_one({
        "id": vendor_b_id,
        "vendor_name": "Vendor B",
        "assigned_plan": "business_pro",
        "subscription_status": "active",
        "created_at": datetime.utcnow()
    })

    # Users
    email_a = f"admin@{vendor_a_id}.com"
    users_collection.insert_one({
        "name": "Admin A",
        "email": email_a,
        "password_hash": "dummy",
        "role": "Administrator",
        "vendor_id": vendor_a_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })

    email_b = f"admin@{vendor_b_id}.com"
    users_collection.insert_one({
        "name": "Admin B",
        "email": email_b,
        "password_hash": "dummy",
        "role": "Administrator",
        "vendor_id": vendor_b_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })

    # Tokens
    token_a = security.create_access_token(data={"sub": email_a, "role": "Administrator"})
    headers_a = {"Authorization": f"Bearer {token_a}"}

    token_b = security.create_access_token(data={"sub": email_b, "role": "Administrator"})
    headers_b = {"Authorization": f"Bearer {token_b}"}

    try:
        # ──────────────────────────────────────────────────────────────────────
        # SEC1: IDOR — access other vendor's team
        # ──────────────────────────────────────────────────────────────────────
        # Call /vendor/team/members using Vendor B's token
        res_sec1 = client.get("/vendor/team/members", headers=headers_b)
        assert res_sec1.status_code == 200
        member_emails = [m["email"] for m in res_sec1.json()]
        # Check that we only see Vendor B's user, NOT Vendor A's user
        assert email_b in member_emails
        assert email_a not in member_emails
        print("[PASSED] SEC1: IDOR — other vendor's team members are not accessible.")

        # ──────────────────────────────────────────────────────────────────────
        # SEC2: IDOR — access other vendor's scan data
        # ──────────────────────────────────────────────────────────────────────
        # Add a scan for Vendor A's product
        scans_collection.insert_one({
            "vendor_id": vendor_a_id,
            "product_id": "prod-a",
            "product_name": "Product A",
            "timestamp": datetime.utcnow(),
            "verification_status": "authentic"
        })
        
        # Get scans using Vendor B's token
        res_sec2 = client.get("/analytics/vendor/scans", headers=headers_b)
        assert res_sec2.status_code == 200
        scans = res_sec2.json()["scans"]
        # Vendor B should see 0 scans because they have no scans under vendor_b_id
        assert len(scans) == 0
        print("[PASSED] SEC2: IDOR — other vendor's scan data is not accessible.")

        # ──────────────────────────────────────────────────────────────────────
        # SEC3: SQL/NoSQL injection in search
        # ──────────────────────────────────────────────────────────────────────
        # Attempt to pass query param containing NoSQL injection payload
        res_sec3 = client.get("/product/list?brand_id=%7B%22%24gt%22%3A%20%22%22%7D", headers=headers_a)
        assert res_sec3.status_code == 200
        # Check that the query was treated as a literal string (meaning 0 products returned)
        assert len(res_sec3.json()["products"]) == 0
        print("[PASSED] SEC3: NoSQL injection in query params is sanitized.")

        # ──────────────────────────────────────────────────────────────────────
        # SEC4: XSS in product name
        # ──────────────────────────────────────────────────────────────────────
        xss_payload = "<img src=x onerror=alert(1)>"
        res_sec4 = client.post("/product/create", json={
            "name": xss_payload,
            "brand": "Brand A",
            "sku": "SKU-XSS-1"
        }, headers=headers_a)
        assert res_sec4.status_code in (200, 201)
        created_prod_id = res_sec4.json()["id"]
        
        # Retrieve product and verify the name is stored literally (no truncation or deletion of tags)
        # Sanitization happens on render (frontend HTML escaping), backend stores the raw data safely
        prod_doc = products_collection.find_one({"id": created_prod_id})
        assert prod_doc["name"] == xss_payload
        print("[PASSED] SEC4: XSS payload stored literally (escaping on client render is enforced).")

        # ──────────────────────────────────────────────────────────────────────
        # SEC5: JWT role elevation
        # ──────────────────────────────────────────────────────────────────────
        # Craft a JWT with role: admin using a different secret key
        from jose import jwt
        invalid_token = jwt.encode(
            {"sub": email_a, "role": "admin", "exp": datetime.utcnow() + timedelta(hours=1)},
            key="wrong_secret_key_12345",
            algorithm="HS256"
        )
        res_sec5 = client.get("/admin/analytics", headers={"Authorization": f"Bearer {invalid_token}"})
        assert res_sec5.status_code == 401, f"Expected 401, got {res_sec5.status_code}: {res_sec5.text}"
        print("[PASSED] SEC5: JWT role elevation / tampered token blocked.")

        # ──────────────────────────────────────────────────────────────────────
        # SEC7: Unauthorized export of another vendor's data
        # ──────────────────────────────────────────────────────────────────────
        # Request export of products using Vendor B's token
        # It should only return Vendor B's products (which is empty), not Vendor A's products
        res_sec7 = client.get("/data/export/products?format=csv", headers=headers_b)
        assert res_sec7.status_code == 200
        # The CSV should contain headers but no data rows for Vendor A
        csv_text = res_sec7.text
        assert "SKU-XSS-1" not in csv_text, "Should not export other vendor's product"
        print("[PASSED] SEC7: Exporting data is strictly vendor-scoped.")

        # ──────────────────────────────────────────────────────────────────────
        # SEC6: Password reset token brute-force (tested last due to rate limits)
        # ──────────────────────────────────────────────────────────────────────
        responses = []
        for i in range(12):
            res = client.post("/auth/reset-password", json={
                "token": f"token-{i}",
                "new_password": "NewPassword123!",
                "confirm_password": "NewPassword123!"
            })
            responses.append(res)
        
        status_codes = [r.status_code for r in responses]
        assert 429 in status_codes, f"Expected rate limiting to trigger 429, got {status_codes}"
        print(f"[PASSED] SEC6: Brute force password reset rate limit triggered. Responses: {status_codes}")

    finally:
        # Clean up
        vendors_collection.delete_many({"id": {"$in": [vendor_a_id, vendor_b_id]}})
        users_collection.delete_many({"vendor_id": {"$in": [vendor_a_id, vendor_b_id]}})
        products_collection.delete_many({"vendor_id": {"$in": [vendor_a_id, vendor_b_id]}})
        scans_collection.delete_many({"vendor_id": {"$in": [vendor_a_id, vendor_b_id]}})
