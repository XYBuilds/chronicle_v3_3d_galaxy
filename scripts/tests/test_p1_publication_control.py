"""P1 publication-control seams (tmc:chronicle:01M09Y4T044FR6X31Q618TC2K9)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_ROOT = Path(__file__).resolve().parents[2]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from publication.admission import admit_protected_ref, prove_local_takeover, validate_resource_group
from publication.backlog import evaluate_schedule_backlog
from publication.commands import PRODUCTION_PAGES_BRANCH, WINDOWS_PREVIEW_BRANCH, WRANGLER_PACKAGE
from publication.entrypoints import RecordingRunner, run_daily_release, run_site_release
from publication.errors import PublicationError
from publication.evidence import assemble_p1_evidence
from publication.gitlab_ci import validate_p1_gitlab_ci
from publication.inventory import evaluate_inventory
from publication.receipt import build_receipt
from publication.sequence import allocate_sequence, bootstrap_sequence, parse_identity_suffix
from publication.store import MemoryPublicationStore


def _clock() -> str:
    return "2026-08-18T13:00:00.000Z"


def _store() -> MemoryPublicationStore:
    store = MemoryPublicationStore()
    bootstrap_sequence(store, verified_identities=("2026.08.02.daily.131", "2026.07.17.daily.112"))
    return store


def _request(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "mode": "fixture",
        "ref": "main",
        "protected": True,
        "pipeline_source": "web",
        "trigger": "manual",
        "source_commit": "abc123",
        "actor": "yixie.ixd",
        "requested_at": _clock(),
        "selected_data_release": "2026.08.02.daily.131",
        "pages_project": "themoviecosmos",
    }
    payload.update(overrides)
    return payload


def _receipt_base() -> dict[str, object]:
    return {
        "entry_point": "site-release",
        "sequence": 132,
        "trigger": "manual",
        "requested_at": _clock(),
        "source_commit": "abc123",
        "actor": "yixie.ixd",
        "inputs": {},
        "stages": ["pages-deploy"],
        "mutations": ["pages-deploy"],
        "pages_deployment": {"branch": "main"},
        "smoke": {"ok": True},
        "rollback_attempt": {},
        "result": "success",
        "started_at": _clock(),
        "finished_at": _clock(),
    }


def test_sequence_bootstraps_strictly_above_verified_suffixes_and_fails_closed() -> None:
    store = MemoryPublicationStore()
    assert parse_identity_suffix("2026.08.02.daily.131") == 131
    accepted = bootstrap_sequence(store, verified_identities=("2026.08.02.daily.131", "2026.07.01.monthly.40"))
    assert accepted["head"] == 131
    assert allocate_sequence(store) == 132
    assert allocate_sequence(store) == 133
    with pytest.raises(PublicationError, match="behind"):
        bootstrap_sequence(store, verified_identities=("2026.08.18.daily.200",))
    corrupt = MemoryPublicationStore()
    corrupt.put("ops/publication/sequence.json", b"{not-json")
    with pytest.raises(PublicationError, match="corrupt"):
        allocate_sequence(corrupt)
    missing = MemoryPublicationStore()
    with pytest.raises(PublicationError, match="missing"):
        allocate_sequence(missing)


def test_receipt_records_provenance_and_rejects_secrets() -> None:
    receipt = build_receipt(_receipt_base())
    assert receipt["schema"] == "chronicle-publication-receipt-v1"
    assert receipt["sequence"] == 132
    assert receipt["entry_point"] == "site-release"
    secret = _receipt_base()
    secret["inputs"] = {"CLOUDFLARE_API_TOKEN": "live-value"}
    with pytest.raises(PublicationError, match="secret"):
        build_receipt(secret)


def test_replay_cannot_publish_behind_a_newer_success() -> None:
    store = _store()
    runner = RecordingRunner()
    first = run_site_release(store=store, runner=runner, request=_request(), clock=_clock)
    assert first["result"] == "success"
    assert first["sequence"] == 132
    stale = MemoryPublicationStore(dict(store.objects))
    from publication.store import SEQUENCE_KEY

    stale.put(SEQUENCE_KEY, b'{"bootstrap_min": 131, "head": 131, "schema": "chronicle-publication-sequence-v1"}')
    with pytest.raises(PublicationError, match="behind"):
        run_site_release(store=stale, runner=RecordingRunner(), request=_request(trigger="replay"), clock=_clock)


def test_scheduled_backlog_collapses_to_one_catch_up() -> None:
    assert evaluate_schedule_backlog({"trigger": "manual"})["action"] == "proceed"
    assert evaluate_schedule_backlog({"trigger": "schedule"})["action"] == "catch-up"
    skipped = evaluate_schedule_backlog({"trigger": "schedule", "covered_by_sequence": 140})
    assert skipped["action"] == "exit"
    runner = RecordingRunner()
    receipt = run_daily_release(
        store=_store(),
        runner=runner,
        request=_request(trigger="schedule", covered_by_sequence=140),
        clock=_clock,
    )
    assert receipt["result"] == "skipped-backlog"
    assert runner.commands == []


def test_production_admission_rejects_unprotected_and_merge_request_refs() -> None:
    admit_protected_ref({"mode": "production", "ref": "main", "protected": True, "pipeline_source": "web"})
    with pytest.raises(PublicationError, match="protected main"):
        admit_protected_ref({"mode": "production", "ref": "topic", "protected": False, "pipeline_source": "web"})
    with pytest.raises(PublicationError, match="merge-request"):
        admit_protected_ref({"mode": "production", "ref": "main", "protected": True, "pipeline_source": "merge_request_event"})
    accepted = validate_resource_group({"key": "galaxy-r2-pages-release", "process_mode": "oldest_first", "source": "api"})
    assert accepted["process_mode"] == "oldest_first"
    with pytest.raises(PublicationError, match="oldest_first"):
        validate_resource_group({"key": "galaxy-r2-pages-release", "process_mode": "newest_first", "source": "api"})


def test_inventory_fails_closed_on_missing_corrupt_or_ambiguous_state() -> None:
    checks = {
        name: {"ok": True, "status": "ok", "artifact_id": name}
        for name in (
            "pages_project",
            "manifest",
            "active_site_artifact",
            "rollback_site_artifact",
            "og_checkpoint",
            "active_profile",
            "publication_hold",
            "r2_access",
            "supabase_readiness",
            "sequence_bootstrap",
            "resource_group",
        )
    }
    checks["active_site_artifact"]["artifact_id"] = "site-active"
    checks["rollback_site_artifact"]["artifact_id"] = "site-previous"
    assert evaluate_inventory(checks)["ok"] is True
    broken = dict(checks)
    broken["og_checkpoint"] = {"ok": False, "status": "corrupt"}
    with pytest.raises(PublicationError, match="og_checkpoint"):
        evaluate_inventory(broken)


def test_site_entry_point_preserves_data_release_and_rolls_back_on_deploy_failure() -> None:
    store = _store()
    runner = RecordingRunner()
    receipt = run_site_release(store=store, runner=runner, request=_request(mode="production"), clock=_clock)
    names = [command.name for command in runner.commands]
    assert names[:5] == ["fetch-live-manifest", "fetch-active-registry", "install-node", "build-shell", "identify-shell"]
    assert "unpack-shell" in names
    assert "compose" in names
    assert "pages-deploy" in names
    assert "production-smoke" in names
    assert "mark-active" in names
    assert receipt["data_release_identity"] == "2026.08.02.daily.131"
    assert receipt["result"] == "success"
    deploy = next(command for command in runner.commands if command.name == "pages-deploy")
    assert WRANGLER_PACKAGE in deploy.argv
    assert f"--branch={PRODUCTION_PAGES_BRANCH}" in deploy.argv
    assert deploy.cwd == "pages-bundle"
    failed = RecordingRunner(fail_on="pages-deploy")
    rolled = run_site_release(store=_store(), runner=failed, request=_request(mode="production"), clock=_clock)
    assert rolled["result"] == "rolled-back"
    assert rolled["rollback_attempt"]["attempted"] is True
    assert any(command.name == "redeploy-previous-artifact" for command in failed.commands)


def test_daily_entry_point_orders_og_before_r2_and_uses_chronicle_sequence() -> None:
    store = _store()
    runner = RecordingRunner()
    receipt = run_daily_release(store=store, runner=runner, request=_request(mode="fixture", trigger="schedule"), clock=_clock)
    names = [command.name for command in runner.commands]
    assert names[:6] == [
        "fetch-hold",
        "publication-hold",
        "supabase-preflight",
        "light-refresh",
        "og-sync",
        "immutable-r2",
    ]
    assert names.index("og-sync") < names.index("immutable-r2")
    assert names.index("fetch-active") < names.index("compose-active-artifact")
    deploy = next(command for command in runner.commands if command.name == "pages-deploy")
    assert deploy.cwd == "pages-bundle"
    refresh = next(command for command in runner.commands if command.name == "light-refresh")
    assert refresh.env["GALAXY_EXPORT_SEQ"] == str(receipt["sequence"])
    og = next(command for command in runner.commands if command.name == "og-sync")
    assert "--scope" in og.argv and "incremental" in og.argv
    assert receipt["sequence"] == 132
    assert receipt["data_release_identity"] == "2026.08.18.daily.132"
    assert "continue-candidate" not in " ".join(" ".join(command.argv) for command in runner.commands)
    failed = RecordingRunner(fail_on="production-smoke")
    rolled = run_daily_release(store=_store(), runner=failed, request=_request(mode="fixture"), clock=_clock)
    assert rolled["rollback_attempt"]["attempted"] is True
    assert any(command.name == "redeploy-last-known-good" for command in failed.commands)


def test_windows_preview_cannot_change_production_branch_or_active_registry() -> None:
    store = _store()
    runner = RecordingRunner()
    receipt = run_site_release(store=store, runner=runner, request=_request(mode="windows-preview"), clock=_clock)
    deploy = next(command for command in runner.commands if command.name == "pages-deploy")
    assert f"--branch={WINDOWS_PREVIEW_BRANCH}" in deploy.argv
    assert f"--branch={PRODUCTION_PAGES_BRANCH}" not in deploy.argv
    assert deploy.cwd == "pages-bundle"
    assert all(command.name != "mark-active" for command in runner.commands)
    assert receipt["pages_deployment"]["branch"] == WINDOWS_PREVIEW_BRANCH
    with pytest.raises(PublicationError, match="ambiguous"):
        prove_local_takeover({"authority_ambiguous": True, "accessible": True, "triggers_paused": True, "running_or_queued": False})
    prove_local_takeover({"accessible": True, "triggers_paused": True, "running_or_queued": False, "authority_ambiguous": False})


def test_cutback_keeps_gitlab_off_and_github_publication_explicitly_gated() -> None:
    ci = (_ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
    accepted = validate_p1_gitlab_ci(ci)
    assert accepted["triggers_enabled"] is False
    assert accepted["resource_group"] == "galaxy-r2-pages-release"
    assert "BW_SESSION" not in ci
    github_daily = (_ROOT / ".github/workflows/nightly_vote_refresh.yml").read_text(encoding="utf-8")
    github_site = (_ROOT / ".github/workflows/site_release.yml").read_text(encoding="utf-8")
    assert "workflow:\n  rules:\n    - when: never" in ci
    for workflow in (github_daily, github_site):
        assert "vars.PUBLICATION_AUTHORITY == 'github'" in workflow
        assert "github.ref_protected" in workflow
    assert "vars.P1_DAILY_SCHEDULE_ENABLED == 'true'" in github_daily
    assert "vars.P1_SITE_TRIGGER_ENABLED == 'true'" in github_site


def test_p1_evidence_requires_r3_surfaces_and_human_enablement() -> None:
    risk = {
        "schema": "chronicle-risk-declaration-v1",
        "tier": "R3",
        "surfaces": ["publication", "planet_export", "og_worker", "daily"],
        "notes": "GitLab production copies; values stay out of evidence.",
    }
    fixture = json.loads((_ROOT / "scripts/publication/fixtures/risk-declaration.json").read_text(encoding="utf-8"))
    assert fixture["schema"] == "chronicle-risk-declaration-v1"
    assert fixture["tier"] == "R3"
    assert fixture["surfaces"] == ["publication", "planet_export", "og_worker", "daily"]
    checks = {
        name: {"ok": True, "status": "ok", "artifact_id": f"id-{name}"}
        for name in (
            "pages_project",
            "manifest",
            "active_site_artifact",
            "rollback_site_artifact",
            "og_checkpoint",
            "active_profile",
            "publication_hold",
            "r2_access",
            "supabase_readiness",
            "sequence_bootstrap",
            "resource_group",
        )
    }
    checks["active_site_artifact"]["artifact_id"] = "site-a"
    checks["rollback_site_artifact"]["artifact_id"] = "site-b"
    gates = {
        "gitlab_ci": {"ok": True},
        "resource_group": {"ok": True, "process_mode": "oldest_first"},
        "tests": {"ok": True},
        "inventory": checks,
        "manual_site_release": {"ok": True, "smoke": True},
        "manual_daily_release": {"ok": True, "smoke": True},
        "windows_preview": {"ok": True, "scheduler": False, "updates_production_branch": False, "updates_active_registry": False},
        "job_minutes": {"ok": True, "cadence": "weekly-sunday-1800-utc"},
        "r3_integration": {"ok": True, "planet_export_daily": True, "og_worker": True},
        "production_enablement": {"ok": True},
    }
    with pytest.raises(PublicationError, match="merge"):
        assemble_p1_evidence(gates=gates, risk_declaration=risk, merge_approved=False, production_enablement_approved=True)
    with pytest.raises(PublicationError, match="enablement"):
        assemble_p1_evidence(gates=gates, risk_declaration=risk, merge_approved=True, production_enablement_approved=False)
    bundle = assemble_p1_evidence(
        gates=gates,
        risk_declaration=risk,
        merge_approved=True,
        production_enablement_approved=True,
        recorded_at="2026-08-18T14:00:00Z",
    )
    assert bundle["gitlab_sole_scheduler"] is True
    assert bundle["risk_declaration"]["tier"] == "R3"
