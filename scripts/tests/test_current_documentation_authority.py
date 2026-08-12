#!/usr/bin/env python3
"""Authority cutover contracts for current topics (#379), entry-point cutover (#380), and legacy-script retirement (#385)."""
from __future__ import annotations

import re
import unittest
from pathlib import Path
from urllib.parse import unquote

_ROOT = Path(__file__).resolve().parents[2]

_README = _ROOT / "README.md"
_README_ZH = _ROOT / "README.zh-CN.md"
_README_EN_COMPAT = _ROOT / "README.en.md"
_AGENTS = _ROOT / "AGENTS.md"
_DOMAIN = _ROOT / "docs/agents/domain.md"
_FONTS_README = _ROOT / "assets/fonts/README.md"
_NOTICE = _ROOT / "NOTICE"
_CURSOR_RULES = _ROOT / ".cursor/rules"
_DELETED_RULES = (
    _CURSOR_RULES / "ai-workflow.mdc",
    _CURSOR_RULES / "workflow-adapter.mdc",
)
_DELETED_TEMP_DRAFTS = (
    _ROOT / "docs/temp/电影宇宙「每日星轨观测」系统 PRD.md",
    _ROOT / "docs/temp/项目架构全景.md",
)
_INTER_ASSETS = (
    _ROOT / "assets/fonts/Inter.ttf",
    _ROOT / "assets/fonts/Inter-OFL.txt",
)
_CURSOR_TODO_GUIDE = _ROOT / "docs/guides/Cursor Agent TODO 工作流指南.md"

_TOPICS = (
    _ROOT / "docs/product/supported-experience.md",
    _ROOT / "docs/product/galaxy-exploration.md",
    _ROOT / "docs/product/search-and-hud.md",
    _ROOT / "docs/frontend/runtime.md",
    _ROOT / "docs/data/galaxy-model.md",
    _ROOT / "docs/data/refresh-and-publication.md",
)

_LEGACY_POINTERS = (
    _ROOT / "docs/project_docs/TMDB 电影宇宙 PRD.md",
    _ROOT / "docs/project_docs/TMDB 电影宇宙 Tech Spec.md",
    _ROOT / "docs/project_docs/TMDB 电影宇宙 Design Spec.md",
    _ROOT / "docs/project_docs/星球状态机 spec.md",
    _ROOT / "docs/project_docs/TMDB 电影宇宙 Data Pipeline.md",
)

_DECISION_INDEX = _ROOT / "docs/system/decision-index.md"
_CAPABILITY_MAP = _ROOT / "docs/system/capability-map.md"
_CONTRACT_INDEX = _ROOT / "docs/system/contract-index.md"
_SUPPORTED = _ROOT / "docs/product/supported-experience.md"
_EXPLORATION = _ROOT / "docs/product/galaxy-exploration.md"
_SEARCH_HUD = _ROOT / "docs/product/search-and-hud.md"
_RUNTIME = _ROOT / "docs/frontend/runtime.md"
_GALAXY_MODEL = _ROOT / "docs/data/galaxy-model.md"
_REFRESH = _ROOT / "docs/data/refresh-and-publication.md"
_DESIGN = _ROOT / "docs/project_docs/TMDB 电影宇宙 Design Spec.md"
_TECH = _ROOT / "docs/project_docs/TMDB 电影宇宙 Tech Spec.md"
_DATA_PIPELINE = _ROOT / "docs/project_docs/TMDB 电影宇宙 Data Pipeline.md"

_OPENING_MARKERS = (
    "> Answers:",
    "> Excludes:",
    "> Update when:",
    "> Required authorities:",
    "## Current answer",
    "## Boundaries and invariants",
    "## Verification evidence",
)

_POINTER_MARKERS = (
    "non-authoritative",
    "one-hop pointer",
)


