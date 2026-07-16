#!/usr/bin/env python3
"""Pure OG index projection, committed snapshot, and hash-diff domain helpers."""
from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from cron.og_index_kv import META_G_KEY, MOVIE_KEY_PREFIX, TODAY_KEY, movie_kv_key, movie_og_record, today_kv_value

SNAPSHOT_SCHEMA_VERSION = 1
OG_PROJECTION_VERSION = "og-index-v1"
_SHA256_HEX_RE = re.compile(r"^[0-9a-f]{64}$")
_MOVIE_KEY_RE = re.compile(r"^movie:[1-9][0-9]*$")


class SnapshotValidationError(ValueError):
    """Raised when an OG index committed snapshot is structurally unsafe."""


@dataclass(frozen=True)
class SnapshotDiff:
    """The mutation-free delta between a committed and candidate snapshot."""

    puts: tuple[str, ...]
    deletes: tuple[str, ...]
    unchanged: tuple[str, ...]
    current_count: int
    previous_count: int

    @property
    def stats(self) -> dict[str, int]:
        """Return compact counts suitable for caller-owned logging."""
        return {
            "current": self.current_count,
            "previous": self.previous_count,
            "puts": len(self.puts),
            "deletes": len(self.deletes),
            "unchanged": len(self.unchanged),
        }


