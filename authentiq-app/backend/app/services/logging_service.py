import logging
from datetime import datetime
from app.core.db import scans_collection, products_collection

logger = logging.getLogger(__name__)

def log_product_activity(action: str, product_name: str, vendor_id: str, location: str = "Local, System", product_id: str = None, user_email: str = None):
    """
    Verifies the action type before writing to the feed.
    If action == 'DELETE', execute only the deletion log.
    If action == 'ADD', execute only the addition log.
    """
    now = datetime.utcnow()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")

    # Map the location if it is the legacy "System Panel, Registry" to the requested "Local, System" for consistent logging
    place_str = "Local, System" if location in ("System Panel, Registry", "Local, System") else location

    # Perform a database lookup using the product's unique ID
    retrieved_name = "Unknown Product"
    if product_id:
        product = products_collection.find_one({"id": product_id})
        if product:
            retrieved_name = product.get("name", "Unknown Product")
    else:
        retrieved_name = product_name or "Unknown Product"

    if action == 'DELETE':
        activity_str = f"Product Deleted: {retrieved_name}"
        scans_collection.insert_one({
            "event_type": "Product Deleted",
            "product_name": retrieved_name,
            "product_id": product_id,
            "location": place_str,
            "timestamp": now,
            "status": "success",
            "vendor_id": vendor_id,
            "user_email": user_email
        })
        log_msg = f"[{activity_str}, {date_str}, {time_str}, {place_str}]"
        logger.info(log_msg)
    elif action == 'ADD':
        activity_str = f"Product Added: {retrieved_name}"
        scans_collection.insert_one({
            "event_type": "Product Added",
            "product_name": retrieved_name,
            "product_id": product_id,
            "location": place_str,
            "timestamp": now,
            "status": "success",
            "vendor_id": vendor_id,
            "user_email": user_email
        })
        log_msg = f"[{activity_str}, {date_str}, {time_str}, {place_str}]"
        logger.info(log_msg)

