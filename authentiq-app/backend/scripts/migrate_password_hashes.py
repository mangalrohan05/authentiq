"""
migrate_password_hashes.py
--------------------------
One-time migration: re-hash every user's stored bcrypt hash so it is
compatible with the new SHA-256 pre-hash scheme introduced in security.py.

Because we cannot reverse the old bcrypt hashes we cannot keep existing
passwords.  Instead this script:
  1. Re-hashes each user's password to a known reset value.
  2. Prints a summary table of email → reset password.
  3. Updates users.json backup with the new hashes.

Known seed passwords (from scripts/seed_users.py):
  admin@authentiq.com  → Admin@123
  vendor@authentiq.com → Vendor@123

All OTHER users get a temporary password of  TempPass@1234
and must change it on next login.

Run from the backend directory:
    .\\venv\\Scripts\\python.exe scripts\\migrate_password_hashes.py
"""

import os
import sys
import json
import hashlib
import base64
import logging
from datetime import datetime

# ---------------------------------------------------------------------------
# Make sure we can import app modules from the backend root
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from pymongo import MongoClient
from bson import ObjectId
from passlib.context import CryptContext

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("migrate_password_hashes")

# ---------------------------------------------------------------------------
# Re-implement the new hashing scheme locally (no circular import risk)
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def _prehash(password: str) -> str:
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("utf-8")

def new_hash(password: str) -> str:
    return pwd_context.hash(_prehash(password))

# ---------------------------------------------------------------------------
# Known passwords for seed accounts; everyone else gets a temp password
# ---------------------------------------------------------------------------
KNOWN_PASSWORDS: dict[str, str] = {
    "admin@authentiq.com":  "Admin@123",
    "vendor@authentiq.com": "Vendor@123",
}
DEFAULT_TEMP_PASSWORD = "TempPass@1234"

MONGODB_URL = os.getenv("DATABASE_URL", "mongodb://localhost:27017")
DB_BACKUP_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "static", "db_backup", "users.json"
)

def _serialize_value(value):
    """Convert Python values back to JSON-serialisable backup format."""
    if isinstance(value, datetime):
        return {"__type__": "datetime", "value": value.isoformat()}
    if isinstance(value, ObjectId):
        return {"__type__": "objectid", "value": str(value)}
    if isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialize_value(i) for i in value]
    return value


def main():
    logger.info(f"Connecting to MongoDB at {MONGODB_URL} …")
    client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=5000)
    try:
        client.server_info()
    except Exception as e:
        logger.error(f"Cannot connect to MongoDB: {e}")
        sys.exit(1)

    db = client.authentiq_db
    users_col = db["users"]

    all_users = list(users_col.find({}))
    logger.info(f"Found {len(all_users)} user(s) to migrate.")

    summary = []
    updated_docs = []

    for user in all_users:
        email = user.get("email", "")
        password = KNOWN_PASSWORDS.get(email, DEFAULT_TEMP_PASSWORD)
        new_password_hash = new_hash(password)

        users_col.update_one(
            {"_id": user["_id"]},
            {"$set": {"password_hash": new_password_hash}}
        )

        is_known = email in KNOWN_PASSWORDS
        summary.append({
            "email": email,
            "role":  user.get("role", "?"),
            "password": password,
            "note": "original password" if is_known else "TEMP — user must change",
        })

        # Build updated doc for backup
        updated_user = dict(user)
        updated_user["password_hash"] = new_password_hash
        updated_docs.append(_serialize_value(updated_user))

    # -------------------------------------------------------------------
    # Print summary
    # -------------------------------------------------------------------
    print("\n" + "="*70)
    print(f"{'EMAIL':<35} {'ROLE':<15} {'PASSWORD':<20} NOTE")
    print("-"*70)
    for row in summary:
        print(f"{row['email']:<35} {row['role']:<15} {row['password']:<20} {row['note']}")
    print("="*70)
    print(f"\nDONE: Migrated {len(summary)} user(s) to new SHA-256+bcrypt scheme.\n")

    # -------------------------------------------------------------------
    # Update users.json backup
    # -------------------------------------------------------------------
    try:
        with open(DB_BACKUP_PATH, "w", encoding="utf-8") as f:
            json.dump(updated_docs, f, indent=2, ensure_ascii=False)
        logger.info(f"Updated backup: {DB_BACKUP_PATH}")
    except Exception as e:
        logger.warning(f"Could not update users.json backup: {e}")


if __name__ == "__main__":
    main()
