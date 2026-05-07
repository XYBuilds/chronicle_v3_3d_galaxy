#!/usr/bin/env python3
"""P21.1: Unicode-friendly search normalization (mirror frontend normalizeForSearch)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from export.export_search_index import normalize_for_search_v2  # noqa: E402


class TestNormalizeForSearchV2(unittest.TestCase):
    def test_preserves_japanese(self) -> None:
        s = normalize_for_search_v2("映画 五等分の花嫁")
        self.assertIn("五等分", s)

    def test_preserves_chinese(self) -> None:
        self.assertEqual(normalize_for_search_v2("霸王别姬"), "霸王别姬")

    def test_preserves_cyrillic_casefold(self) -> None:
        self.assertEqual(normalize_for_search_v2("Москва"), "москва")

    def test_preserves_hangul(self) -> None:
        self.assertEqual(normalize_for_search_v2("기생충"), "기생충")

    def test_casefolds_german_eszett(self) -> None:
        self.assertEqual(normalize_for_search_v2("Straße"), "strasse")

    def test_strips_combining_mark_when_not_precomposed_by_nfkc(self) -> None:
        self.assertEqual(normalize_for_search_v2("q\u0307"), "q")


if __name__ == "__main__":
    unittest.main()
