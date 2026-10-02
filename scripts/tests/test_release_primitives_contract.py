"""Workflow contract: Daily/Monthly/Site Release cutover (#388)."""
from __future__ import annotations

import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_RECOVERY_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "production_recovery.yml"
_DAILY = _REPO_ROOT / ".github" / "workflows" / "nightly_vote_refresh.yml"
_MONTHLY = _REPO_ROOT / ".github" / "workflows" / "monthly_refit.yml"
_SITE = _REPO_ROOT / ".github" / "workflows" / "site_release.yml"
_PREFLIGHT = _REPO_ROOT / ".github" / "workflows" / "supabase_preflight.yml"
_DANGEROUS = (
    "force_skip_dim_check",
    "allow_profile_bootstrap",
    "force_profile_activation",
    "force_profile_reason",
    "bootstrap_og_index",
    "--allow-bootstrap",
    "--force-activation",
    "--allow-full-recovery",
)


class TestReleaseCutoverWorkflows(unittest.TestCase):
    def test_production_recovery_is_manual_and_does_not_build_the_shell(self) -> None:
        text = _RECOVERY_WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)
        self.assertNotIn("schedule:", text)
        self.assertIn("group: production-recovery-plan", text)
        self.assertNotIn("group: galaxy-r2-pages-release", text)
        self.assertIn("cancel-in-progress: false", text)
        self.assertIn("python scripts/cron/production_recovery.py", text)
        self.assertIn("--dry-run", text)
        self.assertNotIn("--no-dry-run", text)
        self.assertNotIn("npm run build", text)
        self.assertNotIn("pages deploy", text)

    def test_data_releases_preserve_the_shared_lane_and_no_frontend_build(self) -> None:
        daily = _DAILY.read_text(encoding="utf-8")
        monthly = _MONTHLY.read_text(encoding="utf-8")
        self.assertIn("scripts/publication/cli.py daily-release", daily)
        self.assertIn("vars.P1_DAILY_SCHEDULE_ENABLED == 'true'", daily)
        self.assertIn("vars.P2_MONTHLY_RELEASE_ENABLED == 'true'", monthly)
        for text in (daily, monthly):
            self.assertIn("workflow_dispatch:", text)
            self.assertIn("group: galaxy-r2-pages-release", text)
            self.assertIn("cancel-in-progress: false", text)
            self.assertNotIn("npm run build", text)
            for dangerous in _DANGEROUS:
                self.assertNotIn(dangerous, text)

    def test_site_release_delegates_shell_build_to_shared_entry_point(self) -> None:
        text = _SITE.read_text(encoding="utf-8")
        self.assertIn("scripts/publication/cli.py site-release", text)
        self.assertIn("vars.P1_SITE_TRIGGER_ENABLED == 'true'", text)
        self.assertIn("group: galaxy-r2-pages-release", text)
        self.assertIn("SITE_RELEASE_SHELL", text)
        self.assertNotIn("cloudflare/wrangler-action", text)
        for dangerous in _DANGEROUS:
            self.assertNotIn(dangerous, text)

    def test_read_only_preflight_remains_an_independent_operator_surface(self) -> None:
        text = _PREFLIGHT.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)
        self.assertIn("python scripts/cron/check_supabase_health.py", text)
        self.assertNotIn("production_recovery.py", text)
        self.assertNotIn("pages deploy", text)


if __name__ == "__main__":
    unittest.main()
