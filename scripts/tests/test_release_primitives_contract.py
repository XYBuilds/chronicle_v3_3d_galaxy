"""Workflow contract: recovery primitives exist without cutting over publication (#387)."""
from __future__ import annotations

import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_RECOVERY_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "production_recovery.yml"
_NIGHTLY = _REPO_ROOT / ".github" / "workflows" / "nightly_vote_refresh.yml"
_MONTHLY = _REPO_ROOT / ".github" / "workflows" / "monthly_refit.yml"
_PREFLIGHT = _REPO_ROOT / ".github" / "workflows" / "supabase_preflight.yml"


class TestReleasePrimitiveWorkflows(unittest.TestCase):
    def test_production_recovery_is_manual_dry_run_and_shares_the_publication_lock(self) -> None:
        text = _RECOVERY_WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)
        self.assertNotIn("schedule:", text)
        self.assertIn("group: production-recovery-plan", text)
        self.assertNotIn("group: galaxy-r2-pages-release", text)
        self.assertIn("cancel-in-progress: false", text)
        self.assertIn("python scripts/cron/production_recovery.py", text)
        self.assertIn("--dry-run", text)
        self.assertIn("--candidate-store", text)
        self.assertNotIn("--no-dry-run", text)
        self.assertNotIn("npm run build", text)
        self.assertNotIn("pages deploy", text)

    def test_current_publication_workflows_are_not_cut_over(self) -> None:
        for workflow in (_NIGHTLY, _MONTHLY):
            with self.subTest(workflow=workflow.name):
                text = workflow.read_text(encoding="utf-8")
                self.assertIn("npm run build", text)
                self.assertIn("pages deploy", text)
                self.assertIn("python scripts/cron/upload_galaxy_r2.py", text)
                self.assertNotIn("production_recovery.py", text)
                self.assertNotIn("r2_retention.py", text)

    def test_read_only_preflight_remains_an_independent_operator_surface(self) -> None:
        text = _PREFLIGHT.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)
        self.assertIn("python scripts/cron/check_supabase_health.py", text)
        self.assertNotIn("production_recovery.py", text)


if __name__ == "__main__":
    unittest.main()
