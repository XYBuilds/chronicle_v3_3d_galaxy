#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "output" / "merged_movies.csv"
DEFAULT_OUTPUT = ROOT / "output" / "merged_movies_filtered_vote_average_gt_0.csv"
NULL_TOKENS = {"", "null", "none", "nan", "<na>"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove rows where vote_average is 0 or null-like."
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Input CSV path")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output CSV path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.input.exists():
        raise FileNotFoundError(f"Input file does not exist: {args.input}")

    df = pd.read_csv(args.input, dtype=str, keep_default_na=False)
    if "vote_average" not in df.columns:
        raise KeyError("Missing required column: vote_average")

    text = df["vote_average"].astype(str).str.strip()
    null_like = text.str.casefold().isin(NULL_TOKENS)
    numeric = pd.to_numeric(text, errors="coerce")
    zero_like = numeric.fillna(0).eq(0) & ~null_like
    keep_mask = ~(null_like | zero_like)
    filtered_df = df[keep_mask].copy()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    filtered_df.to_csv(args.output, index=False, encoding="utf-8")

    removed = len(df) - len(filtered_df)
    print(f"Input rows: {len(df):,}")
    print(f"Removed rows (vote_average == 0 or null-like): {removed:,}")
    print(f"Output rows: {len(filtered_df):,}")
    print(f"Output file: {args.output}")


if __name__ == "__main__":
    main()
