#!/usr/bin/env python3
"""Phase 34.3: OG index KV record builders and batching."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest import mock

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.og_index_kv import (  # noqa: E402
    META_G_KEY,
    TODAY_KEY,
    chunk_entries,
    iter_og_index_entries,
    movie_kv_key,
    movie_og_record,
    today_kv_value,
)


class TestMovieOgRecord(unittest.TestCase):
    def test_extracts_minimal_fields(self) -> None:
        rec = movie_og_record(
            {
                "id": 42,
                "title": "Test Film",
                "release_date": "1999-01-01",
                "genres": ["Drama", "Comedy"],
                "poster_url": "https://image.tmdb.org/t/p/w780/x.jpg",
                "vote_count": 999,
            }
        )
        self.assertEqual(
            rec,
            {
                "title": "Test Film",
                "release_date": "1999-01-01",
                "genres": ["Drama", "Comedy"],
                "poster_url": "https://image.tmdb.org/t/p/w780/x.jpg",
            },
        )

    def test_movie_key_format(self) -> None:
        self.assertEqual(movie_kv_key(301334), "movie:301334")


class TestTodayKvValue(unittest.TestCase):
    def test_shape(self) -> None:
        self.assertEqual(
            today_kv_value({"date": "2026-05-08", "movie_id": 301334}),
            {"date": "2026-05-08", "movie_id": 301334},
        )


class TestIterOgIndexEntries(unittest.TestCase):
    def test_daily_scope_keys(self) -> None:
        today = {"date": "2026-05-08", "movie_id": 1}
        entries = dict(
            iter_og_index_entries(
                data_version="2026.05.08.daily.1",
                today_payload=today,
                movies=None,
            )
        )
        self.assertEqual(set(entries.keys()), {META_G_KEY, TODAY_KEY})
        self.assertEqual(entries[META_G_KEY], "2026.05.08.daily.1")
        self.assertEqual(json.loads(entries[TODAY_KEY]), today_kv_value(today))

    def test_full_scope_includes_movies(self) -> None:
        movies = [
            {
                "id": 1,
                "title": "A",
                "release_date": "2000-01-01",
                "genres": ["Drama"],
                "poster_url": "",
            },
            {
                "id": 2,
                "title": "B",
                "release_date": "2001-02-02",
                "genres": [],
                "poster_url": "https://image.tmdb.org/t/p/w780/b.jpg",
            },
        ]
        entries = dict(
            iter_og_index_entries(
                data_version="g1",
                today_payload={"date": "2026-05-09", "movie_id": 2},
                movies=movies,
            )
        )
        self.assertEqual(entries["movie:1"], json.dumps(movie_og_record(movies[0]), ensure_ascii=False, separators=(",", ":")))
        self.assertIn("movie:2", entries)
        self.assertEqual(len(entries), 4)


class TestChunkEntries(unittest.TestCase):
    def test_batch_sizes(self) -> None:
        pairs = [(f"k{i}", f"v{i}") for i in range(5)]
        batches = list(chunk_entries(pairs, batch_size=2))
        self.assertEqual(len(batches), 3)
        self.assertEqual(len(batches[0]), 2)
        self.assertEqual(batches[0][0], {"key": "k0", "value": "v0"})


class TestKvBulkPut(unittest.TestCase):
    def test_http_error_raises(self) -> None:
        from cron.og_index_kv import kv_bulk_put
        import urllib.error

        err = urllib.error.HTTPError(
            url="https://api.cloudflare.com/",
            code=403,
            msg="Forbidden",
            hdrs=None,
            fp=None,
        )
        err.read = lambda: b'{"success":false}'  # type: ignore[method-assign]
        with mock.patch("cron.og_index_kv.urllib.request.urlopen", side_effect=err):
            with self.assertRaises(RuntimeError) as ctx:
                kv_bulk_put(
                    account_id="acc",
                    namespace_id="ns",
                    api_token="tok",
                    batch=[{"key": "meta:G", "value": "v"}],
                )
            self.assertIn("403", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
