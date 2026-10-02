"""Pinned embedding input and exact profile selection for Monthly publication."""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from publication.bundle import REQUIRED_FILES
from publication.errors import PublicationError


def unpack_verified_bundle(archive: Path, destination: Path, digest: str) -> None:
    if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise PublicationError("canonical embedding SHA-256 is required")
    hasher = hashlib.sha256()
    with archive.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            hasher.update(chunk)
    if hasher.hexdigest() != digest:
        raise PublicationError("canonical embedding bundle hash mismatch")
    with zipfile.ZipFile(archive) as bundle:
        if sorted(bundle.namelist()) != sorted(REQUIRED_FILES):
            raise PublicationError("canonical embedding archive must contain exactly the four root files")
        destination.mkdir(parents=True, exist_ok=True)
        for name in REQUIRED_FILES:
            with bundle.open(name) as source, (destination / name).open("wb") as target:
                shutil.copyfileobj(source, target)


def prepare_bundle(digest: str) -> None:
    from cron.site_artifact_store import create_r2_client
    object_name = os.environ.get("MONTHLY_EMBED_BUNDLE_OBJECT", "")
    if object_name != f"ops/monthly-embedding/{digest}.zip":
        raise PublicationError("canonical R2 bundle object must match the recorded digest")
    client, bucket = create_r2_client()
    archive = ROOT / "data/runs/monthly_refit_embedding_bundle.zip"
    archive.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="monthly-bundle-") as temp:
        downloaded = Path(temp) / "bundle.zip"
        client.download_file(bucket, object_name, str(downloaded))
        cache = Path(temp) / "cache"
        unpack_verified_bundle(downloaded, cache, digest)
        subprocess.run([sys.executable, str(ROOT / "scripts/tools/pack_monthly_embedding_bundle.py"),
                        "--cache-dir", str(cache), "--out", str(downloaded), "--validate-only", "--expected-sha256", digest], check=True)
        destination = ROOT / "data/output"
        destination.mkdir(parents=True, exist_ok=True)
        for name in REQUIRED_FILES:
            shutil.copyfile(cache / name, destination / name)
        shutil.copyfile(downloaded, archive)


def select_profile(directory: Path) -> Path:
    profiles = sorted(directory.glob("profile-*.json"))
    if len(profiles) != 1:
        raise PublicationError(f"Monthly requires exactly one generated profile, found {len(profiles)}")
    return profiles[0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prepare = sub.add_parser("prepare")
    prepare.add_argument("--sha256", required=True)
    publish = sub.add_parser("publish")
    publish.add_argument("--mode", choices=["monthly"], required=True)
    publish.add_argument("--profile-dir", type=Path, required=True)
    publish.add_argument("--actor", required=True)
    hold = sub.add_parser("hold")
    hold.add_argument("--actor", required=True)
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            prepare_bundle(args.sha256)
            return 0
        if args.command == "hold":
            from cron.publication_hold import apply_hold
            from cron.site_artifact_store import put_hold
            with tempfile.TemporaryDirectory(prefix="monthly-hold-") as temp:
                path = Path(temp) / "hold.json"
                apply_hold(path, held=True, reason="Monthly failed after production mutation; inspect receipt and recover before resuming cadence", actor=args.actor,
                           recorded_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
                put_hold(path)
            return 0
        profile = select_profile(args.profile_dir)
        return subprocess.call([sys.executable, str(ROOT / "scripts/cron/upload_galaxy_r2.py"),
                                "--mode", "monthly", "--profile", str(profile), "--actor", args.actor])
    except (PublicationError, OSError, zipfile.BadZipFile, subprocess.CalledProcessError) as exc:
        print(f"[monthly-assets] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
