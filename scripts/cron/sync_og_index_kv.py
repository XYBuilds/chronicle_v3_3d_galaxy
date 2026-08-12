#!/usr/bin/env python3
"""Fail-closed OG-index v2 synchronizer and explicit v1 migration."""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
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
    load_galaxy_movies,
    movie_kv_key,
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
    load_v1_snapshot_for_migration,
)
from cron.og_index_state import (  # noqa: E402
    SnapshotValidationError,
    build_snapshot,
    canonical_json,
    diff_snapshots,
    movie_projection,
    sha256_hex,
    validate_snapshot,
    validate_v1_snapshot,
)

DEFAULT_MAX_PUTS = 900
DEFAULT_MAX_DELETES = 900
SAMPLE_KEY_LIMIT = 10
_MOVIE_KEY_RE = re.compile(r"^movie:([1-9][0-9]*)$")


class QuotaExceededError(RuntimeError):
    pass


class RemoteAuditError(RuntimeError):
    pass


class CredentialsError(RuntimeError):
    pass


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


def _require_batch_size(batch_size: int) -> None:
    if (
        not isinstance(batch_size, int)
        or isinstance(batch_size, bool)
        or not 1 <= batch_size <= 10_000
    ):
        raise ValueError(f"batch_size must be in 1..10000, got {batch_size!r}")


def _batches(count: int, batch_size: int) -> int:
    return int(math.ceil(count / batch_size)) if count else 0


def _kv_args(env: Mapping[str, str]) -> dict[str, str]:
    names = {
        "CLOUDFLARE_ACCOUNT_ID": "account_id",
        "OG_INDEX_KV_NAMESPACE_ID": "namespace_id",
        "CLOUDFLARE_API_TOKEN": "api_token",
    }
    args: dict[str, str] = {}
    for name, argument in names.items():
        value = env.get(name) if isinstance(env, Mapping) else None
        if not isinstance(value, str) or not value.strip():
            raise CredentialsError(f"KV credentials missing {name}")
        args[argument] = value.strip()
    return args


def _validate_remote_movie_keys(keys: Sequence[str]) -> tuple[str, ...]:
    if not isinstance(keys, Sequence) or isinstance(keys, (str, bytes)):
        raise RemoteAuditError("remote movie key list must be a sequence")
    out = tuple(keys)
    if (
        any(
            not isinstance(key, str) or not _MOVIE_KEY_RE.fullmatch(key)
            for key in out
        )
        or len(set(out)) != len(out)
    ):
        raise RemoteAuditError("remote movie keys are invalid")
    return tuple(sorted(out))


def read_remote_movie_keys(*, kv_env: Mapping[str, str]) -> tuple[str, ...]:
    return _validate_remote_movie_keys(kv_list_movie_keys(**_kv_args(kv_env)))


def _movie_values(movies: Sequence[Mapping[str, Any]]) -> dict[str, str]:
    values: dict[str, str] = {}
    for movie in movies:
        movie_id = movie.get("id")
        if not isinstance(movie_id, int) or isinstance(movie_id, bool) or movie_id <= 0:
            raise SnapshotValidationError(f"movie id must be a positive int, got {movie_id!r}")
        key = movie_kv_key(movie_id)
        if key in values:
            raise SnapshotValidationError(f"duplicate movie key: {key}")
        projection = movie_projection(movie)
        if (
            not all(
                isinstance(projection[field], str)
                for field in ("title", "release_date", "poster_url")
            )
            or not isinstance(projection["genres"], list)
            or not all(isinstance(item, str) for item in projection["genres"])
        ):
            raise SnapshotValidationError(f"movie projection has invalid field types: {key}")
        values[key] = canonical_json(projection)
    return values


