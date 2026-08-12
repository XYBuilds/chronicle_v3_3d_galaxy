#!/usr/bin/env python3
"""Audited Production Recovery control plane.

Manual-only recovery for release hold/resume, candidate continuation, Data
rollback, Site rollback, profile rollback, OG bootstrap/full recovery, and
dangerous dimension/profile overrides. Every action records target, from/to
identities, reason, actor, UTC time, and smoke result. Dry-run is the default
and does not mutate production.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Sequence

try:
    from cron.release_state import ReleaseStateError, continuation_point, load_candidate, read_store
except ModuleNotFoundError:  # pragma: no cover - direct workflow execution
    from release_state import ReleaseStateError, continuation_point, load_candidate, read_store

ACTIONS = (
    "hold_releases",
    "resume_releases",
    "continue_candidate",
    "data_rollback",
    "site_rollback",
    "profile_rollback",
    "og_bootstrap",
    "og_full_recovery",
    "dimension_override",
    "profile_override",
)


class RecoveryError(ValueError):
    """A recovery request violated an audit or safety invariant."""


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise RecoveryError(message)


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
    }


def _site_rollback_plan(*, current_data_release: str | None, previous_site_artifact: str | None) -> dict[str, Any]:
    _assert(isinstance(current_data_release, str) and bool(current_data_release.strip()), "current Data Release is required")
    _assert(isinstance(previous_site_artifact, str) and bool(previous_site_artifact.strip()), "previous site artifact is required")
    return {
        "site_artifact": previous_site_artifact.strip(),
        "manifest_release": current_data_release.strip(),
        "rebuild_og_projection": False,
        "rollback_supabase": False,
    }


def _continue_plan(*, target: str, candidate_store: Mapping[str, Mapping[str, Any]] | None) -> dict[str, Any]:
    _assert(isinstance(candidate_store, Mapping), "candidate store is required")
    try:
        candidate = load_candidate(candidate_store, target)
        stage = continuation_point(candidate)
    except ReleaseStateError as exc:
        raise RecoveryError(str(exc)) from exc
    _assert(stage is not None, f"candidate {target!r} has no remaining stage")
    return {"continuation_stage": stage, "recompute_from_start": False}


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
    candidate_store: MutableMapping[str, dict[str, Any]] | Mapping[str, Mapping[str, Any]] | None = None,
    run_id: str = "",
    git_commit: str = "",
    data_version: str = "",
    profile_id: str = "",
) -> dict[str, Any]:
    """Build an audited recovery plan. Dry-run records evidence and performs no mutation."""
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
    )
    if action in {"dimension_override", "profile_override"}:
        _assert(confirm_dangerous, "dangerous override requires confirm")
    if action == "hold_releases":
        plan: dict[str, Any] = {"hold": True, "cadence": "daily-monthly"}
    elif action == "resume_releases":
        plan = {"hold": False, "cadence": "daily-monthly"}
    elif action == "continue_candidate":
        plan = _continue_plan(target=record["target"], candidate_store=candidate_store)
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
        plan = {"creates_new_data_release": True, "flip_active_pointer_in_place": False}
    elif action in {"og_bootstrap", "og_full_recovery"}:
        plan = {
            "order": ("chronicle_producer", "og_worker"),
            "retain_diagnostic_kv": True,
            "mode": "bootstrap" if action == "og_bootstrap" else "full",
        }
    else:
        plan = {"dangerous": True, "normal_workflow_surface": False}
    if not dry_run:
        raise RecoveryError("live recovery mutation is not enabled in this primitive; rerun after authorized cutover")
    record["plan"] = plan
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
    parser.add_argument("--candidate-store", type=Path, default=None)
    parser.add_argument("--run-id", default="")
    parser.add_argument("--git-commit", default="")
    parser.add_argument("--data-version", default="")
    parser.add_argument("--profile-id", default="")
    args = parser.parse_args(argv)
    dry_run = not args.no_dry_run
    try:
        store = read_store(args.candidate_store) if args.candidate_store is not None else None
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
            candidate_store=store,
            run_id=args.run_id,
            git_commit=args.git_commit,
            data_version=args.data_version,
            profile_id=args.profile_id,
        )
    except (RecoveryError, ReleaseStateError) as exc:
        print(f"[recovery] error: {exc}", flush=True)
        return 1
    print(json.dumps(record, indent=2, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
