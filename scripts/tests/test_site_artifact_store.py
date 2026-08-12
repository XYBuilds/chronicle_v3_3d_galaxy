"""R2 store for site artifacts and publication hold (#388)."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import Mock

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.site_artifact_store import (  # noqa: E402
    REGISTRY_KEY,
    StoreError,
    artifact_key,
    download_bytes,
    load_registry,
    upload_bytes,
)

NOW = "2026-08-13T04:00:00.000Z"


def test_artifact_key_is_content_addressed() -> None:
    assert artifact_key("abc123") == "ops/site-artifacts/abc123.tar"
    assert REGISTRY_KEY == "ops/site-artifacts/registry.json"


def test_load_registry_fails_closed_when_missing() -> None:
    client = Mock()
    client.get_object.side_effect = _not_found()
    with pytest.raises(StoreError, match="unreadable|missing"):
        load_registry(client, bucket="bucket")


def test_load_registry_returns_active_and_previous() -> None:
    client = Mock()
    body = json.dumps({"active": "site-bbbb", "previous": "site-aaaa", "artifacts": {"site-bbbb": {}, "site-aaaa": {}}}).encode()
    client.get_object.return_value = {"Body": _body(body)}
    registry = load_registry(client, bucket="bucket")
    assert registry["active"] == "site-bbbb"
    assert registry["previous"] == "site-aaaa"


def test_upload_and_download_round_trip_bytes() -> None:
    store: dict[str, bytes] = {}
    client = Mock()

    def put_object(*, Bucket: str, Key: str, Body: bytes, **_kwargs: object) -> dict[str, str]:
        store[Key] = Body
        return {"ETag": "ok"}

    def get_object(*, Bucket: str, Key: str) -> dict[str, object]:
        if Key not in store:
            raise _not_found()
        return {"Body": _body(store[Key])}

    client.put_object.side_effect = put_object
    client.get_object.side_effect = get_object
    upload_bytes(client, bucket="bucket", key="ops/site-artifacts/site-bbbb.tar", body=b"tar-bytes")
    assert download_bytes(client, bucket="bucket", key="ops/site-artifacts/site-bbbb.tar") == b"tar-bytes"


def _body(payload: bytes) -> Mock:
    stream = Mock()
    stream.read.return_value = payload
    return stream


def _not_found() -> Exception:
    error = Exception("missing")
    error.response = {"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"HTTPStatusCode": 404}}  # type: ignore[attr-defined]
    return error
