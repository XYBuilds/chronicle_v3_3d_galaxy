#!/usr/bin/env python3
"""Phase 2.2: rank-weighted genre vectors (golden-ratio decay, L2 per row)."""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

_REPO_ROOT = Path(__file__).resolve().parents[2]

# Default geometric ratio q = 1/φ (Tech Spec §2.1.2)
PHI = (1.0 + math.sqrt(5.0)) / 2.0
DEFAULT_GENRE_WEIGHT_RATIO = 1.0 / PHI


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


def parse_genre_list(cell: object) -> list[str]:
    """Split TMDB genres field on comma; preserve API order; trim whitespace."""
    raw = _strip_cell(cell)
    if not raw:
        return []
    return [p.strip() for p in raw.split(",") if p.strip()]


def collect_sorted_genres(series: pd.Series) -> list[str]:
    found: set[str] = set()
    for cell in series.astype(object):
        for g in parse_genre_list(cell):
            found.add(g)
    return sorted(found)


def rank_weighted_genre_matrix(
    series: pd.Series,
    genre_order: list[str],
    *,
    weight_ratio: float,
) -> np.ndarray:
    """Shape (n, N_genre): sum_k w_k * one_hot(genre_k), w_k = weight_ratio ** (k-1)."""
    if not (0.0 < weight_ratio < 1.0):
        raise ValueError(f"weight_ratio must be in (0, 1), got {weight_ratio}")
    idx_map = {g: i for i, g in enumerate(genre_order)}
    n_genre = len(genre_order)
    n = len(series)
    mat = np.zeros((n, n_genre), dtype=np.float64)
    for r, cell in enumerate(series.astype(object)):
        labels = parse_genre_list(cell)
        for k, g in enumerate(labels, start=1):
            if g not in idx_map:
                raise KeyError(f"Unknown genre label {g!r} (not in fitted vocabulary)")
            w = weight_ratio ** (k - 1)
            mat[r, idx_map[g]] += w
    return mat


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Compute L2-normalized rank-weighted genre feature rows (Phase 2.2)."
    )
    p.add_argument(
        "--input",
        type=Path,
        default=_REPO_ROOT / "data" / "output" / "cleaned.csv",
        help="Cleaned CSV (must include genres column)",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=_REPO_ROOT / "data" / "output" / "genre_vectors.npy",
        help="Output float32 array of shape (n_rows, N_genre)",
    )
    p.add_argument(
        "--meta-output",
        type=Path,
        default=None,
        help="Optional JSON: genre column order + weight_ratio (for downstream fusion)",
    )
    p.add_argument(
        "--genre-weight-ratio",
        type=float,
        default=DEFAULT_GENRE_WEIGHT_RATIO,
        help="Geometric decay q per rank step (default: 1/φ)",
    )
    return p.parse_args(argv)


def _pick_demo_row(df: pd.DataFrame) -> int | None:
    """Prefer a row whose first genres are Comedy, Drama, Romance (TMDB order)."""
    want = ("Comedy", "Drama", "Romance")
    for i, cell in enumerate(df["genres"].astype(object)):
        labels = parse_genre_list(cell)
        if len(labels) >= 3 and tuple(labels[:3]) == want:
            return i
    for i, cell in enumerate(df["genres"].astype(object)):
        if len(parse_genre_list(cell)) >= 2:
            return i
    return None


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    inp = args.input.expanduser().resolve()
    out_path = args.output.expanduser().resolve()
    q = float(args.genre_weight_ratio)

    if not inp.is_file():
        print(f"Error: input CSV not found: {inp}", file=sys.stderr)
        return 1

    df = pd.read_csv(inp)
    if "genres" not in df.columns:
        print("Error: column 'genres' missing from CSV", file=sys.stderr)
        return 1

    n = len(df)
    genre_order = collect_sorted_genres(df["genres"])
    n_genre = len(genre_order)

    print(f"[Genre] Unique genres: {n_genre} -> {genre_order}")
    print(f"[Genre] genre_weight_ratio (q): {q:.10f} (default 1/phi approx {DEFAULT_GENRE_WEIGHT_RATIO:.10f})")

    raw = rank_weighted_genre_matrix(df["genres"], genre_order, weight_ratio=q)
    encoded = l2_normalize_rows(raw)

    print(f"Output shape: ({n}, {n_genre})")

    if encoded.shape != (n, n_genre):
        raise AssertionError(f"Expected shape ({n}, {n_genre}), got {encoded.shape}")

    norms = np.linalg.norm(encoded, axis=1)
    if not np.allclose(norms, 1.0, atol=1e-4):
        bad = np.where(~np.isclose(norms, 1.0, atol=1e-4))[0]
        raise AssertionError(f"Row L2 norms not ~1.0 (atol=1e-4); bad indices (first 10): {bad[:10].tolist()}")

    demo_i = _pick_demo_row(df)
    if demo_i is not None:
        labels = parse_genre_list(df["genres"].iloc[demo_i])
        raw_row = raw[demo_i].copy()
        enc_row = encoded[demo_i].copy()
        title = df["title"].iloc[demo_i] if "title" in df.columns else f"row {demo_i}"
        print(f"[Genre] Demo row index={demo_i} title={title!r}")
        print(f"[Genre] Genres (rank order): {labels}")
        print("[Genre] Raw weighted vector (aligned with sorted genre columns):")
        for g, val in zip(genre_order, raw_row):
            if val != 0.0:
                print(f"    {g}: {val:.6f}")
        if len(labels) >= 3 and tuple(labels[:3]) == ("Comedy", "Drama", "Romance"):
            e_c = genre_order.index("Comedy")
            e_d = genre_order.index("Drama")
            e_r = genre_order.index("Romance")
            print(
                f"[Genre] Checkpoint (Comedy, Drama, Romance): "
                f"raw Comedy={raw_row[e_c]:.6f} (expect 1.0), "
                f"Drama={raw_row[e_d]:.6f} (expect {q:.6f}), "
                f"Romance={raw_row[e_r]:.6f} (expect {q**2:.6f})"
            )
        print("[Genre] L2-normalized non-zero entries:")
        for g, val in zip(genre_order, enc_row):
            if val != 0.0:
                print(f"    {g}: {val:.6f}")

    if np.isnan(encoded).any():
        raise AssertionError("Encoded matrix contains NaN")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(out_path, encoded)
    mb = out_path.stat().st_size / (1024 * 1024)
    print(f"[Genre] Wrote {out_path} ({encoded.shape}, {mb:.2f} MB)")

    if args.meta_output is not None:
        meta_path = args.meta_output.expanduser().resolve()
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "genres": genre_order,
            "genre_weight_ratio": q,
            "n_rows": n,
            "n_genre": n_genre,
        }
        meta_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print(f"[Genre] Wrote meta {meta_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
