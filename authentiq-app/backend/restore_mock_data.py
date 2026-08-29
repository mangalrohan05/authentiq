import os
import json
import logging
from pymongo import MongoClient
from dotenv import load_dotenv
from datetime import datetime
from bson import ObjectId

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("restore_mock_data")

load_dotenv()

MONGODB_URL = os.getenv("DATABASE_URL", "mongodb://localhost:27017")
DATABASE_BACKUP_DIR = os.path.join(os.path.dirname(__file__), "static", "db_backup")

def _deserialize_value(value):
    if isinstance(value, list):
        return [_deserialize_value(item) for item in value]
    if isinstance(value, dict):
        if value.get("__type__") == "datetime":
            return datetime.fromisoformat(value["value"])
        if value.get("__type__") == "objectid":
            return ObjectId(value["value"])
        return {k: _deserialize_value(v) for k, v in value.items()}
    return value

def restore():
    logger.info(f"Connecting to MongoDB at {MONGODB_URL}...")
    try:
        client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
        # Force connection check
        client.server_info()
        db = client.authentiq_db
        logger.info("Connected to MongoDB successfully.")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB: {e}")
        return

    collections = [
        "products",
        "qr_codes",
        "scans",
        "batches",
        "vendors",
        "users",
        "articles",
        "plans",
        "verification_sessions"
    ]

    for col_name in collections:
        filepath = os.path.join(DATABASE_BACKUP_DIR, f"{col_name}.json")
        if not os.path.exists(filepath):
            logger.info(f"No backup file found for collection '{col_name}', skipping.")
            continue

        try:
            with open(filepath, "r") as f:
                raw = f.read()
            if not raw.strip():
                continue
            serialized = json.loads(raw)
            if not serialized:
                logger.info(f"Backup file for collection '{col_name}' is empty, skipping.")
                continue

            docs = [_deserialize_value(doc) for doc in serialized]
            collection = db[col_name]
            collection.delete_many({})
            
            inserted = 0
            updated = 0
            for doc in docs:
                if "_id" in doc:
                    res = collection.replace_one({"_id": doc["_id"]}, doc, upsert=True)
                    if res.matched_count > 0:
                        updated += 1
                    else:
                        inserted += 1
                else:
                    collection.insert_one(doc)
                    inserted += 1
            
            logger.info(f"Collection '{col_name}': restored {inserted} new documents, updated {updated} existing documents.")
            
        except Exception as e:
            logger.error(f"Failed to restore collection '{col_name}': {e}", exc_info=True)

if __name__ == "__main__":
    restore()
