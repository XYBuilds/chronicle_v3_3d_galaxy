#!/usr/bin/env python3
"""Post-deploy smoke for Chronicle Pages promotion.

Checks home, a valid movie deep link, ordinary invalid-path equivalence for
retired `/today` and `/share/today`, and that the production manifest resolves
to immutable R2 objects. Planet Export → Daily and OG Worker consumer smokes
remain those repositories' handoff after explicit authorization.
"""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import urljoin

INVALID_PATH = "/this-path-does-not-exist-chronicle-smoke"
TODAY_PATH = "/today"
SHARE_TODAY_PATH = "/share/today"
DEFAULT_ORIGIN = "https://themoviecosmos.com"

HttpSnapshot = tuple[int, dict[str, str], bytes]


class SmokeError(ValueError):
    """A production smoke check failed closed."""


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeError(message)


def _http_request(url: str, *, timeout: int = 30) -> HttpSnapshot:
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            headers = {str(key).lower(): str(value) for key, value in response.headers.items()}
            return int(response.status), headers, response.read()
    except urllib.error.HTTPError as exc:
        headers = {str(key).lower(): str(value) for key, value in exc.headers.items()} if exc.headers else {}
        body = exc.read() if exc.fp is not None else b""
        return int(exc.code), headers, body
    except urllib.error.URLError as exc:
        raise SmokeError(f"request failed: {url} ({exc})") from exc


def _assert_equivalent(left: HttpSnapshot, right: HttpSnapshot, *, label: str) -> None:
    left_status, left_headers, left_body = left
    right_status, right_headers, right_body = right
    _assert(left_status == right_status, f"{label} status {left_status} != {right_status}")
    _assert(
        left_headers.get("content-type") == right_headers.get("content-type"),
        f"{label} content-type {left_headers.get('content-type')!r} != {right_headers.get('content-type')!r}",
    )
    _assert(left_body == right_body, f"{label} body mismatch")


def run_smoke(*, origin: str, expected_data_version: str, movie_id: str) -> dict[str, Any]:
    _assert(isinstance(origin, str) and origin.startswith("http"), "origin is required")
    _assert(isinstance(expected_data_version, str) and bool(expected_data_version.strip()), "expected data_version is required")
    _assert(isinstance(movie_id, str) and bool(movie_id.strip()), "movie_id is required")
    base = origin.rstrip("/") + "/"
    home_status, _home_headers, _home = _http_request(urljoin(base, "/"))
    _assert(home_status == 200, f"home returned {home_status}")
    movie_status, _movie_headers, _movie = _http_request(urljoin(base, f"/movie/{movie_id.strip()}"))
    _assert(movie_status == 200, f"movie deep link returned {movie_status}")
    invalid = _http_request(urljoin(base, INVALID_PATH))
    today = _http_request(urljoin(base, TODAY_PATH))
    share_today = _http_request(urljoin(base, SHARE_TODAY_PATH))
    _assert_equivalent(today, invalid, label="/today")
    _assert_equivalent(share_today, invalid, label="/share/today")
    manifest_status, _manifest_headers, manifest_body = _http_request(urljoin(base, "/data/galaxy_assets_manifest.json"))
    _assert(manifest_status == 200, f"production manifest returned {manifest_status}")
    try:
        manifest = json.loads(manifest_body.decode("utf-8") if isinstance(manifest_body, (bytes, bytearray)) else str(manifest_body))
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError) as exc:
        raise SmokeError("production manifest is unreadable") from exc
    _assert(isinstance(manifest, dict), "production manifest is unreadable")
    data_version = manifest.get("data_version")
    _assert(data_version == expected_data_version.strip(), f"manifest data_version {data_version!r} != {expected_data_version.strip()!r}")
    for key in ("galaxy_data_gzip_url", "galaxy_search_index_gzip_url"):
        url = manifest.get(key)
        _assert(isinstance(url, str) and url.startswith("http"), f"manifest {key} is required")
        status, _headers, _body = _http_request(url)
        _assert(status == 200, f"{key} returned {status}")
    profile_url = manifest.get("focus_emission_profile_url")
    if isinstance(profile_url, str) and profile_url.startswith("http"):
        profile_status, _profile_headers, _profile = _http_request(profile_url)
        _assert(profile_status == 200, f"focus_emission_profile_url returned {profile_status}")
    return {"ok": True, "origin": origin.rstrip("/"), "data_version": data_version, "movie_id": movie_id.strip()}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default=DEFAULT_ORIGIN)
    parser.add_argument("--expected-data-version", required=True)
    parser.add_argument("--movie-id", default="550")
    args = parser.parse_args(argv)
    try:
        payload = run_smoke(
            origin=args.origin,
            expected_data_version=args.expected_data_version,
            movie_id=args.movie_id,
        )
    except SmokeError as exc:
        print(f"[production-smoke] error: {exc}", flush=True)
        return 1
    print(json.dumps(payload, indent=2, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
