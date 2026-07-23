#!/usr/bin/env python3
"""Fixture dry-run coverage for the Phase 37 cron safety boundary."""
from __future__ import annotations

import inspect
import io
import os
import sys
import tempfile
import types
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np
import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron import monthly_refit, nightly_vote_refresh  # noqa: E402
from feature_engineering.genre_palette import FROZEN_GENRE_ORDER_V1  # noqa: E402
from feature_engineering.language_palette import FROZEN_LANG_ORDER  # noqa: E402


def _fixture_rows() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "id": [101, 102, 103],
            "genres": [FROZEN_GENRE_ORDER_V1[0]] * 3,
            "original_language": [FROZEN_LANG_ORDER[0]] * 3,
            "vote_count": [100, 120, 140],
            "vote_average": [7.0, 7.5, 8.0],
            "release_date": ["2020-01-01", "2020-01-02", "2020-01-03"],
        }
    )


def _drift_report() -> dict[str, object]:
    return {
        "unknown_languages": [],
        "unknown_language_counts": {},
        "unknown_language_row_count": 0,
        "unknown_language_count_min": 0,
        "unknown_language_count_max": 0,
    }


def _write_monthly_cache(root: Path, rows: pd.DataFrame) -> None:
    rows.to_csv(root / "cleaned.csv", index=False)
    np.save(root / "text_embeddings.npy", np.full((len(rows), 384), 1 / np.sqrt(384), dtype=np.float32))
    np.save(root / "genre_vectors.npy", np.eye(len(rows), len(FROZEN_GENRE_ORDER_V1), dtype=np.float32))
    languages = np.zeros((len(rows), len(FROZEN_LANG_ORDER)), dtype=np.float32)
    languages[:, 0] = 1.0
    np.save(root / "language_vectors.npy", languages)


class TestCronFixtureDryRuns(unittest.TestCase):
    def test_monthly_dry_run_uses_final_membership_without_umap_or_supabase(self) -> None:
        rows = _fixture_rows()
        thresholds = {2020: 42.0}
        step = SimpleNamespace(name="frozen_vote_threshold")

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw_path = root / "fixture.csv"
            raw_path.write_text("fixture\n", encoding="utf-8")
            cache_dir = root / "cache"
            cache_dir.mkdir()
            _write_monthly_cache(cache_dir, rows)
            stdout = io.StringIO()

            with (
                patch.object(monthly_refit, "load_raw_csv", return_value=rows),
                patch.object(monthly_refit, "run_cleaning_pipeline_before_vote_threshold", return_value=(rows, [], None)),
                patch.object(monthly_refit, "compute_year_to_vote_threshold", return_value=thresholds) as compute,
                patch.object(monthly_refit, "apply_frozen_vote_threshold", return_value=(rows, step)) as apply,
                patch.object(monthly_refit, "inspect_dim_drift", return_value=_drift_report()),
                patch.object(monthly_refit, "assert_no_dim_drift", return_value=_drift_report()) as drift_gate,
                patch.object(monthly_refit, "_fit_umap_learn", side_effect=AssertionError("UMAP must not run in dry-run")),
                redirect_stdout(stdout),
            ):
                result = monthly_refit.main(
                    ["--input-csv", str(raw_path), "--cache-dir", str(cache_dir), "--dry-run"]
                )

        self.assertEqual(result, 0)
        compute.assert_called_once()
        apply.assert_called_once_with(rows, thresholds)
        drift_gate.assert_called_once_with(rows, force_skip=False)
        output = stdout.getvalue()
        self.assertIn("recomputed thresholds_json years=1 min_year=2020 max_year=2020", output)
        self.assertIn("final-membership.shape=(3, 6)", output)
        self.assertIn("--dry-run: skip Supabase / UMAP / export", output)

    def test_nightly_pending_language_encoding_uses_active_palette_order(self) -> None:
        encoded = nightly_vote_refresh._encode_active_language_matrix(pd.Series(["ab", "en"]))

        self.assertEqual(encoded.shape, (2, len(FROZEN_LANG_ORDER)))
        self.assertEqual(int(np.argmax(encoded[0])), FROZEN_LANG_ORDER.index("ab"))
        self.assertEqual(int(np.argmax(encoded[1])), FROZEN_LANG_ORDER.index("en"))
        self.assertNotIn("lang_order", inspect.signature(nightly_vote_refresh._encode_new_movies).parameters)

    def test_nightly_dry_run_reads_fixture_threshold_without_writes_or_export(self) -> None:
        rows = _fixture_rows()
        fake_client = Mock()
        create_client = Mock(return_value=fake_client)
        fake_supabase_module = types.ModuleType("supabase")
        fake_supabase_module.create_client = create_client

        with tempfile.TemporaryDirectory() as tmp:
            raw_path = Path(tmp) / "fixture.csv"
            raw_path.write_text("fixture\n", encoding="utf-8")
            stdout = io.StringIO()

            with (
                patch.dict(
                    os.environ,
                    {
                        "SUPABASE_URL": "https://fixture.supabase.co",
                        "SUPABASE_SERVICE_ROLE_KEY": "fixture-service-role-key",
                    },
                    clear=True,
                ),
                patch.dict(sys.modules, {"supabase": fake_supabase_module}),
                patch.object(nightly_vote_refresh, "load_raw_csv", return_value=rows),
                patch.object(nightly_vote_refresh, "_fetch_active_threshold", return_value={"version": "fixture", "thresholds_json": {"2020": 42}}),
                patch.object(
                    nightly_vote_refresh,
                    "run_cleaning_pipeline",
                    return_value=(rows, [SimpleNamespace(name="frozen_vote_threshold")]),
                ),
                patch.object(nightly_vote_refresh, "assert_no_dim_drift", return_value=_drift_report()) as drift_gate,
                redirect_stdout(stdout),
            ):
                result = nightly_vote_refresh.main(["--input-csv", str(raw_path), "--dry-run"])

        self.assertEqual(result, 0)
        create_client.assert_called_once_with("https://fixture.supabase.co", "fixture-service-role-key")
        fake_client.table.assert_not_called()
        drift_gate.assert_called_once_with(rows, force_skip=False)
        output = stdout.getvalue()
        self.assertIn("active threshold version='fixture' years=1", output)
        self.assertIn("cleaned.shape=(3, 6) last_step=frozen_vote_threshold", output)
        self.assertIn("--dry-run: skip Supabase writes / export", output)


if __name__ == "__main__":
    unittest.main()
