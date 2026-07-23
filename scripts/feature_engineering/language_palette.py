#!/usr/bin/env python3
"""Frozen ``original_language`` palettes and the active vocabulary contract.

v1 **order** matches ``collect_sorted_languages()`` on the Phase 18 canonical
``data/output/cleaned.csv`` used to seed production embeddings. One-hot column
index i follows the matching frozen tuple.

Keep historical palettes immutable. ``FROZEN_LANG_ORDER`` and
``FROZEN_LANG_CODES`` are the only runtime vocabulary imports; changing the
active version requires rebuilding the complete canonical embedding bundle.
"""
from __future__ import annotations

import pandas as pd

from feature_engineering.language_encoding import normalize_language_code

LANG_PALETTE_VERSION = "v1"

# Frozen ISO / sentinel codes from canonical cleaned.csv (sorted); regenerate via
# ``scripts/tools/freeze_language_vocab_v1.py`` after corpus vocabulary changes.
FROZEN_LANG_ORDER_V1: tuple[str, ...] = (
    "af",
    "am",
    "ar",
    "ay",
    "az",
    "bg",
    "bm",
    "bn",
    "bo",
    "bs",
    "ca",
    "cn",
    "cs",
    "cy",
    "da",
    "de",
    "dz",
    "el",
    "en",
    "eo",
    "es",
    "et",
    "eu",
    "fa",
    "ff",
    "fi",
    "fj",
    "fr",
    "ga",
    "gl",
    "gu",
    "he",
    "hi",
    "hr",
    "ht",
    "hu",
    "hy",
    "id",
    "ig",
    "is",
    "it",
    "iu",
    "ja",
    "ka",
    "kk",
    "kl",
    "km",
    "kn",
    "ko",
    "ku",
    "la",
    "lb",
    "lg",
    "ln",
    "lo",
    "lt",
    "lv",
    "mi",
    "mk",
    "ml",
    "mn",
    "mo",
    "mr",
    "ms",
    "mt",
    "nl",
    "no",
    "os",
    "pa",
    "pl",
    "ps",
    "pt",
    "qu",
    "ro",
    "ru",
    "rw",
    "sc",
    "se",
    "sh",
    "sk",
    "sl",
    "sq",
    "sr",
    "st",
    "sv",
    "sw",
    "ta",
    "te",
    "th",
    "tl",
    "tn",
    "tr",
    "tt",
    "uk",
    "ur",
    "vi",
    "wo",
    "xh",
    "xx",
    "yi",
    "yo",
    "zh",
    "zu",
)

assert len(FROZEN_LANG_ORDER_V1) == len(set(FROZEN_LANG_ORDER_V1)), "duplicate language code in FROZEN_LANG_ORDER_V1"

FROZEN_LANG_CODES_V1: frozenset[str] = frozenset(FROZEN_LANG_ORDER_V1)

# v2 admits the only code observed in the 2026-07-16 final membership audit.
# The tuple is derived once from immutable v1 plus ``rm`` so its one-hot column
# order remains lexical and deterministic; v1 itself stays available for audit.
FROZEN_LANG_ORDER_V2: tuple[str, ...] = tuple(sorted((*FROZEN_LANG_ORDER_V1, "rm")))
FROZEN_LANG_CODES_V2: frozenset[str] = frozenset(FROZEN_LANG_ORDER_V2)
assert len(FROZEN_LANG_ORDER_V2) == len(FROZEN_LANG_CODES_V2), "duplicate language code in FROZEN_LANG_ORDER_V2"

# v3 admits Abkhazian after TMDB movie 1057001 first crossed the frozen final-
# membership threshold on 2026-07-22. Existing v2 vectors migrate exactly by
# inserting a zero-valued ``ab`` column; historical palettes remain immutable.
FROZEN_LANG_ORDER_V3: tuple[str, ...] = tuple(sorted((*FROZEN_LANG_ORDER_V2, "ab")))
FROZEN_LANG_CODES_V3: frozenset[str] = frozenset(FROZEN_LANG_ORDER_V3)
assert len(FROZEN_LANG_ORDER_V3) == len(FROZEN_LANG_CODES_V3), "duplicate language code in FROZEN_LANG_ORDER_V3"

# Active palette SSOT. Switching versions requires a matching canonical bundle.
LANG_PALETTE_VERSION = "v3"
FROZEN_LANG_ORDER: tuple[str, ...] = FROZEN_LANG_ORDER_V3
FROZEN_LANG_CODES: frozenset[str] = FROZEN_LANG_CODES_V3

assert len(FROZEN_LANG_ORDER) == len(set(FROZEN_LANG_ORDER)), "duplicate language code in active frozen palette"


def collect_normalized_language_codes(series: pd.Series) -> set[str]:
    """All normalized language codes appearing in ``original_language`` column."""
    found: set[str] = set()
    for cell in series.astype(object):
        found.add(normalize_language_code(cell))
    return found


def assert_all_languages_in_frozen(lang_series: pd.Series) -> None:
    """Fail fast when a series contains a code outside the active palette."""
    found = collect_normalized_language_codes(lang_series)
    unknown = found - FROZEN_LANG_CODES
    if unknown:
        raise AssertionError(
            f"Unknown original_language code(s) not in frozen palette {LANG_PALETTE_VERSION}: "
            f"{sorted(unknown)!r}. "
            "Extend the next immutable palette version, switch the active exports, and re-embed."
        )


def assert_all_languages_in_frozen_v1(lang_series: pd.Series) -> None:
    """Compatibility wrapper for callers that explicitly audit the v1 historical palette."""
    found = collect_normalized_language_codes(lang_series)
    unknown = found - FROZEN_LANG_CODES_V1
    if unknown:
        raise AssertionError(
            "Unknown original_language code(s) not in frozen palette v1: "
            f"{sorted(unknown)!r}. "
            "Extend FROZEN_LANG_ORDER_V1, bump LANG_PALETTE_VERSION, and re-embed; "
            "or use workflow_dispatch force_skip_dim_check for a one-off bypass (logged)."
        )
