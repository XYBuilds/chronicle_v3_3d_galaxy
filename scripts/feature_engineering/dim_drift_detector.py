#!/usr/bin/env python3
"""Phase 20.2: unified genre + language vocabulary drift gate (fail CI / cron)."""
from __future__ import annotations

from typing import Any

import pandas as pd

from feature_engineering.genre_palette import (
    FROZEN_GENRE_ORDER_V1,
    GENRE_PALETTE_VERSION,
    collect_genre_labels_from_series,
)
from feature_engineering.language_palette import (
    FROZEN_LANG_CODES_V1,
    LANG_PALETTE_VERSION,
    collect_normalized_language_codes,
)


class DimDriftError(Exception):
    """Raised when cleaned data references genres or languages outside frozen v1 palettes."""

    def __init__(self, report: dict[str, Any]) -> None:
        self.report = report
        ug = report.get("unknown_genres", [])
        ul = report.get("unknown_languages", [])
        super().__init__(
            "Dimension drift detected: "
            f"unknown_genres={ug!r} unknown_languages={ul!r}. "
            "Bump GENRE_PALETTE_VERSION / LANG_PALETTE_VERSION and re-embed, "
            "or set DIM_DRIFT_FORCE_SKIP for a logged one-off bypass."
        )


_FROZEN_GENRES = frozenset(FROZEN_GENRE_ORDER_V1)


def _unknown_genres(genres_series: pd.Series) -> list[str]:
    found = collect_genre_labels_from_series(genres_series)
    return sorted(found - _FROZEN_GENRES)


def _unknown_languages(lang_series: pd.Series) -> list[str]:
    found = collect_normalized_language_codes(lang_series)
    return sorted(found - FROZEN_LANG_CODES_V1)


def assert_no_dim_drift(
    cleaned_df: pd.DataFrame,
    *,
    force_skip: bool = False,
) -> dict[str, Any]:
    """Compare ``genres`` / ``original_language`` columns against frozen v1 palettes.

    Aggregates **all** unknown labels before failing (operator sees full diff).
    When ``force_skip`` is True, never raises; caller should persist the report (e.g. monthly meta).
    """
    if "genres" not in cleaned_df.columns:
        raise KeyError("cleaned_df must include column 'genres'")
    if "original_language" not in cleaned_df.columns:
        raise KeyError("cleaned_df must include column 'original_language'")

    unknown_genres = _unknown_genres(cleaned_df["genres"])
    unknown_languages = _unknown_languages(cleaned_df["original_language"])

    report: dict[str, Any] = {
        "genre_palette_version": GENRE_PALETTE_VERSION,
        "lang_palette_version": LANG_PALETTE_VERSION,
        "unknown_genres": unknown_genres,
        "unknown_languages": unknown_languages,
        "dim_drift_force_skip": bool(force_skip),
    }

    print(
        f"[dim_drift] genre={GENRE_PALETTE_VERSION} lang={LANG_PALETTE_VERSION} "
        f"unknown_genres={unknown_genres} unknown_languages={unknown_languages} "
        f"force_skip={force_skip}",
        flush=True,
    )

    if force_skip:
        return report
    if unknown_genres or unknown_languages:
        raise DimDriftError(report)
    return report
