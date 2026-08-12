"""Pages composition: site artifact + Data Release manifest (#388)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.pages_compose import (  # noqa: E402
    ComposeError,
    compose_pages_dist,
    read_deployed_artifact_id,
)
from cron.site_artifact import (  # noqa: E402
    SiteArtifactError,
    build_site_artifact_identity,
    pack_site_artifact,
    record_verified_artifact,
    unpack_site_artifact,
    verify_active_matches_deployed,
)

BUNDLE_SHA256 = "26dc51ddfa0e6c75f0dd5c280613e5dd306eadbc1f2309d963a0d95979fa4b16"
NOW = "2026-08-13T04:00:00.000Z"
MANIFEST = {
    "galaxy_data_gzip_url": "https://example.invalid/galaxy/galaxy_data.json.gz?v=2026.08.13.1",
    "galaxy_search_index_gzip_url": "https://example.invalid/galaxy/galaxy_search_index.json.gz?v=2026.08.13.1",
    "data_version": "2026.08.13.1",
}


def _write_shell(root: Path) -> Path:
    dist = root / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_bytes(b"hello")
    (dist / "assets" / "app.js").write_bytes(b"world")
    return dist


def test_compose_injects_candidate_manifest_without_changing_shell_identity(tmp_path: Path) -> None:
    dist = _write_shell(tmp_path)
    before = build_site_artifact_identity(dist, git_commit="f3cc2c7")
    composed = compose_pages_dist(
        dist_dir=dist,
        manifest=MANIFEST,
        artifact_id=before["artifact_id"],
        require_active_match=False,
    )
    after = build_site_artifact_identity(dist, git_commit="f3cc2c7")
    assert before["artifact_id"] == after["artifact_id"] == BUNDLE_SHA256
    written = json.loads((dist / "data" / "galaxy_assets_manifest.json").read_text(encoding="utf-8"))
    assert written["data_version"] == "2026.08.13.1"
    assert written["galaxy_data_gzip_url"].startswith("https://")
    sidecar = json.loads((dist / "data" / "site-artifact.json").read_text(encoding="utf-8"))
    assert sidecar["artifact_id"] == BUNDLE_SHA256
    assert composed["artifact_id"] == BUNDLE_SHA256
    assert composed["data_version"] == "2026.08.13.1"


def test_data_release_compose_fails_closed_on_active_deployed_mismatch(tmp_path: Path) -> None:
    dist = _write_shell(tmp_path)
    identity = build_site_artifact_identity(dist, git_commit="f3cc2c7")
    registry = record_verified_artifact(
        {},
        artifact={**identity, "excludes_production_manifest": True},
        verified_at=NOW,
    )
    with pytest.raises(SiteArtifactError, match="mismatch"):
        verify_active_matches_deployed(registry, deployed_artifact_id="site-other")
    with pytest.raises(ComposeError, match="mismatch"):
        compose_pages_dist(
            dist_dir=dist,
            manifest=MANIFEST,
            artifact_id=identity["artifact_id"],
            registry=registry,
            deployed_artifact_id="site-other",
        )
    composed = compose_pages_dist(
        dist_dir=dist,
        manifest=MANIFEST,
        artifact_id=identity["artifact_id"],
        registry=registry,
        deployed_artifact_id=identity["artifact_id"],
    )
    assert composed["artifact_id"] == identity["artifact_id"]
    assert composed["data_version"] == "2026.08.13.1"


def test_site_release_compose_preserves_live_data_version(tmp_path: Path) -> None:
    dist = _write_shell(tmp_path)
    identity = build_site_artifact_identity(dist, git_commit="f3cc2c7")
    composed = compose_pages_dist(
        dist_dir=dist,
        manifest=MANIFEST,
        artifact_id=identity["artifact_id"],
        require_active_match=False,
    )
    assert composed["data_version"] == "2026.08.13.1"
    assert (dist / "index.html").read_bytes() == b"hello"


def test_pack_round_trip_excludes_manifest_and_sidecar(tmp_path: Path) -> None:
    dist = _write_shell(tmp_path)
    compose_pages_dist(dist_dir=dist, manifest=MANIFEST, artifact_id=BUNDLE_SHA256, require_active_match=False)
    tar_path = tmp_path / "site.tar"
    pack_site_artifact(dist, tar_path)
    restored = tmp_path / "restored"
    unpack_site_artifact(tar_path, restored)
    assert (restored / "dist" / "index.html").read_bytes() == b"hello"
    assert not (restored / "dist" / "data" / "galaxy_assets_manifest.json").exists()
    assert not (restored / "dist" / "data" / "site-artifact.json").exists()
    assert build_site_artifact_identity(restored / "dist", git_commit="f3cc2c7")["artifact_id"] == BUNDLE_SHA256


def test_read_deployed_artifact_id_from_sidecar(tmp_path: Path) -> None:
    dist = _write_shell(tmp_path)
    compose_pages_dist(dist_dir=dist, manifest=MANIFEST, artifact_id=BUNDLE_SHA256, require_active_match=False)
    assert read_deployed_artifact_id(dist) == BUNDLE_SHA256
