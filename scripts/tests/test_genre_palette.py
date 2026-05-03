#!/usr/bin/env python3
"""P18.0: frozen genre palette — hex compatibility + coverage assertions."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from feature_engineering.genre_palette import (  # noqa: E402
    FROZEN_GENRE_ORDER_V1,
    assert_all_genres_in_frozen_v1,
    assert_genre_labels_subset_of_frozen_v1,
    build_frozen_genre_palette_v1,
    collect_genre_labels_from_series,
)

# Shipped production palette (v1 target); must match `build_frozen_genre_palette_v1` keys+hex.
_PRODUCTION_GENRE_PALETTE: dict[str, str] = {
    "Action": "#F486AA",
    "Adventure": "#FA878B",
    "Animation": "#F88C6B",
    "Comedy": "#F0954C",
    "Crime": "#E0A034",
    "Documentary": "#CAAC2F",
    "Drama": "#AEB742",
    "Family": "#8BC05F",
    "Fantasy": "#61C780",
    "History": "#27CAA1",
    "Horror": "#00C9C1",
    "Music": "#00C5DC",
    "Mystery": "#1FBEF2",
    "Romance": "#5AB5FF",
    "Science Fiction": "#83ABFF",
    "TV Movie": "#A4A0FF",
    "Thriller": "#C097F6",
    "War": "#D78FE2",
    "Western": "#E989C8",
}


class TestFrozenGenrePalette(unittest.TestCase):
    def test_v1_hex_matches_production(self) -> None:
        pal, _, _ = build_frozen_genre_palette_v1()
        self.assertEqual(pal, _PRODUCTION_GENRE_PALETTE)
        self.assertEqual(list(pal.keys()), list(FROZEN_GENRE_ORDER_V1))

    def test_frozen_order_is_alphabetical_nineteen(self) -> None:
        self.assertEqual(len(FROZEN_GENRE_ORDER_V1), 19)
        self.assertEqual(list(FROZEN_GENRE_ORDER_V1), sorted(FROZEN_GENRE_ORDER_V1))

    def test_subset_of_genres_passes_validation(self) -> None:
        # Only two genres present — still subset of frozen vocab.
        df = pd.DataFrame({"genres": ["Drama, Comedy", "Comedy"]})
        assert_all_genres_in_frozen_v1(df["genres"])
        found = collect_genre_labels_from_series(df["genres"])
        self.assertEqual(found, {"Comedy", "Drama"})

    def test_unknown_genre_fails(self) -> None:
        df = pd.DataFrame({"genres": ["Drama", "InvalidGenreXYZ"]})
        with self.assertRaises(AssertionError):
            assert_all_genres_in_frozen_v1(df["genres"])

    def test_assert_genre_labels_subset_helper(self) -> None:
        assert_genre_labels_subset_of_frozen_v1(["Drama", "Action"])
        with self.assertRaises(AssertionError):
            assert_genre_labels_subset_of_frozen_v1(["Drama", "NotAGenre"])


if __name__ == "__main__":
    _REPO = _SCRIPTS_DIR.parent
    _PROD = _REPO / "frontend" / "public" / "data" / "galaxy_data.json"
    if _PROD.is_file():
        with open(_PROD, encoding="utf-8") as f:
            disk_palette = json.load(f)["meta"]["genre_palette"]
        built, _, _ = build_frozen_genre_palette_v1()
        assert disk_palette == built == _PRODUCTION_GENRE_PALETTE, "disk galaxy_data must match frozen v1"
    unittest.main()
