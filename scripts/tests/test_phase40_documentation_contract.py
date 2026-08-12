#!/usr/bin/env python3
"""Phase 40 documentation contracts for retired Today surfaces."""
from __future__ import annotations

import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_SUPPORTED = _ROOT / "docs/product/supported-experience.md"
_RUNTIME = _ROOT / "docs/frontend/runtime.md"
_SEARCH_HUD = _ROOT / "docs/product/search-and-hud.md"
_REFRESH = _ROOT / "docs/data/refresh-and-publication.md"
_OG_GUIDE = _ROOT / "docs/guides/P34.3 OG Index KV 上线操作指南.md"
_CONTRACT = _ROOT / "docs/system/og-index-worker-contract.md"
_R2_GUIDE = _ROOT / "docs/guides/P18.6b Cloudflare R2 上线操作手册.md"
_HISTORICAL_OG_GUIDES = (
    _ROOT / "docs/guides/P23.1 The Movie Today 验收指南.md",
    _ROOT / "docs/guides/P23.5 OG image 验收指南.md",
    _ROOT / "docs/guides/P23.6 自定义域名上线后运维清单.md",
    _ROOT / "docs/guides/P34.4 OG Worker PNG 部署说明.md",
    _ROOT / "docs/guides/P34.5 OG Worker HTML meta 部署说明.md",
    _ROOT / "docs/guides/P34.9 测试与验收回滚指南.md",
)


class TestPhase40DocumentationContracts(unittest.TestCase):
    def test_runtime_current_startup_and_og_contract(self) -> None:
        text = _RUNTIME.read_text(encoding="utf-8")
        self.assertIn("galaxy idle", text)
        self.assertIn("/movie/:id", text)
        self.assertNotIn("cover-loading-today", text)
        self.assertNotIn("uCoverMode", text)

    def test_search_hud_has_no_current_cover_or_today_controls(self) -> None:
        text = _SEARCH_HUD.read_text(encoding="utf-8")
        self.assertIn("Feedback → Support → Info → Lang → Fullscreen", text)
        self.assertNotIn("Share today", text)
        self.assertNotIn("ShareMovieTodayButton", text)
        self.assertNotIn("coverModeStore", text)
        self.assertNotIn("today.json", text)

    def test_supported_experience_keeps_retired_today_404(self) -> None:
        text = _SUPPORTED.read_text(encoding="utf-8")
        self.assertIn("/today", text)
        self.assertIn("/og/today.png", text)
        self.assertIn("404", text)
        self.assertNotIn("ordinary invalid-path", text.lower())

    def test_refresh_publication_lists_galaxy_assets_only(self) -> None:
        text = _REFRESH.read_text(encoding="utf-8")
        current = text.split("## Boundaries and invariants")[0]
        self.assertIn("galaxy_data.json.gz", current)
        self.assertIn("galaxy_search_index.json.gz", current)
        self.assertNotIn("today.json", current)
        self.assertNotIn("og-today.png", current)
        self.assertNotIn("today_url", current)

    def test_og_guide_is_v2_movie_and_meta_g_only(self) -> None:
        text = _OG_GUIDE.read_text(encoding="utf-8")
        self.assertIn("`ops/og-index/state-v2.json.gz`", text)
        self.assertIn("| `movie:{id}`", text)
        self.assertIn("| `meta:G`", text)
        self.assertIn("`schema_version: 2`", text)
        self.assertIn("`projection_version: \"og-index-v2\"`", text)
        self.assertIn("应用并 read-back movie delta → 删除 KV `today` 并 read-back 确认缺失 → 最后写入或核对 `meta:G`", text)
        self.assertIn("任一步失败都不得推进 checkpoint，也不得删除 v1", text)
        self.assertIn("scheduled v2-only 同步不触碰 `today`", text)
        self.assertNotIn("`schema: 2`", text)
        self.assertNotIn("`projection: \"og-index-v2\"`", text)
        self.assertNotIn("state-v1.json.gz 是", text)
        self.assertNotIn("影片 PUT → 影片 DELETE → 变化的 `today`", text)

    def test_historical_og_guides_are_marked_non_executable(self) -> None:
        inline_markers = {
            "P23.1 The Movie Today 验收指南.md": "历史 Today 命令：不可执行。",
            "P23.5 OG image 验收指南.md": "历史 Today 命令：不可执行。",
            "P23.6 自定义域名上线后运维清单.md": "历史 Today 命令：不可执行。",
            "P34.4 OG Worker PNG 部署说明.md": "历史 Today 命令：不可执行。",
            "P34.5 OG Worker HTML meta 部署说明.md": "历史 Today 命令：不可执行。",
            "P34.9 测试与验收回滚指南.md": "历史 Today 命令：不可执行。",
        }
        for path in _HISTORICAL_OG_GUIDES:
            text = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                self.assertIn("> **历史资料，不可按此执行。**", text[:800])
                self.assertIn(inline_markers[path.name], text)

    def test_current_cross_repository_contract_keeps_runtime_boundaries(self) -> None:
        text = _CONTRACT.read_text(encoding="utf-8")
        self.assertIn("coordinated best-effort cutover", text)
        self.assertIn("ordered completion marker", text.lower())
        self.assertIn("The Worker does not consume the R2 checkpoint", text)
        self.assertIn("`meta:G` is an ordered completion marker, not a transactional generation barrier", text)
        self.assertNotIn("On 2026-08-02", text)
        self.assertNotIn("atomic release", text.lower())

    def test_r2_guide_matches_producer_commit_order(self) -> None:
        text = _R2_GUIDE.read_text(encoding="utf-8")
        self.assertIn(
            "影片 PUT → 影片 DELETE → read-back 验证影片变化 → 写入并验证 `meta:G` → snapshot commit",
            text,
        )
        self.assertIn("退役 Today 边界", text)


if __name__ == "__main__":
    unittest.main()
