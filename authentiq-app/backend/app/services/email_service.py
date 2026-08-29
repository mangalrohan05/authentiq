"""
Email delivery for password reset and notifications.

Production: wire SMTP or SendGrid via env vars.
Development: logs reset links to stdout.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
SMTP_ENABLED = os.getenv("SMTP_ENABLED", "").lower() in ("1", "true", "yes")


def send_password_reset_email(to_email: str, reset_token: str) -> bool:
    """
    Send password reset link. Returns True if sent (or logged in dev).
    """
    reset_url = f"{FRONTEND_BASE_URL}/vendor/reset-password?token={reset_token}"
    subject = "Authentiq — Reset your password"
    body = (
        f"You requested a password reset for your Authentiq vendor account.\n\n"
        f"Reset your password here (expires in 1 hour):\n{reset_url}\n\n"
        f"If you did not request this, ignore this email.\n"
    )

    if SMTP_ENABLED:
        # TODO: integrate SMTP / SendGrid / SES
        logger.warning(
            "[Email] SMTP_ENABLED is set but no provider is configured. "
            "Implement send via your mail provider in email_service.py"
        )

    logger.info(
        "[Email][DEV] Password reset for %s\n  Link: %s\n  Subject: %s",
        to_email,
        reset_url,
        subject,
    )
    print(f"\n[Authentiq DEV] Password reset link for {to_email}:\n  {reset_url}\n")
    return True


async def send_user_creation_email(
    to_email: str,
    name: str,
    password: str,
    vendor_id: str
) -> bool:
    """
    Send user creation email with credentials and activation link.
    Returns True if sent (or logged in dev).
    """
    activation_url = f"{FRONTEND_BASE_URL}/vendor/activate-account?email={to_email}"
    subject = "Authentiq — Your account has been created"
    body = (
        f"Hello {name},\n\n"
        f"Your Authentiq vendor account has been created.\n\n"
        f"Login credentials:\n"
        f"Email: {to_email}\n"
        f"Password: {password}\n\n"
        f"Please activate your account and change your password here:\n{activation_url}\n\n"
        f"If you did not request this account creation, please contact your administrator.\n"
    )

    if SMTP_ENABLED:
        # TODO: integrate SMTP / SendGrid / SES
        logger.warning(
            "[Email] SMTP_ENABLED is set but no provider is configured. "
            "Implement send via your mail provider in email_service.py"
        )

    logger.info(
        "[Email][DEV] User creation for %s\n  Name: %s\n  Activation Link: %s\n  Subject: %s",
        to_email,
        name,
        activation_url,
        subject,
    )
    print(f"\n[Authentiq DEV] User creation email for {to_email}:\n  Name: {name}\n  Password: {password}\n  Activation Link: {activation_url}\n")
    return True
