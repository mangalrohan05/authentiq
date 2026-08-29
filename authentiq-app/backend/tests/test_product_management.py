from fastapi.testclient import TestClient
from app.main import app
from app.core.db import users_collection, vendors_collection, products_collection, brands_collection
from app.core import security
from datetime import datetime, timedelta
import uuid
import pytest

def test_product_management_post_endpoints():
    client = TestClient(app)

    # 1. Setup a test vendor
    test_vendor_id = f"vendor-pm-{uuid.uuid4().hex[:6]}"
    vendors_collection.insert_one({
        "id": test_vendor_id,
        "vendor_name": "Product Mgmt Test Vendor",
        "assigned_plan": "business",
        "subscription_status": "active",
        "created_at": datetime.utcnow()
    })

    # Setup Administrator user for the vendor
    email = f"admin@{test_vendor_id}.com"
    users_collection.insert_one({
        "name": "PM Admin",
        "email": email,
        "password_hash": "dummy_hash",
        "role": "Administrator",
        "vendor_id": test_vendor_id,
        "status": "active",
        "created_at": datetime.utcnow()
    })

    # Generate JWT token
    access_token_expires = timedelta(minutes=30)
    token = security.create_access_token(
        data={"sub": email, "role": "Administrator"},
        expires_delta=access_token_expires
    )
    headers = {"Authorization": f"Bearer {token}"}

    # Setup another vendor for cross-vendor brand testing (P4)
    other_vendor_id = f"vendor-other-{uuid.uuid4().hex[:6]}"
    vendors_collection.insert_one({
        "id": other_vendor_id,
        "vendor_name": "Other Vendor",
        "assigned_plan": "business",
        "subscription_status": "active",
        "created_at": datetime.utcnow()
    })
    
    # Create a brand for the other vendor
    other_brand_id = f"brand-other-{uuid.uuid4().hex[:6]}"
    brands_collection.insert_one({
        "id": other_brand_id,
        "vendor_id": other_vendor_id,
        "brand_name": "Other Brand",
        "product_categories": ["Electronics"],
        "status": "active"
    })

    # Create a brand for our test vendor
    our_brand_id = f"brand-our-{uuid.uuid4().hex[:6]}"
    brands_collection.insert_one({
        "id": our_brand_id,
        "vendor_id": test_vendor_id,
        "brand_name": "Our Brand",
        "product_categories": ["Apparel"],
        "status": "active"
    })

    try:
        # P1: Create a product successfully, then try to create another one with duplicate SKU
        res_create = client.post("/product/create", json={
            "name": "Valid Product 1",
            "brand": "Our Brand",
            "sku": "UNIQUE-SKU-1",
            "brand_id": our_brand_id
        }, headers=headers)
        assert res_create.status_code in (200, 201), f"Expected success, got {res_create.status_code}: {res_create.text}"
        product_1_id = res_create.json()["id"]

        # Duplicate SKU
        res_dup_sku = client.post("/product/create", json={
            "name": "Product with Duplicate SKU",
            "brand": "Our Brand",
            "sku": "UNIQUE-SKU-1",
            "brand_id": our_brand_id
        }, headers=headers)
        assert res_dup_sku.status_code == 409, f"Expected 409 Conflict, got {res_dup_sku.status_code}: {res_dup_sku.text}"
        print("[PASSED] P1: Duplicate SKU creation blocked.")

        # P2: Create product with blank name
        res_blank_name = client.post("/product/create", json={
            "name": "",
            "brand": "Our Brand",
            "sku": "UNIQUE-SKU-2",
            "brand_id": our_brand_id
        }, headers=headers)
        assert res_blank_name.status_code == 422, f"Expected 422, got {res_blank_name.status_code}: {res_blank_name.text}"
        print("[PASSED] P2: Blank name creation blocked.")

        # P3: Create product with non-existent brand_id
        res_fake_brand = client.post("/product/create", json={
            "name": "Product with Fake Brand",
            "brand": "Some Brand",
            "sku": "UNIQUE-SKU-3",
            "brand_id": "fake-brand-id"
        }, headers=headers)
        assert res_fake_brand.status_code == 404, f"Expected 404, got {res_fake_brand.status_code}: {res_fake_brand.text}"
        print("[PASSED] P3: Fake brand_id creation blocked.")

        # P4: Create product with brand_id of another vendor
        res_other_brand = client.post("/product/create", json={
            "name": "Product with Other Vendor Brand",
            "brand": "Other Brand",
            "sku": "UNIQUE-SKU-4",
            "brand_id": other_brand_id
        }, headers=headers)
        assert res_other_brand.status_code == 404, f"Expected 404, got {res_other_brand.status_code}: {res_other_brand.text}"
        print("[PASSED] P4: Other vendor's brand_id creation blocked.")

        # P5: Update product with no fields (PATCH /product/{id})
        res_patch_empty = client.patch(f"/product/{product_1_id}", json={}, headers=headers)
        assert res_patch_empty.status_code == 400, f"Expected 400, got {res_patch_empty.status_code}: {res_patch_empty.text}"
        print("[PASSED] P5: Product update with no fields blocked.")

        # P6: Update another vendor's product
        other_product_id = f"prod-other-{uuid.uuid4().hex[:6]}"
        products_collection.insert_one({
            "id": other_product_id,
            "vendor_id": other_vendor_id,
            "name": "Other Vendor Product",
            "sku": "OTHER-SKU-1",
            "brand": "Other Brand",
            "timestamp": datetime.utcnow()
        })
        res_patch_other = client.patch(f"/product/{other_product_id}", json={"name": "Hacked Name"}, headers=headers)
        assert res_patch_other.status_code == 404, f"Expected 404, got {res_patch_other.status_code}: {res_patch_other.text}"
        print("[PASSED] P6: Update another vendor's product blocked.")

        # P7: Delete already-archived product (archive twice)
        # First DELETE - should succeed
        res_delete_1 = client.delete(f"/product/{product_1_id}", headers=headers)
        assert res_delete_1.status_code == 200, f"Expected 200, got {res_delete_1.status_code}: {res_delete_1.text}"
        
        # Second DELETE - should fail with 404
        res_delete_2 = client.delete(f"/product/{product_1_id}", headers=headers)
        assert res_delete_2.status_code == 404, f"Expected 404, got {res_delete_2.status_code}: {res_delete_2.text}"
        print("[PASSED] P7: Archiving already-archived product returns 404.")

        # P14: Archived products excluded from list
        res_list = client.get("/product/list", headers=headers)
        assert res_list.status_code == 200, f"Expected 200, got {res_list.status_code}: {res_list.text}"
        list_ids = [p["id"] for p in res_list.json()["products"]]
        assert product_1_id not in list_ids, "Archived product should not be in list"
        print("[PASSED] P14: Archived products excluded from list.")

        # Create a new active product for image upload tests (P10, P11, P12, P13)
        res_create_active = client.post("/product/create", json={
            "name": "Active Product for Image Tests",
            "brand": "Our Brand",
            "sku": "IMAGE-TEST-SKU",
            "brand_id": our_brand_id
        }, headers=headers)
        assert res_create_active.status_code in (200, 201)
        active_product_id = res_create_active.json()["id"]

        # Generate tiny image bytes
        from io import BytesIO
        from PIL import Image
        img = Image.new('RGB', (10, 10), color = 'blue')
        img_io = BytesIO()
        img.save(img_io, format='PNG')
        img_bytes = img_io.getvalue()

        # P10: Upload reference image > 5 MB
        oversized_bytes = b"0" * (5 * 1024 * 1024 + 100)
        res_oversized = client.post(
            f"/product/{active_product_id}/reference-images",
            data={"view_type": "front"},
            files={"file": ("large.png", oversized_bytes, "image/png")},
            headers=headers
        )
        assert res_oversized.status_code == 400, f"Expected 400, got {res_oversized.status_code}: {res_oversized.text}"
        print("[PASSED] P10: Oversized reference image (>5MB) blocked.")

        # P11: Upload unsupported image type (PDF)
        pdf_bytes = b"%PDF-1.4 mock pdf content"
        res_pdf = client.post(
            f"/product/{active_product_id}/reference-images",
            data={"view_type": "front"},
            files={"file": ("doc.pdf", pdf_bytes, "application/pdf")},
            headers=headers
        )
        assert res_pdf.status_code == 400, f"Expected 400, got {res_pdf.status_code}: {res_pdf.text}"
        print("[PASSED] P11: Unsupported image format (PDF) blocked.")

        # P12: Upload perceptually identical images
        # 1st upload (front) - should succeed
        res_up1 = client.post(
            f"/product/{active_product_id}/reference-images",
            data={"view_type": "front"},
            files={"file": ("front.png", img_bytes, "image/png")},
            headers=headers
        )
        assert res_up1.status_code in (200, 201), f"Expected 200, got {res_up1.status_code}: {res_up1.text}"
        
        # 2nd upload (back) - using identical bytes - should fail with 400 due to similarity check
        res_up2 = client.post(
            f"/product/{active_product_id}/reference-images",
            data={"view_type": "back"},
            files={"file": ("back.png", img_bytes, "image/png")},
            headers=headers
        )
        assert res_up2.status_code == 400, f"Expected 400, got {res_up2.status_code}: {res_up2.text}"
        assert "too similar to the existing" in res_up2.json()["detail"].lower()
        print("[PASSED] P12: Perceptually identical reference images blocked.")

        # P13: Delete non-existent reference image
        res_del_fake_img = client.delete(
            f"/product/{active_product_id}/reference-images/fake-image-uuid",
            headers=headers
        )
        assert res_del_fake_img.status_code == 404, f"Expected 404, got {res_del_fake_img.status_code}: {res_del_fake_img.text}"
        print("[PASSED] P13: Delete non-existent reference image returns 404.")

    finally:
        # Clean up
        vendors_collection.delete_many({"id": {"$in": [test_vendor_id, other_vendor_id]}})
        users_collection.delete_one({"email": email})
        products_collection.delete_many({"vendor_id": test_vendor_id})
        brands_collection.delete_many({"id": {"$in": [our_brand_id, other_brand_id]}})
