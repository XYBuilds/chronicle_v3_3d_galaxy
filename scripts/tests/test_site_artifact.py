"""Immutable site-artifact identity and active/deployed mismatch (#387)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.site_artifact import (  # noqa: E402
    SiteArtifactError,
    build_site_artifact_identity,
    record_verified_artifact,
    verify_active_matches_deployed,
)

# Independent fixture hash for index.html=hello and assets/app.js=world.
BUNDLE_SHA256 = "26dc51ddfa0e6c75f0dd5c280613e5dd306eadbc1f2309d963a0d95979fa4b16"
NOW = "2026-08-13T04:00:00.000Z"


def _write_bundle(root: Path, *, include_manifest: bool = False) -> Path:
    dist = root / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_bytes(b"hello")
    (dist / "assets" / "app.js").write_bytes(b"world")
    if include_manifest:
        (dist / "data").mkdir()
        (dist / "data" / "galaxy_assets_manifest.json").write_text(
            json.dumps({"data_version": "must-not-affect-identity"}),
            encoding="utf-8",
        )
    return dist


def test_site_artifact_identity_ignores_production_manifest() -> None:
    from tempfile import TemporaryDirectory

    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        without_manifest = build_site_artifact_identity(_write_bundle(root / "a"), git_commit="e9a2608")
        with_manifest = build_site_artifact_identity(
            _write_bundle(root / "b", include_manifest=True),
            git_commit="e9a2608",
        )
    assert without_manifest["bundle_sha256"] == BUNDLE_SHA256
    assert with_manifest["bundle_sha256"] == BUNDLE_SHA256
    assert without_manifest["artifact_id"] == with_manifest["artifact_id"]
    assert without_manifest["excludes_production_manifest"] is True
    assert without_manifest["git_commit"] == "e9a2608"


def test_verified_registry_keeps_active_and_immediately_previous() -> None:
    registry: dict[str, object] = {}
    first = record_verified_artifact(
        registry,
        artifact={"artifact_id": "site-aaaa", "bundle_sha256": "a" * 64, "git_commit": "1111111", "excludes_production_manifest": True},
        verified_at=NOW,
    )
    assert first["active"] == "site-aaaa"
    assert first["previous"] is None
    second = record_verified_artifact(
        registry,
        artifact={"artifact_id": "site-bbbb", "bundle_sha256": "b" * 64, "git_commit": "2222222", "excludes_production_manifest": True},
        verified_at=NOW,
    )
    assert second["active"] == "site-bbbb"
    assert second["previous"] == "site-aaaa"
    third = record_verified_artifact(
        registry,
        artifact={"artifact_id": "site-cccc", "bundle_sha256": "c" * 64, "git_commit": "3333333", "excludes_production_manifest": True},
        verified_at=NOW,
    )
    assert third["active"] == "site-cccc"
    assert third["previous"] == "site-bbbb"
    assert set(third["artifacts"]) == {"site-bbbb", "site-cccc"}


def test_active_artifact_mismatch_with_deployed_site_fails_closed() -> None:
    registry = record_verified_artifact(
        {},
        artifact={"artifact_id": "site-aaaa", "bundle_sha256": BUNDLE_SHA256, "git_commit": "e9a2608", "excludes_production_manifest": True},
        verified_at=NOW,
    )
    with pytest.raises(SiteArtifactError, match="mismatch"):
        verify_active_matches_deployed(registry, deployed_artifact_id="site-other")


def test_matching_deployed_site_passes() -> None:
    registry = record_verified_artifact(
        {},
        artifact={"artifact_id": "site-aaaa", "bundle_sha256": BUNDLE_SHA256, "git_commit": "e9a2608", "excludes_production_manifest": True},
        verified_at=NOW,
    )
    assert verify_active_matches_deployed(registry, deployed_artifact_id="site-aaaa") == "site-aaaa"


def test_unreadable_active_registry_fails_closed() -> None:
    with pytest.raises(SiteArtifactError, match="unreadable|active"):
        verify_active_matches_deployed({"artifacts": {}}, deployed_artifact_id="site-aaaa")


def test_site_artifact_cli_identity_matches_the_known_bundle_hash(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from cron.site_artifact import main as site_main

    dist = _write_bundle(tmp_path)
    code = site_main(["identity", "--dist-dir", str(dist), "--git-commit", "e9a2608"])
    assert code == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["bundle_sha256"] == BUNDLE_SHA256
    assert payload["excludes_production_manifest"] is True
