#!/usr/bin/env python3
"""Phase 40.3 contract: R2 publication contains galaxy/search assets only."""
from __future__ import annotations

import gzip
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron import upload_galaxy_r2  # noqa: E402


class _FakeR2Client:
    def __init__(self) -> None:
        self.uploads: list[tuple[str, str, str, dict[str, str]]] = []

    def upload_file(self, path: str, bucket: str, key: str, ExtraArgs: dict[str, str]) -> None:
        self.uploads.append((path, bucket, key, ExtraArgs))


class TestR2AssetsManifestRetirement(unittest.TestCase):
    def test_upload_and_manifest_ignore_a_present_legacy_today_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            public_data = Path(tmp)
            public_data.joinpath("galaxy_data.json").write_text(
                json.dumps({"meta": {"version": "fixture-v1"}}), encoding="utf-8"
            )
            for name in ("galaxy_data.json.gz", "galaxy_search_index.json.gz"):
                public_data.joinpath(name).write_bytes(gzip.compress(b"fixture", mtime=0))
            public_data.joinpath("today.json").write_text(
                json.dumps({"date": "2026-07-19", "movie_id": 1}), encoding="utf-8"
            )
            client = _FakeR2Client()
            boto3 = types.ModuleType("boto3")
            boto3.client = lambda *_args, **_kwargs: client  # type: ignore[attr-defined]
            env = {
                "R2_ACCOUNT_ID": "account",
                "R2_ACCESS_KEY_ID": "key",
                "R2_SECRET_ACCESS_KEY": "secret",
                "R2_BUCKET": "bucket",
                "R2_PUBLIC_BASE_URL": "https://assets.example.test/",
                "R2_KEY_PREFIX": "galaxy",
            }
            with patch.dict(os.environ, env, clear=True), patch.dict(sys.modules, {"boto3": boto3}):
                result = upload_galaxy_r2.main(["--public-data-dir", str(public_data)])

            self.assertEqual(result, 0)
            self.assertEqual([entry[2] for entry in client.uploads], ["galaxy/galaxy_data.json.gz", "galaxy/galaxy_search_index.json.gz"])
            manifest = json.loads(public_data.joinpath("galaxy_assets_manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(
                set(manifest),
                {"galaxy_data_gzip_url", "galaxy_search_index_gzip_url", "data_version", "exported_at", "r2_object_keys"},
            )
            self.assertEqual(set(manifest["r2_object_keys"]), {"galaxy_data", "galaxy_search_index"})
            self.assertNotIn("today", json.dumps(manifest, sort_keys=True))


if __name__ == "__main__":
    unittest.main()