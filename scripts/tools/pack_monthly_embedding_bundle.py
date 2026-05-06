#!/usr/bin/env python3
"""Pack ``cleaned.csv`` + three ``.npy`` into a flat zip for ``GALAXY_EMBED_BUNDLE_URL`` (P18.5).

Validates row alignment before writing. Does not read raw TMDB CSV.

Example::

    python scripts/tools/pack_monthly_embedding_bundle.py
    python scripts/tools/pack_monthly_embedding_bundle.py --cache-dir data/output --out dist/monthly_bundle.zip
"""
from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

_REPO_ROOT = Path(__file__).resolve().parents[2]
_NAMES = ("cleaned.csv", "text_embeddings.npy", "genre_vectors.npy", "language_vectors.npy")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--cache-dir",
        type=Path,
        default=_REPO_ROOT / "data" / "output",
        help="Directory containing the four files (default: data/output)",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=_REPO_ROOT / "data" / "runs" / "monthly_refit_embedding_bundle.zip",
        help="Output zip path (default: data/runs/monthly_refit_embedding_bundle.zip)",
    )
    args = p.parse_args(argv)
    root = args.cache_dir.expanduser().resolve()
    out = args.out.expanduser().resolve()
    paths = {n: root / n for n in _NAMES}
    for n, path in paths.items():
        if not path.is_file():
            print(f"error: missing {path}", file=sys.stderr)
            return 1

    df = pd.read_csv(paths["cleaned.csv"])
    n = len(df)
    te = np.load(paths["text_embeddings.npy"])
    ge = np.load(paths["genre_vectors.npy"])
    le = np.load(paths["language_vectors.npy"])
    print(f"[pack] cleaned rows={n:,} text={te.shape} genre={ge.shape} lang={le.shape}")
    assert te.shape[0] == n == ge.shape[0] == le.shape[0], "row count mismatch between cleaned and npy files"
    assert te.shape[1] == 384, f"expected text dim 384, got {te.shape[1]}"

    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for n in _NAMES:
            zf.write(paths[n], arcname=n)
    print(f"[pack] wrote {out} ({out.stat().st_size / (1024 * 1024):.1f} MiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
