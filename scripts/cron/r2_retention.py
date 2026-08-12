#!/usr/bin/env python3
"""Manifest-aware R2 retention for Data Releases, candidates, and protected objects.

Cleanup never applies an unconditional age lifecycle to the whole release prefix
and never moves objects to Infrequent Access. It fails closed when a protection
source is unreadable or when projected usage cannot be brought within the
internal 8 GB budget without deleting a protected object.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence
from urllib.parse import urlparse

SUCCESSFUL_RELEASE_LIMIT = 60
CANDIDATE_RETENTION_DAYS = 60
BUDGET_BYTES = 8_000_000_000
PRICING_RECHECK_CADENCE = "annual"


class RetentionError(ValueError):
    """Retention cannot proceed without violating a protection or budget invariant."""


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise RetentionError(message)


def _parse_utc(value: str, *, label: str) -> datetime:
    _assert(isinstance(value, str) and value.endswith("Z"), f"{label} must be UTC")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RetentionError(f"{label} must be a valid timestamp") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _require_mapping(value: object, *, label: str) -> Mapping[str, Any]:
    _assert(value is not None, f"{label} is unreadable")
    _assert(isinstance(value, Mapping), f"{label} is unreadable")
    return value


def _profile_key_from_url(url: object) -> str | None:
    if not isinstance(url, str) or not url.strip():
        return None
    parsed = urlparse(url)
    path = parsed.path.lstrip("/")
    return path or None


def _latest_successful(releases: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    successful = [item for item in releases if item.get("successful") is True]
    successful.sort(key=lambda item: _parse_utc(str(item["published_at"]), label="published_at"), reverse=True)
    return successful[:SUCCESSFUL_RELEASE_LIMIT]


def _candidate_is_fresh(candidate: Mapping[str, Any], *, now: datetime) -> bool:
    created = _parse_utc(str(candidate["created_at"]), label="created_at")
    return created + timedelta(days=CANDIDATE_RETENTION_DAYS) >= now


def discover_protected_keys(
    *,
    sources: Mapping[str, Any],
    successful_releases: Sequence[Mapping[str, Any]],
    unpromoted_candidates: Sequence[Mapping[str, Any]],
    now: datetime,
) -> set[str]:
    """Return every object key that cleanup must not delete."""
    manifest = _require_mapping(sources.get("manifest"), label="current manifest")
    active_profile = _require_mapping(sources.get("active_profile"), label="active profile")
    site_artifacts = _require_mapping(sources.get("site_artifacts"), label="site artifacts")
    pins = sources.get("pins")
    _assert(pins is not None, "explicit pins are unreadable")
    _assert(isinstance(pins, (list, tuple)), "explicit pins are unreadable")

    protected: set[str] = set()
    keys = manifest.get("r2_object_keys")
    _assert(isinstance(keys, Mapping), "current manifest is unreadable")
    for value in keys.values():
        _assert(isinstance(value, str) and bool(value.strip()), "current manifest is unreadable")
        protected.add(value.strip())
    profile_from_manifest = _profile_key_from_url(manifest.get("focus_emission_profile_url"))
    if profile_from_manifest:
        protected.add(profile_from_manifest)

    for field in ("pointer_key", "profile_key"):
        value = active_profile.get(field)
        _assert(isinstance(value, str) and bool(value.strip()), "active profile is unreadable")
        protected.add(value.strip())

    for field in ("active_key", "previous_key"):
        value = site_artifacts.get(field)
        if value is None:
            continue
        _assert(isinstance(value, str) and bool(value.strip()), "site artifacts are unreadable")
        protected.add(value.strip())

    for pin in pins:
        _assert(isinstance(pin, str) and bool(pin.strip()), "explicit pins are unreadable")
        protected.add(pin.strip())

    for release in _latest_successful(successful_releases):
        release_keys = release.get("keys")
        _assert(isinstance(release_keys, (list, tuple)), "successful release keys are unreadable")
        protected.update(str(key) for key in release_keys)

    for candidate in unpromoted_candidates:
        if _candidate_is_fresh(candidate, now=now):
            candidate_keys = candidate.get("keys")
            _assert(isinstance(candidate_keys, (list, tuple)), "candidate keys are unreadable")
            protected.update(str(key) for key in candidate_keys)

    return protected


def _eligible_deletes(
    *,
    successful_releases: Sequence[Mapping[str, Any]],
    unpromoted_candidates: Sequence[Mapping[str, Any]],
    now: datetime,
) -> set[str]:
    kept_ids = {item["release_id"] for item in _latest_successful(successful_releases)}
    eligible: set[str] = set()
    for release in successful_releases:
        if release.get("successful") is True and release.get("release_id") not in kept_ids:
            eligible.update(str(key) for key in release["keys"])  # type: ignore[index]
    for candidate in unpromoted_candidates:
        if not _candidate_is_fresh(candidate, now=now):
            eligible.update(str(key) for key in candidate["keys"])  # type: ignore[index]
    return eligible


def plan_cleanup(
    *,
    inventory: Sequence[Mapping[str, Any]],
    sources: Mapping[str, Any],
    successful_releases: Sequence[Mapping[str, Any]],
    unpromoted_candidates: Sequence[Mapping[str, Any]],
    now: datetime,
    budget_bytes: int = BUDGET_BYTES,
) -> dict[str, Any]:
    """Return a dry-run delete plan. Never mutates storage or storage class."""
    protected = discover_protected_keys(
        sources=sources,
        successful_releases=successful_releases,
        unpromoted_candidates=unpromoted_candidates,
        now=now,
    )
    eligible = _eligible_deletes(
        successful_releases=successful_releases,
        unpromoted_candidates=unpromoted_candidates,
        now=now,
    )
    delete: list[dict[str, Any]] = []
    remaining = 0
    for item in inventory:
        key = item.get("key")
        size = item.get("size")
        _assert(isinstance(key, str) and bool(key), "inventory key is unreadable")
        _assert(isinstance(size, int) and not isinstance(size, bool) and size >= 0, "inventory size is unreadable")
        if key in eligible and key not in protected:
            delete.append({"key": key, "size": size, "action": "delete"})
        else:
            remaining += size
    if remaining > budget_bytes:
        raise RetentionError(
            f"projected usage {remaining} exceeds internal budget {budget_bytes}; "
            "safe cleanup cannot delete a protected object"
        )
    return {
        "dry_run": True,
        "delete": delete,
        "retained_successful_releases": len(_latest_successful(successful_releases)),
        "projected_bytes": remaining,
        "budget_bytes": budget_bytes,
        "storage_class_changes": [],
        "protected_keys": sorted(protected),
    }


def pricing_recheck_task() -> dict[str, Any]:
    """Operator reminder only. Pricing is not read from a live oracle."""
    return {
        "cadence": PRICING_RECHECK_CADENCE,
        "automated": False,
        "instruction": (
            "Annually re-check Cloudflare R2 provider pricing and the dashboard storage "
            "usage against the internal 8 GB budget. Do not automate a pricing oracle."
        ),
    }


def _load_json(path: Path, *, label: str) -> Any:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RetentionError(f"{label} is unreadable: {exc}") from exc
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--releases", type=Path, required=True)
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--now", required=True, help="UTC timestamp used for 60-day candidate age")
    args = parser.parse_args(argv)
    try:
        plan = plan_cleanup(
            inventory=_load_json(args.inventory, label="inventory"),
            sources=_load_json(args.sources, label="protection sources"),
            successful_releases=_load_json(args.releases, label="successful releases"),
            unpromoted_candidates=_load_json(args.candidates, label="unpromoted candidates"),
            now=_parse_utc(args.now, label="now"),
        )
    except RetentionError as exc:
        print(f"[retention] error: {exc}", flush=True)
        return 1
    print(json.dumps(plan, indent=2, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