@dataclass(frozen=True)
class MutationPlan:
    """Immutable v2 KV plan. Today can only be deleted in an explicit migration."""
    current_snapshot: Mapping[str, Any]
    movie_puts: tuple[tuple[str, str], ...]
    movie_deletes: tuple[str, ...]
    meta_put: str | None
    unchanged_count: int
    previous_count: int
    expected_remote_movie_keys: tuple[str, ...] | None = None
    migration: bool = False

    def __post_init__(self) -> None:
        validate_snapshot(self.current_snapshot)
        object.__setattr__(self, "current_snapshot", _freeze_json(self.current_snapshot))
        if not isinstance(self.migration, bool):
            raise AssertionError("migration must be bool")
        hashes = self.current_snapshot["movie_hashes"]
        assert isinstance(hashes, Mapping)
        normalized_puts: list[tuple[str, str]] = []
        if isinstance(self.movie_puts, (str, bytes)):
            raise AssertionError("movie PUTs must be a sequence of key/value pairs")
        try:
            raw_puts = tuple(self.movie_puts)
        except TypeError as exc:
            raise AssertionError("movie PUTs must be a sequence of key/value pairs") from exc
        for entry in raw_puts:
            if not isinstance(entry, (tuple, list)) or len(entry) != 2:
                raise AssertionError("movie PUTs must contain key/value pairs")
            key, value = entry
            if not isinstance(key, str) or not isinstance(value, str):
                raise AssertionError("movie PUT keys and values must be strings")
            normalized_puts.append((key, value))
        normalized_puts_tuple = tuple(normalized_puts)
        keys = tuple(key for key, _ in normalized_puts_tuple)
        if keys != tuple(sorted(keys)) or len(set(keys)) != len(keys) or not set(keys) <= set(hashes):
            raise AssertionError("movie PUT keys are invalid")
        for key, value in normalized_puts_tuple:
            try:
                parsed = json.loads(value)
            except (TypeError, ValueError) as exc:
                raise AssertionError(f"movie PUT is not canonical JSON: {key}") from exc
            if not isinstance(parsed, dict) or value != canonical_json(parsed) or sha256_hex(value) != hashes[key]:
                raise AssertionError(f"movie PUT differs from current snapshot: {key}")
        try:
            deletes = _validate_remote_movie_keys(self.movie_deletes)
        except (TypeError, RemoteAuditError) as exc:
            raise AssertionError("movie DELETE keys are invalid") from exc
        if tuple(self.movie_deletes) != deletes or set(deletes) & set(hashes) or set(deletes) & set(keys):
            raise AssertionError("movie DELETE keys are invalid")
        if not isinstance(self.unchanged_count, int) or isinstance(self.unchanged_count, bool) or self.unchanged_count < 0 or not isinstance(self.previous_count, int) or isinstance(self.previous_count, bool) or self.previous_count < 0:
            raise AssertionError("mutation plan counts must be non-negative integers")
        if self.unchanged_count + len(normalized_puts) != len(hashes):
            raise AssertionError("movie PUT and unchanged counts must cover current snapshot")
        if self.meta_put is not None and self.meta_put != self.current_snapshot["control"]["meta_g_value"]:
            raise AssertionError("meta:G PUT must equal current control")
        if self.expected_remote_movie_keys is not None:
            try:
                raw_expected = tuple(self.expected_remote_movie_keys)
                expected = tuple(sorted(hashes))
            except TypeError as exc:
                raise AssertionError("full recovery expected keyset is invalid") from exc
            if (
                raw_expected != expected
                or keys != expected
                or self.unchanged_count != 0
                or self.meta_put is None
            ):
                raise AssertionError(
                    "full recovery must restore the complete v2 movie keyspace and meta:G"
                )
            object.__setattr__(self, "expected_remote_movie_keys", expected)
        object.__setattr__(self, "movie_puts", normalized_puts_tuple)
        object.__setattr__(self, "movie_deletes", deletes)

    @property
    def total_put(self) -> int:
        return len(self.movie_puts) + int(self.meta_put is not None)

    @property
    def total_delete(self) -> int:
        """Total destructive mutations, including legacy Today retirement."""
        return len(self.movie_deletes) + int(self.migration)

    def summary(
        self,
        *,
        batch_size: int,
        dry_run: bool,
    ) -> dict[str, int | bool | list[str]]:
        _require_batch_size(batch_size)
        movie_delete_batches = _batches(len(self.movie_deletes), batch_size)
        today_delete_batches = int(self.migration)
        return {
            "current": int(self.current_snapshot["movie_count"]),
            "previous": self.previous_count,
            "movie_put": len(self.movie_puts),
            "movie_delete": len(self.movie_deletes),
            "today_delete": int(self.migration),
            "total_delete": self.total_delete,
            "unchanged": self.unchanged_count,
            "meta_put": int(self.meta_put is not None),
            "total_put": self.total_put,
            "movie_put_batches": _batches(len(self.movie_puts), batch_size),
            "movie_delete_batches": movie_delete_batches,
            "today_delete_batches": today_delete_batches,
            "total_delete_batches": movie_delete_batches + today_delete_batches,
            "dry_run": dry_run,
            "migration": self.migration,
            "verify_final_keyset": self.expected_remote_movie_keys is not None,
            "sample_keys": list(
                (tuple(key for key, _ in self.movie_puts) + self.movie_deletes)[:SAMPLE_KEY_LIMIT]
            ),
        }


