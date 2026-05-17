#!/usr/bin/env python3
"""P18.4: export_from_supabase retry helpers."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.supabase_retry import (  # noqa: E402
    is_retriable_supabase_error,
    supabase_execute_with_retry,
)


class TestRetriableSupabaseError(unittest.TestCase):
    def test_statement_timeout_code(self) -> None:
        from postgrest.exceptions import APIError

        err = APIError({"message": "canceling statement due to statement timeout", "code": "57014"})
        self.assertTrue(is_retriable_supabase_error(err))

    def test_non_retriable(self) -> None:
        from postgrest.exceptions import APIError

        err = APIError({"message": "permission denied", "code": "42501"})
        self.assertFalse(is_retriable_supabase_error(err))

    def test_generic_exception(self) -> None:
        self.assertFalse(is_retriable_supabase_error(RuntimeError("boom")))


class TestSupabaseExecuteWithRetry(unittest.TestCase):
    def test_succeeds_first_try(self) -> None:
        calls = {"n": 0}

        def ok() -> str:
            calls["n"] += 1
            return "ok"

        self.assertEqual(supabase_execute_with_retry(ok, label="t"), "ok")
        self.assertEqual(calls["n"], 1)

    def test_retries_then_succeeds(self) -> None:
        from postgrest.exceptions import APIError

        err = APIError({"message": "canceling statement due to statement timeout", "code": "57014"})
        calls = {"n": 0}

        def flaky() -> str:
            calls["n"] += 1
            if calls["n"] < 3:
                raise err
            return "ok"

        with mock.patch("cron.supabase_retry.time.sleep"):
            self.assertEqual(supabase_execute_with_retry(flaky, label="t"), "ok")
        self.assertEqual(calls["n"], 3)


if __name__ == "__main__":
    unittest.main()
