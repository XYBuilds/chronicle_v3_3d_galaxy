#!/usr/bin/env python3
"""Dated C-002 route-equivalence smoke for the retired Today surface (#389).

Compares GET/HEAD and query variants of retired Today URLs with ordinary
invalid Chronicle / unknown `/og/*` paths, then records a regression slice
for home, movie HTML, brand, missing-movie PNG fallback, version redirect,
unsupported methods, and unrelated unknown paths.

This is a dated observation, not perpetual proof. Run it against production
after a contract or deployment change and attach the JSON result.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin

DEFAULT_ORIGIN = "https://themoviecosmos.com"
ORDINARY_INVALID = "/unknown"
ORDINARY_UNKNOWN_OG = "/og/unknown.png"
BRAND_CANONICAL = "/og/brand.png?v=og-brand-og-v1"
REQUEST_HEADERS = {
    "User-Agent": "ChronicleC002RouteSmoke/1.0 (+https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/389)",
}

EQUIVALENCE_PAIRS: tuple[tuple[str, str], ...] = (
    ("/og/today.png", ORDINARY_UNKNOWN_OG),
    ("/og/today.png?cache=bust", f"{ORDINARY_UNKNOWN_OG}?cache=bust"),
    ("/today", ORDINARY_INVALID),
    ("/today?lang=zh", f"{ORDINARY_INVALID}?lang=zh"),
    ("/share/today", ORDINARY_INVALID),
    ("/share/today?lang=zh", f"{ORDINARY_INVALID}?lang=zh"),
)


class SmokeError(ValueError):
    """A dated route-equivalence check failed closed."""


@dataclass(frozen=True)
class HttpSnapshot:
    status: int
    content_type: str | None
    cache_control: str | None
    body: bytes
    body_sha256: str


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeError(message)


def _http_request(url: str, *, method: str = "GET", timeout: int = 30) -> HttpSnapshot:
    opener = urllib.request.build_opener(_NoRedirect)
    request = urllib.request.Request(url, method=method, headers=REQUEST_HEADERS)
    try:
        with opener.open(request, timeout=timeout) as response:
            headers = response.headers
            body = b"" if method.upper() == "HEAD" else response.read()
            status = int(response.status)
    except urllib.error.HTTPError as exc:
        headers = exc.headers
        body = b"" if method.upper() == "HEAD" else (exc.read() if exc.fp is not None else b"")
        status = int(exc.code)
    except urllib.error.URLError as exc:
        raise SmokeError(f"request failed: {url} ({exc})") from exc
    content_type = headers.get("Content-Type") if headers is not None else None
    cache_control = headers.get("Cache-Control") if headers is not None else None
    return HttpSnapshot(
        status=status,
        content_type=content_type,
        cache_control=cache_control,
        body=body,
        body_sha256=hashlib.sha256(body).hexdigest(),
    )


def _snapshot_record(snapshot: HttpSnapshot) -> dict[str, Any]:
    return {
        "status": snapshot.status,
        "content_type": snapshot.content_type,
        "cache_control": snapshot.cache_control,
        "body_sha256": snapshot.body_sha256,
        "body_bytes": len(snapshot.body),
    }


def assert_equivalent(left: HttpSnapshot, right: HttpSnapshot, *, label: str) -> None:
    _assert(left.status == right.status, f"{label} status {left.status} != {right.status}")
    _assert(
        left.content_type == right.content_type,
        f"{label} content-type {left.content_type!r} != {right.content_type!r}",
    )
    _assert(
        left.cache_control == right.cache_control,
        f"{label} cache-control {left.cache_control!r} != {right.cache_control!r}",
    )
    _assert(left.body == right.body, f"{label} body mismatch")


def compare_equivalence_pairs(
    *,
    origin: str,
    request_fn=_http_request,
) -> list[dict[str, Any]]:
    base = origin.rstrip("/") + "/"
    rows: list[dict[str, Any]] = []
    for candidate, ordinary in EQUIVALENCE_PAIRS:
        for method in ("GET", "HEAD"):
            left = request_fn(urljoin(base, candidate), method=method)
            right = request_fn(urljoin(base, ordinary), method=method)
            label = f"{method} {candidate} vs {ordinary}"
            assert_equivalent(left, right, label=label)
            rows.append(
                {
                    "candidate": candidate,
                    "ordinary": ordinary,
                    "method": method,
                    "result": "MATCH",
                    "snapshot": _snapshot_record(left),
                }
            )
    return rows


def collect_regression(
    *,
    origin: str,
    movie_id: str,
    request_fn=_http_request,
) -> list[dict[str, Any]]:
    base = origin.rstrip("/") + "/"
    movie = movie_id.strip()
    checks = (
        ("GET", "/", None),
        ("GET", f"/movie/{movie}", None),
        ("HEAD", BRAND_CANONICAL, 200),
        ("GET", "/og/brand.png", 302),
        ("GET", "/og/movie/999999999.png?v=anything", 200),
        ("POST", BRAND_CANONICAL, 405),
        ("GET", ORDINARY_UNKNOWN_OG, 404),
        ("GET", ORDINARY_INVALID, None),
    )
    rows: list[dict[str, Any]] = []
    for method, path, expected_status in checks:
        snapshot = request_fn(urljoin(base, path), method=method)
        if expected_status is not None:
            _assert(
                snapshot.status == expected_status,
                f"{method} {path} returned {snapshot.status}, expected {expected_status}",
            )
        rows.append(
            {
                "method": method,
                "path": path,
                "expected_status": expected_status,
                "snapshot": _snapshot_record(snapshot),
            }
        )
    home = request_fn(urljoin(base, "/"), method="GET")
    movie_html = request_fn(urljoin(base, f"/movie/{movie}"), method="GET")
    _assert(home.status == 200, f"home returned {home.status}")
    _assert(movie_html.status == 200, f"movie deep link returned {movie_html.status}")
    _assert(b"og:image" in movie_html.body or b"og:title" in movie_html.body, "movie HTML missing OG tags")
    image_match = re.search(
        br'property=["\']og:image["\']\s+content=["\']([^"\']+)["\']|content=["\']([^"\']+)["\']\s+property=["\']og:image["\']',
        movie_html.body,
    )
    _assert(image_match is not None, "movie HTML missing og:image URL")
    image_url = (image_match.group(1) or image_match.group(2) or b"").decode("utf-8")
    _assert("/og/movie/" in image_url and f"/{movie}.png" in image_url, f"unexpected og:image {image_url}")
    movie_png = request_fn(image_url, method="GET")
    _assert(movie_png.status == 200, f"movie PNG returned {movie_png.status}")
    _assert(
        (movie_png.content_type or "").startswith("image/png"),
        f"movie PNG content-type {movie_png.content_type!r}",
    )
    rows.append(
        {
            "method": "GET",
            "path": image_url,
            "expected_status": 200,
            "snapshot": _snapshot_record(movie_png),
        }
    )
    return rows


def run_smoke(*, origin: str, movie_id: str = "550", request_fn=_http_request) -> dict[str, Any]:
    _assert(isinstance(origin, str) and origin.startswith("http"), "origin is required")
    _assert(isinstance(movie_id, str) and bool(movie_id.strip()), "movie_id is required")
    comparisons = compare_equivalence_pairs(origin=origin, request_fn=request_fn)
    regression = collect_regression(origin=origin, movie_id=movie_id, request_fn=request_fn)
    return {
        "ok": True,
        "origin": origin.rstrip("/"),
        "movie_id": movie_id.strip(),
        "observed_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "comparisons": comparisons,
        "regression": regression,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default=DEFAULT_ORIGIN)
    parser.add_argument("--movie-id", default="550")
    args = parser.parse_args(argv)
    try:
        payload = run_smoke(origin=args.origin, movie_id=args.movie_id)
    except SmokeError as exc:
        print(f"[retired-today-route-smoke] error: {exc}", flush=True)
        return 1
    print(json.dumps(payload, indent=2, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
