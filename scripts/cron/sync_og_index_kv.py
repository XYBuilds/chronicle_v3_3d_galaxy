#!/usr/bin/env python3
"""Incrementally publish the OG index KV from galaxy export state.

The module deliberately separates pure candidate planning from Cloudflare side
 effects.  A committed R2 snapshot is the normal deletion checkpoint; the only
exception is an explicitly requested, read-only remote audit used to bootstrap
that checkpoint once.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from types import MappingProxyType
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS_DIR = _REPO_ROOT / "scripts"
_DEFAULT_PUBLIC_DATA = _REPO_ROOT / "frontend" / "public" / "data"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.og_index_kv import (  # noqa: E402
    DEFAULT_BULK_BATCH_SIZE,
    META_G_KEY,
    TODAY_KEY,
    _required_kv_env,
    kv_bulk_delete,
    kv_bulk_put,
    kv_list_movie_keys,
    kv_read_many,
    load_galaxy_movies,
    movie_kv_key,
    today_kv_value,
    verify_kv_absent,
    verify_kv_values,
)
from cron.og_index_snapshot_r2 import (  # noqa: E402
    SnapshotCorruptError,
    SnapshotMissingError,
    SnapshotRepositoryError,
    commit_snapshot,
    create_r2_client,
    load_snapshot,
)
from cron.og_index_state import (  # noqa: E402
    SnapshotValidationError,
    build_snapshot,
    canonical_json,
    diff_snapshots,
    movie_projection,
    sha256_hex,
    validate_snapshot,
)

DEFAULT_MAX_PUTS = 900
DEFAULT_MAX_DELETES = 900
SAMPLE_KEY_LIMIT = 10
_MOVIE_KEY_RE = re.compile(r"^movie:([1-9][0-9]*)$")


class QuotaExceededError(RuntimeError):
    """A pure plan exceeds the explicit Cloudflare daily safety budget."""


class RemoteAuditError(RuntimeError):
    """Remote KV state cannot safely be used as a bootstrap baseline."""


class CredentialsError(RuntimeError):
    """A requested side effect lacks the credentials required to perform it."""


def _freeze_json(value: Any) -> Any:
    if isinstance(value, Mapping):
        return MappingProxyType({key: _freeze_json(item) for key, item in value.items()})
    if isinstance(value, (list, tuple)):
        return tuple(_freeze_json(item) for item in value)
    return value


def _thaw_json(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {key: _thaw_json(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [_thaw_json(item) for item in value]
    return value


@dataclass(frozen=True)
class RemoteAuditState:
    """Strictly parsed read-only remote baseline; controls may legitimately miss."""

    movie_hashes: Mapping[str, str]
    today_value: str | None
    meta_g_value: str | None

    def __post_init__(self) -> None:
        _validate_hash_mapping(self.movie_hashes)
        object.__setattr__(self, "movie_hashes", MappingProxyType(dict(self.movie_hashes)))
        if self.today_value is not None:
            _validate_today_control(self.today_value, label="remote today")
        if self.meta_g_value is not None and (not isinstance(self.meta_g_value, str) or not self.meta_g_value.strip()):
            raise RemoteAuditError("remote meta:G must be a non-empty string when present")


@dataclass(frozen=True)
class MutationPlan:
    """Immutable, side-effect-free KV transaction candidate."""

    current_snapshot: Mapping[str, Any]
    movie_puts: tuple[tuple[str, str], ...]
    movie_deletes: tuple[str, ...]
    today_put: str | None
    meta_put: str | None
    unchanged_count: int
    previous_count: int
    expected_remote_movie_keys: tuple[str, ...] | None = None
    bootstrap: bool = False

    def __post_init__(self) -> None:
        validate_snapshot(self.current_snapshot)
        object.__setattr__(self, "current_snapshot", _freeze_json(self.current_snapshot))

        if isinstance(self.movie_puts, (str, bytes)):
            raise AssertionError("movie PUTs must be a sequence of key/value pairs")
        normalized_puts: list[tuple[str, str]] = []
        for entry in self.movie_puts:
            if not isinstance(entry, (list, tuple)) or len(entry) != 2:
                raise AssertionError("each movie PUT must be a key/value pair")
            key, value = entry
            if not isinstance(key, str) or not isinstance(value, str):
                raise AssertionError("movie PUT key and value must be strings")
            normalized_puts.append((key, value))
        movie_puts = tuple(normalized_puts)
        object.__setattr__(self, "movie_puts", movie_puts)

        try:
            original_deletes = tuple(self.movie_deletes)
            normalized_deletes = _validate_remote_movie_keys(original_deletes)
        except (TypeError, RemoteAuditError) as exc:
            raise AssertionError("movie DELETE keys are invalid") from exc
        if original_deletes != normalized_deletes:
            raise AssertionError("movie DELETE keys must be unique and sorted")
        object.__setattr__(self, "movie_deletes", normalized_deletes)

        if not isinstance(self.bootstrap, bool):
            raise AssertionError("bootstrap must be bool")

        current_hashes = self.current_snapshot["movie_hashes"]
        current_keys = set(current_hashes)
        keys = [key for key, _value in movie_puts]
        if keys != sorted(keys):
            raise AssertionError("movie PUT keys must be sorted")
        if not set(keys) <= current_keys:
            raise AssertionError("movie PUT keys must exist in the current snapshot")
        _validate_hash_mapping({key: current_hashes[key] for key in keys})
        if len(set(keys)) != len(keys):
            raise AssertionError("movie PUT keys must be unique")
        if set(keys) & set(normalized_deletes):
            raise AssertionError("movie PUT and DELETE keys must be disjoint")
        if set(normalized_deletes) & current_keys:
            raise AssertionError("movie DELETE keys must be absent from the current snapshot")
        if (
            not isinstance(self.unchanged_count, int)
            or isinstance(self.unchanged_count, bool)
            or self.unchanged_count < 0
            or not isinstance(self.previous_count, int)
            or isinstance(self.previous_count, bool)
            or self.previous_count < 0
        ):
            raise AssertionError("mutation plan counts must be non-negative integers")
        if self.unchanged_count + len(movie_puts) != len(current_keys):
            raise AssertionError("movie PUT and unchanged counts must cover the current snapshot")
        minimum_previous = self.unchanged_count + len(normalized_deletes)
        maximum_previous = minimum_previous + len(movie_puts)
        if not minimum_previous <= self.previous_count <= maximum_previous:
            raise AssertionError("previous count is inconsistent with the mutation sets")
        if self.expected_remote_movie_keys is not None:
            try:
                original_expected = tuple(self.expected_remote_movie_keys)
                normalized_expected = _validate_remote_movie_keys(original_expected)
            except (TypeError, RemoteAuditError) as exc:
                raise AssertionError("final remote movie keyset is invalid") from exc
            expected_keys = tuple(sorted(current_keys))
            if original_expected != normalized_expected or normalized_expected != expected_keys:
                raise AssertionError("final remote movie keyset must equal the current snapshot")
            if tuple(keys) != expected_keys or self.unchanged_count != 0:
                raise AssertionError("full recovery must PUT the complete current movie keyspace")
            if self.today_put is None or self.meta_put is None:
                raise AssertionError("full recovery must PUT both control keys")
            object.__setattr__(self, "expected_remote_movie_keys", normalized_expected)
        for key, value in movie_puts:
            try:
                is_canonical = isinstance(value, str) and value == canonical_json(json.loads(value))
            except (TypeError, ValueError) as exc:
                raise AssertionError(f"movie PUT is not canonical JSON: {key}") from exc
            if not is_canonical:
                raise AssertionError(f"movie PUT is not canonical JSON: {key}")
            try:
                digest = _strict_movie_value_hash(key, value, label="movie PUT")
            except RemoteAuditError as exc:
                raise AssertionError(f"movie PUT payload is invalid: {key}") from exc
            if digest != current_hashes[key]:
                raise AssertionError(f"movie PUT hash differs from the current snapshot: {key}")

        control = self.current_snapshot["control"]
        current_today = control["today_value"]
        current_meta = control["meta_g_value"]
        try:
            _validate_today_control(current_today, label="current today")
            current_today_payload = _parse_json_object(current_today, label="current today")
        except RemoteAuditError as exc:
            raise SnapshotValidationError(str(exc)) from exc
        if f"movie:{current_today_payload['movie_id']}" not in current_keys:
            raise SnapshotValidationError("current today movie_id must exist in the current snapshot")
        if self.today_put is not None and self.today_put != current_today:
            raise AssertionError("today PUT must equal the current snapshot control")
        if self.meta_put is not None and self.meta_put != current_meta:
            raise AssertionError("meta:G PUT must equal the current snapshot control")

    @property
    def control_put_count(self) -> int:
        return int(self.today_put is not None) + int(self.meta_put is not None)

    @property
    def total_put(self) -> int:
        return len(self.movie_puts) + self.control_put_count

    def summary(self, *, batch_size: int, dry_run: bool) -> dict[str, int | bool | list[str]]:
        _require_batch_size(batch_size)
        return {
            "current": int(self.current_snapshot["movie_count"]),
            "previous": self.previous_count,
            "movie_put": len(self.movie_puts),
            "delete": len(self.movie_deletes),
            "mismatch": len(self.movie_puts) + len(self.movie_deletes),
            "unchanged": self.unchanged_count,
            "control_put": self.control_put_count,
            "total_put": self.total_put,
            "movie_put_batches": _batches(len(self.movie_puts), batch_size),
            "control_put_batches": self.control_put_count,
            "put_batches": _batches(len(self.movie_puts), batch_size) + self.control_put_count,
            "delete_batches": _batches(len(self.movie_deletes), batch_size),
            "audit_read": self.previous_count + 2 if self.bootstrap else 0,
            "read_back": self.total_put + len(self.movie_deletes),
            "read": (self.previous_count + 2 if self.bootstrap else 0) + self.total_put + len(self.movie_deletes),
            "dry_run": dry_run,
            "bootstrap": self.bootstrap,
            "verify_final_keyset": self.expected_remote_movie_keys is not None,
            "sample_keys": list((tuple(key for key, _ in self.movie_puts) + self.movie_deletes)[:SAMPLE_KEY_LIMIT]),
        }


def _batches(count: int, batch_size: int) -> int:
    return int(math.ceil(count / batch_size)) if count else 0


def _require_batch_size(batch_size: int) -> None:
    if not isinstance(batch_size, int) or isinstance(batch_size, bool) or not 1 <= batch_size <= 10_000:
        raise ValueError(f"batch_size must be in 1..10000, got {batch_size!r}")


def _movie_values(movies: Sequence[Mapping[str, Any]]) -> dict[str, str]:
    """Build the exact canonical strings that would be sent to KV."""
    out: dict[str, str] = {}
    for movie in movies:
        movie_id = movie.get("id")
        if not isinstance(movie_id, int) or isinstance(movie_id, bool) or movie_id <= 0:
            raise SnapshotValidationError(f"movie id must be a positive int, got {movie_id!r}")
        key = movie_kv_key(movie_id)
        if key in out:
            raise SnapshotValidationError(f"duplicate movie key: {key}")
        projection = movie_projection(movie)
        if (
            not all(isinstance(projection[field], str) for field in ("title", "release_date", "poster_url"))
            or not isinstance(projection["genres"], list)
            or not all(isinstance(genre, str) for genre in projection["genres"])
        ):
            raise SnapshotValidationError(f"movie projection has invalid field types: {key}")
        out[key] = canonical_json(projection)
    return out


def _validate_hash_mapping(hashes: Mapping[str, str]) -> None:
    if not isinstance(hashes, Mapping):
        raise RemoteAuditError("movie hashes must be a mapping")
    for key, digest in hashes.items():
        if not isinstance(key, str) or not _MOVIE_KEY_RE.fullmatch(key):
            raise RemoteAuditError(f"illegal remote movie key: {key!r}")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise RemoteAuditError(f"illegal remote movie hash for {key!r}")


def _parse_json_object(value: str, *, label: str) -> dict[str, Any]:
    if not isinstance(value, str):
        raise RemoteAuditError(f"{label} must be a JSON string")

    def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        parsed: dict[str, Any] = {}
        for key, item in pairs:
            if key in parsed:
                raise RemoteAuditError(f"{label} contains duplicate JSON key: {key!r}")
            parsed[key] = item
        return parsed

    try:
        parsed = json.loads(value, object_pairs_hook=reject_duplicate_keys)
    except json.JSONDecodeError as exc:
        raise RemoteAuditError(f"{label} is invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise RemoteAuditError(f"{label} must encode an object")
    return parsed


def _validate_today_control(value: str, *, label: str) -> None:
    parsed = _parse_json_object(value, label=label)
    if set(parsed) != {"date", "movie_id"}:
        raise RemoteAuditError(f"{label} must have exactly date and movie_id")
    movie_id = parsed["movie_id"]
    date_value = parsed["date"]
    if (
        not isinstance(date_value, str)
        or not isinstance(movie_id, int)
        or isinstance(movie_id, bool)
        or movie_id <= 0
    ):
        raise RemoteAuditError(f"{label} has invalid field types")
    try:
        if date.fromisoformat(date_value).isoformat() != date_value:
            raise ValueError
    except ValueError as exc:
        raise RemoteAuditError(f"{label} date must be YYYY-MM-DD") from exc
    if value != canonical_json(today_kv_value(parsed)):
        raise RemoteAuditError(f"{label} must be canonical JSON")


def _hash_map_diff(previous_hashes: Mapping[str, str], current_hashes: Mapping[str, str]) -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    """Return sorted puts/deletes/unchanged with explicit set invariants."""
    _validate_hash_mapping(previous_hashes)
    _validate_hash_mapping(current_hashes)
    old_keys, new_keys = set(previous_hashes), set(current_hashes)
    puts = {key for key in new_keys if previous_hashes.get(key) != current_hashes[key]}
    deletes = old_keys - new_keys
    unchanged = (old_keys & new_keys) - puts
    assert puts.isdisjoint(deletes) and puts.isdisjoint(unchanged) and deletes.isdisjoint(unchanged)
    assert puts | unchanged == new_keys
    assert deletes | unchanged | (puts & old_keys) == old_keys
    return tuple(sorted(puts)), tuple(sorted(deletes)), tuple(sorted(unchanged))


def _plan_from_diff(*, current: Mapping[str, Any], movies: Sequence[Mapping[str, Any]], puts: Sequence[str], deletes: Sequence[str], unchanged: int, previous_count: int, previous_today: str | None, previous_meta: str | None, bootstrap: bool, expected_remote_movie_keys: tuple[str, ...] | None = None) -> MutationPlan:
    validate_snapshot(current)
    values = _movie_values(movies)
    assert set(values) == set(current["movie_hashes"]), "movie values and snapshot hashes diverged"
    movie_puts = tuple((key, values[key]) for key in puts)
    control = current["control"]
    assert isinstance(control, Mapping)
    today = control["today_value"]
    meta = control["meta_g_value"]
    assert isinstance(today, str) and isinstance(meta, str)
    return MutationPlan(
        current_snapshot=current,
        movie_puts=movie_puts,
        movie_deletes=tuple(deletes),
        today_put=today if previous_today != today else None,
        meta_put=meta if previous_meta != meta else None,
        unchanged_count=unchanged,
        previous_count=previous_count,
        expected_remote_movie_keys=expected_remote_movie_keys,
        bootstrap=bootstrap,
    )


def build_incremental_plan(previous: Mapping[str, Any], current: Mapping[str, Any], movies: Sequence[Mapping[str, Any]]) -> MutationPlan:
    """Plan normal incremental writes from a complete, committed snapshot."""
    validate_snapshot(previous)
    validate_snapshot(current)
    delta = diff_snapshots(previous, current)
    old_control = previous["control"]
    assert isinstance(old_control, Mapping)
    return _plan_from_diff(
        current=current, movies=movies, puts=delta.puts, deletes=delta.deletes,
        unchanged=len(delta.unchanged), previous_count=delta.previous_count,
        previous_today=old_control["today_value"],
        previous_meta=old_control["meta_g_value"], bootstrap=False,
    )


def build_bootstrap_plan(remote: RemoteAuditState, current: Mapping[str, Any], movies: Sequence[Mapping[str, Any]]) -> MutationPlan:
    """Plan a one-off repair from a strict remote audit, not a fake snapshot."""
    validate_snapshot(current)
    puts, deletes, unchanged = _hash_map_diff(remote.movie_hashes, current["movie_hashes"])
    return _plan_from_diff(
        current=current, movies=movies, puts=puts, deletes=deletes, unchanged=len(unchanged), previous_count=len(remote.movie_hashes),
        previous_today=remote.today_value, previous_meta=remote.meta_g_value, bootstrap=True,
    )


def build_full_recovery_plan(
    current: Mapping[str, Any],
    movies: Sequence[Mapping[str, Any]],
    remote_movie_keys: Sequence[str],
) -> MutationPlan:
    """Explicit disaster path: replace the complete remote movie keyspace."""
    validate_snapshot(current)
    remote_keys = _validate_remote_movie_keys(remote_movie_keys)
    current_keys = tuple(sorted(current["movie_hashes"]))
    return _plan_from_diff(
        current=current,
        movies=movies,
        puts=current_keys,
        deletes=tuple(sorted(set(remote_keys) - set(current_keys))),
        unchanged=0,
        previous_count=len(remote_keys),
        previous_today=None,
        previous_meta=None,
        bootstrap=False,
        expected_remote_movie_keys=current_keys,
    )


def enforce_quota(
    plan: MutationPlan,
    *,
    max_puts: int = DEFAULT_MAX_PUTS,
    max_deletes: int = DEFAULT_MAX_DELETES,
    allow_over_quota: bool = False,
    batch_size: int = DEFAULT_BULK_BATCH_SIZE,
    dry_run: bool = False,
) -> None:
    _require_batch_size(batch_size)
    if not isinstance(dry_run, bool):
        raise ValueError("dry_run must be bool")
    if not isinstance(allow_over_quota, bool):
        raise ValueError("allow_over_quota must be bool")
    if (
        not isinstance(max_puts, int)
        or isinstance(max_puts, bool)
        or not isinstance(max_deletes, int)
        or isinstance(max_deletes, bool)
        or max_puts < 0
        or max_deletes < 0
    ):
        raise ValueError("quota values must be non-negative integers")
    if not allow_over_quota and (plan.total_put > max_puts or len(plan.movie_deletes) > max_deletes):
        summary = plan.summary(batch_size=batch_size, dry_run=dry_run)
        raise QuotaExceededError("OG_INDEX_QUOTA_EXCEEDED " + json.dumps(summary, sort_keys=True, separators=(",", ":")))


def _kv_args(env: Mapping[str, str]) -> dict[str, str]:
    if not isinstance(env, Mapping):
        raise CredentialsError("KV credentials must be a mapping")
    required = {
        "CLOUDFLARE_ACCOUNT_ID": "account_id",
        "OG_INDEX_KV_NAMESPACE_ID": "namespace_id",
        "CLOUDFLARE_API_TOKEN": "api_token",
    }
    args: dict[str, str] = {}
    for env_name, argument_name in required.items():
        value = env.get(env_name)
        if not isinstance(value, str) or not value.strip():
            raise CredentialsError(f"KV credentials missing {env_name}")
        args[argument_name] = value.strip()
    return args


def _validate_remote_movie_keys(keys: Sequence[str]) -> tuple[str, ...]:
    if isinstance(keys, (str, bytes)):
        raise RemoteAuditError("remote movie key list must be a sequence")
    normalized = tuple(keys)
    for key in normalized:
        if not isinstance(key, str) or _MOVIE_KEY_RE.fullmatch(key) is None:
            raise RemoteAuditError(f"illegal remote movie key: {key!r}")
    if len(set(normalized)) != len(normalized):
        raise RemoteAuditError("remote list contains duplicate movie keys")
    return tuple(sorted(normalized))


def read_remote_movie_keys(*, kv_env: Mapping[str, str]) -> tuple[str, ...]:
    """List and validate the complete remote ``movie:*`` keyspace."""
    return _validate_remote_movie_keys(kv_list_movie_keys(**_kv_args(kv_env)))


def execute_plan(plan: MutationPlan, *, kv_env: Mapping[str, str], r2_client: Any, r2_bucket: str, batch_size: int, dry_run: bool) -> None:
    """Execute D3 in order; any error propagates before snapshot advancement."""
    _require_batch_size(batch_size)
    if not isinstance(dry_run, bool):
        raise ValueError("dry_run must be bool")
    if dry_run:
        return
    if r2_client is None or not isinstance(r2_bucket, str) or not r2_bucket.strip():
        raise CredentialsError("R2 snapshot client and bucket are required before KV mutation")
    args = _kv_args(kv_env)
    # D3.1: all movie PUTs.
    for start in range(0, len(plan.movie_puts), batch_size):
        chunk = [{"key": key, "value": value} for key, value in plan.movie_puts[start : start + batch_size]]
        kv_bulk_put(**args, batch=chunk)
    # D3.2: all movie DELETEs.
    for start in range(0, len(plan.movie_deletes), batch_size):
        kv_bulk_delete(**args, keys=plan.movie_deletes[start : start + batch_size])
    # D3.3/4: controls, with meta:G always last.
    if plan.today_put is not None:
        kv_bulk_put(**args, batch=[{"key": TODAY_KEY, "value": plan.today_put}])
    if plan.meta_put is not None:
        kv_bulk_put(**args, batch=[{"key": META_G_KEY, "value": plan.meta_put}])
    expected = {key: value for key, value in plan.movie_puts}
    if plan.today_put is not None:
        expected[TODAY_KEY] = plan.today_put
    if plan.meta_put is not None:
        expected[META_G_KEY] = plan.meta_put
    if expected:
        verify_kv_values(**args, expected=expected)
    if plan.movie_deletes:
        verify_kv_absent(**args, keys=plan.movie_deletes)
    if plan.expected_remote_movie_keys is not None:
        actual_keys = read_remote_movie_keys(kv_env=kv_env)
        if actual_keys != plan.expected_remote_movie_keys:
            raise RemoteAuditError(
                "full recovery final movie keyset mismatch "
                f"expected={len(plan.expected_remote_movie_keys)} actual={len(actual_keys)}"
            )
    snapshot_to_commit = _thaw_json(plan.current_snapshot)
    assert isinstance(snapshot_to_commit, dict)
    commit_snapshot(client=r2_client, bucket=r2_bucket, snapshot=snapshot_to_commit)


def _strict_movie_value_hash(key: str, value: str | None, *, label: str) -> str:
    match = _MOVIE_KEY_RE.fullmatch(key)
    if match is None or value is None:
        raise RemoteAuditError(f"{label} entry invalid for key {key!r}")
    parsed = _parse_json_object(value, label=f"{label} {key!r}")
    expected = {"title", "release_date", "genres", "poster_url"}
    if set(parsed) != expected:
        raise RemoteAuditError(f"{label} has invalid OG shape for key {key!r}")
    if not all(isinstance(parsed[field], str) for field in ("title", "release_date", "poster_url")):
        raise RemoteAuditError(f"{label} strings invalid for key {key!r}")
    if not isinstance(parsed["genres"], list) or not all(isinstance(item, str) for item in parsed["genres"]):
        raise RemoteAuditError(f"{label} genres invalid for key {key!r}")
    return sha256_hex(canonical_json(parsed))


def read_remote_audit_state(*, kv_env: Mapping[str, str]) -> RemoteAuditState:
    """List and strictly normalize remote KV. The adapter limits each GET to 100."""
    args = _kv_args(kv_env)
    keys = read_remote_movie_keys(kv_env=kv_env)
    hashes: dict[str, str] = {}
    for start in range(0, len(keys), 100):
        batch = keys[start : start + 100]
        values = kv_read_many(**args, keys=batch)
        if set(values) != set(batch):
            raise RemoteAuditError("remote movie bulk read has missing or unexpected keys")
        for key in batch:
            if key in hashes:
                raise RemoteAuditError(f"duplicate remote movie key: {key}")
            hashes[key] = _strict_movie_value_hash(key, values[key], label="remote movie")
    controls = kv_read_many(**args, keys=[TODAY_KEY, META_G_KEY])
    if set(controls) != {TODAY_KEY, META_G_KEY}:
        raise RemoteAuditError("remote controls bulk read is incomplete")
    today = controls[TODAY_KEY]
    meta = controls[META_G_KEY]
    if today is not None:
        _validate_today_control(today, label="remote today")
    if meta is not None and (not isinstance(meta, str) or not meta.strip()):
        raise RemoteAuditError("remote meta:G is invalid")
    return RemoteAuditState(movie_hashes=hashes, today_value=today, meta_g_value=meta)


def _current_snapshot(
    public_data: Path,
    *,
    legacy_today_payload: Mapping[str, Any],
    committed_at: str | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Project current movies while retaining the committed v1 control until 40.4."""
    try:
        version, movies = load_galaxy_movies(public_data)
    except (AssertionError, json.JSONDecodeError, OSError) as exc:
        raise SnapshotValidationError(f"current OG export is invalid: {exc}") from exc
    timestamp = committed_at or datetime.now(timezone.utc).isoformat()
    current = build_snapshot(
        source_data_version=version,
        committed_at=timestamp,
        movies=movies,
        today_payload=legacy_today_payload,
    )
    return current, movies


