#!/usr/bin/env python3
"""Audited Production Recovery planner.

Provider-neutral local dry-run planner for hold/resume, Data/Site/profile
rollback, OG bootstrap/full recovery, and dangerous overrides. Hold/resume is
the only direct recovery-control mutation. Other actions remain plans that an
operator applies through repository-owned commands. Dry-run is the default.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.publication_hold import HoldError, apply_hold  # noqa: E402
from publication.admission import prove_local_takeover  # noqa: E402
from publication.errors import PublicationError  # noqa: E402
from publication.store import PublicationStore  # noqa: E402

ACTIONS = (
    "hold_releases",
    "resume_releases",
    "data_rollback",
    "site_rollback",
    "profile_rollback",
    "og_bootstrap",
    "og_full_recovery",
    "dimension_override",
    "profile_override",
)
_SECRETISH = re.compile(r"(token|secret|password|key|session|authorization|credential)", re.I)
_EVIDENCE_REQUIRED = (
    "plan",
    "before_inventory",
    "after_inventory",
    "command",
    "source_commit",
    "actor",
    "reason",
    "identities",
    "attempted_mutations",
    "receipt_identities",
    "smoke",
    "disposition",
    "started_at",
    "finished_at",
)


class RecoveryError(ValueError):
    """A recovery request violated an audit or safety invariant."""


class DirectoryPublicationStore:
    """Local directory store for recovery evidence bundles."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def get(self, key: str) -> bytes | None:
        path = self.root.joinpath(*Path(key).parts)
        if not path.is_file():
            return None
        return path.read_bytes()

    def put(self, key: str, body: bytes) -> None:
        path = self.root.joinpath(*Path(key).parts)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise RecoveryError(message)


def compare_starting_identity(*, planned: str, observed: str) -> None:
    _assert(
        isinstance(planned, str) and isinstance(observed, str) and planned == observed,
        "observed starting identity does not match the reviewed plan",
    )


def _audit_fields(
    action: str,
    *,
    target: str,
    from_identity: str,
    to_identity: str,
    reason: str,
    actor: str,
    recorded_at: str,
    smoke_result: str,
    dry_run: bool,
    run_id: str = "",
    git_commit: str = "",
    data_version: str = "",
    profile_id: str = "",
    source_commit: str = "",
) -> dict[str, Any]:
    _assert(action in ACTIONS, f"unknown recovery action {action!r}")
    for label, value in (
        ("target", target),
        ("from_identity", from_identity),
        ("to_identity", to_identity),
        ("reason", reason),
        ("actor", actor),
        ("recorded_at", recorded_at),
        ("smoke_result", smoke_result),
    ):
        _assert(isinstance(value, str) and bool(value.strip()), f"{label} is required")
    _assert(isinstance(dry_run, bool), "dry_run must be a boolean")
    _assert(recorded_at.endswith("Z"), "recorded_at must be UTC")
    return {
        "action": action,
        "target": target.strip(),
        "from_identity": from_identity.strip(),
        "to_identity": to_identity.strip(),
        "reason": reason.strip(),
        "actor": actor.strip(),
        "recorded_at": recorded_at,
        "smoke_result": smoke_result.strip(),
        "dry_run": dry_run,
        "run_id": run_id.strip(),
        "git_commit": git_commit.strip(),
        "data_version": data_version.strip(),
        "profile_id": profile_id.strip(),
        "source_commit": (source_commit or git_commit).strip(),
        "mutations": [],
    }


def _data_rollback_plan(
    *,
    target: str,
    retained_releases: Sequence[str] | None,
    active_site_artifact: str | None,
    og_projection_differs: bool,
) -> dict[str, Any]:
    _assert(isinstance(retained_releases, Sequence) and not isinstance(retained_releases, (str, bytes)), "retained releases are required")
    _assert(target in set(retained_releases), f"target {target!r} is not a retained successful Data Release")
    _assert(isinstance(active_site_artifact, str) and bool(active_site_artifact.strip()), "active site artifact is required")
    return {
        "manifest_release": target,
        "site_artifact": active_site_artifact.strip(),
        "rebuild_og_projection": bool(og_projection_differs),
        "rollback_supabase": False,
        "creates_new_publication_identity": True,
        "direct_mutation": False,
        "expected_mutations": ["compose-retained-release", "pages-deploy"],
        "rollback_boundary": "completed diagnostic mutations remain; consumers return to the retained Data Release",
        "required_smoke": "production-smoke",
    }


def _site_rollback_plan(*, current_data_release: str | None, previous_site_artifact: str | None) -> dict[str, Any]:
    _assert(isinstance(current_data_release, str) and bool(current_data_release.strip()), "current Data Release is required")
    _assert(isinstance(previous_site_artifact, str) and bool(previous_site_artifact.strip()), "previous site artifact is required")
    return {
        "site_artifact": previous_site_artifact.strip(),
        "manifest_release": current_data_release.strip(),
        "rebuild_og_projection": False,
        "rollback_supabase": False,
        "creates_new_publication_identity": True,
        "direct_mutation": False,
        "expected_mutations": ["compose-previous-artifact", "pages-deploy"],
        "rollback_boundary": "completed diagnostic mutations remain; consumers return to the previous Site Artifact",
        "required_smoke": "production-smoke",
    }


