#!/usr/bin/env python3
"""Unit tests for the OG index R2 snapshot repository."""
from __future__ import annotations

import gzip
import io
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.og_index_snapshot_r2 import (  # noqa: E402
    DEFAULT_SNAPSHOT_KEY,
    SnapshotCorruptError,
    SnapshotMissingError,
    SnapshotRepositoryError,
    SnapshotUploadError,
    commit_snapshot,
    create_r2_client,
    load_snapshot,
    snapshot_gzip,
)
from cron.og_index_state import build_snapshot  # noqa: E402


class _NotFound(Exception):
    response = {"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"HTTPStatusCode": 404}}


class _NoSuchBucket(Exception):
    response = {"Error": {"Code": "NoSuchBucket"}, "ResponseMetadata": {"HTTPStatusCode": 404}}


class _FakeR2:
    def __init__(self, body: bytes | None = None, error: Exception | None = None) -> None:
        self.body = body
        self.error = error
        self.put_calls: list[dict[str, object]] = []

    def get_object(self, **kwargs: object) -> dict[str, object]:
        if self.error is not None:
            raise self.error
        assert self.body is not None
        return {"Body": io.BytesIO(self.body)}

    def put_object(self, **kwargs: object) -> None:
        if self.error is not None:
            raise self.error
        self.put_calls.append(kwargs)


def _snapshot() -> dict[str, object]:
    return build_snapshot(
        source_data_version="v1",
        committed_at="2026-07-17T00:00:00Z",
        movies=[{"id": 1, "title": "Film", "release_date": "2000-01-01", "genres": [], "poster_url": ""}],
        today_payload={"date": "2026-07-17", "movie_id": 1},
    )


class TestSnapshotR2(unittest.TestCase):
    def test_deterministic_gzip_and_valid_readback(self) -> None:
        snap = _snapshot()
        body = snapshot_gzip(snap)
        self.assertEqual(body, snapshot_gzip(snap))
        self.assertEqual(load_snapshot(client=_FakeR2(body), bucket="bucket"), snap)

    def test_missing_is_distinct_from_corrupt(self) -> None:
        with self.assertRaises(SnapshotMissingError):
            load_snapshot(client=_FakeR2(error=_NotFound()), bucket="bucket")
        with self.assertRaises(SnapshotRepositoryError):
            load_snapshot(client=_FakeR2(error=_NoSuchBucket()), bucket="bucket")
        with self.assertRaises(SnapshotCorruptError):
            load_snapshot(client=_FakeR2(b"not a gzip"), bucket="bucket")
        with self.assertRaises(SnapshotCorruptError):
            load_snapshot(client=_FakeR2(gzip.compress(b"{}", mtime=0)), bucket="bucket")

    def test_create_client_requires_only_shared_r2_credentials(self) -> None:
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
        with mock.patch.dict(os.environ, credentials, clear=True), mock.patch.dict(sys.modules, {"boto3": fake_boto3}):
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

    def test_commit_uses_required_headers_and_propagates_failure(self) -> None:
        client = _FakeR2()
        commit_snapshot(client=client, bucket="bucket", snapshot=_snapshot())
        self.assertEqual(len(client.put_calls), 1)
        call = client.put_calls[0]
        self.assertEqual(call["Key"], DEFAULT_SNAPSHOT_KEY)
        self.assertEqual(call["CacheControl"], "no-store")
        self.assertEqual(call["ContentType"], "application/json")
        self.assertEqual(call["ContentEncoding"], "gzip")
        with self.assertRaises(SnapshotUploadError):
            commit_snapshot(client=_FakeR2(error=RuntimeError("network")), bucket="bucket", snapshot=_snapshot())

    def test_invalid_candidate_never_uploads(self) -> None:
        client = _FakeR2()
        with self.assertRaises(SnapshotCorruptError):
            commit_snapshot(client=client, bucket="bucket", snapshot={})
        self.assertEqual(client.put_calls, [])


if __name__ == "__main__":
    unittest.main()