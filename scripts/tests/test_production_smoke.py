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
    MANIFEST_MAX_ATTEMPTS,
    MANIFEST_RETRY_DELAY_SECONDS,
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
    with patch("cron.production_smoke._http_request", side_effect=lambda url, **_kwargs: responses[url]) as request, patch("time.sleep") as sleep:
        with pytest.raises(SmokeError, match=f"after {MANIFEST_MAX_ATTEMPTS} attempts"):
            run_smoke(origin=ORIGIN, expected_data_version="2026.08.13.1", movie_id="550")
    manifest_reads = [call for call in request.call_args_list if call.args[0].endswith("galaxy_assets_manifest.json")]
    assert len(manifest_reads) == MANIFEST_MAX_ATTEMPTS
    assert sleep.call_count == MANIFEST_MAX_ATTEMPTS - 1
    assert all(call.args == (MANIFEST_RETRY_DELAY_SECONDS,) for call in sleep.call_args_list)


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


def test_smoke_waits_for_production_alias_to_serve_new_manifest() -> None:
    responses = _ok_responses()
    manifest_url = f"{ORIGIN}/data/galaxy_assets_manifest.json"
    old = (200, {}, json.dumps({**MANIFEST, "data_version": "previous"}).encode())
    manifests = iter([old, old, responses[manifest_url]])

    def request(url: str, **_kwargs: object) -> tuple:
        return next(manifests) if url == manifest_url else responses[url]

    with patch("cron.production_smoke._http_request", side_effect=request), patch("time.sleep") as sleep:
        result = run_smoke(origin=ORIGIN, expected_data_version=MANIFEST["data_version"], movie_id="550")
    assert result["ok"] is True
    assert sleep.call_count == 2


@pytest.mark.parametrize("status,body", [(503, b"unavailable"), (200, b"not-json"), (200, b"[]"), (200, b"{}"), (200, b'{"data_version": 150}')])
def test_smoke_does_not_retry_broken_manifest(status: int, body: bytes) -> None:
    url = f"{ORIGIN}/data/galaxy_assets_manifest.json"
    responses = _ok_responses(**{url: (status, {}, body)})
    with patch("cron.production_smoke._http_request", side_effect=lambda url, **_kwargs: responses[url]), patch("time.sleep") as sleep:
        with pytest.raises(SmokeError):
            run_smoke(origin=ORIGIN, expected_data_version=MANIFEST["data_version"], movie_id="550")
    sleep.assert_not_called()


def test_manifest_convergence_does_not_skip_immutable_asset_checks() -> None:
    url = f"{ORIGIN}/data/galaxy_assets_manifest.json"
    responses = _ok_responses(**{MANIFEST["galaxy_data_gzip_url"]: (404, {}, b"missing")})
    manifests = iter([(200, {}, json.dumps({**MANIFEST, "data_version": "previous"}).encode()), responses[url]])
    with patch("cron.production_smoke._http_request", side_effect=lambda requested, **_kwargs: next(manifests) if requested == url else responses[requested]), patch("time.sleep") as sleep:
        with pytest.raises(SmokeError, match="galaxy_data_gzip_url returned 404"):
            run_smoke(origin=ORIGIN, expected_data_version=MANIFEST["data_version"], movie_id="550")
    sleep.assert_called_once_with(MANIFEST_RETRY_DELAY_SECONDS)
