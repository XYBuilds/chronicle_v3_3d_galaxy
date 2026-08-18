#!/usr/bin/env python3
"""P18.4 nightly: Kaggle TMDB dump → frozen-threshold cleaning → Supabase vote UPDATE + pending INSERT (+ optional export).

Does **not** recompute ``threshold_versions`` or remove below-threshold movies from ``movies`` (monthly refit).
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _SCRIPTS_DIR.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.supabase_retry import supabase_execute_with_retry  # noqa: E402
from export.export_galaxy_json import decimal_year_with_jitter  # noqa: E402
from feature_engineering.dim_drift_detector import DimDriftError, assert_no_dim_drift  # noqa: E402
from feature_engineering.genre_encoding import (  # noqa: E402
    DEFAULT_GENRE_WEIGHT_RATIO,
    rank_weighted_genre_matrix,
)
from feature_engineering.genre_palette import FROZEN_GENRE_ORDER_V1  # noqa: E402
from feature_engineering.language_encoding import (  # noqa: E402
    l2_normalize_rows,
    one_hot_language_matrix,
)
from feature_engineering.language_palette import FROZEN_LANG_ORDER, LANG_PALETTE_VERSION  # noqa: E402
from feature_engineering.text_embedding import (  # noqa: E402
    DEFAULT_MODEL_ID,
    build_embedding_text,
    l2_normalize_rows as l2_normalize_rows_text,
)
from pipeline.cleaning import load_raw_csv, run_cleaning_pipeline  # noqa: E402


def _env_dim_drift_force_skip() -> bool:
    v = os.environ.get("DIM_DRIFT_FORCE_SKIP", "").strip().lower()
    return v in ("1", "true", "yes", "on")


def _release_date_iso(row: pd.Series) -> str:
    """Same as ``scripts/supabase/initial_import.py`` (avoid ``supabase`` namespace clash with PyPI)."""
    rd = str(row.get("release_date", "")).strip()
    if not rd:
        raise ValueError(f"empty release_date for id={row.get('id')}")
    dt = pd.to_datetime(rd, errors="raise")
    if isinstance(dt, pd.Timestamp):
        return dt.date().isoformat()
    raise ValueError(f"bad release_date {rd!r} id={row.get('id')}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--input-csv",
        type=Path,
        default=None,
        help="Skip Kaggle download; use this raw CSV (same columns as TMDB_all_movies.csv)",
    )
    p.add_argument("--page-size", type=int, default=1000, help="Supabase pagination size")
    p.add_argument("--upsert-chunk", type=int, default=500, help="Rows per movies upsert batch")
    p.add_argument("--dry-run", action="store_true", help="No Supabase writes")
    p.add_argument("--skip-export", action="store_true", help="Do not run export_from_supabase.py after refresh")
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
        print("[P18.4 nightly] ", " ".join(cmd), flush=True)
        proc = subprocess.run(cmd, env={**os.environ}, cwd=str(_REPO_ROOT))
        last_exit = proc.returncode
        if proc.returncode == 0:
            return _resolve_kaggle_csv(tmp)

    raise RuntimeError(f"kaggle download failed after fallbacks; last_exit={last_exit}")


def _fetch_active_threshold(supabase: Any) -> dict[str, Any]:
    r = supabase.table("threshold_versions").select("*").eq("is_active", True).limit(1).execute()
    if not r.data:
        return {}
    return r.data[0]


def _parse_thresholds_json(row: dict[str, Any]) -> dict[int, float]:
    tj = row.get("thresholds_json")
    if tj is None:
        raise ValueError("active threshold_versions row missing thresholds_json")
    if isinstance(tj, str):
        import json

        tj = json.loads(tj)
    if not isinstance(tj, dict):
        raise TypeError(f"thresholds_json must be object, got {type(tj)}")
    return {int(k): float(v) for k, v in tj.items()}


def _fetch_all_movie_rows(supabase: Any, *, page_size: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    start = 0
    while True:
        end = start + page_size - 1
        res = supabase_execute_with_retry(
            lambda start=start, end=end: (
                supabase.table("movies").select("*").order("id", desc=False).range(start, end).execute()
            ),
            label=f"movies page [{start},{end}]",
            log_prefix="P18.4 nightly",
        )
        batch = res.data or []
        if not batch:
            break
        out.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    print(f"[P18.4 nightly] loaded movies n={len(out):,}", flush=True)
    return out


def _fetch_pending_ids(supabase: Any, *, page_size: int) -> set[int]:
    ids: set[int] = set()
    start = 0
    while True:
        end = start + page_size - 1
        res = supabase_execute_with_retry(
            lambda start=start, end=end: (
                supabase.table("movies_pending").select("id").order("id", desc=False).range(start, end).execute()
            ),
            label=f"movies_pending page [{start},{end}]",
            log_prefix="P18.4 nightly",
        )
        batch = res.data or []
        if not batch:
            break
        for row in batch:
            ids.add(int(row["id"]))
        if len(batch) < page_size:
            break
        start += page_size
    print(f"[P18.4 nightly] pending ids n={len(ids):,}", flush=True)
    return ids


def _encode_active_language_matrix(series: pd.Series) -> np.ndarray:
    lang_order = list(FROZEN_LANG_ORDER)
    raw = one_hot_language_matrix(series, lang_order)
    encoded = l2_normalize_rows(np.asarray(raw, dtype=np.float64).astype(np.float32))
    assert encoded.shape == (len(series), len(lang_order)), (
        f"active language matrix shape {encoded.shape} != ({len(series)}, {len(lang_order)})"
    )
    assert np.isfinite(encoded).all(), "active language matrix contains NaN or Inf"
    print(
        f"[P18.4 nightly] active language palette={LANG_PALETTE_VERSION} "
        f"shape={encoded.shape} min={float(encoded.min()):.6g} max={float(encoded.max()):.6g}",
        flush=True,
    )
    return encoded


def _votes_changed(ex: dict[str, Any], row: pd.Series) -> bool:
    vc = int(pd.to_numeric(row["vote_count"], errors="coerce"))
    va = float(pd.to_numeric(row["vote_average"], errors="coerce"))
    pop = float(pd.to_numeric(row.get("popularity", 0), errors="coerce"))
    if int(ex["vote_count"]) != vc:
        return True
    if abs(float(ex["vote_average"]) - va) > 1e-5:
        return True
    if abs(float(ex.get("popularity") or 0.0) - pop) > 1e-4:
        return True
    return False


def _merge_vote_fields(ex: dict[str, Any], row: pd.Series, *, now_iso: str) -> dict[str, Any]:
    out = dict(ex)
    out["vote_count"] = int(pd.to_numeric(row["vote_count"], errors="coerce"))
    out["vote_average"] = float(pd.to_numeric(row["vote_average"], errors="coerce"))
    out["popularity"] = float(pd.to_numeric(row.get("popularity", 0), errors="coerce"))
    out["last_vote_update"] = now_iso
    return out


def _encode_new_movies(
    sub: pd.DataFrame,
    *,
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
    assert text_emb.shape == (n, int(model.get_sentence_embedding_dimension()))

    g_raw = rank_weighted_genre_matrix(sub["genres"], genre_order, weight_ratio=DEFAULT_GENRE_WEIGHT_RATIO)
    genre_emb = l2_normalize_rows(np.asarray(g_raw, dtype=np.float64).astype(np.float32))

    lang_emb = _encode_active_language_matrix(sub["original_language"])
    print(
        f"[P18.4 nightly] encoded pending n={n} text={text_emb.shape} genre={genre_emb.shape} lang={lang_emb.shape}",
        flush=True,
    )
    return text_emb, genre_emb, lang_emb


def _split(val: object) -> list[str]:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return []
    s = str(val).strip()
    if not s or s.casefold() in ("nan", "none"):
        return []
    return [p.strip() for p in s.split(",") if p.strip()]


def _imdb_id(val: object) -> str | None:
    s = str(val).strip() if val is not None else ""
    if not s or s.casefold() in ("nan", "none"):
        return None
    return s


def _tagline(val: object) -> str | None:
    s = str(val).strip() if val is not None else ""
    if not s or s.casefold() == "nan":
        return None
    return s


def _poster(val: object) -> str | None:
    s = str(val).strip() if val is not None else ""
    if not s or s.casefold() == "nan":
        return None
    return s


def _pending_row_from_cleaned(
    row: pd.Series,
    *,
    text_b: str,
    genre_b: str,
    lang_b: str,
) -> dict[str, Any]:
    mid = int(float(row["id"]))
    z, _j = decimal_year_with_jitter(str(row["release_date"]).strip(), mid)
    from export.export_search_index import normalize_for_search_v2  # noqa: WPS433

    title_s = str(row.get("title", "")).strip()
    orig_s = str(row.get("original_title", "")).strip()
    t_norm = normalize_for_search_v2(title_s)
    o_norm = normalize_for_search_v2(orig_s)
    if not o_norm or o_norm == t_norm:
        title_normalized = t_norm
    else:
        title_normalized = f"{t_norm} {o_norm}".strip()

    from feature_engineering.genre_encoding import parse_genre_list  # noqa: WPS433

    genres = parse_genre_list(row.get("genres"))
    if not genres:
        raise ValueError(f"pending id={mid}: empty genres")

    return {
        "id": mid,
        "imdb_id": _imdb_id(row.get("imdb_id")),
        "title": title_s,
        "original_title": orig_s or None,
        "title_normalized": title_normalized,
        "overview": str(row.get("overview", "")).strip(),
        "tagline": _tagline(row.get("tagline", "")),
        "poster_path": _poster(row.get("poster_path", "")),
        "release_date": _release_date_iso(row),
        "genres": genres,
        "original_language": str(row.get("original_language", "")).strip(),
        "spoken_languages": _split(row.get("spoken_languages")),
        "production_countries": _split(row.get("production_countries")),
        "production_companies": _split(row.get("production_companies")),
        "vote_count": int(float(row["vote_count"])),
        "vote_average": float(row["vote_average"]),
        "popularity": float(row.get("popularity", 0) or 0),
        "imdb_rating": float(pd.to_numeric(row.get("imdb_rating"), errors="coerce"))
        if pd.notna(pd.to_numeric(row.get("imdb_rating"), errors="coerce"))
        else None,
        "imdb_votes": int(pd.to_numeric(row.get("imdb_votes"), errors="coerce"))
        if pd.notna(pd.to_numeric(row.get("imdb_votes"), errors="coerce"))
        else None,
        "runtime": int(pd.to_numeric(row.get("runtime"), errors="coerce"))
        if pd.notna(pd.to_numeric(row.get("runtime"), errors="coerce"))
        else None,
        "revenue": int(float(row.get("revenue", 0) or 0)),
        "budget": int(float(row.get("budget", 0) or 0)),
        "cast_list": _split(row.get("cast")),
        "director": _split(row.get("director")),
        "writers": _split(row.get("writers")),
        "producers": _split(row.get("producers")),
        "director_of_photography": _split(row.get("director_of_photography")),
        "music_composer": _split(row.get("music_composer")),
        "z": float(z),
        "text_embedding": text_b,
        "genre_vector": genre_b,
        "lang_vector": lang_b,
    }


def _bytea_hex(buf: bytes) -> str:
    """Encode bytes as Postgres BYTEA hex literal for PostgREST JSON."""
    return "\\x" + buf.hex()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    env_path = _REPO_ROOT / ".env"
    if env_path.is_file():
        from dotenv import load_dotenv

        load_dotenv(env_path)

    tmp_dir: Path | None = None
    try:
        if args.input_csv is not None:
            raw_path = args.input_csv.expanduser().resolve()
            if not raw_path.is_file():
                print(f"Error: --input-csv not found: {raw_path}", file=sys.stderr)
                return 1
        else:
            tmp_dir = Path(tempfile.mkdtemp(prefix="p18_kaggle_"))
            raw_path = _download_kaggle_to(tmp_dir)

        print(f"[P18.4 nightly] Using raw CSV: {raw_path}", flush=True)
        raw = load_raw_csv(raw_path)
        print(f"[P18.4 nightly] raw.shape={raw.shape}", flush=True)

        url = os.environ.get("SUPABASE_URL", "").strip()
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not key:
            print("Error: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
            return 1

        from supabase import create_client  # noqa: WPS433

        supabase = create_client(url, key)
        thr_row = _fetch_active_threshold(supabase)
        if not thr_row:
            print(
                "Error: no active threshold_versions row. Run: "
                "python scripts/cron/seed_active_threshold_version.py --input <raw.csv>",
                file=sys.stderr,
            )
            return 1
        frozen = _parse_thresholds_json(thr_row)
        print(f"[P18.4 nightly] active threshold version={thr_row.get('version')!r} years={len(frozen)}", flush=True)

        cleaned, steps = run_cleaning_pipeline(raw, frozen_year_thresholds=frozen)
        print(f"[P18.4 nightly] cleaned.shape={cleaned.shape} last_step={steps[-1].name}", flush=True)

        try:
            assert_no_dim_drift(cleaned, force_skip=_env_dim_drift_force_skip())
        except DimDriftError as err:
            print(f"[P18.4 nightly] ABORT dim drift: {err}", flush=True)
            return 1

        if args.dry_run:
            print("[P18.4 nightly] --dry-run: skip Supabase writes / export", flush=True)
            return 0

        movie_rows = _fetch_all_movie_rows(supabase, page_size=int(args.page_size))
        db_by_id: dict[int, dict[str, Any]] = {int(r["id"]): dict(r) for r in movie_rows}
        pending_ids = _fetch_pending_ids(supabase, page_size=int(args.page_size))
        print(
            f"[P18.4 nightly] active lang_order={LANG_PALETTE_VERSION}:{len(FROZEN_LANG_ORDER)}",
            flush=True,
        )

        now_iso = datetime.now(timezone.utc).isoformat()
        to_upsert: list[dict[str, Any]] = []
        for _, row in cleaned.iterrows():
            mid = int(float(row["id"]))
            if mid not in db_by_id:
                continue
            ex = db_by_id[mid]
            if _votes_changed(ex, row):
                to_upsert.append(_merge_vote_fields(ex, row, now_iso=now_iso))

        cleaned_id_set = {int(float(x)) for x in cleaned["id"].tolist()}
        below_threshold = [mid for mid in db_by_id if mid not in cleaned_id_set]
        new_ids = [mid for mid in cleaned_id_set if mid not in db_by_id and mid not in pending_ids]

        print(
            f"[P18.4 nightly] vote_updates={len(to_upsert):,} below_threshold_observed={len(below_threshold):,} "
            f"new_pending_candidates={len(new_ids):,}",
            flush=True,
        )

        chunk = max(50, int(args.upsert_chunk))
        for i in range(0, len(to_upsert), chunk):
            part = to_upsert[i : i + chunk]
            supabase.table("movies").upsert(part).execute()
            print(f"[P18.4 nightly] upserted movies [{i}, {i + len(part)})", flush=True)

        if new_ids:
            id_series = cleaned["id"].map(lambda x: int(float(str(x).strip())))
            sub = cleaned.loc[id_series.isin(new_ids)].copy()
            sub = sub.sort_values("id")
            assert len(sub) == len(new_ids), f"new_ids row mismatch {len(sub)} vs {len(new_ids)}"
            text_e, genre_e, lang_e = _encode_new_movies(sub, model_id=DEFAULT_MODEL_ID)
            pending_payloads: list[dict[str, Any]] = []
            for j, (_, row) in enumerate(sub.iterrows()):
                pending_payloads.append(
                    _pending_row_from_cleaned(
                        row,
                        text_b=_bytea_hex(text_e[j].astype(np.float32).tobytes()),
                        genre_b=_bytea_hex(genre_e[j].astype(np.float32).tobytes()),
                        lang_b=_bytea_hex(lang_e[j].astype(np.float32).tobytes()),
                    )
                )
            for i in range(0, len(pending_payloads), chunk):
                part = pending_payloads[i : i + chunk]
                supabase.table("movies_pending").insert(part).execute()
                print(f"[P18.4 nightly] inserted pending [{i}, {i + len(part)})", flush=True)

        utc = datetime.now(timezone.utc)
        if utc.day == 1:
            snap_day = date(utc.year, utc.month, 1).isoformat()
            snap_rows = [
                {
                    "movie_id": int(r["id"]),
                    "snapshot_month": snap_day,
                    "vote_count": int(r["vote_count"]),
                    "vote_average": float(r["vote_average"]),
                }
                for r in movie_rows
            ]
            for i in range(0, len(snap_rows), chunk):
                part = snap_rows[i : i + chunk]
                supabase.table("vote_snapshots").upsert(part).execute()
                print(f"[P18.4 nightly] vote_snapshots upsert [{i}, {i + len(part)}) month={snap_day}", flush=True)

        if not args.skip_export:
            seq = os.environ.get("GALAXY_EXPORT_SEQ", "0")
            export_py = _SCRIPTS_DIR / "cron" / "export_from_supabase.py"
            ex = subprocess.run(
                [sys.executable, str(export_py), "--export-seq", str(seq)],
                cwd=str(_REPO_ROOT),
                env={**os.environ, "PYTHONUNBUFFERED": "1", "GALAXY_EXPORT_SEQ": str(seq)},
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

        print(f"[P18.4 nightly] completed at {now_iso}", flush=True)
        return 0
    finally:
        if tmp_dir is not None and tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
