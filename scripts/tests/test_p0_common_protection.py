"""P0 common protection and GitLab admission seams (tmc:chronicle:01M09Y4T00V0P1XJFNPFGE2QDV)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from recovery.git_evidence import (  # noqa: E402
    GitEvidenceError,
    collect_git_evidence,
)
from recovery.gitlab_admission import (  # noqa: E402
    AdmissionError,
    local_render_issue_export,
    validate_admission_plan,
)
from recovery.manifest import (  # noqa: E402
    ManifestError,
    build_source_manifest,
    compare_manifests,
    sha256_bytes,
)
from recovery.secrets import (  # noqa: E402
    SecretsError,
    credential_inventory,
    synthetic_export_import,
    verify_name_completeness,
)
from recovery.policy import (  # noqa: E402
    RESTIC_PIN,
    SOURCE_ROOTS,
    ExclusionError,
    ExclusionPolicy,
    is_excluded,
)


def test_fixed_exclusion_policy_drops_reproducible_outputs_and_keeps_recovery_state() -> None:
    assert is_excluded("chronicle", "frontend/node_modules/lodash/index.js")
    assert is_excluded("chronicle", "frontend/dist/index.html")
    assert is_excluded("chronicle", "frontend/storybook-static/iframe.html")
    assert is_excluded("chronicle", "scripts/cron/__pycache__/site_artifact.cpython-312.pyc")
    assert is_excluded("chronicle", "scripts/export/export_galaxy_json.pyc")
    assert is_excluded("chronicle", "frontend/.vite/deps/react.js")
    assert is_excluded("chronicle", ".pytest_cache/v/cache/lastfailed")
    assert is_excluded("og-worker", "node_modules/.bin/wrangler")
    assert is_excluded("og-worker", "dist/index.js")
    assert is_excluded("daily-worktree", ".venv/lib/python3.12/site.py")
    assert is_excluded("daily-worktree", "venv/bin/python")
    assert not is_excluded("chronicle", ".env")
    assert not is_excluded("chronicle", ".git/HEAD")
    assert not is_excluded("chronicle", "docs/wayfinder/github-account-outage-recovery/map.md")
    assert not is_excluded("og-worker", ".dev.vars")
    assert not is_excluded("daily-gitdir", "objects/pack/pack-abc.pack")
    assert not is_excluded("daily-worktree", ".git")


def test_exclusion_policy_rejects_operator_additions() -> None:
    with pytest.raises(ExclusionError, match="fixed"):
        ExclusionPolicy(extra=("large.iso",))


def test_source_roots_are_the_four_fixed_labels() -> None:
    assert tuple(root.label for root in SOURCE_ROOTS) == (
        "chronicle",
        "og-worker",
        "daily-worktree",
        "daily-gitdir",
    )
    by_label = {root.label: root for root in SOURCE_ROOTS}
    assert by_label["chronicle"].kind == "worktree"
    assert by_label["og-worker"].kind == "worktree"
    assert by_label["daily-worktree"].kind == "worktree"
    assert by_label["daily-gitdir"].kind == "gitdir"
    assert by_label["daily-worktree"].pairs_with == "daily-gitdir"
    assert by_label["daily-gitdir"].pairs_with == "daily-worktree"


def test_restic_pin_covers_windows_and_mac_and_records_sha256() -> None:
    assert RESTIC_PIN.version == "0.19.1"
    assert RESTIC_PIN.snapshot_tag == "github-account-outage-pre-migration"
    for platform in ("windows_amd64", "darwin_arm64", "darwin_amd64"):
        asset = RESTIC_PIN.assets[platform]
        assert asset.filename.startswith(f"restic_{RESTIC_PIN.version}_{platform}")
        assert len(asset.sha256) == 64
        assert int(asset.sha256, 16)
    assert RESTIC_PIN.assets["windows_amd64"].sha256 == (
        "da948ad707ed690426473aaba2046cd61f8f90f6f0e7dab6be0d5796531de67d"
    )
    assert RESTIC_PIN.assets["darwin_arm64"].sha256 == (
        "7be0a144ccc377880f294204aa271d76e4b79554b42a751151d425ce6ebac143"
    )


def _write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def test_source_manifest_includes_git_and_env_and_skips_fixed_exclusions(tmp_path: Path) -> None:
    chronicle = tmp_path / "chronicle"
    _write(chronicle / ".env", b"not-a-live-secret")
    _write(chronicle / ".git" / "HEAD", b"ref: refs/heads/main\n")
    _write(chronicle / "frontend" / "dist" / "index.html", b"build")
    _write(chronicle / "frontend" / "node_modules" / "x" / "index.js", b"dep")
    _write(chronicle / "keep.txt", b"keep")
    manifest = build_source_manifest({"chronicle": chronicle})
    paths = {entry.relative_path for entry in manifest.entries}
    assert ".env" in paths
    assert ".git/HEAD" in paths
    assert "keep.txt" in paths
    assert "frontend/dist/index.html" not in paths
    assert "frontend/node_modules/x/index.js" not in paths
    keep = next(entry for entry in manifest.entries if entry.relative_path == "keep.txt")
    assert keep.entry_type == "file"
    assert keep.size == 4
    assert keep.sha256 == sha256_bytes(b"keep")


def test_source_manifest_records_symlinks_and_rejects_unreadable_files(tmp_path: Path) -> None:
    root = tmp_path / "chronicle"
    target = root / "target.txt"
    _write(target, b"hello")
    link = root / "link.txt"
    _write(link, b"ignored-symlink-placeholder")
    manifest = build_source_manifest(
        {"chronicle": root},
        is_symlink=lambda path: path.name == "link.txt",
        read_symlink=lambda path: "target.txt",
    )
    entry = next(item for item in manifest.entries if item.relative_path == "link.txt")
    assert entry.entry_type == "symlink"
    assert entry.symlink_target == "target.txt"
    assert entry.sha256 is None

    locked = root / "locked.bin"
    _write(locked, b"x")

    def opener(path: Path, relative_path: str):
        if relative_path == "locked.bin":
            raise PermissionError("denied")
        return path.read_bytes()

    with pytest.raises(ManifestError, match="unreadable"):
        build_source_manifest({"chronicle": root}, read_file=opener)


def test_missing_source_root_rejects_the_joint_snapshot(tmp_path: Path) -> None:
    with pytest.raises(ManifestError, match="missing source root"):
        build_source_manifest({"chronicle": tmp_path / "absent"})


def test_manifest_compare_is_zero_diff_only_when_every_entry_matches() -> None:
    acquired = [
        {"label": "chronicle", "relative_path": "a.txt", "entry_type": "file", "size": 1, "sha256": "aa", "symlink_target": None},
        {"label": "chronicle", "relative_path": "link", "entry_type": "symlink", "size": None, "sha256": None, "symlink_target": "a.txt"},
    ]
    restored = [dict(item) for item in acquired]
    assert compare_manifests(acquired, restored).ok is True
    assert compare_manifests(acquired, restored).differences == ()

    result = compare_manifests(acquired, [dict(acquired[0])])
    assert result.ok is False
    assert "missing" in result.differences[0]

    extra = restored + [{"label": "chronicle", "relative_path": "b.txt", "entry_type": "file", "size": 1, "sha256": "bb", "symlink_target": None}]
    result = compare_manifests(acquired, extra)
    assert result.ok is False
    assert "extra" in result.differences[0]

    typed = [dict(acquired[0]), dict(acquired[1], entry_type="file", size=1, sha256="aa")]
    result = compare_manifests(acquired, typed)
    assert result.ok is False
    assert "type-changed" in result.differences[0]

    linked = [dict(acquired[0]), dict(acquired[1], symlink_target="other")]
    result = compare_manifests(acquired, linked)
    assert result.ok is False
    assert "link-changed" in result.differences[0]

    sized = [dict(acquired[0], size=2), dict(acquired[1])]
    result = compare_manifests(acquired, sized)
    assert result.ok is False
    assert "size-changed" in result.differences[0]

    content = [dict(acquired[0], sha256="ff"), dict(acquired[1])]
    result = compare_manifests(acquired, content)
    assert result.ok is False
    assert "content-changed" in result.differences[0]


def test_partial_root_success_is_not_acceptance(tmp_path: Path) -> None:
    chronicle = tmp_path / "chronicle"
    worker = tmp_path / "og-worker"
    _write(chronicle / "keep.txt", b"c")
    _write(worker / "keep.txt", b"w")
    with pytest.raises(ManifestError, match="joint"):
        build_source_manifest(
            {
                "chronicle": chronicle,
                "og-worker": worker,
                "daily-worktree": tmp_path / "missing-daily",
                "daily-gitdir": tmp_path / "missing-gitdir",
            },
            require_labels=("chronicle", "og-worker", "daily-worktree", "daily-gitdir"),
        )


def test_daily_git_evidence_requires_explicit_external_store_pairing(tmp_path: Path) -> None:
    worktree = tmp_path / "daily"
    gitdir = tmp_path / "daily.git"
    _write(worktree / ".git", b"gitdir: C:/wrong/path\n")
    with pytest.raises(GitEvidenceError, match="unresolved external Git store"):
        collect_git_evidence(
            label="daily-worktree",
            worktree=worktree,
            expected_gitdir=tmp_path / "missing.git",
            runner=lambda args, cwd: (0, ""),
        )

    _write(gitdir / "HEAD", b"ref: refs/heads/main\n")
    _write(gitdir / "refs" / "heads" / "main", b"abc123\n")

    def runner(args: object, cwd: Path) -> tuple[int, str]:
        del cwd
        table = {
            ("rev-parse", "--verify", "HEAD"): (0, "abc123\n"),
            ("fsck", "--full", "--strict"): (0, ""),
            ("for-each-ref", "--format=%(objectname) %(refname)"): (0, "abc123 refs/heads/main\n"),
            ("stash", "list"): (0, ""),
        }
        return table.get(tuple(args), (1, "unexpected"))

    evidence = collect_git_evidence(
        label="daily-worktree",
        worktree=worktree,
        expected_gitdir=gitdir,
        runner=runner,
    )
    assert evidence.paired_gitdir_label == "daily-gitdir"
    assert evidence.head_object == "abc123"
    assert evidence.fsck_ok is True
    assert evidence.ref_count == 1
    assert evidence.stash_count == 0

    def failing_fsck(args: object, cwd: Path) -> tuple[int, str]:
        if tuple(args) == ("fsck", "--full", "--strict"):
            return (1, "error in tree")
        return runner(args, cwd)

    with pytest.raises(GitEvidenceError, match="fsck"):
        collect_git_evidence(
            label="daily-worktree",
            worktree=worktree,
            expected_gitdir=gitdir,
            runner=failing_fsck,
        )


def test_sanitized_receipt_rejects_secrets_paths_and_inventories() -> None:
    from recovery.receipt import ReceiptError, sanitize_receipt

    clean = sanitize_receipt(
        {
            "acquired_at": "2026-08-18T00:00:00Z",
            "restic_version": "0.19.1",
            "snapshot_id": "abcd",
            "tree_id": "ef01",
            "source_labels": ["chronicle", "og-worker", "daily-worktree", "daily-gitdir"],
            "file_count": 12,
            "byte_count": 100,
            "exclusion_policy_id": "tmc-p0-exclusion-v1",
            "check_read_data": "pass",
            "restore_compare": "pass",
            "git_integrity": "pass",
            "evidence_bundle_hash": "a" * 64,
        }
    )
    assert clean["check_read_data"] == "pass"
    assert "relative_path" not in str(clean)

    with pytest.raises(ReceiptError, match="secret"):
        sanitize_receipt({"acquired_at": "2026-08-18T00:00:00Z", "password": "hunter2"})
    with pytest.raises(ReceiptError, match="sensitive path"):
        sanitize_receipt({"acquired_at": "2026-08-18T00:00:00Z", "source": r"E:\projects\chronicle_v3_3d_galaxy"})
    with pytest.raises(ReceiptError, match="per-file"):
        sanitize_receipt(
            {
                "acquired_at": "2026-08-18T00:00:00Z",
                "files": [{"path": "a.txt", "sha256": "deadbeef"}],
            }
        )
    with pytest.raises(ReceiptError, match="inventory"):
        sanitize_receipt(
            {
                "acquired_at": "2026-08-18T00:00:00Z",
                "unreachable_objects": ["abc123"],
            }
        )


def test_restic_commands_never_receive_a_password_and_backup_failure_rejects() -> None:
    from recovery.snapshot import SnapshotError, restic_argv, run_acquisition

    backup = restic_argv("backup", repository="sftp:mac:recovery", paths=("a", "b"))
    assert backup[0] == "restic"
    assert "--tag" in backup
    assert "github-account-outage-pre-migration" in backup
    joined = " ".join(backup)
    assert "password" not in joined.lower()
    assert "-p" not in backup

    def runner(argv: list[str], env: dict[str, str]) -> int:
        assert "RESTIC_PASSWORD" not in env
        assert "RESTIC_PASSWORD_FILE" not in env
        return 1

    with pytest.raises(SnapshotError, match="incomplete backup"):
        run_acquisition(
            repository="sftp:mac:recovery",
            paths=("a", "b"),
            runner=runner,
            env={},
        )


def test_capacity_and_host_key_and_source_mutation_are_hard_stops() -> None:
    from recovery.snapshot import SnapshotError, assert_capacity, assert_sources_frozen, verify_ssh_host_identity

    assert_capacity(free_bytes=200, required_bytes=100)
    with pytest.raises(SnapshotError, match="capacity"):
        assert_capacity(free_bytes=50, required_bytes=100)
    verify_ssh_host_identity(
        expected="SHA256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        observed="SHA256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    )
    with pytest.raises(SnapshotError, match="SSH host"):
        verify_ssh_host_identity(expected="SHA256:aaa", observed="SHA256:bbb")
    with pytest.raises(SnapshotError, match="source mutation"):
        assert_sources_frozen({"keep.txt": "aa"}, {"keep.txt": "bb"})


def test_synthetic_vault_roundtrip_proves_equality_and_rejects_live_values() -> None:
    records = (
        {"name": "synthetic-cloudflare-token", "value": "synthetic-value-1", "purpose": "admission drill"},
        {"name": "synthetic-restic-password", "value": "synthetic-value-2", "purpose": "admission drill"},
    )
    imported = synthetic_export_import(records, password=lambda: "drill-passphrase")
    assert imported == list(records)
    with pytest.raises(SecretsError, match="live"):
        synthetic_export_import(
            ({"name": "CLOUDFLARE_API_TOKEN", "value": "real-looking-token", "purpose": "prod"},),
            password=lambda: "drill-passphrase",
        )


def test_credential_inventory_lists_names_and_consumers_without_values() -> None:
    items = credential_inventory()
    names = {item["name"] for item in items}
    assert "SUPABASE_SERVICE_ROLE_KEY" in names
    assert "CLOUDFLARE_API_TOKEN" in names
    assert "R2_SECRET_ACCESS_KEY" in names
    assert "KAGGLE_KEY" in names
    assert "TMDB_API_KEY" in names
    for item in items:
        assert "value" not in item
        assert item["consumers"]
    extra = verify_name_completeness([str(item["name"]) for item in items])
    assert extra == ()
    with pytest.raises(SecretsError, match="completeness"):
        verify_name_completeness(["SUPABASE_URL"])


def test_gitlab_admission_plan_stays_private_disposable_and_non_deploying() -> None:
    plan = {
        "project_name": "tmc-p0-admission-fixture",
        "visibility": "private",
        "jobs": ("node_test", "python_test"),
        "variables": {"ADMISSION_DUMMY": "dummy"},
        "protected_variables": ("ADMISSION_DUMMY",),
        "artifacts": ("admission.txt",),
        "deploy": False,
        "schedule": False,
        "compute_seconds": 42,
    }
    accepted = validate_admission_plan(plan)
    assert accepted["visibility"] == "private"
    assert accepted["compute_seconds"] == 42
    with pytest.raises(AdmissionError, match="real repository"):
        validate_admission_plan({**plan, "project_name": "chronicle_v3_3d_galaxy"})
    with pytest.raises(AdmissionError, match="production"):
        validate_admission_plan({**plan, "variables": {"CLOUDFLARE_API_TOKEN": "x", "ADMISSION_DUMMY": "dummy"}})
    with pytest.raises(AdmissionError, match="deploy"):
        validate_admission_plan({**plan, "deploy": True})
    with pytest.raises(AdmissionError, match="schedule"):
        validate_admission_plan({**plan, "schedule": True})
    with pytest.raises(AdmissionError, match="private"):
        validate_admission_plan({**plan, "visibility": "public"})


def test_portable_issue_export_renders_parent_and_blocker_locally() -> None:
    rendered = local_render_issue_export(
        {
            "portable_id": "tmc:chronicle:01M09Y4T00V0P1XJFNPFGE2QDV",
            "title": "P0 Common Protection and GitLab Admission",
            "parent": {
                "title": "Restore development and operations without a GitHub account single point of failure",
                "portable_id": "tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q",
            },
            "blocked_by": [],
        }
    )
    assert "tmc:chronicle:01M09Y4T00V0P1XJFNPFGE2QDV" in rendered
    assert "Parent:" in rendered
    assert "Restore development and operations without a GitHub account single point of failure" in rendered
    assert "Blocked by: None" in rendered


def _passing_gates() -> dict[str, object]:
    return {
        "bitwarden_synthetic_drill": {"ok": True, "count": 2},
        "restic_pin": {"ok": True, "version": "0.19.1"},
        "capacity": {"ok": True},
        "ssh_host_identity": {"ok": True},
        "snapshot_acquisition": {"ok": True, "snapshot_id": "snap1", "tree_id": "tree1"},
        "restic_check_read_data": {"ok": True},
        "restore_compare": {"ok": True, "differences": []},
        "git_integrity": {"ok": True, "fsck_ok": True},
        "sanitized_receipt": {
            "acquired_at": "2026-08-18T00:00:00Z",
            "check_read_data": "pass",
            "restore_compare": "pass",
            "git_integrity": "pass",
        },
        "live_vault_completeness": {"ok": True, "name_count": 17},
        "gitlab_admission": {
            "visibility": "private",
            "deploy": False,
            "schedule": False,
            "compute_seconds": 42,
        },
    }


def test_evidence_bundle_requires_human_risk_and_gitlab_approval() -> None:
    from recovery.evidence import EvidenceError, assemble_evidence_bundle

    gates = _passing_gates()
    with pytest.raises(EvidenceError, match="risk"):
        assemble_evidence_bundle(gates=gates, risk_declaration=None, gitlab_human_approval=True)
    with pytest.raises(EvidenceError, match="human approval"):
        assemble_evidence_bundle(
            gates=gates,
            risk_declaration={"schema": "chronicle-risk-declaration-v1", "tier": "R2", "surfaces": ["publication"]},
            gitlab_human_approval=False,
        )
    with pytest.raises(EvidenceError, match="restore_compare"):
        assemble_evidence_bundle(
            gates={**gates, "restore_compare": "pass"},
            risk_declaration={"schema": "chronicle-risk-declaration-v1", "tier": "R2", "surfaces": ["publication"]},
            gitlab_human_approval=True,
        )
    bundle = assemble_evidence_bundle(
        gates=gates,
        risk_declaration={"schema": "chronicle-risk-declaration-v1", "tier": "R2", "surfaces": ["publication"]},
        gitlab_human_approval=True,
        residual_uncertainty=("GitHub server-only state unknown",),
    )
    assert bundle["gitlab_admitted"] is True
    assert "GitHub server-only state unknown" in bundle["residual_uncertainty"]
    assert set(gates) <= set(bundle["gates"])


def test_cli_prepare_prints_fixed_policy_without_secrets(capsys: pytest.CaptureFixture[str]) -> None:
    from recovery.cli import main

    code = main(["prepare"])
    assert code == 0
    output = capsys.readouterr().out
    payload = json.loads(output)
    assert payload["exclusion_policy_id"] == "tmc-p0-exclusion-v1"
    assert payload["restic_version"] == "0.19.1"
    assert "password" not in output.lower()
    assert "value" not in payload["credential_names"]
    assert "SUPABASE_SERVICE_ROLE_KEY" in payload["credential_names"]


def test_disposable_gitlab_fixture_is_private_non_deploying() -> None:
    text = Path(__file__).resolve().parents[1].joinpath(
        "recovery", "fixtures", "disposable-gitlab-ci.yml"
    ).read_text(encoding="utf-8")
    assert "node_test:" in text
    assert "python_test:" in text
    assert "ADMISSION_DUMMY" in text
    assert "artifacts:" in text
    assert "schedule:" not in text
    assert "pages:" not in text
    assert "deploy:" not in text
    assert "CLOUDFLARE_API_TOKEN" not in text
