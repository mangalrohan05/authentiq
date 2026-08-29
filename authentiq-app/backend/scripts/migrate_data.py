import os
from pymongo import MongoClient
from dotenv import load_dotenv
import uuid
from datetime import datetime

load_dotenv()

MONGODB_URL = os.getenv("DATABASE_URL", "mongodb://localhost:27017")
client = MongoClient(MONGODB_URL)
db = client.authentiq_db

products_collection = db.products
batches_collection = db.batches
qr_codes_collection = db.qr_codes

def migrate():
    print("Starting migration...")
    
    # 1. Get all products
    products = list(products_collection.find({}))
    print(f"Found {len(products)} products.")
    
    for product in products:
        # Check if product already has a batch_id that exists
        if "batch_id" in product:
            existing_batch = batches_collection.find_one({"id": product["batch_id"]})
            if existing_batch:
                print(f"Product {product.get('name')} already linked to valid batch.")
                continue
        
        # Create a new batch for this product (Legacy flow)
        batch_id = str(uuid.uuid4())
        batch_name = f"Legacy - {product.get('name', 'Unnamed Product')}"
        
        # Check if this product had a QR code
        qr_id = product.get("qr_id")
        verification_url = None
        
        # If product had a QR, we should check the qr_codes collection
        if not qr_id:
            # Maybe it's in the qr_codes collection linked by product_id (if that was the old way)
            old_qr = qr_codes_collection.find_one({"product_id": product["id"]})
            if old_qr:
                qr_id = old_qr["qr_id"]
        
        if qr_id:
            verification_url = f"http://localhost:3000/verify/{qr_id}"
            # Update the QR code entry to point to the new batch_id
            qr_codes_collection.update_one(
                {"qr_id": qr_id},
                {"$set": {"batch_id": batch_id}, "$unset": {"product_id": ""}}
            )
        
        # Create the batch
        batch_entry = {
            "id": batch_id,
            "batch_name": batch_name,
            "qr_id": qr_id,
            "verification_url": verification_url,
            "created_at": product.get("timestamp", datetime.utcnow()),
            "scan_count": 0 # Will be updated or counted dynamically
        }
        
        batches_collection.insert_one(batch_entry)
        
        # Update the product to point to the new batch
        products_collection.update_one(
            {"id": product["id"]},
            {"$set": {"batch_id": batch_id}, "$unset": {"qr_id": ""}}
        )
        
        print(f"Migrated product {product.get('name')} to batch {batch_name}.")

    print("Migration complete.")

if __name__ == "__main__":
    migrate()
