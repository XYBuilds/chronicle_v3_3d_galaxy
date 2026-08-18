"""Maintainer CLI for Chronicle Site, Daily, and suspended Monthly publication entry points."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import gettempdir
from typing import Mapping, Sequence

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from publication.entrypoints import Command, CommandResult, run_daily_release, run_monthly_release, run_site_release
from publication.errors import PublicationError
from publication.evidence import assemble_p1_evidence, assemble_p2_evidence
from publication.gitlab_ci import validate_p2_gitlab_ci
from publication.inventory import evaluate_inventory
from publication.sequence import bootstrap_sequence
from publication.store import MemoryPublicationStore


def _load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def _clock() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _subprocess_runner(command: Command) -> CommandResult:
    env = {**os.environ, **{key: str(value) for key, value in command.env.items()}}
    Path(gettempdir()).joinpath("chronicle-publication").mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(
        list(command.argv),
        check=False,
        env=env,
        cwd=command.cwd,
        capture_output=command.stdout_path is not None,
    )
    if command.stdout_path and completed.stdout:
        Path(command.stdout_path).write_bytes(completed.stdout)
    return CommandResult(ok=completed.returncode == 0)


def _request_from_args(args: argparse.Namespace) -> dict[str, object]:
    return {
        "mode": args.mode,
        "ref": args.ref,
        "protected": bool(args.protected) or os.environ.get("CI_COMMIT_REF_PROTECTED") == "true",
        "pipeline_source": args.pipeline_source,
        "trigger": args.trigger,
        "source_commit": args.source_commit,
        "actor": args.actor,
        "requested_at": _clock(),
        "selected_data_release": args.selected_data_release,
        "pages_project": args.pages_project,
        "production_origin": args.production_origin,
        "takeover_reason": args.takeover_reason,
        "hosted": {
            "accessible": args.hosted_accessible,
            "triggers_paused": args.hosted_triggers_paused,
            "running_or_queued": args.hosted_running_or_queued,
            "schedule_inactive": args.hosted_schedule_inactive,
            "authority_ambiguous": args.hosted_authority_ambiguous,
        },
        "provider": {
            "pipeline_id": args.pipeline_id,
            "job_id": args.job_id,
        },
        "covered_by_sequence": args.covered_by_sequence,
        "bundle_sha256": getattr(args, "bundle_sha256", ""),
    }


def _store_for(args: argparse.Namespace):
    if args.mode in {"fixture", "windows-preview"}:
        store = MemoryPublicationStore()
        bootstrap_sequence(store, verified_identities=("0.0.0.daily.1",))
        return store
    from publication.r2 import R2PublicationStore

    return R2PublicationStore.from_env()


def _runner_for(args: argparse.Namespace):
    if args.mode == "fixture":
        from publication.entrypoints import RecordingRunner

        return RecordingRunner()
    return _subprocess_runner


def _run_entry(kind: str, args: argparse.Namespace) -> int:
    store = _store_for(args)
    request = _request_from_args(args)
    runner = _runner_for(args)
    if kind == "site":
        receipt = run_site_release(store=store, runner=runner, request=request, clock=_clock)
    elif kind == "monthly":
        receipt = run_monthly_release(store=store, runner=runner, request=request, clock=_clock)
    else:
        receipt = run_daily_release(store=store, runner=runner, request=request, clock=_clock)
    print(json.dumps(receipt, indent=2, sort_keys=True), flush=True)
    return 0 if receipt.get("result") in {"success", "skipped-backlog"} else 1


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    def add_shared(target: argparse.ArgumentParser) -> None:
        target.add_argument("--mode", default="production", choices=("production", "fixture", "windows-preview", "windows-emergency"))
        target.add_argument("--ref", default="main")
        target.add_argument("--protected", action="store_true")
        target.add_argument("--pipeline-source", default="web", dest="pipeline_source")
        target.add_argument("--trigger", default="manual")
        target.add_argument("--source-commit", default="")
        target.add_argument("--actor", default="")
        target.add_argument("--selected-data-release", default="")
        target.add_argument("--pages-project", default="")
        target.add_argument("--production-origin", default="https://themoviecosmos.com")
        target.add_argument("--takeover-reason", default="")
        target.add_argument("--pipeline-id", default="")
        target.add_argument("--job-id", default="")
        target.add_argument("--covered-by-sequence", type=int, default=None)
        target.add_argument("--hosted-accessible", action="store_true")
        target.add_argument("--hosted-triggers-paused", action="store_true")
        target.add_argument("--hosted-running-or-queued", action="store_true")
        target.add_argument("--hosted-schedule-inactive", action="store_true")
        target.add_argument("--hosted-authority-ambiguous", action="store_true")
        target.add_argument("--memory-store", action="store_true")

    site = sub.add_parser("site-release")
    add_shared(site)
    daily = sub.add_parser("daily-release")
    add_shared(daily)
    monthly = sub.add_parser("monthly-release")
    add_shared(monthly)
    monthly.add_argument("--bundle-sha256", default="", dest="bundle_sha256")

    bootstrap = sub.add_parser("bootstrap-sequence")
    bootstrap.add_argument("--identities", nargs="+", required=True)

    inventory = sub.add_parser("inventory")
    inventory.add_argument("--observed", type=Path, required=True)

    validate_ci = sub.add_parser("validate-ci")
    validate_ci.add_argument("--ci", type=Path, default=Path(".gitlab-ci.yml"))

    evidence = sub.add_parser("evidence")
    evidence.add_argument("--gates", type=Path, required=True)
    evidence.add_argument("--risk", type=Path, required=True)
    evidence.add_argument("--approve-merge", action="store_true")
    evidence.add_argument("--approve-production", action="store_true")

    p2_evidence = sub.add_parser("p2-evidence")
    p2_evidence.add_argument("--gates", type=Path, required=True)
    p2_evidence.add_argument("--risk", type=Path, required=True)
    p2_evidence.add_argument("--approve-merge", action="store_true")

    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        if args.command == "site-release":
            return _run_entry("site", args)
        if args.command == "daily-release":
            return _run_entry("daily", args)
        if args.command == "monthly-release":
            return _run_entry("monthly", args)
        if args.command == "bootstrap-sequence":
            from publication.r2 import R2PublicationStore

            store = R2PublicationStore.from_env()
            payload = bootstrap_sequence(store, verified_identities=args.identities)
            print(json.dumps(payload, indent=2, sort_keys=True), flush=True)
            return 0
        if args.command == "inventory":
            observed = _load_json(args.observed)
            if not isinstance(observed, Mapping):
                raise PublicationError("inventory observation must be a JSON object")
            print(json.dumps(evaluate_inventory(observed), indent=2, sort_keys=True), flush=True)
            return 0
        if args.command == "validate-ci":
            accepted = validate_p2_gitlab_ci(args.ci.read_text(encoding="utf-8"))
            print(json.dumps(accepted, indent=2, sort_keys=True), flush=True)
            return 0
        if args.command == "evidence":
            gates = _load_json(args.gates)
            risk = _load_json(args.risk)
            if not isinstance(gates, Mapping) or not isinstance(risk, Mapping):
                raise PublicationError("gates and risk declaration must be JSON objects")
            bundle = assemble_p1_evidence(
                gates=gates,
                risk_declaration=risk,
                merge_approved=args.approve_merge,
                production_enablement_approved=args.approve_production,
            )
            print(json.dumps(bundle, indent=2, sort_keys=True), flush=True)
            return 0
        if args.command == "p2-evidence":
            gates = _load_json(args.gates)
            risk = _load_json(args.risk)
            if not isinstance(gates, Mapping) or not isinstance(risk, Mapping):
                raise PublicationError("gates and risk declaration must be JSON objects")
            bundle = assemble_p2_evidence(
                gates=gates,
                risk_declaration=risk,
                merge_approved=args.approve_merge,
            )
            print(json.dumps(bundle, indent=2, sort_keys=True), flush=True)
            return 0
    except PublicationError as exc:
        print(f"[publication] error: {exc}", flush=True)
        return 1
    parser.error(f"unknown command {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
