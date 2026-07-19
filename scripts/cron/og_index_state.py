#!/usr/bin/env python3
"""Pure, deletion-safe OG-index v2 snapshot helpers."""
from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

from cron.og_index_kv import (
    META_G_KEY,
    MOVIE_KEY_PREFIX,
    movie_kv_key,
    movie_og_record,
)

SNAPSHOT_SCHEMA_VERSION = 2
OG_PROJECTION_VERSION = "og-index-v2"
LEGACY_SNAPSHOT_SCHEMA_VERSION = 1
LEGACY_OG_PROJECTION_VERSION = "og-index-v1"
_SHA256_HEX_RE = re.compile(r"^[0-9a-f]{64}$")
_MOVIE_KEY_RE = re.compile(r"^movie:[1-9][0-9]*$")


class SnapshotValidationError(ValueError):
    """A checkpoint is malformed and must not drive deletion or writes."""


@dataclass(frozen=True)
class SnapshotDiff:
    puts: tuple[str, ...]
    deletes: tuple[str, ...]
    unchanged: tuple[str, ...]
    current_count: int
    previous_count: int

    @property
    def stats(self) -> dict[str, int]:
        return {
            "current": self.current_count,
            "previous": self.previous_count,
            "puts": len(self.puts),
            "deletes": len(self.deletes),
            "unchanged": len(self.unchanged),
        }


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha256_hex(value: str) -> str:
    assert isinstance(value, str), "value must be str"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def movie_projection(movie: Mapping[str, Any]) -> dict[str, Any]:
    return movie_og_record(dict(movie))


def movie_projection_hash(movie: Mapping[str, Any]) -> str:
    return sha256_hex(canonical_json(movie_projection(movie)))


