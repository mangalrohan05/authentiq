import os
import time
import json
import logging
import threading
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

class TTLCache:
    """
    A simple thread-safe in-memory cache with TTL (Time To Live).
    """
    def __init__(self) -> None:
        self._cache: Dict[str, Tuple[Any, float]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        """Retrieve value for key if it exists and has not expired."""
        with self._lock:
            if key not in self._cache:
                return None
            value, expires_at = self._cache[key]
            if time.time() > expires_at:
                # Cache expired, remove it
                del self._cache[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        """Store key-value pair with a specified TTL in seconds."""
        with self._lock:
            expires_at = time.time() + ttl_seconds
            self._cache[key] = (value, expires_at)

    def invalidate(self, key: str) -> None:
        """Remove key from the cache immediately."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]

    def clear(self) -> None:
        """Clear all cache values."""
        with self._lock:
            self._cache.clear()

class HybridCache:
    """
    A caching layer that uses Redis when available, falling back to local in-memory TTLCache.
    """
    def __init__(self) -> None:
        self.local_cache = TTLCache()
        self.redis_client = None
        self._use_redis = False
        
        if os.getenv("USE_REDIS", "true").lower() != "true":
            self._use_redis = False
            logger.info("[Cache] Redis is disabled via USE_REDIS env var. Using in-memory TTL caching.")
            return

        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        try:
            import redis
            # Setup a short connection timeout so it doesn't block startup if Redis is down
            self.redis_client = redis.Redis.from_url(redis_url, socket_connect_timeout=2.0)
            # Test connection
            self.redis_client.ping()
            self._use_redis = True
            logger.info(f"[Cache] Successfully connected to Redis at {redis_url}. Using Redis cache.")
        except Exception as e:
            logger.warning(f"[Cache] Failed to connect to Redis: {e}. Falling back to in-memory TTL caching.")
            self._use_redis = False

    def get(self, key: str) -> Optional[Any]:
        if self._use_redis and self.redis_client:
            try:
                data = self.redis_client.get(key)
                if data:
                    return json.loads(data)
                return None
            except Exception as e:
                logger.warning(f"[Cache] Redis get error: {e}. Falling back to local cache.")
                return self.local_cache.get(key)
        return self.local_cache.get(key)

    def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        if self._use_redis and self.redis_client:
            try:
                serialized = json.dumps(value, default=str)
                self.redis_client.setex(key, int(ttl_seconds), serialized)
                return
            except Exception as e:
                logger.warning(f"[Cache] Redis set error: {e}. Falling back to local cache.")
        self.local_cache.set(key, value, ttl_seconds)

    def invalidate(self, key: str) -> None:
        if self._use_redis and self.redis_client:
            try:
                self.redis_client.delete(key)
                return
            except Exception as e:
                logger.warning(f"[Cache] Redis invalidate error: {e}. Falling back to local cache.")
        self.local_cache.invalidate(key)

    def clear(self) -> None:
        if self._use_redis and self.redis_client:
            try:
                self.redis_client.flushdb()
                return
            except Exception as e:
                logger.warning(f"[Cache] Redis clear error: {e}. Falling back to local cache.")
        self.local_cache.clear()

# Global cache singleton instance
cache_store = HybridCache()
