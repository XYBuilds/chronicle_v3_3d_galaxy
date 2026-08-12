"""Production smoke for composed Pages promotion (#388 / #389)."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.production_smoke import (  # noqa: E402
    SmokeError,
    run_smoke,
)

ORIGIN = "https://themoviecosmos.com"
SPA = (200, {"content-type": "text/html; charset=utf-8"}, b"<html>spa</html>")
MANIFEST = {
    "galaxy_data_gzip_url": "https://example.invalid/galaxy/galaxy_data.json.gz?v=2026.08.13.1",
    "galaxy_search_index_gzip_url": "https://example.invalid/galaxy/galaxy_search_index.json.gz?v=2026.08.13.1",
    "data_version": "2026.08.13.1",
    "focus_emission_profile_url": "https://example.invalid/galaxy/profiles/active.json",
}


def _ok_responses(**overrides: tuple) -> dict[str, tuple]:
    responses: dict[str, tuple] = {
        f"{ORIGIN}/": (200, {"content-type": "text/html; charset=utf-8"}, b"<html>home</html>"),
        f"{ORIGIN}/movie/550": (200, {"content-type": "text/html; charset=utf-8"}, b"<html>movie</html>"),
        f"{ORIGIN}/this-path-does-not-exist-chronicle-smoke": SPA,
        f"{ORIGIN}/today": SPA,
        f"{ORIGIN}/share/today": SPA,
        f"{ORIGIN}/data/galaxy_assets_manifest.json": (
            200,
            {"content-type": "application/json"},
            json.dumps(MANIFEST).encode("utf-8"),
        ),
        MANIFEST["galaxy_data_gzip_url"]: (200, {"content-type": "application/gzip"}, b"gzip"),
        MANIFEST["galaxy_search_index_gzip_url"]: (200, {"content-type": "application/gzip"}, b"gzip"),
        MANIFEST["focus_emission_profile_url"]: (200, {"content-type": "application/json"}, b"{}"),
    }
    responses.update(overrides)
    return responses


def test_smoke_accepts_home_movie_invalid_and_manifest_resolution() -> None:
    responses = _ok_responses()
    with patch("cron.production_smoke._http_request", side_effect=lambda url, **_kwargs: responses[url]):
        result = run_smoke(origin=ORIGIN, expected_data_version="2026.08.13.1", movie_id="550")
    assert result["ok"] is True
    assert result["data_version"] == "2026.08.13.1"


def test_smoke_fails_closed_when_manifest_data_version_differs() -> None:
    responses = _ok_responses(
        **{
            f"{ORIGIN}/data/galaxy_assets_manifest.json": (
                200,
                {"content-type": "application/json"},
                json.dumps({**MANIFEST, "data_version": "other"}).encode("utf-8"),
            )
        }
    )
    with patch("cron.production_smoke._http_request", side_effect=lambda url, **_kwargs: responses[url]):
        with pytest.raises(SmokeError, match="data_version"):
            run_smoke(origin=ORIGIN, expected_data_version="2026.08.13.1", movie_id="550")


def test_smoke_fails_closed_when_today_does_not_match_ordinary_invalid_path() -> None:
    worker_404 = (404, {"content-type": "text/plain;charset=UTF-8"}, b"Not Found")
    responses = _ok_responses(**{f"{ORIGIN}/today": worker_404})
    with patch("cron.production_smoke._http_request", side_effect=lambda url, **_kwargs: responses[url]):
        with pytest.raises(SmokeError, match="/today"):
            run_smoke(origin=ORIGIN, expected_data_version="2026.08.13.1", movie_id="550")


def test_smoke_fails_closed_when_share_today_does_not_match_ordinary_invalid_path() -> None:
    worker_404 = (404, {"content-type": "text/plain;charset=UTF-8"}, b"Not Found")
    responses = _ok_responses(**{f"{ORIGIN}/share/today": worker_404})
    with patch("cron.production_smoke._http_request", side_effect=lambda url, **_kwargs: responses[url]):
        with pytest.raises(SmokeError, match="/share/today"):
            run_smoke(origin=ORIGIN, expected_data_version="2026.08.13.1", movie_id="550")
