#!/usr/bin/env python3
"""P18.5 monthly: Kaggle TMDB → recompute dynamic threshold → full UMAP refit + Procrustes vs v1 → Supabase movies UPDATE / pending merge → export.

Replaces ``threshold_versions`` active row (daily refresh continues to read frozen thresholds until next monthly).
Requires cached ``data/output/{cleaned.csv,text_embeddings.npy,genre_vectors.npy,language_vectors.npy}``
(row-aligned; same contract as Phase 2 pipeline). See workflow cache / docs if files are missing.
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _SCRIPTS_DIR.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from export.export_galaxy_json import decimal_year_with_jitter  # noqa: E402
from feature_engineering.genre_encoding import (  # noqa: E402
    DEFAULT_GENRE_WEIGHT_RATIO,
    rank_weighted_genre_matrix,
)
from feature_engineering.genre_palette import FROZEN_GENRE_ORDER_V1  # noqa: E402
from feature_engineering.language_encoding import (  # noqa: E402
    UNKNOWN_LANG,
    collect_sorted_languages,
    l2_normalize_rows,
    one_hot_language_matrix_with_fallback,
)
from feature_engineering.procrustes_align import align_to_reference  # noqa: E402
from feature_engineering.text_embedding import (  # noqa: E402
    DEFAULT_MODEL_ID,
    build_embedding_text,
    l2_normalize_rows as l2_normalize_rows_text,
)
from feature_engineering.umap_projection import (  # noqa: E402
    _fit_umap_learn,
    _umap_n_neighbors,
    fuse_modalities,
)
from pipeline.cleaning import (  # noqa: E402
    ABS_MIN,
    ALPHA,
    QUANTILE,
    ROLLING_WINDOW,
    compute_year_to_vote_threshold,
    load_raw_csv,
    run_cleaning_pipeline,
    run_cleaning_pipeline_before_vote_threshold,
)


def _load_row_to_reference_and_movie() -> Any:
    """Load ``scripts/supabase/initial_import.py`` by path — avoids ``supabase`` clashing with PyPI."""
    path = _SCRIPTS_DIR / "supabase" / "initial_import.py"
    spec = importlib.util.spec_from_file_location("_galaxy_initial_import", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module spec for {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    fn = getattr(mod, "_row_to_reference_and_movie", None)
    if fn is None:
        raise ImportError(f"{path} has no _row_to_reference_and_movie")
    return fn


_row_to_reference_and_movie = _load_row_to_reference_and_movie()


_DEFAULT_CACHE_DIR = _REPO_ROOT / "data" / "output"

UMAP_N_NEIGHBORS = 300
UMAP_MIN_DIST = 0.4
UMAP_METRIC = "cosine"
UMAP_RANDOM_STATE = 42


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--input-csv",
        type=Path,
        default=None,
        help="Skip Kaggle download; use this raw CSV (same columns as TMDB_all_movies.csv)",
    )
    p.add_argument(
        "--cache-dir",
        type=Path,
        default=_DEFAULT_CACHE_DIR,
        help="Directory with cleaned.csv + text/genre/lang .npy (aligned rows)",
    )
    p.add_argument(
        "--version-label",
        type=str,
        default="",
        help="threshold_versions.version (default: p18_monthly_YYYYMMDD_<GITHUB_RUN_NUMBER>); same version on re-run uses upsert",
    )
    p.add_argument("--page-size", type=int, default=1000, help="Supabase pagination size")
    p.add_argument("--upsert-chunk", type=int, default=500, help="Rows per movies upsert batch")
    p.add_argument(
        "--anchor-rmse-abort",
        type=float,
        default=0.25,
        help=(
            "Abort if mean L2 residual vs galaxy_v1_reference after Procrustes exceeds this. "
            "Full monthly refit (different N + mixed cached/re-encoded rows) often yields >> 0.25 — "
            "use --skip-anchor-rmse-abort after reviewing logs, or tighten embedding bundle parity."
        ),
    )
    p.add_argument(
        "--skip-anchor-rmse-abort",
        action="store_true",
        help="Log anchor mean/max L2 but do not abort when above --anchor-rmse-abort (still exits 0 if rest succeeds)",
    )
    p.add_argument("--dry-run", action="store_true", help="No Supabase writes / no export subprocess")
    p.add_argument("--skip-export", action="store_true", help="Do not run export_from_supabase.py after refit")
    return p.parse_args(argv)


def _resolve_kaggle_csv(root: Path) -> Path:
    cands = [p for p in root.rglob("*.csv") if p.is_file()]
    if not cands:
        raise FileNotFoundError(f"No CSV files under {root}")
    pref = [p for p in cands if "tmdb" in p.name.lower()]
    pool = pref if pref else cands
    return max(pool, key=lambda p: p.stat().st_size)


def _download_kaggle_to(tmp: Path) -> Path:
    tmp.mkdir(parents=True, exist_ok=True)
    kaggle_args = [
        "datasets",
        "download",
        "-d",
        "alanvourch/tmdb-movies-daily-updates",
        "--unzip",
        "-p",
        str(tmp),
    ]
    commands: list[list[str]] = [
        [sys.executable, "-m", "kaggle.cli", *kaggle_args],
    ]
    kaggle_bin = shutil.which("kaggle")
    if kaggle_bin:
        commands.append([kaggle_bin, *kaggle_args])
    commands.append([sys.executable, "-m", "kaggle", *kaggle_args])

    last_exit: int | None = None
    for cmd in commands:
        print("[P18.5 monthly] ", " ".join(cmd), flush=True)
        proc = subprocess.run(cmd, env={**os.environ}, cwd=str(_REPO_ROOT))
        last_exit = proc.returncode
        if proc.returncode == 0:
            return _resolve_kaggle_csv(tmp)

    raise RuntimeError(f"kaggle download failed after fallbacks; last_exit={last_exit}")


def _deactivate_all_thresholds(supabase: Any) -> None:
    r = supabase.table("threshold_versions").select("version").eq("is_active", True).execute()
    for row in r.data or []:
        v = row["version"]
        supabase.table("threshold_versions").update({"is_active": False}).eq("version", v).execute()
        print(f"[P18.5 monthly] Deactivated threshold_versions version={v!r}", flush=True)


def _fetch_all_movie_rows(supabase: Any, *, page_size: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    start = 0
    while True:
        end = start + page_size - 1
        res = supabase.table("movies").select("*").order("id", desc=False).range(start, end).execute()
        batch = res.data or []
        if not batch:
            break
        out.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    print(f"[P18.5 monthly] loaded movies n={len(out):,}", flush=True)
    return out


def _fetch_all_pending_rows(supabase: Any, *, page_size: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    start = 0
    while True:
        end = start + page_size - 1
        res = supabase.table("movies_pending").select("*").order("id", desc=False).range(start, end).execute()
        batch = res.data or []
        if not batch:
            break
        out.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    print(f"[P18.5 monthly] loaded movies_pending n={len(out):,}", flush=True)
    return out


def _fetch_galaxy_v1_reference_dict(supabase: Any, *, page_size: int) -> dict[int, tuple[float, float]]:
    ref_xy_by_id: dict[int, tuple[float, float]] = {}
    start = 0
    while True:
        end = start + page_size - 1
        res = (
            supabase.table("galaxy_v1_reference")
            .select("movie_id,x_v1,y_v1")
            .order("movie_id", desc=False)
            .range(start, end)
            .execute()
        )
        batch = res.data or []
        if not batch:
            break
        for row in batch:
            mid = int(row["movie_id"])
            ref_xy_by_id[mid] = (float(row["x_v1"]), float(row["y_v1"]))
        if len(batch) < page_size:
            break
        start += page_size
    print(f"[P18.5 monthly] galaxy_v1_reference rows={len(ref_xy_by_id):,}", flush=True)
    return ref_xy_by_id


def _decode_bytea(val: Any) -> bytes:
    if val is None:
        raise ValueError("BYTEA is None")
    if isinstance(val, memoryview):
        return val.tobytes()
    if isinstance(val, bytes):
        return val
    if isinstance(val, bytearray):
        return bytes(val)
    s = str(val)
    if s.startswith("\\x"):
        return bytes.fromhex(s[2:])
    raise TypeError(f"Unexpected BYTEA type={type(val)!r}")


def _encode_missing_movies(
    sub: pd.DataFrame,
    *,
    lang_order: list[str],
    model_id: str,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    genre_order = list(FROZEN_GENRE_ORDER_V1)
    n = len(sub)
    assert n > 0
    tagline_col = sub["tagline"] if "tagline" in sub.columns else pd.Series([""] * n, index=sub.index)
    texts = [build_embedding_text(tg, ov, max_chars=3000) for tg, ov in zip(tagline_col, sub["overview"])]
    from sentence_transformers import SentenceTransformer  # noqa: WPS433

    model = SentenceTransformer(model_id, device="cpu")
    raw_txt = model.encode(
        texts,
        batch_size=32,
        convert_to_numpy=True,
        normalize_embeddings=False,
        show_progress_bar=False,
    )
    text_emb = l2_normalize_rows_text(np.asarray(raw_txt, dtype=np.float32))

    g_raw = rank_weighted_genre_matrix(sub["genres"], genre_order, weight_ratio=DEFAULT_GENRE_WEIGHT_RATIO)
    genre_emb = l2_normalize_rows(np.asarray(g_raw, dtype=np.float64).astype(np.float32))

    # Must match Phase 2 ``collect_sorted_languages``: UNKNOWN slot exists only if present in fitted vocab.
    fb = UNKNOWN_LANG if UNKNOWN_LANG in lang_order else lang_order[0]
    l_raw = one_hot_language_matrix_with_fallback(
        sub["original_language"], lang_order, fallback_code=fb
    )
    lang_emb = l2_normalize_rows(np.asarray(l_raw, dtype=np.float64).astype(np.float32))
    print(
        f"[P18.5 monthly] encoded missing n={n} text={text_emb.shape} genre={genre_emb.shape} lang={lang_emb.shape}",
        flush=True,
    )
    return text_emb, genre_emb, lang_emb


def _movie_dict_from_pending(p: dict[str, Any], *, x: float, y: float, z: float, now_iso: str) -> dict[str, Any]:
    skip = frozenset({"text_embedding", "genre_vector", "lang_vector", "detected_at"})
    out: dict[str, Any] = {k: v for k, v in p.items() if k not in skip}
    out["x"], out["y"], out["z"] = float(x), float(y), float(z)
    out["last_xy_refit"] = now_iso
    # Pending INSERT (nightly) omits vote-tracking timestamps; movies.last_vote_update is NOT NULL.
    out["last_vote_update"] = now_iso
    return out


def _merge_row_into_movie(ex: dict[str, Any], row: pd.Series, *, x: float, y: float, z: float, now_iso: str) -> dict[str, Any]:
    out = dict(ex)
    out["vote_count"] = int(pd.to_numeric(row["vote_count"], errors="coerce"))
    out["vote_average"] = float(pd.to_numeric(row["vote_average"], errors="coerce"))
    out["popularity"] = float(pd.to_numeric(row.get("popularity", 0), errors="coerce"))
    out["x"], out["y"], out["z"] = float(x), float(y), float(z)
    out["last_vote_update"] = now_iso
    out["last_xy_refit"] = now_iso
    return out


def _mid(val: object) -> int:
    return int(float(str(val).strip()))


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    env_path = _REPO_ROOT / ".env"
    if env_path.is_file():
        from dotenv import load_dotenv

        load_dotenv(env_path)

    cache_dir = args.cache_dir.expanduser().resolve()
    req = ("cleaned.csv", "text_embeddings.npy", "genre_vectors.npy", "language_vectors.npy")
    missing = [name for name in req if not (cache_dir / name).is_file()]
    if missing:
        print(
            "[P18.5 monthly] CACHE MISS — embedding bundle incomplete.\n"
            f"  cache_dir={cache_dir}\n"
            f"  missing={missing}\n"
            "  Prime CI cache from a machine that has run the full pipeline (data/output/*.npy + cleaned.csv),\n"
            "  or copy those four files into the repo path before monthly_refit.",
            flush=True,
        )
        return 1

    tmp_dir: Path | None = None
    try:
        if args.input_csv is not None:
            raw_path = args.input_csv.expanduser().resolve()
            if not raw_path.is_file():
                print(f"Error: --input-csv not found: {raw_path}", file=sys.stderr)
                return 1
        else:
            tmp_dir = Path(tempfile.mkdtemp(prefix="p18_kaggle_monthly_"))
            raw_path = _download_kaggle_to(tmp_dir)

        print(f"[P18.5 monthly] Using raw CSV: {raw_path}", flush=True)
        raw = load_raw_csv(raw_path)
        print(f"[P18.5 monthly] raw.shape={raw.shape}", flush=True)

        df_pre, _steps_pre, _base_pre = run_cleaning_pipeline_before_vote_threshold(raw)
        print(f"[P18.5 monthly] pre-threshold.shape={df_pre.shape}", flush=True)

        thr_map = compute_year_to_vote_threshold(
            df_pre,
            quantile=QUANTILE,
            alpha=ALPHA,
            abs_min=ABS_MIN,
            rolling_window=ROLLING_WINDOW,
        )
        print(
            f"[P18.5 monthly] recomputed thresholds_json years={len(thr_map)} "
            f"min_year={min(thr_map)} max_year={max(thr_map)}",
            flush=True,
        )

        cleaned, steps = run_cleaning_pipeline(raw)
        print(f"[P18.5 monthly] cleaned.shape={cleaned.shape} last_step={steps[-1].name}", flush=True)

        cache_clean = pd.read_csv(cache_dir / "cleaned.csv")
        text_all = np.load(cache_dir / "text_embeddings.npy")
        genre_all = np.load(cache_dir / "genre_vectors.npy")
        lang_all = np.load(cache_dir / "language_vectors.npy")
        n_cache = len(cache_clean)
        print(
            f"[P18.5 monthly] cache cleaned.csv rows={n_cache} text={text_all.shape} genre={genre_all.shape} lang={lang_all.shape}",
            flush=True,
        )
        assert text_all.shape[0] == n_cache == genre_all.shape[0] == lang_all.shape[0], (
            f"cache row mismatch: csv={n_cache} text={text_all.shape[0]} genre={genre_all.shape[0]} lang={lang_all.shape[0]}"
        )
        dt_text, dg, dl = int(text_all.shape[1]), int(genre_all.shape[1]), int(lang_all.shape[1])
        assert dt_text == 384, f"expected 384d MiniLM text, got {dt_text}"

        id_to_idx: dict[int, int] = {}
        for i in range(n_cache):
            mid = _mid(cache_clean.iloc[i]["id"])
            id_to_idx[mid] = i
        print(f"[P18.5 monthly] cache id index unique_ids={len(id_to_idx):,}", flush=True)

        cleaned_ids_sorted = sorted({_mid(x) for x in cleaned["id"].tolist()})
        n_fit = len(cleaned_ids_sorted)
        print(f"[P18.5 monthly] membership refit count={n_fit:,}", flush=True)
        assert n_fit >= 3, "need at least 3 movies for UMAP"

        cleaned_by_id = cleaned.copy()
        cleaned_by_id["_mid"] = cleaned_by_id["id"].map(_mid)
        cleaned_by_id = cleaned_by_id.set_index("_mid", drop=False)

        # Same vocabulary as ``language_encoding.py`` / ``language_vectors.npy`` (no unconditional UNKNOWN slot).
        lang_order = collect_sorted_languages(cache_clean["original_language"])
        print(f"[P18.5 monthly] lang_order dim={len(lang_order)} (from cache cleaned.csv)", flush=True)
        assert len(lang_order) == dl, (
            f"language vocab len {len(lang_order)} != language_vectors.npy width {dl}; "
            "regenerate embedding bundle from this cleaned.csv or fix cache files."
        )

        row_index_by_movie_id = {mid: i for i, mid in enumerate(cleaned_ids_sorted)}

        if args.dry_run:
            print("[P18.5 monthly] --dry-run: skip Supabase / UMAP / export", flush=True)
            return 0

        url = os.environ.get("SUPABASE_URL", "").strip()
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not key:
            print("Error: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
            return 1

        from supabase import create_client  # noqa: WPS433

        supabase = create_client(url, key)

        run_num = os.environ.get("GITHUB_RUN_NUMBER", "0").strip() or "0"
        utc_now = datetime.now(timezone.utc)
        if str(args.version_label).strip():
            ver_label = str(args.version_label).strip()
        else:
            ver_label = f"p18_monthly_{utc_now.strftime('%Y%m%d')}_{run_num}"

        thr_row = {
            "version": ver_label,
            "quantile": float(QUANTILE),
            "alpha": float(ALPHA),
            "rolling_window": int(ROLLING_WINDOW),
            "abs_min": float(ABS_MIN),
            "thresholds_json": thr_map,
            "is_active": True,
            "computed_at": utc_now.isoformat(),
        }
        _deactivate_all_thresholds(supabase)
        # PK is ``version`` — local reruns reuse ``p18_monthly_YYYYMMDD_0``; INSERT would 23505.
        supabase.table("threshold_versions").upsert(thr_row, on_conflict="version").execute()
        print(f"[P18.5 monthly] upserted active threshold_versions.version={ver_label!r}", flush=True)

        movie_rows = _fetch_all_movie_rows(supabase, page_size=int(args.page_size))
        db_by_id: dict[int, dict[str, Any]] = {int(r["id"]): dict(r) for r in movie_rows}
        pending_rows = _fetch_all_pending_rows(supabase, page_size=int(args.page_size))
        pending_by_id: dict[int, dict[str, Any]] = {int(r["id"]): dict(r) for r in pending_rows}

        ref_xy_by_id = _fetch_galaxy_v1_reference_dict(supabase, page_size=int(args.page_size))
        if len(ref_xy_by_id) < 2:
            print("[P18.5 monthly] Error: galaxy_v1_reference too small for Procrustes", file=sys.stderr)
            return 1

        text_mat = np.zeros((n_fit, dt_text), dtype=np.float32)
        genre_mat = np.zeros((n_fit, dg), dtype=np.float32)
        lang_mat = np.zeros((n_fit, dl), dtype=np.float32)
        need_encode_ids: list[int] = []
        pending_dim_mismatch = 0
        pending_mismatch_sample: list[int] = []

        for i, mid in enumerate(cleaned_ids_sorted):
            if mid in id_to_idx:
                j = id_to_idx[mid]
                text_mat[i] = text_all[j].astype(np.float32, copy=False)
                genre_mat[i] = genre_all[j].astype(np.float32, copy=False)
                lang_mat[i] = lang_all[j].astype(np.float32, copy=False)
            elif mid in pending_by_id:
                pr = pending_by_id[mid]
                tb = np.frombuffer(_decode_bytea(pr["text_embedding"]), dtype=np.float32)
                gb = np.frombuffer(_decode_bytea(pr["genre_vector"]), dtype=np.float32)
                lb = np.frombuffer(_decode_bytea(pr["lang_vector"]), dtype=np.float32)
                if tb.size == dt_text and gb.size == dg and lb.size == dl:
                    text_mat[i] = tb.reshape(dt_text)
                    genre_mat[i] = gb.reshape(dg)
                    lang_mat[i] = lb.reshape(dl)
                else:
                    pending_dim_mismatch += 1
                    if len(pending_mismatch_sample) < 12:
                        pending_mismatch_sample.append(mid)
                    need_encode_ids.append(mid)
            else:
                need_encode_ids.append(mid)

        if pending_dim_mismatch:
            print(
                f"[P18.5 monthly] pending BYTEA dim mismatch vs bundle → re-encode: count={pending_dim_mismatch} "
                f"sample_ids={pending_mismatch_sample} (nightly lang_order can differ from embedding bundle)",
                flush=True,
            )

        if need_encode_ids:
            sub = cleaned_by_id.loc[need_encode_ids].copy()
            assert len(sub) == len(need_encode_ids), "subset encode rows mismatch"
            te, ge, le = _encode_missing_movies(sub, lang_order=lang_order, model_id=DEFAULT_MODEL_ID)
            assert te.shape[1] == dt_text and ge.shape[1] == dg and le.shape[1] == dl, (
                f"encoded dims {te.shape}/{ge.shape}/{le.shape} vs cache {dt_text}/{dg}/{dl}"
            )
            assert len(te) == len(need_encode_ids), "encoded batch vs missing-id list"
            for k, mid in enumerate(need_encode_ids):
                ri = row_index_by_movie_id[mid]
                text_mat[ri] = te[k]
                genre_mat[ri] = ge[k]
                lang_mat[ri] = le[k]

        combined, st, sg, sl = fuse_modalities(
            text_mat,
            genre_mat,
            lang_mat,
            w_text=1.0,
            w_genre=1.0,
            w_lang=1.0,
        )
        print(
            f"[P18.5 monthly] fusion scales text*{st:.6f} genre*{sg:.6f} lang*{sl:.6f} combined={combined.shape}",
            flush=True,
        )
        assert combined.shape == (n_fit, dt_text + dg + dl), "fusion shape assert"

        nn = _umap_n_neighbors(n_fit, UMAP_N_NEIGHBORS)
        print(
            f"[P18.5 monthly] UMAP fit_transform start n_neighbors={nn} densmap=True "
            f"min_dist={UMAP_MIN_DIST} metric={UMAP_METRIC!r} rs={UMAP_RANDOM_STATE}",
            flush=True,
        )
        xy_raw, _reducer = _fit_umap_learn(
            combined,
            n_neighbors=nn,
            min_dist=UMAP_MIN_DIST,
            metric=UMAP_METRIC,
            random_state=UMAP_RANDOM_STATE,
            densmap=True,
            umap_verbose=False,
        )
        print(
            f"[P18.5 monthly] UMAP raw xy shape={xy_raw.shape} "
            f"x=[{xy_raw[:, 0].min():.4f},{xy_raw[:, 0].max():.4f}] "
            f"y=[{xy_raw[:, 1].min():.4f},{xy_raw[:, 1].max():.4f}]",
            flush=True,
        )
        assert np.isfinite(xy_raw).all()

        ids_arr = np.asarray(cleaned_ids_sorted, dtype=np.int64)
        xy_aligned = align_to_reference(xy_raw, ids_arr, ref_xy_by_id)

        anchor_mask = np.fromiter((mid in ref_xy_by_id for mid in cleaned_ids_sorted), dtype=bool, count=n_fit)
        res = np.linalg.norm(
            xy_aligned[anchor_mask].astype(np.float64)
            - np.asarray([ref_xy_by_id[mid] for mid in ids_arr[anchor_mask]], dtype=np.float64),
            axis=1,
        )
        mean_anchor = float(np.mean(res))
        max_anchor = float(np.max(res))
        print(
            f"[P18.5 monthly] anchor L2 vs galaxy_v1_reference after align: mean={mean_anchor:.6g} max={max_anchor:.6g} "
            f"n_anchors={int(np.sum(anchor_mask)):,}",
            flush=True,
        )
        thresh = float(args.anchor_rmse_abort)
        if mean_anchor > thresh:
            if args.skip_anchor_rmse_abort:
                print(
                    f"[P18.5 monthly] WARN: mean anchor residual {mean_anchor:.6g} > --anchor-rmse-abort={thresh} "
                    "(continuing because --skip-anchor-rmse-abort)",
                    flush=True,
                )
            else:
                print(
                    f"[P18.5 monthly] ABORT: mean anchor residual {mean_anchor:.6g} > --anchor-rmse-abort={thresh}",
                    flush=True,
                )
                return 1

        cleaned_set = set(cleaned_ids_sorted)
        db_ids = set(db_by_id.keys())
        below_thr = db_ids - cleaned_set
        print(
            f"[P18.5 monthly] below-threshold existing movies (left unchanged): {len(below_thr):,}",
            flush=True,
        )

        now_iso = utc_now.isoformat()
        upserts: list[dict[str, Any]] = []

        for mid in cleaned_ids_sorted:
            i = row_index_by_movie_id[mid]
            x = float(xy_aligned[i, 0])
            y = float(xy_aligned[i, 1])
            row = cleaned_by_id.loc[mid]
            z, _j = decimal_year_with_jitter(str(row["release_date"]).strip(), mid)

            if mid in db_by_id:
                upserts.append(_merge_row_into_movie(db_by_id[mid], row, x=x, y=y, z=z, now_iso=now_iso))
            elif mid in pending_by_id:
                upserts.append(_movie_dict_from_pending(pending_by_id[mid], x=x, y=y, z=z, now_iso=now_iso))
            else:
                _, movie_d = _row_to_reference_and_movie(row, x, y, z)
                movie_d["last_vote_update"] = now_iso
                movie_d["last_xy_refit"] = now_iso
                upserts.append(movie_d)

        chunk = max(50, int(args.upsert_chunk))
        for i in range(0, len(upserts), chunk):
            part = upserts[i : i + chunk]
            supabase.table("movies").upsert(part).execute()
            print(f"[P18.5 monthly] upserted movies [{i}, {i + len(part)})", flush=True)

        merged_pending = [mid for mid in cleaned_ids_sorted if mid in pending_by_id]
        if merged_pending:
            for i in range(0, len(merged_pending), chunk):
                part = merged_pending[i : i + chunk]
                supabase.table("movies_pending").delete().in_("id", part).execute()
                print(f"[P18.5 monthly] cleared pending [{i}, {i + len(part)})", flush=True)

        if not args.skip_export:
            seq = run_num
            export_py = _SCRIPTS_DIR / "cron" / "export_from_supabase.py"
            ex = subprocess.run(
                [
                    sys.executable,
                    str(export_py),
                    "--export-seq",
                    str(seq),
                    "--version-branch",
                    "monthly",
                    "--threshold-version",
                    ver_label,
                ],
                cwd=str(_REPO_ROOT),
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            if ex.returncode != 0:
                raise SystemExit(ex.returncode)
            val = subprocess.run(
                [
                    sys.executable,
                    str(_REPO_ROOT / "scripts" / "validate_galaxy_json.py"),
                    "--input",
                    str(_REPO_ROOT / "frontend" / "public" / "data" / "galaxy_data.json"),
                ],
                cwd=str(_REPO_ROOT),
            )
            if val.returncode != 0:
                raise SystemExit(val.returncode)

        print(f"[P18.5 monthly] completed threshold_version={ver_label!r}", flush=True)
        return 0
    finally:
        if tmp_dir is not None and tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
