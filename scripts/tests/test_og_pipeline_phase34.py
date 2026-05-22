"""P34.9: nightly/monthly must sync OG KV, not render static og-today.png."""

from __future__ import annotations

import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_NIGHTLY = _REPO_ROOT / "scripts" / "cron" / "nightly_vote_refresh.py"
_MONTHLY = _REPO_ROOT / "scripts" / "cron" / "monthly_refit.py"


class TestOgPipelinePhase34(unittest.TestCase):
    def test_nightly_uses_kv_sync_not_render_og_today(self) -> None:
        text = _NIGHTLY.read_text(encoding="utf-8")
        self.assertIn("sync_og_index_after_galaxy_export", text)
        self.assertNotIn("render_og_today_after_galaxy_export", text)
        self.assertNotIn("from cron.render_og_today", text)

    def test_monthly_uses_kv_sync_not_render_og_today(self) -> None:
        text = _MONTHLY.read_text(encoding="utf-8")
        self.assertIn("sync_og_index_after_galaxy_export", text)
        self.assertNotIn("render_og_today_after_galaxy_export", text)
        self.assertNotIn("from cron.render_og_today", text)


if __name__ == "__main__":
    unittest.main()
