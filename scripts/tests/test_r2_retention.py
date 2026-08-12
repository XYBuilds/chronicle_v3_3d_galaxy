"""Manifest-aware R2 retention: 60 releases, 60-day candidates, pins, fail-closed (#387)."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.r2_retention import (  # noqa: E402
    BUDGET_BYTES,
    CANDIDATE_RETENTION_DAYS,
    SUCCESSFUL_RELEASE_LIMIT,
    RetentionError,
    discover_protected_keys,
    plan_cleanup,
)

NOW = datetime(2026, 8, 13, 4, 0, tzinfo=timezone.utc)


def _iso(when: datetime) -> str:
    return when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _release(index: int, *, size: int = 100, days_ago: int | None = None) -> dict[str, object]:
    published = NOW if days_ago is None else NOW - timedelta(days=days_ago)
    release_id = f"rel-{index:03d}"
    prefix = f"galaxy/releases/{release_id}"
    return {
        "release_id": release_id,
        "published_at": _iso(published),
        "successful": True,
        "keys": (f"{prefix}/galaxy_data.json.gz", f"{prefix}/galaxy_search_index.json.gz"),
        "size": size,
    }


def _candidate(index: int, *, days_ago: int, size: int = 50) -> dict[str, object]:
    created = NOW - timedelta(days=days_ago)
    candidate_id = f"cand-{index:03d}"
    prefix = f"galaxy/candidates/{candidate_id}"
    return {
        "candidate_id": candidate_id,
        "created_at": _iso(created),
        "keys": (f"{prefix}/galaxy_data.json.gz",),
        "size": size,
    }


def _sources(**overrides: object) -> dict[str, object]:
    sources: dict[str, object] = {
        "manifest": {
            "r2_object_keys": {
                "galaxy_data": "galaxy/releases/rel-060/galaxy_data.json.gz",
                "galaxy_search_index": "galaxy/releases/rel-060/galaxy_search_index.json.gz",
            },
            "focus_emission_profile_url": "https://assets.example.test/galaxy/focus-emission-profiles/profile-active.json",
        },
        "active_profile": {
            "pointer_key": "galaxy/focus-emission-profiles/active.json",
            "profile_key": "galaxy/focus-emission-profiles/profile-active.json",
        },
        "site_artifacts": {
            "active_key": "ops/site-artifacts/site-bbbb.tar",
            "previous_key": "ops/site-artifacts/site-aaaa.tar",
        },
        "pins": ("galaxy/releases/rel-001/galaxy_data.json.gz",),
    }
    sources.update(overrides)
    return sources


def _inventory(releases: list[dict[str, object]], candidates: list[dict[str, object]], extra: list[dict[str, object]] | None = None) -> list[dict[str, object]]:
    objects: list[dict[str, object]] = [
        {"key": "galaxy/focus-emission-profiles/active.json", "size": 10, "last_modified": _iso(NOW)},
        {"key": "galaxy/focus-emission-profiles/profile-active.json", "size": 20, "last_modified": _iso(NOW)},
        {"key": "ops/site-artifacts/site-bbbb.tar", "size": 30, "last_modified": _iso(NOW)},
        {"key": "ops/site-artifacts/site-aaaa.tar", "size": 30, "last_modified": _iso(NOW)},
    ]
    for release in releases:
        per = int(release["size"]) // len(release["keys"])  # type: ignore[arg-type]
        for key in release["keys"]:  # type: ignore[union-attr]
            objects.append({"key": key, "size": per, "last_modified": release["published_at"]})
    for candidate in candidates:
        for key in candidate["keys"]:  # type: ignore[union-attr]
            objects.append({"key": key, "size": candidate["size"], "last_modified": candidate["created_at"]})
    objects.extend(extra or [])
    return objects


def test_retention_constants_match_accepted_policy() -> None:
    assert SUCCESSFUL_RELEASE_LIMIT == 60
    assert CANDIDATE_RETENTION_DAYS == 60
    assert BUDGET_BYTES == 8_000_000_000


def test_protected_object_discovery_covers_manifest_profile_site_and_pins() -> None:
    releases = [_release(i, days_ago=60 - i) for i in range(1, 61)]
    protected = discover_protected_keys(
        sources=_sources(),
        successful_releases=releases,
        unpromoted_candidates=[],
        now=NOW,
    )
    assert "galaxy/releases/rel-060/galaxy_data.json.gz" in protected
    assert "galaxy/focus-emission-profiles/active.json" in protected
    assert "galaxy/focus-emission-profiles/profile-active.json" in protected
    assert "ops/site-artifacts/site-bbbb.tar" in protected
    assert "ops/site-artifacts/site-aaaa.tar" in protected
    assert "galaxy/releases/rel-001/galaxy_data.json.gz" in protected


def test_latest_60_successful_releases_are_retained_including_current() -> None:
    releases = [_release(i, days_ago=70 - i) for i in range(1, 63)]
    plan = plan_cleanup(
        inventory=_inventory(releases, []),
        sources=_sources(pins=()),
        successful_releases=releases,
        unpromoted_candidates=[],
        now=NOW,
    )
    deleted = {item["key"] for item in plan["delete"]}
    assert "galaxy/releases/rel-001/galaxy_data.json.gz" in deleted
    assert "galaxy/releases/rel-002/galaxy_search_index.json.gz" in deleted
    assert "galaxy/releases/rel-003/galaxy_data.json.gz" not in deleted
    assert "galaxy/releases/rel-062/galaxy_data.json.gz" not in deleted
    assert plan["retained_successful_releases"] == 60


def test_unpromoted_candidates_are_kept_for_60_days_only() -> None:
    fresh = _candidate(1, days_ago=59)
    stale = _candidate(2, days_ago=61)
    plan = plan_cleanup(
        inventory=_inventory([], [fresh, stale]),
        sources=_sources(pins=()),
        successful_releases=[_release(60, days_ago=0)],
        unpromoted_candidates=[fresh, stale],
        now=NOW,
    )
    deleted = {item["key"] for item in plan["delete"]}
    assert "galaxy/candidates/cand-001/galaxy_data.json.gz" not in deleted
    assert "galaxy/candidates/cand-002/galaxy_data.json.gz" in deleted


def test_explicit_pin_protects_an_otherwise_expired_release() -> None:
    releases = [_release(i, days_ago=70 - i) for i in range(1, 63)]
    plan = plan_cleanup(
        inventory=_inventory(releases, []),
        sources=_sources(),
        successful_releases=releases,
        unpromoted_candidates=[],
        now=NOW,
    )
    deleted = {item["key"] for item in plan["delete"]}
    assert "galaxy/releases/rel-001/galaxy_data.json.gz" not in deleted
    assert "galaxy/releases/rel-001/galaxy_search_index.json.gz" in deleted


def test_unreadable_protection_source_fails_closed() -> None:
    with pytest.raises(RetentionError, match="unreadable"):
        plan_cleanup(
            inventory=_inventory([_release(60)], []),
            sources=_sources(manifest=None),
            successful_releases=[_release(60)],
            unpromoted_candidates=[],
            now=NOW,
        )


def test_budget_gate_fails_closed_when_protected_usage_cannot_be_made_safe() -> None:
    huge = _release(60, size=9_000_000_000, days_ago=0)
    with pytest.raises(RetentionError, match="budget"):
        plan_cleanup(
            inventory=_inventory([huge], []),
            sources=_sources(pins=()),
            successful_releases=[huge],
            unpromoted_candidates=[],
            now=NOW,
        )


def test_cleanup_plan_is_dry_run_and_does_not_move_objects_to_infrequent_access() -> None:
    stale = _candidate(2, days_ago=61)
    plan = plan_cleanup(
        inventory=_inventory([_release(60, days_ago=0)], [stale]),
        sources=_sources(pins=()),
        successful_releases=[_release(60, days_ago=0)],
        unpromoted_candidates=[stale],
        now=NOW,
    )
    assert plan["dry_run"] is True
    assert plan["storage_class_changes"] == []
    assert all(item["action"] == "delete" for item in plan["delete"])


def test_annual_pricing_recheck_is_an_operator_task_not_an_oracle() -> None:
    from cron.r2_retention import pricing_recheck_task

    task = pricing_recheck_task()
    assert task["cadence"] == "annual"
    assert task["automated"] is False
    assert "dashboard" in task["instruction"].lower()


def test_retention_cli_emits_a_dry_run_plan_from_fixtures(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from cron.r2_retention import main as retention_main

    releases = [_release(60, days_ago=0)]
    stale = _candidate(2, days_ago=61)
    (tmp_path / "inventory.json").write_text(json.dumps(_inventory(releases, [stale])), encoding="utf-8")
    (tmp_path / "sources.json").write_text(json.dumps(_sources(pins=())), encoding="utf-8")
    (tmp_path / "releases.json").write_text(json.dumps(releases), encoding="utf-8")
    (tmp_path / "candidates.json").write_text(json.dumps([stale]), encoding="utf-8")
    code = retention_main([
        "--inventory", str(tmp_path / "inventory.json"),
        "--sources", str(tmp_path / "sources.json"),
        "--releases", str(tmp_path / "releases.json"),
        "--candidates", str(tmp_path / "candidates.json"),
        "--now", _iso(NOW),
    ])
    assert code == 0
    plan = json.loads(capsys.readouterr().out)
    assert plan["dry_run"] is True
    assert plan["storage_class_changes"] == []
    assert "galaxy/candidates/cand-002/galaxy_data.json.gz" in {item["key"] for item in plan["delete"]}
