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

    def test_workflows_use_the_same_fail_closed_incremental_sync_before_r2_upload(self) -> None:
        for workflow in (_NIGHTLY_WORKFLOW, _MONTHLY_WORKFLOW):
            with self.subTest(workflow=workflow.name):
                text = workflow.read_text(encoding="utf-8")
                self.assertEqual(text.count(f"name: {_SYNC_STEP}"), 1)
                sync_start = text.index(f"name: {_SYNC_STEP}")
                sync_end = text.index("      # P18.6b:", sync_start)
                sync_block = text[sync_start:sync_end]
                compute_block = text[:sync_start]
                self.assertNotIn("bootstrap_og_index:", text)
                self.assertNotIn("bootstrap-remote-audit", text)
                self.assertIn(_SYNC_COMMAND, sync_block)
                self.assertNotIn("--migrate-v1", sync_block)
                self.assertNotIn("--scope full", sync_block)
                self.assertNotIn("--scope daily", sync_block)
                self.assertNotIn("today.json", text)
                self.assertNotIn("today_url", text)
                self.assertIn("set -euo pipefail", sync_block)
                self.assertNotIn("exit 0", sync_block)
                self.assertNotIn("skip", sync_block.lower())
                for name in _SYNC_ENV:
                    self.assertIn(f"{name}:", sync_block)
                self.assertNotIn("OG_INDEX_KV_", compute_block)
                self.assertNotIn("CLOUDFLARE_ACCOUNT_ID", compute_block)
                self.assertLess(sync_start, text.index("python scripts/cron/upload_galaxy_r2.py"))
                self.assertLess(sync_start, text.index("R2_GALAXY_PRUNE_AFTER_UPLOAD"))

    def test_scheduled_contract_cannot_grant_bootstrap_or_disaster_recovery(self) -> None:
        for workflow in (_NIGHTLY_WORKFLOW, _MONTHLY_WORKFLOW):
            with self.subTest(workflow=workflow.name):
                text = workflow.read_text(encoding="utf-8")
                sync_start = text.index(f"name: {_SYNC_STEP}")
                sync_end = text.index("      # P18.6b:", sync_start)
                sync_block = text[sync_start:sync_end]
                self.assertNotIn("workflow_dispatch", sync_block)
                self.assertNotIn("--migrate-v1", sync_block)
                self.assertNotIn("--allow-full-recovery", sync_block)
                self.assertNotIn("--allow-over-quota", sync_block)
                self.assertNotIn("--scope full", sync_block)


if __name__ == "__main__":
    unittest.main()
