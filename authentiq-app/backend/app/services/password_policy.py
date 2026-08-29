"""Password strength validation for vendor account security."""

from __future__ import annotations

import re
from typing import List, Tuple


def password_strength_score(password: str) -> int:
    """0–4 score for UI indicator."""
    if not password:
        return 0
    score = 0
    if len(password) >= 8:
        score += 1
    if len(password) >= 12:
        score += 1
    if re.search(r"[A-Z]", password) and re.search(r"[a-z]", password):
        score += 1
    if re.search(r"\d", password):
        score += 1
    if re.search(r"[^A-Za-z0-9]", password):
        score += 1
    return min(score, 4)


def validate_password_strength(password: str) -> Tuple[bool, List[str]]:
    errors: List[str] = []
    if len(password) < 8:
        errors.append("Password must be at least 8 characters.")
    if not re.search(r"[A-Za-z]", password):
        errors.append("Password must include at least one letter.")
    if not re.search(r"\d", password):
        errors.append("Password must include at least one number.")
    return (len(errors) == 0, errors)
