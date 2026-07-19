#!/usr/bin/env python3
"""Regression tests for v2 and legacy OG-index R2 checkpoints.

The client boundary is represented by a small in-memory fake. These tests never
contact R2 or any other network service.
"""
from __future__ import annotations

import gzip
import io
import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.og_index_snapshot_r2 import (
    DEFAULT_SNAPSHOT_KEY,
    LEGACY_SNAPSHOT_KEY,
    SNAPSHOT_CACHE_CONTROL,
    SNAPSHOT_CONTENT_ENCODING,
    SNAPSHOT_CONTENT_TYPE,
    SnapshotCorruptError,
    SnapshotMissingError,
    SnapshotRepositoryError,
    SnapshotUploadError,
    commit_snapshot,
    create_r2_client,
    load_snapshot,
    load_v1_snapshot_for_migration,
    snapshot_gzip,
)
from cron.og_index_state import build_snapshot


class _NotFoundError(Exception):
    response = {
        "Error": {"Code": "NoSuchKey"},
        "ResponseMetadata": {"HTTPStatusCode": 404},
    }


class _NoSuchBucketError(Exception):
    response = {
        "Error": {"Code": "NoSuchBucket"},
        "ResponseMetadata": {"HTTPStatusCode": 404},
    }


class _FakeR2Client:
    def __init__(
        self,
        body: bytes | None = None,
        error: Exception | None = None,
    ) -> None:
        self.body = body
        self.error = error
        self.get_calls: list[dict[str, object]] = []
        self.put_calls: list[dict[str, object]] = []

    def get_object(self, **kwargs: object) -> dict[str, object]:
        self.get_calls.append(dict(kwargs))
        if self.error is not None:
            raise self.error
        assert self.body is not None
        return {"Body": io.BytesIO(self.body)}

    def put_object(self, **kwargs: object) -> None:
        if self.error is not None:
            raise self.error
        self.put_calls.append(dict(kwargs))


def _movie() -> dict[str, object]:
    return {
        "id": 1,
        "title": "Film",
        "release_date": "2000-01-01",
        "genres": ["Drama"],
        "poster_url": "",
    }


def _v2_snapshot() -> dict[str, object]:
    return build_snapshot(
        source_data_version="version",
        committed_at="2026-07-17T00:00:00Z",
        movies=[_movie()],
    )


def _v1_snapshot() -> dict[str, object]:
    snapshot = _v2_snapshot()
    snapshot["schema_version"] = 1
    snapshot["projection_version"] = "og-index-v1"
    snapshot["control"] = {
        "today_value": '{"date":"2026-07-17","movie_id":1}',
        "meta_g_value": "version",
    }
    return snapshot


def _legacy_gzip(snapshot: dict[str, object]) -> bytes:
    raw = json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return gzip.compress(raw, mtime=0)


