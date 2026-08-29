import os
import sys

# Ensure backend directory is in path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.db import (
    vendors_collection,
    users_collection,
    products_collection,
    brands_collection,
    qr_codes_collection,
    scans_collection,
    invitations_collection,
    vendor_feature_overrides_collection,
    verification_sessions_collection,
    company_qr_collection,
    audit_logs_collection,
    admin_audit_log_collection,
    plans_collection,
    plan_features_collection
)

def purge():
    print("Starting legacy plan database purge...")
    
    # 4 active plans
    active_plans = ["free_trial", "business", "business_pro", "enterprise"]
    
    # 1. Find all vendors with legacy plan IDs (assigned_plan not in active_plans)
    legacy_vendors = list(vendors_collection.find({"assigned_plan": {"$nin": active_plans}}))
    legacy_vendor_ids = [v["id"] for v in legacy_vendors if "id" in v]
    
    print(f"Found {len(legacy_vendors)} legacy vendors: {legacy_vendor_ids}")
    
    # Cascade delete on those users and vendors
    if legacy_vendor_ids:
        # Get users belonging to these vendors
        users_to_delete = list(users_collection.find({"vendor_id": {"$in": legacy_vendor_ids}}))
        user_ids_str = [str(u["_id"]) for u in users_to_delete]
        print(f"Found {len(users_to_delete)} users associated with legacy plans/vendors: {user_ids_str}")
        
        # Products
        products = list(products_collection.find({"vendor_id": {"$in": legacy_vendor_ids}}))
        product_ids = [p["id"] for p in products if "id" in p]
        
        # Delete products
        prod_res = products_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
        print(f"Deleted {prod_res.deleted_count} products.")
        
        # Brands
        brands_res = brands_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
        print(f"Deleted {brands_res.deleted_count} brands.")
        
        # QR Codes (linked to products via product_id)
        if product_ids:
            qr_res = qr_codes_collection.delete_many({"product_id": {"$in": product_ids}})
            print(f"Deleted {qr_res.deleted_count} QR codes.")
        else:
            print("No product-linked QR codes to delete.")
            
        # Scans
        scans_res = scans_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
        print(f"Deleted {scans_res.deleted_count} scans.")
        
        # Invitations
        inv_res = invitations_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
        print(f"Deleted {inv_res.deleted_count} invitations.")
        
        # Vendor Feature Overrides
        overrides_res = vendor_feature_overrides_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
        print(f"Deleted {overrides_res.deleted_count} feature overrides.")
        
        # Verification Sessions
        sessions_res = verification_sessions_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
        print(f"Deleted {sessions_res.deleted_count} verification sessions.")
        
        # Company QR
        company_qr_res = company_qr_collection.delete_many({"company_id": {"$in": legacy_vendor_ids}})
        print(f"Deleted {company_qr_res.deleted_count} company QR codes.")
        
        # Admin audit logs
        admin_audit_res = admin_audit_log_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
        print(f"Deleted {admin_audit_res.deleted_count} admin audit logs.")
        
        # General audit logs
        audit_log_query = {
            "$or": [
                {"target_id": {"$in": legacy_vendor_ids}},
                {"target_id": {"$in": user_ids_str}},
                {"admin_id": {"$in": user_ids_str}}
            ]
        }
        audit_res = audit_logs_collection.delete_many(audit_log_query)
        print(f"Deleted {audit_res.deleted_count} audit logs.")
        
        # Delete users
        users_res = users_collection.delete_many({"vendor_id": {"$in": legacy_vendor_ids}})
        print(f"Deleted {users_res.deleted_count} users.")
        
        # Delete vendors
        vendors_res = vendors_collection.delete_many({"id": {"$in": legacy_vendor_ids}})
        print(f"Deleted {vendors_res.deleted_count} vendors.")
    else:
        print("No legacy vendors/users found to purge.")
        
    # Finally, delete the legacy plans from the Plans collection and plan_features
    legacy_plan_ids = ["plan_basic", "plan_premium", "plan_trial", "plan_business", "plan_pro", "plan_enterprise"]
    plans_res = plans_collection.delete_many({"id": {"$in": legacy_plan_ids}})
    features_res = plan_features_collection.delete_many({"plan_slug": {"$in": legacy_plan_ids}})
    print(f"Deleted {plans_res.deleted_count} legacy plans from plans collection.")
    print(f"Deleted {features_res.deleted_count} legacy plan features from plan_features collection.")
    print("Purge completed successfully.")

if __name__ == "__main__":
    purge()
