"""Unit tests for security utilities."""

import pytest
from datetime import datetime, timedelta
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    _decode_token,
    TokenData
)


class TestPasswordHashing:
    """Test password hashing and verification."""
    
    def test_hash_password_returns_string(self):
        """Password hashing should return a string."""
        password = "test_password_123"
        hashed = get_password_hash(password)
        assert isinstance(hashed, str)
        assert len(hashed) > 0
    
    def test_hashed_password_is_different_from_original(self):
        """Hashed password should be different from original."""
        password = "test_password_123"
        hashed = get_password_hash(password)
        assert hashed != password
    
    def test_same_password_hashes_differently(self):
        """Same password should hash differently (bcrypt salt)."""
        password = "test_password_123"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)
        assert hash1 != hash2
    
    def test_verify_correct_password(self):
        """Correct password should verify successfully."""
        password = "test_password_123"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True
    
    def test_verify_incorrect_password_fails(self):
        """Incorrect password should fail verification."""
        password = "test_password_123"
        wrong_password = "wrong_password_456"
        hashed = get_password_hash(password)
        assert verify_password(wrong_password, hashed) is False
    
    def test_verify_empty_password_fails(self):
        """Empty password should fail verification."""
        password = "test_password_123"
        hashed = get_password_hash(password)
        assert verify_password("", hashed) is False


class TestTokenCreation:
    """Test JWT token creation."""
    
    def test_create_token_returns_string(self):
        """Token creation should return a string."""
        data = {"sub": "test@example.com", "role": "vendor"}
        token = create_access_token(data)
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_create_token_with_custom_expiry(self):
        """Token with custom expiry should be created."""
        data = {"sub": "test@example.com", "role": "vendor"}
        expiry = timedelta(minutes=30)
        token = create_access_token(data, expiry)
        assert isinstance(token, str)
    
    def test_create_token_includes_email(self):
        """Token should include email in payload."""
        data = {"sub": "test@example.com", "role": "vendor"}
        token = create_access_token(data)
        # Decode to verify (this will be tested in decode tests)
        assert token is not None


class TestTokenDecoding:
    """Test JWT token decoding."""
    
    def test_decode_valid_token(self):
        """Valid token should decode successfully."""
        data = {"sub": "test@example.com", "role": "vendor"}
        token = create_access_token(data)
        token_data = _decode_token(token)
        assert isinstance(token_data, TokenData)
        assert token_data.email == "test@example.com"
        assert token_data.role == "vendor"
    
    def test_decode_token_without_email_raises_error(self):
        """Token without email should raise error."""
        from fastapi import HTTPException, status
        data = {"role": "vendor"}  # Missing email
        token = create_access_token(data)
        with pytest.raises(HTTPException) as exc_info:
            _decode_token(token)
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_decode_invalid_token_raises_error(self):
        """Invalid token should raise error."""
        from fastapi import HTTPException, status
        invalid_token = "invalid.token.string"
        with pytest.raises(HTTPException) as exc_info:
            _decode_token(invalid_token)
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_decode_empty_token_raises_error(self):
        """Empty token should raise error."""
        from fastapi import HTTPException, status
        with pytest.raises(HTTPException) as exc_info:
            _decode_token("")
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED


class TestTokenDataModel:
    """Test TokenData model."""
    
    def test_token_data_with_email(self):
        """TokenData should store email."""
        token_data = TokenData(email="test@example.com")
        assert token_data.email == "test@example.com"
        assert token_data.role is None
    
    def test_token_data_with_role(self):
        """TokenData should store role."""
        token_data = TokenData(email="test@example.com", role="admin")
        assert token_data.email == "test@example.com"
        assert token_data.role == "admin"
    
    def test_token_data_defaults_to_none(self):
        """TokenData fields should default to None."""
        token_data = TokenData()
        assert token_data.email is None
        assert token_data.role is None
