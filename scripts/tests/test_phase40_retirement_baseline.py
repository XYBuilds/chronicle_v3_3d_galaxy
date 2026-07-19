#!/usr/bin/env python3
"""Phase 40.1 read-only retirement baseline fixture contract."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

_FIXTURE = Path(__file__).with_name("phase40_retirement_baseline.fixture.json")
_REQUIRED_ROUTES = {"home", "movie", "today", "today_og"}
_REQUIRED_OBJECTS = {
    "R2 ${R2_KEY_PREFIX:-galaxy}/today.json",
    "assets manifest today_url and r2_object_keys.today",
    "KV today",
    "R2 ops/og-index/state-v1.json.gz",
    "Today OG cache URL/version",
    "nightly and monthly scheduled workflows",
}


class TestPhase40RetirementBaseline(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = json.loads(_FIXTURE.read_text(encoding="utf-8"))

    def test_fixture_locks_all_retirement_surfaces_without_credentials(self) -> None:
        self.assertEqual(self.fixture["fixture_version"], 1)
        self.assertEqual(set(self.fixture["route_matrix"]), _REQUIRED_ROUTES)
        self.assertEqual(
            {entry["identifier"] for entry in self.fixture["production_legacy_objects"]},
            _REQUIRED_OBJECTS,
        )
        serialized = json.dumps(self.fixture, sort_keys=True)
        self.assertNotRegex(serialized, r"(?i)(api[_-]?key|secret|token|authorization)\s*[:=]")

    def test_today_retirement_contract_covers_methods_accept_and_query(self) -> None:
        today = self.fixture["route_matrix"]["today"]
        today_og = self.fixture["route_matrix"]["today_og"]
        self.assertEqual(today["current_get_html_status"], 200)
        self.assertIn("HEAD", today["head_semantics"])
        self.assertIn("Accept", today["accept_semantics"])
        self.assertIn("query", today["query_semantics"])
        self.assertIn("404", today["target_after_retirement"])
        self.assertEqual(today_og["current_get_without_version_status"], 302)
        self.assertIn("HEAD", today_og["head_semantics"])
        self.assertIn("Accept", today_og["accept_semantics"])
        self.assertIn("query", today_og["query_semantics"])
        self.assertIn("404", today_og["target_after_retirement"])

    def test_cleanup_is_deferred_and_rollback_boundary_is_explicit(self) -> None:
        for entry in self.fixture["production_legacy_objects"]:
            self.assertNotEqual(entry["delete_phase"], "40.1")
        boundary = self.fixture["rollback_boundary"]
        self.assertIn("v1 checkpoint", boundary["before_v2_checkpoint_commit"])
        self.assertIn("do not delete", boundary["after_v2_checkpoint_commit_before_legacy_cleanup"])
        self.assertIn("separately authorized", boundary["after_legacy_cleanup"])


if __name__ == "__main__":
    unittest.main()