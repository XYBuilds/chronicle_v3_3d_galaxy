#!/usr/bin/env python3
"""Load galaxy_data.json and assert Tech Spec §4.3 required fields are present (non-null where required)."""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

# §4.3: must not be JSON null (empty string / [] / 0 allowed where the spec permits).
_MOVIE_REQUIRED_NON_NULL: tuple[str, ...] = (
    "x",
    "y",
    "z",
    "size",
    "emissive",
    "genre_color",
    "title",
    "original_title",
    "overview",
    "release_date",
    "genres",
    "original_language",
    "vote_count",
    "vote_average",
    "popularity",
    "revenue",
    "budget",
    "production_countries",
    "production_companies",
    "spoken_languages",
    "cast",
    "director",
    "writers",
    "producers",
    "director_of_photography",
    "music_composer",
    "poster_url",
    "id",
)

# Explicitly optional per §4.3 tables.
_MOVIE_OPTIONAL_NULL: frozenset[str] = frozenset(
    {"tagline", "imdb_rating", "imdb_votes", "runtime", "imdb_id"}
)

_META_KEYS: tuple[str, ...] = (
    "version",
    "generated_at",
    "count",
    "embedding_model",
    "umap_params",
    "genre_weight_ratio",
    "genre_palette",
    "feature_weights",
    "z_range",
    "xy_range",
)


def _is_null(v: Any) -> bool:
    return v is None


def _check_movie(mid: int, m: dict[str, Any]) -> None:
    for k in _MOVIE_REQUIRED_NON_NULL:
        if k not in m:
            raise AssertionError(f"movie id={mid}: missing key {k!r}")
        if _is_null(m[k]):
            raise AssertionError(f"movie id={mid}: required field {k!r} is null")
    for k, v in m.items():
        if k in _MOVIE_OPTIONAL_NULL:
            continue
        if _is_null(v):
            raise AssertionError(f"movie id={mid}: unexpected null for {k!r}")
    gc = m["genre_color"]
    if not isinstance(gc, list) or len(gc) != 3:
        raise AssertionError(f"movie id={mid}: genre_color must be length-3 list, got {gc!r}")
    for c in gc:
        if not isinstance(c, (int, float)) or not math.isfinite(float(c)):
            raise AssertionError(f"movie id={mid}: bad genre_color component {c!r}")
    for k in ("x", "y", "z", "size", "emissive"):
        v = m[k]
        if not isinstance(v, (int, float)) or not math.isfinite(float(v)):
            raise AssertionError(f"movie id={mid}: {k} must be finite float, got {v!r}")


def validate_payload(data: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if "meta" not in data or "movies" not in data:
        raise AssertionError("top-level keys must include 'meta' and 'movies'")
    meta = data["meta"]
    movies = data["movies"]
    for k in _META_KEYS:
        if k not in meta:
            raise AssertionError(f"meta missing key {k!r}")
        if _is_null(meta[k]):
            raise AssertionError(f"meta.{k} must not be null")
    if meta["count"] != len(movies):
        raise AssertionError(f"meta.count ({meta['count']}) != len(movies) ({len(movies)})")
    for m in movies:
        mid = int(m["id"])
        _check_movie(mid, m)
    return meta, movies


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Validate galaxy_data.json against Tech Spec §4.3 (smoke).")
    p.add_argument("--input", type=Path, required=True, help="galaxy_data.json path")
    p.add_argument("--print-movies", action="store_true", help="Print one summary line per movie")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    # Windows consoles often default to a legacy code page; UTF-8 avoids UnicodeEncodeError
    # when --print-movies emits non-ASCII titles (e.g. Chinese).
    for stream in (sys.stdout, sys.stderr):
        reconf = getattr(stream, "reconfigure", None)
        if callable(reconf):
            try:
                reconf(encoding="utf-8", errors="replace")
            except (OSError, ValueError, TypeError):
                pass

    args = parse_args(argv)
    path = args.input.expanduser().resolve()
    if not path.is_file():
        print(f"Error: file not found: {path}", file=sys.stderr)
        return 1
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    meta, movies = validate_payload(data)
    print(f"[Validate] OK — meta.count={meta['count']}, movies={len(movies)}")
    if args.print_movies:
        for m in movies:
            r, g, b = m["genre_color"]
            print(
                f"{m['id']}: {m['title']} → "
                f"x={float(m['x']):.2f} y={float(m['y']):.2f} z={float(m['z']):.2f} "
                f"size={float(m['size']):.2f} emissive={float(m['emissive']):.2f} "
                f"color=[{r:.3f}, {g:.3f}, {b:.3f}]"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
