#!/usr/bin/env python3
"""P20.2: dimension drift gate (genre + language frozen vocab v1)."""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from feature_engineering.dim_drift_detector import (  # noqa: E402
    DimDriftError,
    assert_no_dim_drift,
)
from feature_engineering.genre_palette import FROZEN_GENRE_ORDER_V1  # noqa: E402
from feature_engineering.language_encoding import normalize_language_code  # noqa: E402
from feature_engineering.language_palette import (  # noqa: E402
    FROZEN_LANG_ORDER_V1,
    assert_all_languages_in_frozen_v1,
)


def _ok_row() -> dict[str, object]:
    g0 = FROZEN_GENRE_ORDER_V1[0]
    l0 = FROZEN_LANG_ORDER_V1[0]
    return {"genres": g0, "original_language": l0}


class TestDimDriftDetector(unittest.TestCase):
    def test_clean_passes(self) -> None:
        df = pd.DataFrame([_ok_row(), _ok_row()])
        r = assert_no_dim_drift(df, force_skip=False)
        self.assertEqual(r["unknown_genres"], [])
        self.assertEqual(r["unknown_languages"], [])

    def test_unknown_genre_raises(self) -> None:
        row = _ok_row()
        row["genres"] = "TotallyUnknownGenreForTest"
        df = pd.DataFrame([row])
        with self.assertRaises(DimDriftError) as ctx:
            assert_no_dim_drift(df, force_skip=False)
        self.assertIn("TotallyUnknownGenreForTest", str(ctx.exception))

    def test_unknown_language_raises(self) -> None:
        row = _ok_row()
        row["original_language"] = "zz_p20_test_iso"
        df = pd.DataFrame([row])
        with self.assertRaises(DimDriftError) as ctx:
            assert_no_dim_drift(df, force_skip=False)
        err = ctx.exception
        self.assertIn("unknown_languages", err.report)
        self.assertIn(normalize_language_code("zz_p20_test_iso"), err.report["unknown_languages"])

    def test_force_skip_does_not_raise_but_records(self) -> None:
        row = _ok_row()
        row["original_language"] = "zz_p20_test_iso_2"
        df = pd.DataFrame([row])
        r = assert_no_dim_drift(df, force_skip=True)
        self.assertTrue(r["dim_drift_force_skip"])
        self.assertNotEqual(r["unknown_languages"], [])

    def test_assert_all_languages_in_frozen_v1_ok(self) -> None:
        s = pd.Series([FROZEN_LANG_ORDER_V1[0], FROZEN_LANG_ORDER_V1[-1]])
        assert_all_languages_in_frozen_v1(s)

    def test_frozen_lang_tuple_matches_normalize(self) -> None:
        for code in FROZEN_LANG_ORDER_V1:
            self.assertEqual(normalize_language_code(code), code)


if __name__ == "__main__":
    # Allow re-run with real cleaned.csv when present (optional integration smoke).
    repo = _SCRIPTS_DIR.parent
    cleaned = repo / "data" / "output" / "cleaned.csv"
    if "RUN_DIM_DRIFT_INTEGRATION" in os.environ and cleaned.is_file():
        import pandas as pdx

        dfc = pdx.read_csv(cleaned, nrows=5000)
        r = assert_no_dim_drift(
            dfc[["genres", "original_language"]],
            force_skip=False,
        )
        print("integration sample ok", r)

    unittest.main()
