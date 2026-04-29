#!/usr/bin/env python3
"""Phase 12.1: build `galaxy_search_index.json` from exported `movies` (+ genre key order)."""
from __future__ import annotations

import argparse
import gzip
import json
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_GALAXY_GZ = _REPO_ROOT / "frontend" / "public" / "data" / "galaxy_data.json.gz"
_DEFAULT_SEARCH_GZ = _REPO_ROOT / "frontend" / "public" / "data" / "galaxy_search_index.json.gz"

# Tech Spec §4.5.1 role_mask bits
ROLE_CAST = 1
ROLE_DIRECTOR = 2
ROLE_DOP = 4
ROLE_WRITERS = 8
ROLE_PRODUCERS = 16
ROLE_MUSIC_COMPOSER = 32
ROLE_MASK_MAX = 63


def normalize_for_search(text: str) -> str:
    """NFKD + ASCII fold + casefold (shared with `title_normalized` on movies)."""
    s = unicodedata.normalize("NFKD", str(text).strip())
    s = s.encode("ascii", "ignore").decode("ascii")
    return s.casefold()


def _merge_person(
    bucket: dict[str, Any],
    raw_name: str,
    movie_id: int,
    role_bit: int,
) -> None:
    name = str(raw_name).strip()
    if not name:
        return
    nk = normalize_for_search(name)
    if not nk:
        return
    if nk not in bucket:
        bucket[nk] = {"full_counts": Counter(), "role_mask": 0, "ids": set()}
    bucket[nk]["full_counts"][name] += 1
    bucket[nk]["role_mask"] |= int(role_bit)
    bucket[nk]["ids"].add(int(movie_id))


def build_search_index_dict(
    *,
    movies: list[dict[str, Any]],
    genre_keys_in_order: list[str],
    version: str,
) -> dict[str, Any]:
    """People (merged by normalized key) + genres (palette key order, count + movie_ids)."""
    assert isinstance(movies, list), "movies must be a list"
    assert isinstance(genre_keys_in_order, list), "genre_keys_in_order must be a list"
    assert len(genre_keys_in_order) > 0, "genre palette must be non-empty"
    assert all(isinstance(g, str) and g for g in genre_keys_in_order), "genre keys must be non-empty strings"

    people_bucket: dict[str, Any] = {}
    for m in movies:
        mid = int(m["id"])
        for raw in m.get("cast") or []:
            _merge_person(people_bucket, raw, mid, ROLE_CAST)
        for raw in m.get("director") or []:
            _merge_person(people_bucket, raw, mid, ROLE_DIRECTOR)
        for raw in m.get("director_of_photography") or []:
            _merge_person(people_bucket, raw, mid, ROLE_DOP)
        for raw in m.get("writers") or []:
            _merge_person(people_bucket, raw, mid, ROLE_WRITERS)
        for raw in m.get("producers") or []:
            _merge_person(people_bucket, raw, mid, ROLE_PRODUCERS)
        for raw in m.get("music_composer") or []:
            _merge_person(people_bucket, raw, mid, ROLE_MUSIC_COMPOSER)

    people: dict[str, Any] = {}
    for nk, v in people_bucket.items():
        rm = int(v["role_mask"])
        assert 0 <= rm <= ROLE_MASK_MAX, f"role_mask out of [0,63] for key={nk!r}: {rm}"
        full: str = v["full_counts"].most_common(1)[0][0]
        ids_sorted = sorted(int(x) for x in v["ids"])
        people[nk] = {"full": full, "role_mask": rm, "movie_ids": ids_sorted}

    genre_counts: dict[str, int] = {g: 0 for g in genre_keys_in_order}
    genre_ids: dict[str, set[int]] = {g: set() for g in genre_keys_in_order}
    palette_set = set(genre_keys_in_order)

    for m in movies:
        mid = int(m["id"])
        # One increment per (movie, genre) membership; dedupe list duplicates in source CSV/json.
        for g in dict.fromkeys(m.get("genres") or []):
            if g not in palette_set:
                raise AssertionError(f"movie id={mid}: genre {g!r} not in meta.genre_palette keys")
            genre_counts[str(g)] += 1
            genre_ids[str(g)].add(mid)

    genres: dict[str, Any] = {
        g: {"count": int(genre_counts[g]), "movie_ids": sorted(genre_ids[g])} for g in genre_keys_in_order
    }

    assert set(genres.keys()) == palette_set, "genres keys must match palette exactly"
    for g in genre_keys_in_order:
        entry = genres[g]
        assert int(entry["count"]) == len(
            entry["movie_ids"]
        ), f"genre {g!r}: count must equal len(movie_ids) after per-movie genre dedupe"

    n_people = len(people)
    assert n_people > 0, "search index requires at least one person across cast/crew columns"
    print(f"[SearchIndex] people entries (unique normalized keys): {n_people}")
    total_refs = sum(len(people[k]["movie_ids"]) for k in people)
    avg_m = total_refs / float(n_people) if n_people else 0.0
    print(f"[SearchIndex] avg movie_ids per person (with multiplicity across roles merged): {avg_m:.2f}")

    for g in genre_keys_in_order:
        entry = genres[g]
        print(f"  genre {g!r}: count={entry['count']}, unique_movies={len(entry['movie_ids'])}")

    out = {"version": str(version), "people": people, "genres": genres}
    assert out["version"], "version must be non-empty"
    return out


def write_search_index_gzip(payload: dict[str, Any], out_gz: Path) -> int:
    """Serialize JSON and write gzip; returns uncompressed byte length."""
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    out_gz.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out_gz, "wb", compresslevel=9) as gz:
        gz.write(raw)
    gz_size = out_gz.stat().st_size
    print(f"[SearchIndex] wrote {out_gz} gzip_size={gz_size / 1024:.1f} kB (raw_json={len(raw) / 1024:.1f} kB)")
    return len(raw)


def _load_galaxy_obj(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FileNotFoundError(path)
    if path.suffix == ".gz" or path.name.endswith(".json.gz"):
        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)
    return json.loads(path.read_text(encoding="utf-8"))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build galaxy_search_index.json.gz from galaxy_data (Phase 12.1).")
    p.add_argument(
        "--galaxy-input",
        type=Path,
        default=_DEFAULT_GALAXY_GZ,
        help="galaxy_data.json or .json.gz (must include meta.genre_palette + movies)",
    )
    p.add_argument("--output-gzip", type=Path, default=_DEFAULT_SEARCH_GZ, help="Output galaxy_search_index.json.gz")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    gal_path = args.galaxy_input.expanduser().resolve()
    out_gz = args.output_gzip.expanduser().resolve()

    data = _load_galaxy_obj(gal_path)
    meta = data["meta"]
    movies = data["movies"]
    version = str(meta["version"])
    genre_keys_in_order = list(meta["genre_palette"].keys())
    print(f"[SearchIndex] source={gal_path} movies={len(movies)} version={version!r}")

    payload = build_search_index_dict(movies=movies, genre_keys_in_order=genre_keys_in_order, version=version)
    raw_len = write_search_index_gzip(payload, out_gz)
    assert raw_len > 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
