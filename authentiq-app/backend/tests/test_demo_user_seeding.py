"""Runtime demo-user seeding (audit item 2.1).

users.json is no longer committed, so mock mode must seed the demo admin/vendor at
runtime whenever the users collection is empty — independent of other backups —
with env-overridable passwords. Uses mongomock directly (no global DB state).
"""

from __future__ import annotations

import mongomock

from app.core import db as dbmod
from app.core.security import verify_password


def _fresh_db():
    return mongomock.MongoClient().test_db


def test_seeds_demo_users_when_empty():
    fdb = _fresh_db()
    dbmod._ensure_demo_users(fdb)
    admin = fdb.users.find_one({"email": "admin@authentiq.com"})
    vendor = fdb.users.find_one({"email": "vendor@authentiq.com"})
    assert admin is not None and admin["role"] == "admin"
    assert vendor is not None and vendor["role"] == "vendor"
    # Seeded hash matches the (default) demo password via the real verifier.
    assert verify_password("Admin@123", admin["password_hash"]) is True


def test_seeding_is_idempotent():
    fdb = _fresh_db()
    dbmod._ensure_demo_users(fdb)
    dbmod._ensure_demo_users(fdb)
    assert fdb.users.count_documents({"email": "admin@authentiq.com"}) == 1


def test_passwords_are_env_overridable(monkeypatch):
    monkeypatch.setenv("AUTHENTIQ_SEED_ADMIN_PASSWORD", "Rotated#42")
    fdb = _fresh_db()
    dbmod._ensure_demo_users(fdb)
    admin = fdb.users.find_one({"email": "admin@authentiq.com"})
    assert verify_password("Rotated#42", admin["password_hash"]) is True
    assert verify_password("Admin@123", admin["password_hash"]) is False


def test_noop_when_users_already_present():
    fdb = _fresh_db()
    fdb.users.insert_one({"email": "someone@else.com", "role": "vendor"})
    dbmod._ensure_demo_users(fdb)
    # Non-empty collection → no demo seeding (avoids clobbering restored data).
    assert fdb.users.find_one({"email": "admin@authentiq.com"}) is None
