#!/usr/bin/env python3
"""P18.4: Export ``galaxy_data.json`` / ``.gz`` + search index from Supabase ``movies`` (coordinates unchanged)."""
from __future__ import annotations

import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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

# PostgREST: avoid select("*") — omits unused columns (e.g. title_normalized, z, timestamps)
# and shrinks JSON payload vs full row transfer.
_MAX_FETCH_RETRIES = max(1, int(os.environ.get("GALAXY_EXPORT_FETCH_RETRIES", "5")))
_FETCH_RETRY_BASE_SEC = max(0.25, float(os.environ.get("GALAXY_EXPORT_FETCH_RETRY_BASE_SEC", "2.0")))

_MOVIES_EXPORT_COLUMNS: tuple[str, ...] = (
    "id",
    "title",
    "original_title",
    "overview",
    "tagline",
    "release_date",
    "genres",
    "original_language",
    "vote_count",
    "vote_average",
    "popularity",
    "imdb_rating",
    "imdb_votes",
    "runtime",
    "revenue",
    "budget",
    "production_countries",
    "production_companies",
    "spoken_languages",
    "cast_list",
    "director",
    "writers",
    "producers",
    "director_of_photography",
    "music_composer",
    "poster_path",
    "imdb_id",
    "x",
    "y",
)
MOVIES_EXPORT_SELECT = ",".join(_MOVIES_EXPORT_COLUMNS)


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


def _movies_exact_count(supabase: Any) -> int:
    r = _supabase_execute_with_retry(
        lambda: supabase.table("movies").select("id", count="exact").limit(1).execute(),
        label="movies count",
    )
    c = getattr(r, "count", None)
    assert c is not None and c >= 0, "movies count not returned (need count=exact from PostgREST)"
    return int(c)


def _is_retriable_supabase_error(exc: BaseException) -> bool:
    """True for Postgres statement timeout (57014) and similar transient PostgREST failures."""
    try:
        from postgrest.exceptions import APIError
    except ImportError:
        return False
    if not isinstance(exc, APIError):
        return False
    code = str(getattr(exc, "code", "") or "")
    msg = str(getattr(exc, "message", "") or exc.args[0] if exc.args else "").lower()
    return code == "57014" or "statement timeout" in msg or "canceling statement" in msg


def _supabase_execute_with_retry(call: Any, *, label: str) -> Any:
    last: BaseException | None = None
    for attempt in range(1, _MAX_FETCH_RETRIES + 1):
        try:
            return call()
        except Exception as e:
            if not _is_retriable_supabase_error(e) or attempt >= _MAX_FETCH_RETRIES:
                raise
            last = e
            delay = _FETCH_RETRY_BASE_SEC * (2 ** (attempt - 1))
            print(
                f"[P18.4 export] {label} retriable ({attempt}/{_MAX_FETCH_RETRIES}): "
                f"{e!s}; sleep {delay:.1f}s",
                flush=True,
            )
            time.sleep(delay)
    raise AssertionError(f"{label}: retry loop exhausted") from last


def _fetch_movies_shard(
    url: str,
    key: str,
    *,
    select_str: str,
    row_start: int,
    row_end_exclusive: int,
    page_size: int,
    shard_idx: int,
) -> list[dict[str, Any]]:
    """Own Supabase client per thread (HTTP client is not shared across threads)."""
    from supabase import create_client  # noqa: WPS433

    supabase = create_client(url, key)
    out: list[dict[str, Any]] = []
    pos = row_start
    t0 = time.perf_counter()
    while pos < row_end_exclusive:
        end = min(pos + page_size - 1, row_end_exclusive - 1)
        want = end - pos + 1
        res = _supabase_execute_with_retry(
            lambda pos=pos, end=end: (
                supabase.table("movies")
                .select(select_str)
                .order("id", desc=False)
                .range(pos, end)
                .execute()
            ),
            label=f"shard {shard_idx} range [{pos},{end}]",
        )
        batch = res.data or []
        if not batch:
            break
        out.extend(batch)
        n = len(batch)
        pos += n
        if n < want:
            break
    elapsed = time.perf_counter() - t0
    print(
        f"[P18.4 export] shard {shard_idx} rows [{row_start}, {row_end_exclusive}) "
        f"n={len(out):,} {elapsed:.1f}s",
        flush=True,
    )
    return out


def fetch_all_movies(
    supabase: Any,
    *,
    page_size: int,
    url: str,
    key: str,
    fetch_workers: int,
) -> list[dict[str, Any]]:
    workers = max(1, int(fetch_workers))
    try:
        return _fetch_all_movies_impl(
            supabase,
            page_size=page_size,
            url=url,
            key=key,
            fetch_workers=workers,
        )
    except Exception as e:
        if workers <= 1:
            raise
        print(
            f"[P18.4 export] parallel fetch failed ({type(e).__name__}: {e}); "
            "retrying sequential (fetch_workers=1)",
            flush=True,
        )
        return _fetch_all_movies_impl(
            supabase,
            page_size=page_size,
            url=url,
            key=key,
            fetch_workers=1,
        )