class TestCurrentDocumentationAuthority(unittest.TestCase):
    def test_six_topics_exist_with_opening_contract(self) -> None:
        for path in _TOPICS:
            with self.subTest(path=path.name):
                self.assertTrue(path.is_file(), f"missing topic: {path}")
                text = path.read_text(encoding="utf-8")
                for marker in _OPENING_MARKERS:
                    self.assertIn(marker, text, f"{path.name} missing {marker}")
                self.assertFalse(
                    text.lstrip().startswith("---"),
                    "topics must not use YAML/frontmatter fences",
                )

    def test_decision_index_routes_through_six_topics(self) -> None:
        text = _DECISION_INDEX.read_text(encoding="utf-8")
        for rel in (
            "docs/product/supported-experience.md",
            "docs/product/galaxy-exploration.md",
            "docs/product/search-and-hud.md",
            "docs/frontend/runtime.md",
            "docs/data/galaxy-model.md",
            "docs/data/refresh-and-publication.md",
        ):
            self.assertIn(rel, text)
        self.assertNotIn("Current Chronicle SSOT", text)
        self.assertIn("supporting reference", text.lower())
        # Legacy omnibus paths may appear only as historical/pointer notes, not as current owners.
        current_section = text.split("## High-value historical records")[0]
        for legacy_name in (
            "TMDB 电影宇宙 PRD.md",
            "TMDB 电影宇宙 Tech Spec.md",
            "TMDB 电影宇宙 Design Spec.md",
            "星球状态机 spec.md",
            "TMDB 电影宇宙 Data Pipeline.md",
        ):
            self.assertNotIn(
                legacy_name,
                current_section,
                f"decision-index still treats {legacy_name} as a current owner",
            )

    def test_capability_map_points_at_topic_owners(self) -> None:
        text = _CAPABILITY_MAP.read_text(encoding="utf-8")
        self.assertIn("docs/product/galaxy-exploration.md", text)
        self.assertIn("docs/product/search-and-hud.md", text)
        self.assertIn("docs/data/galaxy-model.md", text)
        self.assertIn("docs/data/refresh-and-publication.md", text)
        self.assertNotIn("docs/project_docs/TMDB 电影宇宙 PRD.md", text)
        self.assertNotIn("docs/project_docs/TMDB 电影宇宙 Data Pipeline.md", text)
        # Product/data rows name exactly one docs/{product|frontend|data}/ topic in the SoT column.
        topic_link = re.compile(r"docs/(?:product|frontend|data)/[a-z0-9\-]+\.md")
        in_tables = False
        for line in text.splitlines():
            if line.startswith("## Product capabilities") or line.startswith(
                "## Data and production capabilities"
            ):
                in_tables = True
                continue
            if line.startswith("## ") and in_tables:
                in_tables = False
            if not in_tables or not line.startswith("|"):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) < 4:
                continue
            if cells[0] in {"Capability", "---"} or cells[0].startswith("---"):
                continue
            sot = cells[3]
            # Skip non-Chronicle topic rows / contract-owned rows.
            if "Daily `" in sot or "og-index-worker-contract" in sot or "planet-export-contract" in sot:
                continue
            if "Daily Stargazing" in cells[2]:
                continue
            owners = topic_link.findall(sot)
            with self.subTest(capability=cells[0]):
                self.assertEqual(
                    len(owners),
                    1,
                    f"expected exactly one current topic owner in SoT, found {owners}: {sot}",
                )

    def test_legacy_paths_are_thin_non_authoritative_pointers(self) -> None:
        for path in _LEGACY_POINTERS:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                line_count = len(text.splitlines())
                self.assertLessEqual(line_count, 40, f"{path.name} is not a thin pointer ({line_count} lines)")
                lowered = text.lower()
                self.assertTrue(
                    any(marker in lowered for marker in _POINTER_MARKERS),
                    f"{path.name} missing thin-pointer language",
                )
                self.assertRegex(
                    text,
                    r"docs/(product|frontend|data)/[a-z0-9\-]+\.md",
                    f"{path.name} must hop to a current topic",
                )

    def test_phase40_current_claims_live_in_owning_topics(self) -> None:
        runtime = _RUNTIME.read_text(encoding="utf-8")
        self.assertIn("galaxy idle", runtime)
        self.assertIn("/movie/:id", runtime)

        search = _SEARCH_HUD.read_text(encoding="utf-8")
        self.assertIn("Feedback", search)
        self.assertIn("Support", search)
        self.assertIn("Info", search)

        supported = _SUPPORTED.read_text(encoding="utf-8")
        self.assertIn("/today", supported)
        self.assertIn("404", supported)
        self.assertIn("/og/today.png", supported)

        refresh = _REFRESH.read_text(encoding="utf-8")
        self.assertIn("galaxy_data.json.gz", refresh)
        self.assertIn("galaxy_search_index.json.gz", refresh)
        self.assertNotIn("today.json", refresh.split("## Boundaries")[0])

        # Legacy Design Spec is a pointer; current HUD claim must not remain only there.
        design = _DESIGN.read_text(encoding="utf-8")
        self.assertNotIn("### **3.5 首屏 Loading 与 galaxy idle（Phase 40）**", design)

        tech = _TECH.read_text(encoding="utf-8")
        self.assertNotIn("直接将 `/` 挂载为无选中状态的 **galaxy idle**", tech)

        pipeline = _DATA_PIPELINE.read_text(encoding="utf-8")
        self.assertNotIn("### 12.1", pipeline)

    def test_refresh_topic_does_not_claim_unshipped_release_model(self) -> None:
        text = _REFRESH.read_text(encoding="utf-8")
        current = text.split("## Boundaries and invariants")[0]
        forbidden = (
            "Site Release",
            "Data Release",
            "Production Recovery",
            "ordinary invalid-path",
            "ordinary-invalid-path",
        )
        for phrase in forbidden:
            self.assertNotIn(
                phrase,
                current,
                f"refresh topic claims not-yet-live behavior: {phrase}",
            )
        self.assertIn("nightly", current.lower())
        self.assertIn("monthly", current.lower())
        self.assertIn("Cloudflare Pages", current)

    def test_contract_index_evidence_does_not_treat_legacy_omnibus_as_ssot(self) -> None:
        text = _CONTRACT_INDEX.read_text(encoding="utf-8")
        self.assertNotIn("Chronicle Tech Spec, current README", text)
        self.assertIn("docs/product/", text)
        self.assertIn("docs/frontend/runtime.md", text)

    def test_repository_local_markdown_links_in_authority_surface_resolve(self) -> None:
        targets = [
            _DECISION_INDEX,
            _CAPABILITY_MAP,
            _CONTRACT_INDEX,
            *_TOPICS,
            *_LEGACY_POINTERS,
            _README,
            _README_ZH,
            _README_EN_COMPAT,
            _AGENTS,
            _DOMAIN,
            _FONTS_README,
        ]
        link_re = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
        for path in targets:
            text = path.read_text(encoding="utf-8")
            for match in link_re.finditer(text):
                raw = match.group(1).strip()
                if raw.startswith(("http://", "https://", "mailto:", "#")):
                    continue
                href = raw.split("#", 1)[0].split("?", 1)[0]
                if not href or href.endswith("/"):
                    continue
                resolved = (path.parent / unquote(href)).resolve()
                with self.subTest(source=path.name, href=raw):
                    self.assertTrue(
                        resolved.is_file(),
                        f"broken link in {path.relative_to(_ROOT)}: {raw} -> {resolved}",
                    )

    def test_readme_language_entry_roles_are_canonical(self) -> None:
        readme = _README.read_text(encoding="utf-8")
        zh = _README_ZH.read_text(encoding="utf-8")
        en_compat = _README_EN_COMPAT.read_text(encoding="utf-8")

        self.assertIn("README.zh-CN.md", readme)
        self.assertIn("themoviecosmos.com", readme)
        self.assertIn("docs/system/decision-index.md", readme)
        self.assertNotIn("implementation SSOT", readme)
        self.assertNotIn("Inter.ttf", readme)
        self.assertNotIn("Inter-OFL.txt", readme)

        self.assertIn("README.md", zh)
        self.assertIn("docs/system/decision-index.md", zh)
        self.assertNotIn("实现 SSOT", zh)
        self.assertNotIn("Inter.ttf", zh)

        self.assertLessEqual(len(en_compat.splitlines()), 40)
        self.assertIn("README.md", en_compat)
        self.assertIn("compatibility", en_compat.lower())
        self.assertIn("removal", en_compat.lower())
        self.assertNotIn("## Concept", en_compat)
        self.assertNotIn("## 概念", en_compat)

    def test_deleted_rules_and_temp_drafts_are_gone(self) -> None:
        for path in (*_DELETED_RULES, *_DELETED_TEMP_DRAFTS, *_INTER_ASSETS):
            with self.subTest(path=path.name):
                self.assertFalse(path.exists(), f"expected deleted: {path}")

    def test_agents_and_domain_are_tool_neutral_after_adapter_removal(self) -> None:
        agents = _AGENTS.read_text(encoding="utf-8")
        domain = _DOMAIN.read_text(encoding="utf-8")
        self.assertNotIn("workflow-adapter.mdc", agents)
        self.assertNotIn("planner", agents.lower())
        self.assertNotIn("implementer host", agents.lower())
        self.assertIn("human", agents.lower())
        self.assertIn("decision-index.md", agents)
        self.assertIn("Cursor rules", domain)
        self.assertIn("not", domain.lower())
        self.assertRegex(
            domain,
            r"(?i)product authority|cross-tool|not .*authorit",
        )

    def test_fonts_inventory_is_butler_only(self) -> None:
        fonts = _FONTS_README.read_text(encoding="utf-8")
        notice = _NOTICE.read_text(encoding="utf-8")
        self.assertIn("Butler-Medium.ttf", fonts)
        self.assertIn("Butler-Bold.ttf", fonts)
        self.assertIn("frontend/public/fonts/butler", fonts)
        # Inventory table must not claim Inter as a current bundled file.
        inventory = fonts.split("## ")[0]
        self.assertNotIn("Inter.ttf", inventory)
        self.assertNotIn("Inter-OFL", inventory)
        self.assertNotIn("Inter.ttf", notice)
        self.assertNotIn("Inter-OFL", notice)
        self.assertTrue((_ROOT / "assets/fonts/Butler-Medium.ttf").is_file())
        self.assertTrue((_ROOT / "assets/fonts/Butler-Bold.ttf").is_file())

    def test_finish_todo_script_is_retained(self) -> None:
        self.assertTrue((_ROOT / "finish_todo.sh").is_file())

    def test_cursor_todo_guide_is_historical_non_executable(self) -> None:
        text = _CURSOR_TODO_GUIDE.read_text(encoding="utf-8")
        lowered = text.lower()
        self.assertTrue(
            "historical" in lowered or "历史" in text,
            "Cursor TODO guide must be marked historical",
        )
        self.assertTrue(
            "non-executable" in lowered
            or "不可按此执行" in text
            or "do not follow" in lowered
            or "tombstone" in lowered,
            "Cursor TODO guide must be non-executable",
        )


