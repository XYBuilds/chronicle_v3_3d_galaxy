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

    def test_daily_and_monthly_are_data_releases_without_frontend_build(self) -> None:
        daily = _DAILY.read_text(encoding="utf-8")
        monthly = _MONTHLY.read_text(encoding="utf-8")
        self.assertIn("name: Daily Data Release", daily)
        self.assertIn("name: Monthly Data Release", monthly)
        for text in (daily, monthly):
            with self.subTest(name=text.splitlines()[0]):
                self.assertIn("workflow_dispatch:", text)
                self.assertNotIn("schedule:", text)
                self.assertIn("if: false", text)
                self.assertIn("group: galaxy-r2-pages-release", text)
                self.assertIn("cancel-in-progress: false", text)
                self.assertIn("python scripts/cron/check_supabase_health.py", text)
                self.assertIn("python scripts/cron/upload_galaxy_r2.py", text)
                self.assertIn("python scripts/cron/pages_compose.py compose", text)
                self.assertIn("python scripts/cron/production_smoke.py", text)
                self.assertIn("last-known-good", text)
                self.assertIn("pages deploy dist", text)
                self.assertNotIn("npm run build", text)
                self.assertNotIn("npm install", text)
                self.assertNotIn("node frontend/scripts/prepare-pages-deploy.mjs", text)
                for dangerous in _DANGEROUS:
                    self.assertNotIn(dangerous, text)

    def test_site_release_builds_the_shell_without_a_production_manifest(self) -> None:
        text = _SITE.read_text(encoding="utf-8")
        self.assertTrue(_SITE.is_file())
        self.assertIn("name: Site Release", text)
        self.assertIn("workflow_dispatch:", text)
        self.assertNotIn("branches: [main]", text)
        self.assertIn("if: false", text)
        self.assertIn("group: galaxy-r2-pages-release", text)
        self.assertIn("SITE_RELEASE_SHELL", text)
        self.assertIn("npm run build -w frontend", text)
        self.assertIn("python scripts/cron/pages_compose.py compose", text)
        self.assertIn("--skip-active-match", text)
        self.assertIn("python scripts/cron/site_artifact.py pack", text)
        self.assertIn("python scripts/cron/production_smoke.py", text)
        self.assertNotIn("python scripts/cron/nightly_vote_refresh.py", text)
        self.assertNotIn("python scripts/cron/monthly_refit.py", text)
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
