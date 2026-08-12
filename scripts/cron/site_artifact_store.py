#!/usr/bin/env python3
"""R2 persistence for site-artifact tarballs and the active/previous registry."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Mapping

try:
    from cron.site_artifact import unpack_site_artifact
except ModuleNotFoundError:  # pragma: no cover - direct workflow execution
    from site_artifact import unpack_site_artifact  # type: ignore[no-redef]

REGISTRY_KEY = "ops/site-artifacts/registry.json"
HOLD_KEY = "ops/publication-hold.json"


class StoreError(ValueError):
    """Site-artifact R2 state is missing or unreadable."""


def create_r2_client() -> tuple[Any, str]:
    """Create an R2 S3 client without importing the galaxy upload stack."""
    keys = ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")
    env: dict[str, str] = {}
    for key in keys:
        value = os.environ.get(key, "").strip()
        if not value:
            raise StoreError("site artifact store requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET")
        env[key] = value
    try:
        import boto3  # noqa: WPS433
    except ImportError as exc:
        raise StoreError("site artifact store requires boto3") from exc
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    return client, env["R2_BUCKET"]


def artifact_key(artifact_id: str) -> str:
    if not isinstance(artifact_id, str) or not artifact_id.strip():
        raise StoreError("artifact_id is required")
    return f"ops/site-artifacts/{artifact_id.strip()}.tar"


def _is_not_found(error: BaseException) -> bool:
    response = getattr(error, "response", None)
    if not isinstance(response, Mapping):
        return False
    metadata = response.get("ResponseMetadata")
    status = metadata.get("HTTPStatusCode") if isinstance(metadata, Mapping) else None
    error_info = response.get("Error")
    code = error_info.get("Code") if isinstance(error_info, Mapping) else None
    return status == 404 or code in {"404", "NoSuchKey", "NotFound"}


def download_bytes(client: Any, *, bucket: str, key: str) -> bytes:
    try:
        response = client.get_object(Bucket=bucket, Key=key)
    except Exception as exc:
        if _is_not_found(exc):
            raise StoreError(f"site artifact object is missing: {key}") from exc
        raise StoreError(f"site artifact object is unreadable: {key}") from exc
    body = response.get("Body")
    reader = getattr(body, "read", None)
    if not callable(reader):
        raise StoreError(f"site artifact object is unreadable: {key}")
    payload = reader()
    if not isinstance(payload, (bytes, bytearray)):
        raise StoreError(f"site artifact object is unreadable: {key}")
    return bytes(payload)


def upload_bytes(client: Any, *, bucket: str, key: str, body: bytes, content_type: str = "application/octet-stream") -> None:
    if not isinstance(body, (bytes, bytearray)):
        raise StoreError("upload body must be bytes")
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=bytes(body),
        ContentType=content_type,
        CacheControl="no-store",
    )


def load_registry(client: Any, *, bucket: str, allow_missing: bool = False) -> dict[str, Any]:
    try:
        payload = json.loads(download_bytes(client, bucket=bucket, key=REGISTRY_KEY).decode("utf-8"))
    except StoreError as exc:
        if allow_missing and "missing" in str(exc):
            return {}
        raise StoreError("site artifact registry is unreadable or missing") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise StoreError("site artifact registry is unreadable") from exc
    if not isinstance(payload, dict):
        raise StoreError("site artifact registry is unreadable")
    return payload


def fetch_registry(*, registry_out: Path, allow_missing: bool = True) -> dict[str, Any]:
    client, bucket = create_r2_client()
    registry = load_registry(client, bucket=bucket, allow_missing=allow_missing)
    registry_out.parent.mkdir(parents=True, exist_ok=True)
    registry_out.write_text(json.dumps(registry, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {"registry": str(registry_out), "active": registry.get("active")}


def fetch_active(*, output_dir: Path, registry_out: Path, allow_missing: bool = False) -> dict[str, Any]:
    client, bucket = create_r2_client()
    registry = load_registry(client, bucket=bucket, allow_missing=allow_missing)
    active = registry.get("active")
    if not isinstance(active, str) or not active.strip():
        raise StoreError("active site artifact is missing; run Site Release first")
    tar_bytes = download_bytes(client, bucket=bucket, key=artifact_key(active))
    tar_path = output_dir.parent / f"{active}.tar"
    tar_path.write_bytes(tar_bytes)
    unpack_site_artifact(tar_path, output_dir)
    registry_out.parent.mkdir(parents=True, exist_ok=True)
    registry_out.write_text(json.dumps(registry, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {"active": active, "output_dir": str(output_dir), "registry": str(registry_out)}


def put_active(*, tar_path: Path, registry_path: Path) -> dict[str, Any]:
    client, bucket = create_r2_client()
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    active = registry.get("active")
    if not isinstance(active, str) or not active.strip():
        raise StoreError("active site artifact is missing")
    upload_bytes(client, bucket=bucket, key=artifact_key(active), body=tar_path.read_bytes())
    upload_bytes(
        client,
        bucket=bucket,
        key=REGISTRY_KEY,
        body=registry_path.read_bytes(),
        content_type="application/json",
    )
    return {"active": active, "registry_key": REGISTRY_KEY, "artifact_key": artifact_key(active)}


def fetch_hold(path: Path) -> dict[str, Any]:
    client, bucket = create_r2_client()
    try:
        path.write_bytes(download_bytes(client, bucket=bucket, key=HOLD_KEY))
        return {"key": HOLD_KEY, "path": str(path), "missing": False}
    except StoreError as exc:
        if "missing" in str(exc):
            path.unlink(missing_ok=True)
            return {"key": HOLD_KEY, "path": str(path), "missing": True}
        raise


def put_hold(path: Path) -> dict[str, Any]:
    client, bucket = create_r2_client()
    upload_bytes(client, bucket=bucket, key=HOLD_KEY, body=path.read_bytes(), content_type="application/json")
    return {"key": HOLD_KEY, "path": str(path)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    fetch_reg = sub.add_parser("fetch-registry")
    fetch_reg.add_argument("--registry-out", type=Path, required=True)
    fetch_reg.add_argument("--allow-missing", action="store_true")
    fetch = sub.add_parser("fetch-active")
    fetch.add_argument("--output-dir", type=Path, required=True)
    fetch.add_argument("--registry-out", type=Path, required=True)
    fetch.add_argument("--allow-missing", action="store_true")
    put = sub.add_parser("put-active")
    put.add_argument("--tar", type=Path, required=True)
    put.add_argument("--registry", type=Path, required=True)
    hold_get = sub.add_parser("fetch-hold")
    hold_get.add_argument("--path", type=Path, required=True)
    hold_put = sub.add_parser("put-hold")
    hold_put.add_argument("--path", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "fetch-registry":
            payload = fetch_registry(registry_out=args.registry_out, allow_missing=args.allow_missing)
        elif args.command == "fetch-active":
            payload = fetch_active(output_dir=args.output_dir, registry_out=args.registry_out, allow_missing=args.allow_missing)
        elif args.command == "put-active":
            payload = put_active(tar_path=args.tar, registry_path=args.registry)
        elif args.command == "fetch-hold":
            payload = fetch_hold(args.path)
        else:
            payload = put_hold(args.path)
    except (StoreError, OSError, json.JSONDecodeError) as exc:
        print(f"[site-artifact-store] error: {exc}", flush=True)
        return 1
    print(json.dumps(payload, indent=2, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
