"""Phase 42 monthly/nightly lifecycle fixture: no UMAP, no remote publication."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.emission_profile_release import (  # noqa: E402
    ProfileReleaseError,
    build_assets_manifest,
    build_monthly_refit_meta_payload,
    decide_activation,
    immutable_profile_key,
    pointer_from_profile,
)
from cron.monthly_profile_generator import (  # noqa: E402
    MonthlyProfileError,
    calculate_drift_metrics,
    generate_monthly_profile,
)

_FIXTURE_PATH = Path(__file__).with_name("phase42_monthly_nightly.fixture.json")


@pytest.fixture
def monthly_nightly_fixture() -> dict[str, Any]:
    return json.loads(_FIXTURE_PATH.read_text(encoding="utf-8"))


def _profile(export: dict[str, Any], *, generated_at: str | None = None) -> dict[str, Any]:
    return generate_monthly_profile(
        export["movies"],
        export["meta"],
        generated_at=generated_at,
        git_commit="0123456789abcdef",
    )


def test_fake_monthly_and_nightly_fixture_keeps_active_profile_hash_frozen(
    monthly_nightly_fixture: dict[str, Any],
) -> None:
    monthly = _profile(monthly_nightly_fixture["monthly_export"])
    active = pointer_from_profile(monthly, activated_at="2026-07-22T02:00:00.000Z")
    nightly = monthly_nightly_fixture["nightly_export"]

    # The nightly movie payload deliberately has changed votes. Its release manifest
    # must carry the active monthly pointer, not calculate a replacement curve.
    manifest = build_assets_manifest(
        galaxy_url="https://assets.example.test/galaxy/releases/nightly/galaxy_data.json.gz",
        search_url="https://assets.example.test/galaxy/releases/nightly/galaxy_search_index.json.gz",
        data_version=nightly["meta"]["version"],
        exported_at=nightly["meta"]["generated_at"],
        r2_object_keys={"galaxy_data": "nightly/galaxy_data.json.gz", "galaxy_search_index": "nightly/galaxy_search_index.json.gz"},
        active_pointer=active,
        profile_url=f"https://assets.example.test/{immutable_profile_key('galaxy', str(monthly['profile_id']))}",
    )

    assert nightly["movies"] != monthly_nightly_fixture["monthly_export"]["movies"]
    assert manifest["data_version"] == nightly["meta"]["version"]
    assert manifest["focus_emission_profile"] == active
    assert manifest["focus_emission_profile"]["curve_sha256"] == monthly["curve_sha256"]
    assert manifest["focus_emission_profile"]["source_data_version"] == monthly["source_data_version"]
    assert manifest["focus_emission_profile_url"].endswith(f"/{monthly['profile_id']}.json")


def test_same_period_freeze_force_audit_and_drift_evidence_share_profile_provenance(
    monthly_nightly_fixture: dict[str, Any],
) -> None:
    active_profile = _profile(monthly_nightly_fixture["monthly_export"])
    active = pointer_from_profile(active_profile, activated_at="2026-07-22T02:00:00.000Z")
    nightly = monthly_nightly_fixture["nightly_export"]
    candidate = generate_monthly_profile(
        nightly["movies"],
        {**nightly["meta"], "threshold_version": "dynamic-vote-count-v42", "period": "2026-07"},
        generated_at="2026-07-23T02:00:00.000Z",
        git_commit="0123456789abcdef",
    )

    frozen = decide_activation(
        candidate_profile=candidate,
        existing_active_pointer=active,
        activated_at="2026-07-23T02:30:00.000Z",
    )
    assert frozen.action == "frozen-same-period"
    assert frozen.pointer == active
    assert frozen.audit["old_profile_id"] == active_profile["profile_id"]
    assert frozen.audit["candidate_profile_id"] == candidate["profile_id"]

    forced = decide_activation(
        candidate_profile=candidate,
        existing_active_pointer=active,
        force=True,
        reason="fixture provenance repair",
        actor="github:phase42-test",
        activated_at="2026-07-23T03:00:00.000Z",
    )
    drift = calculate_drift_metrics(candidate, active_profile)
    evidence = build_monthly_refit_meta_payload(
        {}, candidate_profile=candidate, active_pointer=forced.pointer,
        decision=forced, candidate_drift=drift,
    )["emission_profile"]

    assert forced.audit["old_profile_id"] == active_profile["profile_id"]
    assert forced.audit["new_profile_id"] == candidate["profile_id"]
    assert evidence["candidate"]["curve_sha256"] == candidate["curve_sha256"]
    assert evidence["active"]["curve_sha256"] == candidate["curve_sha256"]
    assert evidence["drift"]["previous_profile_id"] == active_profile["profile_id"]
    assert evidence["drift"]["current_profile_id"] == candidate["profile_id"]
    assert evidence["drift"]["previous_source_data_version"] == active_profile["source_data_version"]
    assert evidence["drift"]["current_source_data_version"] == candidate["source_data_version"]
    assert evidence["drift"]["lut_max_absolute_delta"] >= evidence["drift"]["lut_mean_absolute_delta"] > 0


def test_invalid_monthly_candidate_records_failure_without_replacing_active_pointer(
    monthly_nightly_fixture: dict[str, Any],
) -> None:
    active_profile = _profile(monthly_nightly_fixture["monthly_export"])
    active = pointer_from_profile(active_profile, activated_at="2026-07-22T02:00:00.000Z")
    corrupted = {**active_profile, "curve_sha256": "f" * 64}

    with pytest.raises(ProfileReleaseError, match="curve_sha256"):
        decide_activation(candidate_profile=corrupted, existing_active_pointer=active)

    rollback_evidence = build_monthly_refit_meta_payload(
        {"previous": "kept"}, candidate_profile=None, active_pointer=active,
        decision=None, failure_reason="candidate curve_sha256 validation failed",
    )["emission_profile"]
    assert rollback_evidence["active"] == active
    assert rollback_evidence["candidate"] is None
    assert rollback_evidence["failure_reason"] == "candidate curve_sha256 validation failed"


def test_fixture_curve_nodes_match_the_cross_runtime_contract(
    monthly_nightly_fixture: dict[str, Any],
) -> None:
    profile = _profile(monthly_nightly_fixture["monthly_export"])
    assert [profile["samples"][index] for index in (80, 81, 120, 121, 160, 161)] == pytest.approx([
        0.085625, 0.16625, 0.3275, 0.48875, 0.569375, 0.65,
    ], abs=1e-15)

    # New manifests require complete profile provenance; legacy manifests remain readable.
    legacy = build_assets_manifest(
        galaxy_url="https://assets.example.test/legacy/galaxy_data.json.gz",
        search_url="https://assets.example.test/legacy/galaxy_search_index.json.gz",
        data_version="legacy-v1", exported_at="2026-07-01T00:00:00.000Z",
        r2_object_keys={"galaxy_data": "legacy/galaxy_data.json.gz", "galaxy_search_index": "legacy/galaxy_search_index.json.gz"},
        active_pointer=None, profile_url=None,
    )
    assert "focus_emission_profile" not in legacy

    with pytest.raises(MonthlyProfileError, match="curve_sha256"):
        calculate_drift_metrics({**profile, "curve_sha256": "0" * 64}, profile)
