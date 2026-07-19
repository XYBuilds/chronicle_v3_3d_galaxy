#!/usr/bin/env python3
"""Cloudflare R2 repository for the committed OG-index snapshot checkpoint."""
from __future__ import annotations

import gzip
import io
import json
from collections.abc import Mapping
from typing import Any

from cron.og_index_state import (
    SnapshotValidationError,
    parse_snapshot_json,
    parse_v1_snapshot_json,
    validate_snapshot,
)
from cron.upload_galaxy_r2 import _required_r2_credentials

DEFAULT_SNAPSHOT_KEY = "ops/og-index/state-v2.json.gz"
LEGACY_SNAPSHOT_KEY = "ops/og-index/state-v1.json.gz"
SNAPSHOT_CONTENT_TYPE = "application/json"
SNAPSHOT_CONTENT_ENCODING = "gzip"
SNAPSHOT_CACHE_CONTROL = "no-store"


class SnapshotRepositoryError(RuntimeError):
    """Base class for safe, actionable snapshot repository failures."""


class SnapshotMissingError(SnapshotRepositoryError):
    """The committed R2 snapshot object is absent; the caller decides bootstrap."""


class SnapshotCorruptError(SnapshotRepositoryError):
    """The R2 object exists but is not a valid compressed committed snapshot."""


class SnapshotUploadError(SnapshotRepositoryError):
    """R2 refused or failed to overwrite the committed snapshot object."""


def create_r2_client() -> tuple[Any, str]:
    """Create an R2 S3 client using the repository's established R2 environment."""
    env = _required_r2_credentials()
    if env is None:
        raise SnapshotRepositoryError(
            "R2 snapshot requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET"
        )
    try:
        import boto3  # noqa: WPS433
    except ImportError as exc:
        raise SnapshotRepositoryError("R2 snapshot requires boto3") from exc
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    return client, env["R2_BUCKET"]


def _is_not_found(error: BaseException) -> bool:
    response = getattr(error, "response", None)
    if not isinstance(response, Mapping):
        return False
    metadata = response.get("ResponseMetadata")
    status = metadata.get("HTTPStatusCode") if isinstance(metadata, Mapping) else None
    error_info = response.get("Error")
    code = error_info.get("Code") if isinstance(error_info, Mapping) else None
    if code == "NoSuchBucket":
        return False
    return status == 404 or code in {"404", "NoSuchKey", "NotFound"}


def _read_body(response: Mapping[str, Any]) -> bytes:
    body = response.get("Body")
    reader = getattr(body, "read", None)
    if not callable(reader):
        raise SnapshotCorruptError("snapshot get response has no readable Body")
    data = reader()
    if not isinstance(data, bytes):
        raise SnapshotCorruptError("snapshot body is not bytes")
    return data


def load_snapshot(
    *,
    client: Any,
    bucket: str,
    key: str = DEFAULT_SNAPSHOT_KEY,
) -> dict[str, Any]:
    """Fetch, decompress, parse, and schema-validate a committed snapshot."""
    try:
        response = client.get_object(Bucket=bucket, Key=key)
    except Exception as exc:  # third-party client exceptions vary by installed botocore version
        if _is_not_found(exc):
            raise SnapshotMissingError(f"R2 snapshot missing key={key!r}") from exc
        raise SnapshotRepositoryError(f"R2 snapshot GET failed key={key!r}") from exc
    try:
        compressed = _read_body(response)
        raw = gzip.decompress(compressed)
        text = raw.decode("utf-8")
        return parse_snapshot_json(text)
    except SnapshotValidationError as exc:
        raise SnapshotCorruptError(f"R2 snapshot schema invalid key={key!r}") from exc
    except (OSError, EOFError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SnapshotCorruptError(f"R2 snapshot gzip or JSON invalid key={key!r}") from exc


def load_v1_snapshot_for_migration(
    *,
    client: Any,
    bucket: str,
    key: str = LEGACY_SNAPSHOT_KEY,
) -> dict[str, Any]:
    """Read v1 only when an explicitly requested migration asks for it."""
    try:
        response = client.get_object(Bucket=bucket, Key=key)
    except Exception as exc:
        if _is_not_found(exc):
            raise SnapshotMissingError(f"legacy R2 snapshot missing key={key!r}") from exc
        raise SnapshotRepositoryError(f"legacy R2 snapshot GET failed key={key!r}") from exc
    try:
        return parse_v1_snapshot_json(gzip.decompress(_read_body(response)).decode("utf-8"))
    except SnapshotValidationError as exc:
        raise SnapshotCorruptError(f"legacy R2 snapshot schema invalid key={key!r}") from exc
    except (OSError, EOFError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SnapshotCorruptError(f"legacy R2 snapshot gzip or JSON invalid key={key!r}") from exc


def snapshot_gzip(snapshot: Mapping[str, Any]) -> bytes:
    """Return deterministic gzip bytes after validating the deletion-safe schema."""
    try:
        validate_snapshot(snapshot)
        raw = json.dumps(
            snapshot,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (SnapshotValidationError, TypeError, ValueError) as exc:
        raise SnapshotCorruptError("candidate snapshot is invalid") from exc
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as stream:
        stream.write(raw)
    return output.getvalue()


def commit_snapshot(
    *,
    client: Any,
    bucket: str,
    snapshot: Mapping[str, Any],
    key: str = DEFAULT_SNAPSHOT_KEY,
) -> None:
    """Atomically request an R2 object overwrite after a successful caller-owned commit."""
    body = snapshot_gzip(snapshot)
    try:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ContentType=SNAPSHOT_CONTENT_TYPE,
            ContentEncoding=SNAPSHOT_CONTENT_ENCODING,
            CacheControl=SNAPSHOT_CACHE_CONTROL,
        )
    except Exception as exc:  # do not claim checkpoint advancement on any upload failure
        raise SnapshotUploadError(f"R2 snapshot PUT failed key={key!r}") from exc


__all__ = [
    "DEFAULT_SNAPSHOT_KEY",
    "LEGACY_SNAPSHOT_KEY",
    "SNAPSHOT_CACHE_CONTROL",
    "SNAPSHOT_CONTENT_ENCODING",
    "SNAPSHOT_CONTENT_TYPE",
    "SnapshotCorruptError",
    "SnapshotMissingError",
    "SnapshotRepositoryError",
    "SnapshotUploadError",
    "commit_snapshot",
    "create_r2_client",
    "load_snapshot",
    "load_v1_snapshot_for_migration",
    "snapshot_gzip",
]
