"""Password-hashing migration/regression tests (audit item 2.3).

Locks in the backward-compatible dual-scheme `verify_password` so the SHA-256
pre-hash change can never again lock existing users out:
  * legacy raw-bcrypt hashes (pre-migration) still verify,
  * new SHA-256-pre-hash + bcrypt hashes verify,
  * wrong passwords are rejected under both schemes,
  * bcrypt's 72-byte truncation is neutralised by the pre-hash.
Pure-logic: no DB/network.
"""

from __future__ import annotations

from app.core.security import (
    _prehash_password,
    get_password_hash,
    pwd_context,
    verify_password,
)


def test_new_scheme_roundtrip():
    h = get_password_hash("S3cure!Pass")
    assert verify_password("S3cure!Pass", h) is True
    assert verify_password("wrong", h) is False


def test_legacy_raw_bcrypt_hash_still_verifies():
    # A hash created BEFORE pre-hashing existed: bcrypt of the raw password.
    legacy_hash = pwd_context.hash("OldPassword123")
    # New verify_password must still accept it (no forced reset for existing users).
    assert verify_password("OldPassword123", legacy_hash) is True
    assert verify_password("OldPassword124", legacy_hash) is False


def test_new_hash_is_prehashed_not_raw_bcrypt():
    # A new hash must verify against the pre-hashed input, not the raw password
    # under a plain bcrypt context — proving the pre-hash path is actually used.
    h = get_password_hash("hunter2")
    assert pwd_context.verify(_prehash_password("hunter2"), h) is True


def test_over_72_byte_passwords_are_disambiguated():
    # bcrypt truncates at 72 bytes; two passwords sharing the first 72 bytes would
    # collide under raw bcrypt. The SHA-256 pre-hash must keep them distinct.
    p1 = "A" * 72 + "aaa"
    p2 = "A" * 72 + "bbb"
    h1 = get_password_hash(p1)
    assert verify_password(p1, h1) is True
    assert verify_password(p2, h1) is False


def test_verify_is_robust_to_garbage_hash():
    # A malformed stored hash must return False, never raise.
    assert verify_password("anything", "not-a-real-bcrypt-hash") is False
