#!/usr/bin/env python3
"""P18.4: Export ``galaxy_data.json`` / ``.gz`` + search index from Supabase ``movies`` (coordinates unchanged)."""
from __future__ import annotations

import argparse
import os
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

from export.export_galaxy_json import (  # noqa: E402
    EMBEDDING_MODEL_ID,
    build_galaxy_payload,
    write_galaxy_export_files,
)
from feature_engineering.genre_encoding import DEFAULT_GENRE_WEIGHT_RATIO  # noqa: E402

_DEFAULT_OUT_DIR = _REPO_ROOT / "frontend" / "public" / "data"


def _join_csv_field(val: object) -> str:
    if val is None:
        return ""
    if isinstance(val, list):
        return ", ".join(str(x).strip() for x in val if str(x).strip())
    s = str(val).strip()
    return "" if s.casefold() in ("nan", "none") else s


def _imdb_cell(val: object) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return None if not s or s.casefold() in ("nan", "none") else s


def fetch_all_movies(supabase: Any, *, page_size: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    start = 0
    while True:
        end = start + page_size - 1
        res = supabase.table("movies").select("*").order("id", desc=False).range(start, end).execute()
        batch = res.data or []
        print(f"[P18.4 export] fetched movies rows [{start}, {end}] n={len(batch)}", flush=True)
        if not batch:
            break
        out.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    print(f"[P18.4 export] total movies rows={len(out):,}", flush=True)
    assert len(out) > 0, "movies table is empty"
    return out


def rows_to_dataframe(rows: list[dict[str, Any]]) -> tuple[pd.DataFrame, np.ndarray]:
    records: list[dict[str, Any]] = []
    xs: list[float] = []
    ys: list[float] = []
    for r in rows:
        mid = int(r["id"])
        genres = _join_csv_field(r.get("genres"))
        cast = _join_csv_field(r.get("cast_list"))
        rec = {
            "id": mid,
            "title": str(r.get("title") or "").strip(),
            "original_title": str(r.get("original_title") or "").strip(),
            "overview": str(r.get("overview") or "").strip(),
            "tagline": str(r.get("tagline") or "").strip(),
            "release_date": str(r.get("release_date") or "").strip(),
            "genres": genres,
            "original_language": str(r.get("original_language") or "").strip(),
            "vote_count": int(r["vote_count"]),
            "vote_average": float(r["vote_average"]),
            "popularity": float(r.get("popularity") or 0.0),
            "imdb_rating": r.get("imdb_rating"),
            "imdb_votes": r.get("imdb_votes"),
            "runtime": r.get("runtime"),
            "revenue": int(r.get("revenue") or 0),
            "budget": int(r.get("budget") or 0),
            "production_countries": _join_csv_field(r.get("production_countries")),
            "production_companies": _join_csv_field(r.get("production_companies")),
            "spoken_languages": _join_csv_field(r.get("spoken_languages")),
            "cast": cast,
            "director": _join_csv_field(r.get("director")),
            "writers": _join_csv_field(r.get("writers")),
            "producers": _join_csv_field(r.get("producers")),
            "director_of_photography": _join_csv_field(r.get("director_of_photography")),
            "music_composer": _join_csv_field(r.get("music_composer")),
            "poster_path": str(r.get("poster_path") or "").strip(),
            "imdb_id": _imdb_cell(r.get("imdb_id")),
        }
        records.append(rec)
        xs.append(float(r["x"]))
        ys.append(float(r["y"]))
    df = pd.DataFrame.from_records(records)
    xy = np.column_stack([np.asarray(xs, dtype=np.float32), np.asarray(ys, dtype=np.float32)])
    assert len(df) == xy.shape[0], "df / xy length mismatch"
    return df, xy


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output-dir", type=Path, default=_DEFAULT_OUT_DIR, help="Directory for galaxy_data.json(.gz)")
    p.add_argument("--page-size", type=int, default=1000, help="Supabase range page size")
    p.add_argument(
        "--export-seq",
        type=str,
        default=os.environ.get("GALAXY_EXPORT_SEQ", "0"),
        help="Suffix for meta.version daily branch (default env GALAXY_EXPORT_SEQ or 0)",
    )
    p.add_argument("--skip-plain-json", action="store_true", help="Write only .json.gz (smaller CI artifacts)")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    env_path = _REPO_ROOT / ".env"
    if env_path.is_file():
        from dotenv import load_dotenv

        load_dotenv(env_path)
        print(f"[P18.4 export] Loaded {env_path}", flush=True)

    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Error: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    from supabase import create_client  # noqa: WPS433

    supabase = create_client(url, key)
    rows = fetch_all_movies(supabase, page_size=max(100, int(args.page_size)))
    df, xy = rows_to_dataframe(rows)
    print(f"[P18.4 export] DataFrame shape={df.shape} xy.shape={xy.shape}", flush=True)

    now = datetime.now(timezone.utc)
    version = f"{now.strftime('%Y.%m.%d')}.daily.{str(args.export_seq).strip()}"
    generated_at = now.isoformat()

    payload, genre_order = build_galaxy_payload(
        df,
        xy,
        version=version,
        generated_at=generated_at,
        embedding_model=EMBEDDING_MODEL_ID,
        genre_weight_ratio=float(DEFAULT_GENRE_WEIGHT_RATIO),
        densmap=True,
        n_neighbors=300,
        min_dist=0.4,
        metric="cosine",
        random_state=42,
    )
    meta = payload["meta"]
    movies = payload["movies"]
    print(
        f"[P18.4 export] payload meta.count={meta.get('count')} movies={len(movies)} version={meta.get('version')}",
        flush=True,
    )
    assert meta["count"] == len(movies) == len(df), "count invariant"

    out_dir = args.output_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_json = out_dir / "galaxy_data.json"
    out_gz = out_dir / "galaxy_data.json.gz"
    write_galaxy_export_files(
        payload,
        out_json=out_json,
        out_gz=out_gz,
        skip_gzip=False,
        gzip_only=bool(args.skip_plain_json),
        genre_keys_in_order=genre_order,
    )
    print(f"[P18.4 export] Done at {generated_at}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
