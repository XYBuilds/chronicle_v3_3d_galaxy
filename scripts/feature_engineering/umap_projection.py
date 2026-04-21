#!/usr/bin/env python3
"""Phase 2.4: multi-modal fusion (1/sqrt(d) scaling + modal weights) + UMAP -> 2D coordinates."""
from __future__ import annotations

import argparse
import inspect
import os
import sys
from pathlib import Path
from typing import Any, Literal

import joblib
import numpy as np

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_TEXT = _REPO_ROOT / "data" / "output" / "text_embeddings.npy"
_DEFAULT_GENRE = _REPO_ROOT / "data" / "output" / "genre_vectors.npy"
_DEFAULT_LANG = _REPO_ROOT / "data" / "output" / "language_vectors.npy"
_DEFAULT_XY = _REPO_ROOT / "data" / "output" / "umap_xy.npy"
_DEFAULT_MODEL = _REPO_ROOT / "data" / "output" / "umap_model.pkl"

BackendName = Literal["umap", "cuml"]


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


def _cuda_visible_devices_allows_gpu() -> bool:
    """Empty CUDA_VISIBLE_DEVICES means no GPU is visible to CUDA RT APIs."""
    if os.environ.get("CUDA_VISIBLE_DEVICES") == "":
        return False
    return True


def _gpu_device_count() -> int:
    try:
        import cupy as cp

        return int(cp.cuda.runtime.getDeviceCount())
    except Exception:
        return 0


def infer_auto_backend() -> BackendName:
    """Prefer cuML on a visible CUDA device when cuML is importable; else umap-learn (CPU)."""
    if not _cuda_visible_devices_allows_gpu():
        return "umap"
    if _gpu_device_count() < 1:
        return "umap"
    try:
        import cuml  # noqa: F401
    except ImportError:
        return "umap"
    return "cuml"


def _resolve_backend(requested: str) -> BackendName:
    if requested == "auto":
        return infer_auto_backend()
    if requested in ("umap", "cuml"):
        return requested  # type: ignore[return-value]
    raise ValueError(f"Unknown backend: {requested!r}")


def _ensure_cuml_runtime(*, backend: BackendName) -> None:
    if backend != "cuml":
        return
    try:
        import cuml  # noqa: F401
    except ImportError as e:
        print(
            "Error: backend cuml requires RAPIDS cuML (e.g. conda env from scripts/env/rapids_env.yml).",
            file=sys.stderr,
        )
        raise SystemExit(1) from e
    if not _cuda_visible_devices_allows_gpu() or _gpu_device_count() < 1:
        print(
            "Error: backend cuml requires a visible CUDA GPU "
            "(check nvidia-smi, WSL GPU, and CUDA_VISIBLE_DEVICES).",
            file=sys.stderr,
        )
        raise SystemExit(1)


def _fit_umap_learn(
    combined: np.ndarray,
    *,
    n_neighbors: int,
    min_dist: float,
    metric: str,
    random_state: int,
    densmap: bool,
    umap_verbose: bool,
) -> tuple[np.ndarray, Any]:
    import umap  # umap-learn; optional on GPU-only conda envs (cuml path does not import this)

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=n_neighbors,
        min_dist=float(min_dist),
        metric=str(metric),
        random_state=int(random_state),
        densmap=bool(densmap),
        n_jobs=1,
        verbose=bool(umap_verbose),
    )
    xy = reducer.fit_transform(combined)
    xy = np.asarray(xy, dtype=np.float32)
    return xy, reducer


def _fit_cuml(
    combined: np.ndarray,
    *,
    n_neighbors: int,
    min_dist: float,
    metric: str,
    random_state: int,
    umap_verbose: bool,
) -> tuple[np.ndarray, Any]:
    from cuml.manifold import UMAP as CumlUMAP

    X = np.asarray(combined, dtype=np.float32, order="C")
    # cuML mirrors umap-learn hyperparameters; output_type='numpy' keeps downstream float32 (n, 2).
    # DensMAP is not supported on GPU UMAP in RAPIDS (see cuml/manifold/umap.pyx); handled in main().
    kw: dict[str, Any] = {
        "n_components": 2,
        "n_neighbors": n_neighbors,
        "min_dist": float(min_dist),
        "metric": str(metric),
        "random_state": int(random_state),
        "output_type": "numpy",
    }
    if umap_verbose:
        kw["verbose"] = True
    try:
        reducer = CumlUMAP(**kw)
    except TypeError:
        kw.pop("verbose", None)
        reducer = CumlUMAP(**kw)
    xy = reducer.fit_transform(X)
    xy = np.asarray(xy, dtype=np.float32)
    return xy, reducer


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
        "--backend",
        type=str,
        default="auto",
        choices=("auto", "umap", "cuml"),
        help="UMAP implementation: umap-learn (CPU), cuml (GPU), or auto "
        "(cuML when CUDA_VISIBLE_DEVICES allows a GPU and cuML is installed)",
    )
    p.add_argument(
        "--densmap",
        action="store_true",
        help="Enable DensMAP (umap-learn CPU). cuML GPU UMAP does not implement DensMAP — we fall back to umap-learn for this step.",
    )
    p.add_argument(
        "--n-neighbors",
        type=int,
        default=15,
        help="UMAP n_neighbors (capped to n_samples-1 automatically)",
    )
    p.add_argument(
        "--min-dist",
        type=float,
        default=0.4,
        help="UMAP min_dist (Phase 5.2.1: 0.3–0.5 reduces local clump density; keep export meta in sync)",
    )
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

    backend = _resolve_backend(str(args.backend))
    fit_backend: BackendName = backend

    if str(args.backend) == "auto":
        print(f"[UMAP] backend auto -> {backend} (CUDA_VISIBLE_DEVICES={os.environ.get('CUDA_VISIBLE_DEVICES', '<unset>')!r})")
    else:
        print(f"[UMAP] backend {backend}")

    if backend == "cuml" and bool(args.densmap):
        print(
            "[UMAP] cuML GPU UMAP does not support DensMAP; using umap-learn (CPU) for Phase 2.4 "
            "(embeddings already ran on GPU in Phase 2.1).",
            flush=True,
        )
        fit_backend = "umap"
    if fit_backend != backend:
        print(f"[UMAP] effective fit backend -> {fit_backend}", flush=True)

    _ensure_cuml_runtime(backend=fit_backend)

    nn = _umap_n_neighbors(n, args.n_neighbors)
    if fit_backend == "umap":
        xy, reducer = _fit_umap_learn(
            combined,
            n_neighbors=nn,
            min_dist=float(args.min_dist),
            metric=str(args.metric),
            random_state=int(args.random_state),
            densmap=bool(args.densmap),
            umap_verbose=bool(args.umap_verbose),
        )
    else:
        xy, reducer = _fit_cuml(
            combined,
            n_neighbors=nn,
            min_dist=float(args.min_dist),
            metric=str(args.metric),
            random_state=int(args.random_state),
            umap_verbose=bool(args.umap_verbose),
        )
        if not np.isfinite(xy).all():
            print(
                "[UMAP] cuML returned non-finite coordinates (observed on very small n); "
                "falling back to umap-learn (CPU).",
                flush=True,
            )
            xy, reducer = _fit_umap_learn(
                combined,
                n_neighbors=nn,
                min_dist=float(args.min_dist),
                metric=str(args.metric),
                random_state=int(args.random_state),
                densmap=bool(args.densmap),
                umap_verbose=bool(args.umap_verbose),
            )

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
