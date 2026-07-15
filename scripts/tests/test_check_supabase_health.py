#!/usr/bin/env python3
"""P37.1 Supabase preflight classification tests."""
from __future__ import annotations

import ssl
import sys
import unittest
from pathlib import Path
from typing import Any, Mapping

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.check_supabase_health import run_preflight  # noqa: E402


class TestSupabaseHealthPreflight(unittest.TestCase):
    _url = "https://project-ref.supabase.co"
    _key = "service-role-key-that-must-never-appear-in-logs"

    def _env(self, **overrides: str) -> dict[str, str]:
        return {
            "SUPABASE_URL": self._url,
            "SUPABASE_SERVICE_ROLE_KEY": self._key,
            **overrides,
        }

    @staticmethod
    def _dns_ok(_hostname: str, _port: int) -> object:
        return [(None, None, None, None, ("127.0.0.1", 443))]

    @staticmethod
    def _success_http(_url: str, _headers: Mapping[str, str], _timeout: float) -> tuple[int, Any]:
        return 200, [{"version": "test", "thresholds_json": {"1999": 8, "2000": 11}}]

    def test_missing_url_or_key_is_configuration_failure(self) -> None:
        missing_url = run_preflight(environment={"SUPABASE_SERVICE_ROLE_KEY": self._key})
        missing_key = run_preflight(environment={"SUPABASE_URL": self._url})

        self.assertEqual(missing_url.category, "config_missing")
        self.assertEqual(missing_key.category, "config_missing")
        self.assertFalse(missing_url.ok)
        self.assertFalse(missing_key.ok)

    def test_invalid_url_is_rejected_without_network_access(self) -> None:
        def unexpected_dns(_hostname: str, _port: int) -> object:
            raise AssertionError("DNS must not run for an invalid URL")

        result = run_preflight(
            environment=self._env(SUPABASE_URL="http://not-secure.example/path"),
            dns_resolver=unexpected_dns,
        )

        self.assertEqual(result.category, "url_invalid")
        self.assertFalse(result.ok)

    def test_dns_failure_has_distinct_category(self) -> None:
        def dns_failure(_hostname: str, _port: int) -> object:
            raise OSError("unresolvable")

        result = run_preflight(environment=self._env(), dns_resolver=dns_failure)

        self.assertEqual(result.category, "dns_failure")
        self.assertFalse(result.ok)

    def test_tls_failure_has_distinct_category(self) -> None:
        def tls_failure(_url: str, _headers: Mapping[str, str], _timeout: float) -> tuple[int, Any]:
            raise ssl.SSLError("certificate verify failed")

        result = run_preflight(
            environment=self._env(),
            dns_resolver=self._dns_ok,
            http_get=tls_failure,
        )

        self.assertEqual(result.category, "tls_failure")
        self.assertFalse(result.ok)

    def test_authentication_failures_preserve_status_without_secrets(self) -> None:
        for status in (401, 403):
            with self.subTest(status=status):
                def auth_failure(_url: str, _headers: Mapping[str, str], _timeout: float) -> tuple[int, Any]:
                    return status, {"message": "denied"}

                result = run_preflight(
                    environment=self._env(),
                    dns_resolver=self._dns_ok,
                    http_get=auth_failure,
                )

                serialized = str(result.log_payload())
                self.assertEqual(result.category, "auth_failure")
                self.assertEqual(result.http_status, status)
                self.assertNotIn(self._key, serialized)
                self.assertNotIn(self._url, serialized)

    def test_no_active_threshold_is_cardinality_failure(self) -> None:
        result = run_preflight(
            environment=self._env(),
            dns_resolver=self._dns_ok,
            http_get=lambda _url, _headers, _timeout: (200, []),
        )

        self.assertEqual(result.category, "active_threshold_cardinality_failure")
        self.assertEqual(result.active_threshold_count, 0)

    def test_multiple_active_thresholds_is_cardinality_failure(self) -> None:
        payload = [
            {"version": "one", "thresholds_json": {"1999": 1}},
            {"version": "two", "thresholds_json": {"2000": 1}},
        ]
        result = run_preflight(
            environment=self._env(),
            dns_resolver=self._dns_ok,
            http_get=lambda _url, _headers, _timeout: (200, payload),
        )

        self.assertEqual(result.category, "active_threshold_cardinality_failure")
        self.assertEqual(result.active_threshold_count, 2)

    def test_success_reports_only_redacted_identity_and_threshold_summary(self) -> None:
        result = run_preflight(
            environment=self._env(),
            dns_resolver=self._dns_ok,
            http_get=self._success_http,
        )

        serialized = str(result.log_payload())
        self.assertTrue(result.ok)
        self.assertEqual(result.category, "ok")
        self.assertEqual(result.http_status, 200)
        self.assertEqual(result.active_threshold_count, 1)
        self.assertEqual((result.years_min, result.years_max), (1999, 2000))
        self.assertTrue(result.hostname_hash)
        self.assertTrue(result.hostname_tail)
        self.assertNotIn(self._key, serialized)
        self.assertNotIn(self._url, serialized)


if __name__ == "__main__":
    unittest.main()