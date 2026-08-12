"""Production smoke for composed Pages promotion (#388)."""
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
MANIFEST = {
    "galaxy_data_gzip_url": "https://example.invalid/galaxy/galaxy_data.json.gz?v=2026.08.13.1",
    "galaxy_search_index_gzip_url": "https://example.invalid/galaxy/galaxy_search_index.json.gz?v=2026.08.13.1",
    "data_version": "2026.08.13.1",
    "focus_emission_profile_url": "https://example.invalid/galaxy/profiles/active.json",
}


def test_smoke_accepts_home_movie_invalid_and_manifest_resolution() -> None:
    responses = {
        f"{ORIGIN}/": (200, "<html>home</html>"),
        f"{ORIGIN}/movie/550": (200, "<html>movie</html>"),
        f"{ORIGIN}/this-path-does-not-exist-chronicle-smoke": (404, "not found"),
        f"{ORIGIN}/today": (404, "not found"),
        f"{ORIGIN}/data/galaxy_assets_manifest.json": (200, json.dumps(MANIFEST)),
        MANIFEST["galaxy_data_gzip_url"]: (200, b"gzip"),
        MANIFEST["galaxy_search_index_gzip_url"]: (200, b"gzip"),
        MANIFEST["focus_emission_profile_url"]: (200, "{}"),
    }
    with patch("cron.production_smoke._http_get", side_effect=lambda url: responses[url]):
        result = run_smoke(origin=ORIGIN, expected_data_version="2026.08.13.1", movie_id="550")
    assert result["ok"] is True
    assert result["data_version"] == "2026.08.13.1"


def test_smoke_fails_closed_when_manifest_data_version_differs() -> None:
    responses = {
        f"{ORIGIN}/": (200, "<html>home</html>"),
        f"{ORIGIN}/movie/550": (200, "<html>movie</html>"),
        f"{ORIGIN}/this-path-does-not-exist-chronicle-smoke": (404, "not found"),
        f"{ORIGIN}/today": (404, "not found"),
        f"{ORIGIN}/data/galaxy_assets_manifest.json": (200, json.dumps({**MANIFEST, "data_version": "other"})),
    }
    with patch("cron.production_smoke._http_get", side_effect=lambda url: responses[url]):
        with pytest.raises(SmokeError, match="data_version"):
            run_smoke(origin=ORIGIN, expected_data_version="2026.08.13.1", movie_id="550")


def test_smoke_fails_closed_when_invalid_path_is_not_404() -> None:
    responses = {
        f"{ORIGIN}/": (200, "<html>home</html>"),
        f"{ORIGIN}/movie/550": (200, "<html>movie</html>"),
        f"{ORIGIN}/this-path-does-not-exist-chronicle-smoke": (200, "<html>spa fallback</html>"),
        f"{ORIGIN}/today": (404, "not found"),
        f"{ORIGIN}/data/galaxy_assets_manifest.json": (200, json.dumps(MANIFEST)),
    }
    with patch("cron.production_smoke._http_get", side_effect=lambda url: responses[url]):
        with pytest.raises(SmokeError, match="invalid path"):
            run_smoke(origin=ORIGIN, expected_data_version="2026.08.13.1", movie_id="550")
