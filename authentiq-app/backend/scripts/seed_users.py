"""
Seed script: creates default admin and vendor users for Authentiq.

Run once after starting the backend:
    cd backend
    python scripts/seed_users.py

Credentials created:
  Admin:  admin@authentiq.com  / Admin@123
  Vendor: vendor@authentiq.com / Vendor@123

Safe to re-run — skips existing users (idempotent).
"""

import sys
import os

# Ensure app module is importable from scripts/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

from datetime import datetime
from app.core.db import users_collection
from app.core.security import get_password_hash


# Passwords are env-overridable so no fixed credential is baked into the repo
# (audit 2.1). Production MUST set these; the defaults are dev-only conveniences.
SEED_USERS = [
    {
        "name": "Authentiq Admin",
        "email": "admin@authentiq.com",
        "password": os.getenv("AUTHENTIQ_SEED_ADMIN_PASSWORD", "Admin@123"),
        "role": "admin",
        "vendor_id": None,
    },
    {
        "name": "Demo Vendor",
        "email": "vendor@authentiq.com",
        "password": os.getenv("AUTHENTIQ_SEED_VENDOR_PASSWORD", "Vendor@123"),
        "role": "vendor",
        "vendor_id": None,
    },
]


def seed():
    created = 0
    skipped = 0

    for user_data in SEED_USERS:
        existing = users_collection.find_one({"email": user_data["email"]})
        if existing:
            print(f"  ⏭  Skipped (already exists): {user_data['email']}")
            skipped += 1
            continue

        doc = {
            "name": user_data["name"],
            "email": user_data["email"],
            "password_hash": get_password_hash(user_data["password"]),
            "role": user_data["role"],
            "vendor_id": user_data["vendor_id"],
            "created_at": datetime.utcnow(),
        }
        users_collection.insert_one(doc)
        print(f"  ✅ Created [{user_data['role']}]: {user_data['email']} / {user_data['password']}")
        created += 1

    print(f"\nSeed complete. Created: {created}  Skipped: {skipped}")


if __name__ == "__main__":
    print("\n🌱 Seeding Authentiq users...\n")
    seed()