def _reject_secrets(value: Any, path: str = "evidence") -> None:
    if isinstance(value, Mapping):
        for key, inner in value.items():
            name = str(key)
            if _SECRETISH.search(name) or name.upper() in {"BW_SESSION", "BITWARDEN_ACCESS_TOKEN"}:
                raise RecoveryError("recovery evidence cannot contain secret values")
            _reject_secrets(inner, f"{path}.{name}")
        return
    if isinstance(value, (list, tuple)):
        for index, inner in enumerate(value):
            _reject_secrets(inner, f"{path}[{index}]")


def write_recovery_evidence(store: PublicationStore, payload: Mapping[str, Any]) -> dict[str, Any]:
    missing = [name for name in _EVIDENCE_REQUIRED if name not in payload]
    _assert(not missing, f"recovery evidence is missing {missing}")
    _reject_secrets(payload)
    bundle = {
        "schema": "chronicle-recovery-evidence-v1",
        "ok": True,
        **{name: payload[name] for name in _EVIDENCE_REQUIRED},
    }
    _reject_secrets(bundle)
    key = "ops/recovery/evidence/{started}-{action}.json".format(
        started=str(bundle["started_at"]).replace(":", ""),
        action=str(dict(bundle["plan"]).get("action") or "plan"),
    )
    try:
        store.put(key, json.dumps(bundle, sort_keys=True).encode("utf-8"))
    except Exception as exc:
        raise RecoveryError("recovery evidence write failed; completion is rejected") from exc
    return bundle


