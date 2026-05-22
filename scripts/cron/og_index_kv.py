#!/usr/bin/env python3
"""Phase 34.3: Build OG index records for Cloudflare KV (``OG_INDEX`` namespace).

Keys (SSOT for Worker repo):
  - ``meta:G`` — ``data_version`` string (``galaxy_data.json`` → ``meta.version``)
  - ``today`` — ``{"date": "YYYY-MM-DD", "movie_id": number}``
  - ``movie:{id}`` — ``{title, release_date, genres, poster_url}`` (minimal OG fields)
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterator

META_G_KEY = "meta:G"
TODAY_KEY = "today"
MOVIE_KEY_PREFIX = "movie:"
DEFAULT_BULK_BATCH_SIZE = 1000
CF_KV_BULK_MAX_KEYS = 10_000


def movie_kv_key(movie_id: int) -> str:
    return f"{MOVIE_KEY_PREFIX}{movie_id}"


def movie_og_record(movie: dict[str, Any]) -> dict[str, Any]:
    """Extract OG-minimal fields from a galaxy ``movies[]`` row."""
    mid = movie.get("id")
    assert isinstance(mid, int), f"movie id must be int, got {mid!r}"
    genres = movie.get("genres")
    if not isinstance(genres, list):
        genres = []
    return {
        "title": str(movie.get("title", "")).strip(),
        "release_date": str(movie.get("release_date", "")).strip(),
        "genres": genres,
        "poster_url": str(movie.get("poster_url", "")).strip(),
    }


def today_kv_value(today_payload: dict[str, Any]) -> dict[str, Any]:
    date_s = str(today_payload.get("date", "")).strip()
    movie_id = today_payload.get("movie_id")
    assert date_s, "today.json missing date"
    assert isinstance(movie_id, int), f"today movie_id must be int, got {movie_id!r}"
    return {"date": date_s, "movie_id": movie_id}


def iter_og_index_entries(
    *,
    data_version: str,
    today_payload: dict[str, Any],
    movies: list[dict[str, Any]] | None,
) -> Iterator[tuple[str, str]]:
    """Yield ``(key, value)`` pairs for KV bulk put (values are UTF-8 strings)."""
    assert data_version.strip(), "data_version must be non-empty"
    yield META_G_KEY, data_version.strip()
    yield TODAY_KEY, json.dumps(today_kv_value(today_payload), ensure_ascii=False, separators=(",", ":"))
    if movies is None:
        return
    for movie in movies:
        rec = movie_og_record(movie)
        yield movie_kv_key(int(movie["id"])), json.dumps(rec, ensure_ascii=False, separators=(",", ":"))


def chunk_entries(entries: list[tuple[str, str]], batch_size: int) -> Iterator[list[dict[str, str]]]:
    assert 0 < batch_size <= CF_KV_BULK_MAX_KEYS, f"batch_size must be in 1..{CF_KV_BULK_MAX_KEYS}"
    for i in range(0, len(entries), batch_size):
        part = entries[i : i + batch_size]
        yield [{"key": k, "value": v} for k, v in part]


def _required_kv_env() -> dict[str, str] | None:
    keys = (
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_API_TOKEN",
        "OG_INDEX_KV_NAMESPACE_ID",
    )
    out: dict[str, str] = {}
    for k in keys:
        v = os.environ.get(k, "").strip()
        if not v:
            return None
        out[k] = v
    return out


def kv_bulk_put(
    *,
    account_id: str,
    namespace_id: str,
    api_token: str,
    batch: list[dict[str, str]],
    timeout_s: float = 120.0,
) -> None:
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/storage/kv/namespaces/{namespace_id}/bulk"
    )
    body = json.dumps(batch).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"KV bulk PUT HTTP {err.code}: {detail}") from err
    payload = json.loads(raw)
    if not payload.get("success"):
        raise RuntimeError(f"KV bulk PUT failed: {payload!r}")


def load_galaxy_and_today(
    public_data: Path,
) -> tuple[str, dict[str, Any], list[dict[str, Any]]]:
    galaxy_path = public_data / "galaxy_data.json"
    today_path = public_data / "today.json"
    assert galaxy_path.is_file(), f"missing {galaxy_path}"
    assert today_path.is_file(), f"missing {today_path}"
    galaxy = json.loads(galaxy_path.read_text(encoding="utf-8"))
    today_raw = json.loads(today_path.read_text(encoding="utf-8"))
    assert isinstance(galaxy, dict), "galaxy_data.json root must be object"
    assert isinstance(today_raw, dict), "today.json root must be object"
    meta = galaxy.get("meta")
    assert isinstance(meta, dict), "galaxy_data.json missing meta"
    version = meta.get("version")
    assert isinstance(version, str) and version.strip(), "meta.version must be non-empty string"
    movies = galaxy.get("movies")
    assert isinstance(movies, list), "galaxy_data.json movies must be array"
    assert len(movies) > 0, "movies must be non-empty"
    return version.strip(), today_raw, movies


def sync_entries_to_kv(
    entries: list[tuple[str, str]],
    *,
    batch_size: int = DEFAULT_BULK_BATCH_SIZE,
) -> int:
    """Upload all entries; returns number of keys written."""
    env = _required_kv_env()
    if env is None:
        return 0
    assert len(entries) > 0, "entries must be non-empty"
    account_id = env["CLOUDFLARE_ACCOUNT_ID"]
    namespace_id = env["OG_INDEX_KV_NAMESPACE_ID"]
    token = env["CLOUDFLARE_API_TOKEN"]
    written = 0
    batches = list(chunk_entries(entries, batch_size))
    print(
        f"[og_index_kv] bulk put keys={len(entries)} batches={len(batches)} "
        f"batch_size={batch_size}",
        flush=True,
    )
    for i, batch in enumerate(batches):
        kv_bulk_put(
            account_id=account_id,
            namespace_id=namespace_id,
            api_token=token,
            batch=batch,
        )
        written += len(batch)
        print(f"[og_index_kv] batch {i + 1}/{len(batches)} ok keys={len(batch)}", flush=True)
    return written
