#!/usr/bin/env python3
"""Phase 20.2: frozen original_language vocabulary for dimension-drift detection.

v1 **order** matches ``collect_sorted_languages()`` on the Phase 18 canonical
``data/output/cleaned.csv`` used to seed production embeddings. One-hot column
index i follows this sorted tuple.

If TMDB introduces new ISO codes in raw data: extend ``FROZEN_LANG_ORDER_V1``,
bump ``LANG_PALETTE_VERSION``, and schedule a full re-embed (see Tech Spec).
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


def collect_normalized_language_codes(series: pd.Series) -> set[str]:
    """All normalized language codes appearing in ``original_language`` column."""
    found: set[str] = set()
    for cell in series.astype(object):
        found.add(normalize_language_code(cell))
    return found


def assert_all_languages_in_frozen_v1(lang_series: pd.Series) -> None:
    """Fail fast if cleaned data contains any normalized code outside ``FROZEN_LANG_ORDER_V1``."""
    found = collect_normalized_language_codes(lang_series)
    unknown = found - FROZEN_LANG_CODES_V1
    if unknown:
        raise AssertionError(
            "Unknown original_language code(s) not in frozen palette v1: "
            f"{sorted(unknown)!r}. "
            "Extend FROZEN_LANG_ORDER_V1, bump LANG_PALETTE_VERSION, and re-embed; "
            "or use workflow_dispatch force_skip_dim_check for a one-off bypass (logged)."
        )
