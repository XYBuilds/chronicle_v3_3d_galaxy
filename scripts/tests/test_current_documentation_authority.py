#!/usr/bin/env python3
"""Authority cutover contracts for the six bounded current topics (#379)."""
from __future__ import annotations

import re
import unittest
from pathlib import Path
from urllib.parse import unquote

_ROOT = Path(__file__).resolve().parents[2]

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


if __name__ == "__main__":
    unittest.main()
