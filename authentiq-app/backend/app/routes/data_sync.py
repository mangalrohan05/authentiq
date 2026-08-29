from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from app.core.security import get_current_vendor, require_permission
from app.core.db import products_collection, vendors_collection, scans_collection
from app.services.feature_resolver import resolve_vendor_features
import pandas as pd
from io import BytesIO, StringIO
from datetime import datetime
import uuid

router = APIRouter()

async def _verify_sync_permission(vendor_id: str, action: str):
    vendor = vendors_collection.find_one({"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=403, detail="Vendor brand context not found")
        
    if vendor.get("subscription_status") != "active":
        raise HTTPException(status_code=403, detail="Subscription is inactive or suspended")
        
    features = await resolve_vendor_features(vendor_id)
    if action in ["import", "export"] and not features.csv_export:
        raise HTTPException(status_code=403, detail="Your current plan does not support bulk CSV/Excel imports and exports.")


@router.post("/import/products")
async def import_products(
    file: UploadFile = File(...),
    product_id: str = Form(None),   # Now accepts product_id (product-first)
    batch_id: str = Form(None),     # Kept for backward compatibility
    current_user: dict = Depends(require_permission("SKU_CREATE"))
):
    """Vendor-only: Bulk import products via CSV or XLSX (product-first architecture)."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="Invalid vendor context")
        
    await _verify_sync_permission(vendor_id, "import")

    filename = file.filename.lower()
    if not (filename.endswith(".csv") or filename.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Only .csv and .xlsx files are supported")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Limit is 10MB.")

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(BytesIO(content))
        else:
            df = pd.read_excel(BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")

    expected_headers = ['Product Name *', 'Description', 'SKU', 'Category', 'MRP (₹) *', 'HSN Code *', 'Manufacturer Name *', 'Manufacturer Address *', 'Barcode', 'Country of Origin', 'Variant Name', 'Pack Size']
    if list(df.columns) != expected_headers:
        raise HTTPException(status_code=400, detail="Error: Wrong template used. Please use the standardized template.")

    df.columns = ["name", "description", "sku", "category", "mrp", "hsn_code", "manufacturer_name", "manufacturer_address", "barcode", "country_of_origin", "variant_name", "pack_size"]

    # Verify ownership of the explicitly provided product
    if product_id:
        product = products_collection.find_one({"id": product_id, "vendor_id": vendor_id})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found or access denied")

    # Get the first brand for the vendor to use as default
    from app.core.db import brands_collection
    first_brand = brands_collection.find_one({"vendor_id": vendor_id, "status": "active"})
    default_brand = first_brand.get("brand_name", "") if first_brand else ""

    products_to_insert = []
    success_count = 0
    errors = []
    product_cache = {}  # Cache: sku/name -> product_id

    # Pre-fetch existing SKUs
    existing_skus = set(
        p["sku"] for p in products_collection.find(
            {"vendor_id": vendor_id, "sku": {"$exists": True, "$ne": None}},
            {"sku": 1}
        ) if p.get("sku")
    )
    seen_skus = set()

    for index, row in df.iterrows():
        row_num = index + 2

        name = str(row.get("name", "")).strip()
        brand = str(row.get("brand", "")).strip()
        desc = str(row.get("description", "")).strip() if "description" in df.columns else ""
        if desc.lower() == "nan": desc = ""

        if not name or name.lower() == "nan":
            errors.append({"row": row_num, "reason": "Missing required field: Product Name"})
            continue

        # Set default brand to first brand if not provided
        brand = default_brand

        # Validate mandatory regulatory fields
        mrp = str(row.get("mrp", "")).strip() if "mrp" in df.columns else ""
        if not mrp or mrp.lower() == "nan":
            errors.append({"row": row_num, "reason": "Missing required field: MRP (₹)"})
            continue
        try:
            mrp_value = float(mrp)
            if mrp_value <= 0:
                errors.append({"row": row_num, "reason": "MRP must be greater than 0"})
                continue
        except ValueError:
            errors.append({"row": row_num, "reason": "MRP must be a valid number"})
            continue

        hsn_code = str(row.get("hsn_code", "")).strip() if "hsn_code" in df.columns else ""
        if not hsn_code or hsn_code.lower() == "nan":
            errors.append({"row": row_num, "reason": "Missing required field: HSN Code"})
            continue
        # Validate HSN code is numeric
        if not hsn_code.isdigit():
            errors.append({"row": row_num, "reason": "HSN Code must be a number"})
            continue

        manufacturer_name = str(row.get("manufacturer_name", "")).strip() if "manufacturer_name" in df.columns else ""
        if not manufacturer_name or manufacturer_name.lower() == "nan":
            errors.append({"row": row_num, "reason": "Missing required field: Manufacturer Name"})
            continue

        manufacturer_address = str(row.get("manufacturer_address", "")).strip() if "manufacturer_address" in df.columns else ""
        if not manufacturer_address or manufacturer_address.lower() == "nan":
            errors.append({"row": row_num, "reason": "Missing required field: Manufacturer Address"})
            continue

        sku = str(row.get("sku", "")).strip() if "sku" in df.columns else ""
        serial_number = str(row.get("serial_number", "")).strip() if "serial_number" in df.columns else ""
        if serial_number.lower() == "nan": serial_number = ""
        category = str(row.get("category", "")).strip() if "category" in df.columns else ""
        if category.lower() == "nan" or not category: category = "Other"

        # Set country to India by default if empty
        country_of_origin = str(row.get("country_of_origin", "")).strip() if "country_of_origin" in df.columns else ""
        if country_of_origin.lower() == "nan" or not country_of_origin: country_of_origin = "India"

        # Generate unique SKU from product name if empty
        if not sku or sku.lower() == "nan":
            # Generate SKU from product name: take first 3 letters of each word, uppercase, and add random suffix
            words = name.split()
            sku_prefix = "".join([word[:3].upper() for word in words[:3] if len(word) >= 3])
            if not sku_prefix:
                sku_prefix = name[:6].upper()
            import random
            sku_suffix = "".join([str(random.randint(0, 9)) for _ in range(4)])
            sku = f"{sku_prefix}{sku_suffix}"

        # SKU uniqueness validation
        if sku:
            if sku in existing_skus or sku in seen_skus:
                errors.append({"row": row_num, "reason": f"Duplicate SKU: {sku}"})
                continue
            seen_skus.add(sku)

        # ── Product-first resolution ────────────────────────────────────────────
        row_product_id = product_id

        if not row_product_id:
            # Try to resolve from sku or product_name column in the file
            lookup_key = sku or name
            if lookup_key in product_cache:
                row_product_id = product_cache[lookup_key]
            else:
                # Find existing product by SKU or name+brand
                existing_product = None
                if sku:
                    existing_product = products_collection.find_one({"vendor_id": vendor_id, "sku": sku})
                if not existing_product:
                    existing_product = products_collection.find_one({"vendor_id": vendor_id, "name": name, "brand": brand})

                if existing_product:
                    row_product_id = existing_product["id"]
                else:
                    # Auto-create product
                    new_product_id = str(uuid.uuid4())
                    products_collection.insert_one({
                        "id": new_product_id,
                        "vendor_id": vendor_id,
                        "name": name,
                        "brand": brand,
                        "description": desc,
                        "sku": sku if sku else None,
                        "serial_number": serial_number if serial_number else None,
                        "category": category if category else None,
                        "mrp": mrp_value if mrp_value else None,
                        "hsn_code": hsn_code if hsn_code else None,
                        "manufacturer_name": manufacturer_name if manufacturer_name else None,
                        "manufacturer_address": manufacturer_address if manufacturer_address else None,
                        "barcode": str(row.get("barcode", "")).strip() if "barcode" in df.columns else None,
                        "country_of_origin": str(row.get("country_of_origin", "")).strip() if "country_of_origin" in df.columns else None,
                        "variant_name": str(row.get("variant_name", "")).strip() if "variant_name" in df.columns else None,
                        "pack_size": str(row.get("pack_size", "")).strip() if "pack_size" in df.columns else None,
                        "timestamp": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    })
                    # Log activity for auto-created product
                    try:
                        from app.services.logging_service import log_product_activity
                        log_product_activity(action="ADD", product_name=name, vendor_id=vendor_id, user_email=current_user.get("email"))
                    except Exception as e:
                        pass
                    row_product_id = new_product_id
                product_cache[lookup_key] = row_product_id

        # ── Insert product if it was provided by form (not auto-created above) ──
        if product_id:
            new_pid = str(uuid.uuid4())
            products_to_insert.append({
                "id": new_pid,
                "vendor_id": vendor_id,
                "name": name,
                "brand": brand,
                "description": desc,
                "sku": sku if sku else None,
                "serial_number": serial_number if serial_number else None,
                "category": category if category else None,
                "mrp": mrp_value if mrp_value else None,
                "hsn_code": hsn_code if hsn_code else None,
                "manufacturer_name": manufacturer_name if manufacturer_name else None,
                "manufacturer_address": manufacturer_address if manufacturer_address else None,
                "barcode": str(row.get("barcode", "")).strip() if "barcode" in df.columns else None,
                "country_of_origin": str(row.get("country_of_origin", "")).strip() if "country_of_origin" in df.columns else None,
                "variant_name": str(row.get("variant_name", "")).strip() if "variant_name" in df.columns else None,
                "pack_size": str(row.get("pack_size", "")).strip() if "pack_size" in df.columns else None,
                "timestamp": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            })
        success_count += 1

    if products_to_insert:
        products_collection.insert_many(products_to_insert)
        # Log activity for product additions
        try:
            from app.services.logging_service import log_product_activity
            for p in products_to_insert:
                log_product_activity(action="ADD", product_name=p.get("name", ""), vendor_id=vendor_id, user_email=current_user.get("email"))
        except Exception as e:
            pass

    return {
        "success": True,
        "total_processed": len(df),
        "success_count": success_count,
        "error_count": len(errors),
        "errors": errors[:50]
    }


@router.get("/export/products")
async def export_products(format: str = "csv", current_user: dict = Depends(require_permission("ANALYTICS_VIEW"))):
    """Vendor-only: Export all products to CSV or Excel."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="Invalid vendor context")
    await _verify_sync_permission(vendor_id, "export")
    products = list(products_collection.find({"vendor_id": vendor_id, "deleted": {"$ne": True}, "status": {"$ne": "deleted"}, "archived": {"$ne": True}}, {"_id": 0}))

    csv_data = []
    for p in products:
        csv_data.append({
            "Product Name *": p.get("name", ""),
            "Description": p.get("description", ""),
            "SKU": p.get("sku", ""),
            "Category": p.get("category", ""),
            "MRP (₹) *": p.get("mrp", ""),
            "HSN Code *": p.get("hsn_code", ""),
            "Manufacturer Name *": p.get("manufacturer_name", ""),
            "Manufacturer Address *": p.get("manufacturer_address", ""),
            "Barcode": p.get("barcode", ""),
            "Country of Origin": p.get("country_of_origin", ""),
            "Variant Name": p.get("variant_name", ""),
            "Pack Size": p.get("pack_size", "")
        })

    df = pd.DataFrame(csv_data)

    if format == "excel":
        stream = BytesIO()
        with pd.ExcelWriter(stream, engine="openpyxl") as writer:
            df.to_excel(writer, index=False)
        stream.seek(0)
        response = StreamingResponse(iter([stream.getvalue()]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response.headers["Content-Disposition"] = f"attachment; filename=products_export_{datetime.utcnow().strftime('%Y%m%d%H%M')}.xlsx"
    else:
        stream = StringIO()
        df.to_csv(stream, index=False)
        response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename=products_export_{datetime.utcnow().strftime('%Y%m%d%H%M')}.csv"

    return response


@router.get("/import/template/csv")
async def get_csv_template(current_user: dict = Depends(require_permission("SKU_CREATE"))):
    """Generate a downloadable CSV template for product-first imports."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="Invalid vendor context")
    await _verify_sync_permission(vendor_id, "import")
    df = pd.DataFrame(columns=["Product Name *", "Description", "SKU", "Category", "MRP (₹) *", "HSN Code *", "Manufacturer Name *", "Manufacturer Address *", "Barcode", "Country of Origin", "Variant Name", "Pack Size"])
    df.loc[0] = ["Premium Watch", "Sapphire crystal watch", "WATCH-001", "Accessories", "2500.00", "9101", "Luxe Watch Co.", "123 Watch Street, Geneva", "8901234567890", "India", "Gold Edition", "1 Unit"]
    df.loc[1] = ["Leather Wallet", "Genuine leather bifold", "WAL-002", "Accessories", "850.00", "4202", "Luxe Leather Works", "456 Leather Lane, Milan", "8901234567891", "India", "Black Classic", "1 Unit"]

    stream = StringIO()
    df.to_csv(stream, index=False)
    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=authentiq_import_template.csv"
    return response


@router.get("/import/template/excel")
async def get_excel_template(current_user: dict = Depends(require_permission("SKU_CREATE"))):
    """Generate a downloadable Excel template with instructions sheet."""
    vendor_id = current_user.get("vendor_id")
    if not vendor_id:
        raise HTTPException(status_code=403, detail="Invalid vendor context")
    await _verify_sync_permission(vendor_id, "import")
    df = pd.DataFrame(columns=["Product Name *", "Description", "SKU", "Category", "MRP (₹) *", "HSN Code *", "Manufacturer Name *", "Manufacturer Address *", "Barcode", "Country of Origin", "Variant Name", "Pack Size"])
    df.loc[0] = ["Premium Watch", "Sapphire crystal watch", "WATCH-001", "Accessories", "2500.00", "9101", "Luxe Watch Co.", "123 Watch Street, Geneva", "8901234567890", "India", "Gold Edition", "1 Unit"]
    df.loc[1] = ["Leather Wallet", "Genuine leather bifold", "WAL-002", "Accessories", "850.00", "4202", "Luxe Leather Works", "456 Leather Lane, Milan", "8901234567891", "India", "Black Classic", "1 Unit"]

    instructions = pd.DataFrame([
        ["Field", "Required", "Description"],
        ["Product Name *", "Yes", "The product name (mandatory)."],
        ["Description", "No", "Detailed product description."],
        ["SKU", "No", "Unique SKU per vendor. If empty, auto-generated from product name. Duplicates are rejected."],
        ["Category", "No", "Product category (e.g. Electronics, Fashion). Defaults to 'Other' if empty."],
        ["MRP (₹) *", "Yes", "Maximum Retail Price in INR (mandatory, must be > 0)."],
        ["HSN Code *", "Yes", "HSN code for GST classification (mandatory, must be numeric)."],
        ["Manufacturer Name *", "Yes", "Name of the manufacturer (mandatory)."],
        ["Manufacturer Address *", "Yes", "Full manufacturer address (mandatory)."],
        ["Barcode", "No", "EAN-13 / UPC-A barcode."],
        ["Country of Origin", "No", "Country where the product is manufactured. Defaults to 'India' if empty."],
        ["Variant Name", "No", "Product variant name (e.g. Gold Edition)."],
        ["Pack Size", "No", "Pack size (e.g. 1 Unit, 12x200g)."],
    ])

    stream = BytesIO()
    with pd.ExcelWriter(stream, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Upload Template", index=False)
        instructions.to_excel(writer, sheet_name="Instructions", index=False, header=False)

    stream.seek(0)
    response = StreamingResponse(iter([stream.getvalue()]),
                                 media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    response.headers["Content-Disposition"] = "attachment; filename=authentiq_import_template.xlsx"
    return response
