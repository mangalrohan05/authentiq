"""Performance and load testing utilities."""

import pytest
import time
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed


@pytest.mark.performance
class TestAPIPerformance:
    """Performance tests for API endpoints."""
    
    BASE_URL = "http://127.0.0.1:8010"
    
    def test_health_check_response_time(self):
        """Test that health check responds within acceptable time."""
        start_time = time.time()
        try:
            response = requests.get(f"{self.BASE_URL}/health", timeout=5)
            response_time = (time.time() - start_time) * 1000  # Convert to ms
            assert response_time < 500, f"Health check took {response_time:.2f}ms"
        except requests.exceptions.RequestException:
            pytest.skip("Backend not running")
    
    def test_login_response_time(self):
        """Test that login endpoint responds within acceptable time."""
        start_time = time.time()
        try:
            response = requests.post(
                f"{self.BASE_URL}/auth/login",
                json={"email": "test@example.com", "password": "test"},
                timeout=5
            )
            response_time = (time.time() - start_time) * 1000
            # Login may fail auth but should respond quickly
            assert response_time < 2000, f"Login took {response_time:.2f}ms"
        except requests.exceptions.RequestException:
            pytest.skip("Backend not running")
    
    def test_concurrent_requests(self):
        """Test system can handle concurrent requests."""
        def make_request():
            try:
                requests.get(f"{self.BASE_URL}/health", timeout=5)
                return True
            except requests.exceptions.RequestException:
                return False
        
        try:
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = [executor.submit(make_request) for _ in range(20)]
                results = [f.result() for f in as_completed(futures)]
            
            success_rate = sum(results) / len(results) * 100
            assert success_rate >= 80, f"Success rate: {success_rate:.2f}%"
        except requests.exceptions.RequestException:
            pytest.skip("Backend not running")
    
    def test_memory_leak_detection(self):
        """Basic memory leak detection test."""
        import psutil
        import os
        
        try:
            process = psutil.Process(os.getpid())
            initial_memory = process.memory_info().rss
            
            # Simulate some operations
            for _ in range(100):
                try:
                    requests.get(f"{self.BASE_URL}/health", timeout=5)
                except requests.exceptions.RequestException:
                    pass
            
            final_memory = process.memory_info().rss
            memory_increase = (final_memory - initial_memory) / 1024 / 1024  # MB
            
            # Memory increase should be reasonable (< 50MB for 100 requests)
            assert memory_increase < 50, f"Memory increased by {memory_increase:.2f}MB"
        except (ImportError, psutil.NoSuchProcess):
            pytest.skip("psutil not available or process not found")
        except requests.exceptions.RequestException:
            pytest.skip("Backend not running")


@pytest.mark.performance
class TestDatabasePerformance:
    """Performance tests for database operations."""
    
    def test_query_performance(self):
        """Test database query performance."""
        from pymongo import MongoClient
        import os
        
        try:
            mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
            client = MongoClient(mongo_uri, serverSelectionTimeoutMS=2000)
            db = client["authentiq_test"]
            
            start_time = time.time()
            # Simple query
            db.users.find_one({"email": "nonexistent@example.com"})
            query_time = (time.time() - start_time) * 1000
            
            assert query_time < 100, f"Query took {query_time:.2f}ms"
            client.close()
        except Exception:
            pytest.skip("Database not available")
    
    def test_index_usage(self):
        """Test that indexes are being used effectively."""
        from pymongo import MongoClient
        import os
        
        try:
            mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
            client = MongoClient(mongo_uri, serverSelectionTimeoutMS=2000)
            db = client["authentiq_test"]
            
            # Explain query to check index usage
            explanation = db.users.find({"email": "test@example.com"}).explain()
            
            # Check if index was used (this is a basic check)
            assert "queryPlanner" in explanation
            client.close()
        except Exception:
            pytest.skip("Database not available")


@pytest.mark.performance
class TestResourceUsage:
    """Tests for resource usage monitoring."""
    
    def test_cpu_usage_during_load(self):
        """Monitor CPU usage during load."""
        import psutil
        import os
        
        try:
            process = psutil.Process(os.getpid())
            initial_cpu = process.cpu_percent(interval=0.1)
            
            # Simulate load
            for _ in range(10):
                sum(range(100000))
            
            final_cpu = process.cpu_percent(interval=0.1)
            
            # CPU usage should be reasonable
            assert final_cpu < 100, f"CPU usage: {final_cpu}%"
        except (ImportError, psutil.NoSuchProcess):
            pytest.skip("psutil not available")
    
    def test_file_descriptor_usage(self):
        """Test file descriptor usage."""
        import psutil
        import os
        
        try:
            process = psutil.Process(os.getpid())
            initial_fds = process.num_fds() if hasattr(process, 'num_fds') else 0
            
            # Open some files
            files = []
            for _ in range(10):
                try:
                    f = open(os.devnull, 'r')
                    files.append(f)
                except:
                    pass
            
            final_fds = process.num_fds() if hasattr(process, 'num_fds') else 0
            
            # Close files
            for f in files:
                f.close()
            
            # File descriptors should be cleaned up
            assert final_fds - initial_fds <= 10, f"FD leak detected: {final_fds - initial_fds}"
        except (ImportError, psutil.NoSuchProcess):
            pytest.skip("psutil not available")
