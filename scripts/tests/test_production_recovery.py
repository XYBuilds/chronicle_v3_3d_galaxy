"""Audited Production Recovery planner (#7)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.production_recovery import (  # noqa: E402
    RecoveryError,
    execute_recovery,
    main as recovery_main,
)

NOW = "2026-08-13T04:00:00.000Z"
ACTOR = "XYBuilds"
REASON = "restore last-known-good after failed promotion"


def _audit_kwargs(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "target": "rel-059",
        "from_identity": "rel-060",
        "to_identity": "rel-059",
        "reason": REASON,
        "actor": ACTOR,
        "recorded_at": NOW,
        "smoke_result": "pending",
        "dry_run": True,
    }
    payload.update(overrides)
    return payload


def test_every_recovery_action_records_required_audit_fields() -> None:
    record = execute_recovery("hold_releases", **_audit_kwargs(target="daily-monthly", to_identity="held"))
    for field in ("action", "target", "from_identity", "to_identity", "reason", "actor", "recorded_at", "smoke_result"):
        assert record[field]
    assert record["action"] == "hold_releases"
    assert record["dry_run"] is True
    assert record["mutations"] == []
    assert record["plan"]["cadence"] == "daily-monthly"


def test_missing_reason_or_actor_fails_closed() -> None:
    with pytest.raises(RecoveryError, match="reason"):
        execute_recovery("hold_releases", **_audit_kwargs(reason=""))
    with pytest.raises(RecoveryError, match="actor"):
        execute_recovery("data_rollback", **_audit_kwargs(actor=""))


def test_data_rollback_redeploys_retained_release_with_active_site_and_skips_supabase() -> None:
    record = execute_recovery(
        "data_rollback",
        retained_releases=("rel-059", "rel-060"),
        active_site_artifact="site-bbbb",
        og_projection_differs=False,
        **_audit_kwargs(),
    )
    assert record["plan"]["manifest_release"] == "rel-059"
    assert record["plan"]["site_artifact"] == "site-bbbb"
    assert record["plan"]["rebuild_og_projection"] is False
    assert record["plan"]["rollback_supabase"] is False
    assert record["dry_run"] is True


def test_data_rollback_audit_records_release_evidence_fields() -> None:
    record = execute_recovery(
        "data_rollback",
        retained_releases=("rel-059", "rel-060"),
        active_site_artifact="site-bbbb",
        run_id="1234567890",
        git_commit="e9a2608",
        data_version="2026.08.13.1",
        profile_id="profile-active",
        **_audit_kwargs(),
    )
    assert record["run_id"] == "1234567890"
    assert record["git_commit"] == "e9a2608"
    assert record["data_version"] == "2026.08.13.1"
    assert record["profile_id"] == "profile-active"


def test_data_rollback_rebuilds_og_only_when_projection_differs() -> None:
    record = execute_recovery(
        "data_rollback",
        retained_releases=("rel-059", "rel-060"),
        active_site_artifact="site-bbbb",
        og_projection_differs=True,
        **_audit_kwargs(),
    )
    assert record["plan"]["rebuild_og_projection"] is True


def test_data_rollback_rejects_a_release_that_is_not_retained() -> None:
    with pytest.raises(RecoveryError, match="retained"):
        execute_recovery(
            "data_rollback",
            retained_releases=("rel-060",),
            active_site_artifact="site-bbbb",
            **_audit_kwargs(),
        )


def test_site_rollback_deploys_previous_artifact_with_current_data_release() -> None:
    record = execute_recovery(
        "site_rollback",
        current_data_release="rel-060",
        previous_site_artifact="site-aaaa",
        **_audit_kwargs(target="site-aaaa", from_identity="site-bbbb", to_identity="site-aaaa"),
    )
    assert record["plan"]["site_artifact"] == "site-aaaa"
    assert record["plan"]["manifest_release"] == "rel-060"
    assert record["plan"]["rebuild_og_projection"] is False
    assert record["plan"]["rollback_supabase"] is False


def test_profile_rollback_creates_a_new_data_release_instead_of_flipping_the_pointer() -> None:
    record = execute_recovery(
        "profile_rollback",
        **_audit_kwargs(target="profile-previous", from_identity="profile-active", to_identity="profile-previous"),
    )
    assert record["plan"]["creates_new_data_release"] is True
    assert record["plan"]["flip_active_pointer_in_place"] is False


def test_continue_candidate_is_not_a_supported_recovery_action() -> None:
    with pytest.raises(RecoveryError, match="unknown recovery action"):
        execute_recovery(
            "continue_candidate",
            **_audit_kwargs(target="cand-1", from_identity="cand-1", to_identity="cand-1"),
        )


def test_breaking_og_recovery_stops_producer_before_worker_and_retains_kv() -> None:
    record = execute_recovery(
        "og_full_recovery",
        **_audit_kwargs(target="og-index", from_identity="meta:G:9", to_identity="meta:G:8"),
    )
    assert record["plan"]["order"] == ("chronicle_producer", "og_worker")
    assert record["plan"]["retain_diagnostic_kv"] is True


def test_dangerous_overrides_stay_off_the_normal_surface() -> None:
    with pytest.raises(RecoveryError, match="confirm"):
        execute_recovery(
            "dimension_override",
            **_audit_kwargs(target="language-palette", from_identity="v2", to_identity="bypass"),
        )
    record = execute_recovery(
        "dimension_override",
        confirm_dangerous=True,
        **_audit_kwargs(target="language-palette", from_identity="v2", to_identity="bypass"),
    )
    assert record["plan"]["dangerous"] is True
    assert record["dry_run"] is True


def test_cli_unknown_continue_candidate_fails_closed(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit):
        recovery_main([
            "--action", "continue_candidate",
            "--target", "cand-1",
            "--from-identity", "cand-1",
            "--to-identity", "cand-1",
            "--reason", REASON,
            "--actor", ACTOR,
            "--recorded-at", NOW,
            "--dry-run",
        ])


def test_cli_dry_run_prints_audit_record_and_refuses_live_mutation(capsys: pytest.CaptureFixture[str]) -> None:
    code = recovery_main([
        "--action", "hold_releases",
        "--target", "daily-monthly",
        "--from-identity", "running",
        "--to-identity", "held",
        "--reason", REASON,
        "--actor", ACTOR,
        "--recorded-at", NOW,
        "--dry-run",
    ])
    assert code == 0
    record = json.loads(capsys.readouterr().out)
    assert record["action"] == "hold_releases"
    assert record["dry_run"] is True
    live = recovery_main([
        "--action", "data_rollback",
        "--target", "rel-059",
        "--from-identity", "rel-060",
        "--to-identity", "rel-059",
        "--reason", REASON,
        "--actor", ACTOR,
        "--recorded-at", NOW,
        "--retained-releases", "rel-059,rel-060",
        "--active-site-artifact", "site-bbbb",
        "--no-dry-run",
    ])
    assert live == 1
    assert "repository-owned" in capsys.readouterr().out
