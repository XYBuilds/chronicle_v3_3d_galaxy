#!/usr/bin/env python3
"""Unified TMDB galaxy pipeline entry (Phase 1+). Currently: cleaning → ``cleaned.csv``."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from pipeline.cleaning import (
    assert_cleaned_quality,
    load_raw_csv,
    print_summary_table,
    run_cleaning_pipeline,
    write_cleaned_csv,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = REPO_ROOT / "data" / "raw" / "TMDB_all_movies.csv"
DEFAULT_OUTPUT = REPO_ROOT / "data" / "output" / "cleaned.csv"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Run TMDB galaxy data pipeline. Phase 1: load CSV, dedupe, must-drop filters, "
            "dynamic vote_count baseline, write cleaned.csv"
        )
    )
    p.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Raw TMDB CSV (default: {DEFAULT_INPUT})",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Cleaned CSV output (default: {DEFAULT_OUTPUT})",
    )
    p.add_argument(
        "--skip-quality-assert",
        action="store_true",
        help="Skip post-cleaning column assertions (for debugging only)",
    )
    p.add_argument(
        "--expect-final-rows-min",
        type=int,
        default=None,
        help="If set with --expect-final-rows-max, assert final row count is in [min, max]",
    )
    p.add_argument(
        "--expect-final-rows-max",
        type=int,
        default=None,
        help="If set with --expect-final-rows-min, assert final row count is in [min, max]",
    )
    p.add_argument("--quantile", type=float, default=0.95, help="Yearly vote_count quantile for dynamic threshold")
    p.add_argument("--alpha", type=float, default=0.15, help="Alpha for dynamic threshold (see archive script)")
    p.add_argument("--abs-min", type=float, default=1.0, help="Absolute floor for dynamic threshold")
    p.add_argument("--rolling-window", type=int, default=6, help="Rolling window (years) for smoothed baseline")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    args.input = args.input.expanduser().resolve()
    args.output = args.output.expanduser().resolve()

    df = load_raw_csv(args.input)
    n_cols = df.shape[1]
    print(f"[Load] {args.input} -> {len(df):,} rows x {n_cols} columns")

    cleaned, steps = run_cleaning_pipeline(
        df,
        quantile=args.quantile,
        alpha=args.alpha,
        abs_min=args.abs_min,
        rolling_window=args.rolling_window,
    )
    print_summary_table(steps, len(cleaned))

    if not args.skip_quality_assert:
        assert_cleaned_quality(cleaned)

    canonical_raw = (REPO_ROOT / "data" / "raw" / "TMDB_all_movies.csv").resolve()
    if (
        args.expect_final_rows_min is None
        and args.expect_final_rows_max is None
        and args.input == canonical_raw
    ):
        lo, hi = 55_000, 65_000
        n = len(cleaned)
        if not (lo <= n <= hi):
            raise AssertionError(
                f"Default full-dataset clean row count {n:,} outside expected band [{lo:,}, {hi:,}] "
                "(Dataset Report / dev plan Phase 1.3). Override with --expect-final-rows-min/max if intentional."
            )

    min_e, max_e = args.expect_final_rows_min, args.expect_final_rows_max
    if (min_e is not None) ^ (max_e is not None):
        print(
            "Warning: both --expect-final-rows-min and --expect-final-rows-max must be set; "
            "skipping row count assert.",
            file=sys.stderr,
        )
    elif min_e is not None and max_e is not None:
        n = len(cleaned)
        if not (min_e <= n <= max_e):
            raise AssertionError(f"Final row count {n:,} not in expected range [{min_e:,}, {max_e:,}]")

    write_cleaned_csv(cleaned, args.output)
    size_mb = args.output.stat().st_size / (1024 * 1024)
    print(f"\n[Output] Wrote {args.output} ({len(cleaned):,} rows, {size_mb:.2f} MB)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