def _legacy_today_payload(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    """Reuse the committed v1 control without reading or writing ``today.json``."""
    validate_snapshot(snapshot)
    control = snapshot["control"]
    assert isinstance(control, Mapping)
    return _legacy_today_payload_value(control["today_value"])


def _legacy_today_payload_from_remote(remote: RemoteAuditState) -> dict[str, Any]:
    """Use the audited legacy control only for explicit bootstrap/recovery paths."""
    return _legacy_today_payload_value(remote.today_value)


def _legacy_today_payload_value(today_value: str | None) -> dict[str, Any]:
    if today_value is None:
        raise SnapshotValidationError("committed v1 today control is missing; complete the explicit 40.4 migration")
    try:
        _validate_today_control(today_value, label="committed v1 today")
        return _parse_json_object(today_value, label="committed v1 today")
    except RemoteAuditError as exc:
        raise SnapshotValidationError(str(exc)) from exc


def run_sync(*, public_data: Path, scope: str = "incremental", dry_run: bool = False, bootstrap_remote_audit: bool = False, allow_full_recovery: bool = False, allow_over_quota: bool = False, max_puts: int = DEFAULT_MAX_PUTS, max_deletes: int = DEFAULT_MAX_DELETES, batch_size: int = DEFAULT_BULK_BATCH_SIZE, r2_client: Any | None = None, r2_bucket: str | None = None, kv_env: Mapping[str, str] | None = None) -> MutationPlan:
    """Application service: load, project, checkpoint/audit, plan, gate, execute."""
    _require_batch_size(batch_size)
    for name, value in (
        ("dry_run", dry_run),
        ("bootstrap_remote_audit", bootstrap_remote_audit),
        ("allow_full_recovery", allow_full_recovery),
        ("allow_over_quota", allow_over_quota),
    ):
        if not isinstance(value, bool):
            raise ValueError(f"{name} must be bool")
    if not isinstance(scope, str):
        raise ValueError("scope must be a string")
    scope = scope.strip().lower()
    if scope not in {"incremental", "full"}:
        raise ValueError(f"scope must be incremental or full, got {scope!r}")
    if scope == "full" and not allow_full_recovery:
        raise PermissionError("--scope full requires --allow-full-recovery")
    if bootstrap_remote_audit and scope != "incremental":
        raise ValueError("--bootstrap-remote-audit only supports incremental scope")
    try:
        load_galaxy_movies(public_data)
    except (AssertionError, json.JSONDecodeError, OSError) as exc:
        raise SnapshotValidationError(f"current OG export is invalid: {exc}") from exc
    if (r2_client is None) != (r2_bucket is None):
        raise CredentialsError("r2_client and r2_bucket must be provided together")
    if r2_client is None:
        r2_client, r2_bucket = create_r2_client()
    if not isinstance(r2_bucket, str) or not r2_bucket.strip():
        raise CredentialsError("R2 snapshot bucket is required")
    r2_bucket = r2_bucket.strip()

    if scope == "full":
        if kv_env is None:
            raise CredentialsError("full recovery requires KV read/write credentials")
        remote = read_remote_audit_state(kv_env=kv_env)
        current, movies = _current_snapshot(
            public_data,
            legacy_today_payload=_legacy_today_payload_from_remote(remote),
        )
        plan = build_full_recovery_plan(current, movies, tuple(remote.movie_hashes))
    else:
        try:
            previous = load_snapshot(client=r2_client, bucket=r2_bucket)
        except SnapshotMissingError as exc:
            if not bootstrap_remote_audit:
                raise SnapshotMissingError("R2 snapshot missing; run explicit --bootstrap-remote-audit after remote review") from exc
            if kv_env is None:
                raise CredentialsError("bootstrap remote audit requires KV read credentials")
            remote = read_remote_audit_state(kv_env=kv_env)
            current, movies = _current_snapshot(
                public_data,
                legacy_today_payload=_legacy_today_payload_from_remote(remote),
            )
            plan = build_bootstrap_plan(remote, current, movies)
        except SnapshotCorruptError:
            raise
        else:
            if bootstrap_remote_audit:
                raise RuntimeError("R2 committed snapshot already exists; use normal incremental mode")
            current, movies = _current_snapshot(
                public_data,
                legacy_today_payload=_legacy_today_payload(previous),
            )
            plan = build_incremental_plan(previous, current, movies)
    enforce_quota(
        plan,
        max_puts=max_puts,
        max_deletes=max_deletes,
        allow_over_quota=allow_over_quota,
        batch_size=batch_size,
        dry_run=dry_run,
    )
    print("OG_INDEX_SUMMARY " + json.dumps(plan.summary(batch_size=batch_size, dry_run=dry_run), sort_keys=True, separators=(",", ":")), flush=True)
    if dry_run:
        return plan
    if kv_env is None:
        raise CredentialsError("KV mutation requires CLOUDFLARE_ACCOUNT_ID, OG_INDEX_KV_NAMESPACE_ID, and OG_INDEX_KV_API_TOKEN (or CLOUDFLARE_API_TOKEN)")
    execute_plan(plan, kv_env=kv_env, r2_client=r2_client, r2_bucket=r2_bucket, batch_size=batch_size, dry_run=False)
    return plan


def main(argv: list[str] | None = None) -> int:
    env_path = _REPO_ROOT / ".env"
    if env_path.is_file():
        from dotenv import load_dotenv
        load_dotenv(env_path)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-data-dir", type=Path, default=_DEFAULT_PUBLIC_DATA)
    parser.add_argument("--scope", choices=("incremental", "full"), default="incremental")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--bootstrap-remote-audit", action="store_true")
    parser.add_argument("--allow-full-recovery", action="store_true")
    parser.add_argument("--allow-over-quota", action="store_true")
    parser.add_argument("--max-puts", type=int, default=os.environ.get("OG_INDEX_MAX_PUTS", str(DEFAULT_MAX_PUTS)))
    parser.add_argument("--max-deletes", type=int, default=os.environ.get("OG_INDEX_MAX_DELETES", str(DEFAULT_MAX_DELETES)))
    parser.add_argument("--batch-size", type=int, default=os.environ.get("OG_INDEX_KV_BATCH_SIZE", str(DEFAULT_BULK_BATCH_SIZE)))
    args = parser.parse_args(argv)
    kv_env = _required_kv_env()
    try:
        run_sync(public_data=args.public_data_dir.resolve(), scope=args.scope, dry_run=args.dry_run,
                 bootstrap_remote_audit=args.bootstrap_remote_audit, allow_full_recovery=args.allow_full_recovery,
                 allow_over_quota=args.allow_over_quota, max_puts=args.max_puts, max_deletes=args.max_deletes,
                 batch_size=args.batch_size, kv_env=kv_env)
    except (CredentialsError, QuotaExceededError, SnapshotMissingError, SnapshotCorruptError, SnapshotRepositoryError, RemoteAuditError, PermissionError, ValueError, RuntimeError) as exc:
        print(f"[og_index_kv] ERROR {exc}", file=sys.stderr, flush=True)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
