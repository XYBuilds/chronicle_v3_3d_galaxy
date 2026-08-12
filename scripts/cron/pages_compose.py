#!/usr/bin/env python3
"""Compose a Cloudflare Pages dist from a site artifact and a Data Release manifest.

A Data Release obtains the active verified site artifact, injects the candidate
manifest, and fails closed when the live site is not that active artifact.
A Site Release injects the current production Data Release without requiring
the new shell to already be marked active.
"""
from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Mapping

try:
    from cron.site_artifact import (
        MANIFEST_NAME,
        SITE_ARTIFACT_SIDECAR,
        SiteArtifactError,
        verify_active_matches_deployed,
    )
except ModuleNotFoundError:  # pragma: no cover - direct workflow execution
    from site_artifact import (  # type: ignore[no-redef]
        MANIFEST_NAME,
        SITE_ARTIFACT_SIDECAR,
        SiteArtifactError,
        verify_active_matches_deployed,
    )


class ComposeError(ValueError):
    """Pages composition violated a Data/Site Release invariant."""


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise ComposeError(message)


def _validate_manifest(manifest: Mapping[str, Any]) -> dict[str, Any]:
    _assert(isinstance(manifest, Mapping), "manifest must be an object")
    for key in ("galaxy_data_gzip_url", "galaxy_search_index_gzip_url", "data_version"):
        value = manifest.get(key)
        _assert(isinstance(value, str) and bool(value.strip()), f"manifest {key} is required")
    payload = dict(manifest)
    payload["data_version"] = str(manifest["data_version"]).strip()
    return payload


def read_deployed_artifact_id(dist_dir: Path) -> str:
    """Read the composed sidecar that names the deployed site artifact."""
    sidecar_path = dist_dir / "data" / SITE_ARTIFACT_SIDECAR
    _assert(sidecar_path.is_file(), f"deployed site-artifact sidecar is missing: {sidecar_path}")
    try:
        payload = json.loads(sidecar_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ComposeError(f"deployed site-artifact sidecar is unreadable: {exc}") from exc
    artifact_id = payload.get("artifact_id") if isinstance(payload, Mapping) else None
    _assert(isinstance(artifact_id, str) and bool(artifact_id.strip()), "deployed artifact id is required")
    return artifact_id.strip()


def compose_pages_dist(
    *,
    dist_dir: Path,
    manifest: Mapping[str, Any],
    artifact_id: str,
    registry: Mapping[str, Any] | None = None,
    deployed_artifact_id: str | None = None,
    require_active_match: bool = True,
) -> dict[str, Any]:
    """Inject the candidate/live manifest and sidecar into an unpacked site artifact."""
    _assert(dist_dir.is_dir(), f"site dist is missing: {dist_dir}")
    _assert(isinstance(artifact_id, str) and bool(artifact_id.strip()), "artifact_id is required")
    artifact_id = artifact_id.strip()
    payload = _validate_manifest(manifest)
    if require_active_match:
        _assert(registry is not None, "site artifact registry is required")
        _assert(isinstance(deployed_artifact_id, str) and bool(deployed_artifact_id.strip()), "deployed artifact id is required")
        try:
            verify_active_matches_deployed(registry, deployed_artifact_id=deployed_artifact_id.strip())
        except SiteArtifactError as exc:
            raise ComposeError(str(exc)) from exc
        active = registry.get("active")
        _assert(active == artifact_id, f"compose artifact {artifact_id!r} is not the active site artifact {active!r}")
    data_dir = dist_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / MANIFEST_NAME).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (data_dir / SITE_ARTIFACT_SIDECAR).write_text(
        json.dumps({"artifact_id": artifact_id, "excludes_production_manifest": True}, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return {
        "artifact_id": artifact_id,
        "data_version": payload["data_version"],
        "manifest_path": str(data_dir / MANIFEST_NAME),
        "sidecar_path": str(data_dir / SITE_ARTIFACT_SIDECAR),
    }


def fetch_origin_json(url: str) -> dict[str, Any]:
    """Download a JSON document from the live origin. Missing/invalid documents fail closed."""
    _assert(isinstance(url, str) and url.startswith("http"), "origin URL is required")
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        raise ComposeError(f"origin document returned {exc.code}: {url}") from exc
    except urllib.error.URLError as exc:
        raise ComposeError(f"origin document is unreadable: {url} ({exc})") from exc
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ComposeError(f"origin document is unreadable: {url}") from exc
    _assert(isinstance(payload, dict), f"origin document is unreadable: {url}")
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    compose = sub.add_parser("compose")
    compose.add_argument("--dist-dir", type=Path, required=True)
    compose.add_argument("--manifest", type=Path, required=True)
    compose.add_argument("--artifact-id", required=True)
    compose.add_argument("--registry", type=Path, default=None)
    compose.add_argument("--deployed-artifact-id", default="")
    compose.add_argument("--skip-active-match", action="store_true")
    fetch = sub.add_parser("fetch-origin")
    fetch.add_argument("--url", required=True)
    fetch.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "fetch-origin":
            payload = fetch_origin_json(args.url)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        else:
            manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
            registry = json.loads(args.registry.read_text(encoding="utf-8")) if args.registry is not None else None
            payload = compose_pages_dist(
                dist_dir=args.dist_dir,
                manifest=manifest,
                artifact_id=args.artifact_id,
                registry=registry,
                deployed_artifact_id=args.deployed_artifact_id or None,
                require_active_match=not args.skip_active_match,
            )
    except (ComposeError, SiteArtifactError, OSError, json.JSONDecodeError) as exc:
        print(f"[pages-compose] error: {exc}", flush=True)
        return 1
    print(json.dumps(payload, indent=2, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
