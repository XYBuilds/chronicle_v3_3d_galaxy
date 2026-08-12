#!/usr/bin/env python3
"""Issue 379: six bounded current topics and authority cutover."""
from __future__ import annotations

import re
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]

_TOPICS = (
    _ROOT / "docs/product/supported-experience.md",
    _ROOT / "docs/product/galaxy-exploration.md",
    _ROOT / "docs/product/search-and-hud.md",
    _ROOT / "docs/frontend/runtime.md",
    _ROOT / "docs/data/galaxy-model.md",
    _ROOT / "docs/data/refresh-and-publication.md",
)

_LEGACY_CURRENT = (
    _ROOT / "docs/project_docs/TMDB 电影宇宙 PRD.md",
    _ROOT / "docs/project_docs/TMDB 电影宇宙 Tech Spec.md",
    _ROOT / "docs/project_docs/TMDB 电影宇宙 Design Spec.md",
    _ROOT / "docs/project_docs/星球状态机 spec.md",
    _ROOT / "docs/project_docs/TMDB 电影宇宙 Data Pipeline.md",
)

_SUPPORTING_REFS = (
    _ROOT / "docs/project_docs/TMDB 数据特征工程与 3D 映射总表.md",
    _ROOT / "docs/project_docs/视觉参数总表.md",
)

_DECISION_INDEX = _ROOT / "docs/system/decision-index.md"
_CAPABILITY_MAP = _ROOT / "docs/system/capability-map.md"
_OPENING_MARKERS = (
    "> Answers:",
    "> Excludes:",
    "> Update when:",
    "> Required authorities:",
    "## Current answer",
    "## Boundaries and invariants",
    "## Verification evidence",
)


class TestIssue379CurrentTopicsContract(unittest.TestCase):
    def test_six_topics_exist_with_opening_contract(self) -> None:
        for path in _TOPICS:
            with self.subTest(path=path.name):
                self.assertTrue(path.is_file(), f"missing topic: {path}")
                text = path.read_text(encoding="utf-8")
                for marker in _OPENING_MARKERS:
                    self.assertIn(marker, text, f"{path.name} missing {marker}")
                self.assertNotIn("---\n", text[:40], f"{path.name} must not use YAML frontmatter")
                self.assertLess(
                    len(text.splitlines()),
                    280,
                    f"{path.name} should stay a bounded topic, not an omnibus dump",
                )

    def test_decision_index_routes_through_current_topics(self) -> None:
        text = _DECISION_INDEX.read_text(encoding="utf-8")
        for path in _TOPICS:
            rel = path.relative_to(_ROOT).as_posix()
            self.assertIn(rel, text.replace("\\", "/"), f"decision-index must list {rel}")
        for legacy in (
            "TMDB 电影宇宙 PRD.md",
            "TMDB 电影宇宙 Tech Spec.md",
            "TMDB 电影宇宙 Design Spec.md",
            "星球状态机 spec.md",
            "TMDB 电影宇宙 Data Pipeline.md",
        ):
            # Legacy paths may appear only as non-authoritative pointers, not Current Chronicle SSOT owners.
            current_section = text.split("## High-value historical records")[0]
            self.assertNotIn(
                legacy,
                current_section,
                f"decision-index Current Chronicle SSOT must not own authority via {legacy}",
            )

    def test_capability_map_points_at_topic_owners(self) -> None:
        text = _CAPABILITY_MAP.read_text(encoding="utf-8")
        self.assertIn("docs/product/supported-experience.md", text)
        self.assertIn("docs/product/galaxy-exploration.md", text)
        self.assertIn("docs/product/search-and-hud.md", text)
        self.assertIn("docs/data/galaxy-model.md", text)
        self.assertIn("docs/data/refresh-and-publication.md", text)
        self.assertIn("docs/frontend/runtime.md", text)

    def test_legacy_current_docs_are_thin_one_hop_pointers(self) -> None:
        topic_link_needles = (
            "product/supported-experience.md",
            "product/galaxy-exploration.md",
            "product/search-and-hud.md",
            "frontend/runtime.md",
            "data/galaxy-model.md",
            "data/refresh-and-publication.md",
        )
        for path in _LEGACY_CURRENT:
            with self.subTest(path=path.name):
                text = path.read_text(encoding="utf-8")
                self.assertLessEqual(
                    len(text.splitlines()),
                    40,
                    f"{path.name} must be a thin pointer after authority cutover",
                )
                self.assertRegex(
                    text,
                    re.compile(r"no longer (the|an) authoritat", re.I),
                    f"{path.name} must declare non-authoritative status",
                )
                self.assertTrue(
                    any(needle in text.replace("\\", "/") for needle in topic_link_needles),
                    f"{path.name} must one-hop to at least one current topic",
                )

    def test_supporting_quick_refs_remain_non_ssot(self) -> None:
        for path in _SUPPORTING_REFS:
            text = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                lowered = text[:1200].lower()
                self.assertTrue(
                    "supporting" in lowered or "不再作为" in text[:800] or "不作为" in text[:800],
                    f"{path.name} must remain a supporting reference, not SSOT",
                )

    def test_phase40_current_claims_live_in_topics(self) -> None:
        experience = (_ROOT / "docs/product/supported-experience.md").read_text(encoding="utf-8")
        runtime = (_ROOT / "docs/frontend/runtime.md").read_text(encoding="utf-8")
        search = (_ROOT / "docs/product/search-and-hud.md").read_text(encoding="utf-8")
        refresh = (_ROOT / "docs/data/refresh-and-publication.md").read_text(encoding="utf-8")

        self.assertIn("galaxy idle", experience.lower())
        self.assertIn("/movie/", experience)
        self.assertIn("/today", experience)
        self.assertIn("404", experience)

        self.assertIn("galaxy idle", runtime.lower())
        self.assertIn("/movie/", runtime)
        self.assertNotIn("cover-loading-today", runtime)
        self.assertNotIn("uCoverMode", runtime)

        self.assertIn("Feedback → Support → Info → Lang → Fullscreen", search)

        self.assertIn("galaxy_data.json.gz", refresh)
        self.assertIn("galaxy_search_index.json.gz", refresh)
        self.assertNotIn("today.json", refresh.lower().split("## Related topics")[0])

    def test_refresh_topic_does_not_claim_accepted_future_release_model_live(self) -> None:
        text = (_ROOT / "docs/data/refresh-and-publication.md").read_text(encoding="utf-8")
        body = text.split("## Related topics")[0]
        # Accepted #374 terms may appear only as not-yet-live / future / accepted-but-not-implemented.
        for forbidden_as_current in (
            "Daily Data Release publishes",
            "Site Release produces a verified, immutable site artifact",
            "Data Release is not published until the production Pages manifest",
        ):
            self.assertNotIn(forbidden_as_current, body)
        self.assertTrue(
            "not yet live" in body.lower()
            or "not currently live" in body.lower()
            or "accepted but not yet" in body.lower()
            or "accepted future" in body.lower(),
            "refresh topic must mark the accepted #374 release model as not yet live",
        )


if __name__ == "__main__":
    unittest.main()
