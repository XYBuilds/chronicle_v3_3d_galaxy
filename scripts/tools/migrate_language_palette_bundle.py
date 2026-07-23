#!/usr/bin/env python3
"""Migrate a canonical embedding bundle between immutable language palettes."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Sequence

import numpy as np
import pandas as pd

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS_DIR = _REPO_ROOT / "scripts"
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from feature_engineering.language_palette import (  # noqa: E402
    FROZEN_LANG_ORDER,
    FROZEN_LANG_ORDER_V1,
    FROZEN_LANG_ORDER_V2,
    LANG_PALETTE_VERSION,
    collect_normalized_language_codes,
)
from tools.pack_monthly_embedding_bundle import main as pack_bundle  # noqa: E402

_BUNDLE_NAMES = ("cleaned.csv", "text_embeddings.npy", "genre_vectors.npy", "language_vectors.npy")
_SOURCE_PALETTES: dict[str, tuple[str, ...]] = {
    "v1": FROZEN_LANG_ORDER_V1,
    "v2": FROZEN_LANG_ORDER_V2,
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _assert_unique_order(order: Sequence[str], *, label: str) -> None:
    assert order, f"{label} must not be empty"
    assert len(order) == len(set(order)), f"{label} contains duplicate language codes"


def migrate_language_matrix(
    matrix: np.ndarray,
    *,
    source_order: Sequence[str],
    target_order: Sequence[str],
) -> np.ndarray:
    """Copy each source language column to the matching target column."""
    _assert_unique_order(source_order, label="source_order")
    _assert_unique_order(target_order, label="target_order")
    assert matrix.ndim == 2, f"language matrix must be 2D, got {matrix.shape}"
    assert matrix.shape[1] == len(source_order), (
        f"source width {matrix.shape[1]} != source palette width {len(source_order)}"
    )
    missing = sorted(set(source_order) - set(target_order))
    assert not missing, f"target palette removed source codes: {missing}"
    assert np.isfinite(matrix).all(), "source language matrix contains NaN or Inf"

    target_index = {code: index for index, code in enumerate(target_order)}
    migrated = np.zeros((matrix.shape[0], len(target_order)), dtype=matrix.dtype)
    for source_index, code in enumerate(source_order):
        migrated[:, target_index[code]] = matrix[:, source_index]

    for source_index, code in enumerate(source_order):
        assert np.array_equal(matrix[:, source_index], migrated[:, target_index[code]]), (
            f"column migration changed values for {code!r}"
        )
    added_codes = sorted(set(target_order) - set(source_order))
    for code in added_codes:
        assert not np.any(migrated[:, target_index[code]]), f"new column {code!r} must initialize to zero"

    source_norms = np.linalg.norm(matrix.astype(np.float64, copy=False), axis=1)
    target_norms = np.linalg.norm(migrated.astype(np.float64, copy=False), axis=1)
    assert np.allclose(source_norms, target_norms, atol=0.0), "row norms changed during language migration"
    assert np.isfinite(migrated).all(), "migrated language matrix contains NaN or Inf"
    return migrated


def _assert_matrix(
    matrix: np.ndarray,
    *,
    name: str,
    expected_rows: int,
    expected_width: int | None = None,
) -> None:
    assert matrix.ndim == 2, f"{name} must be 2D, got {matrix.shape}"
    assert matrix.shape[0] == expected_rows, f"{name} rows {matrix.shape[0]} != cleaned rows {expected_rows}"
    if expected_width is not None:
        assert matrix.shape[1] == expected_width, f"{name} width {matrix.shape[1]} != {expected_width}"
    assert np.isfinite(matrix).all(), f"{name} contains NaN or Inf"
    print(
        f"[palette-migrate] {name}.shape={matrix.shape} "
        f"min={float(matrix.min()):.6g} max={float(matrix.max()):.6g}",
        flush=True,
    )


def migrate_bundle(
    source_dir: Path,
    output_dir: Path,
    *,
    source_version: str,
    overwrite: bool = False,
) -> dict[str, object]:
    source_dir = source_dir.expanduser().resolve()
    output_dir = output_dir.expanduser().resolve()
    if source_dir == output_dir or source_dir in output_dir.parents or output_dir in source_dir.parents:
        raise ValueError("source and output directories must be separate, non-nested paths")

    source_order = _SOURCE_PALETTES[source_version]
    target_order = FROZEN_LANG_ORDER
    assert source_version != LANG_PALETTE_VERSION, "source and active palette versions must differ"

    source_paths = {name: source_dir / name for name in _BUNDLE_NAMES}
    missing_files = [str(path) for path in source_paths.values() if not path.is_file()]
    if missing_files:
        raise FileNotFoundError(f"source bundle is incomplete: {missing_files}")
    if output_dir.exists():
        if not overwrite:
            raise FileExistsError(f"output directory already exists: {output_dir}")
        assert output_dir != source_dir, "output directory must differ from source directory"
        shutil.rmtree(output_dir)

    cleaned = pd.read_csv(source_paths["cleaned.csv"])
    assert not cleaned.empty, "cleaned.csv must not be empty"
    assert "id" in cleaned.columns, "cleaned.csv must include id"
    assert "original_language" in cleaned.columns, "cleaned.csv must include original_language"
    assert cleaned["id"].is_unique, "cleaned.csv must have unique TMDB ids"
    found_languages = collect_normalized_language_codes(cleaned["original_language"])
    unknown_source = sorted(found_languages - set(source_order))
    assert not unknown_source, f"cleaned.csv contains codes outside source palette {source_version}: {unknown_source}"

    text = np.load(source_paths["text_embeddings.npy"])
    genre = np.load(source_paths["genre_vectors.npy"])
    language = np.load(source_paths["language_vectors.npy"])
    row_count = len(cleaned)
    print(f"[palette-migrate] cleaned.shape={cleaned.shape}", flush=True)
    _assert_matrix(text, name="text", expected_rows=row_count, expected_width=384)
    _assert_matrix(genre, name="genre", expected_rows=row_count)
    _assert_matrix(language, name="language.source", expected_rows=row_count, expected_width=len(source_order))

    migrated_language = migrate_language_matrix(
        language,
        source_order=source_order,
        target_order=target_order,
    )
    _assert_matrix(
        migrated_language,
        name="language.target",
        expected_rows=row_count,
        expected_width=len(target_order),
    )

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f".{output_dir.name}-", dir=output_dir.parent) as temporary:
        staging = Path(temporary) / output_dir.name
        staging.mkdir()
        shutil.copy2(source_paths["cleaned.csv"], staging / "cleaned.csv")
        shutil.copy2(source_paths["text_embeddings.npy"], staging / "text_embeddings.npy")
        shutil.copy2(source_paths["genre_vectors.npy"], staging / "genre_vectors.npy")
        np.save(staging / "language_vectors.npy", migrated_language)

        output_hashes = {name: _sha256(staging / name) for name in _BUNDLE_NAMES}
        manifest: dict[str, object] = {
            "schema_version": 1,
            "method": "exact-language-column-insertion-v1",
            "source_palette_version": source_version,
            "target_palette_version": LANG_PALETTE_VERSION,
            "source_language_width": len(source_order),
            "target_language_width": len(target_order),
            "added_codes": sorted(set(target_order) - set(source_order)),
            "row_count": row_count,
            "source_hashes": {name: _sha256(path) for name, path in source_paths.items()},
            "output_hashes": output_hashes,
        }
        (staging / "language_palette_migration_manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        os.replace(staging, output_dir)

    return manifest


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True, help="Directory containing the source bundle")
    parser.add_argument("--output-dir", type=Path, required=True, help="New directory for the migrated bundle")
    parser.add_argument("--source-version", choices=sorted(_SOURCE_PALETTES), required=True)
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace an existing output directory after verifying it is not the source directory",
    )
    parser.add_argument(
        "--zip-out",
        type=Path,
        default=None,
        help="Canonical zip output; defaults to <output-dir>/monthly_refit_embedding_bundle.zip",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    source_dir = args.source_dir.expanduser().resolve()
    output_dir = args.output_dir.expanduser().resolve()
    zip_out = (
        args.zip_out.expanduser().resolve()
        if args.zip_out is not None
        else output_dir / "monthly_refit_embedding_bundle.zip"
    )

    manifest = migrate_bundle(
        source_dir,
        output_dir,
        source_version=str(args.source_version),
        overwrite=bool(args.overwrite),
    )
    result = pack_bundle(["--cache-dir", str(output_dir), "--out", str(zip_out)])
    if result != 0:
        return result

    manifest["zip"] = {
        "path": zip_out.name,
        "size_bytes": zip_out.stat().st_size,
        "sha256": _sha256(zip_out),
    }
    (output_dir / "language_palette_migration_manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        f"[palette-migrate] complete source={args.source_version}:{manifest['source_language_width']} "
        f"target={LANG_PALETTE_VERSION}:{manifest['target_language_width']} "
        f"rows={manifest['row_count']} zip_sha256={manifest['zip']['sha256']}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())