"""Locust performance testing file for load testing API endpoints."""

from locust import HttpUser, task, between, events
from locust.runners import MasterRunner
import time
import json


class QRAuthUser(HttpUser):
    """Simulated user for load testing QR Authentication API."""
    
    wait_time = between(1, 3)  # Wait 1-3 seconds between tasks
    
    def on_start(self):
        """Called when a user starts. Perform login."""
        self.client.verify = False  # Skip SSL verification for testing
        
    @task(3)
    def health_check(self):
        """Test health check endpoint - high frequency."""
        self.client.get("/health")
    
    @task(2)
    def login_attempt(self):
        """Test login endpoint - medium frequency."""
        self.client.post("/auth/login", json={
            "email": "test@example.com",
            "password": "test_password"
        })
    
    @task(1)
    def scan_qr(self):
        """Test QR scan endpoint - lower frequency."""
        # Use a test QR ID
        self.client.get("/scan/test_qr_id_12345")
    
    @task(1)
    def admin_analytics(self):
        """Test admin analytics endpoint - lower frequency."""
        # This will likely fail without auth, but tests endpoint availability
        self.client.get("/admin/analytics")


class PerformanceTestUser(HttpUser):
    """User specifically for performance benchmarking."""
    
    wait_time = between(0.5, 2)
    
    @task
    def measure_response_time(self):
        """Measure response time for various endpoints."""
        endpoints = [
            "/health",
            "/auth/login",
        ]
        
        for endpoint in endpoints:
            start_time = time.time()
            if endpoint == "/auth/login":
                self.client.post(endpoint, json={
                    "email": "perf@example.com",
                    "password": "perf_password"
                })
            else:
                self.client.get(endpoint)
            
            response_time = time.time() - start_time
            # Log response time (will be captured by Locust)
            if response_time > 2.0:
                print(f"Slow response: {endpoint} took {response_time:.2f}s")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when the test stops. Print summary."""
    if not isinstance(environment.runner, MasterRunner):
        print("\n=== Performance Test Summary ===")
        print(f"Total requests: {environment.runner.stats.total.num_requests}")
        print(f"Total failures: {environment.runner.stats.total.num_failures}")
        print(f"Average response time: {environment.runner.stats.total.avg_response_time:.2f}ms")
        print(f"Min response time: {environment.runner.stats.total.min_response_time:.2f}ms")
        print(f"Max response time: {environment.runner.stats.total.max_response_time:.2f}ms")
        print(f"Requests per second: {environment.runner.stats.total.total_rps:.2f}")
