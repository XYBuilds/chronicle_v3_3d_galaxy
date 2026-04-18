#!/usr/bin/env python3
"""Phase 5.2.2: compare Model A (384d MiniLM) vs Model B (768d mpnet) on text-only alignment with primary genre."""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.metrics import silhouette_score
from sklearn.neighbors import NearestNeighbors

from genre_encoding import parse_genre_list
from text_embedding import (
    DEFAULT_BATCH_SIZE,
    DEFAULT_MAX_CHARS,
    MODEL_ID as MODEL_A_ID,
    build_embedding_text,
    l2_normalize_rows,
    resolve_device,
)

MODEL_B_ID = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
EMBED_DIM_A = 384
EMBED_DIM_B = 768

_REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class ModelEvalBlock:
    model_id: str
    embed_dim: int
    separation_margin: float | None
    intra_cosine_mean: float | None
    inter_cosine_mean: float | None
    knn_purity_mean: float | None
    silhouette_cosine: float | None
    n_rows: int
    n_genres: int
    n_pair_intra: int
    n_pair_inter: int


def _strip_overview(v: object) -> bool:
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return False
    s = str(v).strip()
    return bool(s) and s.lower() not in ("nan", "none")


def primary_genre(cell: object) -> str | None:
    labels = parse_genre_list(cell)
    return labels[0] if labels else None


def stratified_cap(df: pd.DataFrame, max_rows: int, rng: np.random.Generator) -> pd.DataFrame:
    """Keep up to ceil(max_rows / n_genres) rows per primary genre (shuffled within group)."""
    if max_rows <= 0 or len(df) <= max_rows:
        return df
    gcol = df["_primary_genre"].astype(str)
    genres = gcol.unique()
    cap = max(1, int(np.ceil(max_rows / max(1, len(genres)))))
    parts: list[pd.DataFrame] = []
    for g in genres:
        sub = df[gcol == g]
        if len(sub) <= cap:
            parts.append(sub)
        else:
            idx = rng.choice(len(sub), size=cap, replace=False)
            parts.append(sub.iloc[idx])
    out = pd.concat(parts, axis=0).reset_index(drop=True)
    if len(out) > max_rows:
        idx = rng.choice(len(out), size=max_rows, replace=False)
        out = out.iloc[idx].reset_index(drop=True)
    return out


def encode_l2(
    model_id: str,
    expected_dim: int,
    texts: list[str],
    *,
    device: str,
    batch_size: int,
) -> np.ndarray:
    model = SentenceTransformer(model_id, device=device)
    raw = model.encode(
        texts,
        batch_size=batch_size,
        convert_to_numpy=True,
        normalize_embeddings=False,
        show_progress_bar=True,
    )
    embeddings = np.asarray(raw, dtype=np.float32)
    if embeddings.ndim != 2 or embeddings.shape[1] != expected_dim:
        raise AssertionError(f"{model_id}: expected (*, {expected_dim}), got {embeddings.shape}")
    return l2_normalize_rows(embeddings)


def sample_intra_inter_cosine(
    Z: np.ndarray,
    y: np.ndarray,
    n_intra: int,
    n_inter: int,
    rng: np.random.Generator,
) -> tuple[float, float, int, int]:
    """Return mean cosine for random same-label and different-label pairs (L2-normalized rows)."""
    n = len(y)
    by_label: dict[int, list[int]] = {}
    for i in range(n):
        by_label.setdefault(int(y[i]), []).append(i)
    intra_pool = [k for k, idxs in by_label.items() if len(idxs) >= 2]
    if not intra_pool:
        return float("nan"), float("nan"), 0, 0
    intra_dots: list[float] = []
    for _ in range(n_intra):
        lab = int(rng.choice(intra_pool))
        i, j = rng.choice(by_label[lab], size=2, replace=False)
        intra_dots.append(float(Z[i] @ Z[j]))
    labels = np.array(list(by_label.keys()), dtype=np.int64)
    inter_dots: list[float] = []
    tries = 0
    max_tries = n_inter * 20
    while len(inter_dots) < n_inter and tries < max_tries:
        tries += 1
        pair = rng.choice(labels, size=2, replace=False)
        a, b = int(pair[0]), int(pair[1])
        if a == b:
            continue
        i = int(rng.choice(by_label[a]))
        j = int(rng.choice(by_label[b]))
        inter_dots.append(float(Z[i] @ Z[j]))
    if len(inter_dots) < n_inter // 2:
        return float("nan"), float("nan"), len(intra_dots), len(inter_dots)
    return float(np.mean(intra_dots)), float(np.mean(inter_dots)), len(intra_dots), len(inter_dots)