_ARCHIVE_SCRIPTS = (
    "scripts/_archive/merge_by_tconst.py",
    "scripts/_archive/filter_vote_count_zero_or_null.py",
    "scripts/_archive/filter_vote_average_zero_or_null.py",
    "scripts/_archive/filter_release_date_null.py",
    "scripts/_archive/filter_genres_null.py",
    "scripts/_archive/filter_dynamic_baseline_vote_count.py",
)

_RETIRED_P18_BENCHMARK_FILES = (
    ".github/workflows/phase18_refit_benchmark.yml",
    "scripts/experiments/phase18_core_refit_benchmark.py",
    "scripts/experiments/p18_pack_canonical_bundle_for_gha.py",
)

_RETIRED_ARCHIVE_BASENAMES = (
    "merge_by_tconst",
    "filter_vote_count_zero_or_null",
    "filter_vote_average_zero_or_null",
    "filter_release_date_null",
    "filter_genres_null",
    "filter_dynamic_baseline_vote_count",
)

_RETAINED_OPERATOR_SURFACES = (
    ".github/workflows/supabase_preflight.yml",
    ".github/workflows/production_recovery.yml",
    "scripts/cron/check_supabase_health.py",
    "scripts/cron/production_recovery.py",
    "scripts/cron/release_state.py",
    "scripts/cron/site_artifact.py",
    "scripts/cron/r2_retention.py",
    "scripts/verify_galaxy_3d.html",
    "finish_todo.sh",
)

