#!/usr/bin/env python3
"""Pack P18.1a canonical run files into a flat zip for ``phase18_refit_benchmark.yml``.

The workflow expects (at zip root or under a single top-level folder):

- cleaned.csv
- text_embeddings.npy
- genre_vectors.npy
- language_vectors.npy
- umap_xy.npy

Example::

    python scripts/experiments/p18_pack_canonical_bundle_for_gha.py \\
        --run-dir data/runs/p18_1_full_rebuild_20260504_1617

Default output: ``data/runs/p18_canonical_gha_bundle.zip`` (under ``data/runs/``, gitignored).
Upload that zip to a stable HTTPS URL (recommended: GitHub Release asset), then pass the URL
as workflow input ``bundle_url``.
"""
from __future__ import annotations

import argparse
import zipfile
from pathlib import Path

_REQUIRED = (
    "cleaned.csv",
    "text_embeddings.npy",
    "genre_vectors.npy",
    "language_vectors.npy",
    "umap_xy.npy",
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("Example::")[0].strip())
    p.add_argument(
        "--run-dir",
        type=Path,
        required=True,
        help="P18.1a run directory containing the five canonical files",
    )
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("data/runs/p18_canonical_gha_bundle.zip"),
        help="Output .zip path (default: data/runs/p18_canonical_gha_bundle.zip)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    run_dir = args.run_dir.expanduser().resolve()
    out_zip = args.output.expanduser().resolve()
    if not run_dir.is_dir():
        print(f"Error: run-dir is not a directory: {run_dir}", flush=True)
        return 1

    missing = [name for name in _REQUIRED if not (run_dir / name).is_file()]
    if missing:
        print(f"Error: missing in {run_dir}:", ", ".join(missing), flush=True)
        return 1

    out_zip.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in _REQUIRED:
            src = run_dir / name
            nbytes = src.stat().st_size
            total += nbytes
            zf.write(src, arcname=name)
            print(f"  added {name} ({nbytes / (1024 * 1024):.2f} MB)", flush=True)

    mb = out_zip.stat().st_size / (1024 * 1024)
    print(f"\nWrote {out_zip} ({mb:.2f} MB compressed)", flush=True)
    print(f"Uncompressed sum of inputs: {total / (1024 * 1024):.2f} MB", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
