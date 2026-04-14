#!/usr/bin/env python3
"""Unified TMDB galaxy pipeline entry: Phase 1 cleaning → ``cleaned.csv``; optional Phase 2 through JSON export."""
from __future__ import annotations

import argparse
import os
import subprocess
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
_DEFAULT_GALAXY_JSON = REPO_ROOT / "frontend" / "public" / "data" / "galaxy_data.json"
# Dev plan Phase 2.6: this subsample path triggers full Phase 1+2 without extra flags.
_SUBSAMPLE_SMOKE_CSV = (REPO_ROOT / "data" / "subsample" / "tmdb2025_random20.csv").resolve()


def _run_python_script(rel_script: Path, extra_args: list[str]) -> None:
    script_path = (REPO_ROOT / rel_script).resolve()
    cmd = [sys.executable, str(script_path), *extra_args]
    print(f"\n[Pipeline] >>> {' '.join(cmd)}", flush=True)
    env = {**os.environ, "PYTHONUNBUFFERED": "1"}
    proc = subprocess.run(cmd, cwd=str(REPO_ROOT), env=env)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def run_phase2_through_export(*, cleaned_csv: Path, galaxy_json: Path, embedding_device: str) -> None:
    """Phase 2.1–2.5 in order; paths must be absolute."""
    c = str(cleaned_csv)
    _run_python_script(
        Path("scripts") / "feature_engineering" / "text_embedding.py",
        ["--input", c, "--device", embedding_device],
    )
    _run_python_script(Path("scripts") / "feature_engineering" / "genre_encoding.py", ["--input", c])
    _run_python_script(Path("scripts") / "feature_engineering" / "language_encoding.py", ["--input", c])
    _run_python_script(Path("scripts") / "feature_engineering" / "umap_projection.py", [])
    gz_path = galaxy_json.parent / f"{galaxy_json.stem}.json.gz"
    _run_python_script(
        Path("scripts") / "export" / "export_galaxy_json.py",
        ["--input", c, "--output-json", str(galaxy_json), "--output-gzip", str(gz_path)],
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Run TMDB galaxy data pipeline. Phase 1: load CSV, dedupe, must-drop filters, "
            "dynamic vote_count baseline, write cleaned.csv. "
            "Input data/subsample/tmdb2025_random20.csv auto-runs Phase 2.6 (Phase 1+2 + JSON validate); "
            "use --phase-1-only to clean only."
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
    p.add_argument(
        "--through-phase-2",
        action="store_true",
        help="After cleaning, run Phase 2.1 through 2.5 (embedding, UMAP, galaxy_data.json) using this run's cleaned CSV",
    )
    p.add_argument(
        "--embedding-device",
        type=str,
        default="cuda",
        choices=("cuda", "cpu", "auto"),
        help="Phase 2.1 sentence-transformers device (default: cuda). Use cpu or auto without a CUDA-capable GPU.",
    )
    p.add_argument(
        "--phase-1-only",
        action="store_true",
        help="When set, never auto-run Phase 2 for the Phase 2.6 subsample CSV (cleaning only)",
    )
    p.add_argument(
        "--galaxy-json",
        type=Path,
        default=_DEFAULT_GALAXY_JSON,
        help=f"Output path for galaxy_data.json when using --through-phase-2 (default: {_DEFAULT_GALAXY_JSON})",
    )
    p.add_argument(
        "--skip-json-validate",
        action="store_true",
        help="With --through-phase-2, skip Tech Spec 4.3 JSON validation script",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    args.input = args.input.expanduser().resolve()
    args.output = args.output.expanduser().resolve()
    args.galaxy_json = args.galaxy_json.expanduser().resolve()

    smoke_csv = _SUBSAMPLE_SMOKE_CSV
    try:
        is_smoke_input = args.input.resolve() == smoke_csv
    except OSError:
        is_smoke_input = False
    if is_smoke_input and not args.phase_1_only:
        if not args.through_phase_2:
            args.through_phase_2 = True
            print(
                f"[Pipeline] Auto-enabling --through-phase-2 (Phase 2.6 subsample: {smoke_csv.name})",
                flush=True,
            )
        if args.expect_final_rows_min is None and args.expect_final_rows_max is None:
            args.expect_final_rows_min = 1
            args.expect_final_rows_max = 20
            print(
                "[Pipeline] Auto-setting --expect-final-rows-min 1 --expect-final-rows-max 20 for subsample smoke",
                flush=True,
            )

    df = load_raw_csv(args.input)
    n_cols = df.shape[1]
    print(f"[Load] {args.input} -> {len(df):,} rows x {n_cols} columns", flush=True)

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
    print(f"\n[Output] Wrote {args.output} ({len(cleaned):,} rows, {size_mb:.2f} MB)", flush=True)

    if args.through_phase_2:
        if len(cleaned) < 3:
            print(
                f"Error: --through-phase-2 needs at least 3 rows after cleaning (UMAP), got {len(cleaned)}.",
                file=sys.stderr,
            )
            return 1
        run_phase2_through_export(
            cleaned_csv=args.output,
            galaxy_json=args.galaxy_json,
            embedding_device=args.embedding_device,
        )
        if not args.skip_json_validate:
            vpath = REPO_ROOT / "scripts" / "validate_galaxy_json.py"
            vcmd = [
                sys.executable,
                str(vpath),
                "--input",
                str(args.galaxy_json),
            ]
            print(f"\n[Pipeline] >>> {' '.join(vcmd)}", flush=True)
            vproc = subprocess.run(vcmd, cwd=str(REPO_ROOT), env={**os.environ, "PYTHONUNBUFFERED": "1"})
            if vproc.returncode != 0:
                return int(vproc.returncode)
        print(f"\n[Pipeline] Phase 2 complete — galaxy JSON: {args.galaxy_json}", flush=True)
        import json

        try:
            payload = json.loads(args.galaxy_json.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"Warning: could not re-read galaxy JSON for meta.count line: {exc}", file=sys.stderr)
        else:
            print(
                f"[Pipeline] meta.count = {payload['meta']['count']} (expected <= raw input rows after filters)",
                flush=True,
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
