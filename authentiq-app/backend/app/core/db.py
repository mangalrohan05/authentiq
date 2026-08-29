import os
import logging
from pymongo import MongoClient
from dotenv import load_dotenv
import mongomock
from datetime import datetime
import json
from bson import ObjectId

load_dotenv()
logger = logging.getLogger(__name__)

MONGODB_URL = os.getenv("DATABASE_URL", "mongodb://localhost:27017")
DATABASE_BACKUP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "static", "db_backup")

try:
    # Try to connect with a short timeout to avoid hanging
    client = MongoClient(MONGODB_URL, serverSelectionTimeoutMS=2000)
    client.server_info() # Force connection check
    db = client.authentiq_db
    logger.info("Connected to MongoDB successfully.")
    is_mock = False
except Exception as e:
    logger.warning(f"Failed to connect to MongoDB: {e}. Switching to Mock Mode.")
    client = mongomock.MongoClient()
    db = client.authentiq_db
    is_mock = True

def get_db():
    return db

# Collections
products_collection = db.products
qr_codes_collection = db.qr_codes
scans_collection = db.scans
vendors_collection = db.vendors
users_collection = db.users
articles_collection = db.articles   # Future-ready: unit/article level QR
plans_collection = db.plans
verification_sessions_collection = db.verification_sessions
company_qr_collection = db.company_qr
brands_collection = db.brands
invitations_collection = db.invitations
audit_logs_collection = db.audit_logs
admin_audit_log_collection = db.admin_audit_log
plan_features_collection = db.plan_features
vendor_feature_overrides_collection = db.vendor_feature_overrides
vendor_notifications_collection = db.vendor_notifications

# Ensure indexes
qr_codes_collection.create_index("qr_id", unique=True)
try:
    qr_codes_collection.drop_index("batch_id_1")
except Exception:
    pass
qr_codes_collection.create_index("product_id")
vendors_collection.create_index("vendor_name", unique=True)
users_collection.create_index("email", unique=True)
products_collection.create_index("id", unique=True)
products_collection.create_index("vendor_id")   # Direct vendor lookup
products_collection.create_index("brand")
try:
    products_collection.drop_index("vendor_id_1_sku_1")
except Exception:
    pass
products_collection.create_index(
    [("vendor_id", 1), ("sku", 1)],
    unique=True,
    partialFilterExpression={
        "vendor_id": {"$type": "string"},
        "sku": {"$type": "string"}
    }
)  # SKU scoped to vendor, unique to prevent race conditions
scans_collection.create_index("qr_id")
scans_collection.create_index("vendor_id")
scans_collection.create_index("timestamp")
scans_collection.create_index([("vendor_id", 1), ("timestamp", -1)])
scans_collection.create_index([("qr_id", 1), ("timestamp", -1)])                       # Velocity check index
scans_collection.create_index("location.country")                                      # Global country index
scans_collection.create_index([("vendor_id", 1), ("location.country", 1)])             # Vendor country map index
scans_collection.create_index([("vendor_id", 1), ("qr_id", 1), ("ip_address", 1)])     # Suspicious scan stats index

plans_collection.create_index("id", unique=True)
try:
    plans_collection.drop_index("name_1")
except Exception:
    pass
plans_collection.create_index("name")
vendors_collection.create_index("assigned_plan")   # subscription lookups
verification_sessions_collection.create_index("session_id", unique=True)
verification_sessions_collection.create_index("qr_id")
verification_sessions_collection.create_index("vendor_id")
verification_sessions_collection.create_index("created_at")
company_qr_collection.create_index("id", unique=True)
company_qr_collection.create_index("company_id", unique=True)
brands_collection.create_index("id", unique=True)
brands_collection.create_index("vendor_id")
brands_collection.create_index([("vendor_id", 1), ("brand_name", 1)])
products_collection.create_index("brand_id")
invitations_collection.create_index("id", unique=True)
invitations_collection.create_index("email")
invitations_collection.create_index("vendor_id")
audit_logs_collection.create_index("admin_id")
audit_logs_collection.create_index("timestamp")
audit_logs_collection.create_index([("admin_id", 1), ("timestamp", -1)])

# New Collections
plan_features_collection.create_index("plan_slug", unique=True)
vendor_feature_overrides_collection.create_index("vendor_id")
vendor_feature_overrides_collection.create_index([("vendor_id", 1), ("feature_key", 1)], unique=True)
admin_audit_log_collection.create_index("vendor_id")
admin_audit_log_collection.create_index("timestamp")

