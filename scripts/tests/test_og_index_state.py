#!/usr/bin/env python3
"""Focused pure-domain tests for Phase 38.1 OG index state."""
from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.og_index_state import (  # noqa: E402
    OG_PROJECTION_VERSION,
    SNAPSHOT_SCHEMA_VERSION,
    SnapshotValidationError,
    build_snapshot,
    canonical_json,
    diff_snapshots,
    movie_projection_hash,
    parse_snapshot_json,
    sha256_hex,
    validate_snapshot,
)


def _movie(movie_id: int, **changes: object) -> dict[str, object]:
    movie: dict[str, object] = {
        "id": movie_id,
        "title": f"Film {movie_id}",
        "release_date": "2000-01-01",
        "genres": ["Drama"],
        "poster_url": f"https://example.test/{movie_id}.jpg",
        "vote_count": 100,
        "vote_average": 7.5,
        "popularity": 30.0,
        "x": 1.0,
        "y": 2.0,
        "z": 2000.0,
    }
    movie.update(changes)
    return movie


def _snapshot(movies: list[dict[str, object]]) -> dict[str, object]:
    return build_snapshot(
        source_data_version="2026.07.17.monthly.1",
        committed_at="2026-07-17T00:00:00Z",
        movies=movies,
        today_payload={"date": "2026-07-17", "movie_id": 1},
    )


class TestCanonicalProjection(unittest.TestCase):
    def test_canonical_json_and_sha256_are_stable(self) -> None:
        self.assertEqual(canonical_json({"b": 2, "a": 1}), '{"a":1,"b":2}')
        self.assertEqual(sha256_hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")

    def test_input_movie_order_does_not_change_snapshot_hashes(self) -> None:
        forward = _snapshot([_movie(1), _movie(2)])
        reverse = _snapshot([_movie(2), _movie(1)])
        self.assertEqual(forward["movie_hashes"], reverse["movie_hashes"])
        self.assertEqual(diff_snapshots(forward, reverse).stats["puts"], 0)

    def test_non_og_fields_do_not_change_hash(self) -> None:
        original = _movie(1)
        unrelated = _movie(1, vote_count=9999, vote_average=1.0, popularity=0.0, x=77.0, y=-2.0, z=2030.0)
        self.assertEqual(movie_projection_hash(original), movie_projection_hash(unrelated))
        self.assertEqual(diff_snapshots(_snapshot([original]), _snapshot([unrelated])).puts, ())


class TestSnapshotDiff(unittest.TestCase):
    def test_added_changed_deleted_and_unchanged_keys_are_precise(self) -> None:
        previous = _snapshot([_movie(1), _movie(2), _movie(3)])
        current = _snapshot([_movie(1), _movie(2, title="Renamed"), _movie(4)])

        delta = diff_snapshots(previous, current)

        self.assertEqual(delta.puts, ("movie:2", "movie:4"))
        self.assertEqual(delta.deletes, ("movie:3",))
        self.assertEqual(delta.unchanged, ("movie:1",))
        self.assertEqual(
            delta.stats,
            {"current": 3, "previous": 3, "puts": 2, "deletes": 1, "unchanged": 1},
        )

    def test_identical_snapshots_have_no_mutations(self) -> None:
        snapshot = _snapshot([_movie(1), _movie(2)])
        delta = diff_snapshots(snapshot, copy.deepcopy(snapshot))
        self.assertEqual(delta.puts, ())
        self.assertEqual(delta.deletes, ())
        self.assertEqual(delta.unchanged, ("movie:1", "movie:2"))


class TestSnapshotValidation(unittest.TestCase):
    def test_snapshot_has_required_d2_structure(self) -> None:
        snapshot = _snapshot([_movie(1)])
        self.assertEqual(snapshot["schema_version"], SNAPSHOT_SCHEMA_VERSION)
        self.assertEqual(snapshot["projection_version"], OG_PROJECTION_VERSION)
        self.assertEqual(snapshot["movie_count"], 1)
        self.assertEqual(set(snapshot["control"]), {"today_value", "meta_g_value"})
        validate_snapshot(snapshot)

    def test_rejects_duplicate_movie_key_while_building(self) -> None:
        with self.assertRaisesRegex(SnapshotValidationError, "duplicate movie key"):
            _snapshot([_movie(1), _movie(1, title="Duplicate")])

    def test_rejects_duplicate_json_keys_while_parsing(self) -> None:
        with self.assertRaisesRegex(SnapshotValidationError, "duplicate JSON key"):
            parse_snapshot_json('{"movie_count":1,"movie_count":2}')

    def test_rejects_missing_and_unknown_versions(self) -> None:
        missing = _snapshot([_movie(1)])
        del missing["control"]
        with self.assertRaises(SnapshotValidationError):
            validate_snapshot(missing)

        schema = _snapshot([_movie(1)])
        schema["schema_version"] = 2
        with self.assertRaisesRegex(SnapshotValidationError, "unknown schema_version"):
            validate_snapshot(schema)

        for invalid_version in (True, 1.0):
            with self.subTest(schema_version=invalid_version):
                invalid_schema = _snapshot([_movie(1)])
                invalid_schema["schema_version"] = invalid_version
                with self.assertRaisesRegex(SnapshotValidationError, "unknown schema_version"):
                    validate_snapshot(invalid_schema)

        projection = _snapshot([_movie(1)])
        projection["projection_version"] = "other"
        with self.assertRaisesRegex(SnapshotValidationError, "unknown projection_version"):
            validate_snapshot(projection)

    def test_rejects_count_type_key_and_hash_errors(self) -> None:
        count_type = _snapshot([_movie(1)])
        count_type["movie_count"] = "1"
        with self.assertRaisesRegex(SnapshotValidationError, "movie_count"):
            validate_snapshot(count_type)

        count_mismatch = _snapshot([_movie(1)])
        count_mismatch["movie_count"] = 2
        with self.assertRaisesRegex(SnapshotValidationError, "does not match"):
            validate_snapshot(count_mismatch)

        bad_key = _snapshot([_movie(1)])
        bad_key["movie_hashes"] = {"movie:0": next(iter(bad_key["movie_hashes"].values()))}
        with self.assertRaisesRegex(SnapshotValidationError, "illegal movie key"):
            validate_snapshot(bad_key)

        bad_hash = _snapshot([_movie(1)])
        bad_hash["movie_hashes"] = {"movie:1": "not-a-sha"}
        with self.assertRaisesRegex(SnapshotValidationError, "illegal SHA-256"):
            validate_snapshot(bad_hash)

        non_string_schema_key = _snapshot([_movie(1)])
        non_string_schema_key[0] = "unexpected"
        with self.assertRaisesRegex(SnapshotValidationError, "snapshot keys invalid"):
            validate_snapshot(non_string_schema_key)

    def test_rejects_boolean_today_movie_id_when_building_or_validating(self) -> None:
        with self.assertRaisesRegex(SnapshotValidationError, "today movie_id"):
            build_snapshot(
                source_data_version="2026.07.17.monthly.1",
                committed_at="2026-07-17T00:00:00Z",
                movies=[_movie(1)],
                today_payload={"date": "2026-07-17", "movie_id": True},
            )

        invalid_control = _snapshot([_movie(1)])
        invalid_control["control"]["today_value"] = canonical_json(
            {"date": "2026-07-17", "movie_id": True}
        )
        with self.assertRaisesRegex(SnapshotValidationError, "today movie_id"):
            validate_snapshot(invalid_control)


if __name__ == "__main__":
    unittest.main()