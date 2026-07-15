#!/usr/bin/env python3
"""Regression coverage for Phase 37.2 monthly membership boundaries."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron import monthly_refit  # noqa: E402
from feature_engineering.dim_drift_detector import DimDriftError, assert_no_dim_drift, inspect_dim_drift  # noqa: E402
from feature_engineering.genre_palette import FROZEN_GENRE_ORDER_V1  # noqa: E402
from feature_engineering.language_palette import FROZEN_LANG_ORDER_V1  # noqa: E402


def _row(*, movie_id: int, language: str) -> dict[str, object]:
    return {
        "id": movie_id,
        "genres": FROZEN_GENRE_ORDER_V1[0],
        "original_language": language,
        "vote_count": 100,
        "release_date": "2020-01-01",
    }


class TestMonthlyMembershipBoundary(unittest.TestCase):
    def test_pre_threshold_unknown_language_is_observed_but_final_membership_passes(self) -> None:
        pre = pd.DataFrame(
            [
                _row(movie_id=1, language=FROZEN_LANG_ORDER_V1[0]),
                _row(movie_id=2, language="zz_phase37_tail"),
            ]
        )
        final = pre.loc[pre["id"] == 1].copy()

        pre_report = inspect_dim_drift(pre)
        self.assertEqual(pre_report["unknown_language_counts"], {"zz_phase37_tail": 1})
        self.assertEqual(pre_report["unknown_language_count_min"], 1)
        self.assertEqual(pre_report["unknown_language_count_max"], 1)
        self.assertEqual(assert_no_dim_drift(final)["unknown_languages"], [])

    def test_final_membership_unknown_language_blocks(self) -> None:
        final = pd.DataFrame([_row(movie_id=2, language="zz_phase37_member")])
        with self.assertRaises(DimDriftError):
            assert_no_dim_drift(final)

    def test_final_membership_reuses_single_computed_threshold_map(self) -> None:
        df_pre = pd.DataFrame([_row(movie_id=1, language=FROZEN_LANG_ORDER_V1[0])])
        expected_thresholds = {2020: 42.0}
        expected_membership = df_pre.copy()
        threshold_step = object()

        with (
            patch.object(monthly_refit, "compute_year_to_vote_threshold", return_value=expected_thresholds) as compute,
            patch.object(
                monthly_refit,
                "apply_frozen_vote_threshold",
                return_value=(expected_membership, threshold_step),
            ) as apply,
        ):
            actual_thresholds, membership, actual_step = monthly_refit._compute_final_membership(df_pre)

        self.assertIs(actual_thresholds, expected_thresholds)
        self.assertIs(membership, expected_membership)
        self.assertIs(actual_step, threshold_step)
        compute.assert_called_once()
        apply.assert_called_once_with(df_pre, expected_thresholds)

    def test_final_membership_requires_unique_tmdb_ids(self) -> None:
        duplicate = pd.DataFrame(
            [
                _row(movie_id=1, language=FROZEN_LANG_ORDER_V1[0]),
                _row(movie_id=1, language=FROZEN_LANG_ORDER_V1[0]),
            ]
        )
        with (
            patch.object(monthly_refit, "compute_year_to_vote_threshold", return_value={2020: 42.0}),
            patch.object(monthly_refit, "apply_frozen_vote_threshold", return_value=(duplicate, object())),
            self.assertRaisesRegex(AssertionError, "unique TMDB ids"),
        ):
            monthly_refit._compute_final_membership(duplicate)


if __name__ == "__main__":
    unittest.main()