def _plan_from_delta(
    *,
    previous_hashes: Mapping[str, str],
    previous_meta: str | None,
    current: Mapping[str, Any],
    movies: Sequence[Mapping[str, Any]],
    migration: bool = False,
    full_remote_keys: Sequence[str] | None = None,
) -> MutationPlan:
    validate_snapshot(current)
    hashes = current["movie_hashes"]
    assert isinstance(hashes, Mapping)
    values = _movie_values(movies)
    assert set(values) == set(hashes), "movie values and snapshot hashes diverged"
    puts = tuple(sorted(key for key in hashes if previous_hashes.get(key) != hashes[key]))
    deletes = tuple(sorted(set(previous_hashes) - set(hashes)))
    expected = None
    previous_count = len(previous_hashes)
    if full_remote_keys is not None:
        remote = _validate_remote_movie_keys(full_remote_keys)
        puts = tuple(sorted(hashes))
        deletes = tuple(sorted(set(remote) - set(hashes)))
        expected = tuple(sorted(hashes))
        previous_count = len(remote)
    unchanged = len(set(hashes) - set(puts))
    control = current["control"]
    assert isinstance(control, Mapping)
    meta = control["meta_g_value"]
    assert isinstance(meta, str)
    has_movie_delta = bool(puts) or bool(deletes)
    meta_put = None
    if migration or full_remote_keys is not None or (has_movie_delta and previous_meta != meta):
        meta_put = meta
    return MutationPlan(
        current_snapshot=current,
        movie_puts=tuple((key, values[key]) for key in puts),
        movie_deletes=deletes,
        meta_put=meta_put,
        unchanged_count=unchanged,
        previous_count=previous_count,
        expected_remote_movie_keys=expected,
        migration=migration,
    )


def build_incremental_plan(
    previous: Mapping[str, Any],
    current: Mapping[str, Any],
    movies: Sequence[Mapping[str, Any]],
) -> MutationPlan:
    validate_snapshot(previous)
    validate_snapshot(current)
    delta = diff_snapshots(previous, current)
    old_control = previous["control"]
    assert isinstance(old_control, Mapping)
    return _plan_from_delta(
        previous_hashes=previous["movie_hashes"],
        previous_meta=old_control["meta_g_value"],
        current=current,
        movies=movies,
    )


def build_migration_plan(
    legacy: Mapping[str, Any],
    current: Mapping[str, Any],
    movies: Sequence[Mapping[str, Any]],
) -> MutationPlan:
    validate_v1_snapshot(legacy)
    return _plan_from_delta(
        previous_hashes=legacy["movie_hashes"],
        previous_meta=legacy["control"]["meta_g_value"],
        current=current,
        movies=movies,
        migration=True,
    )


