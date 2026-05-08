#!/usr/bin/env python3
"""P23.1: Pick one TMDB id per UTC calendar day (deterministic hash) and write ``today.json``.

Reads ``galaxy_data.json`` on disk (post-export). ``movie_id`` is always a member of ``movies[]``.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


def pick_today_movie_id(
    movie_ids_pool: list[int],
    *,
    date_utc: date,
    min_vote_count: int = 0,
    movies_by_id: dict[int, dict[str, Any]],
) -> int:
    """Deterministic by UTC date: SHA256(date) mod N over filtered pool."""
    pool = [mid for mid in movie_ids_pool if int(movies_by_id[mid].get("vote_count", 0) or 0) >= min_vote_count]
    assert len(pool) > 0, "empty pool after min_vote_count filter"
    pool_sorted = sorted(pool)
    seed = int(hashlib.sha256(date_utc.isoformat().encode("utf-8")).hexdigest()[:16], 16)
    picked = pool_sorted[seed % len(pool_sorted)]
    print(
        f"[pick_movie_today] date_utc={date_utc.isoformat()} min_vote_count={min_vote_count} "
        f"pool_n={len(pool_sorted)} seed16={seed:016x} -> movie_id={picked}",
        flush=True,
    )
    return picked


def _load_galaxy_movies(galaxy_json: Path) -> tuple[list[dict[str, Any]], dict[int, dict[str, Any]]]:
    raw = json.loads(galaxy_json.read_text(encoding="utf-8"))
    assert isinstance(raw, dict), "galaxy root must be object"
    movies = raw.get("movies")
    assert isinstance(movies, list), "galaxy.movies must be array"
    assert len(movies) > 0, "galaxy.movies must be non-empty"
    by_id: dict[int, dict[str, Any]] = {}
    for i, m in enumerate(movies):
        assert isinstance(m, dict), f"movies[{i}] must be object"
        mid = int(m["id"])
        assert mid not in by_id, f"duplicate movie id {mid}"
        by_id[mid] = m
    print(f"[pick_movie_today] galaxy movies n={len(by_id):,}", flush=True)
    return movies, by_id


def write_today_json(
    galaxy_json: Path,
    output_json: Path,
    *,
    date_utc: date,
    min_vote_count: int = 0,
) -> dict[str, Any]:
    _, movies_by_id = _load_galaxy_movies(galaxy_json)
    pool = list(movies_by_id.keys())
    movie_id = pick_today_movie_id(pool, date_utc=date_utc, min_vote_count=min_vote_count, movies_by_id=movies_by_id)
    assert movie_id in movies_by_id, "picked id must exist in galaxy"
    selected_at = datetime.now(timezone.utc).isoformat()
    payload: dict[str, Any] = {
        "date": date_utc.isoformat(),
        "movie_id": movie_id,
        "selected_at": selected_at,
        "selection_strategy": "deterministic_by_utc_date",
        "min_vote_count": int(min_vote_count),
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"[pick_movie_today] wrote {output_json} movie_id={movie_id}", flush=True)
    return payload


def _today_min_vote_count_from_env() -> int:
    raw = os.environ.get("TODAY_MIN_VOTE_COUNT", "0").strip()
    try:
        v = int(raw)
    except ValueError:
        return 0
    return max(0, v)


def write_today_json_after_galaxy_export(repo_root: Path, *, min_vote_count: int | None = None) -> None:
    """Write ``frontend/public/data/today.json`` after ``galaxy_data.json`` exists (nightly / monthly)."""
    gal = (repo_root / "frontend" / "public" / "data" / "galaxy_data.json").resolve()
    out = (repo_root / "frontend" / "public" / "data" / "today.json").resolve()
    mv = int(min_vote_count) if min_vote_count is not None else _today_min_vote_count_from_env()
    date_utc = datetime.now(timezone.utc).date()
    write_today_json(gal, out, date_utc=date_utc, min_vote_count=mv)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--galaxy-json",
        type=Path,
        default=Path("frontend/public/data/galaxy_data.json"),
        help="Path to galaxy_data.json (default: frontend/public/data/galaxy_data.json)",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=Path("frontend/public/data/today.json"),
        help="Output path for today.json",
    )
    p.add_argument("--min-vote-count", type=int, default=0, help="Minimum vote_count for pool (default: 0)")
    p.add_argument(
        "--date-utc",
        type=str,
        default=None,
        help="Override UTC date as YYYY-MM-DD (default: today UTC)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    gal = args.galaxy_json.expanduser().resolve()
    out = args.output.expanduser().resolve()
    if not gal.is_file():
        print(f"Error: --galaxy-json not found: {gal}", file=sys.stderr)
        return 1
    if args.min_vote_count < 0:
        print("Error: --min-vote-count must be >= 0", file=sys.stderr)
        return 1
    if args.date_utc is None:
        date_utc = datetime.now(timezone.utc).date()
    else:
        date_utc = date.fromisoformat(args.date_utc.strip())
    write_today_json(gal, out, date_utc=date_utc, min_vote_count=int(args.min_vote_count))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