def knn_purity(Z: np.ndarray, y: np.ndarray, k: int) -> float:
    if len(y) <= k + 1:
        return float("nan")
    nn = NearestNeighbors(n_neighbors=min(k + 1, len(y)), metric="cosine")
    nn.fit(Z)
    _, ind = nn.kneighbors(Z)
    neigh = ind[:, 1:]
    matches = (y[neigh] == y[:, None]).mean(axis=1)
    return float(matches.mean())


def silhouette_safe(Z: np.ndarray, y: np.ndarray, sample_size: int, rng: np.random.Generator) -> float:
    uniq, counts = np.unique(y, return_counts=True)
    if len(uniq) < 2 or (counts >= 2).sum() < 2:
        return float("nan")
    n = len(y)
    if n > sample_size:
        idx = rng.choice(n, size=sample_size, replace=False)
        Zs, ys = Z[idx], y[idx]
    else:
        Zs, ys = Z, y
    uniq2, cnt2 = np.unique(ys, return_counts=True)
    if len(uniq2) < 2 or (cnt2 >= 2).sum() < 2:
        return float("nan")
    return float(silhouette_score(Zs, ys, metric="cosine"))


def eval_one_model(
    model_id: str,
    dim: int,
    Z: np.ndarray,
    y: np.ndarray,
    *,
    n_pairs: int,
    knn_k: int,
    silhouette_sample: int,
    rng: np.random.Generator,
) -> ModelEvalBlock:
    intra, inter, ni, ne = sample_intra_inter_cosine(Z, y, n_pairs, n_pairs, rng)
    margin: float | None
    if np.isnan(intra) or np.isnan(inter):
        margin = None
    else:
        margin = float(intra - inter)
    sil = silhouette_safe(Z, y, silhouette_sample, rng)
    pur = knn_purity(Z, y, knn_k)
    return ModelEvalBlock(
        model_id=model_id,
        embed_dim=dim,
        separation_margin=margin,
        intra_cosine_mean=intra if not np.isnan(intra) else None,
        inter_cosine_mean=inter if not np.isnan(inter) else None,
        knn_purity_mean=pur if not np.isnan(pur) else None,
        silhouette_cosine=sil if not np.isnan(sil) else None,
        n_rows=int(Z.shape[0]),
        n_genres=int(len(np.unique(y))),
        n_pair_intra=ni,
        n_pair_inter=ne,
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Phase 5.2.2: encode cleaned.csv with MiniLM (384d) and mpnet (768d); "
            "report genre-aligned separation metrics (no UMAP)."
        )
    )
    p.add_argument(
        "--input",
        type=Path,
        default=_REPO_ROOT / "data" / "output" / "cleaned.csv",
        help="Cleaned CSV (tagline, overview, genres)",
    )
    p.add_argument(
        "--output-json",
        type=Path,
        default=_REPO_ROOT / "data" / "output" / "embedding_model_eval.json",
        help="Write metrics JSON (parent dirs created as needed)",
    )
    p.add_argument("--max-rows", type=int, default=0, help="Cap rows after stratified sample (0 = all)")
    p.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS, help="Embedding text truncation (head)")
    p.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Encode batch size")
    p.add_argument("--device", type=str, default="cuda", choices=("auto", "cuda", "cpu"))
    p.add_argument("--seed", type=int, default=42, help="RNG seed for sampling pairs / subsample")
    p.add_argument("--n-pairs", type=int, default=20_000, help="Target same- / cross-genre random pairs each")
    p.add_argument("--knn-k", type=int, default=30, help="k for kNN primary-genre purity")
    p.add_argument(
        "--silhouette-sample",
        type=int,
        default=8_000,
        help="Max rows for silhouette_score (subsampled if larger)",
    )
    p.add_argument("--skip-model-b", action="store_true", help="Only run Model A (faster smoke)")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    inp = args.input.expanduser().resolve()
    out_json = args.output_json.expanduser().resolve()

    if not inp.is_file():
        print(f"Error: input CSV not found: {inp}", file=sys.stderr)
        return 1

    device = resolve_device(args.device)
    rng = np.random.default_rng(args.seed)

    df = pd.read_csv(inp)
    if "overview" not in df.columns or "genres" not in df.columns:
        print("Error: CSV must include 'overview' and 'genres'", file=sys.stderr)
        return 1

    mask = df["genres"].map(primary_genre).notna() & df["overview"].map(_strip_overview)
    df = df.loc[mask].copy()
    df["_primary_genre"] = df["genres"].map(primary_genre)
    if args.max_rows > 0:
        df = stratified_cap(df, args.max_rows, rng)
    n = len(df)
    if n < 4:
        print(f"Error: too few labeled rows after filter ({n}). Need >= 4.", file=sys.stderr)
        return 1

    tagline_col = df["tagline"] if "tagline" in df.columns else pd.Series([""] * n, index=df.index)
    texts = [
        build_embedding_text(tg, ov, max_chars=args.max_chars) for tg, ov in zip(tagline_col, df["overview"])
    ]

    genres = sorted(df["_primary_genre"].unique())
    g2i = {g: i for i, g in enumerate(genres)}
    y = np.array([g2i[g] for g in df["_primary_genre"]], dtype=np.int64)

    print(f"[Eval] Rows: {n} | Primary genres: {len(genres)} | Device: {device}")
    print(f"[Eval] Model A: {MODEL_A_ID}")
    Za = encode_l2(MODEL_A_ID, EMBED_DIM_A, texts, device=device, batch_size=args.batch_size)
    block_a = eval_one_model(
        MODEL_A_ID,
        EMBED_DIM_A,
        Za,
        y,
        n_pairs=args.n_pairs,
        knn_k=args.knn_k,
        silhouette_sample=args.silhouette_sample,
        rng=rng,
    )

    block_b: ModelEvalBlock | None = None
    if not args.skip_model_b:
        print(f"[Eval] Model B: {MODEL_B_ID}")
        Zb = encode_l2(MODEL_B_ID, EMBED_DIM_B, texts, device=device, batch_size=args.batch_size)
        block_b = eval_one_model(
            MODEL_B_ID,
            EMBED_DIM_B,
            Zb,
            y,
            n_pairs=args.n_pairs,
            knn_k=args.knn_k,
            silhouette_sample=args.silhouette_sample,
            rng=rng,
        )

    def block_to_dict(b: ModelEvalBlock) -> dict[str, Any]:
        d = asdict(b)
        return d

    payload: dict[str, Any] = {
        "phase": "5.2.2",
        "input_csv": str(inp),
        "max_chars": args.max_chars,
        "n_rows_used": n,
        "primary_genre_counts": dict(Counter(df["_primary_genre"].astype(str))),
        "model_a": block_to_dict(block_a),
        "model_b": block_to_dict(block_b) if block_b else None,
        "notes": (
            "separation_margin = mean_cosine(same primary genre pairs) - mean_cosine(cross-genre pairs); "
            "higher is better. knn_purity_mean = fraction of kNN sharing primary genre. "
            "silhouette_cosine uses sklearn cosine metric on a subsample."
        ),
    }

    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[Eval] Wrote {out_json}")

    def print_block(title: str, b: ModelEvalBlock) -> None:
        print(f"\n--- {title} ({b.embed_dim}d) ---")
        print(f"  separation_margin: {b.separation_margin}")
        print(f"  intra / inter cosine: {b.intra_cosine_mean} / {b.inter_cosine_mean}")
        print(f"  knn_purity @ {args.knn_k}: {b.knn_purity_mean}")
        print(f"  silhouette (cosine): {b.silhouette_cosine}")

    print_block("Model A", block_a)
    if block_b:
        print_block("Model B", block_b)
        if block_a.separation_margin is not None and block_b.separation_margin is not None:
            delta = block_b.separation_margin - block_a.separation_margin
            print(
                f"\n[Eval] Delta margin (B - A): {delta:+.6f}  "
                "(positive => B better aligns with primary genre geometry)"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
