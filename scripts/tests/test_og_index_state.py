from __future__ import annotations
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cron.og_index_state import (OG_PROJECTION_VERSION, SNAPSHOT_SCHEMA_VERSION, SnapshotValidationError, build_snapshot, diff_snapshots, parse_snapshot_json, parse_v1_snapshot_json, validate_snapshot, validate_v1_snapshot, v2_from_v1)


def movie(i: int, **changes: object) -> dict[str, object]:
    value: dict[str, object] = {"id": i, "title": f"Film {i}", "release_date": "2000-01-01", "genres": ["Drama"], "poster_url": ""}
    value.update(changes)
    return value


def snapshot(movies: list[dict[str, object]]) -> dict[str, object]:
    return build_snapshot(source_data_version="v", committed_at="2026-01-01T00:00:00Z", movies=movies)


def legacy(movies: list[dict[str, object]]) -> dict[str, object]:
    result = snapshot(movies)
    result["schema_version"] = 1
    result["projection_version"] = "og-index-v1"
    result["control"] = {"today_value": '{"date":"2026-01-01","movie_id":1}', "meta_g_value": "v"}
    return result


class TestV2State(unittest.TestCase):
    def test_v2_has_exact_today_free_shape(self) -> None:
        value = snapshot([movie(1)])
        self.assertEqual((value["schema_version"], value["projection_version"]), (SNAPSHOT_SCHEMA_VERSION, OG_PROJECTION_VERSION))
        self.assertEqual(set(value["control"]), {"meta_g_value"})
        self.assertNotIn("today", str(value).lower())
        validate_snapshot(value)

    def test_strict_v1_to_v2_drops_today(self) -> None:
        candidate = v2_from_v1(legacy([movie(1)]), committed_at="2026-01-02T00:00:00Z")
        self.assertNotIn("today", str(candidate).lower())
        self.assertEqual(candidate["movie_hashes"], legacy([movie(1)])["movie_hashes"])
        validate_snapshot(candidate)

    def test_v1_and_v2_parsers_are_separate_and_strict(self) -> None:
        old = legacy([movie(1)])
        with self.assertRaises(SnapshotValidationError): parse_snapshot_json(__import__("json").dumps(old))
        parse_v1_snapshot_json(__import__("json").dumps(old))
        bad = copy.deepcopy(old); bad["control"]["unknown"] = "x"
        with self.assertRaises(SnapshotValidationError): validate_v1_snapshot(bad)
        bad2 = snapshot([movie(1)]); bad2["control"]["today_value"] = "x"
        with self.assertRaises(SnapshotValidationError): validate_snapshot(bad2)
        invalid_date = legacy([movie(1)]); invalid_date["control"]["today_value"] = '{"date":"bad","movie_id":1}'
        with self.assertRaises(SnapshotValidationError): validate_v1_snapshot(invalid_date)

    def test_diff_is_deterministic(self) -> None:
        delta = diff_snapshots(snapshot([movie(1), movie(2)]), snapshot([movie(1), movie(3)]))
        self.assertEqual((delta.puts, delta.deletes, delta.unchanged), (("movie:3",), ("movie:2",), ("movie:1",)))
    def test_schema_versions_are_exact_non_boolean_integers(self) -> None:
        for invalid in (2.0, True, False, 1, 3, "2"):
            with self.subTest(invalid=invalid):
                value = snapshot([movie(1)])
                value["schema_version"] = invalid
                with self.assertRaises(SnapshotValidationError):
                    validate_snapshot(value)
        for invalid in (1.0, True, False, 2, 0, "1"):
            with self.subTest(invalid=invalid):
                value = legacy([movie(1)])
                value["schema_version"] = invalid
                with self.assertRaises(SnapshotValidationError):
                    validate_v1_snapshot(value)

    def test_v2_rejects_v1_and_any_today_control(self) -> None:
        with self.assertRaises(SnapshotValidationError):
            validate_snapshot(legacy([movie(1)]))
        value = snapshot([movie(1)])
        value["control"] = {"meta_g_value": "v", "today_value": "{}"}
        with self.assertRaises(SnapshotValidationError):
            validate_snapshot(value)

    def test_v1_rejects_v2_and_malformed_today(self) -> None:
        with self.assertRaises(SnapshotValidationError):
            validate_v1_snapshot(snapshot([movie(1)]))
        for today in (
            "not-json",
            '{"date":"2026-01-01","movie_id":true}',
            '{"date":"2026-02-30","movie_id":1}',
            '{"date":"2026-01-01","movie_id":2}',
            '{"date":"2026-01-01","movie_id":1,"extra":1}',
        ):
            with self.subTest(today=today):
                value = legacy([movie(1)])
                value["control"]["today_value"] = today
                with self.assertRaises(SnapshotValidationError):
                    validate_v1_snapshot(value)


if __name__ == "__main__":
    unittest.main()
