import os
import shutil
import tempfile
import unittest

from fastapi.testclient import TestClient

from app.core.db import products_collection, vendors_collection, plans_collection
from app.core.security import get_current_user, get_current_vendor
from app.main import app
from app.routes import product as product_routes


TEST_VENDOR_ID = "test_vendor_reference_images"
TEST_PLAN_ID = "test_plan_reference_images"


async def _test_vendor_user():
    return {
        "email": "reference-images@example.com",
        "role": "vendor",
        "vendor_id": TEST_VENDOR_ID,
    }


class ReferenceImageUploadTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="authentiq-reference-images-")
        self.original_reference_root = product_routes.REFERENCE_IMAGE_ROOT
        product_routes.REFERENCE_IMAGE_ROOT = os.path.join(self.temp_dir, "reference_images")

        app.dependency_overrides[get_current_user] = _test_vendor_user
        app.dependency_overrides[get_current_vendor] = _test_vendor_user
        self.client = TestClient(app)

        products_collection.delete_many({"vendor_id": TEST_VENDOR_ID})
        vendors_collection.delete_many({"id": TEST_VENDOR_ID})
        plans_collection.delete_many({"id": TEST_PLAN_ID})
        plans_collection.insert_one({
            "id": TEST_PLAN_ID,
            "name": "Reference Image Test Plan",
            "limits": {"max_products": 100},
        })
        vendors_collection.insert_one({
            "id": TEST_VENDOR_ID,
            "vendor_name": "Reference Image Test Vendor",
            "subscription_status": "active",
            "assigned_plan": TEST_PLAN_ID,
        })

    def tearDown(self):
        products_collection.delete_many({"vendor_id": TEST_VENDOR_ID})
        vendors_collection.delete_many({"id": TEST_VENDOR_ID})
        plans_collection.delete_many({"id": TEST_PLAN_ID})
        app.dependency_overrides.clear()
        product_routes.REFERENCE_IMAGE_ROOT = self.original_reference_root
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _create_product(self):
        response = self.client.post("/product/create", json={
            "name": "Reference Image Product",
            "brand": "Authentiq Test",
            "description": "Reference image upload test product",
            "sku": "REF-IMG-001",
            "category": "Watches",
        })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["product_id"]

    def test_upload_list_and_delete_reference_image(self):
        product_id = self._create_product()

        response = self.client.post(
            f"/product/{product_id}/reference-images",
            data={"view_type": "front_view"},
            files={"file": ("front.png", b"\x89PNG\r\n\x1a\nvalid-test-image", "image/png")},
        )
        self.assertEqual(response.status_code, 200, response.text)
        image = response.json()
        self.assertEqual(image["view_type"], "front_view")
        self.assertFalse(image["embedding_cached"])
        self.assertIsNone(image["embedding_cached_at"])
        self.assertIsNone(image["embedding_vector"])

        stored_filename = os.path.basename(image["url"])
        stored_path = os.path.join(
            product_routes.REFERENCE_IMAGE_ROOT,
            TEST_VENDOR_ID,
            product_id,
            stored_filename,
        )
        self.assertTrue(os.path.exists(stored_path))

        product_response = self.client.get(f"/product/{product_id}")
        self.assertEqual(product_response.status_code, 200, product_response.text)
        reference_images = product_response.json().get("reference_images", [])
        self.assertEqual(len(reference_images), 1)
        self.assertEqual(reference_images[0]["id"], image["id"])

        delete_response = self.client.delete(f"/product/{product_id}/reference-images/{image['id']}")
        self.assertEqual(delete_response.status_code, 200, delete_response.text)
        self.assertFalse(os.path.exists(stored_path))

        product_after_delete = self.client.get(f"/product/{product_id}")
        self.assertEqual(product_after_delete.status_code, 200, product_after_delete.text)
        self.assertEqual(product_after_delete.json().get("reference_images", []), [])

    def test_rejects_invalid_type_size_and_view_type(self):
        product_id = self._create_product()

        invalid_type_response = self.client.post(
            f"/product/{product_id}/reference-images",
            data={"view_type": "front"},
            files={"file": ("notes.txt", b"not an image", "text/plain")},
        )
        self.assertEqual(invalid_type_response.status_code, 400)

        oversize_response = self.client.post(
            f"/product/{product_id}/reference-images",
            data={"view_type": "front"},
            files={"file": ("large.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")},
        )
        self.assertEqual(oversize_response.status_code, 400)

        invalid_view_response = self.client.post(
            f"/product/{product_id}/reference-images",
            data={"view_type": "hero"},
            files={"file": ("front.png", b"\x89PNG\r\n\x1a\nvalid-test-image", "image/png")},
        )
        self.assertEqual(invalid_view_response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
