from datetime import datetime
import uuid
from .db import audit_logs_collection, vendor_notifications_collection


def log_admin_action(
    admin_id: str,
    admin_email: str,
    action: str,
    target_type: str,
    target_id: str,
    details: dict = None,
    ip_address: str = None
):
    """
    Log an admin action to the audit logs collection.
    
    Args:
        admin_id: The ID of the admin performing the action
        admin_email: The email of the admin performing the action
        action: The action performed (e.g., "user_status_changed", "password_reset", "vendor_created")
        target_type: The type of target (e.g., "user", "vendor", "batch")
        target_id: The ID of the target
        details: Additional details about the action (optional)
        ip_address: The IP address of the admin (optional)
    """
    try:
        audit_log = {
            "admin_id": admin_id,
            "admin_email": admin_email,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "details": details or {},
            "ip_address": ip_address,
            "timestamp": datetime.utcnow(),
            "created_at": datetime.utcnow()
        }
        audit_logs_collection.insert_one(audit_log)
    except Exception as e:
        # Log the error but don't fail the operation
        print(f"Failed to log audit action: {e}")


def log_vendor_action(
    vendor_id: str,
    user_email: str,
    action: str,
    details: dict = None,
    ip_address: str = None
):
    """
    Log a vendor action (operation log) to the vendor_notifications collection.

    Args:
        vendor_id: The ID of the vendor organization
        user_email: The email of the user performing the action
        action: The action title/type (e.g. "Brand Created", "Product Registered")
        details: Additional details containing "description" or other fields
        ip_address: The client's IP address (optional)
    """
    try:
        now = datetime.utcnow()
        notification = {
            "id": str(uuid.uuid4()),
            "vendor_id": vendor_id,
            "type": "vendor_portal",  # maps to "operations" log
            "title": action,
            "description": details.get("description", "") if details else "",
            "user_email": user_email,
            "ip_address": ip_address,
            "timestamp": now,
            "created_at": now
        }
        vendor_notifications_collection.insert_one(notification)

        # Broadcast to frontend so they get a real-time update
        try:
            from app.core.websocket_manager import manager
            # Broadcast the update notification
            # Run asynchronously so it doesn't block the caller
            import asyncio
            asyncio.create_task(manager.broadcast({
                "type": "notification_update",
                "vendor_id": vendor_id
            }))
        except Exception:
            pass
    except Exception as e:
        print(f"Failed to log vendor action: {e}")


def log_vendor_error(
    vendor_id: str,
    user_email: str,
    error_title: str,
    error_details: str = None,
    product_id: str = None,
    ip_address: str = None
):
    """
    Log a vendor error (background task failures) to the vendor_notifications collection.

    Args:
        vendor_id: The ID of the vendor organization
        user_email: The email of the user who initiated the task
        error_title: The error title (e.g. "Image Upload Failed")
        error_details: Detailed error message
        product_id: Optional product ID related to the error
        ip_address: The client's IP address (optional)
    """
    try:
        now = datetime.utcnow()
        notification = {
            "id": str(uuid.uuid4()),
            "vendor_id": vendor_id,
            "type": "warning",  # maps to "Security Alerts" filter for visibility
            "title": error_title,
            "description": error_details or "",
            "user_email": user_email,
            "product_id": product_id,
            "ip_address": ip_address,
            "timestamp": now,
            "created_at": now
        }
        vendor_notifications_collection.insert_one(notification)

        # Broadcast to frontend so they get a real-time update
        try:
            from app.core.websocket_manager import manager
            import asyncio
            asyncio.create_task(manager.broadcast({
                "type": "notification_update",
                "vendor_id": vendor_id
            }))
        except Exception:
            pass
    except Exception as e:
        print(f"Failed to log vendor error: {e}")

