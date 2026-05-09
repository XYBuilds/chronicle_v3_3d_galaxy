#!/usr/bin/env python3
"""P18.6b + P23.1: Upload ``galaxy_data.json.gz`` / ``galaxy_search_index.json.gz`` / ``today.json`` to Cloudflare R2 (S3 API).

Writes a small ``frontend/public/data/galaxy_assets_manifest.json`` with absolute public URLs so the
Pages bundle stays under the 25 MiB per-file limit while the app loads data from R2.

Required env (all or none — otherwise skip with exit 0):
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL

Optional:
  R2_KEY_PREFIX   — object key prefix, default ``galaxy``
  R2_GALAXY_PRUNE_AFTER_UPLOAD — if ``1``, remove large JSON/gzip from ``frontend/public/data/`` after upload
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_PUBLIC_DATA = _REPO_ROOT / "frontend" / "public" / "data"


def _required_env() -> dict[str, str] | None:
    keys = (
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
        "R2_PUBLIC_BASE_URL",
    )
    out: dict[str, str] = {}
    for k in keys:
        v = os.environ.get(k, "").strip()
        if not v:
            return None
        out[k] = v
    return out


def _public_base_url(base: str) -> str:
    b = base.rstrip("/")
    return b


def _object_urls(*, public_base: str, prefix: str, version_q: str) -> tuple[str, str]:
    p = prefix.strip().strip("/")
    base_path = f"{public_base}/{p}" if p else public_base
    gal = f"{base_path}/galaxy_data.json.gz?v={version_q}"
    idx = f"{base_path}/galaxy_search_index.json.gz?v={version_q}"
    return gal, idx


def _today_url(*, public_base: str, prefix: str, date_q: str) -> str:
    p = prefix.strip().strip("/")
    base_path = f"{public_base}/{p}" if p else public_base
    return f"{base_path}/today.json?v={date_q}"


def _og_today_url(*, public_base: str, prefix: str, date_q: str) -> str:
    p = prefix.strip().strip("/")
    base_path = f"{public_base}/{p}" if p else public_base
    return f"{base_path}/og-today.png?v={date_q}"


# Versioned object keys (same path overwritten only when data_version changes in practice;
# clients bust via manifest + ?v= on URLs). Long cache at R2/CDN edge + browser.
R2_VERSIONED_GZIP_CACHE_CONTROL = "public, max-age=31536000, immutable"
R2_TODAY_JSON_CACHE_CONTROL = "public, max-age=3600, must-revalidate"
# P23.5 OG card: short TTL so social-media re-fetch picks up the new picture once per day.
R2_OG_TODAY_PNG_CACHE_CONTROL = "public, max-age=300, must-revalidate"


def _upload_one(
    client: Any,
    bucket: str,
    key: str,
    path: Path,
    content_type: str,
    *,
    cache_control: str,
) -> None:
    assert path.is_file(), f"missing file to upload: {path}"
    size = path.stat().st_size
    print(
        f"[R2] upload key={key!r} bytes={size} content_type={content_type} "
        f"cache_control={cache_control!r}",
        flush=True,
    )
    client.upload_file(
        str(path),
        bucket,
        key,
        ExtraArgs={
            "ContentType": content_type,
            "CacheControl": cache_control,
        },
    )


def _maybe_prune(public_data: Path, *, manifest_path: Path) -> None:
    # NOTE: ``og-today.png`` is intentionally **kept** in the Pages bundle so the static
    # ``og:image`` meta in ``frontend/index.html`` resolves directly from the Pages origin.
    to_remove = [
        public_data / "galaxy_data.json",
        public_data / "galaxy_data.json.gz",
        public_data / "galaxy_search_index.json.gz",
    ]
    for p in to_remove:
        if p.is_file():
            print(f"[R2] prune {p.relative_to(_REPO_ROOT)}", flush=True)
            p.unlink()
    assert manifest_path.is_file(), "manifest must remain after prune"
    print("[R2] prune done; manifest kept for Pages bundle", flush=True)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--public-data-dir",
        type=Path,
        default=_DEFAULT_PUBLIC_DATA,
        help="Directory with galaxy export files (default: frontend/public/data)",
    )
    args = p.parse_args(argv)

    public_data: Path = args.public_data_dir.resolve()
    gal_json = public_data / "galaxy_data.json"
    gal_gz = public_data / "galaxy_data.json.gz"
    idx_gz = public_data / "galaxy_search_index.json.gz"
    today_json = public_data / "today.json"
    og_today_png = public_data / "og-today.png"
    manifest_path = public_data / "galaxy_assets_manifest.json"

    env = _required_env()
    if env is None:
        print(
            "[R2] skip: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, "
            "R2_BUCKET, R2_PUBLIC_BASE_URL to enable upload",
            flush=True,
        )
        return 0

    if not gal_gz.is_file():
        print(f"[R2] error: missing {gal_gz}", flush=True)
        return 1
    if not idx_gz.is_file():
        print(f"[R2] error: missing {idx_gz}", flush=True)
        return 1

    gz_size = gal_gz.stat().st_size
    idx_size = idx_gz.stat().st_size
    assert gz_size > 0, "galaxy_data.json.gz must be non-empty"
    assert idx_size > 0, "galaxy_search_index.json.gz must be non-empty"

    version = "unknown"
    if gal_json.is_file():
        raw = json.loads(gal_json.read_text(encoding="utf-8"))
        meta = raw.get("meta") if isinstance(raw, dict) else None
        if isinstance(meta, dict) and isinstance(meta.get("version"), str):
            version = meta["version"]
    version_q = quote(version, safe="")

    prefix = os.environ.get("R2_KEY_PREFIX", "galaxy").strip().strip("/")
    account_id = env["R2_ACCOUNT_ID"]
    bucket = env["R2_BUCKET"]
    public_base = _public_base_url(env["R2_PUBLIC_BASE_URL"])

    gal_key = f"{prefix}/galaxy_data.json.gz" if prefix else "galaxy_data.json.gz"
    idx_key = f"{prefix}/galaxy_search_index.json.gz" if prefix else "galaxy_search_index.json.gz"

    print(
        f"[R2] shapes: gal_gz_bytes={gz_size} idx_gz_bytes={idx_size} "
        f"version={version!r}",
        flush=True,
    )

    try:
        import boto3  # noqa: WPS433
    except ImportError:
        print("[R2] error: boto3 not installed (add to requirements.cpu.txt)", flush=True)
        return 1

    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )

    _upload_one(
        client,
        bucket,
        gal_key,
        gal_gz,
        "application/gzip",
        cache_control=R2_VERSIONED_GZIP_CACHE_CONTROL,
    )
    _upload_one(
        client,
        bucket,
        idx_key,
        idx_gz,
        "application/gzip",
        cache_control=R2_VERSIONED_GZIP_CACHE_CONTROL,
    )

    today_key = f"{prefix}/today.json" if prefix else "today.json"
    og_today_key = f"{prefix}/og-today.png" if prefix else "og-today.png"
    today_date_q = quote(datetime.now(timezone.utc).date().isoformat(), safe="")
    if today_json.is_file():
        try:
            td_raw = json.loads(today_json.read_text(encoding="utf-8"))
            if isinstance(td_raw, dict) and isinstance(td_raw.get("date"), str) and td_raw["date"].strip():
                today_date_q = quote(td_raw["date"].strip(), safe="")
        except Exception as err:  # noqa: BLE001
            print(f"[R2] today.json parse warning, using UTC date for ?v=: {err}", flush=True)
        _upload_one(
            client,
            bucket,
            today_key,
            today_json,
            "application/json",
            cache_control=R2_TODAY_JSON_CACHE_CONTROL,
        )
    else:
        print(f"[R2] skip today.json: file not found at {today_json}", flush=True)

    if og_today_png.is_file():
        _upload_one(
            client,
            bucket,
            og_today_key,
            og_today_png,
            "image/png",
            cache_control=R2_OG_TODAY_PNG_CACHE_CONTROL,
        )
    else:
        print(f"[R2] skip og-today.png: file not found at {og_today_png}", flush=True)

    gal_url, idx_url = _object_urls(public_base=public_base, prefix=prefix, version_q=version_q)
    exported_at = datetime.now(timezone.utc).isoformat()
    r2_object_keys: dict[str, str] = {"galaxy_data": gal_key, "galaxy_search_index": idx_key}
    manifest: dict[str, Any] = {
        "galaxy_data_gzip_url": gal_url,
        "galaxy_search_index_gzip_url": idx_url,
        "data_version": version,
        "exported_at": exported_at,
        "r2_object_keys": r2_object_keys,
    }
    if today_json.is_file():
        manifest["today_url"] = _today_url(public_base=public_base, prefix=prefix, date_q=today_date_q)
        r2_object_keys["today"] = today_key
    if og_today_png.is_file():
        manifest["og_today_url"] = _og_today_url(public_base=public_base, prefix=prefix, date_q=today_date_q)
        r2_object_keys["og_today"] = og_today_key
    rid = os.environ.get("GITHUB_RUN_ID", "").strip()
    if rid:
        manifest["github_run_id"] = rid

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"[R2] wrote {manifest_path.relative_to(_REPO_ROOT)}", flush=True)

    if os.environ.get("R2_GALAXY_PRUNE_AFTER_UPLOAD", "").strip() == "1":
        _maybe_prune(public_data, manifest_path=manifest_path)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
