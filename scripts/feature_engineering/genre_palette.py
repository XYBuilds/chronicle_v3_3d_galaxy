#!/usr/bin/env python3
"""Phase 18.0: frozen TMDB movie genre → OKLCH ring → sRGB hex + genre_hue (radians).

v1 **order** matches the legacy export (`sorted()` over English genre names on the full corpus)
so `meta.genre_palette` hex values stay stable. Hue index i uses ``2π·i/19`` with i in this
fixed order — **not** TMDB numeric id order (ids are documented only for traceability).

If TMDB adds an official genre: extend ``FROZEN_GENRE_ORDER_V1``, bump ``GENRE_PALETTE_VERSION``,
and re-validate downstream / visual regression.
"""
from __future__ import annotations

import math
from typing import Iterable

import numpy as np
import pandas as pd

from feature_engineering.genre_encoding import parse_genre_list

GENRE_PALETTE_VERSION = "v1"

# TMDB genre id → English name (movie list API). Used for documentation / audits only.
_TMDB_GENRE_ID_BY_NAME: dict[str, int] = {
    "Action": 28,
    "Adventure": 12,
    "Animation": 16,
    "Comedy": 35,
    "Crime": 80,
    "Documentary": 99,
    "Drama": 18,
    "Family": 10751,
    "Fantasy": 14,
    "History": 36,
    "Horror": 27,
    "Music": 10402,
    "Mystery": 9648,
    "Romance": 10749,
    "Science Fiction": 878,
    "TV Movie": 10770,
    "Thriller": 53,
    "War": 10752,
    "Western": 37,
}

assert len(_TMDB_GENRE_ID_BY_NAME) == 19, "expect 19 TMDB movie genres"

# Fixed enumeration for v1 (alphabetical English name == legacy pipeline `sorted(genres)`).
FROZEN_GENRE_ORDER_V1: tuple[str, ...] = tuple(sorted(_TMDB_GENRE_ID_BY_NAME.keys()))

assert len(FROZEN_GENRE_ORDER_V1) == 19 and len(set(FROZEN_GENRE_ORDER_V1)) == 19

_FROZEN_SET_V1: frozenset[str] = frozenset(FROZEN_GENRE_ORDER_V1)

_OKLCH_L = 0.75
_OKLCH_C = 0.14


def oklch_to_srgb_hex(L: float, C: float, h_deg: float) -> tuple[str, tuple[float, float, float]]:
    """OKLCH (L,C,H deg) → gamut-clamped sRGB hex + normalized RGB tuple (same as export_galaxy_json)."""
    h = math.radians(h_deg % 360.0)
    a_ = C * math.cos(h)
    b_ = C * math.sin(h)
    l_ = L + 0.3963377774 * a_ + 0.2158037573 * b_
    m_ = L - 0.1055613458 * a_ - 0.0638541728 * b_
    s_ = L - 0.0894841775 * a_ - 1.2914855480 * b_
    l = l_**3
    m = m_**3
    s = s_**3
    r_lin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g_lin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b_lin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def _srgb_channel(x: float) -> float:
        x = float(np.clip(x, 0.0, 1.0))
        if x <= 0.0031308:
            return 12.92 * x
        return 1.055 * (x ** (1.0 / 2.4)) - 0.055

    r8 = _srgb_channel(r_lin)
    g8 = _srgb_channel(g_lin)
    b8 = _srgb_channel(b_lin)
    r8, g8, b8 = (float(np.clip(r8, 0.0, 1.0)), float(np.clip(g8, 0.0, 1.0)), float(np.clip(b8, 0.0, 1.0)))
    hx = f"#{int(round(r8 * 255)):02X}{int(round(g8 * 255)):02X}{int(round(b8 * 255)):02X}"
    return hx, (r8, g8, b8)


def frozen_genre_hue_table() -> dict[str, float]:
    """Genre name → hue radians [0, 2π), index i = position in ``FROZEN_GENRE_ORDER_V1``."""
    _, _, hue_by_genre = build_frozen_genre_palette_v1()
    return dict(hue_by_genre)


def build_frozen_genre_palette_v1() -> tuple[
    dict[str, str],
    dict[str, tuple[float, float, float]],
    dict[str, float],
]:
    """Build hex palette, normalized RGB, and hue (rad) for all v1 genres (full 19 keys always)."""
    genre_order = list(FROZEN_GENRE_ORDER_V1)
    n = len(genre_order)
    if n == 0:
        return {}, {}, {}
    step = 360.0 / float(n)
    two_pi = 2.0 * math.pi
    palette: dict[str, str] = {}
    rgb_norm: dict[str, tuple[float, float, float]] = {}
    hue_by_genre: dict[str, float] = {}
    for i, g in enumerate(genre_order):
        h_deg = step * float(i)
        hx, rgb = oklch_to_srgb_hex(_OKLCH_L, _OKLCH_C, h_deg)
        palette[g] = hx
        rgb_norm[g] = rgb
        hue_rad = two_pi * float(i) / float(n)
        if not (0.0 <= hue_rad < two_pi):
            raise AssertionError(f"genre_hue out of [0, 2π) for {g!r}: {hue_rad!r}")
        hue_by_genre[g] = float(hue_rad)
    return palette, rgb_norm, hue_by_genre


def collect_genre_labels_from_series(genres_series: pd.Series) -> set[str]:
    """All distinct genre strings appearing in a CSV ``genres`` column."""
    found: set[str] = set()
    for cell in genres_series.astype(object):
        for g in parse_genre_list(cell):
            found.add(g)
    return found


def assert_all_genres_in_frozen_v1(genres_series: pd.Series) -> None:
    """Fail fast if any row references a genre outside ``FROZEN_GENRE_ORDER_V1``."""
    found = collect_genre_labels_from_series(genres_series)
    unknown = found - _FROZEN_SET_V1
    if unknown:
        raise AssertionError(
            "Unknown genre label(s) not in frozen palette v1: "
            f"{sorted(unknown)!r}. "
            "Extend FROZEN_GENRE_ORDER_V1 / TMDB mapping and bump GENRE_PALETTE_VERSION."
        )


def assert_genre_labels_subset_of_frozen_v1(labels: Iterable[str]) -> None:
    """Validate an iterable of genre strings (e.g. unit tests)."""
    unknown = set(labels) - _FROZEN_SET_V1
    if unknown:
        raise AssertionError(
            "Unknown genre label(s) not in frozen palette v1: "
            f"{sorted(unknown)!r}. "
            "Extend FROZEN_GENRE_ORDER_V1 / TMDB mapping and bump GENRE_PALETTE_VERSION."
        )