def build_full_recovery_plan(
    current: Mapping[str, Any],
    movies: Sequence[Mapping[str, Any]],
    remote_movie_keys: Sequence[str],
) -> MutationPlan:
    return _plan_from_delta(previous_hashes={}, previous_meta=None, current=current, movies=movies, full_remote_keys=remote_movie_keys)


def enforce_quota(plan: MutationPlan, *, max_puts: int = DEFAULT_MAX_PUTS, max_deletes: int = DEFAULT_MAX_DELETES, allow_over_quota: bool = False, batch_size: int = DEFAULT_BULK_BATCH_SIZE, dry_run: bool = False) -> None:
    _require_batch_size(batch_size)
    if not all(isinstance(value, bool) for value in (allow_over_quota, dry_run)) or not all(isinstance(value, int) and not isinstance(value, bool) and value >= 0 for value in (max_puts, max_deletes)):
        raise ValueError("quota flags and values are invalid")
    if not allow_over_quota and (
        plan.total_put > max_puts or plan.total_delete > max_deletes
    ):
        raise QuotaExceededError("OG_INDEX_QUOTA_EXCEEDED " + json.dumps(plan.summary(batch_size=batch_size, dry_run=dry_run), sort_keys=True, separators=(",", ":")))


def execute_plan(plan: MutationPlan, *, kv_env: Mapping[str, str], r2_client: Any, r2_bucket: str, batch_size: int, dry_run: bool) -> None:
    """D5: movie mutations → migration Today delete/verify → meta write/verify → v2 commit."""
    _require_batch_size(batch_size)
    if not isinstance(dry_run, bool):
        raise ValueError("dry_run must be bool")
    if dry_run:
        return
    noop = (
        not plan.movie_puts
        and not plan.movie_deletes
        and not plan.migration
        and plan.meta_put is None
        and plan.expected_remote_movie_keys is None
    )
    if noop:
        return
    if r2_client is None or not isinstance(r2_bucket, str) or not r2_bucket.strip():
        raise CredentialsError("R2 snapshot client and bucket are required before KV mutation")
    args = _kv_args(kv_env)
    for start in range(0, len(plan.movie_puts), batch_size):
        kv_bulk_put(**args, batch=[{"key": key, "value": value} for key, value in plan.movie_puts[start:start + batch_size]])
    for start in range(0, len(plan.movie_deletes), batch_size):
        kv_bulk_delete(**args, keys=plan.movie_deletes[start:start + batch_size])
    movie_expected = dict(plan.movie_puts)
    if movie_expected:
        verify_kv_values(**args, expected=movie_expected)
    if plan.movie_deletes:
        verify_kv_absent(**args, keys=plan.movie_deletes)
    if plan.migration:
        kv_bulk_delete(**args, keys=[TODAY_KEY])
        verify_kv_absent(**args, keys=[TODAY_KEY])
    if plan.meta_put is not None:
        kv_bulk_put(**args, batch=[{"key": META_G_KEY, "value": plan.meta_put}])
        verify_kv_values(**args, expected={META_G_KEY: plan.meta_put})
    if plan.expected_remote_movie_keys is not None and read_remote_movie_keys(kv_env=kv_env) != plan.expected_remote_movie_keys:
        raise RemoteAuditError("full recovery final movie keyset mismatch")
    snapshot = _thaw_json(plan.current_snapshot)
    assert isinstance(snapshot, dict)
    commit_snapshot(client=r2_client, bucket=r2_bucket, snapshot=snapshot)


