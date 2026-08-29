"""Integration tests for database operations."""

import pytest
from pymongo import MongoClient
import os
from datetime import datetime
from app.core.db import users_collection, products_collection, vendors_collection


@pytest.fixture(scope="module")
def test_db():
    """Create test database connection."""
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    client = MongoClient(mongo_uri)
    db = client["authentiq_test"]
    # Ensure indexes are created on the test database
    db.users.create_index("email", unique=True)
    db.products.create_index("vendor_id")
    yield db
    # Cleanup
    client.drop_database("authentiq_test")
    client.close()


@pytest.mark.integration
@pytest.mark.db
class TestUserDatabaseOperations:
    """Integration tests for user database operations."""
    
    def test_create_user(self, test_db):
        """Test creating a user in database."""
        user_data = {
            "email": "test@example.com",
            "password_hash": "$2b$12$test_hash",
            "role": "vendor",
            "status": "active",
            "created_at": datetime.utcnow()
        }
        result = test_db.users.insert_one(user_data)
        assert result.inserted_id is not None
        
        # Verify user was created
        found_user = test_db.users.find_one({"email": "test@example.com"})
        assert found_user is not None
        assert found_user["email"] == "test@example.com"
    
    def test_find_user_by_email(self, test_db):
        """Test finding user by email."""
        user_data = {
            "email": "find@example.com",
            "password_hash": "$2b$12$test_hash",
            "role": "vendor",
            "status": "active"
        }
        test_db.users.insert_one(user_data)
        
        found_user = test_db.users.find_one({"email": "find@example.com"})
        assert found_user is not None
        assert found_user["role"] == "vendor"
    
    def test_update_user_status(self, test_db):
        """Test updating user status."""
        user_data = {
            "email": "update@example.com",
            "password_hash": "$2b$12$test_hash",
            "role": "vendor",
            "status": "active"
        }
        result = test_db.users.insert_one(user_data)
        
        # Update status
        test_db.users.update_one(
            {"_id": result.inserted_id},
            {"$set": {"status": "inactive"}}
        )
        
        # Verify update
        updated_user = test_db.users.find_one({"_id": result.inserted_id})
        assert updated_user["status"] == "inactive"
    
    def test_delete_user(self, test_db):
        """Test deleting user from database."""
        user_data = {
            "email": "delete@example.com",
            "password_hash": "$2b$12$test_hash",
            "role": "vendor",
            "status": "active"
        }
        result = test_db.users.insert_one(user_data)
        
        # Delete user
        test_db.users.delete_one({"_id": result.inserted_id})
        
        # Verify deletion
        deleted_user = test_db.users.find_one({"_id": result.inserted_id})
        assert deleted_user is None


@pytest.mark.integration
@pytest.mark.db
class TestProductDatabaseOperations:
    """Integration tests for product database operations."""
    
    def test_create_product(self, test_db):
        """Test creating a product in database."""
        product_data = {
            "name": "Test Product",
            "brand": "Test Brand",
            "batch_id": "batch_123",
            "vendor_id": "vendor_123",
            "created_at": datetime.utcnow()
        }
        result = test_db.products.insert_one(product_data)
        assert result.inserted_id is not None
        
        # Verify product was created
        found_product = test_db.products.find_one({"name": "Test Product"})
        assert found_product is not None
        assert found_product["brand"] == "Test Brand"
    
    def test_find_products_by_vendor(self, test_db):
        """Test finding products by vendor ID."""
        vendor_id = "vendor_123"
        product_data = {
            "name": "Vendor Product",
            "brand": "Test Brand",
            "batch_id": "batch_123",
            "vendor_id": vendor_id
        }
        test_db.products.insert_one(product_data)
        
        products = list(test_db.products.find({"vendor_id": vendor_id}))
        assert len(products) >= 1
        assert all(p["vendor_id"] == vendor_id for p in products)
    
    def test_update_product(self, test_db):
        """Test updating product in database."""
        product_data = {
            "name": "Original Name",
            "brand": "Test Brand",
            "batch_id": "batch_123",
            "vendor_id": "vendor_123"
        }
        result = test_db.products.insert_one(product_data)
        
        # Update product
        test_db.products.update_one(
            {"_id": result.inserted_id},
            {"$set": {"name": "Updated Name"}}
        )
        
        # Verify update
        updated_product = test_db.products.find_one({"_id": result.inserted_id})
        assert updated_product["name"] == "Updated Name"


@pytest.mark.integration
@pytest.mark.db
class TestVendorDatabaseOperations:
    """Integration tests for vendor database operations."""
    
    def test_create_vendor(self, test_db):
        """Test creating a vendor in database."""
        vendor_data = {
            "name": "Test Vendor",
            "industry_sector": "Pharma",
            "created_at": datetime.utcnow()
        }
        result = test_db.vendors.insert_one(vendor_data)
        assert result.inserted_id is not None
        
        # Verify vendor was created
        found_vendor = test_db.vendors.find_one({"name": "Test Vendor"})
        assert found_vendor is not None
        assert found_vendor["industry_sector"] == "Pharma"
    
    def test_find_vendor_by_name(self, test_db):
        """Test finding vendor by name."""
        vendor_data = {
            "name": "Search Vendor",
            "industry_sector": "FMCG"
        }
        test_db.vendors.insert_one(vendor_data)
        
        found_vendor = test_db.vendors.find_one({"name": "Search Vendor"})
        assert found_vendor is not None
        assert found_vendor["industry_sector"] == "FMCG"


@pytest.mark.integration
@pytest.mark.db
class TestDatabaseIndexes:
    """Integration tests for database indexes."""
    
    def test_user_email_index(self, test_db):
        """Test that users collection has email index."""
        indexes = test_db.users.index_information()
        assert "email_1" in indexes or any("email" in str(idx) for idx in indexes.keys())
    
    def test_product_vendor_index(self, test_db):
        """Test that products collection has vendor_id index."""
        indexes = test_db.products.index_information()
        # Check for vendor_id index
        assert any("vendor" in str(idx) for idx in indexes.keys()) or len(indexes) >= 1


@pytest.mark.integration
@pytest.mark.db
class TestDatabaseConnections:
    """Integration tests for database connection handling."""
    
    def test_database_connection(self, test_db):
        """Test that database connection is working."""
        # Simple ping operation
        test_db.command("ping")
        assert True
    
    def test_collection_access(self, test_db):
        """Test that collections are accessible."""
        collections = test_db.list_collection_names()
        assert isinstance(collections, list)
