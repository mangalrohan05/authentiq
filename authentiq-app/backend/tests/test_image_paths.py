"""Unit tests for image path utilities."""

import pytest
import os
import tempfile
from app.services.image_paths import resolve_image_fs_path, BACKEND_ROOT


class TestResolveImageFsPath:
    """Test image path resolution function."""
    
    def test_empty_path_returns_empty(self):
        """Empty path should return empty string."""
        assert resolve_image_fs_path("") == ""
    
    def test_none_path_returns_empty(self):
        """None path should return empty string."""
        assert resolve_image_fs_path(None) == ""
    
    def test_leading_slash_removed(self):
        """Leading slash should be removed from path."""
        result = resolve_image_fs_path("/static/images/test.jpg")
        assert not result.startswith("/")
    
    def test_relative_path_joined_with_backend_root(self):
        """Relative path should be joined with backend root."""
        relative_path = "static/images/test.jpg"
        result = resolve_image_fs_path(relative_path)
        assert BACKEND_ROOT in result
        assert relative_path in result
    
    def test_absolute_path_returned_if_exists(self):
        """Absolute path should be returned if it exists."""
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp_path = tmp.name
        try:
            result = resolve_image_fs_path(tmp_path)
            assert result == tmp_path
        finally:
            os.unlink(tmp_path)
    
    def test_absolute_path_nonexistent_joins_with_root(self):
        """Non-existent absolute path should be joined with root."""
        nonexistent = "/some/nonexistent/path/image.jpg"
        result = resolve_image_fs_path(nonexistent)
        assert BACKEND_ROOT in result
    
    def test_static_url_resolved_correctly(self):
        """Static URL should be resolved to filesystem path."""
        url = "/static/uploads/product.jpg"
        result = resolve_image_fs_path(url)
        assert "static" in result
        assert "uploads" in result
        assert "product.jpg" in result
    
    def test_path_with_subdirectories(self):
        """Path with multiple subdirectories should be handled."""
        path = "static/uploads/2024/01/product.jpg"
        result = resolve_image_fs_path(path)
        assert all(part in result for part in ["static", "uploads", "2024", "01", "product.jpg"])
    
    def test_windows_style_path(self):
        """Windows-style paths should be handled."""
        path = "static\\uploads\\product.jpg"
        result = resolve_image_fs_path(path)
        assert "static" in result or "uploads" in result


class TestBackendRoot:
    """Test backend root constant."""
    
    def test_backend_root_is_absolute(self):
        """BACKEND_ROOT should be an absolute path."""
        assert os.path.isabs(BACKEND_ROOT)
    
    def test_backend_root_exists(self):
        """BACKEND_ROOT should exist."""
        assert os.path.exists(BACKEND_ROOT)
    
    def test_backend_root_is_directory(self):
        """BACKEND_ROOT should be a directory."""
        assert os.path.isdir(BACKEND_ROOT)
