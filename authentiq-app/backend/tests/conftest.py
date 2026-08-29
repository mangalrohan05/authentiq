"""Pytest configuration for backend tests."""

import os
import sys
from pathlib import Path
import pytest

# Set TESTING environment variable
os.environ["TESTING"] = "true"

# Add the backend directory to Python path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Configure and isolate slowapi rate limiter between tests
@pytest.fixture(autouse=True)
def configure_limiter(request):
    from app.core.limiter import limiter
    
    is_rate_limit_test = (
        "rate" in request.node.name or
        "brute" in request.node.name or
        "test_auth_and_plan" in request.node.name or
        "security_edge" in request.node.name
    )
    
    if is_rate_limit_test:
        from limits.storage import MemoryStorage
        limiter.enabled = True
        limiter._storage = MemoryStorage()
    else:
        limiter.enabled = False
        
    yield
    limiter.enabled = True