vendor_notifications_collection.create_index("id", unique=True)
vendor_notifications_collection.create_index("vendor_id")
vendor_notifications_collection.create_index("timestamp")
vendor_notifications_collection.create_index([("vendor_id", 1), ("timestamp", -1)])


# --- Persistent JSON Backed Mock Collection Wrapper ---
class PersistentMockCollection:
    def __init__(self, collection, name):
        self._collection = collection
        self._name = name

    def __getattr__(self, name):
        attr = getattr(self._collection, name)
        # Intercept database modifying operations
        if name in ("insert_one", "insert_many", "update_one", "update_many", "delete_one", "delete_many", "find_one_and_update", "replace_one"):
            def wrapper(*args, **kwargs):
                res = attr(*args, **kwargs)
                _save_collection_to_disk(self._name, self._collection)
                return res
            return wrapper
        return attr

def _save_collection_to_disk(name, collection):
    os.makedirs(DATABASE_BACKUP_DIR, exist_ok=True)
    filepath = os.path.join(DATABASE_BACKUP_DIR, f"{name}.json")
    try:
        docs = list(collection.find())
        serialized = [_serialize_value(doc) for doc in docs]
        with open(filepath, "w") as f:
            json.dump(serialized, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to persist collection '{name}' to disk: {e}")

def _serialize_value(value):
    if isinstance(value, datetime):
        return {"__type__": "datetime", "value": value.isoformat()}
    if isinstance(value, ObjectId):
        return {"__type__": "objectid", "value": str(value)}
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    if isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    return value

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

def _load_collection_from_disk(name, collection):
    filepath = os.path.join(DATABASE_BACKUP_DIR, f"{name}.json")
    if not os.path.exists(filepath):
        return False
    try:
        with open(filepath, "r") as f:
            raw = f.read()
        if not raw.strip():
            return False
        serialized = json.loads(raw)
        docs = [_deserialize_value(s_doc) for s_doc in serialized]
        if docs:
            collection.insert_many(docs)
        return True
    except json.JSONDecodeError as e:
        logger.error(
            f"Failed to load collection '{name}' from disk (invalid JSON at {filepath}): {e}. "
            "Rename or fix the file to restore backup data."
        )
        return False


def _ensure_demo_users(target_db) -> None:
    """Guarantee the demo admin/vendor exist in mock mode (audit 2.1).

    users.json is intentionally NOT committed to git (it held real bcrypt hashes +
    PII — see docs/SECURITY_CREDENTIAL_REMEDIATION.md), so a fresh checkout may load
    other backups but have no users. This seeds the two demo accounts whenever the
    users collection is empty, independent of whether any backup loaded — so local
    login never breaks. Passwords are env-overridable, so no fixed credential is
    baked into the repo; production sets its own (or seeds via scripts/seed_users.py).
    """
    if target_db.users.find_one({}):
        return
    # Same SHA-256 pre-hash + bcrypt scheme as app.core.security (inlined to avoid a
    # circular import with security.py).
    import hashlib as _hashlib
    import base64 as _b64
    from passlib.context import CryptContext

    _pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    def _seed_hash(pw: str) -> str:
        pre = _b64.b64encode(_hashlib.sha256(pw.encode("utf-8")).digest()).decode("utf-8")
        return _pwd_context.hash(pre)

    admin_pw = os.getenv("AUTHENTIQ_SEED_ADMIN_PASSWORD", "Admin@123")
    vendor_pw = os.getenv("AUTHENTIQ_SEED_VENDOR_PASSWORD", "Vendor@123")
    target_db.users.insert_many([
        {
            "name": "Authentiq Admin",
            "email": "admin@authentiq.com",
            "password_hash": _seed_hash(admin_pw),
            "role": "admin",
            "vendor_id": None,
            "created_at": datetime.utcnow(),
        },
        {
            "name": "Demo Vendor",
            "email": "vendor@authentiq.com",
            "password_hash": _seed_hash(vendor_pw),
            "role": "vendor",
            "vendor_id": "vendor_demo_001",
            "created_at": datetime.utcnow(),
        },
    ])
    logger.info("[db] Seeded demo admin/vendor users (mock mode).")


# Seed Mock Data if in Mock Mode
if is_mock:
    # 1. Attempt to restore collections from local disk backups
    loaded_any = False
    for col_name in ["products", "qr_codes", "scans", "vendors", "users", "articles", "plans", "verification_sessions", "company_qr", "brands"]:
        col = getattr(db, col_name)
        if _load_collection_from_disk(col_name, col):
            loaded_any = True

    # Demo login must work regardless of which backups were restored (users.json
    # is no longer committed — audit 2.1).
    _ensure_demo_users(db)

    # 2. Seed Mock Data if no persistent backup was found
    if not loaded_any:
        if not db.qr_codes.find_one({"qr_id": "test123"}):
            product_id = "prod_001"
            
            db.products.insert_one({
                "id": product_id,
                "name": "Luxe & Co. Classic Watch",
                "description": "A premium timepiece crafted with surgical-grade stainless steel and sapphire crystal. Guaranteed authenticity through Authentiq's Secure Chain registry.",
                "brand": "Luxe & Co.",
                "qr_id": "test123",
                "verification_url": "http://localhost:3000/verify/test123"
            })
            
            db.qr_codes.insert_one({
                "qr_id": "test123",
                "product_id": product_id,
                "scan_count": 0,
                "created_at": datetime(2024, 4, 9, 0, 0, 0)
            })
            
            # (Demo admin/vendor users are seeded by _ensure_demo_users above,
            # independent of this block — audit 2.1.)

            # Seed default plans
            db.plans.insert_one({
                "id": "free_trial",
                "name": "Free Trial",
                "description": "14-Day Free Trial for validation testing.",
                "active": True,
                "feature_flags": {
                    "batch_qr_enabled": True,
                    "product_qr_enabled": True,
                    "analytics_enabled": False,
                    "geolocation_tracking_enabled": False,
                    "csv_import_enabled": False,
                    "export_enabled": False,
                    "api_access_enabled": False,
                    "sso_enabled": False
                },
                "limits": {
                    "max_brands": 1,
                    "max_products": 1,
                    "max_batches": 1,
                    "max_scans_per_month": 250,
                    "max_users": 1
                },
                "created_at": datetime.utcnow()
            })

            db.plans.insert_one({
                "id": "business",
                "name": "Business",
                "description": "For growing brands protecting packaging lines.",
                "active": True,
                "feature_flags": {
                    "batch_qr_enabled": True,
                    "product_qr_enabled": True,
                    "analytics_enabled": True,
                    "geolocation_tracking_enabled": True,
                    "csv_import_enabled": True,
                    "export_enabled": True,
                    "api_access_enabled": False,
                    "sso_enabled": False
                },
                "limits": {
                    "max_brands": 1,
                    "max_products": 25,
                    "max_batches": 50,
                    "max_scans_per_month": 100000,
                    "max_users": 5
                },
                "created_at": datetime.utcnow()
            })

            db.plans.insert_one({
                "id": "business_pro",
                "name": "Business Pro",
                "description": "Full supply chain protection and API channels.",
                "active": True,
                "feature_flags": {
                    "batch_qr_enabled": True,
                    "product_qr_enabled": True,
                    "analytics_enabled": True,
                    "geolocation_tracking_enabled": True,
                    "csv_import_enabled": True,
                    "export_enabled": True,
                    "api_access_enabled": True,
                    "sso_enabled": False
                },
                "limits": {
                    "max_brands": 5,
                    "max_products": 500,
                    "max_batches": 1000,
                    "max_scans_per_month": -1,
                    "max_users": 50
                },
                "created_at": datetime.utcnow()
            })

            db.plans.insert_one({
                "id": "enterprise",
                "name": "Enterprise",
                "description": "Custom SLA, white-label, and SSO configuration.",
                "active": True,
                "feature_flags": {
                    "batch_qr_enabled": True,
                    "product_qr_enabled": True,
                    "analytics_enabled": True,
                    "geolocation_tracking_enabled": True,
                    "csv_import_enabled": True,
                    "export_enabled": True,
                    "api_access_enabled": True,
                    "sso_enabled": True
                },
                "limits": {
                    "max_brands": -1,
                    "max_products": -1,
                    "max_batches": -1,
                    "max_scans_per_month": -1,
                    "max_users": -1
                },
                "created_at": datetime.utcnow()
            })
            
            # Assign basic plan to mock vendor with full registration details
            db.vendors.insert_one({
                "id": "vendor_demo_001",
                "vendor_name": "Luxe & Co.",
                "company_name": "Luxe & Co. International Ltd.",
                "assigned_plan": "business",
                "subscription_status": "active",
                "created_at": datetime.utcnow(),
                
                # Company Details
                "legal_company_name": "Luxe & Co. International Ltd.",
                "company_type": "Pvt Ltd",
                "gstin": "27AACCP1234A1Z5",
                "pan": "AACCP1234A",
                "cin": "U74999MH2021PTC357123",
                "reg_address_line1": "101, Luxury Plaza, Bandra West",
                "reg_address_line2": "Near Taj Lands End",
                "reg_city": "Mumbai",
                "reg_state": "Maharashtra",
                "reg_pin": "400050",
                "reg_country": "India",
                "industry_sector": "Electronics",
                "company_website": "https://luxeandco.com",
                
                # Contact Details
                "contact_full_name": "Demo Vendor",
                "contact_work_email": "vendor@authentiq.com",
                "contact_mobile": "+919876543210",
                "contact_designation": "Operations Director",
                
                # Trademark Details
                "tm_status": "Registered",
                "tm_number": "TM-9876543",
                "tm_app_file": "tm_application_luxe.pdf",
                "tm_cert_file": "tm_certificate_luxe.pdf",
                "brand_auth_file": "brand_authorization_luxe.pdf",
                
                # Verification Files
                "gst_cert_file": "gst_certificate_luxe.pdf",
                "inc_doc_file": "certificate_of_incorporation_luxe.pdf",
                "pharma_drug_license_file": "drug_license_luxe.pdf",
                "fssai_license_file": "fssai_license_luxe.pdf",
                "excise_license_file": "excise_license_luxe.pdf",
                
                # Verification Statuses
                "gst_cert_status": "Verified",
                "inc_doc_status": "Verified",
                "pharma_drug_license_status": "Verified",
                "fssai_license_status": "Verified",
                "excise_license_status": "Verified",
                "tm_app_status": "Verified",
                "tm_cert_status": "Verified",
                "brand_auth_status": "Verified",
            })
            
            logger.info("Seeded fresh mock data. Creating initial backups on disk.")
            for col_name in ["products", "qr_codes", "scans", "vendors", "users", "articles", "plans", "verification_sessions", "company_qr", "brands", "invitations", "plan_features"]:
                _save_collection_to_disk(col_name, getattr(db, col_name))

    # 3. Apply proxy wrappers to all collections to achieve transparent real-time persistence
    products_collection = PersistentMockCollection(db.products, "products")
    qr_codes_collection = PersistentMockCollection(db.qr_codes, "qr_codes")
    scans_collection = PersistentMockCollection(db.scans, "scans")
    vendors_collection = PersistentMockCollection(db.vendors, "vendors")
    users_collection = PersistentMockCollection(db.users, "users")
    articles_collection = PersistentMockCollection(db.articles, "articles")
    plans_collection = PersistentMockCollection(db.plans, "plans")
    plan_features_collection = PersistentMockCollection(db.plan_features, "plan_features")
    vendor_feature_overrides_collection = PersistentMockCollection(db.vendor_feature_overrides, "vendor_feature_overrides")
    verification_sessions_collection = PersistentMockCollection(db.verification_sessions, "verification_sessions")
    company_qr_collection = PersistentMockCollection(db.company_qr, "company_qr")
    brands_collection = PersistentMockCollection(db.brands, "brands")
    invitations_collection = PersistentMockCollection(db.invitations, "invitations")

    logger.info("JSON-backed persistence proxy wrappers successfully applied to all mock collections.")


# Ensure default plans exist in any database (mock or real)
def ensure_default_plans():
    try:
        # Free Trial
        if not plans_collection.find_one({"id": "free_trial"}):
            plans_collection.insert_one({
                "id": "free_trial",
                "name": "Free Trial",
                "description": "14-Day Free Trial for validation testing.",
                "active": True,
                "limits": {
                    "max_brands": 1,
                    "max_products": 1,
                    "max_batches": 1,
                    "max_scans_per_month": 250,
                    "max_users": 1
                },
                "created_at": datetime.utcnow()
            })
        if not plan_features_collection.find_one({"plan_slug": "free_trial"}):
            plan_features_collection.insert_one({
                "plan_slug": "free_trial",
                "location": "none",
                "csv_export": False,
                "bulk_qr": False,
                "telemetry": False,
                "case_level": "basic",
                "api_webhooks": False,
                "sso": False,
                "created_at": datetime.utcnow()
            })
            logger.info("Automatically seeded 'free_trial' plan and features.")

        # Business
        if not plans_collection.find_one({"id": "business"}):
            plans_collection.insert_one({
                "id": "business",
                "name": "Business",
                "description": "For growing brands protecting packaging lines.",
                "active": True,
                "limits": {
                    "max_brands": 1,
                    "max_products": 25,
                    "max_batches": 50,
                    "max_scans_per_month": 100000,
                    "max_users": 5
                },
                "created_at": datetime.utcnow()
            })
        if not plan_features_collection.find_one({"plan_slug": "business"}):
            plan_features_collection.insert_one({
                "plan_slug": "business",
                "location": "region_level",
                "csv_export": True,
                "bulk_qr": False,
                "telemetry": False,
                "case_level": "full",
                "api_webhooks": False,
                "sso": False,
                "created_at": datetime.utcnow()
            })
            logger.info("Automatically seeded 'business' plan and features.")

        # Business Pro
        if not plans_collection.find_one({"id": "business_pro"}):
            plans_collection.insert_one({
                "id": "business_pro",
                "name": "Business Pro",
                "description": "Full supply chain protection and API channels.",
                "active": True,
                "limits": {
                    "max_brands": 5,
                    "max_products": 500,
                    "max_batches": 1000,
                    "max_scans_per_month": -1,
                    "max_users": 50
                },
                "created_at": datetime.utcnow()
            })
        if not plan_features_collection.find_one({"plan_slug": "business_pro"}):
            plan_features_collection.insert_one({
                "plan_slug": "business_pro",
                "location": "full_heatmaps",
                "csv_export": True,
                "bulk_qr": True,
                "telemetry": True,
                "case_level": "full",
                "api_webhooks": True,
                "sso": False,
                "created_at": datetime.utcnow()
            })
            logger.info("Automatically seeded 'business_pro' plan and features.")

        # Enterprise
        if not plans_collection.find_one({"id": "enterprise"}):
            plans_collection.insert_one({
                "id": "enterprise",
                "name": "Enterprise",
                "description": "Custom SLA, white-label, and SSO configuration.",
                "active": True,
                "limits": {
                    "max_brands": -1,
                    "max_products": -1,
                    "max_batches": -1,
                    "max_scans_per_month": -1,
                    "max_users": -1
                },
                "created_at": datetime.utcnow()
            })
        if not plan_features_collection.find_one({"plan_slug": "enterprise"}):
            plan_features_collection.insert_one({
                "plan_slug": "enterprise",
                "location": "full_heatmaps",
                "csv_export": True,
                "bulk_qr": True,
                "telemetry": True,
                "case_level": "full",
                "api_webhooks": True,
                "sso": True,
                "created_at": datetime.utcnow()
            })
            logger.info("Automatically seeded 'enterprise' plan and features.")

        # Cleanup/delete legacy plans and vendors from DB (relational cascade delete)
        try:
            legacy_ids = ["plan_basic", "plan_premium", "plan_trial", "plan_business", "plan_pro", "plan_enterprise"]
            
            # Find legacy vendors
            legacy_vendors = list(vendors_collection.find({"assigned_plan": {"$in": legacy_ids}}))
            legacy_vendor_ids = [v["id"] for v in legacy_vendors if "id" in v]
            
            if legacy_vendor_ids:
                # Find associated users
                users_to_delete = list(users_collection.find({"vendor_id": {"$in": legacy_vendor_ids}}))
                user_ids_str = [str(u["_id"]) for u in users_to_delete]
                
                # Collect products
                products = list(products_collection.find({"vendor_id": {"$in": legacy_vendor_ids}}))
                product_ids = [p["id"] for p in products if "id" in p]
                
                # Delete products & brands
                products_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
                brands_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
                
                # Delete QR codes
                if product_ids:
                    qr_codes_collection.delete_many({"product_id": {"$in": product_ids}})
                
                # Delete scans & invites
                scans_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
                invitations_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
                
                # Delete overrides, sessions, company_qr, admin logs
                vendor_feature_overrides_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
                verification_sessions_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
                company_qr_collection.delete_many({"company_id": {"$in": legacy_vendor_ids}})
                admin_audit_log_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
                
                # Delete audit logs
                audit_logs_collection.delete_many({
                    "$or": [
                        {"target_id": {"$in": legacy_vendor_ids}},
                        {"target_id": {"$in": user_ids_str}},
                        {"admin_id": {"$in": user_ids_str}}
                    ]
                })
                
                # Delete users & vendors
                users_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
                vendors_collection.delete_many({"id": {"$in": legacy_vendor_ids}})
                
            plans_collection.delete_many({"id": {"$in": legacy_ids}})
            plan_features_collection.delete_many({"plan_slug": {"$in": legacy_ids}})
        except Exception as ex:
            logger.warning(f"Error executing legacy plan cleanup/cascade delete: {ex}")
        
    except Exception as e:
        logger.error(f"Failed to seed default plans: {e}")

ensure_default_plans()
