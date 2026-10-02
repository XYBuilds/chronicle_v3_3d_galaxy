"""A recovery replay must honor its remaining Free KV allowance before writing."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from publication.commands import og_sync_command
from publication.entrypoints import RecordingRunner, run_daily_release, run_monthly_release
from publication.errors import PublicationError
from publication.sequence import bootstrap_sequence
from publication.store import MemoryPublicationStore
from cron.og_index_state import build_snapshot
from cron.sync_og_index_kv import build_incremental_plan, enforce_quota, QuotaExceededError

NOW = "2026-10-03T00:05:00Z"


@pytest.fixture(autouse=True)
def clean_budget(monkeypatch):
    monkeypatch.delenv("OG_INDEX_PUT_BUDGET", raising=False)
    monkeypatch.delenv("OG_INDEX_PUT_BUDGET_DATE", raising=False)


@pytest.mark.parametrize("release", [run_daily_release, run_monthly_release])
@pytest.mark.parametrize("limit", [0, 5, 900])
def test_entry_passes_and_records_lower_cap(release, limit, monkeypatch):
    monkeypatch.setenv("OG_INDEX_PUT_BUDGET", str(limit))
    monkeypatch.setenv("OG_INDEX_PUT_BUDGET_DATE", "2026-10-03")
    store = MemoryPublicationStore()
    bootstrap_sequence(store, verified_identities=["2026.10.02.daily.147"])
    runner = RecordingRunner()
    result = release(store=store, runner=runner, clock=lambda: NOW,
                     request={"mode": "fixture", "ref": "main", "protected": True,
                              "pipeline_source": "web", "trigger": "manual",
                              "actor": "XYBuilds", "source_commit": "test", "requested_at": NOW,
                              "bundle_sha256": "a" * 64})
    argv = next(c.argv for c in runner.commands if c.name == "og-sync")
    assert argv[-2:] == ("--max-puts", str(limit))
    assert result["inputs"]["og_max_puts"] == limit


@pytest.mark.parametrize("day", ["2026-10-02", "2026-10-04"])
def test_override_applies_only_to_its_utc_date(day, monkeypatch):
    monkeypatch.setenv("OG_INDEX_PUT_BUDGET", "5")
    monkeypatch.setenv("OG_INDEX_PUT_BUDGET_DATE", day)
    assert og_sync_command(started_at=NOW)[-1] == "900"


def test_default_explicitly_blocks_larger_legacy_environment_budget(monkeypatch):
    monkeypatch.setenv("OG_INDEX_MAX_PUTS", "100000")
    assert og_sync_command(started_at=NOW)[-2:] == ("--max-puts", "900")


@pytest.mark.parametrize("limit,day", [("901", "2026-10-03"), ("-1", "2026-10-03"),
                                      ("", "2026-10-03"), ("5", ""), ("five", "2026-10-03"),
                                      ("5", "20261003"), ("5", "2026-02-30")])
@pytest.mark.parametrize("release", [run_daily_release, run_monthly_release])
def test_bad_override_stops_before_sequence_or_database_work(limit, day, release, monkeypatch):
    monkeypatch.setenv("OG_INDEX_PUT_BUDGET", limit)
    monkeypatch.setenv("OG_INDEX_PUT_BUDGET_DATE", day)
    store = MemoryPublicationStore()
    runner = RecordingRunner()
    with pytest.raises(PublicationError, match="OG put budget"):
        release(store=store, runner=runner, request={}, clock=lambda: NOW)
    assert not runner.commands and not store.objects


def test_real_delta_counts_completion_marker_and_zero_allows_noop():
    old_movies = [{"id": 1, "title": "Old", "genres": []}]
    movies = old_movies + [{"id": 2, "title": "Added", "genres": []}]
    old = build_snapshot(source_data_version="old", committed_at=NOW, movies=old_movies)
    new = build_snapshot(source_data_version="new", committed_at=NOW, movies=movies)
    plan = build_incremental_plan(old, new, movies)
    assert plan.total_put == 2  # one movie plus meta:G
    with pytest.raises(QuotaExceededError):
        enforce_quota(plan, max_puts=1)
    enforce_quota(plan, max_puts=2)
    noop = build_incremental_plan(old, old, old_movies)
    enforce_quota(noop, max_puts=0)


@pytest.mark.parametrize("workflow,job", [("nightly_vote_refresh.yml", "daily"), ("monthly_refit.yml", "monthly")])
def test_hosted_adapters_forward_both_budget_variables(workflow, job):
    import yaml
    root = Path(__file__).resolve().parents[2]
    data = yaml.safe_load((root / ".github/workflows" / workflow).read_text(encoding="utf-8"))
    env = data["jobs"][job]["env"]
    for variable in ("OG_INDEX_PUT_BUDGET", "OG_INDEX_PUT_BUDGET_DATE"):
        assert env[variable] == "${{ vars." + variable + " }}"
