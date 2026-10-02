"""Kaggle missing-genre placeholders must not become palette dimensions."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.cleaning import load_raw_csv, filter_genres_nonempty
from feature_engineering.dim_drift_detector import assert_no_dim_drift, DimDriftError


def test_raw_csv_missing_genres_are_dropped_before_drift_check(tmp_path):
    source = tmp_path / "raw.csv"
    source.write_text('id,genres,original_language\n1,N/A,en\n2, n/a ,en\n3,Drama,en\n4,,en\n5,null,en\n')
    frame = load_raw_csv(source)
    assert frame.iloc[0]["genres"] == "N/A"  # keep_default_na=False: real import path
    cleaned, step = filter_genres_nonempty(frame)
    assert cleaned["id"].tolist() == ["3"]
    assert step.dropped == 4
    assert assert_no_dim_drift(cleaned)["unknown_genres"] == []


def test_real_unknown_genre_still_fails_closed(tmp_path):
    source = tmp_path / "raw.csv"
    source.write_text('id,genres,original_language\n1,NewGenre,en\n')
    cleaned, _ = filter_genres_nonempty(load_raw_csv(source))
    with pytest.raises(DimDriftError, match="NewGenre"):
        assert_no_dim_drift(cleaned)
