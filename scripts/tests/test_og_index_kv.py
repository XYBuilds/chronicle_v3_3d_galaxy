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
    def test_success(self) -> None:
        from cron.og_index_kv import kv_bulk_put

        response = _Response({"success": True, "result": None})
        with mock.patch("cron.og_index_kv.urllib.request.urlopen", return_value=response) as urlopen:
            kv_bulk_put(
                account_id="acc", namespace_id="ns", api_token="tok", batch=[{"key": "meta:G", "value": "v"}]
            )
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_method(), "PUT")
        self.assertIn(b'"key": "meta:G"', request.data)

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


class _Response:
    def __init__(self, payload: dict[str, object]) -> None:
        self._raw = json.dumps(payload).encode("utf-8")

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self) -> bytes:
        return self._raw


class TestKvAdapterTransfers(unittest.TestCase):
    def _urlopen(self, payloads: list[dict[str, object]]) -> mock.Mock:
        return mock.Mock(side_effect=[_Response(payload) for payload in payloads])

    def test_delete_get_list_and_readback(self) -> None:
        from cron.og_index_kv import kv_bulk_delete, kv_bulk_get, kv_list_movie_keys, verify_kv_absent, verify_kv_values

        urlopen = self._urlopen(
            [
                {"success": True, "result": []},
                {"success": True, "result": {"values": {"movie:1": "one"}}},
                {"success": True, "result": [{"name": "movie:1"}], "result_info": {"cursor": "next"}},
                {"success": True, "result": [{"name": "movie:2"}], "result_info": {}},
                {"success": True, "result": {"values": {"movie:1": "one"}}},
                {"success": True, "result": {"values": {}}},
            ]
        )
        with mock.patch("cron.og_index_kv.urllib.request.urlopen", urlopen):
            kv_bulk_delete(account_id="acc", namespace_id="ns", api_token="secret", keys=["movie:9"])
            self.assertEqual(kv_bulk_get(account_id="acc", namespace_id="ns", api_token="secret", keys=["movie:1"]), {"movie:1": "one"})
            self.assertEqual(kv_list_movie_keys(account_id="acc", namespace_id="ns", api_token="secret"), ["movie:1", "movie:2"])
            verify_kv_values(account_id="acc", namespace_id="ns", api_token="secret", expected={"movie:1": "one"})
            verify_kv_absent(account_id="acc", namespace_id="ns", api_token="secret", keys=["movie:9"])
        bulk_get_request = urlopen.call_args_list[1].args[0]
        self.assertEqual(bulk_get_request.get_method(), "POST")
        self.assertTrue(bulk_get_request.full_url.endswith("/bulk/get"))
        self.assertEqual(json.loads(bulk_get_request.data), {"keys": ["movie:1"], "type": "text"})
        self.assertIn("cursor=next", urlopen.call_args_list[3].args[0].full_url)

    def test_get_limit_and_readback_mismatch(self) -> None:
        from cron.og_index_kv import KvAdapterError, kv_bulk_get, verify_kv_values

        with self.assertRaises(ValueError):
            kv_bulk_get(account_id="a", namespace_id="n", api_token="x", keys=[str(i) for i in range(101)])
        with mock.patch("cron.og_index_kv.urllib.request.urlopen", self._urlopen([{"success": True, "result": {"values": {}}}])):
            with self.assertRaises(KvAdapterError) as ctx:
                verify_kv_values(account_id="a", namespace_id="n", api_token="token-not-logged", expected={"movie:1": "one"})
        self.assertIn("read-back-verify-values", str(ctx.exception))
        self.assertNotIn("token-not-logged", str(ctx.exception))

    def test_http_timeout_and_cloudflare_failure_are_safe(self) -> None:
        from cron.og_index_kv import KvAdapterError, kv_bulk_put
        import urllib.error

        for error, expected_status in [
            (urllib.error.HTTPError("https://x", 403, "Forbidden", None, None), "403"),
            (urllib.error.HTTPError("https://x", 404, "Not found", None, None), "404"),
            (urllib.error.HTTPError("https://x", 429, "Rate limited", None, None), "429"),
            (urllib.error.URLError(TimeoutError()), "timeout"),
        ]:
            with mock.patch("cron.og_index_kv.urllib.request.urlopen", side_effect=error):
                with self.assertRaises(KvAdapterError) as ctx:
                    kv_bulk_put(account_id="a", namespace_id="n", api_token="hidden", batch=[{"key": "k", "value": "v"}])
            self.assertIn(expected_status, str(ctx.exception))
            self.assertNotIn("hidden", str(ctx.exception))
        with mock.patch("cron.og_index_kv.urllib.request.urlopen", self._urlopen([{"success": False}])):
            with self.assertRaises(KvAdapterError) as ctx:
                kv_bulk_put(account_id="a", namespace_id="n", api_token="hidden", batch=[{"key": "k", "value": "v"}])
        self.assertIn("success:false", str(ctx.exception))

    def test_invalid_json_is_localized(self) -> None:
        from cron.og_index_kv import KvAdapterError, kv_bulk_put

        class _InvalidResponse(_Response):
            def __init__(self) -> None:
                self._raw = b"not-json"

        with mock.patch("cron.og_index_kv.urllib.request.urlopen", return_value=_InvalidResponse()):
            with self.assertRaises(KvAdapterError) as ctx:
                kv_bulk_put(account_id="a", namespace_id="n", api_token="hidden", batch=[{"key": "k", "value": "v"}])
        self.assertIn("invalid-json", str(ctx.exception))

    def test_bulk_get_rejects_unknown_or_invalid_value(self) -> None:
        from cron.og_index_kv import KvAdapterError, kv_bulk_get

        for values in ({"other": "value"}, {"movie:1": 7}):
            with mock.patch(
                "cron.og_index_kv.urllib.request.urlopen",
                self._urlopen([{"success": True, "result": {"values": values}}]),
            ):
                with self.assertRaises(KvAdapterError) as ctx:
                    kv_bulk_get(account_id="a", namespace_id="n", api_token="x", keys=["movie:1"])
            self.assertIn("invalid-result", str(ctx.exception))
        with self.assertRaises(ValueError):
            kv_bulk_get(account_id="a", namespace_id="n", api_token="x", keys=["movie:1", "movie:1"])
        with self.assertRaises(ValueError):
            kv_bulk_get(account_id="a", namespace_id="n", api_token="x", keys="movie:1")  # type: ignore[arg-type]

    def test_bulk_put_rejects_non_mapping_or_non_text_fields(self) -> None:
        from cron.og_index_kv import kv_bulk_put

        bad_batches: list[object] = [
            "not-a-batch",
            ["not-a-mapping"],
            [{"key": 1, "value": "v"}],
            [{"key": "k", "value": 1}],
        ]
        for batch in bad_batches:
            with self.assertRaises(ValueError):
                kv_bulk_put(account_id="a", namespace_id="n", api_token="x", batch=batch)  # type: ignore[arg-type]

    def test_invalid_encoding_is_localized(self) -> None:
        from cron.og_index_kv import KvAdapterError, kv_bulk_put

        class _InvalidEncodingResponse(_Response):
            def __init__(self) -> None:
                self._raw = b"\xff"

        with mock.patch("cron.og_index_kv.urllib.request.urlopen", return_value=_InvalidEncodingResponse()):
            with self.assertRaises(KvAdapterError) as ctx:
                kv_bulk_put(account_id="a", namespace_id="n", api_token="hidden", batch=[{"key": "k", "value": "v"}])
        self.assertIn("invalid-encoding", str(ctx.exception))
        self.assertNotIn("hidden", str(ctx.exception))

    def test_list_duplicate_key_fails(self) -> None:
        from cron.og_index_kv import KvAdapterError, kv_list_movie_keys

        payloads = [
            {"success": True, "result": [{"name": "movie:1"}], "result_info": {"cursor": "next"}},
            {"success": True, "result": [{"name": "movie:1"}], "result_info": {}},
        ]
        with mock.patch("cron.og_index_kv.urllib.request.urlopen", self._urlopen(payloads)):
            with self.assertRaises(KvAdapterError) as ctx:
                kv_list_movie_keys(account_id="a", namespace_id="n", api_token="x")
        self.assertIn("duplicate-key", str(ctx.exception))

    def test_list_repeated_cursor_fails(self) -> None:
        from cron.og_index_kv import KvAdapterError, kv_list_movie_keys

        payloads = [
            {"success": True, "result": [], "result_info": {"cursor": "again"}},
            {"success": True, "result": [], "result_info": {"cursor": "again"}},
        ]
        with mock.patch("cron.og_index_kv.urllib.request.urlopen", self._urlopen(payloads)):
            with self.assertRaises(KvAdapterError) as ctx:
                kv_list_movie_keys(account_id="a", namespace_id="n", api_token="x")
        self.assertIn("invalid-cursor", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
