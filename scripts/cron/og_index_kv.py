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
import socket
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence

META_G_KEY = "meta:G"
TODAY_KEY = "today"
MOVIE_KEY_PREFIX = "movie:"
DEFAULT_BULK_BATCH_SIZE = 1000
CF_KV_BULK_MAX_KEYS = 10_000
CF_KV_BULK_GET_MAX_KEYS = 100
CF_KV_LIST_MAX_LIMIT = 1_000


class KvAdapterError(RuntimeError):
    """A Cloudflare KV operation failed with safe, actionable context."""

    def __init__(self, *, operation: str, status: int | str, context: str) -> None:
        self.operation = operation
        self.status = status
        self.context = context
        super().__init__(f"KV {operation} failed status={status} context={context}")


def _kv_url(account_id: str, namespace_id: str, suffix: str) -> str:
    return (
        f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
        f"/storage/kv/namespaces/{namespace_id}{suffix}"
    )


def _safe_context(*, account_id: str, namespace_id: str, key_count: int) -> str:
    """Return error context deliberately excluding credentials and values."""
    return f"account={account_id!r} namespace={namespace_id!r} key_count={key_count}"


def _require_batch_size(batch_size: int, *, maximum: int, operation: str) -> None:
    if not isinstance(batch_size, int) or isinstance(batch_size, bool) or not 1 <= batch_size <= maximum:
        raise ValueError(f"{operation} batch_size must be in 1..{maximum}, got {batch_size!r}")


def _require_batch_keys(keys: Sequence[str], *, maximum: int, operation: str) -> list[str]:
    if isinstance(keys, (str, bytes)):
        raise ValueError(f"{operation} keys must be a sequence of strings, not a scalar")
    if not keys:
        raise ValueError(f"{operation} keys must be non-empty")
    if len(keys) > maximum:
        raise ValueError(f"{operation} accepts at most {maximum} keys, got {len(keys)}")
    normalized: list[str] = []
    for key in keys:
        if not isinstance(key, str) or not key:
            raise ValueError(f"{operation} keys must be non-empty strings")
        normalized.append(key)
    if len(set(normalized)) != len(normalized):
        raise ValueError(f"{operation} keys must be unique")
    return normalized


def _request_json(
    *,
    operation: str,
    url: str,
    api_token: str,
    context: str,
    method: str = "GET",
    body: bytes | None = None,
    timeout_s: float = 120.0,
) -> dict[str, Any]:
    """Perform one Cloudflare API request without exposing the bearer token."""
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as err:
        raise KvAdapterError(operation=operation, status=err.code, context=context) from err
    except (TimeoutError, socket.timeout) as err:
        raise KvAdapterError(operation=operation, status="timeout", context=context) from err
    except urllib.error.URLError as err:
        reason = "timeout" if isinstance(err.reason, (TimeoutError, socket.timeout)) else "urlerror"
        raise KvAdapterError(operation=operation, status=reason, context=context) from err
    except UnicodeDecodeError as err:
        raise KvAdapterError(operation=operation, status="invalid-encoding", context=context) from err
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as err:
        raise KvAdapterError(operation=operation, status="invalid-json", context=context) from err
    if not isinstance(payload, dict):
        raise KvAdapterError(operation=operation, status="invalid-json", context=context)
    if payload.get("success") is not True:
        raise KvAdapterError(operation=operation, status="success:false", context=context)
    return payload


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
    _require_batch_size(batch_size, maximum=CF_KV_BULK_MAX_KEYS, operation="bulk PUT")
    for i in range(0, len(entries), batch_size):
        part = entries[i : i + batch_size]
        yield [{"key": k, "value": v} for k, v in part]


def _kv_api_token() -> str:
    """Prefer dedicated KV token; fall back to shared Cloudflare API token."""
    return (
        os.environ.get("OG_INDEX_KV_API_TOKEN", "").strip()
        or os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    )


def _required_kv_env() -> dict[str, str] | None:
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    namespace_id = os.environ.get("OG_INDEX_KV_NAMESPACE_ID", "").strip()
    api_token = _kv_api_token()
    if not account_id or not namespace_id or not api_token:
        return None
    return {
        "CLOUDFLARE_ACCOUNT_ID": account_id,
        "CLOUDFLARE_API_TOKEN": api_token,
        "OG_INDEX_KV_NAMESPACE_ID": namespace_id,
    }


