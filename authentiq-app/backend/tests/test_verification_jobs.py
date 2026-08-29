"""In-process async verification job store (audit item 1.11).

No network/models: submits trivial coroutines and polls the store.
"""

from __future__ import annotations

import time

import pytest

from app.services.verification_jobs import VerificationJobStore


def _wait(store, job_id, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = store.get(job_id)
        if job and job["status"] in ("done", "error"):
            return job
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} did not finish in {timeout}s")


def test_submit_coro_stores_result():
    store = VerificationJobStore(max_workers=2)

    async def work(a, b):
        return {"sum": a + b}

    job_id = store.submit_coro(work, 2, 3)
    job = _wait(store, job_id)
    assert job["status"] == "done"
    assert job["result"] == {"sum": 5}


def test_error_is_captured_with_status_code():
    store = VerificationJobStore(max_workers=2)

    class FakeHTTPError(Exception):
        def __init__(self):
            super().__init__("bad input")
            self.status_code = 400
            self.detail = "bad input"

    async def boom():
        raise FakeHTTPError()

    job_id = store.submit_coro(boom)
    job = _wait(store, job_id)
    assert job["status"] == "error"
    assert job["status_code"] == 400
    assert job["error"] == "bad input"


def test_generic_exception_defaults_to_500():
    store = VerificationJobStore(max_workers=1)

    async def boom():
        raise ValueError("nope")

    job_id = store.submit_coro(boom)
    job = _wait(store, job_id)
    assert job["status"] == "error"
    assert job["status_code"] == 500
    assert "nope" in job["error"]


def test_get_unknown_job_is_none():
    store = VerificationJobStore()
    assert store.get("does-not-exist") is None


def test_expired_jobs_are_swept():
    store = VerificationJobStore(max_workers=1, ttl_seconds=1)

    async def work():
        return "ok"

    first = store.submit_coro(work)
    _wait(store, first)
    # Age the finished job past its TTL; the next submit's cleanup should sweep it.
    with store._lock:
        store._jobs[first]["updated_at"] = time.time() - 10
    store.submit_coro(work)
    assert store.get(first) is None
