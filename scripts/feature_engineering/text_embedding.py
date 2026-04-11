#!/usr/bin/env python3
"""Phase 2.1: multilingual text embeddings for TMDB galaxy (overview + tagline)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sentence_transformers import SentenceTransformer

MODEL_ID = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
EMBED_DIM = 384
DEFAULT_MAX_CHARS = 3000
DEFAULT_BATCH_SIZE = 64

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _strip_cell(v: object) -> str:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return ""
    s = str(v).strip()
    if s.lower() in ("nan", "none"):
        return ""
    return s


def build_embedding_text(tagline: object, overview: object, *, max_chars: int) -> str:
    """Tech Spec §2.1.1: two-line tagline+overview or overview-only; truncate from tail (keep head)."""
    ov = _strip_cell(overview)
    tg = _strip_cell(tagline)
    if tg:
        text = f"Tagline: {tg}\nOverview: {ov}"
    else:
        text = f"Overview: {ov}"
    if len(text) > max_chars:
        return text[:max_chars]
    return text


def l2_normalize_rows(x: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(x, axis=1, keepdims=True)
    out = x / np.clip(norms, 1e-12, None)
    return out.astype(np.float32, copy=False)


def resolve_device(name: str) -> str:
    n = name.lower().strip()
    if n == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    if n == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("Device 'cuda' requested but torch.cuda.is_available() is False.")
        return "cuda"
    if n == "cpu":
        return "cpu"
    raise ValueError(f"Unknown device: {name!r} (use auto, cuda, cpu)")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Compute L2-normalized 384d text embeddings (Phase A MiniLM).")
    p.add_argument(
        "--input",
        type=Path,
        default=_REPO_ROOT / "data" / "output" / "cleaned.csv",
        help="Cleaned CSV (must include tagline, overview columns)",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=_REPO_ROOT / "data" / "output" / "text_embeddings.npy",
        help="Output path for float32 array of shape (n_rows, 384)",
    )
    p.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS, help="Max characters after concat (head kept)")
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Encode batch size (lower on OOM)")
    p.add_argument(
        "--device",
        type=str,
        default="auto",
        choices=("auto", "cuda", "cpu"),
        help="Compute device (default: auto — CUDA when available)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    inp = args.input.expanduser().resolve()
    out_path = args.output.expanduser().resolve()

    if not inp.is_file():
        print(f"Error: input CSV not found: {inp}", file=sys.stderr)
        return 1

    device = resolve_device(args.device)
    df = pd.read_csv(inp)
    n = len(df)
    if "overview" not in df.columns:
        print("Error: column 'overview' missing from CSV", file=sys.stderr)
        return 1

    tagline_col = df["tagline"] if "tagline" in df.columns else pd.Series([""] * n, index=df.index)
    texts = [build_embedding_text(tg, ov, max_chars=args.max_chars) for tg, ov in zip(tagline_col, df["overview"])]

    print(
        f"[Embedding] Device: {device} / Model: paraphrase-multilingual-MiniLM-L12-v2 / "
        f"Input rows: {n} / Output shape: ({n}, {EMBED_DIM})"
    )

    model = SentenceTransformer(MODEL_ID, device=device)
    raw = model.encode(
        texts,
        batch_size=args.batch_size,
        convert_to_numpy=True,
        normalize_embeddings=False,
        show_progress_bar=True,
    )
    embeddings = np.asarray(raw, dtype=np.float32)
    if embeddings.shape != (n, EMBED_DIM):
        raise AssertionError(f"Expected shape ({n}, {EMBED_DIM}), got {embeddings.shape}")

    embeddings = l2_normalize_rows(embeddings)
    if np.isnan(embeddings).any():
        raise AssertionError("Embeddings contain NaN after normalization")

    norms_sample = np.linalg.norm(embeddings[: min(3, n)], axis=1)
    for i, nm in enumerate(norms_sample):
        print(f"[Embedding] Row {i} L2 norm: {nm:.6f} (expect ~1.0)")
    if not np.allclose(norms_sample, 1.0, atol=1e-3):
        raise AssertionError(f"Sample L2 norms not ~1.0: {norms_sample}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(out_path, embeddings)
    mb = out_path.stat().st_size / (1024 * 1024)
    print(f"[Embedding] Wrote {out_path} ({embeddings.shape}, {mb:.2f} MB)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