def execute_recovery(
    action: str,
    *,
    target: str,
    from_identity: str,
    to_identity: str,
    reason: str,
    actor: str,
    recorded_at: str,
    smoke_result: str,
    dry_run: bool = True,
    confirm_dangerous: bool = False,
    retained_releases: Sequence[str] | None = None,
    active_site_artifact: str | None = None,
    og_projection_differs: bool = False,
    current_data_release: str | None = None,
    previous_site_artifact: str | None = None,
    run_id: str = "",
    git_commit: str = "",
    data_version: str = "",
    profile_id: str = "",
    source_commit: str = "",
    observed_from_identity: str | None = None,
    hosted: Mapping[str, Any] | None = None,
    hold_path: Path | None = None,
    evidence_store: PublicationStore | None = None,
) -> dict[str, Any]:
    """Build an audited recovery plan. Hold/resume may mutate; other live actions remain plans."""
    record = _audit_fields(
        action,
        target=target,
        from_identity=from_identity,
        to_identity=to_identity,
        reason=reason,
        actor=actor,
        recorded_at=recorded_at,
        smoke_result=smoke_result,
        dry_run=dry_run,
        run_id=run_id,
        git_commit=git_commit,
        data_version=data_version,
        profile_id=profile_id,
        source_commit=source_commit,
    )
    if observed_from_identity is not None:
        compare_starting_identity(planned=record["from_identity"], observed=str(observed_from_identity))
    if action in {"dimension_override", "profile_override"}:
        _assert(confirm_dangerous, "dangerous override requires confirm")
    if action == "hold_releases":
        plan: dict[str, Any] = {
            "hold": True,
            "cadence": "daily-monthly",
            "direct_mutation": "publication-hold",
            "expected_mutations": ["publication-hold"],
            "rollback_boundary": "resume_releases",
            "required_smoke": "none",
        }
    elif action == "resume_releases":
        plan = {
            "hold": False,
            "cadence": "daily-monthly",
            "direct_mutation": "publication-hold",
            "expected_mutations": ["publication-hold"],
            "rollback_boundary": "hold_releases",
            "required_smoke": "none",
        }
    elif action == "data_rollback":
        plan = _data_rollback_plan(
            target=record["target"],
            retained_releases=retained_releases,
            active_site_artifact=active_site_artifact,
            og_projection_differs=og_projection_differs,
        )
    elif action == "site_rollback":
        plan = _site_rollback_plan(
            current_data_release=current_data_release,
            previous_site_artifact=previous_site_artifact,
        )
    elif action == "profile_rollback":
        plan = {
            "creates_new_data_release": True,
            "creates_new_publication_identity": True,
            "flip_active_pointer_in_place": False,
            "direct_mutation": False,
            "expected_mutations": ["new-data-release"],
            "rollback_boundary": "new Data Release selects the retained profile",
            "required_smoke": "production-smoke",
        }
    elif action in {"og_bootstrap", "og_full_recovery"}:
        plan = {
            "order": ("chronicle_producer", "og_worker"),
            "retain_diagnostic_kv": True,
            "mode": "bootstrap" if action == "og_bootstrap" else "full",
            "direct_mutation": False,
            "expected_mutations": ["og-producer-repair"],
            "rollback_boundary": "Worker runtime rollback stays in the Worker repository",
            "required_smoke": "og-readback",
        }
    else:
        plan = {
            "dangerous": True,
            "normal_workflow_surface": False,
            "direct_mutation": False,
            "expected_mutations": ["audited-override"],
            "rollback_boundary": "repository-owned command",
            "required_smoke": "operator-specified",
        }
    record["plan"] = plan
    if dry_run:
        return record
    if action not in {"hold_releases", "resume_releases"}:
        raise RecoveryError("live recovery mutation is not enabled in this primitive; apply the reviewed plan through repository-owned commands")
    try:
        prove_local_takeover(dict(hosted or {}))
    except PublicationError as exc:
        raise RecoveryError(str(exc)) from exc
    if hold_path is None:
        raise RecoveryError("publication hold path is required for hold/resume mutation")
    try:
        apply_hold(
            Path(hold_path),
            held=action == "hold_releases",
            reason=record["reason"],
            actor=record["actor"],
            recorded_at=record["recorded_at"],
        )
    except HoldError as exc:
        raise RecoveryError(str(exc)) from exc
    record["dry_run"] = False
    record["mutations"] = ["publication-hold"]
    if evidence_store is None:
        raise RecoveryError("recovery evidence write failed; completion is rejected")
    write_recovery_evidence(
        evidence_store,
        {
            "plan": record,
            "before_inventory": {"from_identity": record["from_identity"]},
            "after_inventory": {"to_identity": record["to_identity"]},
            "command": ["python", "scripts/cron/production_recovery.py", "--action", action],
            "source_commit": record["source_commit"],
            "actor": record["actor"],
            "reason": record["reason"],
            "identities": {"from": record["from_identity"], "to": record["to_identity"]},
            "attempted_mutations": record["mutations"],
            "receipt_identities": [],
            "smoke": {"ok": record["smoke_result"] != "failed", "result": record["smoke_result"]},
            "disposition": "held" if action == "hold_releases" else "resumed",
            "started_at": record["recorded_at"],
            "finished_at": record["recorded_at"],
        },
    )
    return record


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--action", required=True, choices=ACTIONS)
    parser.add_argument("--target", required=True)
    parser.add_argument("--from-identity", required=True)
    parser.add_argument("--to-identity", required=True)
    parser.add_argument("--reason", required=True)
    parser.add_argument("--actor", required=True)
    parser.add_argument("--recorded-at", required=True)
    parser.add_argument("--smoke-result", default="pending")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--no-dry-run", action="store_true")
    parser.add_argument("--confirm-dangerous", action="store_true")
    parser.add_argument("--retained-releases", default="")
    parser.add_argument("--active-site-artifact", default="")
    parser.add_argument("--current-data-release", default="")
    parser.add_argument("--previous-site-artifact", default="")
    parser.add_argument("--og-projection-differs", action="store_true")
    parser.add_argument("--run-id", default="")
    parser.add_argument("--git-commit", default="")
    parser.add_argument("--data-version", default="")
    parser.add_argument("--profile-id", default="")
    parser.add_argument("--source-commit", default="")
    parser.add_argument("--observed-from-identity", default="")
    parser.add_argument("--hold-path", type=Path, default=None)
    parser.add_argument("--evidence-dir", type=Path, default=None)
    parser.add_argument("--hosted-accessible", action="store_true")
    parser.add_argument("--hosted-triggers-paused", action="store_true")
    parser.add_argument("--hosted-running-or-queued", action="store_true")
    parser.add_argument("--hosted-schedule-inactive", action="store_true")
    parser.add_argument("--hosted-authority-ambiguous", action="store_true")
    args = parser.parse_args(argv)
    dry_run = not args.no_dry_run
    hosted = {
        "accessible": args.hosted_accessible,
        "triggers_paused": args.hosted_triggers_paused,
        "running_or_queued": args.hosted_running_or_queued,
        "schedule_inactive": args.hosted_schedule_inactive,
        "authority_ambiguous": args.hosted_authority_ambiguous,
    }
    evidence_store = DirectoryPublicationStore(args.evidence_dir) if args.evidence_dir is not None else None
    try:
        record = execute_recovery(
            args.action,
            target=args.target,
            from_identity=args.from_identity,
            to_identity=args.to_identity,
            reason=args.reason,
            actor=args.actor,
            recorded_at=args.recorded_at,
            smoke_result=args.smoke_result,
            dry_run=dry_run,
            confirm_dangerous=args.confirm_dangerous,
            retained_releases=tuple(item for item in args.retained_releases.split(",") if item.strip()) or None,
            active_site_artifact=args.active_site_artifact or None,
            og_projection_differs=args.og_projection_differs,
            current_data_release=args.current_data_release or None,
            previous_site_artifact=args.previous_site_artifact or None,
            run_id=args.run_id,
            git_commit=args.git_commit,
            data_version=args.data_version,
            profile_id=args.profile_id,
            source_commit=args.source_commit,
            observed_from_identity=args.observed_from_identity or None,
            hosted=hosted,
            hold_path=args.hold_path,
            evidence_store=evidence_store,
        )
    except RecoveryError as exc:
        print(f"[recovery] error: {exc}", flush=True)
        return 1
    print(json.dumps(record, indent=2, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
