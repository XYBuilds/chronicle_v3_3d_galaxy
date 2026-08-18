"""Chronicle P0 development-resume seams (tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from recovery.chronicle_restore import (  # noqa: E402
    RestoreError,
    assemble_resume_evidence,
    validate_ci_adapter,
    validate_clone_proof,
    validate_protection,
    validate_ref_plan,
    validate_remotes,
    validate_secret_scan,
)


def _approved_refs() -> list[dict[str, str]]:
    return [
        {
            "src": "refs/heads/main",
            "dst": "refs/heads/main",
        },
        {
            "src": "refs/tags/p18-canonical-v1",
            "dst": "refs/tags/p18-canonical-v1",
        },
        {
            "src": "refs/heads/cursor/02-restore-chronicle-repository-and-issue-driven-delivery",
            "dst": "refs/heads/cursor/02-restore-chronicle-repository-and-issue-driven-delivery",
        },
    ]


def test_ref_plan_allows_explicit_main_tags_and_issue_branches_only() -> None:
    accepted = validate_ref_plan({"mirror": False, "refs": _approved_refs()})
    assert accepted["mirror"] is False
    assert [item["src"] for item in accepted["refs"]] == [item["src"] for item in _approved_refs()]


def test_ref_plan_rejects_mirror_and_unreviewed_namespaces() -> None:
    plan = {"mirror": False, "refs": _approved_refs()}
    with pytest.raises(RestoreError, match="mirror"):
        validate_ref_plan({**plan, "mirror": True})
    with pytest.raises(RestoreError, match="explicit"):
        validate_ref_plan({"mirror": False, "refs": []})
    with pytest.raises(RestoreError, match="stash"):
        validate_ref_plan(
            {**plan, "refs": _approved_refs() + [{"src": "refs/stash", "dst": "refs/stash"}]}
        )
    with pytest.raises(RestoreError, match="remote-tracking"):
        validate_ref_plan(
            {
                **plan,
                "refs": _approved_refs()
                + [{"src": "refs/remotes/origin/main", "dst": "refs/heads/origin-main"}],
            }
        )
    with pytest.raises(RestoreError, match="provider"):
        validate_ref_plan(
            {
                **plan,
                "refs": _approved_refs()
                + [{"src": "refs/codex/session", "dst": "refs/codex/session"}],
            }
        )
    with pytest.raises(RestoreError, match="research"):
        validate_ref_plan(
            {
                **plan,
                "refs": _approved_refs()
                + [
                    {
                        "src": "refs/heads/research/chronicle-cleanup-inventory",
                        "dst": "refs/heads/research/chronicle-cleanup-inventory",
                    }
                ],
            }
        )


def test_secret_scan_stops_promotion_and_requires_scanned_refs() -> None:
    refs = [item["src"] for item in _approved_refs()]
    accepted = validate_secret_scan({"refs_scanned": refs, "findings": []}, planned_refs=refs)
    assert accepted["findings"] == ()
    with pytest.raises(RestoreError, match="secret"):
        validate_secret_scan(
            {
                "refs_scanned": refs,
                "findings": [{"ref": "refs/heads/main", "kind": "private-key"}],
            },
            planned_refs=refs,
        )
    with pytest.raises(RestoreError, match="scan"):
        validate_secret_scan({"refs_scanned": [], "findings": []}, planned_refs=refs)
    with pytest.raises(RestoreError, match="scan"):
        validate_secret_scan({"refs_scanned": refs[:-1], "findings": []}, planned_refs=refs)


def test_candidate_remote_leaves_github_named_origin_until_promotion() -> None:
    github = "https://github.com/XYBuilds/chronicle_v3_3d_galaxy.git"
    gitlab = "https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy.git"
    candidate = validate_remotes(
        {
            "origin": github,
            "gitlab-candidate": gitlab,
            "promoted": False,
        }
    )
    assert candidate["promoted"] is False
    assert candidate["origin"] == github
    promoted = validate_remotes(
        {
            "origin": gitlab,
            "github-suspended": github,
            "promoted": True,
        }
    )
    assert promoted["origin"] == gitlab
    assert promoted["github-suspended"] == github
    with pytest.raises(RestoreError, match="authoritative"):
        validate_remotes({"origin": gitlab, "gitlab-candidate": gitlab, "promoted": False})
    with pytest.raises(RestoreError, match="alias"):
        validate_remotes({"origin": gitlab, "promoted": True})
    with pytest.raises(RestoreError, match="overwritten"):
        validate_remotes({"origin": gitlab, "github-suspended": gitlab, "promoted": True})


def test_protected_main_requires_api_readback_without_force_or_direct_push() -> None:
    observed = {
        "default_branch": "main",
        "name": "main",
        "allow_force_push": False,
        "push_access_level": 0,
        "merge_access_level": 40,
        "code_owner_approval_required": False,
        "source": "api",
    }
    accepted = validate_protection(observed)
    assert accepted["default_branch"] == "main"
    assert accepted["allow_force_push"] is False
    assert accepted["push_access_level"] == 0
    with pytest.raises(RestoreError, match="default"):
        validate_protection({**observed, "default_branch": "master"})
    with pytest.raises(RestoreError, match="force"):
        validate_protection({**observed, "allow_force_push": True})
    with pytest.raises(RestoreError, match="direct"):
        validate_protection({**observed, "push_access_level": 30})
    with pytest.raises(RestoreError, match="API"):
        validate_protection({**observed, "source": "ui-screenshot"})


def _write_issue(path: Path, *, title: str, portable_id: str, parent: str, blocked_by: str, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join(
            [
                f"# {title}",
                "",
                f"**Portable ID:** `{portable_id}`",
                f"**Parent:** {parent}",
                f"**Blocked by:** {blocked_by}",
                "**Status:** ready-for-agent",
                "",
                body,
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def test_tracker_export_import_render_and_relationship_check(tmp_path: Path) -> None:
    from recovery.tracker import (
        TrackerError,
        check_relationships,
        export_local_tracker,
        import_tracker,
        render_export,
    )

    spec = tmp_path / "spec.md"
    spec.write_text(
        "\n".join(
            [
                "---",
                "id: tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q",
                "title: Recovery Initiative",
                "status: ready-for-agent",
                "tracker: local-markdown",
                "---",
                "",
                "# Recovery Initiative",
                "",
                "**Portable ID:** `tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`",
                "**Parent:** None",
                "**Blocked by:** None",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    issues = tmp_path / "issues"
    _write_issue(
        issues / "01.md",
        title="Common P0",
        portable_id="tmc:chronicle:01M09Y4T00V0P1XJFNPFGE2QDV",
        parent="Recovery Initiative (`tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`)",
        blocked_by="None",
        body="Closed common protection.",
    )
    _write_issue(
        issues / "02.md",
        title="Chronicle P0",
        portable_id="tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC",
        parent="Recovery Initiative (`tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`)",
        blocked_by="Common P0 (`tmc:chronicle:01M09Y4T00V0P1XJFNPFGE2QDV`)",
        body="Restore Chronicle.",
    )
    bundle = export_local_tracker(tmp_path)
    check_relationships(bundle)
    imported = import_tracker(bundle)
    assert imported["schema"] == "tmc-tracker-export-v1"
    ids = {record["portable_id"] for record in imported["records"]}
    assert "tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC" in ids
    rendered = render_export(imported)
    assert "tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC" in rendered
    assert "Recovery Initiative" in rendered
    assert "Common P0" in rendered
    broken = {
        **imported,
        "records": [
            dict(imported["records"][0]),
            {
                **[record for record in imported["records"] if record["portable_id"].endswith("FBGTC")][0],
                "blocked_by": [{"title": "Missing", "portable_id": "tmc:chronicle:DOESNOTEXIST"}],
            },
        ],
    }
    with pytest.raises(TrackerError, match="relationship"):
        check_relationships(broken)


def test_tracker_transition_freezes_predecessor_and_keeps_provider_numbers_as_aliases() -> None:
    from recovery.tracker import TrackerError, validate_tracker_transition

    accepted = validate_tracker_transition(
        {
            "predecessor": "frozen",
            "destination": "writable",
            "dual_writable": False,
            "records": [
                {
                    "portable_id": "tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC",
                    "provider_aliases": [{"provider": "gitlab", "iid": 2}],
                }
            ],
        }
    )
    assert accepted["predecessor"] == "frozen"
    assert accepted["destination"] == "writable"
    with pytest.raises(TrackerError, match="writable"):
        validate_tracker_transition(
            {
                "predecessor": "writable",
                "destination": "writable",
                "dual_writable": True,
                "records": accepted["records"],
            }
        )
    with pytest.raises(TrackerError, match="alias"):
        validate_tracker_transition(
            {
                "predecessor": "frozen",
                "destination": "writable",
                "dual_writable": False,
                "records": [{"portable_id": "2", "provider_aliases": []}],
            }
        )


def test_handoff_export_keeps_wayfinder_and_delivery_relationships() -> None:
    import json

    from recovery.tracker import export_handoff, render_export

    root = Path(__file__).resolve().parents[2]
    alias_map = json.loads(
        (root / "scripts/recovery/fixtures/wayfinder-portable-ids.json").read_text(encoding="utf-8")
    )
    bundle = export_handoff(
        root / ".scratch/github-account-outage-recovery",
        root / "docs/wayfinder/github-account-outage-recovery",
        alias_map,
    )
    ids = {record["portable_id"] for record in bundle["records"]}
    assert "tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC" in ids
    assert "tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q" in ids
    assert alias_map["define-p0-restoration.md"] in ids
    assert alias_map["map.md"] in ids
    p0 = next(
        record
        for record in bundle["records"]
        if record["portable_id"] == alias_map["define-p0-restoration.md"]
    )
    assert p0["parent"]["portable_id"] == alias_map["map.md"]
    assert {item["portable_id"] for item in p0["blocked_by"]} >= {
        alias_map["define-complete-recovery-snapshot.md"],
        alias_map["choose-independent-control-plane.md"],
    }
    assert "WFG-008" in {alias.get("id") for alias in p0["provider_aliases"]}
    assert "Resolved" in p0["resolution"]
    assert any(comment["authored_at"] == "2026-08-18" for comment in p0["comments"])
    rendered = render_export(bundle)
    assert "Restore Chronicle repository and Issue-driven delivery" in rendered
    assert "Define the P0 repository and development restoration plan" in rendered


def test_ci_adapter_is_non_deploying_and_runs_owner_checks() -> None:
    text = """