_RETAINED_EXPERIMENTS = (
    "scripts/experiments/phase18_canonical_full_rebuild.py",
    "scripts/experiments/phase18_pkl_anatomy.py",
    "scripts/experiments/phase18_daily_delta_scan.py",
    "scripts/experiments/min_dist_sweep.py",
)

_P18_1_REPORT = (
    _ROOT / "docs/reports/Phase 18.1 P18.1 Canonical full rebuild 与 GHA core benchmark 实施报告.md"
)
_P18_5_GUIDE = _ROOT / "docs/guides/P18.5 月度星系 refit 操作指南.md"
_CLEANING = _ROOT / "scripts/pipeline/cleaning.py"
_REMAINING_WORKFLOWS = (
    "monthly_refit.yml",
    "nightly_vote_refresh.yml",
    "supabase_preflight.yml",
)


class TestLegacyScriptAndP18BenchmarkRetirement(unittest.TestCase):
    def test_live_threshold_authority_does_not_cite_archive_script(self) -> None:
        live_paths = (*_TOPICS, _CLEANING, _README, _README_ZH)
        for path in live_paths:
            text = path.read_text(encoding="utf-8")
            with self.subTest(path=path.relative_to(_ROOT).as_posix()):
                for name in _RETIRED_ARCHIVE_BASENAMES:
                    self.assertNotIn(
                        name,
                        text,
                        f"live authority still cites retired archive name {name}",
                    )

    def test_galaxy_model_owns_dynamic_threshold_formula(self) -> None:
        current = _GALAXY_MODEL.read_text(encoding="utf-8").split("## Boundaries and invariants")[0]
        self.assertIn("0.95", current)
        self.assertIn("0.15", current)
        self.assertRegex(current, r"6[-\s]?year|rolling.{0,20}6|window.{0,10}6")
        self.assertIn("scripts/pipeline/", current)
        self.assertIn("cleaning.py", current)

    def test_cleaning_module_states_authoritative_threshold_rule(self) -> None:
        text = _CLEANING.read_text(encoding="utf-8")
        self.assertIn("threshold = max(ABS_MIN, ALPHA * smoothed_baseline)", text)
        self.assertIn("QUANTILE", text)
        self.assertIn("ROLLING_WINDOW", text)
        self.assertNotIn("scripts/_archive/", text)

    def test_retired_archive_and_p18_benchmark_files_are_gone(self) -> None:
        for rel in (*_ARCHIVE_SCRIPTS, *_RETIRED_P18_BENCHMARK_FILES):
            with self.subTest(path=rel):
                self.assertFalse((_ROOT / rel).exists(), f"expected deleted: {rel}")

    def test_manual_operator_surfaces_are_retained(self) -> None:
        for rel in (*_RETAINED_OPERATOR_SURFACES, *_RETAINED_EXPERIMENTS):
            with self.subTest(path=rel):
                self.assertTrue((_ROOT / rel).is_file(), f"expected retained: {rel}")
        self.assertTrue((_ROOT / "scripts/env").is_dir())
        self.assertTrue(any((_ROOT / "scripts/env").iterdir()))

    def test_phase18_benchmark_conclusions_remain_reachable(self) -> None:
        self.assertTrue(_P18_1_REPORT.is_file())
        text = _P18_1_REPORT.read_text(encoding="utf-8")
        self.assertIn("P18.1b", text)
        self.assertIn("ubuntu-24.04", text)
        self.assertIn("p18-canonical-artifacts-v1", text)

    def test_p18_5_guide_does_not_offer_removed_benchmark_workflow(self) -> None:
        text = _P18_5_GUIDE.read_text(encoding="utf-8")
        self.assertNotIn("用于对照月度算力与内存", text)
        self.assertIn("phase18_refit_benchmark.yml", text)
        self.assertTrue("已移除" in text or "removed" in text.lower())

    def test_remaining_workflows_omit_retired_five_file_cache(self) -> None:
        workflow_dir = _ROOT / ".github/workflows"
        names = sorted(path.name for path in workflow_dir.glob("*.yml"))
        for required in _REMAINING_WORKFLOWS:
            self.assertIn(required, names)
        self.assertNotIn("phase18_refit_benchmark.yml", names)
        for name in names:
            text = (workflow_dir / name).read_text(encoding="utf-8")
            with self.subTest(workflow=name):
                self.assertRegex(text, r"(?m)^name:")
                self.assertRegex(text, r"(?m)^on:")
                self.assertNotIn("p18-canonical-artifacts-v1", text)
                self.assertNotIn("phase18_core_refit_benchmark", text)
                self.assertNotIn("p18_pack_canonical_bundle", text)

    def test_readme_tree_does_not_list_archive_directory(self) -> None:
        for path in (_README, _README_ZH):
            text = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                self.assertNotIn("_archive/", text)


if __name__ == "__main__":
    unittest.main()
