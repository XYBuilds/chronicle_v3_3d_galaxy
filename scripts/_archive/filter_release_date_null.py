#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "output" / "merged_movies.csv"
DEFAULT_OUTPUT = ROOT / "output" / "merged_movies_filtered_release_date_not_null.csv"
NULL_TOKENS = {"", "null", "none", "nan", "<na>"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove rows where release_date is null-like (no release date)."
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Input CSV path")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output CSV path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.input.exists():
        raise FileNotFoundError(f"Input file does not exist: {args.input}")

    df = pd.read_csv(args.input, dtype=str, keep_default_na=False)
    if "release_date" not in df.columns:
        raise KeyError("Missing required column: release_date")

    text = df["release_date"].astype(str).str.strip()
    keep_mask = ~text.str.casefold().isin(NULL_TOKENS)
    filtered_df = df[keep_mask].copy()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    filtered_df.to_csv(args.output, index=False, encoding="utf-8")

    removed = len(df) - len(filtered_df)
    print(f"Input rows: {len(df):,}")
    print(f"Removed rows (release_date null-like): {removed:,}")
    print(f"Output rows: {len(filtered_df):,}")
    print(f"Output file: {args.output}")


if __name__ == "__main__":
    main()
