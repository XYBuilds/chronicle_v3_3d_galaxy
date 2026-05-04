#!/usr/bin/env python3
"""P18.2: One-time load of galaxy_v1_reference + movies from cleaned.csv + umap_xy.npy (+ z from export rules)."""
from __future__ import annotations

import argparse
import os
import random
import sys
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
from export.export_search_index import normalize_for_search  # noqa: E402
from feature_engineering.genre_encoding import parse_genre_list  # noqa: E402
from feature_engineering.genre_palette import assert_all_genres_in_frozen_v1  # noqa: E402

_DEFAULT_CSV = _REPO_ROOT / "data" / "output" / "cleaned.csv"
_DEFAULT_XY = _REPO_ROOT / "data" / "output" / "umap_xy.npy"


def _split_list_cell(val: object) -> list[str]:
    """Same rules as export_galaxy_json._split_list_cell (TMDB comma-separated multi-values)."""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return []
    s = str(val).strip()
    if not s or s.casefold() in ("nan", "none"):
        return []
    return [p.strip() for p in s.split(",") if p.strip()]


def _title_normalized(title: str, original_title: str) -> str:
    t = normalize_for_search(str(title).strip())
    o = normalize_for_search(str(original_title).strip())
    if not o or o == t:
        return t
    return f"{t} {o}".strip()


def _to_int_or_null(val: object) -> int | None:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    s = str(val).strip()
    if not s or s.casefold() in ("nan", "none"):
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _to_int_zero(val: object) -> int:
    n = _to_int_or_null(val)
    return 0 if n is None else n


def _to_float(val: object) -> float:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return 0.0
    s = str(val).strip()
    if not s or s.casefold() in ("nan", "none"):
        return 0.0
    x = pd.to_numeric(s, errors="coerce")
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return 0.0
    return float(x)


def _to_float_or_null(val: object) -> float | None:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    s = str(val).strip()
    if not s or s.casefold() in ("nan", "none"):
        return None
    x = pd.to_numeric(s, errors="coerce")
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return None
    return float(x)


def _imdb_id(val: object) -> str | None:
    raw = val if val is not None else ""
    s = str(raw).strip()
    if not s or s.casefold() in ("nan", "none"):
        return None
    return s


def _tagline(val: object) -> str | None:
    s = str(val).strip() if val is not None else ""
    if not s or s.casefold() == "nan":
        return None
    return s


def _poster_path(val: object) -> str | None:
    s = str(val).strip() if val is not None else ""
    if not s or s.casefold() == "nan":
        return None
    return s


def _release_date_iso(row: pd.Series) -> str:
    rd = str(row.get("release_date", "")).strip()
    if not rd:
        raise ValueError(f"empty release_date for id={row.get('id')}")
    dt = pd.to_datetime(rd, errors="raise")
    if isinstance(dt, pd.Timestamp):
        return dt.date().isoformat()
    raise ValueError(f"bad release_date {rd!r} id={row.get('id')}")


