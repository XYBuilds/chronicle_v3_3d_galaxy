"""Shared PostgREST retry helpers for P18.4 cron scripts (statement timeout 57014)."""
from __future__ import annotations

import os
import time
from typing import Any, Callable, TypeVar

T = TypeVar("T")

MAX_FETCH_RETRIES = max(1, int(os.environ.get("GALAXY_SUPABASE_FETCH_RETRIES", os.environ.get("GALAXY_EXPORT_FETCH_RETRIES", "5"))))
FETCH_RETRY_BASE_SEC = max(0.25, float(os.environ.get("GALAXY_SUPABASE_FETCH_RETRY_BASE_SEC", os.environ.get("GALAXY_EXPORT_FETCH_RETRY_BASE_SEC", "2.0"))))


def is_retriable_supabase_error(exc: BaseException) -> bool:
    """True for Postgres statement timeout (57014) and similar transient PostgREST failures."""
    try:
        from postgrest.exceptions import APIError
    except ImportError:
        return False
    if not isinstance(exc, APIError):
        return False
    code = str(getattr(exc, "code", "") or "")
    msg = str(getattr(exc, "message", "") or exc.args[0] if exc.args else "").lower()
    return code == "57014" or "statement timeout" in msg or "canceling statement" in msg


def supabase_execute_with_retry(call: Callable[[], T], *, label: str, log_prefix: str = "P18.4") -> T:
    last: BaseException | None = None
    for attempt in range(1, MAX_FETCH_RETRIES + 1):
        try:
            return call()
        except Exception as e:
            if not is_retriable_supabase_error(e) or attempt >= MAX_FETCH_RETRIES:
                raise
            last = e
            delay = FETCH_RETRY_BASE_SEC * (2 ** (attempt - 1))
            print(
                f"[{log_prefix}] {label} retriable ({attempt}/{MAX_FETCH_RETRIES}): "
                f"{e!s}; sleep {delay:.1f}s",
                flush=True,
            )
            time.sleep(delay)
    raise AssertionError(f"{label}: retry loop exhausted") from last