def _current_snapshot(public_data: Path, *, committed_at: str | None = None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        version, movies = load_galaxy_movies(public_data)
    except (AssertionError, json.JSONDecodeError, OSError) as exc:
        raise SnapshotValidationError(f"current OG export is invalid: {exc}") from exc
    return build_snapshot(source_data_version=version, committed_at=committed_at or datetime.now(timezone.utc).isoformat(), movies=movies), movies


def run_sync(*, public_data: Path, scope: str = "incremental", dry_run: bool = False, migrate_v1: bool = False, allow_full_recovery: bool = False, allow_over_quota: bool = False, max_puts: int = DEFAULT_MAX_PUTS, max_deletes: int = DEFAULT_MAX_DELETES, batch_size: int = DEFAULT_BULK_BATCH_SIZE, r2_client: Any | None = None, r2_bucket: str | None = None, kv_env: Mapping[str, str] | None = None) -> MutationPlan:
    _require_batch_size(batch_size)
    if not all(isinstance(value, bool) for value in (dry_run, migrate_v1, allow_full_recovery, allow_over_quota)):
        raise ValueError("boolean flags must be bool")
    if not isinstance(scope, str):
        raise ValueError("scope must be a string")
    scope = scope.strip().lower()
    if scope not in {"incremental", "full"}:
        raise ValueError("scope must be incremental or full")
    if scope == "full" and not allow_full_recovery:
        raise PermissionError("--scope full requires --allow-full-recovery")
    if migrate_v1 and scope != "incremental":
        raise ValueError("--migrate-v1 only supports incremental scope")
    if (r2_client is None) != (r2_bucket is None):
        raise CredentialsError("r2_client and r2_bucket must be provided together")
    if r2_client is None:
        r2_client, r2_bucket = create_r2_client()
    if not isinstance(r2_bucket, str) or not r2_bucket.strip():
        raise CredentialsError("R2 snapshot bucket is required")
    current, movies = _current_snapshot(public_data)
    if scope == "full":
        if kv_env is None:
            raise CredentialsError("full recovery requires KV credentials")
        plan = build_full_recovery_plan(current, movies, read_remote_movie_keys(kv_env=kv_env))
    elif migrate_v1:
        try:
            load_snapshot(client=r2_client, bucket=r2_bucket)
        except SnapshotMissingError:
            legacy = load_v1_snapshot_for_migration(client=r2_client, bucket=r2_bucket)
            plan = build_migration_plan(legacy, current, movies)
        else:
            raise RuntimeError("v2 checkpoint already exists; refusing repeated --migrate-v1")
    else:
        try:
            previous = load_snapshot(client=r2_client, bucket=r2_bucket)
        except SnapshotMissingError as exc:
            raise SnapshotMissingError("R2 v2 snapshot missing; run explicit --migrate-v1") from exc
        except SnapshotCorruptError as exc:
            raise SnapshotCorruptError("R2 v2 snapshot corrupt; repair explicitly before scheduled sync") from exc
        plan = build_incremental_plan(previous, current, movies)
    enforce_quota(plan, max_puts=max_puts, max_deletes=max_deletes, allow_over_quota=allow_over_quota, batch_size=batch_size, dry_run=dry_run)
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
    parser.add_argument("--migrate-v1", action="store_true")
    parser.add_argument("--allow-full-recovery", action="store_true")
    parser.add_argument("--allow-over-quota", action="store_true")
    parser.add_argument(
        "--max-puts",
        type=int,
        default=os.environ.get("OG_INDEX_MAX_PUTS", str(DEFAULT_MAX_PUTS)),
    )
    parser.add_argument(
        "--max-deletes",
        type=int,
        default=os.environ.get("OG_INDEX_MAX_DELETES", str(DEFAULT_MAX_DELETES)),
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=os.environ.get("OG_INDEX_KV_BATCH_SIZE", str(DEFAULT_BULK_BATCH_SIZE)),
    )
    args = parser.parse_args(argv)
    try:
        run_sync(public_data=args.public_data_dir.resolve(), scope=args.scope, dry_run=args.dry_run, migrate_v1=args.migrate_v1, allow_full_recovery=args.allow_full_recovery, allow_over_quota=args.allow_over_quota, max_puts=args.max_puts, max_deletes=args.max_deletes, batch_size=args.batch_size, kv_env=_required_kv_env())
    except (CredentialsError, QuotaExceededError, SnapshotMissingError, SnapshotCorruptError, SnapshotRepositoryError, RemoteAuditError, PermissionError, ValueError, RuntimeError) as exc:
        print(f"[og_index_kv] ERROR {exc}", file=sys.stderr, flush=True)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