def _row_to_reference_and_movie(
    row: pd.Series,
    x: float,
    y: float,
    z: float,
) -> tuple[dict[str, Any], dict[str, Any]]:
    mid = int(_to_float(row["id"]))
    title_s = str(row.get("title", "")).strip()
    orig_s = str(row.get("original_title", "")).strip()
    genres = parse_genre_list(row.get("genres"))
    if not genres:
        raise ValueError(f"empty genres after parse for id={mid}")

    ref = {"movie_id": mid, "x_v1": float(x), "y_v1": float(y), "z_v1": float(z)}
    movie: dict[str, Any] = {
        "id": mid,
        "imdb_id": _imdb_id(row.get("imdb_id")),
        "title": title_s,
        "original_title": orig_s or None,
        "title_normalized": _title_normalized(title_s, orig_s),
        "overview": str(row.get("overview", "")).strip(),
        "tagline": _tagline(row.get("tagline", "")),
        "poster_path": _poster_path(row.get("poster_path", "")),
        "release_date": _release_date_iso(row),
        "genres": genres,
        "original_language": str(row.get("original_language", "")).strip(),
        "spoken_languages": _split_list_cell(row.get("spoken_languages")),
        "production_countries": _split_list_cell(row.get("production_countries")),
        "production_companies": _split_list_cell(row.get("production_companies")),
        "vote_count": int(_to_float(row.get("vote_count"))),
        "vote_average": float(_to_float(row.get("vote_average"))),
        "popularity": float(_to_float(row.get("popularity"))),
        "imdb_rating": _to_float_or_null(row.get("imdb_rating")),
        "imdb_votes": _to_int_or_null(row.get("imdb_votes")),
        "runtime": _to_int_or_null(row.get("runtime")),
        "revenue": _to_int_zero(row.get("revenue")),
        "budget": _to_int_zero(row.get("budget")),
        "cast_list": _split_list_cell(row.get("cast")),
        "director": _split_list_cell(row.get("director")),
        "writers": _split_list_cell(row.get("writers")),
        "producers": _split_list_cell(row.get("producers")),
        "director_of_photography": _split_list_cell(row.get("director_of_photography")),
        "music_composer": _split_list_cell(row.get("music_composer")),
        "x": float(x),
        "y": float(y),
        "z": float(z),
    }
    return ref, movie


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", type=Path, default=_DEFAULT_CSV, help="cleaned.csv (same row order as umap_xy.npy)")
    p.add_argument("--xy-input", type=Path, default=_DEFAULT_XY, help="umap_xy.npy float32 (n, 2)")
    p.add_argument("--chunk-size", type=int, default=1000, help="Rows per Supabase insert batch")
    p.add_argument("--dry-run", action="store_true", help="Validate files and build rows; do not call Supabase")
    p.add_argument(
        "--expect-rows",
        type=int,
        default=59_014,
        help="Assert cleaned.csv row count equals this (Phase 18.2 acceptance)",
    )
    p.add_argument("--verify-sample", type=int, default=10, help="After import, compare this many random ids ref vs movies")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    csv_path = args.input.expanduser().resolve()
    xy_path = args.xy_input.expanduser().resolve()

    if not csv_path.is_file():
        print(f"Error: CSV not found: {csv_path}", file=sys.stderr)
        return 1
    if not xy_path.is_file():
        print(f"Error: umap_xy.npy not found: {xy_path}", file=sys.stderr)
        return 1

    df = pd.read_csv(csv_path)
    xy = np.load(xy_path)
    n = len(df)
    print(f"[P18.2] Loaded CSV shape={df.shape} | umap_xy.shape={xy.shape}", flush=True)
    assert xy.ndim == 2 and xy.shape[1] == 2, f"umap_xy must be (n,2), got {xy.shape}"
    assert xy.shape[0] == n, f"row mismatch CSV {n} vs xy {xy.shape[0]}"
    assert n == args.expect_rows, f"row count {n} != --expect-rows {args.expect_rows}"
    assert "id" in df.columns and "release_date" in df.columns

    assert_all_genres_in_frozen_v1(df["genres"])

    zs: list[float] = []
    ref_rows: list[dict[str, Any]] = []
    movie_rows: list[dict[str, Any]] = []
    xy64 = xy.astype(np.float64, copy=False)
    for i in range(n):
        row = df.iloc[i]
        mid = int(_to_float(row["id"]))
        z, _j = decimal_year_with_jitter(str(row["release_date"]).strip(), mid)
        zs.append(float(z))
        x_i = float(xy64[i, 0])
        y_i = float(xy64[i, 1])
        ref, mov = _row_to_reference_and_movie(row, x_i, y_i, float(z))
        ref_rows.append(ref)
        movie_rows.append(mov)

    z_arr = np.asarray(zs, dtype=np.float64)
    print(
        f"[P18.2] Built {len(ref_rows):,} ref rows + {len(movie_rows):,} movie rows | "
        f"z range [{z_arr.min():.4f}, {z_arr.max():.4f}]",
        flush=True,
    )

    if args.dry_run:
        print("[P18.2] --dry-run: skipping Supabase writes.", flush=True)
        print(f"[P18.2] Sample movie keys: {list(movie_rows[0].keys())}", flush=True)
        return 0

    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Error: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for live import.", file=sys.stderr)
        return 1

    from supabase import create_client  # noqa: WPS433 (runtime import after dry-run check)

    supabase = create_client(url, key)
    chunk = max(1, int(args.chunk_size))

    def _insert_batches(table: str, rows: list[dict[str, Any]]) -> None:
        for start in range(0, len(rows), chunk):
            part = rows[start : start + chunk]
            print(f"[P18.2] Insert {table} rows [{start}, {start + len(part)})", flush=True)
            supabase.table(table).insert(part).execute()

    _insert_batches("galaxy_v1_reference", ref_rows)
    _insert_batches("movies", movie_rows)

    c_ref = supabase.table("galaxy_v1_reference").select("movie_id", count="exact", head=True).execute()
    c_mov = supabase.table("movies").select("id", count="exact", head=True).execute()
    n_ref = c_ref.count
    n_mov = c_mov.count
    print(f"[P18.2] Post-insert counts: galaxy_v1_reference={n_ref} movies={n_mov}", flush=True)
    assert n_ref is not None and n_mov is not None, "count headers missing from Supabase response"
    assert n_ref == n == n_mov, f"count mismatch ref={n_ref} movies={n_mov} expected={n}"

    rng = random.Random(42)
    sample_ids = [movie_rows[i]["id"] for i in rng.sample(range(n), min(args.verify_sample, n))]
    max_dx = 0.0
    max_dy = 0.0
    max_dz = 0.0
    for mid in sample_ids:
        r = supabase.table("galaxy_v1_reference").select("x_v1,y_v1,z_v1").eq("movie_id", mid).execute()
        m = supabase.table("movies").select("x,y,z").eq("id", mid).execute()
        assert len(r.data) == 1 and len(m.data) == 1, f"missing row id={mid}"
        rv, mv = r.data[0], m.data[0]
        dx = abs(float(rv["x_v1"]) - float(mv["x"]))
        dy = abs(float(rv["y_v1"]) - float(mv["y"]))
        dz = abs(float(rv["z_v1"]) - float(mv["z"]))
        max_dx = max(max_dx, dx)
        max_dy = max(max_dy, dy)
        max_dz = max(max_dz, dz)
        assert dx < 1e-9 and dy < 1e-9 and dz < 1e-9, f"id={mid} ref vs movie delta dx={dx} dy={dy} dz={dz}"
    print(
        f"[P18.2] Verified {len(sample_ids)} random ids | max |Δ| ref−movie: "
        f"{max_dx:.3e}, {max_dy:.3e}, {max_dz:.3e}",
        flush=True,
    )
    print(f"[P18.2] Done at {datetime.now(timezone.utc).isoformat()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