def kv_bulk_put(
    *,
    account_id: str,
    namespace_id: str,
    api_token: str,
    batch: list[dict[str, str]],
    timeout_s: float = 120.0,
) -> None:
    """Put one Cloudflare-supported bulk batch."""
    if not isinstance(batch, list) or not batch or len(batch) > CF_KV_BULK_MAX_KEYS:
        size = len(batch) if isinstance(batch, list) else "non-list"
        raise ValueError(f"bulk PUT accepts a list of 1..{CF_KV_BULK_MAX_KEYS} entries, got {size}")
    normalized_batch: list[dict[str, str]] = []
    for entry in batch:
        if not isinstance(entry, Mapping) or set(entry) != {"key", "value"}:
            raise ValueError("bulk PUT entries must be mappings with exactly key and value")
        key = entry["key"]
        value = entry["value"]
        if not isinstance(key, str) or not key or not isinstance(value, str):
            raise ValueError("bulk PUT entry key must be non-empty str and value must be str")
        normalized_batch.append({"key": key, "value": value})
    _request_json(
        operation="bulk-put",
        url=_kv_url(account_id, namespace_id, "/bulk"),
        api_token=api_token,
        context=_safe_context(account_id=account_id, namespace_id=namespace_id, key_count=len(batch)),
        method="PUT",
        body=json.dumps(normalized_batch).encode("utf-8"),
        timeout_s=timeout_s,
    )


def kv_bulk_delete(
    *,
    account_id: str,
    namespace_id: str,
    api_token: str,
    keys: Sequence[str],
    timeout_s: float = 120.0,
) -> None:
    """Delete one Cloudflare KV bulk batch."""
    normalized = _require_batch_keys(keys, maximum=CF_KV_BULK_MAX_KEYS, operation="bulk DELETE")
    _request_json(
        operation="bulk-delete",
        url=_kv_url(account_id, namespace_id, "/bulk"),
        api_token=api_token,
        context=_safe_context(account_id=account_id, namespace_id=namespace_id, key_count=len(normalized)),
        method="DELETE",
        body=json.dumps(normalized).encode("utf-8"),
        timeout_s=timeout_s,
    )


def kv_bulk_get(
    *,
    account_id: str,
    namespace_id: str,
    api_token: str,
    keys: Sequence[str],
    timeout_s: float = 120.0,
) -> dict[str, str | None]:
    """Read up to 100 KV keys; absent keys have a ``None`` value."""
    normalized = _require_batch_keys(keys, maximum=CF_KV_BULK_GET_MAX_KEYS, operation="bulk GET")
    body = json.dumps({"keys": normalized, "type": "text"}).encode("utf-8")
    payload = _request_json(
        operation="bulk-get",
        url=_kv_url(account_id, namespace_id, "/bulk/get"),
        api_token=api_token,
        context=_safe_context(account_id=account_id, namespace_id=namespace_id, key_count=len(normalized)),
        method="POST",
        body=body,
        timeout_s=timeout_s,
    )
    result = payload.get("result")
    context = _safe_context(account_id=account_id, namespace_id=namespace_id, key_count=len(normalized))
    if not isinstance(result, Mapping):
        raise KvAdapterError(operation="bulk-get", status="invalid-result", context=context)
    values_payload = result.get("values")
    if not isinstance(values_payload, Mapping):
        raise KvAdapterError(operation="bulk-get", status="invalid-result", context=context)
    values: dict[str, str | None] = {key: None for key in normalized}
    for key, value in values_payload.items():
        if not isinstance(key, str) or key not in values or not isinstance(value, str):
            raise KvAdapterError(operation="bulk-get", status="invalid-result", context=context)
        values[key] = value
    return values


