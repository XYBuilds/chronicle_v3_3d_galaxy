#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import pandas as pd

from merge_rules import AUDIT_COLUMNS, TconstAccumulator


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "raw" / "tmdb_imdb_movies_dataset.csv"
DEFAULT_OUTPUT = ROOT / "output" / "merged_movies.csv"
DEFAULT_REPORT = ROOT / "report" / "merge_report.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Merge duplicated movie rows by tconst with field-level rules."
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Input CSV path")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Merged CSV path")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT, help="Quality report path")
    parser.add_argument(
        "--chunksize",
        type=int,
        default=100_000,
        help="Rows per chunk for streaming read",
    )
    return parser.parse_args()


def _iter_rows(chunk: pd.DataFrame) -> list[dict[str, Any]]:
    # Keep empty strings as empty strings so merge rules can treat them uniformly.
    chunk = chunk.fillna("")
    return chunk.to_dict(orient="records")


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _post_metrics(
    merged_df: pd.DataFrame,
    report_df: pd.DataFrame,
) -> dict[str, Any]:
    quality_cols = ["overview", "release_date", "runtime", "poster_path", "genres", "cast"]
    non_empty_after = {}
    for col in quality_cols:
        if col not in merged_df.columns:
            continue
        non_empty_after[col] = float((merged_df[col].astype(str).str.strip() != "").mean())

    high_conf = int((report_df["merge_confidence"] == "high").sum()) if "merge_confidence" in report_df.columns else 0
    medium_conf = int((report_df["merge_confidence"] == "medium").sum()) if "merge_confidence" in report_df.columns else 0
    low_conf = int((report_df["merge_confidence"] == "low").sum()) if "merge_confidence" in report_df.columns else 0
    large_runtime_conflict = int((report_df["runtime_spread"] > 60).sum()) if "runtime_spread" in report_df.columns else 0

    return {
        "non_empty_after": non_empty_after,
        "confidence_counts": {"high": high_conf, "medium": medium_conf, "low": low_conf},
        "runtime_spread_gt_60": large_runtime_conflict,
    }


def main() -> None:
    args = parse_args()
    if not args.input.exists():
        raise FileNotFoundError(f"Input file does not exist: {args.input}")

    _ensure_parent(args.output)
    _ensure_parent(args.report)

    accumulators: dict[str, TconstAccumulator] = {}
    total_rows = 0
    all_columns: list[str] | None = None

    reader = pd.read_csv(
        args.input,
        dtype=str,
        keep_default_na=False,
        chunksize=args.chunksize,
    )

    for chunk in reader:
        if all_columns is None:
            all_columns = list(chunk.columns)
        for row in _iter_rows(chunk):
            total_rows += 1
            tconst = str(row.get("tconst", "")).strip()
            if not tconst:
                continue
            acc = accumulators.get(tconst)
            if acc is None:
                acc = TconstAccumulator(tconst=tconst)
                accumulators[tconst] = acc
            acc.ingest(row_id=total_rows, row=row)

    if all_columns is None:
        raise ValueError("Input appears to be empty or missing headers.")

    output_columns = [*all_columns]
    for audit_col in AUDIT_COLUMNS:
        if audit_col not in output_columns:
            output_columns.append(audit_col)

    merged_rows: list[dict[str, str]] = []
    report_rows: list[dict[str, Any]] = []
    for tconst in sorted(accumulators):
        merged_row, report_row = accumulators[tconst].build_record(output_columns)
        merged_rows.append(merged_row)
        report_rows.append(report_row)

    merged_df = pd.DataFrame(merged_rows, columns=output_columns)
    report_df = pd.DataFrame(report_rows).sort_values(
        by=["merge_confidence", "source_row_count", "source_tmdb_id_count", "tconst"],
        ascending=[True, False, False, True],
    )

    merged_df.to_csv(args.output, index=False, encoding="utf-8")
    report_df.to_csv(args.report, index=False, encoding="utf-8")

    tconst_unique_count = len(accumulators)
    expected_rows = tconst_unique_count
    actual_rows = len(merged_df)
    metrics = _post_metrics(merged_df, report_df)

    print(f"Input rows: {total_rows:,}")
    print(f"Unique tconst: {tconst_unique_count:,}")
    print(f"Merged rows: {actual_rows:,}")
    print(f"Row-count check (merged == unique_tconst): {actual_rows == expected_rows}")
    print(f"Output: {args.output}")
    print(f"Report: {args.report}")
    print("Confidence counts:", metrics["confidence_counts"])
    print("Runtime spread > 60 count:", metrics["runtime_spread_gt_60"])
    print("Non-empty rates after merge:", metrics["non_empty_after"])


if __name__ == "__main__":
    main()
