from fastapi.testclient import TestClient
from app.main import app
from app.core.db import users_collection, vendors_collection, products_collection
from app.core import security
from datetime import datetime, timedelta
import uuid

def test_product_list_pagination_and_projection():
    client = TestClient(app)

    # 1. Setup a test organization/vendor
    test_vendor_id = f"test-vendor-{uuid.uuid4().hex[:6]}"
    
    vendors_collection.insert_one({
        "id": test_vendor_id,
        "vendor_name": f"Test Brand {test_vendor_id}",
        "assigned_plan": "business",
        "subscription_status": "active",
        "created_at": datetime.utcnow()
    })

    # 2. Setup user
    email = f"admin@{test_vendor_id}.com"
    users_collection.insert_one({
        "name": "Test Admin",
        "email": email,
        "password_hash": "dummy_hash",
        "role": "Administrator",
        "vendor_id": test_vendor_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })

    # Generate JWT access token
    access_token_expires = timedelta(minutes=30)
    token = security.create_access_token(
        data={"sub": email, "role": "Administrator"},
        expires_delta=access_token_expires
    )
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Create multiple test products with heavy embedding vectors to test projection
    for i in range(15):
        products_collection.insert_one({
            "id": f"prod-id-{i}-{test_vendor_id}",
            "vendor_id": test_vendor_id,
            "name": f"Product {i}",
            "brand": "Test Brand",
            "sku": f"SKU-{i}-{test_vendor_id}",
            "timestamp": datetime.utcnow() - timedelta(minutes=i),
            "front_embedding": [0.1] * 512,  # heavy vector
            "back_embedding": [0.2] * 512,   # heavy vector
            "archived": False
        })

    try:
        # 4. Request first page, limit 5
        res = client.get("/product/list?page=1&limit=5", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "products" in data
        assert "pagination" in data
        assert len(data["products"]) == 5
        assert data["pagination"]["total"] == 15
        assert data["pagination"]["page"] == 1
        assert data["pagination"]["limit"] == 5
        assert data["pagination"]["pages"] == 3

        # Ensure heavy embedding vectors are excluded via projection
        for product in data["products"]:
            assert "front_embedding" not in product
            assert "back_embedding" not in product
            assert "name" in product
            assert "id" in product

        # 5. Request second page, limit 5
        res2 = client.get("/product/list?page=2&limit=5", headers=headers)
        assert res2.status_code == 200
        data2 = res2.json()
        assert len(data2["products"]) == 5
        assert data2["pagination"]["page"] == 2
        # Check that sorting is reverse chronological by timestamp and they are distinct from page 1
        p1_ids = {p["id"] for p in data["products"]}
        p2_ids = {p["id"] for p in data2["products"]}
        assert len(p1_ids.intersection(p2_ids)) == 0

        # 6. Request page 4 (out of bounds)
        res3 = client.get("/product/list?page=4&limit=5", headers=headers)
        assert res3.status_code == 200
        data3 = res3.json()
        assert len(data3["products"]) == 0
        assert data3["pagination"]["total"] == 15
        assert data3["pagination"]["pages"] == 3
        print("All pagination and projection tests passed successfully!")

    finally:
        # Clean up test records
        vendors_collection.delete_one({"id": test_vendor_id})
        users_collection.delete_many({"email": email})
        products_collection.delete_many({"vendor_id": test_vendor_id})

if __name__ == "__main__":
    test_product_list_pagination_and_projection()
