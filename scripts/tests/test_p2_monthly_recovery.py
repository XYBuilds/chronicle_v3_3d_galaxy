"""P2 Monthly suspension and Production Recovery seams (tmc:chronicle:01M09Y4T05BTWFBX7H5N67MBXR)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_ROOT = Path(__file__).resolve().parents[2]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.production_recovery import (  # noqa: E402
    ACTIONS,
    RecoveryError,
    compare_starting_identity,
    execute_recovery,
    write_recovery_evidence,
)
from publication.bundle import require_recorded_hash, verify_bundle_hash  # noqa: E402
from publication.commands import WRANGLER_PACKAGE  # noqa: E402
from publication.entrypoints import RecordingRunner, run_daily_release, run_monthly_release, run_site_release  # noqa: E402
from publication.errors import PublicationError  # noqa: E402
from publication.evidence import assemble_p2_evidence  # noqa: E402
from publication.gitlab_ci import validate_p2_gitlab_ci  # noqa: E402
from publication.sequence import bootstrap_sequence  # noqa: E402
from publication.store import MemoryPublicationStore  # noqa: E402
from cron.publication_hold import HoldError, check_hold  # noqa: E402

NOW = "2026-08-18T15:00:00.000Z"
ACTOR = "yixie.ixd"
REASON = "restore last-known-good after failed promotion"
RISK = {
    "schema": "chronicle-risk-declaration-v1",
    "tier": "R3",
    "surfaces": ["publication", "planet_export", "og_worker", "daily"],
    "notes": (
        "Protected surfaces publication, planet_export, og_worker, and daily. "
        "Concrete production resources and secrets stay in declaration notes: "
        "Pages Direct Upload, R2 bundle/profile/data/site/receipt state, OG KV/checkpoint, "
        "Supabase, and Cloudflare Pages. Bitwarden remains the secrets authority."
    ),
}


def _clock() -> str:
    return NOW


def _store() -> MemoryPublicationStore:
    store = MemoryPublicationStore()
    bootstrap_sequence(store, verified_identities=("2026.08.02.daily.131", "2026.07.01.monthly.40"))
    return store


def _request(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "mode": "fixture",
        "ref": "main",
        "protected": True,
        "pipeline_source": "web",
        "trigger": "manual",
        "source_commit": "abc123",
        "actor": ACTOR,
        "requested_at": NOW,
        "pages_project": "themoviecosmos",
        "bundle_sha256": "a" * 64,
    }
    payload.update(overrides)
    return payload


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
        "source_commit": "abc123",
    }
    payload.update(overrides)
    return payload


def test_gitlab_ci_defines_disabled_monthly_job_and_keeps_site_daily_lane() -> None:
    ci = (_ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
    accepted = validate_p2_gitlab_ci(ci)
    assert accepted["monthly_data_release"] is True
    assert accepted["monthly_enabled"] is False
    assert accepted["resource_group"] == "galaxy-r2-pages-release"
    assert "P2_MONTHLY_ENABLED: \"false\"" in ci
    monthly = ci[ci.index("monthly_data_release:") :]
    assert "when: never" in monthly
    assert "scripts/publication/cli.py monthly-release" in monthly
    assert "resource_group: galaxy-r2-pages-release" in monthly
    assert "interruptible: false" in monthly
    assert "npm run build" not in monthly
    assert "cloudflare/wrangler-action" not in monthly
    assert "continue-candidate" not in ci
    assert "continue_candidate" not in ci
    assert "allow_profile_bootstrap" not in monthly
    assert "--allow-bootstrap" not in monthly
    assert "--force-activation" not in monthly
    github_monthly = (_ROOT / ".github/workflows/monthly_refit.yml").read_text(encoding="utf-8")
    github_recovery = (_ROOT / ".github/workflows/production_recovery.yml").read_text(encoding="utf-8")
    assert "vars.P2_MONTHLY_RELEASE_ENABLED == 'true'" in github_monthly
    assert "if: false" in github_recovery
    assert "continue_candidate" not in github_recovery


def test_monthly_fixture_orders_bundle_refit_og_and_monthly_profile_upload() -> None:
    store = _store()
    runner = RecordingRunner()
    receipt = run_monthly_release(store=store, runner=runner, request=_request(), clock=_clock)
    names = [command.name for command in runner.commands]
    assert names[:7] == [
        "validate-embedding-bundle",
        "fetch-hold",
        "publication-hold",
        "supabase-preflight",
        "galaxy-refit",
        "og-sync",
        "immutable-r2",
    ]
    assert names.index("og-sync") < names.index("immutable-r2")
    assert names.index("fetch-active") < names.index("compose-active-artifact")
    assert "pages-deploy" in names
    assert "production-smoke" in names
    refit = next(command for command in runner.commands if command.name == "galaxy-refit")
    assert refit.env["GALAXY_EXPORT_SEQ"] == str(receipt["sequence"])
    assert refit.env["GALAXY_EXPORT_VERSION_BRANCH"] == "monthly"
    assert "--dry-run" in refit.argv
    joined = " ".join(" ".join(command.argv) for command in runner.commands)
    upload = next(command for command in runner.commands if command.name == "immutable-r2")
    assert "--mode" in upload.argv and "monthly" in upload.argv
    assert "--allow-bootstrap" not in upload.argv
    assert "--force-activation" not in upload.argv
    assert receipt["entry_point"] == "monthly-data-release"
    assert receipt["sequence"] == 132
    assert receipt["data_release_identity"] == "2026.08.18.monthly.132"
    assert "continue-candidate" not in joined
    deploy = next(command for command in runner.commands if command.name == "pages-deploy")
    assert WRANGLER_PACKAGE in deploy.argv
    failed = RecordingRunner(fail_on="supabase-preflight")
    broken = run_monthly_release(store=_store(), runner=failed, request=_request(), clock=_clock)
    assert broken["result"] == "failed"
    assert broken["smoke"]["ok"] is False
    assert not any(command.name == "pages-deploy" for command in failed.commands)


def test_monthly_fixture_does_not_claim_production_or_hosted_duration() -> None:
    receipt = run_monthly_release(store=_store(), runner=RecordingRunner(), request=_request(), clock=_clock)
    assert receipt["result"] == "success"
    assert receipt["inputs"].get("production_monthly_restored") is not True
    assert receipt["inputs"].get("hosted_duration_viable") is not True
    with pytest.raises(PublicationError, match="suspended"):
        run_monthly_release(store=_store(), runner=RecordingRunner(), request=_request(mode="production"), clock=_clock)
    with pytest.raises(PublicationError, match="suspended"):
        run_monthly_release(
            store=_store(),
            runner=RecordingRunner(),
            request=_request(mode="windows-emergency"),
            clock=_clock,
        )


def test_monthly_hosted_and_windows_fixture_share_entry_point_argv() -> None:
    hosted_runner = RecordingRunner()
    windows_runner = RecordingRunner()
    hosted = run_monthly_release(
        store=_store(),
        runner=hosted_runner,
        request=_request(provider={"pipeline_id": "gitlab-1", "job_id": "job-1"}),
        clock=_clock,
    )
    windows = run_monthly_release(
        store=_store(),
        runner=windows_runner,
        request=_request(provider={"pipeline_id": "local", "job_id": "windows"}),
        clock=_clock,
    )
    assert [command.name for command in hosted_runner.commands] == [command.name for command in windows_runner.commands]
    assert [command.argv for command in hosted_runner.commands] == [command.argv for command in windows_runner.commands]
    assert hosted["data_release_identity"] == windows["data_release_identity"]


def test_daily_reuses_active_profile_and_never_runs_monthly_upload() -> None:
    runner = RecordingRunner()
    receipt = run_daily_release(store=_store(), runner=runner, request=_request(), clock=_clock)
    names = [command.name for command in runner.commands]
    assert "galaxy-refit" not in names
    assert "validate-embedding-bundle" not in names
    assert "light-refresh" in names
    upload = next(command for command in runner.commands if command.name == "immutable-r2")
    assert "nightly" in upload.argv
    assert "monthly" not in upload.argv
    assert "--profile" not in upload.argv
    assert "--allow-bootstrap" not in upload.argv
    assert receipt["entry_point"] == "daily-data-release"


def test_canonical_bundle_record_requires_sha256_and_detects_mismatch() -> None:
    recorded = require_recorded_hash(
        {
            "schema": "chronicle-canonical-embedding-bundle-v1",
            "filenames": [
                "cleaned.csv",
                "text_embeddings.npy",
                "genre_vectors.npy",
                "language_vectors.npy",
            ],
            "r2_object": "ops/recovery/canonical-embedding-bundle.zip",
            "macbook_snapshot": True,
            "sha256": "b" * 64,
        }
    )
    assert recorded == "b" * 64
    verify_bundle_hash(digest="b" * 64, recorded=recorded)
    with pytest.raises(PublicationError, match="hash mismatch"):
        verify_bundle_hash(digest="c" * 64, recorded=recorded)
    with pytest.raises(PublicationError, match="SHA-256"):
        require_recorded_hash(
            {
                "schema": "chronicle-canonical-embedding-bundle-v1",
                "filenames": [
                    "cleaned.csv",
                    "text_embeddings.npy",
                    "genre_vectors.npy",
                    "language_vectors.npy",
                ],
                "r2_object": "ops/recovery/canonical-embedding-bundle.zip",
                "macbook_snapshot": True,
                "sha256": None,
            }
        )


def test_continue_candidate_is_removed_from_the_supported_recovery_surface() -> None:
    assert "continue_candidate" not in ACTIONS
    with pytest.raises(RecoveryError, match="unknown recovery action"):
        execute_recovery("continue_candidate", **_audit_kwargs(target="cand-1", from_identity="cand-1", to_identity="cand-1"))


def test_recovery_plan_records_audit_fields_and_hold_is_the_only_direct_mutation() -> None:
    hold = execute_recovery("hold_releases", **_audit_kwargs(target="daily-monthly", to_identity="held", from_identity="running"))
    for field in ("action", "target", "from_identity", "to_identity", "reason", "actor", "recorded_at", "smoke_result", "source_commit"):
        assert hold[field]
    assert hold["plan"]["direct_mutation"] == "publication-hold"
    assert hold["plan"]["expected_mutations"] == ["publication-hold"]
    data = execute_recovery(
        "data_rollback",
        retained_releases=("rel-059", "rel-060"),
        active_site_artifact="site-bbbb",
        **_audit_kwargs(),
    )
    assert data["plan"]["rollback_supabase"] is False
    assert data["plan"]["creates_new_publication_identity"] is True
    assert data["plan"]["direct_mutation"] is False
    assert data["dry_run"] is True
    with pytest.raises(RecoveryError, match="repository-owned"):
        execute_recovery(
            "data_rollback",
            retained_releases=("rel-059", "rel-060"),
            active_site_artifact="site-bbbb",
            **_audit_kwargs(dry_run=False),
        )


def test_fresh_inventory_mismatch_and_ambiguous_takeover_fail_closed(tmp_path: Path) -> None:
    compare_starting_identity(planned="rel-060", observed="rel-060")
    with pytest.raises(RecoveryError, match="starting identity"):
        compare_starting_identity(planned="rel-060", observed="rel-061")
    with pytest.raises(RecoveryError, match="starting identity"):
        execute_recovery(
            "hold_releases",
            observed_from_identity="rel-061",
            hosted={"accessible": True, "triggers_paused": True, "running_or_queued": False, "authority_ambiguous": False},
            **_audit_kwargs(target="daily-monthly", from_identity="rel-060", to_identity="held", dry_run=False),
        )
    with pytest.raises(RecoveryError, match="ambiguous"):
        execute_recovery(
            "hold_releases",
            observed_from_identity="running",
            hosted={"accessible": True, "triggers_paused": True, "running_or_queued": False, "authority_ambiguous": True},
            **_audit_kwargs(target="daily-monthly", from_identity="running", to_identity="held", dry_run=False),
        )
    hold_path = tmp_path / "publication-hold.json"
    evidence = MemoryPublicationStore()
    record = execute_recovery(
        "hold_releases",
        observed_from_identity="running",
        hosted={"accessible": True, "triggers_paused": True, "running_or_queued": False, "authority_ambiguous": False},
        hold_path=hold_path,
        evidence_store=evidence,
        **_audit_kwargs(target="daily-monthly", from_identity="running", to_identity="held", dry_run=False),
    )
    assert record["mutations"] == ["publication-hold"]
    assert json.loads(hold_path.read_text(encoding="utf-8"))["held"] is True
    assert any(key.startswith("ops/recovery/evidence/") for key in evidence.objects)
    corrupt = tmp_path / "corrupt-hold.json"
    corrupt.write_text("{not-json", encoding="utf-8")
    with pytest.raises(HoldError, match="unreadable"):
        check_hold(corrupt)


def test_recovery_evidence_is_immutable_sanitized_and_rejects_write_failure() -> None:
    store = MemoryPublicationStore()
    plan = execute_recovery(
        "site_rollback",
        current_data_release="rel-060",
        previous_site_artifact="site-aaaa",
        **_audit_kwargs(target="site-aaaa", from_identity="site-bbbb", to_identity="site-aaaa"),
    )
    bundle = write_recovery_evidence(
        store,
        {
            "plan": plan,
            "before_inventory": {"site_artifact": "site-bbbb"},
            "after_inventory": {"site_artifact": "site-bbbb"},
            "command": ["python", "scripts/cron/production_recovery.py", "--action", "site_rollback"],
            "source_commit": "abc123",
            "actor": ACTOR,
            "reason": REASON,
            "identities": {"from": "site-bbbb", "to": "site-aaaa"},
            "attempted_mutations": [],
            "receipt_identities": [],
            "smoke": {"ok": False, "required": "production-smoke"},
            "disposition": "planned",
            "started_at": NOW,
            "finished_at": NOW,
        },
    )
    assert bundle["schema"] == "chronicle-recovery-evidence-v1"
    assert bundle["ok"] is True
    linked = write_recovery_evidence(
        store,
        {
            **{name: bundle[name] for name in (
                "plan",
                "before_inventory",
                "after_inventory",
                "command",
                "source_commit",
                "actor",
                "reason",
                "identities",
                "attempted_mutations",
                "smoke",
                "disposition",
                "started_at",
                "finished_at",
            )},
            "receipt_identities": ["2026.08.18.daily.140"],
        },
    )
    assert linked["receipt_identities"] == ["2026.08.18.daily.140"]
    secret = {
        "plan": plan,
        "before_inventory": {},
        "after_inventory": {},
        "command": ["python"],
        "source_commit": "abc123",
        "actor": ACTOR,
        "reason": REASON,
        "identities": {},
        "attempted_mutations": [],
        "receipt_identities": [],
        "smoke": {},
        "disposition": "planned",
        "started_at": NOW,
        "finished_at": NOW,
        "CLOUDFLARE_API_TOKEN": "live-value",
    }
    with pytest.raises(RecoveryError, match="secret"):
        write_recovery_evidence(store, secret)

    class FailingStore:
        def put(self, key: str, body: bytes) -> None:
            raise OSError("r2 unavailable")

        def get(self, key: str) -> bytes | None:
            return None

    with pytest.raises(RecoveryError, match="evidence"):
        write_recovery_evidence(FailingStore(), bundle)


def test_dangerous_actions_stay_off_normal_monthly_and_daily_inputs() -> None:
    monthly = RecordingRunner()
    daily = RecordingRunner()
    site = RecordingRunner()
    run_monthly_release(store=_store(), runner=monthly, request=_request(), clock=_clock)
    run_daily_release(store=_store(), runner=daily, request=_request(), clock=_clock)
    run_site_release(store=_store(), runner=site, request=_request(mode="fixture"), clock=_clock)
    joined = " ".join(
        " ".join(command.argv)
        for command in (*monthly.commands, *daily.commands, *site.commands)
    )
    for token in (
        "--allow-bootstrap",
        "--force-activation",
        "--allow-full-recovery",
        "force_skip_dim_check",
        "--continue-candidate",
    ):
        assert token not in joined
    og = execute_recovery("og_full_recovery", **_audit_kwargs(target="og-index", from_identity="meta:G:9", to_identity="meta:G:8"))
    assert og["plan"]["order"] == ("chronicle_producer", "og_worker")
    assert og["plan"]["retain_diagnostic_kv"] is True


def test_p2_evidence_requires_r3_surfaces_disabled_monthly_and_no_manufactured_mutation() -> None:
    fixture = json.loads((_ROOT / "scripts/publication/fixtures/risk-declaration.json").read_text(encoding="utf-8"))
    assert fixture["tier"] == "R3"
    assert fixture["surfaces"] == ["publication", "planet_export", "og_worker", "daily"]
    gates = {
        "gitlab_ci": {"ok": True, "monthly_enabled": False},
        "tests": {"ok": True},
        "canonical_bundle": {"ok": True, "sha256": "d" * 64, "macbook_snapshot": True, "r2": True},
        "monthly_fixture": {"ok": True, "production_run": False, "galaxy_refit": False},
        "recovery_planner": {"ok": True, "continue_candidate": False},
        "r3_integration": {
            "ok": True,
            "planet_export_daily": True,
            "og_worker": True,
            "monthly_production_run": False,
            "manufactured_recovery_mutation": False,
        },
    }
    with pytest.raises(PublicationError, match="merge"):
        assemble_p2_evidence(gates=gates, risk_declaration=RISK, merge_approved=False)
    with pytest.raises(PublicationError, match="Monthly"):
        assemble_p2_evidence(
            gates={**gates, "gitlab_ci": {"ok": True, "monthly_enabled": True}},
            risk_declaration=RISK,
            merge_approved=True,
        )
    bundle = assemble_p2_evidence(gates=gates, risk_declaration=RISK, merge_approved=True, recorded_at="2026-08-18T16:00:00Z")
    assert bundle["schema"] == "chronicle-p2-evidence-v1"
    assert bundle["monthly_enabled"] is False
    assert bundle["risk_declaration"]["surfaces"] == list(RISK["surfaces"])
    with pytest.raises(PublicationError, match="re-enablement"):
        assemble_p2_evidence(
            gates=gates,
            risk_declaration={**RISK, "monthly_reenablement_approved": True},
            merge_approved=True,
        )
