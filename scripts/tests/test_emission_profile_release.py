from __future__ import annotations

import gzip
import json
import os
import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.emission_profile_release import (  # noqa: E402
    ProfileReleaseError,
    build_assets_manifest,
    decide_activation,
    immutable_profile_key,
    pointer_from_profile,
    validate_active_pointer,
    validate_profile_url,
)
from cron.monthly_profile_generator import generate_monthly_profile  # noqa: E402


def profile(period: str, version: str) -> dict[str, object]:
    return generate_monthly_profile(
        [{"id": 1, "vote_average": 5.0}, {"id": 2, "vote_average": 7.0}],
        {"version": version, "threshold_version": "threshold-v1", "generated_at": f"{period}-01T00:00:00.000Z"},
        period=period,
        git_commit="0123456",
    )


def test_monthly_success_activates_new_period_and_builds_manifest() -> None:
    candidate = profile("2026-08", "2026.08.monthly.1")
    prior = pointer_from_profile(profile("2026-07", "2026.07.monthly.1"), activated_at="2026-07-01T00:00:00.000Z")
    decision = decide_activation(candidate_profile=candidate, existing_active_pointer=prior, activated_at="2026-08-01T00:00:00.000Z")

    assert decision.action == "activated"
    assert decision.pointer["profile_id"] == candidate["profile_id"]
    manifest = build_assets_manifest(
        galaxy_url="https://assets.example.test/galaxy/galaxy_data.json.gz?v=monthly",
        search_url="https://assets.example.test/galaxy/galaxy_search_index.json.gz?v=monthly",
        data_version="2026.08.monthly.1",
        exported_at="2026-08-01T00:00:00.000Z",
        r2_object_keys={"galaxy_data": "galaxy/galaxy_data.json.gz", "galaxy_search_index": "galaxy/galaxy_search_index.json.gz"},
        active_pointer=decision.pointer,
        profile_url=f"https://assets.example.test/{immutable_profile_key('galaxy', str(candidate['profile_id']))}",
    )
    assert manifest["focus_emission_profile"]["curve_sha256"] == candidate["curve_sha256"]
    assert manifest["focus_emission_profile_url"].endswith(f"/{candidate['profile_id']}.json")


def test_same_period_candidate_is_frozen_without_force() -> None:
    active_profile = profile("2026-08", "2026.08.monthly.1")
    candidate = profile("2026-08", "2026.08.monthly.2")
    active = pointer_from_profile(active_profile, activated_at="2026-08-01T00:00:00.000Z")

    decision = decide_activation(candidate_profile=candidate, existing_active_pointer=active, activated_at="2026-08-02T00:00:00.000Z")
    assert decision.action == "frozen-same-period"
    assert decision.pointer == active
    assert decision.audit["candidate_profile_id"] == candidate["profile_id"]


def test_force_activation_requires_complete_audit_and_records_old_new() -> None:
    active = pointer_from_profile(profile("2026-08", "2026.08.monthly.1"), activated_at="2026-08-01T00:00:00.000Z")
    candidate = profile("2026-08", "2026.08.monthly.2")
    with pytest.raises(ProfileReleaseError, match="reason"):
        decide_activation(candidate_profile=candidate, existing_active_pointer=active, force=True, actor="github:alice")

    decision = decide_activation(
        candidate_profile=candidate, existing_active_pointer=active, force=True,
        reason="correct final export provenance", actor="github:alice", activated_at="2026-08-02T00:00:00.000Z",
    )
    assert decision.action == "activated-force"
    assert decision.audit == {
        "action": "force-activation", "old_profile_id": active["profile_id"],
        "new_profile_id": candidate["profile_id"], "reason": "correct final export provenance",
        "actor": "github:alice", "activated_at": "2026-08-02T00:00:00.000Z",
    }


def test_manifest_retains_legacy_compatibility_but_rejects_mismatched_profile_url() -> None:
    legacy = build_assets_manifest(
        galaxy_url="https://assets.example.test/galaxy/galaxy_data.json.gz?v=old",
        search_url="https://assets.example.test/galaxy/galaxy_search_index.json.gz?v=old",
        data_version="old", exported_at="2026-08-01T00:00:00.000Z",
        r2_object_keys={"galaxy_data": "a", "galaxy_search_index": "b"}, active_pointer=None, profile_url=None,
    )
    assert "focus_emission_profile" not in legacy
    pointer = pointer_from_profile(profile("2026-08", "2026.08.monthly.1"), activated_at="2026-08-01T00:00:00.000Z")
    with pytest.raises(ProfileReleaseError, match="profile URL"):
        build_assets_manifest(
            galaxy_url="https://assets.example.test/a", search_url="https://assets.example.test/b", data_version="x",
            exported_at="2026-08-01T00:00:00.000Z", r2_object_keys={"galaxy_data": "a", "galaxy_search_index": "b"},
            active_pointer=pointer, profile_url="https://assets.example.test/galaxy/not-the-profile.json",
        )



def test_pointer_has_exact_eight_field_contract_and_urls_reject_userinfo() -> None:
    pointer = pointer_from_profile(profile("2026-08", "2026.08.monthly.1"), activated_at="2026-08-01T00:00:00.000Z")
    assert set(pointer) == {
        "profile_id", "period", "model_version", "curve_sha256", "source_data_version",
        "source_movie_count", "status", "activated_at",
    }
    assert validate_active_pointer(pointer) == pointer
    with pytest.raises(ProfileReleaseError, match="userinfo"):
        validate_profile_url(
            f"https://user:secret@assets.example.test/galaxy/focus-emission-profiles/{pointer['profile_id']}.json",
            profile_id=str(pointer["profile_id"]),
        )

    with pytest.raises(ProfileReleaseError):
        validate_active_pointer({"profile_id": "unsafe"})