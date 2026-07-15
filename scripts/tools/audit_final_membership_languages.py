#!/usr/bin/env python3
"""Audit unknown original-language codes before and after final monthly membership.

The report intentionally contains only aggregate code counts and a bounded TMDB-ID
sample. It never serializes the raw Kaggle corpus.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _SCRIPTS_DIR.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.monthly_refit import _download_kaggle_to, _raw_fingerprint, _resolve_kaggle_csv  # noqa: E402
from feature_engineering.dim_drift_detector import inspect_dim_drift  # noqa: E402
from feature_engineering.language_encoding import normalize_language_code  # noqa: E402
from pipeline.cleaning import (  # noqa: E402
    ABS_MIN,
    ALPHA,
    QUANTILE,
    ROLLING_WINDOW,
    apply_frozen_vote_threshold,
    compute_year_to_vote_threshold,
    load_raw_csv,
    run_cleaning_pipeline_before_vote_threshold,
)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input-csv", type=Path, help="Downloaded Kaggle snapshot CSV")
    source.add_argument(
        "--download-kaggle",
        action="store_true",
        help="Download the current Kaggle snapshot into a temporary directory, then remove it.",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=5,
        help="Maximum sorted TMDB IDs retained per unknown language code (default: 5)",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        default=None,
        help="Optional compact report destination",
    )
    return parser.parse_args(argv)


def _unknown_language_samples(
    frame: pd.DataFrame,
    unknown_codes: Iterable[str],
    *,
    sample_size: int,
) -> dict[str, list[int]]:
    if sample_size < 1:
        raise ValueError("sample_size must be >= 1")
    unknown = frozenset(unknown_codes)
    samples: dict[str, list[int]] = {code: [] for code in sorted(unknown)}
    if not unknown:
        return samples

    for movie_id, language in zip(frame["id"], frame["original_language"]):
        code = normalize_language_code(language)
        if code not in unknown or len(samples[code]) >= sample_size:
            continue
        samples[code].append(int(movie_id))
    return samples


def _report_membership(frame: pd.DataFrame, *, sample_size: int) -> dict[str, Any]:
    drift = inspect_dim_drift(frame)
    unknown_codes = drift["unknown_languages"]
    samples = _unknown_language_samples(frame, unknown_codes, sample_size=sample_size)
    return {
        "shape": [int(frame.shape[0]), int(frame.shape[1])],
        "unknown_language_counts": drift["unknown_language_counts"],
        "unknown_language_samples": samples,
        "unknown_language_row_count": drift["unknown_language_row_count"],
        "unknown_language_count_min": drift["unknown_language_count_min"],
        "unknown_language_count_max": drift["unknown_language_count_max"],
    }


def _resolve_input(args: argparse.Namespace) -> tuple[Path, Path | None]:
    if args.input_csv is not None:
        source = args.input_csv.expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(f"--input-csv not found: {source}")
        return source, None

    temporary_dir = Path(tempfile.mkdtemp(prefix="p37_language_audit_"))
    try:
        return _download_kaggle_to(temporary_dir), temporary_dir
    except BaseException:
        shutil.rmtree(temporary_dir, ignore_errors=True)
        raise


def run_audit(input_csv: Path, *, sample_size: int) -> dict[str, Any]:
    raw = load_raw_csv(input_csv)
    print(f"[language-audit] raw.shape={raw.shape}", flush=True)

    df_pre, _steps, _base = run_cleaning_pipeline_before_vote_threshold(raw)
    assert not df_pre.empty, "pre-threshold corpus must not be empty"
    assert df_pre["id"].is_unique, "pre-threshold corpus must have unique TMDB ids"

    thresholds = compute_year_to_vote_threshold(
        df_pre,
        quantile=QUANTILE,
        alpha=ALPHA,
        abs_min=ABS_MIN,
        rolling_window=ROLLING_WINDOW,
    )
    final_membership, _step = apply_frozen_vote_threshold(df_pre, thresholds)
    assert not final_membership.empty, "final membership must not be empty"
    assert final_membership["id"].is_unique, "final membership must have unique TMDB ids"

    threshold_years = sorted(int(year) for year in thresholds)
    assert threshold_years, "threshold map must not be empty"
    report = {
        "schema_version": 1,
        "raw_source": {
            "filename": input_csv.name,
            "sha256prefix": _raw_fingerprint(input_csv),
            "size_bytes": int(input_csv.stat().st_size),
        },
        "threshold_year_min": threshold_years[0],
        "threshold_year_max": threshold_years[-1],
        "pre_threshold": _report_membership(df_pre, sample_size=sample_size),
        "final_membership": _report_membership(final_membership, sample_size=sample_size),
    }
    print(
        "[language-audit] "
        f"pre.shape={tuple(report['pre_threshold']['shape'])} "
        f"final.shape={tuple(report['final_membership']['shape'])} "
        f"threshold_years=[{threshold_years[0]},{threshold_years[-1]}]",
        flush=True,
    )
    print(
        "[language-audit] "
        f"pre_unknown={json.dumps(report['pre_threshold']['unknown_language_counts'], sort_keys=True)} "
        f"final_unknown={json.dumps(report['final_membership']['unknown_language_counts'], sort_keys=True)}",
        flush=True,
    )
    return report


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    temporary_dir: Path | None = None
    try:
        input_csv, temporary_dir = _resolve_input(args)
        report = run_audit(input_csv, sample_size=int(args.sample_size))
        payload = json.dumps(report, indent=2, sort_keys=True) + "\n"
        if args.json_out is not None:
            output = args.json_out.expanduser().resolve()
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(payload, encoding="utf-8")
            print(f"[language-audit] wrote compact report: {output}", flush=True)
        else:
            print(payload, end="")
        return 0
    finally:
        if temporary_dir is not None:
            shutil.rmtree(temporary_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())