"""Monthly production admission and real input/failure boundaries (#405)."""
from pathlib import Path
import hashlib
import sys
import zipfile

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from publication.bundle import REQUIRED_FILES
from publication.monthly_assets import unpack_verified_bundle, select_profile
from publication.errors import PublicationError
from publication.github import verify_github_context
from publication.entrypoints import RecordingRunner, run_monthly_release
from publication.store import MemoryPublicationStore
from publication.sequence import bootstrap_sequence


def test_monthly_manual_and_schedule_have_separate_admission():
    env = dict(PUBLICATION_AUTHORITY="github", GITHUB_REPOSITORY="XYBuilds/chronicle_v3_3d_galaxy",
               GITHUB_REF="refs/heads/main", GITHUB_REF_PROTECTED="true", GITHUB_EVENT_NAME="workflow_dispatch")
    with pytest.raises(PublicationError, match="Monthly"):
        verify_github_context(env, entry_point="monthly")
    env["P2_MONTHLY_RELEASE_ENABLED"] = "true"
    verify_github_context(env, entry_point="monthly")
    env["GITHUB_EVENT_NAME"] = "schedule"
    with pytest.raises(PublicationError, match="automatic"):
        verify_github_context(env, entry_point="monthly")
    env["P2_MONTHLY_SCHEDULE_ENABLED"] = "true"
    verify_github_context(env, entry_point="monthly")
    env["GITHUB_EVENT_NAME"] = "push"
    with pytest.raises(PublicationError):
        verify_github_context(env, entry_point="monthly")


def bundle(tmp_path, names):
    path = tmp_path / "bundle.zip"
    with zipfile.ZipFile(path, "w") as z:
        for name in names:
            z.writestr(name, b"fixture")
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


def test_bundle_digest_is_verified_before_creating_files(tmp_path):
    path, digest = bundle(tmp_path, REQUIRED_FILES)
    destination = tmp_path / "cache"
    with pytest.raises(PublicationError, match="hash mismatch"):
        unpack_verified_bundle(path, destination, "0" * 64)
    assert not destination.exists()
    unpack_verified_bundle(path, destination, digest)
    assert sorted(p.name for p in destination.iterdir()) == sorted(REQUIRED_FILES)


@pytest.mark.parametrize("names", [REQUIRED_FILES[:-1], (*REQUIRED_FILES, "../escape"), (*REQUIRED_FILES, "extra.txt")])
def test_noncanonical_archive_members_are_rejected(tmp_path, names):
    path, digest = bundle(tmp_path, names)
    with pytest.raises(PublicationError, match="exactly"):
        unpack_verified_bundle(path, tmp_path / "cache", digest)
    assert not (tmp_path / "cache").exists()


def test_profile_selection_refuses_missing_or_ambiguous_candidate(tmp_path):
    with pytest.raises(PublicationError):select_profile(tmp_path)
    one = tmp_path / "profile-one.json";one.write_text("{}")
    assert select_profile(tmp_path) == one
    (tmp_path / "profile-two.json").write_text("{}")
    with pytest.raises(PublicationError):select_profile(tmp_path)


def run(runner):
    store = MemoryPublicationStore()
    bootstrap_sequence(store, verified_identities=["2026.08.12.daily.141"])
    return run_monthly_release(store=store, runner=runner, request=dict(mode="production", monthly_enabled=True,
        ref="main", protected=True, pipeline_source="workflow_dispatch", bundle_sha256="a"*64), clock=lambda:"2026-10-02T00:00:00Z")


def test_production_runs_real_refit_and_records_its_mutation(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    runner = RecordingRunner()
    receipt = run(runner)
    refit = next(c for c in runner.commands if c.name == "galaxy-refit")
    assert "--dry-run" not in refit.argv and refit.mutates
    assert receipt["inputs"]["production_monthly_restored"] is True
    assert receipt["data_release_identity"] == "2026.10.02.monthly.142"


def test_partial_monthly_failure_holds_followup_data_releases():
    runner = RecordingRunner(fail_on="galaxy-refit")
    receipt = run(runner)
    assert receipt["result"] == "failed"
    assert receipt["rollback_attempt"]["publication_hold"] is True
    assert not any(c.name == "og-sync" for c in runner.commands)


def test_failed_rollback_composition_does_not_redeploy():
    class FailTwice(RecordingRunner):
        def __call__(self, command):
            self.fail_on = command.name if command.name in {"production-smoke", "recompose-last-known-good"} else None
            return super().__call__(command)
    runner = FailTwice()
    assert run(runner)["result"] == "failed"
    assert not any(c.name == "redeploy-last-known-good" for c in runner.commands)