stages:
  - verify
workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
      when: never
    - when: always
frontend_verify:
  script:
    - npm ci
    - npm test
    - npm run lint
    - npm run build
docs_verify:
  script:
    - python -m pytest scripts/tests/test_current_documentation_authority.py scripts/tests/test_chronicle_p0_restore.py
    - git diff --check
"""
    accepted = validate_ci_adapter(text)
    assert accepted["deploy"] is False
    assert accepted["schedule"] is False
    with pytest.raises(RestoreError, match="schedule"):
        validate_ci_adapter(text + "\nschedule:\n  daily:\n    cron: '0 0 * * *'\n")
    with pytest.raises(RestoreError, match="deploy"):
        validate_ci_adapter(text + "\npages:\n  script: ['echo deploy']\n")
    with pytest.raises(RestoreError, match="production"):
        validate_ci_adapter(text + "\nvariables:\n  CLOUDFLARE_API_TOKEN: x\n")
    with pytest.raises(RestoreError, match="owner"):
        validate_ci_adapter("stages:\n  - verify\nnoop:\n  script:\n    - echo hi\n")


def test_clone_proof_requires_empty_directory_ref_equality_and_fsck() -> None:
    approved = {
        "main": "abc123",
        "refs": {
            "refs/heads/main": "abc123",
            "refs/tags/p18-canonical-v1": "def456",
        },
    }
    cloned = {
        "empty_directory": True,
        "main": "abc123",
        "refs": dict(approved["refs"]),
        "fsck_ok": True,
    }
    accepted = validate_clone_proof(approved, cloned)
    assert accepted["fsck_ok"] is True
    with pytest.raises(RestoreError, match="empty"):
        validate_clone_proof(approved, {**cloned, "empty_directory": False})
    with pytest.raises(RestoreError, match="main"):
        validate_clone_proof(approved, {**cloned, "main": "zzz"})
    with pytest.raises(RestoreError, match="unexpected"):
        validate_clone_proof(
            approved,
            {**cloned, "refs": {**cloned["refs"], "refs/heads/research/extra": "aaa"}},
        )
    with pytest.raises(RestoreError, match="missing"):
        validate_clone_proof(approved, {**cloned, "refs": {"refs/heads/main": "abc123"}})
    with pytest.raises(RestoreError, match="fsck"):
        validate_clone_proof(approved, {**cloned, "fsck_ok": False})


def _resume_gates() -> dict[str, object]:
    return {
        "visibility": "private",
        "snapshot_receipt_id": "9938a021",
        "ref_plan": {"ok": True},
        "secret_scan": {"ok": True, "findings": []},
        "protection": {"ok": True, "source": "api"},
        "tracker_transition": {"ok": True, "predecessor": "frozen", "destination": "writable"},
        "ci_adapter": {"ok": True, "deploy": False, "schedule": False},
        "pipeline": {"ok": True, "status": "success", "deploy": False},
        "merge_request": {"ok": True, "merged": True, "bypass": False},
        "clone_proof": {"ok": True, "fsck_ok": True},
        "deployment_disabled": True,
        "schedules_disabled": True,
        "production_secrets_absent": True,
        "issue_open": True,
        "github_uncertainty": "GitHub server-only state unknown",
    }


def test_resume_evidence_requires_human_risk_merge_and_keeps_issue_open() -> None:
    gates = _resume_gates()
    risk = {"schema": "chronicle-risk-declaration-v1", "tier": "R0", "surfaces": []}
    with pytest.raises(RestoreError, match="risk"):
        assemble_resume_evidence(gates=gates, risk_declaration=None, merge_approved=True)
    with pytest.raises(RestoreError, match="merge"):
        assemble_resume_evidence(gates=gates, risk_declaration=risk, merge_approved=False)
    with pytest.raises(RestoreError, match="open"):
        assemble_resume_evidence(
            gates={**gates, "issue_open": False},
            risk_declaration=risk,
            merge_approved=True,
        )
    with pytest.raises(RestoreError, match="private"):
        assemble_resume_evidence(
            gates={**gates, "visibility": "public"},
            risk_declaration=risk,
            merge_approved=True,
        )
    with pytest.raises(RestoreError, match="deploy"):
        assemble_resume_evidence(
            gates={**gates, "deployment_disabled": False},
            risk_declaration=risk,
            merge_approved=True,
        )
    bundle = assemble_resume_evidence(
        gates=gates,
        risk_declaration=risk,
        merge_approved=True,
        recorded_at="2026-08-18T12:00:00Z",
    )
    assert bundle["development_resume"] is True
    assert bundle["issue_open"] is True
    assert bundle["deployment_disabled"] is True
    assert bundle["snapshot_receipt_id"] == "9938a021"
    assert bundle["visibility"] == "private"
    assert bundle["recorded_at"] == "2026-08-18T12:00:00Z"
    assert bundle["pipeline"]["status"] == "success"
    assert bundle["clone_proof"]["fsck_ok"] is True
    assert "GitHub server-only state unknown" in bundle["residual_uncertainty"]


def test_bootstrap_files_name_gitlab_and_keep_ci_non_deploying() -> None:
    root = Path(__file__).resolve().parents[2]
    agents = (root / "AGENTS.md").read_text(encoding="utf-8")
    tracker = (root / "docs/agents/issue-tracker.md").read_text(encoding="utf-8")
    ci = (root / ".gitlab-ci.yml").read_text(encoding="utf-8")
    assert "GitLab" in agents
    assert "glab" in agents
    assert "docs/agents/issue-tracker.md" in agents
    assert "GitLab" in tracker
    assert "glab" in tracker
    assert "Blocked by" in tracker
    accepted = validate_ci_adapter(ci)
    assert accepted["deploy"] is False
    assert accepted["schedule"] is False


def test_cli_resume_evidence_and_export_handoff(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    from recovery.cli import main

    root = Path(__file__).resolve().parents[2]
    gates_path = tmp_path / "gates.json"
    risk_path = tmp_path / "risk.json"
    gates_path.write_text(json.dumps(_resume_gates()), encoding="utf-8")
    risk_path.write_text(
        json.dumps({"schema": "chronicle-risk-declaration-v1", "tier": "R0", "surfaces": []}),
        encoding="utf-8",
    )
    code = main(
        ["resume-evidence", "--gates", str(gates_path), "--risk", str(risk_path), "--approve-merge"]
    )
    assert code == 0
    bundle = json.loads(capsys.readouterr().out)
    assert bundle["development_resume"] is True

    code = main(
        [
            "export-handoff",
            "--scratch",
            str(root / ".scratch/github-account-outage-recovery"),
            "--wayfinder",
            str(root / "docs/wayfinder/github-account-outage-recovery"),
            "--alias-map",
            str(root / "scripts/recovery/fixtures/wayfinder-portable-ids.json"),
        ]
    )
    assert code == 0
    output = capsys.readouterr().out
    assert "tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC" in output
    assert "Define the P0 repository and development restoration plan" in output
