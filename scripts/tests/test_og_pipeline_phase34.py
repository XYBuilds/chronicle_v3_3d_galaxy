"""P38.4 workflow contract: calculation and OG-index publication stay separated."""

from __future__ import annotations

import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_NIGHTLY = _REPO_ROOT / "scripts" / "cron" / "nightly_vote_refresh.py"
_MONTHLY = _REPO_ROOT / "scripts" / "cron" / "monthly_refit.py"
_NIGHTLY_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "nightly_vote_refresh.yml"
_MONTHLY_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "monthly_refit.yml"
_SYNC_STEP = "Sync OG index KV incrementally"
_SYNC_COMMAND = "python scripts/cron/sync_og_index_kv.py --scope incremental"
_SYNC_ENV = (
    "CLOUDFLARE_ACCOUNT_ID",
    "OG_INDEX_KV_NAMESPACE_ID",
    "OG_INDEX_KV_API_TOKEN",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
)


class TestOgPipelinePhase34(unittest.TestCase):
    def test_calculation_scripts_only_export_and_validate(self) -> None:
        for script in (_NIGHTLY, _MONTHLY):
            with self.subTest(script=script.name):
                text = script.read_text(encoding="utf-8")
                self.assertNotIn("pick_movie_today", text)
                self.assertNotIn("write_today_json_after_galaxy_export", text)
                self.assertNotIn("render_og_today", text)
                self.assertNotIn("sync_og_index_kv", text)

    def test_retired_today_scripts_are_not_present(self) -> None:
        for retired_script in (
            _REPO_ROOT / "scripts" / "cron" / "pick_movie_today.py",
            _REPO_ROOT / "scripts" / "cron" / "render_og_today.py",
        ):
            with self.subTest(script=retired_script.name):
                self.assertFalse(retired_script.exists())

    def test_shared_daily_entry_point_preserves_incremental_og_order(self) -> None:
        import sys
        sys.path.insert(0, str(_REPO_ROOT / "scripts"))
        from publication.entrypoints import RecordingRunner, run_daily_release
        from publication.sequence import bootstrap_sequence
        from publication.store import MemoryPublicationStore
        store = MemoryPublicationStore()
        bootstrap_sequence(store, verified_identities=("2026.08.02.daily.131",))
        runner = RecordingRunner()
        run_daily_release(store=store, runner=runner, request={"mode": "fixture", "trigger": "manual"}, clock=lambda: "2026-10-02T00:00:00.000Z")
        names = [c.name for c in runner.commands]
        self.assertLess(names.index("light-refresh"), names.index("og-sync"))
        self.assertLess(names.index("og-sync"), names.index("immutable-r2"))
        self.assertLess(names.index("immutable-r2"), names.index("pages-deploy"))
        sync = next(c for c in runner.commands if c.name == "og-sync")
        self.assertEqual(sync.argv[-2:], ("--scope", "incremental"))
        self.assertFalse(any("build-shell" == c.name for c in runner.commands))

    def test_scheduled_contract_cannot_grant_bootstrap_or_disaster_recovery(self) -> None:
        for workflow in (_NIGHTLY_WORKFLOW, _MONTHLY_WORKFLOW):
            text = workflow.read_text(encoding="utf-8")
            for dangerous in ("--migrate-v1", "--allow-full-recovery", "--allow-over-quota", "--scope full", "allow_profile_bootstrap:", "--allow-bootstrap"):
                self.assertNotIn(dangerous, text)
            self.assertIn("group: galaxy-r2-pages-release", text)
            self.assertIn("cancel-in-progress: false", text)
            self.assertIn("if: always()", text)
            self.assertNotIn("npm run build", text)
        self.assertIn("scripts/publication/cli.py daily-release", _NIGHTLY_WORKFLOW.read_text(encoding="utf-8"))
        self.assertIn("scripts/publication/cli.py monthly-release", _MONTHLY_WORKFLOW.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
