"""Maintainer CLI for P0 common protection and GitLab admission."""
from __future__ import annotations

import argparse
import getpass
import json
import sys
from pathlib import Path
from typing import Sequence

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from recovery.evidence import EvidenceError, assemble_evidence_bundle
from recovery.gitlab_admission import AdmissionError, local_render_issue_export, validate_admission_plan
from recovery.policy import EXCLUSION_POLICY_ID, RESTIC_PIN, SOURCE_ROOTS
from recovery.secrets import SecretsError, credential_inventory, synthetic_export_import
from recovery.snapshot import restic_argv


def _load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def _prepare() -> int:
    payload = {
        "exclusion_policy_id": EXCLUSION_POLICY_ID,
        "restic_version": RESTIC_PIN.version,
        "snapshot_tag": RESTIC_PIN.snapshot_tag,
        "restic_assets": {
            platform: {"filename": asset.filename, "sha256": asset.sha256}
            for platform, asset in RESTIC_PIN.assets.items()
        },
        "source_labels": [root.label for root in SOURCE_ROOTS],
        "credential_names": [item["name"] for item in credential_inventory()],
        "next": [
            "Record the Issue R0-R3 tier and protected surfaces by hand.",
            "Complete the synthetic Bitwarden drill, then the MacBook snapshot, then live vault completeness by names.",
            "Run the disposable GitLab admission harness only after snapshot acceptance.",
        ],
    }
    print(json.dumps(payload, indent=2, sort_keys=True), flush=True)
    return 0


def _synthetic_vault(records_path: Path) -> int:
    records = _load_json(records_path)
    if not isinstance(records, list):
        print("[p0] error: synthetic records must be a JSON array", flush=True)
        return 1
    imported = synthetic_export_import(records, password=lambda: getpass.getpass("synthetic export password: "))
    print(json.dumps({"equal": True, "count": len(imported)}, indent=2, sort_keys=True), flush=True)
    return 0


def _print_restic_argv(action: str, repository: str, paths: Sequence[str]) -> int:
    print(" ".join(restic_argv(action, repository=repository, paths=paths)), flush=True)
    return 0


def _admit_plan(path: Path) -> int:
    plan = _load_json(path)
    if not isinstance(plan, dict):
        print("[p0] error: admission plan must be a JSON object", flush=True)
        return 1
    accepted = validate_admission_plan(plan)
    print(json.dumps(accepted, indent=2, sort_keys=True), flush=True)
    return 0


def _render_issue(path: Path) -> int:
    issue = _load_json(path)
    if not isinstance(issue, dict):
        print("[p0] error: issue export must be a JSON object", flush=True)
        return 1
    print(local_render_issue_export(issue), flush=True)
    return 0


def _evidence(gates_path: Path, risk_path: Path, approve_gitlab: bool) -> int:
    gates = _load_json(gates_path)
    risk = _load_json(risk_path)
    if not isinstance(gates, dict) or not isinstance(risk, dict):
        print("[p0] error: gates and risk declaration must be JSON objects", flush=True)
        return 1
    bundle = assemble_evidence_bundle(
        gates=gates,
        risk_declaration=risk,
        gitlab_human_approval=approve_gitlab,
    )
    print(json.dumps(bundle, indent=2, sort_keys=True), flush=True)
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("prepare", help="print the fixed policy, restic pin, and name-only inventory")
    vault = sub.add_parser("synthetic-vault", help="password-protect and re-import synthetic records")
    vault.add_argument("--records", type=Path, required=True)
    restic = sub.add_parser("restic-argv", help="print a restic command with no password arguments")
    restic.add_argument("action", choices=("backup", "check"))
    restic.add_argument("--repository", required=True)
    restic.add_argument("--path", action="append", default=[])
    admit = sub.add_parser("admit-plan", help="fail-closed check for a disposable GitLab plan")
    admit.add_argument("--plan", type=Path, required=True)
    render = sub.add_parser("render-issue", help="render a portable Issue export locally")
    render.add_argument("--issue", type=Path, required=True)
    evidence = sub.add_parser("evidence", help="assemble the sanitized evidence bundle")
    evidence.add_argument("--gates", type=Path, required=True)
    evidence.add_argument("--risk", type=Path, required=True)
    evidence.add_argument("--approve-gitlab", action="store_true")
    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        if args.command == "prepare":
            return _prepare()
        if args.command == "synthetic-vault":
            return _synthetic_vault(args.records)
        if args.command == "restic-argv":
            return _print_restic_argv(args.action, args.repository, args.path)
        if args.command == "admit-plan":
            return _admit_plan(args.plan)
        if args.command == "render-issue":
            return _render_issue(args.issue)
        if args.command == "evidence":
            return _evidence(args.gates, args.risk, args.approve_gitlab)
    except (AdmissionError, EvidenceError, SecretsError) as exc:
        print(f"[p0] error: {exc}", flush=True)
        return 1
    parser.error(f"unknown command {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