class TestV2SnapshotRepository(unittest.TestCase):
    def test_deterministic_gzip_and_valid_readback(self) -> None:
        snapshot = _v2_snapshot()
        body = snapshot_gzip(snapshot)

        self.assertEqual(body, snapshot_gzip(snapshot))
        self.assertEqual(
            load_snapshot(client=_FakeR2Client(body), bucket="bucket"),
            snapshot,
        )

    def test_v2_missing_corrupt_and_repository_errors_are_distinct(self) -> None:
        with self.assertRaises(SnapshotMissingError):
            load_snapshot(client=_FakeR2Client(error=_NotFoundError()), bucket="bucket")
        with self.assertRaises(SnapshotRepositoryError) as raised:
            load_snapshot(
                client=_FakeR2Client(error=_NoSuchBucketError()),
                bucket="bucket",
            )
        self.assertNotIsInstance(raised.exception, SnapshotMissingError)
        with self.assertRaises(SnapshotCorruptError):
            load_snapshot(client=_FakeR2Client(b"not gzip"), bucket="bucket")
        with self.assertRaises(SnapshotCorruptError):
            load_snapshot(
                client=_FakeR2Client(gzip.compress(b"{}", mtime=0)),
                bucket="bucket",
            )

    def test_v2_loader_rejects_legacy_schema(self) -> None:
        with self.assertRaises(SnapshotCorruptError):
            load_snapshot(
                client=_FakeR2Client(_legacy_gzip(_v1_snapshot())),
                bucket="bucket",
            )

    def test_commit_uses_v2_key_and_required_metadata(self) -> None:
        client = _FakeR2Client()
        commit_snapshot(client=client, bucket="bucket", snapshot=_v2_snapshot())

        self.assertEqual(len(client.put_calls), 1)
        call = client.put_calls[0]
        self.assertEqual(call["Bucket"], "bucket")
        self.assertEqual(call["Key"], DEFAULT_SNAPSHOT_KEY)
        self.assertEqual(DEFAULT_SNAPSHOT_KEY, "ops/og-index/state-v2.json.gz")
        self.assertEqual(call["ContentType"], SNAPSHOT_CONTENT_TYPE)
        self.assertEqual(call["ContentEncoding"], SNAPSHOT_CONTENT_ENCODING)
        self.assertEqual(call["CacheControl"], SNAPSHOT_CACHE_CONTROL)

    def test_invalid_candidate_never_uploads_and_upload_failure_is_wrapped(self) -> None:
        client = _FakeR2Client()
        with self.assertRaises(SnapshotCorruptError):
            commit_snapshot(client=client, bucket="bucket", snapshot={})
        self.assertEqual(client.put_calls, [])

        with self.assertRaises(SnapshotUploadError):
            commit_snapshot(
                client=_FakeR2Client(error=RuntimeError("network failure")),
                bucket="bucket",
                snapshot=_v2_snapshot(),
            )


class TestLegacySnapshotRepository(unittest.TestCase):
    def test_legacy_loader_uses_dedicated_key_and_accepts_only_v1(self) -> None:
        client = _FakeR2Client(_legacy_gzip(_v1_snapshot()))
        self.assertEqual(
            load_v1_snapshot_for_migration(client=client, bucket="bucket"),
            _v1_snapshot(),
        )
        self.assertEqual(client.get_calls[0]["Key"], LEGACY_SNAPSHOT_KEY)
        self.assertEqual(LEGACY_SNAPSHOT_KEY, "ops/og-index/state-v1.json.gz")

    def test_legacy_missing_corrupt_and_repository_errors_are_distinct(self) -> None:
        with self.assertRaises(SnapshotMissingError):
            load_v1_snapshot_for_migration(
                client=_FakeR2Client(error=_NotFoundError()),
                bucket="bucket",
            )
        with self.assertRaises(SnapshotRepositoryError) as raised:
            load_v1_snapshot_for_migration(
                client=_FakeR2Client(error=_NoSuchBucketError()),
                bucket="bucket",
            )
        self.assertNotIsInstance(raised.exception, SnapshotMissingError)
        with self.assertRaises(SnapshotCorruptError):
            load_v1_snapshot_for_migration(
                client=_FakeR2Client(b"not gzip"),
                bucket="bucket",
            )
        with self.assertRaises(SnapshotCorruptError):
            load_v1_snapshot_for_migration(
                client=_FakeR2Client(snapshot_gzip(_v2_snapshot())),
                bucket="bucket",
            )


class TestR2ClientCreation(unittest.TestCase):
    def test_client_uses_shared_credentials_not_upload_public_environment(self) -> None:
        from cron.upload_galaxy_r2 import _required_env

        fake_boto3 = mock.Mock()
        fake_client = object()
        fake_boto3.client.return_value = fake_client
        credentials = {
            "R2_ACCOUNT_ID": "account",
            "R2_ACCESS_KEY_ID": "access",
            "R2_SECRET_ACCESS_KEY": "secret",
            "R2_BUCKET": "bucket",
        }
        with (
            mock.patch.dict(os.environ, credentials, clear=True),
            mock.patch.dict(sys.modules, {"boto3": fake_boto3}),
        ):
            client, bucket = create_r2_client()
            self.assertIs(client, fake_client)
            self.assertEqual(bucket, "bucket")
            self.assertIsNone(_required_env())

        fake_boto3.client.assert_called_once_with(
            "s3",
            endpoint_url="https://account.r2.cloudflarestorage.com",
            aws_access_key_id="access",
            aws_secret_access_key="secret",
            region_name="auto",
        )


if __name__ == "__main__":
    unittest.main()