def kv_read_many(
    *,
    account_id: str,
    namespace_id: str,
    api_token: str,
    keys: Sequence[str],
    timeout_s: float = 120.0,
) -> dict[str, str | None]:
    """Read any positive number of keys in explicit API-size batches."""
    normalized = _require_batch_keys(keys, maximum=10**9, operation="read-back")
    values: dict[str, str | None] = {}
    for start in range(0, len(normalized), CF_KV_BULK_GET_MAX_KEYS):
        values.update(
            kv_bulk_get(
                account_id=account_id,
                namespace_id=namespace_id,
                api_token=api_token,
                keys=normalized[start : start + CF_KV_BULK_GET_MAX_KEYS],
                timeout_s=timeout_s,
            )
        )
    return values


def verify_kv_values(
    *,
    account_id: str,
    namespace_id: str,
    api_token: str,
    expected: Mapping[str, str],
    timeout_s: float = 120.0,
) -> None:
    """Read once and fail when any committed value differs byte-for-byte."""
    if not expected:
        raise ValueError("read-back expected values must be non-empty")
    actual = kv_read_many(
        account_id=account_id, namespace_id=namespace_id, api_token=api_token,
        keys=list(expected), timeout_s=timeout_s,
    )
    mismatched = [key for key, value in expected.items() if actual.get(key) != value]
    if mismatched:
        raise KvAdapterError(operation="read-back-verify-values", status="mismatch", context=f"key_count={len(mismatched)}")


def verify_kv_absent(
    *,
    account_id: str,
    namespace_id: str,
    api_token: str,
    keys: Sequence[str],
    timeout_s: float = 120.0,
) -> None:
    """Read once and fail if a deleted key is still present."""
    actual = kv_read_many(
        account_id=account_id, namespace_id=namespace_id, api_token=api_token, keys=keys, timeout_s=timeout_s,
    )
    present = [key for key, value in actual.items() if value is not None]
    if present:
        raise KvAdapterError(operation="read-back-verify-delete", status="mismatch", context=f"key_count={len(present)}")


def kv_list_movie_keys(
    *,
    account_id: str,
    namespace_id: str,
    api_token: str,
    page_size: int = CF_KV_LIST_MAX_LIMIT,
    timeout_s: float = 120.0,
) -> list[str]:
    """List every ``movie:*`` key, checking cursor progress on each page."""
    _require_batch_size(page_size, maximum=CF_KV_LIST_MAX_LIMIT, operation="list")
    cursor: str | None = None
    seen_cursors: set[str] = set()
    keys: list[str] = []
    seen_keys: set[str] = set()
    while True:
        query_values: dict[str, str | int] = {"prefix": MOVIE_KEY_PREFIX, "limit": page_size}
        if cursor is not None:
            query_values["cursor"] = cursor
        payload = _request_json(
            operation="list-movie-keys",
            url=f"{_kv_url(account_id, namespace_id, '/keys')}?{urllib.parse.urlencode(query_values)}",
            api_token=api_token,
            context=_safe_context(account_id=account_id, namespace_id=namespace_id, key_count=len(keys)),
            timeout_s=timeout_s,
        )
        result = payload.get("result")
        if not isinstance(result, list):
            raise KvAdapterError(operation="list-movie-keys", status="invalid-result", context="result is not a list")
        for item in result:
            if not isinstance(item, Mapping) or not isinstance(item.get("name"), str):
                raise KvAdapterError(operation="list-movie-keys", status="invalid-result", context="key entry is invalid")
            name = item["name"]
            if not name.startswith(MOVIE_KEY_PREFIX):
                raise KvAdapterError(operation="list-movie-keys", status="invalid-result", context="key outside requested prefix")
            if name in seen_keys:
                raise KvAdapterError(operation="list-movie-keys", status="duplicate-key", context="duplicate movie key across pages")
            seen_keys.add(name)
            keys.append(name)
        info = payload.get("result_info")
        if not isinstance(info, Mapping):
            raise KvAdapterError(operation="list-movie-keys", status="invalid-result", context="result_info missing")
        next_cursor = info.get("cursor")
        if next_cursor is None or next_cursor == "":
            return keys
        if not isinstance(next_cursor, str) or next_cursor in seen_cursors:
            raise KvAdapterError(operation="list-movie-keys", status="invalid-cursor", context="invalid or repeated cursor")
        seen_cursors.add(next_cursor)
        cursor = next_cursor


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
