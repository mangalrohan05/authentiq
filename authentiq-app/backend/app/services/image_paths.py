"""Filesystem path helpers for stored reference/upload URLs."""

from __future__ import annotations

import os

BACKEND_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), os.pardir, os.pardir)
)


def resolve_image_fs_path(url_or_path: str) -> str:
    """Map stored URL (/static/...) or relative path to an absolute filesystem path."""
    if not url_or_path:
        return ""
    path = url_or_path.lstrip("/")
    if os.path.isabs(path) and os.path.exists(path):
        return path
    return os.path.join(BACKEND_ROOT, path)