def canonical_json(value: Any) -> str:
    """Encode JSON deterministically for stable content hashing."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha256_hex(value: str) -> str:
    """Return the lowercase SHA-256 hex digest of a UTF-8 string."""
    assert isinstance(value, str), f"value must be str, got {type(value).__name__}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def movie_projection(movie: Mapping[str, Any]) -> dict[str, Any]:
    """Return the canonical OG field projection for one galaxy movie row."""
    return movie_og_record(dict(movie))


def movie_projection_hash(movie: Mapping[str, Any]) -> str:
    """Hash only the fields that define the Worker movie OG record."""
    return sha256_hex(canonical_json(movie_projection(movie)))


def build_snapshot(
    *,
    source_data_version: str,
    committed_at: str,
    movies: Sequence[Mapping[str, Any]],
    today_payload: Mapping[str, Any],
) -> dict[str, Any]:
    """Build and validate an immutable-by-convention candidate writer checkpoint."""
    source_version = _required_text(source_data_version, "source_data_version")
    committed = _required_text(committed_at, "committed_at")
    if not isinstance(today_payload, Mapping):
        raise SnapshotValidationError("today_payload must be an object")
    today_value = _canonical_today_value(today_payload)

    movie_hashes: dict[str, str] = {}
    for movie in movies:
        if not isinstance(movie, Mapping):
            raise SnapshotValidationError("each movie must be an object")
        movie_id = movie.get("id")
        if not isinstance(movie_id, int) or isinstance(movie_id, bool):
            raise SnapshotValidationError(f"movie id must be int, got {movie_id!r}")
        key = movie_kv_key(movie_id)
        if key in movie_hashes:
            raise SnapshotValidationError(f"duplicate movie key: {key}")
        movie_hashes[key] = movie_projection_hash(movie)

    snapshot = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "projection_version": OG_PROJECTION_VERSION,
        "source_data_version": source_version,
        "committed_at": committed,
        "movie_count": len(movie_hashes),
        "movie_hashes": movie_hashes,
        "control": {
            "today_value": today_value,
            "meta_g_value": source_version,
        },
    }
    validate_snapshot(snapshot)
    return snapshot


def validate_snapshot(snapshot: Mapping[str, Any]) -> None:
    """Fail fast unless a snapshot is safe to use as a deletion checkpoint."""
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
    schema_version = snapshot["schema_version"]
    if (
        not isinstance(schema_version, int)
        or isinstance(schema_version, bool)
        or schema_version != SNAPSHOT_SCHEMA_VERSION
    ):
        raise SnapshotValidationError(f"unknown schema_version: {schema_version!r}")
    if snapshot["projection_version"] != OG_PROJECTION_VERSION:
        raise SnapshotValidationError(f"unknown projection_version: {snapshot['projection_version']!r}")
    _required_text(snapshot["source_data_version"], "source_data_version")
    _required_text(snapshot["committed_at"], "committed_at")

    movie_count = snapshot["movie_count"]
    if not isinstance(movie_count, int) or isinstance(movie_count, bool) or movie_count < 0:
        raise SnapshotValidationError("movie_count must be a non-negative int")
    movie_hashes = snapshot["movie_hashes"]
    if not isinstance(movie_hashes, Mapping):
        raise SnapshotValidationError("movie_hashes must be an object")
    if len(movie_hashes) != movie_count:
        raise SnapshotValidationError(
            f"movie_count {movie_count} does not match movie_hashes {len(movie_hashes)}"
        )
    for key, digest in movie_hashes.items():
        _validate_movie_hash(key, digest)

    control = snapshot["control"]
    if not isinstance(control, Mapping):
        raise SnapshotValidationError("control must be an object")
    _require_exact_keys(control, {"today_value", "meta_g_value"}, "control")
    today_value = control["today_value"]
    meta_g_value = control["meta_g_value"]
    if not isinstance(today_value, str):
        raise SnapshotValidationError("control.today_value must be a string")
    if not isinstance(meta_g_value, str):
        raise SnapshotValidationError("control.meta_g_value must be a string")
    if meta_g_value != snapshot["source_data_version"]:
        raise SnapshotValidationError("control.meta_g_value must equal source_data_version")
    _validate_today_value(today_value)


def parse_snapshot_json(raw: str) -> dict[str, Any]:
    """Parse a snapshot while rejecting duplicate JSON keys before validation."""
    if not isinstance(raw, str):
        raise SnapshotValidationError("snapshot JSON must be a string")

    def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        parsed: dict[str, Any] = {}
        for key, value in pairs:
            if key in parsed:
                raise SnapshotValidationError(f"duplicate JSON key: {key!r}")
            parsed[key] = value
        return parsed

    try:
        parsed = json.loads(raw, object_pairs_hook=reject_duplicate_keys)
    except json.JSONDecodeError as exc:
        raise SnapshotValidationError("snapshot JSON is invalid") from exc
    if not isinstance(parsed, dict):
        raise SnapshotValidationError("snapshot must be an object")
    validate_snapshot(parsed)
    return parsed


def diff_snapshots(previous: Mapping[str, Any], current: Mapping[str, Any]) -> SnapshotDiff:
    """Compute sorted movie key PUT/DELETE/unchanged sets without network side effects."""
    validate_snapshot(previous)
    validate_snapshot(current)
    previous_hashes = previous["movie_hashes"]
    current_hashes = current["movie_hashes"]
    assert isinstance(previous_hashes, Mapping)
    assert isinstance(current_hashes, Mapping)

    previous_keys = set(previous_hashes)
    current_keys = set(current_hashes)
    added = current_keys - previous_keys
    changed = {key for key in current_keys & previous_keys if current_hashes[key] != previous_hashes[key]}
    puts = added | changed
    deletes = previous_keys - current_keys
    unchanged = (current_keys & previous_keys) - changed

    assert puts.isdisjoint(deletes)
    assert puts.isdisjoint(unchanged)
    assert deletes.isdisjoint(unchanged)
    assert puts | unchanged == current_keys
    assert deletes | unchanged | changed == previous_keys
    assert puts == added | changed
    assert puts | deletes | unchanged == current_keys | previous_keys
    assert changed <= previous_keys
    assert changed <= current_keys

    return SnapshotDiff(
        puts=tuple(sorted(puts)),
        deletes=tuple(sorted(deletes)),
        unchanged=tuple(sorted(unchanged)),
        current_count=len(current_keys),
        previous_count=len(previous_keys),
    )


def _required_text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SnapshotValidationError(f"{name} must be a non-empty string")
    return value.strip()


def _require_exact_keys(value: Mapping[str, Any], expected: set[str], name: str) -> None:
    actual = set(value)
    missing = expected - actual
    unexpected = actual - expected
    if missing or unexpected:
        missing_repr = sorted(repr(key) for key in missing)
        unexpected_repr = sorted(repr(key) for key in unexpected)
        raise SnapshotValidationError(
            f"{name} keys invalid: missing={missing_repr!r} unexpected={unexpected_repr!r}"
        )


def _validate_movie_hash(key: Any, digest: Any) -> None:
    if not isinstance(key, str) or not _MOVIE_KEY_RE.fullmatch(key):
        raise SnapshotValidationError(f"illegal movie key: {key!r}")
    if not isinstance(digest, str) or not _SHA256_HEX_RE.fullmatch(digest):
        raise SnapshotValidationError(f"illegal SHA-256 for {key!r}")


def _canonical_today_value(today_payload: Mapping[str, Any]) -> str:
    movie_id = today_payload.get("movie_id")
    if not isinstance(movie_id, int) or isinstance(movie_id, bool):
        raise SnapshotValidationError(f"today movie_id must be int, got {movie_id!r}")
    try:
        return canonical_json(today_kv_value(dict(today_payload)))
    except AssertionError as exc:
        raise SnapshotValidationError("today payload is invalid") from exc


def _validate_today_value(today_value: str) -> None:
    try:
        parsed = json.loads(today_value)
    except json.JSONDecodeError as exc:
        raise SnapshotValidationError("control.today_value must be canonical today JSON") from exc
    if not isinstance(parsed, dict):
        raise SnapshotValidationError("control.today_value must encode an object")
    expected = _canonical_today_value(parsed)
    if today_value != expected:
        raise SnapshotValidationError("control.today_value must be canonical today JSON")


__all__ = [
    "META_G_KEY",
    "MOVIE_KEY_PREFIX",
    "OG_PROJECTION_VERSION",
    "SNAPSHOT_SCHEMA_VERSION",
    "TODAY_KEY",
    "SnapshotDiff",
    "SnapshotValidationError",
    "build_snapshot",
    "canonical_json",
    "diff_snapshots",
    "movie_projection",
    "movie_projection_hash",
    "parse_snapshot_json",
    "sha256_hex",
    "validate_snapshot",
]