"""
In-process async verification job store (audit item 1.11).

The VLM verification is slow (60–90 s cold), and running it inside the request
holds the HTTP connection open long enough to hit the reverse-proxy timeout (the
"HTTP 500 on first scan" symptom). This module runs the verification in a bounded
background thread pool and hands the caller a job id to poll — no reverse-proxy
timeout, and no hard Redis/Celery dependency (that is the production upgrade; this
is the graceful in-process fallback, mirroring how embeddings already degrade).

Jobs are kept in memory with a TTL and swept on each submit, so the store never
grows unbounded. A restart loses in-flight jobs — acceptable for the fallback;
the Celery/Redis path is the durable option.

Coroutine support: the existing verification core is async, so submit_coro runs it
via asyncio.run() inside a worker thread (a fresh event loop per job).
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Awaitable, Callable, Dict, Optional

logger = logging.getLogger(__name__)

_MAX_WORKERS = int(os.getenv("AUTHENTIQ_VERIFY_JOB_WORKERS", "2"))
_TTL_SECONDS = int(os.getenv("AUTHENTIQ_VERIFY_JOB_TTL_SECONDS", "1800"))  # 30 min


class VerificationJobStore:
    """Thread-safe, TTL-bounded store that runs coroutine jobs in a thread pool."""

    def __init__(self, max_workers: int = _MAX_WORKERS, ttl_seconds: int = _TTL_SECONDS) -> None:
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(
            max_workers=max(1, max_workers), thread_name_prefix="verify-job"
        )
        self._ttl = ttl_seconds

    def submit_coro(self, coro_fn: Callable[..., Awaitable[Any]], *args: Any, **kwargs: Any) -> str:
        """Schedule an async function as a background job; returns the job id."""
        job_id = uuid.uuid4().hex
        now = time.time()
        with self._lock:
            self._jobs[job_id] = {
                "status": "queued",   # queued -> processing -> done | error
                "result": None,
                "error": None,
                "status_code": None,
                "created_at": now,
                "updated_at": now,
            }
        self._executor.submit(self._run, job_id, coro_fn, args, kwargs)
        self._cleanup()
        return job_id

    def _set(self, job_id: str, **updates: Any) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.update(updates)
            job["updated_at"] = time.time()

    def _run(
        self,
        job_id: str,
        coro_fn: Callable[..., Awaitable[Any]],
        args: tuple,
        kwargs: dict,
    ) -> None:
        self._set(job_id, status="processing")
        try:
            result = asyncio.run(coro_fn(*args, **kwargs))
            self._set(job_id, status="done", result=result)
        except Exception as exc:  # includes HTTPException — re-surfaced on poll
            status_code = getattr(exc, "status_code", 500)
            detail = getattr(exc, "detail", None)
            if detail is None:
                detail = str(exc)
            logger.warning("[VerifyJob %s] failed (%s): %s", job_id, status_code, detail)
            self._set(job_id, status="error", error=detail, status_code=status_code)

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def _cleanup(self) -> None:
        cutoff = time.time() - self._ttl
        with self._lock:
            stale = [jid for jid, j in self._jobs.items() if j["updated_at"] < cutoff]
            for jid in stale:
                self._jobs.pop(jid, None)
        if stale:
            logger.debug("[VerifyJob] swept %d expired job(s)", len(stale))


# Module-level singleton shared across the app.
store = VerificationJobStore()
