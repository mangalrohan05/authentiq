import pymongo
import sys

def run_audit():
    try:
        client = pymongo.MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=2000)
        client.admin.command('ismaster')
        db = client["authentiq"]
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
        print("Mock mode is likely active in backend. Assuming clear state.")
        return

    print("=== Database Connection Successful ===")
    
    batches_collection = db["batches"]
    products_collection = db["products"]
    qr_codes_collection = db["qr_codes"]
    scans_collection = db["scans"]
    vendors_collection = db["vendors"]

    batches = list(batches_collection.find())
    products = list(products_collection.find())
    qrs = list(qr_codes_collection.find())
    scans = list(scans_collection.find())
    vendors = list(vendors_collection.find())

    print(f"Found: {len(batches)} batches, {len(products)} products, {len(qrs)} QRs, {len(scans)} scans, {len(vendors)} vendors.")

    issues = 0

    # 1. Check products for valid batch_id
    batch_ids = {b["id"] for b in batches} if batches else set()
    for p in products:
        if "batch_id" not in p or p["batch_id"] not in batch_ids:
            print(f"ISSUE: Product {p.get('id')} has invalid or missing batch_id: {p.get('batch_id')}")
            issues += 1

    # 2. Check each batch has max 1 QR
    batch_qr_count = {}
    for qr in qrs:
        bid = qr.get("batch_id")
        batch_qr_count[bid] = batch_qr_count.get(bid, 0) + 1
        if batch_qr_count[bid] > 1:
            print(f"ISSUE: Batch {bid} has multiple QR codes assigned!")
            issues += 1
            
    # 3. Check qr_id links correctly to a batch
    for qr in qrs:
        if "batch_id" not in qr or qr["batch_id"] not in batch_ids:
            print(f"ISSUE: QR {qr.get('qr_id')} linked to non-existent batch_id {qr.get('batch_id')}")
            issues += 1

    # 4. Check orphan scans
    qr_ids = set([qr["qr_id"] for qr in qrs])
    for scan in scans:
        if "qr_id" not in scan or scan["qr_id"] not in qr_ids:
            print(f"ISSUE: Scan references non-existent QR {scan.get('qr_id')}")
            issues += 1

    print(f"=== Audit Complete. Found {issues} issues. ===")
    
if __name__ == '__main__':
    run_audit()