def build_snapshot(
    *,
    source_data_version: str,
    committed_at: str,
    movies: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Build the only scheduled-writer checkpoint shape: v2, without Today."""
    hashes: dict[str, str] = {}
    for movie in movies:
        if not isinstance(movie, Mapping):
            raise SnapshotValidationError("each movie must be an object")
        movie_id = movie.get("id")
        if not isinstance(movie_id, int) or isinstance(movie_id, bool) or movie_id <= 0:
            raise SnapshotValidationError(f"movie id must be a positive int, got {movie_id!r}")
        key = movie_kv_key(movie_id)
        if key in hashes:
            raise SnapshotValidationError(f"duplicate movie key: {key}")
        hashes[key] = movie_projection_hash(movie)
    source_version = _required_text(source_data_version, "source_data_version")
    snapshot = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "projection_version": OG_PROJECTION_VERSION,
        "source_data_version": source_version,
        "committed_at": _required_text(committed_at, "committed_at"),
        "movie_count": len(hashes),
        "movie_hashes": hashes,
        "control": {"meta_g_value": source_version},
    }
    validate_snapshot(snapshot)
    return snapshot


def _require_exact_keys(value: Mapping[str, Any], expected: set[str], name: str) -> None:
    actual = set(value)
    if actual != expected:
        raise SnapshotValidationError(f"{name} keys invalid: missing={sorted(expected - actual)!r} unexpected={sorted(actual - expected)!r}")


def _required_text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SnapshotValidationError(f"{name} must be a non-empty string")
    return value.strip()


def _validate_hashes(hashes: Any, movie_count: Any) -> None:
    if not isinstance(movie_count, int) or isinstance(movie_count, bool) or movie_count < 0:
        raise SnapshotValidationError("movie_count must be a non-negative int")
    if not isinstance(hashes, Mapping):
        raise SnapshotValidationError("movie_hashes must be an object")
    if len(hashes) != movie_count:
        raise SnapshotValidationError("movie_count does not match movie_hashes")
    for key, digest in hashes.items():
        if not isinstance(key, str) or not _MOVIE_KEY_RE.fullmatch(key):
            raise SnapshotValidationError(f"illegal movie key: {key!r}")
        if not isinstance(digest, str) or not _SHA256_HEX_RE.fullmatch(digest):
            raise SnapshotValidationError(f"illegal SHA-256 for {key!r}")


def validate_snapshot(snapshot: Mapping[str, Any]) -> None:
    """Accept exactly v2. It is intentionally impossible for scheduled code to accept v1."""
    if not isinstance(snapshot, Mapping):
        raise SnapshotValidationError("snapshot must be an object")
    _require_exact_keys(
        snapshot,
        {
            "schema_version",
            "projection_version",
            "source_data_version",
            "committed_at",
            "movie_count",
            "movie_hashes",
            "control",
        },
        "snapshot",
    )
    if (
        not isinstance(snapshot["schema_version"], int)
        or isinstance(snapshot["schema_version"], bool)
        or snapshot["schema_version"] != SNAPSHOT_SCHEMA_VERSION
    ):
        raise SnapshotValidationError(f"unknown schema_version: {snapshot['schema_version']!r}")
    if snapshot["projection_version"] != OG_PROJECTION_VERSION:
        raise SnapshotValidationError(f"unknown projection_version: {snapshot['projection_version']!r}")
    source = _required_text(snapshot["source_data_version"], "source_data_version")
    _required_text(snapshot["committed_at"], "committed_at")
    _validate_hashes(snapshot["movie_hashes"], snapshot["movie_count"])
    control = snapshot["control"]
    if not isinstance(control, Mapping):
        raise SnapshotValidationError("control must be an object")
    _require_exact_keys(control, {"meta_g_value"}, "control")
    if _required_text(control["meta_g_value"], "control.meta_g_value") != source:
        raise SnapshotValidationError("control.meta_g_value must equal source_data_version")


def validate_v1_snapshot(snapshot: Mapping[str, Any]) -> None:
    """Strict legacy parser used only by the explicit v1→v2 migration path."""
    if not isinstance(snapshot, Mapping):
        raise SnapshotValidationError("legacy snapshot must be an object")
    _require_exact_keys(
        snapshot,
        {
            "schema_version",
            "projection_version",
            "source_data_version",
            "committed_at",
            "movie_count",
            "movie_hashes",
            "control",
        },
        "legacy snapshot",
    )
    if (
        not isinstance(snapshot["schema_version"], int)
        or isinstance(snapshot["schema_version"], bool)
        or snapshot["schema_version"] != LEGACY_SNAPSHOT_SCHEMA_VERSION
    ):
        raise SnapshotValidationError("legacy schema_version must be 1")
    if snapshot["projection_version"] != LEGACY_OG_PROJECTION_VERSION:
        raise SnapshotValidationError("legacy projection_version must be og-index-v1")
    source = _required_text(snapshot["source_data_version"], "source_data_version")
    _required_text(snapshot["committed_at"], "committed_at")
    _validate_hashes(snapshot["movie_hashes"], snapshot["movie_count"])
    control = snapshot["control"]
    if not isinstance(control, Mapping):
        raise SnapshotValidationError("legacy control must be an object")
    _require_exact_keys(control, {"today_value", "meta_g_value"}, "legacy control")
    if not isinstance(control["today_value"], str):
        raise SnapshotValidationError("legacy control.today_value must be a string")
    if _required_text(control["meta_g_value"], "legacy control.meta_g_value") != source:
        raise SnapshotValidationError("legacy control.meta_g_value must equal source_data_version")
    # v1 must be complete, including a canonical JSON Today payload, though it is discarded.
    try:
        today = json.loads(control["today_value"])
    except json.JSONDecodeError as exc:
        raise SnapshotValidationError("legacy control.today_value must be JSON") from exc
    if (
        not isinstance(today, dict)
        or set(today) != {"date", "movie_id"}
        or not isinstance(today["date"], str)
        or not isinstance(today["movie_id"], int)
        or isinstance(today["movie_id"], bool)
        or today["movie_id"] <= 0
        or control["today_value"] != canonical_json(today)
    ):
        raise SnapshotValidationError("legacy control.today_value is invalid")
    try:
        if date.fromisoformat(today["date"]).isoformat() != today["date"]:
            raise ValueError
    except ValueError as exc:
        raise SnapshotValidationError("legacy control.today_value date is invalid") from exc
    hashes = snapshot["movie_hashes"]
    assert isinstance(hashes, Mapping)
    if movie_kv_key(today["movie_id"]) not in hashes:
        raise SnapshotValidationError("legacy Today movie_id must exist in movie_hashes")


def v2_from_v1(snapshot: Mapping[str, Any], *, committed_at: str) -> dict[str, Any]:
    """Drop the validated legacy Today control; never write a v1 checkpoint."""
    validate_v1_snapshot(snapshot)
    hashes = dict(snapshot["movie_hashes"])
    candidate = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "projection_version": OG_PROJECTION_VERSION,
        "source_data_version": snapshot["source_data_version"],
        "committed_at": _required_text(committed_at, "committed_at"),
        "movie_count": snapshot["movie_count"],
        "movie_hashes": hashes,
        "control": {"meta_g_value": snapshot["control"]["meta_g_value"]},
    }
    validate_snapshot(candidate)
    return candidate


def _parse(raw: str) -> dict[str, Any]:
    if not isinstance(raw, str):
        raise SnapshotValidationError("snapshot JSON must be a string")

    def reject(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for key, value in pairs:
            if key in out:
                raise SnapshotValidationError(f"duplicate JSON key: {key!r}")
            out[key] = value
        return out

    try:
        parsed = json.loads(raw, object_pairs_hook=reject)
    except json.JSONDecodeError as exc:
        raise SnapshotValidationError("snapshot JSON is invalid") from exc
    if not isinstance(parsed, dict):
        raise SnapshotValidationError("snapshot must be an object")
    return parsed


def parse_snapshot_json(raw: str) -> dict[str, Any]:
    parsed = _parse(raw)
    validate_snapshot(parsed)
    return parsed


def parse_v1_snapshot_json(raw: str) -> dict[str, Any]:
    parsed = _parse(raw)
    validate_v1_snapshot(parsed)
    return parsed


def diff_snapshots(previous: Mapping[str, Any], current: Mapping[str, Any]) -> SnapshotDiff:
    validate_snapshot(previous)
    validate_snapshot(current)
    old, new = previous["movie_hashes"], current["movie_hashes"]
    assert isinstance(old, Mapping) and isinstance(new, Mapping)
    old_keys, new_keys = set(old), set(new)
    puts = {key for key in new_keys if old.get(key) != new[key]}
    deletes = old_keys - new_keys
    unchanged = (old_keys & new_keys) - puts
    assert puts.isdisjoint(deletes) and puts.isdisjoint(unchanged) and deletes.isdisjoint(unchanged)
    assert puts | unchanged == new_keys
    return SnapshotDiff(
        tuple(sorted(puts)),
        tuple(sorted(deletes)),
        tuple(sorted(unchanged)),
        len(new_keys),
        len(old_keys),
    )


__all__ = [
    "META_G_KEY",
    "MOVIE_KEY_PREFIX",
    "SNAPSHOT_SCHEMA_VERSION",
    "OG_PROJECTION_VERSION",
    "LEGACY_SNAPSHOT_SCHEMA_VERSION",
    "LEGACY_OG_PROJECTION_VERSION",
    "SnapshotDiff",
    "SnapshotValidationError",
    "build_snapshot",
    "canonical_json",
    "diff_snapshots",
    "movie_projection",
    "movie_projection_hash",
    "parse_snapshot_json",
    "parse_v1_snapshot_json",
    "sha256_hex",
    "validate_snapshot",
    "validate_v1_snapshot",
    "v2_from_v1",
]
