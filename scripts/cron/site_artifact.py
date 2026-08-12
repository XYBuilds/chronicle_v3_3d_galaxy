#!/usr/bin/env python3
"""Immutable site-artifact identity without a production manifest.

A Site Release builds and verifies a content-addressed bundle that excludes
``galaxy_assets_manifest.json``. The registry keeps the active artifact and the
immediately previous verified artifact. An active/deployed mismatch fails closed
so a later Data Release cannot silently downgrade the site.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import tarfile
from pathlib import Path
from typing import Any, Mapping, MutableMapping

MANIFEST_NAME = "galaxy_assets_manifest.json"
SITE_ARTIFACT_SIDECAR = "site-artifact.json"
_EXCLUDED_IDENTITY_NAMES = {MANIFEST_NAME, SITE_ARTIFACT_SIDECAR}
_SHA256_RE_LENGTH = 64


class SiteArtifactError(ValueError):
    """A site-artifact identity or registry invariant was violated."""


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise SiteArtifactError(message)


def _bundle_files(dist_dir: Path) -> list[tuple[str, bytes]]:
    _assert(dist_dir.is_dir(), f"site dist is missing: {dist_dir}")
    files: list[tuple[str, bytes]] = []
    for path in dist_dir.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(dist_dir).as_posix()
        if path.name in _EXCLUDED_IDENTITY_NAMES:
            continue
        files.append((relative, path.read_bytes()))
    _assert(bool(files), "site dist contains no hashable files")
    files.sort(key=lambda item: item[0])
    return files


def _function_files(functions_dir: Path) -> list[tuple[str, bytes]]:
    _assert(functions_dir.is_dir(), f"functions dir is missing: {functions_dir}")
    files: list[tuple[str, bytes]] = []
    for path in functions_dir.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(functions_dir).as_posix()
        files.append((f"functions/{relative}", path.read_bytes()))
    _assert(bool(files), "functions dir contains no files")
    files.sort(key=lambda item: item[0])
    return files


def build_site_artifact_identity(dist_dir: Path, *, git_commit: str, functions_dir: Path | None = None) -> dict[str, Any]:
    """Hash a verified site bundle while ignoring any production manifest copy."""
    _assert(isinstance(git_commit, str) and bool(git_commit.strip()), "git_commit is required")
    hasher = hashlib.sha256()
    files = _bundle_files(dist_dir)
    if functions_dir is not None:
        files = [*files, *_function_files(functions_dir)]
    for relative, body in files:
        hasher.update(relative.encode("utf-8"))
        hasher.update(b"\0")
        hasher.update(body)
        hasher.update(b"\0")
    digest = hasher.hexdigest()
    return {
        "artifact_id": digest,
        "bundle_sha256": digest,
        "git_commit": git_commit.strip(),
        "excludes_production_manifest": True,
    }


def _validate_artifact(artifact: Mapping[str, Any]) -> dict[str, Any]:
    _assert(isinstance(artifact, Mapping), "site artifact must be an object")
    artifact_id = artifact.get("artifact_id")
    bundle = artifact.get("bundle_sha256")
    commit = artifact.get("git_commit")
    _assert(isinstance(artifact_id, str) and bool(artifact_id.strip()), "artifact_id is required")
    _assert(isinstance(bundle, str) and len(bundle) == _SHA256_RE_LENGTH, "bundle_sha256 must be sha256")
    _assert(isinstance(commit, str) and bool(commit.strip()), "git_commit is required")
    _assert(artifact.get("excludes_production_manifest") is True, "site artifact must exclude the production manifest")
    return {
        "artifact_id": artifact_id.strip(),
        "bundle_sha256": bundle,
        "git_commit": commit.strip(),
        "excludes_production_manifest": True,
    }


def record_verified_artifact(
    registry: MutableMapping[str, Any],
    *,
    artifact: Mapping[str, Any],
    verified_at: str,
) -> dict[str, Any]:
    """Promote a verified artifact to active and keep only the immediate previous pointer."""
    _assert(isinstance(verified_at, str) and verified_at.endswith("Z"), "verified_at must be UTC")
    payload = _validate_artifact(artifact)
    artifacts = dict(registry.get("artifacts") or {})
    previous = registry.get("active")
    if previous is not None:
        _assert(isinstance(previous, str) and previous in artifacts, "active site artifact is unreadable")
    artifacts[payload["artifact_id"]] = {**payload, "verified_at": verified_at}
    registry["previous"] = previous
    registry["active"] = payload["artifact_id"]
    kept = {payload["artifact_id"]}
    if previous is not None:
        kept.add(previous)
    registry["artifacts"] = {key: artifacts[key] for key in kept if key in artifacts}
    return {
        "active": registry["active"],
        "previous": registry["previous"],
        "artifacts": dict(registry["artifacts"]),
    }


def verify_active_matches_deployed(registry: Mapping[str, Any], *, deployed_artifact_id: str) -> str:
    """Fail closed when the live site is not the recorded active artifact."""
    _assert(isinstance(registry, Mapping), "site artifact registry is unreadable")
    active = registry.get("active")
    artifacts = registry.get("artifacts")
    _assert(isinstance(active, str) and bool(active.strip()), "active site artifact is unreadable")
    _assert(isinstance(artifacts, Mapping) and active in artifacts, "active site artifact is unreadable")
    _assert(isinstance(deployed_artifact_id, str) and bool(deployed_artifact_id.strip()), "deployed artifact id is required")
    if deployed_artifact_id.strip() != active:
        raise SiteArtifactError(
            f"active-artifact/deployed-site mismatch: active={active!r} deployed={deployed_artifact_id.strip()!r}"
        )
    return active


def pack_site_artifact(dist_dir: Path, tar_path: Path, *, functions_dir: Path | None = None) -> Path:
    """Write a tarball with dist/ shell files and optional functions/."""
    files = [(f"dist/{relative}", body) for relative, body in _bundle_files(dist_dir)]
    if functions_dir is not None:
        files.extend(_function_files(functions_dir))
    _assert(bool(files), "site artifact tarball would be empty")
    tar_path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tar_path, "w") as archive:
        for relative, body in files:
            info = tarfile.TarInfo(name=relative)
            info.size = len(body)
            archive.addfile(info, fileobj=io.BytesIO(body))
    return tar_path


def unpack_site_artifact(tar_path: Path, dest_dir: Path) -> Path:
    """Extract a packed site artifact into dest_dir."""
    _assert(tar_path.is_file(), f"site artifact tarball is missing: {tar_path}")
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_resolved = dest_dir.resolve()
    with tarfile.open(tar_path, "r") as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue
            name = Path(member.name)
            _assert(not name.is_absolute() and ".." not in name.parts, f"unsafe site artifact member: {member.name}")
            target = (dest_dir / name).resolve()
            _assert(dest_resolved == target or dest_resolved in target.parents, f"unsafe site artifact member: {member.name}")
            extracted = archive.extractfile(member)
            _assert(extracted is not None, f"site artifact member is unreadable: {member.name}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(extracted.read())
    return dest_dir


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    identity = sub.add_parser("identity")
    identity.add_argument("--dist-dir", type=Path, required=True)
    identity.add_argument("--git-commit", required=True)
    identity.add_argument("--functions-dir", type=Path, default=None)
    verify = sub.add_parser("verify-active")
    verify.add_argument("--registry", type=Path, required=True)
    verify.add_argument("--deployed-artifact-id", required=True)
    pack = sub.add_parser("pack")
    pack.add_argument("--dist-dir", type=Path, required=True)
    pack.add_argument("--output", type=Path, required=True)
    pack.add_argument("--functions-dir", type=Path, default=None)
    unpack = sub.add_parser("unpack")
    unpack.add_argument("--tar", type=Path, required=True)
    unpack.add_argument("--output-dir", type=Path, required=True)
    record = sub.add_parser("record")
    record.add_argument("--registry", type=Path, required=True)
    record.add_argument("--identity", type=Path, required=True)
    record.add_argument("--verified-at", required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "identity":
            payload = build_site_artifact_identity(
                args.dist_dir, git_commit=args.git_commit, functions_dir=args.functions_dir
            )
        elif args.command == "pack":
            pack_site_artifact(args.dist_dir, args.output, functions_dir=args.functions_dir)
            payload = {"tar": str(args.output)}
        elif args.command == "unpack":
            unpack_site_artifact(args.tar, args.output_dir)
            payload = {"output_dir": str(args.output_dir)}
        elif args.command == "record":
            registry_path = args.registry
            registry = json.loads(registry_path.read_text(encoding="utf-8")) if registry_path.is_file() else {}
            identity_payload = json.loads(args.identity.read_text(encoding="utf-8"))
            payload = record_verified_artifact(registry, artifact=identity_payload, verified_at=args.verified_at)
            registry_path.parent.mkdir(parents=True, exist_ok=True)
            registry_path.write_text(json.dumps(registry, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        else:
            registry = json.loads(args.registry.read_text(encoding="utf-8"))
            payload = {"active": verify_active_matches_deployed(registry, deployed_artifact_id=args.deployed_artifact_id)}
    except (SiteArtifactError, OSError, json.JSONDecodeError) as exc:
        print(f"[site-artifact] error: {exc}", flush=True)
        return 1
    print(json.dumps(payload, indent=2, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
