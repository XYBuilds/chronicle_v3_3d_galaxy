#!/usr/bin/env python3
"""Phase 2.3: L2-normalized one-hot vectors for original_language (dynamic N_lang)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

_REPO_ROOT = Path(__file__).resolve().parents[2]

# Bucket for missing/blank cells (still one-hot + L2-norm ≈ 1)
UNKNOWN_LANG = "__unknown__"


def l2_normalize_rows(x: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    out = x / np.clip(norms, 1e-12, None)
    return out.astype(np.float32, copy=False)


def _strip_cell(v: object) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return ""
    s = str(v).strip()
    if s.lower() in ("nan", "none", ""):
        return ""
    return s


def normalize_language_code(cell: object) -> str:
    """TMDB ISO 639-1 codes; empty → UNKNOWN_LANG for a stable vocabulary slot."""
    raw = _strip_cell(cell)
    if not raw:
        return UNKNOWN_LANG
    return raw


def collect_sorted_languages(series: pd.Series) -> list[str]:
    found: set[str] = set()
    for cell in series.astype(object):
        found.add(normalize_language_code(cell))
    return sorted(found)


def one_hot_language_matrix(series: pd.Series, lang_order: list[str]) -> np.ndarray:
    """Shape (n, N_lang): standard one-hot (exactly one 1.0 per row before L2 norm)."""
    idx_map = {code: i for i, code in enumerate(lang_order)}
    n_lang = len(lang_order)
    n = len(series)
    mat = np.zeros((n, n_lang), dtype=np.float64)
    for r, cell in enumerate(series.astype(object)):
        code = normalize_language_code(cell)
        if code not in idx_map:
            raise KeyError(f"Unknown language code {code!r} (not in fitted vocabulary)")
        mat[r, idx_map[code]] = 1.0
    return mat


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Compute L2-normalized one-hot original_language features (Phase 2.3)."
    )
    p.add_argument(
        "--input",
        type=Path,
        default=_REPO_ROOT / "data" / "output" / "cleaned.csv",
        help="Cleaned CSV (must include original_language column)",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=_REPO_ROOT / "data" / "output" / "language_vectors.npy",
        help="Output float32 array of shape (n_rows, N_lang)",
    )
    p.add_argument(
        "--meta-output",
        type=Path,
        default=None,
        help="Optional JSON: language column order (for downstream fusion)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    inp = args.input.expanduser().resolve()
    out_path = args.output.expanduser().resolve()

    if not inp.is_file():
        print(f"Error: input CSV not found: {inp}", file=sys.stderr)
        return 1

    df = pd.read_csv(inp)
    if "original_language" not in df.columns:
        print("Error: column 'original_language' missing from CSV", file=sys.stderr)
        return 1

    n = len(df)
    lang_order = collect_sorted_languages(df["original_language"])
    n_lang = len(lang_order)

    counts: dict[str, int] = {}
    for cell in df["original_language"].astype(object):
        code = normalize_language_code(cell)
        counts[code] = counts.get(code, 0) + 1
    by_freq = sorted(counts.keys(), key=lambda c: (-counts[c], c))
    top_10 = by_freq[:10]
    suffix = " ..." if n_lang > 10 else ""
    print(f"[Language] Unique languages: {n_lang} -> {top_10}{suffix}")

    raw = one_hot_language_matrix(df["original_language"], lang_order)
    encoded = l2_normalize_rows(raw)

    print(f"Output shape: ({n}, {n_lang})")

    if encoded.shape != (n, n_lang):
        raise AssertionError(f"Expected shape ({n}, {n_lang}), got {encoded.shape}")

    nnz_per_row = np.count_nonzero(encoded, axis=1)
    if not np.all(nnz_per_row == 1):
        bad = np.where(nnz_per_row != 1)[0]
        raise AssertionError(f"Each row must have exactly one non-zero; bad rows (first 10): {bad[:10].tolist()}")

    norms = np.linalg.norm(encoded, axis=1)
    if not np.allclose(norms, 1.0, atol=1e-4):
        bad = np.where(~np.isclose(norms, 1.0, atol=1e-4))[0]
        raise AssertionError(f"Row L2 norms not ~1.0 (atol=1e-4); bad indices (first 10): {bad[:10].tolist()}")

    if np.isnan(encoded).any():
        raise AssertionError("Encoded matrix contains NaN")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(out_path, encoded)
    mb = out_path.stat().st_size / (1024 * 1024)
    print(f"[Language] Wrote {out_path} ({encoded.shape}, {mb:.2f} MB)")

    if args.meta_output is not None:
        meta_path = args.meta_output.expanduser().resolve()
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "languages": lang_order,
            "unknown_token": UNKNOWN_LANG,
            "n_rows": n,
            "n_lang": n_lang,
        }
        meta_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"[Language] Wrote meta {meta_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
