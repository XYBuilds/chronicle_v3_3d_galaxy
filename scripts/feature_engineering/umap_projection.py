#!/usr/bin/env python3
"""Phase 2.4: multi-modal fusion (1/sqrt(d) scaling + modal weights) + UMAP -> 2D coordinates."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import joblib
import numpy as np
import umap

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_TEXT = _REPO_ROOT / "data" / "output" / "text_embeddings.npy"
_DEFAULT_GENRE = _REPO_ROOT / "data" / "output" / "genre_vectors.npy"
_DEFAULT_LANG = _REPO_ROOT / "data" / "output" / "language_vectors.npy"
_DEFAULT_XY = _REPO_ROOT / "data" / "output" / "umap_xy.npy"
_DEFAULT_MODEL = _REPO_ROOT / "data" / "output" / "umap_model.pkl"


def _scale_block(mat: np.ndarray, *, w: float) -> np.ndarray:
    """Apply per-modality scaling: mat * (1/sqrt(d)) * w (Tech Spec / dev plan Phase 2.4)."""
    d = mat.shape[1]
    if d <= 0:
        raise ValueError("Feature matrix must have at least one column")
    scale = (1.0 / np.sqrt(float(d))) * float(w)
    return (np.asarray(mat, dtype=np.float64) * scale).astype(np.float64, copy=False)


def fuse_modalities(
    text: np.ndarray,
    genre: np.ndarray,
    lang: np.ndarray,
    *,
    w_text: float,
    w_genre: float,
    w_lang: float,
) -> tuple[np.ndarray, float, float, float]:
    """Concatenate scaled blocks; returns (combined, scale_text, scale_genre, scale_lang) as printed scalars."""
    n_t, d_t = text.shape
    n_g, d_g = genre.shape
    n_l, d_l = lang.shape
    if not (n_t == n_g == n_l):
        raise ValueError(f"Row count mismatch: text {n_t}, genre {n_g}, lang {n_l}")
    st = float((1.0 / np.sqrt(float(d_t))) * w_text)
    sg = float((1.0 / np.sqrt(float(d_g))) * w_genre)
    sl = float((1.0 / np.sqrt(float(d_l))) * w_lang)
    a = _scale_block(text, w=w_text)
    b = _scale_block(genre, w=w_genre)
    c = _scale_block(lang, w=w_lang)
    return np.concatenate([a, b, c], axis=1), st, sg, sl


def _umap_n_neighbors(n_samples: int, requested: int) -> int:
    """UMAP requires n_neighbors < n_samples."""
    if n_samples < 3:
        raise ValueError(f"UMAP needs at least 3 samples, got {n_samples}")
    hi = n_samples - 1
    return max(2, min(int(requested), hi))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Fuse text/genre/lang features and run UMAP (Phase 2.4). Saves model .pkl for transform()."
    )
    p.add_argument("--text-input", type=Path, default=_DEFAULT_TEXT, help="text_embeddings.npy (n, 384)")
    p.add_argument("--genre-input", type=Path, default=_DEFAULT_GENRE, help="genre_vectors.npy (n, N_genre)")
    p.add_argument("--lang-input", type=Path, default=_DEFAULT_LANG, help="language_vectors.npy (n, N_lang)")
    p.add_argument("--output-xy", type=Path, default=_DEFAULT_XY, help="Output float32 (n, 2) UMAP coordinates")
    p.add_argument("--model-output", type=Path, default=_DEFAULT_MODEL, help="Fitted UMAP estimator (joblib .pkl)")
    p.add_argument("--w-text", type=float, default=1.0, help="Modal weight for text block (default 1.0)")
    p.add_argument("--w-genre", type=float, default=1.0, help="Modal weight for genre block (default 1.0)")
    p.add_argument("--w-lang", type=float, default=1.0, help="Modal weight for language block (default 1.0)")
    p.add_argument("--random-state", type=int, default=42, help="UMAP random_state (fixed 42 per spec)")
    p.add_argument(
        "--n-neighbors",
        type=int,
        default=15,
        help="UMAP n_neighbors (capped to n_samples-1 automatically)",
    )
    p.add_argument("--min-dist", type=float, default=0.1, help="UMAP min_dist")
    p.add_argument("--metric", type=str, default="cosine", help="UMAP distance metric")
    p.add_argument(
        "--umap-verbose",
        action="store_true",
        help="Print UMAP progress (default: quiet; checkpoints always print)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    text_path = args.text_input.expanduser().resolve()
    genre_path = args.genre_input.expanduser().resolve()
    lang_path = args.lang_input.expanduser().resolve()
    out_xy = args.output_xy.expanduser().resolve()
    out_model = args.model_output.expanduser().resolve()

    for label, pth in ("text", text_path), ("genre", genre_path), ("lang", lang_path):
        if not pth.is_file():
            print(f"Error: {label} input not found: {pth}", file=sys.stderr)
            return 1

    text = np.load(text_path)
    genre = np.load(genre_path)
    lang = np.load(lang_path)

    if text.ndim != 2 or genre.ndim != 2 or lang.ndim != 2:
        raise ValueError("All inputs must be 2-D arrays")

    n = text.shape[0]
    combined, scale_text, scale_genre, scale_lang = fuse_modalities(
        text,
        genre,
        lang,
        w_text=args.w_text,
        w_genre=args.w_genre,
        w_lang=args.w_lang,
    )

    print(
        f"[Fusion] text: {text.shape} * {scale_text:.6f} | "
        f"genre: {genre.shape} * {scale_genre:.6f} | "
        f"lang: {lang.shape} * {scale_lang:.6f}"
    )
    print(f"Combined shape: {combined.shape}")

    nn = _umap_n_neighbors(n, args.n_neighbors)
    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=nn,
        min_dist=float(args.min_dist),
        metric=str(args.metric),
        random_state=int(args.random_state),
        n_jobs=1,
        verbose=bool(args.umap_verbose),
    )
    xy = reducer.fit_transform(combined)
    xy = np.asarray(xy, dtype=np.float32)

    if not np.isfinite(xy).all():
        raise AssertionError("UMAP output contains non-finite values")

    xmin, xmax = float(xy[:, 0].min()), float(xy[:, 0].max())
    ymin, ymax = float(xy[:, 1].min()), float(xy[:, 1].max())
    print(f"[UMAP] Output shape: {xy.shape} | X range: [{xmin:.2f}, {xmax:.2f}] | Y range: [{ymin:.2f}, {ymax:.2f}]")

    out_xy.parent.mkdir(parents=True, exist_ok=True)
    out_model.parent.mkdir(parents=True, exist_ok=True)
    np.save(out_xy, xy)
    joblib.dump(reducer, out_model, compress=3)

    xy_mb = out_xy.stat().st_size / (1024 * 1024)
    model_bytes = out_model.stat().st_size
    model_mb = model_bytes / (1024 * 1024)
    print(f"[UMAP] Wrote coordinates {out_xy} ({xy.shape}, {xy_mb:.4f} MB)")
    print(f"[UMAP] Wrote model {out_model} ({model_bytes:,} bytes, {model_mb:.4f} MB)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
