#!/usr/bin/env python3
"""P8.2: UMAP min_dist sweep on full fused embeddings; export z∈[2020,2026) subsets per min_dist.

Strategy (Phase 8 plan): reuse the same text/genre/lang matrices as production, **re-fit UMAP only**
for each min_dist ∈ {0.5, 0.7, 0.9}, then export via ``export_galaxy_json.py`` with a decimal-year z band.

Requires existing ``data/output/cleaned.csv`` and ``text_embeddings.npy`` / ``genre_vectors.npy`` /
``language_vectors.npy`` (same row order). Does **not** read ``data/raw/`` directly.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

import numpy as np

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from feature_engineering.genre_encoding import DEFAULT_GENRE_WEIGHT_RATIO  # noqa: E402
from feature_engineering.umap_projection import (  # noqa: E402
    BackendName,
    _ensure_cuml_runtime,
    _fit_cuml,
    _fit_umap_learn,
    _resolve_backend,
    _umap_n_neighbors,
    fuse_modalities,
)

_DEFAULT_TEXT = _REPO_ROOT / "data" / "output" / "text_embeddings.npy"
_DEFAULT_GENRE = _REPO_ROOT / "data" / "output" / "genre_vectors.npy"
_DEFAULT_LANG = _REPO_ROOT / "data" / "output" / "language_vectors.npy"
_DEFAULT_CSV = _REPO_ROOT / "data" / "output" / "cleaned.csv"
_DEFAULT_OUT_DIR = _REPO_ROOT / "frontend" / "public" / "data" / "experiments"
_EXPORT_SCRIPT = _REPO_ROOT / "scripts" / "export" / "export_galaxy_json.py"

_MIN_DISTS: tuple[float, ...] = (0.5, 0.7, 0.9)
_TAG_BY_MIN_DIST: dict[float, str] = {0.5: "mindist05", 0.7: "mindist07", 0.9: "mindist09"}


def _fit_umap_for_min_dist(
    combined: np.ndarray,
    *,
    min_dist: float,
    n_neighbors: int,
    metric: str,
    random_state: int,
    densmap: bool,
    backend: str,
    umap_verbose: bool,
) -> np.ndarray:
    n = combined.shape[0]
    assert combined.ndim == 2 and n > 2, f"combined must be (n, d), got {combined.shape}"
    resolved = _resolve_backend(str(backend))
    fit_backend: BackendName = resolved
    if str(backend) == "auto":
        print(
            f"[P8.2 min_dist={min_dist}] backend auto -> {resolved} "
            f"(CUDA_VISIBLE_DEVICES={os.environ.get('CUDA_VISIBLE_DEVICES', '<unset>')!r})"
        )
    else:
        print(f"[P8.2 min_dist={min_dist}] backend {resolved}")
    if resolved == "cuml" and densmap:
        print(
            "[P8.2] cuML does not support DensMAP; falling back to umap-learn (CPU) for this fit.",
            flush=True,
        )
        fit_backend = "umap"
    _ensure_cuml_runtime(backend=fit_backend)
    nn = _umap_n_neighbors(n, n_neighbors)
    if fit_backend == "umap":
        xy, _ = _fit_umap_learn(
            combined,
            n_neighbors=nn,
            min_dist=float(min_dist),
            metric=str(metric),
            random_state=int(random_state),
            densmap=bool(densmap),
            umap_verbose=bool(umap_verbose),
        )
    else:
        xy, _ = _fit_cuml(
            combined,
            n_neighbors=nn,
            min_dist=float(min_dist),
            metric=str(metric),
            random_state=int(random_state),
            umap_verbose=bool(umap_verbose),
        )
        if not np.isfinite(xy).all():
            print("[P8.2] cuML returned non-finite values; retrying umap-learn (CPU).", flush=True)
            xy, _ = _fit_umap_learn(
                combined,
                n_neighbors=nn,
                min_dist=float(min_dist),
                metric=str(metric),
                random_state=int(random_state),
                densmap=bool(densmap),
                umap_verbose=bool(umap_verbose),
            )
    xy = np.asarray(xy, dtype=np.float32)
    assert xy.shape == (n, 2), f"UMAP output shape {xy.shape} != ({n}, 2)"
    assert np.isfinite(xy).all(), "UMAP output contains non-finite values"
    return xy


def _run_export_subprocess(
    *,
    xy_npy: Path,
    min_dist: float,
    out_gz: Path,
    csv_path: Path,
    n_neighbors: int,
    w_text: float,
    w_genre: float,
    w_lang: float,
    metric: str,
    random_state: int,
    densmap: bool,
    embedding_model: str,
    genre_weight_ratio: float,
    z_min_inclusive: float,
    z_max_exclusive: float,
) -> None:
    dummy_json = out_gz.with_name(out_gz.stem)  # e.g. …/galaxy_data.mindist05.json
    cmd = [
        sys.executable,
        str(_EXPORT_SCRIPT),
        "--input",
        str(csv_path),
        "--xy-input",
        str(xy_npy),
        "--min-dist",
        str(min_dist),
        "--n-neighbors",
        str(n_neighbors),
        "--w-text",
        str(w_text),
        "--w-genre",
        str(w_genre),
        "--w-lang",
        str(w_lang),
        "--metric",
        str(metric),
        "--random-state",
        str(random_state),
        "--embedding-model",
        str(embedding_model),
        "--genre-weight-ratio",
        str(genre_weight_ratio),
        "--subset-z-min-inclusive",
        str(z_min_inclusive),
        "--subset-z-max-exclusive",
        str(z_max_exclusive),
        "--output-json",
        str(dummy_json),
        "--output-gzip",
        str(out_gz),
        "--gzip-only",
    ]
    if densmap:
        cmd.append("--densmap")
    print(f"[P8.2] subprocess: {' '.join(cmd)}", flush=True)
    subprocess.check_call(cmd, cwd=str(_REPO_ROOT))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="P8.2 UMAP min_dist sweep: emit galaxy_data.mindist05|07|09.json.gz (z-year subset export)."
    )
    p.add_argument("--text-input", type=Path, default=_DEFAULT_TEXT)
    p.add_argument("--genre-input", type=Path, default=_DEFAULT_GENRE)
    p.add_argument("--lang-input", type=Path, default=_DEFAULT_LANG)
    p.add_argument("--csv-input", type=Path, default=_DEFAULT_CSV)
    p.add_argument("--out-dir", type=Path, default=_DEFAULT_OUT_DIR)
    p.add_argument("--backend", type=str, default="auto", choices=("auto", "umap", "cuml"))
    p.add_argument("--n-neighbors", type=int, default=15)
    p.add_argument("--w-text", type=float, default=1.0)
    p.add_argument("--w-genre", type=float, default=1.0)
    p.add_argument("--w-lang", type=float, default=1.0)
    p.add_argument("--metric", type=str, default="cosine")
    p.add_argument("--random-state", type=int, default=42)
    p.add_argument("--densmap", action="store_true")
    p.add_argument("--umap-verbose", action="store_true")
    p.add_argument("--embedding-model", type=str, default="paraphrase-multilingual-MiniLM-L12-v2")
    p.add_argument("--genre-weight-ratio", type=float, default=DEFAULT_GENRE_WEIGHT_RATIO)
    p.add_argument(
        "--subset-z-min-inclusive",
        type=float,
        default=2020.0,
        help="Decimal-year lower bound (inclusive), default 2020.0",
    )
    p.add_argument(
        "--subset-z-max-exclusive",
        type=float,
        default=2026.0,
        help="Decimal-year upper bound (exclusive), default 2026.0 → calendar years 2020–2025",
    )
    p.add_argument(
        "--keep-xy-npy",
        action="store_true",
        help="Keep intermediate umap_xy_*.npy under out-dir (default: delete after each export)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    text_path = args.text_input.expanduser().resolve()
    genre_path = args.genre_input.expanduser().resolve()
    lang_path = args.lang_input.expanduser().resolve()
    csv_path = args.csv_input.expanduser().resolve()
    out_dir = args.out_dir.expanduser().resolve()

    for label, pth in ("text", text_path), ("genre", genre_path), ("lang", lang_path), ("csv", csv_path):
        if not pth.is_file():
            print(f"Error: {label} input not found: {pth}", file=sys.stderr)
            return 1

    text = np.load(text_path)
    genre = np.load(genre_path)
    lang = np.load(lang_path)
    if text.ndim != 2 or genre.ndim != 2 or lang.ndim != 2:
        raise ValueError("Embeddings must be 2-D arrays")
    n_text = text.shape[0]
    assert n_text == genre.shape[0] == lang.shape[0], "Row count mismatch across modality npy files"
    print(f"[P8.2] modality shapes: text={text.shape}, genre={genre.shape}, lang={lang.shape}")

    combined, scale_text, scale_genre, scale_lang = fuse_modalities(
        text,
        genre,
        lang,
        w_text=args.w_text,
        w_genre=args.w_genre,
        w_lang=args.w_lang,
    )
    print(
        f"[P8.2] fused combined.shape={combined.shape} "
        f"(scale_text={scale_text:.6f}, scale_genre={scale_genre:.6f}, scale_lang={scale_lang:.6f})"
    )
    assert combined.shape[0] == n_text and combined.shape[1] > 0

    out_dir.mkdir(parents=True, exist_ok=True)

    for md in _MIN_DISTS:
        tag = _TAG_BY_MIN_DIST[md]
        xy = _fit_umap_for_min_dist(
            combined,
            min_dist=md,
            n_neighbors=int(args.n_neighbors),
            metric=str(args.metric),
            random_state=int(args.random_state),
            densmap=bool(args.densmap),
            backend=str(args.backend),
            umap_verbose=bool(args.umap_verbose),
        )
        xmin, xmax = float(xy[:, 0].min()), float(xy[:, 0].max())
        ymin, ymax = float(xy[:, 1].min()), float(xy[:, 1].max())
        print(f"[P8.2 min_dist={md}] UMAP xy range X[{xmin:.4f},{xmax:.4f}] Y[{ymin:.4f},{ymax:.4f}]")

        xy_npy = out_dir / f"_umap_xy_{tag}.npy"
        np.save(xy_npy, xy)
        out_gz = out_dir / f"galaxy_data.{tag}.json.gz"

        _run_export_subprocess(
            xy_npy=xy_npy,
            min_dist=md,
            out_gz=out_gz,
            csv_path=csv_path,
            n_neighbors=int(args.n_neighbors),
            w_text=float(args.w_text),
            w_genre=float(args.w_genre),
            w_lang=float(args.w_lang),
            metric=str(args.metric),
            random_state=int(args.random_state),
            densmap=bool(args.densmap),
            embedding_model=str(args.embedding_model),
            genre_weight_ratio=float(args.genre_weight_ratio),
            z_min_inclusive=float(args.subset_z_min_inclusive),
            z_max_exclusive=float(args.subset_z_max_exclusive),
        )

        gz_bytes = out_gz.stat().st_size
        print(
            f"[P8.2 min_dist={md}] wrote {out_gz} ({gz_bytes:,} bytes). "
            f"Dev: ?dataset={tag} (npm run dev)"
        )

        if not args.keep_xy_npy:
            xy_npy.unlink(missing_ok=True)

    print(
        "[P8.2] Done. Compare in browser with e.g. "
        "`?dataset=mindist05`, `?dataset=mindist07`, `?dataset=mindist09` "
        "(omit param for production galaxy_data.json.gz)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