def _fetch_all_movies_impl(
    supabase: Any,
    *,
    page_size: int,
    url: str,
    key: str,
    fetch_workers: int,
) -> list[dict[str, Any]]:
    select_str = MOVIES_EXPORT_SELECT
    workers = max(1, int(fetch_workers))
    if workers == 1:
        total = _movies_exact_count(supabase)
        if total == 0:
            print("[P18.4 export] total movies rows=0", flush=True)
            return []
        out = _fetch_movies_shard(
            url,
            key,
            select_str=select_str,
            row_start=0,
            row_end_exclusive=total,
            page_size=page_size,
            shard_idx=0,
        )
        print(f"[P18.4 export] total movies rows={len(out):,}", flush=True)
        assert len(out) > 0, "movies table is empty"
        return out

    total = _movies_exact_count(supabase)
    print(
        f"[P18.4 export] parallel fetch workers={workers} page_size={page_size} total={total:,}",
        flush=True,
    )
    if total == 0:
        print("[P18.4 export] total movies rows=0", flush=True)
        return []
    shard_size = (total + workers - 1) // workers
    ranges: list[tuple[int, int, int]] = []
    for w in range(workers):
        a = w * shard_size
        b = min(total, (w + 1) * shard_size)
        if a < b:
            ranges.append((w, a, b))

    out_by_shard: list[list[dict[str, Any]]] = [[] for _ in ranges]
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=len(ranges)) as ex:
        futs = {
            ex.submit(
                _fetch_movies_shard,
                url,
                key,
                select_str=select_str,
                row_start=a,
                row_end_exclusive=b,
                page_size=page_size,
                shard_idx=w,
            ): idx
            for idx, (w, a, b) in enumerate(ranges)
        }
        for fut in as_completed(futs):
            idx = futs[fut]
            out_by_shard[idx] = fut.result()
    elapsed = time.perf_counter() - t0
    out: list[dict[str, Any]] = []
    for part in out_by_shard:
        out.extend(part)
    print(f"[P18.4 export] total movies rows={len(out):,} wall {elapsed:.1f}s", flush=True)
    assert len(out) == total, f"row count mismatch: got {len(out)} expected {total}"
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
    p.add_argument(
        "--page-size",
        type=int,
        default=1000,
        help="Rows per PostgREST request (do not exceed project max-rows, often 1000)",
    )
    p.add_argument(
        "--fetch-workers",
        type=int,
        default=int(os.environ.get("GALAXY_EXPORT_FETCH_WORKERS", "2")),
        help="Parallel shards for movies fetch (1=sequential). Env: GALAXY_EXPORT_FETCH_WORKERS",
    )
    p.add_argument(
        "--export-seq",
        type=str,
        default=os.environ.get("GALAXY_EXPORT_SEQ", "0"),
        help="Suffix for meta.version daily branch (default env GALAXY_EXPORT_SEQ or 0)",
    )
    p.add_argument(
        "--version-branch",
        type=str,
        choices=("daily", "monthly"),
        default="daily",
        help="meta.version segment (daily vs monthly). Env GALAXY_EXPORT_VERSION_BRANCH overrides when daily/monthly.",
    )
    p.add_argument(
        "--threshold-version",
        type=str,
        default=os.environ.get("GALAXY_THRESHOLD_VERSION", ""),
        help="Optional meta.threshold_version (monthly refit; env GALAXY_THRESHOLD_VERSION)",
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
    rows = fetch_all_movies(
        supabase,
        page_size=max(100, int(args.page_size)),
        url=url,
        key=key,
        fetch_workers=max(1, int(args.fetch_workers)),
    )
    df, xy = rows_to_dataframe(rows)
    print(f"[P18.4 export] DataFrame shape={df.shape} xy.shape={xy.shape}", flush=True)

    now = datetime.now(timezone.utc)
    env_b = os.environ.get("GALAXY_EXPORT_VERSION_BRANCH", "").strip().lower()
    if env_b in ("daily", "monthly"):
        branch = env_b
    else:
        branch = str(args.version_branch).strip().lower()
    if branch not in ("daily", "monthly"):
        branch = "daily"
    version = f"{now.strftime('%Y.%m.%d')}.{branch}.{str(args.export_seq).strip()}"
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
    tv = str(args.threshold_version).strip()
    if tv:
        meta["threshold_version"] = tv
    movies = payload["movies"]
    print(
        f"[P18.4 export] payload meta.count={meta.get('count')} movies={len(movies)} "
        f"version={meta.get('version')} threshold_version={meta.get('threshold_version')!r}",
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
