from pymongo import MongoClient

client = MongoClient('mongodb://localhost:27017')
db = client['authentiq']
products = list(db.products.find({}))
print(f"Total products: {len(products)}")
for p in products:
    print("Product:", p.get("name"), p.get("_id"))
    if "reference_images" in p:
        for img in p["reference_images"]:
            print("  Image view_type:", img.get("view_type"))
