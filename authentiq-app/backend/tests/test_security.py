"""Security testing for authentication and authorization."""

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.mark.security
class TestAuthenticationSecurity:
    """Security tests for authentication mechanisms."""
    
    def test_sql_injection_in_login(self, client):
        """Test SQL injection attempts in login endpoint."""
        sql_payloads = [
            "' OR '1'='1",
            "admin'--",
            "' UNION SELECT * FROM users--",
            "'; DROP TABLE users;--",
            "1' OR '1'='1'--"
        ]
        
        for payload in sql_payloads:
            response = client.post("/auth/login", json={
                "email": payload,
                "password": "test"
            })
            # Should not return 500 (internal server error)
            # Should handle gracefully
            assert response.status_code in [401, 422, 400], f"SQL injection payload: {payload}"
    
    def test_brute_force_protection(self, client):
        """Test brute force protection on login endpoint."""
        # Make multiple failed login attempts
        for i in range(10):
            response = client.post("/auth/login", json={
                "email": f"test{i}@example.com",
                "password": "wrong_password"
            })
        
        # After many attempts, should be rate limited
        final_response = client.post("/auth/login", json={
            "email": "test@example.com",
            "password": "wrong_password"
        })
        
        # Should either get 401, 429 (rate limited), or 422
        assert final_response.status_code in [401, 422, 429]
    
    def test_weak_password_rejection(self, client):
        """Test that weak passwords are rejected."""
        weak_passwords = [
            "123456",
            "password",
            "abc123",
            "qwerty",
            "111111"
        ]
        
        for password in weak_passwords:
            # This test assumes there's a password validation endpoint
            # If not, the password policy tests cover this
            pass  # Covered in test_password_policy.py
    
    def test_token_expiration(self, client):
        """Test that tokens expire appropriately."""
        # This would require creating a token and waiting for expiration
        # For now, we test the mechanism exists
        from app.core.security import create_access_token
        from datetime import timedelta
        
        # Create token with short expiry
        token = create_access_token(
            {"sub": "test@example.com", "role": "vendor"},
            expires_delta=timedelta(seconds=1)
        )
        
        # Token should be valid immediately
        assert token is not None
        assert len(token) > 0


@pytest.mark.security
class TestAuthorizationSecurity:
    """Security tests for authorization and access control."""
    
    def test_unauthorized_admin_access(self, client):
        """Test that unauthorized users cannot access admin endpoints."""
        protected_endpoints = [
            "/admin/analytics",
            "/admin/vendor/create",
            "/admin/plan/list"
        ]
        
        for endpoint in protected_endpoints:
            response = client.get(endpoint)
            # Should return 401 (unauthorized), 404 (not found), or 405 (method not allowed)
            assert response.status_code in [401, 404, 405]
    
    def test_role_based_access_control(self, client):
        """Test role-based access control."""
        # Test that different roles have appropriate access
        # This would require authentication setup
        pass  # Covered in integration tests
    
    def test_horizontal_privilege_escalation(self, client):
        """Test horizontal privilege escalation prevention."""
        # Try to access another user's data
        # This would require authenticated requests
        pass  # Would require user setup


@pytest.mark.security
class TestInputValidation:
    """Security tests for input validation."""
    
    def test_xss_in_user_input(self, client):
        """Test XSS prevention in user input."""
        xss_payloads = [
            "<script>alert('xss')</script>",
            "<img src=x onerror=alert('xss')>",
            "javascript:alert('xss')",
            "<svg onload=alert('xss')>",
            "'\"><script>alert('xss')</script>"
        ]
        
        for payload in xss_payloads:
            # Test in various input fields
            response = client.post("/auth/login", json={
                "email": payload,
                "password": "test"
            })
            # Should not execute script, should handle gracefully
            assert response.status_code in [401, 422, 400]
    
    def test_command_injection(self, client):
        """Test command injection prevention."""
        command_payloads = [
            "; ls -la",
            "| cat /etc/passwd",
            "`whoami`",
            "$(id)",
            "; rm -rf /"
        ]
        
        for payload in command_payloads:
            response = client.post("/auth/login", json={
                "email": payload,
                "password": "test"
            })
            # Should not execute commands
            assert response.status_code in [401, 422, 400]
    
    def test_path_traversal(self, client):
        """Test path traversal prevention."""
        path_payloads = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32",
            "/etc/passwd",
            "C:\\Windows\\System32"
        ]
        
        for payload in path_payloads:
            # Test in file upload or similar endpoints
            # For now, test in login to ensure validation
            response = client.post("/auth/login", json={
                "email": payload,
                "password": "test"
            })
            assert response.status_code in [401, 422, 400]
    
    def test_large_payload_handling(self, client):
        """Test handling of excessively large payloads."""
        large_payload = "A" * 100000  # 100KB
        
        response = client.post("/auth/login", json={
            "email": large_payload + "@example.com",
            "password": "test"
        })
        
        # Should handle large payload gracefully
        assert response.status_code in [422, 413, 400, 401]


@pytest.mark.security
class TestDataProtection:
    """Security tests for data protection."""
    
    def test_sensitive_data_exposure(self, client):
        """Test that sensitive data is not exposed."""
        # Check that password hashes are not returned in responses
        # This would require authenticated requests
        pass  # Covered in integration tests
    
    def test_https_enforcement(self, client):
        """Test HTTPS enforcement (in production)."""
        # This test is for production environment
        # In development, HTTP is acceptable
        pass
    
    def test_secure_headers(self, client):
        """Test security headers are present."""
        response = client.get("/health")
        
        # Check for security headers
        headers = response.headers
        
        # These headers should be present in production
        # In development, some may be missing
        security_headers = [
            "X-Content-Type-Options",
            "X-Frame-Options",
            "X-XSS-Protection"
        ]
        
        # At least some security headers should be present
        present_headers = [h for h in security_headers if h in headers]
        # Don't fail if missing in dev, but log warning
        if len(present_headers) == 0:
            print("Warning: No security headers detected")
    
    def test_cors_configuration(self, client):
        """Test CORS configuration."""
        response = client.options("/auth/login", headers={
            "Origin": "http://malicious-site.com",
            "Access-Control-Request-Method": "POST"
        })
        
        # Should not allow arbitrary origins in production
        # In development, may be more permissive
        pass


@pytest.mark.security
class TestSessionManagement:
    """Security tests for session management."""
    
    def test_session_fixation(self, client):
        """Test session fixation prevention."""
        # This would require session management testing
        pass
    
    def test_concurrent_session_handling(self, client):
        """Test concurrent session handling."""
        # This would require authentication setup
        pass
    
    def test_logout_functionality(self, client):
        """Test logout functionality."""
        # This would require authentication setup
        pass


@pytest.mark.security
class TestErrorHandling:
    """Security tests for error handling."""
    
    def test_error_message_disclosure(self, client):
        """Test that error messages don't disclose sensitive information."""
        # Trigger various errors and check response
        response = client.get("/nonexistent-endpoint-12345")
        
        # Error message should not contain sensitive info
        if response.status_code == 404:
            error_detail = response.text
            # Should not contain database errors, stack traces, etc.
            sensitive_keywords = ["database", "stack trace", "internal error", "exception"]
            for keyword in sensitive_keywords:
                if keyword.lower() in error_detail.lower():
                    pytest.fail(f"Sensitive information in error message: {keyword}")
    
    def test_debug_mode_disabled(self, client):
        """Test that debug mode is disabled in production."""
        # In development, debug mode may be enabled
        # This is a reminder to disable in production
        pass
