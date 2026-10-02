"""Cutback boundaries: only an admitted owner-main job can reach production."""
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from publication.github import verify_github_context
from publication.admission import admit_protected_ref
from publication.entrypoints import RecordingRunner, run_site_release
from publication.errors import PublicationError
from publication.sequence import bootstrap_sequence
from publication.store import MemoryPublicationStore


def context(**overrides):
    return dict(PUBLICATION_AUTHORITY="github", GITHUB_REPOSITORY="XYBuilds/chronicle_v3_3d_galaxy", GITHUB_REF="refs/heads/main", GITHUB_REF_PROTECTED="true", GITHUB_EVENT_NAME="workflow_dispatch", **overrides)


@pytest.mark.parametrize("field,value", [
    ("PUBLICATION_AUTHORITY", ""), ("PUBLICATION_AUTHORITY", "gitlab"),
    ("GITHUB_REPOSITORY", "someone/fork"), ("GITHUB_REF", "refs/heads/candidate"),
    ("GITHUB_REF_PROTECTED", "false"), ("GITHUB_EVENT_NAME", "pull_request"),
    ("GITHUB_EVENT_NAME", "pull_request_target"), ("GITHUB_EVENT_NAME", "workflow_run"),
])
def test_untrusted_context_is_rejected(field, value):
    env = context()
    env[field] = value
    with pytest.raises(PublicationError):
        verify_github_context(env, entry_point="daily")


@pytest.mark.parametrize("kind,event,gate", [("site", "push", "P1_SITE_TRIGGER_ENABLED"), ("daily", "schedule", "P1_DAILY_SCHEDULE_ENABLED")])
def test_manual_acceptance_precedes_automatic_publication(kind, event, gate):
    env = context()
    verify_github_context(env, entry_point=kind)
    env["GITHUB_EVENT_NAME"] = event
    with pytest.raises(PublicationError, match="automatic"):
        verify_github_context(env, entry_point=kind)
    env[gate] = "true"
    assert verify_github_context(env, entry_point=kind)["event"] == event


def test_unknown_and_pr_sources_are_rejected_by_shared_admission():
    for source in ("pull_request", "pull_request_target", "unknown"):
        with pytest.raises(PublicationError):
            admit_protected_ref(dict(mode="production", ref="main", protected=True, pipeline_source=source))


def test_workflows_keep_predecessor_off_and_verify_jobs_secret_free():
    legacy = yaml.safe_load((ROOT / ".gitlab-ci.yml").read_text())
    assert legacy["workflow"]["rules"] == [{"when": "never"}]
    verify = (ROOT / ".github/workflows/verify.yml").read_text()
    assert "secrets." not in verify
    assert "pull_request_target" not in verify
    for filename, kind in (("site_release.yml", "site"), ("nightly_vote_refresh.yml", "daily")):
        config = yaml.safe_load((ROOT / ".github/workflows" / filename).read_text())
        assert config["concurrency"] == {"group": "galaxy-r2-pages-release", "cancel-in-progress": False}
        guard = config["jobs"][kind]["if"]
        for requirement in ("github.ref_protected", "refs/heads/main", "vars.PUBLICATION_AUTHORITY == 'github'", "XYBuilds/chronicle_v3_3d_galaxy"):
            assert requirement in guard
        assert any(f"scripts/publication/cli.py {kind}-release" in s.get("run", "") for s in config["jobs"][kind]["steps"])


def site(runner):
    store = MemoryPublicationStore()
    bootstrap_sequence(store, verified_identities=("2026.08.02.daily.131",))
    return run_site_release(store=store, runner=runner, request=dict(mode="production", ref="main", protected=True, pipeline_source="workflow_dispatch", source_commit="abc", selected_data_release="2026.08.02.daily.131"), clock=lambda: "2026-10-02T00:00:00.000Z")


def test_missing_registry_stops_before_build_and_deploy():
    runner = RecordingRunner(fail_on="fetch-active-registry")
    assert site(runner)["result"] == "failed"
    assert not any(c.mutates or c.name == "build-shell" for c in runner.commands)


def test_success_records_verified_identity_before_updating_active_registry():
    runner = RecordingRunner()
    assert site(runner)["result"] == "success"
    names = [c.name for c in runner.commands]
    assert names.index("production-smoke") < names.index("record-verified-artifact") < names.index("mark-active")


def test_failed_site_recomposes_previous_artifact_before_redeploy():
    runner = RecordingRunner(fail_on="production-smoke")
    assert site(runner)["result"] == "rolled-back"
    names = [c.name for c in runner.commands]
    assert names.index("restore-previous-artifact") < names.index("recompose-previous-artifact") < names.index("redeploy-previous-artifact")
    redeploy = next(c for c in runner.commands if c.name == "redeploy-previous-artifact")
    assert redeploy.cwd == "pages-rollback"


def test_failed_rollback_compose_never_redeploys_an_uncomposed_shell():
    class FailTwice(RecordingRunner):
        def __call__(self, command):
            self.fail_on = command.name if command.name in {"production-smoke", "recompose-previous-artifact"} else None
            return super().__call__(command)
    runner = FailTwice()
    assert site(runner)["result"] == "failed"
    assert not any(c.name == "redeploy-previous-artifact" for c in runner.commands)
