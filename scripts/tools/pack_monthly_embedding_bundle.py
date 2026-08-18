#!/usr/bin/env python3
"""Pack ``cleaned.csv`` + three ``.npy`` into a flat zip for ``GALAXY_EMBED_BUNDLE_URL`` (P18.5).

Validates row alignment before writing. Does not read raw TMDB CSV.

Example::

    python scripts/tools/pack_monthly_embedding_bundle.py
    python scripts/tools/pack_monthly_embedding_bundle.py --cache-dir data/output --out dist/monthly_bundle.zip
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS_DIR = _REPO_ROOT / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from feature_engineering.language_palette import FROZEN_LANG_ORDER, LANG_PALETTE_VERSION  # noqa: E402

_NAMES = ("cleaned.csv", "text_embeddings.npy", "genre_vectors.npy", "language_vectors.npy")
_ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def _write_deterministic_zip(paths: dict[str, Path], output: Path) -> None:
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in _NAMES:
            info = zipfile.ZipInfo(filename=name, date_time=_ZIP_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            with paths[name].open("rb") as source, archive.open(info, "w") as destination:
                shutil.copyfileobj(source, destination, length=1024 * 1024)


def _assert_matrix_contract(
    *,
    name: str,
    matrix: np.ndarray,
    expected_rows: int,
    expected_width: int | None = None,
) -> None:
    assert matrix.ndim == 2, f"{name} must be a 2D matrix, got shape {matrix.shape}"
    assert matrix.shape[0] == expected_rows, f"{name} rows {matrix.shape[0]} != cleaned rows {expected_rows}"
    if expected_width is not None:
        assert matrix.shape[1] == expected_width, (
            f"{name} width {matrix.shape[1]} != expected {expected_width}"
        )
    assert np.isfinite(matrix).all(), f"{name} contains NaN or Inf"
    norms = np.linalg.norm(matrix.astype(np.float64, copy=False), axis=1)
    assert np.allclose(norms, 1.0, atol=1e-4), f"{name} rows must be L2-normalized"
    print(
        f"[pack] {name}.shape={matrix.shape} min={float(matrix.min()):.6g} "
        f"max={float(matrix.max()):.6g} norm=[{float(norms.min()):.6g},{float(norms.max()):.6g}]",
        flush=True,
    )


def _sha256_prefix(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()[:16]


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
    p.add_argument("--validate-only", action="store_true", help="Validate the four files without writing a zip")
    p.add_argument("--expected-sha256", default="", help="Optional whole-bundle SHA-256 to compare against an existing zip")
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
    print(f"[pack] cleaned.shape={df.shape} active_lang={LANG_PALETTE_VERSION}:{len(FROZEN_LANG_ORDER)}", flush=True)
    assert n > 0, "cleaned.csv must not be empty"
    assert df["id"].is_unique, "cleaned.csv must have unique TMDB ids"
    _assert_matrix_contract(name="text", matrix=te, expected_rows=n, expected_width=384)
    _assert_matrix_contract(name="genre", matrix=ge, expected_rows=n)
    _assert_matrix_contract(name="language", matrix=le, expected_rows=n, expected_width=len(FROZEN_LANG_ORDER))

    if args.validate_only:
        expected = str(args.expected_sha256).strip().lower()
        if expected:
            if not out.is_file():
                print(f"error: expected zip {out} is missing for SHA-256 check", file=sys.stderr)
                return 1
            digest = hashlib.sha256()
            with out.open("rb") as handle:
                for block in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(block)
            if digest.hexdigest() != expected:
                print("error: canonical embedding bundle hash mismatch", file=sys.stderr)
                return 1
        print("[pack] validated canonical embedding bundle", flush=True)
        return 0

    out.parent.mkdir(parents=True, exist_ok=True)
    _write_deterministic_zip(paths, out)
    print(
        f"[pack] wrote {out} ({out.stat().st_size / (1024 * 1024):.1f} MiB) sha256prefix={_sha256_prefix(out)}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
