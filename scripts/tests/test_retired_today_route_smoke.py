"""Dated C-002 retired Today route-equivalence smoke (#389)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.retired_today_route_smoke import (  # noqa: E402
    HttpSnapshot,
    SmokeError,
    run_smoke,
)

ORIGIN = "https://themoviecosmos.com"
SPA = HttpSnapshot(
    status=200,
    content_type="text/html; charset=utf-8",
    cache_control="public, max-age=0, must-revalidate",
    body=b"<html>spa</html>",
    body_sha256="spa",
)
OG_404 = HttpSnapshot(
    status=404,
    content_type="text/plain;charset=UTF-8",
    cache_control=None,
    body=b"Not Found",
    body_sha256="404",
)
HOME = HttpSnapshot(200, "text/html; charset=utf-8", None, b"<html>home</html>", "home")
MOVIE = HttpSnapshot(
    200,
    "text/html; charset=utf-8",
    None,
    b'<html><meta property="og:title" content="Fight Club"><meta property="og:image" content="https://themoviecosmos.com/og/movie/550.png?v=test"></html>',
    "movie",
)
MOVIE_PNG = HttpSnapshot(200, "image/png", "public, max-age=31536000, immutable", b"movie-png", "movie-png")
BRAND = HttpSnapshot(200, "image/png", "public, max-age=31536000, immutable", b"png", "brand")
BRAND_REDIRECT = HttpSnapshot(302, None, None, b"", "redirect")
METHOD_NOT_ALLOWED = HttpSnapshot(405, "text/plain;charset=UTF-8", None, b"Method Not Allowed", "405")


def _responses() -> dict[tuple[str, str], HttpSnapshot]:
    spa_paths = (
        "/unknown",
        "/unknown?lang=zh",
        "/today",
        "/today?lang=zh",
        "/share/today",
        "/share/today?lang=zh",
    )
    og_paths = ("/og/today.png", "/og/today.png?cache=bust", "/og/unknown.png", "/og/unknown.png?cache=bust")
    mapping: dict[tuple[str, str], HttpSnapshot] = {}
    for path in spa_paths:
        mapping[(f"{ORIGIN}{path}", "GET")] = SPA
        mapping[(f"{ORIGIN}{path}", "HEAD")] = SPA
    for path in og_paths:
        mapping[(f"{ORIGIN}{path}", "GET")] = OG_404
        mapping[(f"{ORIGIN}{path}", "HEAD")] = OG_404
    mapping[(f"{ORIGIN}/", "GET")] = HOME
    mapping[(f"{ORIGIN}/movie/550", "GET")] = MOVIE
    mapping[(f"{ORIGIN}/og/brand.png?v=og-brand-og-v1", "HEAD")] = BRAND
    mapping[(f"{ORIGIN}/og/brand.png?v=og-brand-og-v1", "POST")] = METHOD_NOT_ALLOWED
    mapping[(f"{ORIGIN}/og/brand.png", "GET")] = BRAND_REDIRECT
    mapping[(f"{ORIGIN}/og/movie/999999999.png?v=anything", "GET")] = BRAND
    mapping[(f"{ORIGIN}/og/movie/550.png?v=test", "GET")] = MOVIE_PNG
    return mapping


def test_smoke_matches_retired_today_with_ordinary_invalid_and_unknown_og() -> None:
    responses = _responses()

    def request_fn(url: str, *, method: str = "GET") -> HttpSnapshot:
        return responses[(url, method)]

    result = run_smoke(origin=ORIGIN, movie_id="550", request_fn=request_fn)
    assert result["ok"] is True
    assert result["comparisons"]
    assert all(row["result"] == "MATCH" for row in result["comparisons"])
    assert any(row["candidate"] == "/today" for row in result["comparisons"])
    assert any(row["candidate"] == "/share/today" for row in result["comparisons"])
    assert any(row["candidate"] == "/og/today.png" for row in result["comparisons"])


def test_smoke_fails_closed_when_today_is_still_a_special_worker_404() -> None:
    responses = _responses()
    responses[(f"{ORIGIN}/today", "GET")] = OG_404

    def request_fn(url: str, *, method: str = "GET") -> HttpSnapshot:
        return responses[(url, method)]

    with pytest.raises(SmokeError, match="/today"):
        run_smoke(origin=ORIGIN, movie_id="550", request_fn=request_fn)
