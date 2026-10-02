"""Provider-neutral Site, Daily, and suspended Monthly publication orchestration."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Mapping
import json

from publication.admission import admit_protected_ref, prove_local_takeover
from publication.backlog import evaluate_schedule_backlog
from publication.bundle import require_recorded_hash
from publication.commands import (
    PAGES_BUNDLE,
    PRODUCTION_PAGES_BRANCH,
    WINDOWS_PREVIEW_BRANCH,
    assert_no_dangerous_tokens,
    python_script,
    work_paths,
    wrangler_pages_deploy,
)
from publication.errors import PublicationError
from publication.receipt import latest_success_sequence, write_receipt
from publication.sequence import allocate_sequence, reject_publish_behind
from publication.store import PublicationStore

PRODUCTION_ORIGIN = "https://themoviecosmos.com"
MONTHLY_PRODUCTION_ENABLED = False


@dataclass
class Command:
    name: str
    argv: tuple[str, ...]
    env: dict[str, str] = field(default_factory=dict)
    mutates: bool = False
    rollback: bool = False
    cwd: str | None = None
    stdout_path: str | None = None


@dataclass
class CommandResult:
    ok: bool
    outputs: dict[str, Any] = field(default_factory=dict)


Runner = Callable[[Command], CommandResult]


class RecordingRunner:
    """Fixture runner that records argv and can fail a named step."""

    def __init__(self, *, fail_on: str | None = None, outputs: Mapping[str, Mapping[str, Any]] | None = None) -> None:
        self.fail_on = fail_on
        self.outputs = {key: dict(value) for key, value in (outputs or {}).items()}
        self.commands: list[Command] = []

    def __call__(self, command: Command) -> CommandResult:
        assert_no_dangerous_tokens(command.argv)
        self.commands.append(command)
        if self.fail_on is not None and command.name == self.fail_on:
            return CommandResult(ok=False, outputs={"error": self.fail_on})
        return CommandResult(ok=True, outputs=dict(self.outputs.get(command.name) or {}))


def _now(clock: Callable[[], str]) -> str:
    return clock()


def _json_field(path: str, field: str) -> Any:
    candidate = Path(path)
    if not candidate.is_file():
        return None
    try:
        payload = json.loads(candidate.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if isinstance(payload, dict):
        return payload.get(field)
    return None


def _pages_branch(mode: str) -> str:
    if mode == "windows-preview":
        return WINDOWS_PREVIEW_BRANCH
    return PRODUCTION_PAGES_BRANCH


def _write(
    store: PublicationStore,
    *,
    entry_point: str,
    sequence: int,
    request: Mapping[str, Any],
    result: str,
    clock: Callable[[], str],
    started_at: str,
    stages: list[str],
    mutations: list[str],
    extras: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    extra = dict(extras or {})
    return write_receipt(
        store,
        {
            "entry_point": entry_point,
            "sequence": sequence,
            "trigger": request.get("trigger") or "manual",
            "requested_at": request.get("requested_at") or started_at,
            "source_commit": request.get("source_commit") or "unknown",
            "provider": dict(request.get("provider") or {}),
            "actor": request.get("actor") or "unknown",
            "takeover_reason": request.get("takeover_reason") or "",
            "inputs": dict(request.get("inputs") or {}),
            "tool_versions": dict(request.get("tool_versions") or {}),
            "data_release_identity": extra.get("data_release_identity"),
            "site_artifact_identity": extra.get("site_artifact_identity"),
            "og_evidence": dict(extra.get("og_evidence") or {}),
            "r2_objects": dict(extra.get("r2_objects") or {}),
            "stages": stages,
            "mutations": mutations,
            "pages_deployment": dict(extra.get("pages_deployment") or {}),
            "smoke": dict(extra.get("smoke") or {}),
            "rollback_attempt": dict(extra.get("rollback_attempt") or {}),
            "result": result,
            "started_at": started_at,
            "finished_at": _now(clock),
        },
    )


def run_site_release(
    *,
    store: PublicationStore,
    runner: Runner,
    request: Mapping[str, Any],
    clock: Callable[[], str],
) -> dict[str, Any]:
    started_at = _now(clock)
    mode = str(request.get("mode") or "production")
    admit_protected_ref(request)
    if mode == "windows-emergency":
        prove_local_takeover(dict(request.get("hosted") or {}))
    sequence = allocate_sequence(store)
    reject_publish_behind(attempt_sequence=sequence, latest_success_sequence=latest_success_sequence(store, head=sequence))
    project = str(request.get("pages_project") or "themoviecosmos")
    branch = _pages_branch(mode)
    origin = str(request.get("production_origin") or PRODUCTION_ORIGIN)
    paths = work_paths()
    commit = str(request.get("source_commit") or "unknown")
    stages: list[str] = []
    mutations: list[str] = []
    extras: dict[str, Any] = {
        "data_release_identity": request.get("selected_data_release"),
        "pages_deployment": {"branch": branch, "mode": mode, "cwd": PAGES_BUNDLE},
    }

    planned = [
        Command("fetch-live-manifest", python_script("scripts/cron/pages_compose.py", "fetch-origin", "--url", f"{origin}/data/galaxy_assets_manifest.json", "--output", paths["live_manifest"])),
        Command("fetch-active-registry", python_script("scripts/cron/site_artifact_store.py", "fetch-registry", "--registry-out", paths["site_registry"])),
        Command("install-node", ("npm", "install", "--include=optional", "--no-audit", "--no-fund")),
        Command("build-shell", ("npm", "run", "build", "-w", "frontend"), env={"SITE_RELEASE_SHELL": "1"}),
        Command(
            "identify-shell",
            python_script("scripts/cron/site_artifact.py", "identity", "--dist-dir", "frontend/dist", "--functions-dir", "frontend/functions", "--git-commit", commit),
            stdout_path=paths["site_identity"],
        ),
        Command("pack-shell", python_script("scripts/cron/site_artifact.py", "pack", "--dist-dir", "frontend/dist", "--functions-dir", "frontend/functions", "--output", paths["site_tar"])),
        Command("unpack-shell", python_script("scripts/cron/site_artifact.py", "unpack", "--tar", paths["site_tar"], "--output-dir", paths["pages_bundle"])),
    ]

    failed: Command | None = None
    for command in planned:
        result = runner(command)
        stages.append(command.name)
        if command.mutates:
            mutations.append(command.name)
        if not result.ok:
            failed = command
            break
        extras.update(result.outputs)
        if command.name == "fetch-live-manifest" and mode in {"production", "windows-emergency"}:
            version = _json_field(paths["live_manifest"], "data_version")
            if version:
                extras["data_release_identity"] = version
        if command.name == "identify-shell":
            artifact_id = result.outputs.get("artifact_id") or _json_field(paths["site_identity"], "artifact_id")
            if artifact_id:
                extras["site_artifact_identity"] = artifact_id

    if failed is None:
        artifact_id = str(extras.get("site_artifact_identity") or "new-site")
        compose = Command(
            "compose",
            python_script(
                "scripts/cron/pages_compose.py",
                "compose",
                "--dist-dir",
                f"{PAGES_BUNDLE}/dist",
                "--manifest",
                paths["live_manifest"],
                "--artifact-id",
                artifact_id,
                "--skip-active-match",
            ),
        )
        deploy = Command(
            "pages-deploy",
            wrangler_pages_deploy(project_name=project, branch=branch),
            mutates=True,
            cwd=PAGES_BUNDLE,
        )
        for command in (compose, deploy):
            result = runner(command)
            stages.append(command.name)
            if command.mutates:
                mutations.append(command.name)
            if not result.ok:
                failed = command
                break
            extras.update(result.outputs)

    if failed is None and mode != "windows-preview":
        version = str(extras.get("data_release_identity") or "live")
        smoke = Command(
            "production-smoke",
            python_script("scripts/cron/production_smoke.py", "--origin", origin, "--expected-data-version", version),
        )
        smoke_result = runner(smoke)
        stages.append(smoke.name)
        if smoke_result.ok:
            extras["smoke"] = {"ok": True}
        else:
            failed = smoke
    if failed is None and mode not in {"windows-preview", "fixture"}:
        record = Command(
            "record-verified-artifact",
            python_script("scripts/cron/site_artifact.py", "record", "--registry", paths["site_registry"], "--identity", paths["site_identity"], "--verified-at", _now(clock)),
        )
        record_result = runner(record)
        stages.append(record.name)
        if not record_result.ok:
            failed = record
    if failed is None and mode not in {"windows-preview", "fixture"}:
        mark = Command(
            "mark-active",
            python_script("scripts/cron/site_artifact_store.py", "put-active", "--tar", paths["site_tar"], "--registry", paths["site_registry"]),
            mutates=True,
        )
        mark_result = runner(mark)
        stages.append(mark.name)
        mutations.append(mark.name)
        if mark_result.ok:
            extras.update(mark_result.outputs)
        else:
            failed = mark

    if failed is None:
        return _write(store, entry_point="site-release", sequence=sequence, request=request, result="success", clock=clock, started_at=started_at, stages=stages, mutations=mutations, extras=extras)

    rollback: dict[str, Any] = {"attempted": False}
    if mode not in {"windows-preview"} and failed.name in {"pages-deploy", "production-smoke", "record-verified-artifact", "mark-active"}:
        restore = Command(
            "restore-previous-artifact",
            python_script("scripts/cron/site_artifact_store.py", "fetch-active", "--output-dir", "pages-rollback", "--registry-out", paths["site_registry"]),
            rollback=True,
        )
        redeploy = Command(
            "redeploy-previous-artifact",
            wrangler_pages_deploy(project_name=project, branch=PRODUCTION_PAGES_BRANCH),
            mutates=True,
            rollback=True,
            cwd="pages-rollback",
        )
        restore_ok = runner(restore).ok
        recompose = Command(
            "recompose-previous-artifact",
            python_script("scripts/cron/pages_compose.py", "compose", "--dist-dir", "pages-rollback/dist", "--manifest", paths["live_manifest"], "--artifact-id", str(_json_field(paths["site_registry"], "active") or "active"), "--skip-active-match"),
            rollback=True,
        )
        recompose_ok = runner(recompose).ok if restore_ok else False
        redeploy_ok = runner(redeploy).ok if recompose_ok else False
        stages.extend([restore.name, recompose.name, redeploy.name])
        rollback = {"attempted": True, "ok": restore_ok and redeploy_ok}
        extras["rollback_attempt"] = rollback
    extras["smoke"] = {"ok": False}
    return _write(
        store,
        entry_point="site-release",
        sequence=sequence,
        request=request,
        result="rolled-back" if rollback.get("ok") else "failed",
        clock=clock,
        started_at=started_at,
        stages=stages,
        mutations=mutations,
        extras=extras,
    )


def run_daily_release(
    *,
    store: PublicationStore,
    runner: Runner,
    request: Mapping[str, Any],
    clock: Callable[[], str],
) -> dict[str, Any]:
    started_at = _now(clock)
    mode = str(request.get("mode") or "production")
    admit_protected_ref(request)
    if mode == "windows-emergency":
        prove_local_takeover(dict(request.get("hosted") or {}))
    sequence = allocate_sequence(store)
    reject_publish_behind(attempt_sequence=sequence, latest_success_sequence=latest_success_sequence(store, head=sequence))
    backlog = evaluate_schedule_backlog(request)
    if backlog["action"] == "exit":
        return _write(
            store,
            entry_point="daily-data-release",
            sequence=sequence,
            request=request,
            result="skipped-backlog",
            clock=clock,
            started_at=started_at,
            stages=["backlog-collapse"],
            mutations=[],
            extras={"data_release_identity": None},
        )

    project = str(request.get("pages_project") or "themoviecosmos")
    branch = _pages_branch(mode)
    origin = str(request.get("production_origin") or PRODUCTION_ORIGIN)
    paths = work_paths()
    seq_env = {"GALAXY_EXPORT_SEQ": str(sequence)}
    stages: list[str] = ["backlog-collapse"]
    mutations: list[str] = []
    extras: dict[str, Any] = {"pages_deployment": {"branch": branch, "mode": mode, "cwd": PAGES_BUNDLE}}

    planned = [
        Command("fetch-hold", python_script("scripts/cron/site_artifact_store.py", "fetch-hold", "--path", paths["hold"])),
        Command("publication-hold", python_script("scripts/cron/publication_hold.py", "check", "--path", paths["hold"])),
        Command("supabase-preflight", python_script("scripts/cron/check_supabase_health.py")),
        Command("light-refresh", python_script("scripts/cron/nightly_vote_refresh.py"), env=seq_env, mutates=True),
        Command("og-sync", python_script("scripts/cron/sync_og_index_kv.py", "--scope", "incremental"), mutates=True),
        Command("immutable-r2", python_script("scripts/cron/upload_galaxy_r2.py", "--mode", "nightly"), env=seq_env, mutates=True),
        Command("fetch-active", python_script("scripts/cron/site_artifact_store.py", "fetch-active", "--output-dir", paths["pages_bundle"], "--registry-out", paths["site_registry"])),
        Command("fetch-deployed-sidecar", python_script("scripts/cron/pages_compose.py", "fetch-origin", "--url", f"{origin}/data/site-artifact.json", "--output", paths["deployed_sidecar"])),
        Command("fetch-previous-manifest", python_script("scripts/cron/pages_compose.py", "fetch-origin", "--url", f"{origin}/data/galaxy_assets_manifest.json", "--output", paths["previous_manifest"])),
    ]

    failed: Command | None = None
    for command in planned:
        result = runner(command)
        stages.append(command.name)
        if command.mutates:
            mutations.append(command.name)
        if not result.ok:
            failed = command
            break
        extras.update(result.outputs)
        if "data_release_identity" in result.outputs:
            extras["data_release_identity"] = result.outputs["data_release_identity"]
        if command.name in {"immutable-r2", "compose-active-artifact"} and mode in {"production", "windows-emergency"}:
            version = _json_field("frontend/public/data/galaxy_assets_manifest.json", "data_version")
            if version:
                extras["data_release_identity"] = version

    if failed is None:
        active = str(_json_field(paths["site_registry"], "active") or "active")
        deployed = str(_json_field(paths["deployed_sidecar"], "artifact_id") or active)
        compose = Command(
            "compose-active-artifact",
            python_script(
                "scripts/cron/pages_compose.py",
                "compose",
                "--dist-dir",
                f"{PAGES_BUNDLE}/dist",
                "--manifest",
                "frontend/public/data/galaxy_assets_manifest.json",
                "--artifact-id",
                active,
                "--registry",
                paths["site_registry"],
                "--deployed-artifact-id",
                deployed,
            ),
        )
        deploy = Command(
            "pages-deploy",
            wrangler_pages_deploy(project_name=project, branch=branch),
            mutates=True,
            cwd=PAGES_BUNDLE,
        )
        for command in (compose, deploy):
            result = runner(command)
            stages.append(command.name)
            if command.mutates:
                mutations.append(command.name)
            if not result.ok:
                failed = command
                break
            extras.update(result.outputs)
            if command.name == "compose-active-artifact" and mode in {"production", "windows-emergency"}:
                version = _json_field("frontend/public/data/galaxy_assets_manifest.json", "data_version")
                if version:
                    extras["data_release_identity"] = version

    if failed is None and mode != "windows-preview":
        version = str(
            extras.get("data_release_identity")
            or f"{started_at[:10].replace('-', '.')}.daily.{sequence}"
        )
        extras["data_release_identity"] = version
        smoke = Command(
            "production-smoke",
            python_script("scripts/cron/production_smoke.py", "--origin", origin, "--expected-data-version", version),
        )
        smoke_result = runner(smoke)
        stages.append(smoke.name)
        if smoke_result.ok:
            extras["smoke"] = {"ok": True}
            extras.setdefault("og_evidence", {"scope": "incremental", "meta_g": "opaque"})
            return _write(store, entry_point="daily-data-release", sequence=sequence, request=request, result="success", clock=clock, started_at=started_at, stages=stages, mutations=mutations, extras=extras)
        failed = smoke

    if failed is None:
        extras.setdefault("og_evidence", {"scope": "incremental", "meta_g": "opaque"})
        extras.setdefault("data_release_identity", f"{started_at[:10].replace('-', '.')}.daily.{sequence}")
        extras.setdefault("smoke", {"ok": True})
        return _write(store, entry_point="daily-data-release", sequence=sequence, request=request, result="success", clock=clock, started_at=started_at, stages=stages, mutations=mutations, extras=extras)

    rollback: dict[str, Any] = {"attempted": False}
    if mode != "windows-preview" and failed.name in {"pages-deploy", "production-smoke"}:
        restore = Command(
            "recompose-last-known-good",
            python_script("scripts/cron/pages_compose.py", "compose", "--dist-dir", f"{PAGES_BUNDLE}/dist", "--manifest", paths["previous_manifest"], "--artifact-id", "active", "--skip-active-match"),
            rollback=True,
        )
        redeploy = Command(
            "redeploy-last-known-good",
            wrangler_pages_deploy(project_name=project, branch=PRODUCTION_PAGES_BRANCH),
            mutates=True,
            rollback=True,
            cwd=PAGES_BUNDLE,
        )
        restore_ok = runner(restore).ok
        redeploy_ok = runner(redeploy).ok if restore_ok else False
        stages.extend([restore.name, redeploy.name])
        rollback = {"attempted": True, "ok": restore_ok and redeploy_ok}
        extras["rollback_attempt"] = rollback
    extras["smoke"] = {"ok": False}
    extras.setdefault("data_release_identity", f"attempt.daily.{sequence}")
    return _write(
        store,
        entry_point="daily-data-release",
        sequence=sequence,
        request=request,
        result="rolled-back" if rollback.get("ok") else "failed",
        clock=clock,
        started_at=started_at,
        stages=stages,
        mutations=mutations,
        extras=extras,
    )


def run_monthly_release(
    *,
    store: PublicationStore,
    runner: Runner,
    request: Mapping[str, Any],
    clock: Callable[[], str],
) -> dict[str, Any]:
    started_at = _now(clock)
    mode = str(request.get("mode") or "production")
    if mode != "fixture" and not MONTHLY_PRODUCTION_ENABLED:
        raise PublicationError("Monthly Data Release remains suspended while GitLab is temporary primary")
    admit_protected_ref(request)
    digest = str(request.get("bundle_sha256") or "")
    record = request.get("bundle_record")
    if isinstance(record, Mapping):
        digest = require_recorded_hash(record)
    if len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
        raise PublicationError("canonical embedding bundle SHA-256 is missing")
    sequence = allocate_sequence(store)
    reject_publish_behind(attempt_sequence=sequence, latest_success_sequence=latest_success_sequence(store, head=sequence))
    project = str(request.get("pages_project") or "themoviecosmos")
    branch = _pages_branch(mode)
    origin = str(request.get("production_origin") or PRODUCTION_ORIGIN)
    paths = work_paths()
    seq_env = {"GALAXY_EXPORT_SEQ": str(sequence), "GALAXY_EXPORT_VERSION_BRANCH": "monthly"}
    identity = f"{started_at[:7].replace('-', '.')}.monthly.{sequence}"
    payload = dict(request)
    payload["inputs"] = {
        **dict(request.get("inputs") or {}),
        "production_monthly_restored": False,
        "hosted_duration_viable": False,
        "monthly_suspension": True,
    }
    stages: list[str] = []
    mutations: list[str] = []
    extras: dict[str, Any] = {
        "pages_deployment": {"branch": branch, "mode": mode, "cwd": PAGES_BUNDLE},
        "data_release_identity": identity,
    }

    planned = [
        Command(
            "validate-embedding-bundle",
            python_script(
                "scripts/tools/pack_monthly_embedding_bundle.py",
                "--validate-only",
                "--expected-sha256",
                digest,
            ),
        ),
        Command("fetch-hold", python_script("scripts/cron/site_artifact_store.py", "fetch-hold", "--path", paths["hold"])),
        Command("publication-hold", python_script("scripts/cron/publication_hold.py", "check", "--path", paths["hold"])),
        Command("supabase-preflight", python_script("scripts/cron/check_supabase_health.py")),
        Command("galaxy-refit", python_script("scripts/cron/monthly_refit.py", "--dry-run"), env=seq_env),
        Command("og-sync", python_script("scripts/cron/sync_og_index_kv.py", "--scope", "incremental"), mutates=True),
        Command(
            "immutable-r2",
            python_script(
                "scripts/cron/upload_galaxy_r2.py",
                "--mode",
                "monthly",
                "--profile",
                "data/output/monthly_profiles",
                "--actor",
                "chronicle:monthly",
            ),
            env=seq_env,
            mutates=True,
        ),
        Command("fetch-active", python_script("scripts/cron/site_artifact_store.py", "fetch-active", "--output-dir", paths["pages_bundle"], "--registry-out", paths["site_registry"])),
        Command("fetch-deployed-sidecar", python_script("scripts/cron/pages_compose.py", "fetch-origin", "--url", f"{origin}/data/site-artifact.json", "--output", paths["deployed_sidecar"])),
        Command("fetch-previous-manifest", python_script("scripts/cron/pages_compose.py", "fetch-origin", "--url", f"{origin}/data/galaxy_assets_manifest.json", "--output", paths["previous_manifest"])),
    ]

    failed: Command | None = None
    for command in planned:
        result = runner(command)
        stages.append(command.name)
        if command.mutates:
            mutations.append(command.name)
        if not result.ok:
            failed = command
            break
        extras.update(result.outputs)

    if failed is None:
        active = str(_json_field(paths["site_registry"], "active") or "active")
        deployed = str(_json_field(paths["deployed_sidecar"], "artifact_id") or active)
        compose = Command(
            "compose-active-artifact",
            python_script(
                "scripts/cron/pages_compose.py",
                "compose",
                "--dist-dir",
                f"{PAGES_BUNDLE}/dist",
                "--manifest",
                "frontend/public/data/galaxy_assets_manifest.json",
                "--artifact-id",
                active,
                "--registry",
                paths["site_registry"],
                "--deployed-artifact-id",
                deployed,
            ),
        )
        deploy = Command(
            "pages-deploy",
            wrangler_pages_deploy(project_name=project, branch=branch),
            mutates=True,
            cwd=PAGES_BUNDLE,
        )
        for command in (compose, deploy):
            result = runner(command)
            stages.append(command.name)
            if command.mutates:
                mutations.append(command.name)
            if not result.ok:
                failed = command
                break
            extras.update(result.outputs)

    if failed is None:
        extras["data_release_identity"] = identity
        smoke = Command(
            "production-smoke",
            python_script("scripts/cron/production_smoke.py", "--origin", origin, "--expected-data-version", identity),
        )
        smoke_result = runner(smoke)
        stages.append(smoke.name)
        if smoke_result.ok:
            extras["smoke"] = {"ok": True}
            extras.setdefault("og_evidence", {"scope": "incremental", "meta_g": "opaque"})
            return _write(
                store,
                entry_point="monthly-data-release",
                sequence=sequence,
                request=payload,
                result="success",
                clock=clock,
                started_at=started_at,
                stages=stages,
                mutations=mutations,
                extras=extras,
            )
        failed = smoke

    extras["smoke"] = {"ok": False}
    extras.setdefault("data_release_identity", identity)
    return _write(
        store,
        entry_point="monthly-data-release",
        sequence=sequence,
        request=payload,
        result="failed",
        clock=clock,
        started_at=started_at,
        stages=stages,
        mutations=mutations,
        extras=extras,
    )
