#!/usr/bin/env python3
"""Focused orchestration tests; all Cloudflare boundaries are injected fakes."""
from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.og_index_snapshot_r2 import SnapshotCorruptError, SnapshotMissingError
from cron.og_index_state import SnapshotValidationError, build_snapshot
from cron.sync_og_index_kv import (
    CredentialsError,
    MutationPlan,
    QuotaExceededError,
    RemoteAuditError,
    RemoteAuditState,
    build_bootstrap_plan,
    build_full_recovery_plan,
    build_incremental_plan,
    enforce_quota,
    execute_plan,
    main,
    read_remote_audit_state,
    run_sync,
    sync_og_index_after_galaxy_export,
)

_ENV = {"CLOUDFLARE_ACCOUNT_ID": "acc", "OG_INDEX_KV_NAMESPACE_ID": "ns", "CLOUDFLARE_API_TOKEN": "not-a-secret"}


def _movie(movie_id: int, **changes: object) -> dict[str, object]:
    out: dict[str, object] = {"id": movie_id, "title": f"Film {movie_id}", "release_date": "2000-01-01", "genres": ["Drama"], "poster_url": f"https://x/{movie_id}.jpg", "vote_count": 1}
    out.update(changes)
    return out


def _snapshot(movies: list[dict[str, object]], *, today_id: int = 1, version: str = "v1") -> dict[str, object]:
    return build_snapshot(source_data_version=version, committed_at="2026-01-01T00:00:00Z", movies=movies, today_payload={"date": "2026-01-01", "movie_id": today_id})


class TestPlans(unittest.TestCase):
    def test_movie_diff_and_controls_are_independent(self) -> None:
        old_movies = [_movie(1), _movie(2), _movie(3)]
        current_movies = [_movie(1, vote_count=999), _movie(2, title="Changed"), _movie(4)]
        plan = build_incremental_plan(_snapshot(old_movies), _snapshot(current_movies, today_id=2, version="v2"), current_movies)
        self.assertEqual([key for key, _ in plan.movie_puts], ["movie:2", "movie:4"])
        self.assertEqual(plan.movie_deletes, ("movie:3",))
        self.assertEqual(plan.unchanged_count, 1)
        self.assertIsNotNone(plan.today_put)
        self.assertEqual(plan.meta_put, "v2")
        self.assertEqual(json.loads(dict(plan.movie_puts)["movie:2"])["title"], "Changed")

    def test_no_movie_change_and_separate_controls(self) -> None:
        movies = [_movie(1)]
        old = _snapshot(movies)
        no_changes = build_incremental_plan(old, _snapshot(movies), movies)
        self.assertEqual(no_changes.movie_puts, ())
        self.assertEqual(no_changes.movie_deletes, ())
        self.assertIsNone(no_changes.today_put)
        self.assertIsNone(no_changes.meta_put)

        same_movie_today = _snapshot(movies, today_id=1, version="v2")
        plan = build_incremental_plan(old, same_movie_today, movies)
        self.assertEqual(plan.movie_puts, ())
        self.assertEqual(plan.movie_deletes, ())
        self.assertIsNone(plan.today_put)
        self.assertEqual(plan.meta_put, "v2")

    def test_bootstrap_missing_controls_become_puts(self) -> None:
        movies = [_movie(1)]
        current = _snapshot(movies)
        remote = RemoteAuditState(movie_hashes=dict(current["movie_hashes"]), today_value=None, meta_g_value=None)
        plan = build_bootstrap_plan(remote, current, movies)
        self.assertEqual(plan.movie_puts, ())
        self.assertIsNotNone(plan.today_put)
        self.assertIsNotNone(plan.meta_put)
        self.assertTrue(plan.bootstrap)

    def test_quota_counts_controls_before_any_effect(self) -> None:
        movies = [_movie(1)]
        plan = build_full_recovery_plan(_snapshot(movies), movies, ())
        summary = plan.summary(batch_size=10, dry_run=True)
        self.assertEqual(summary["total_put"], 3)
        self.assertEqual(summary["put_batches"], 3)
        self.assertEqual(summary["read_back"], 3)
        with self.assertRaises(QuotaExceededError) as raised:
            enforce_quota(plan, max_puts=2, max_deletes=0, dry_run=True)
        self.assertTrue(json.loads(str(raised.exception).split(" ", 1)[1])["dry_run"])
        enforce_quota(plan, max_puts=2, max_deletes=0, allow_over_quota=True)

    def test_full_recovery_replaces_complete_remote_keyspace(self) -> None:
        movies = [_movie(1), _movie(2)]
        plan = build_full_recovery_plan(
            _snapshot(movies),
            movies,
            ("movie:1", "movie:3"),
        )
        self.assertEqual([key for key, _value in plan.movie_puts], ["movie:1", "movie:2"])
        self.assertEqual(plan.movie_deletes, ("movie:3",))
        self.assertEqual(plan.expected_remote_movie_keys, ("movie:1", "movie:2"))
        self.assertEqual(plan.previous_count, 2)

    def test_quota_rejects_bool_values(self) -> None:
        movies = [_movie(1)]
        plan = build_full_recovery_plan(_snapshot(movies), movies, ())
        with self.assertRaises(ValueError):
            enforce_quota(plan, max_puts=True, max_deletes=0)

    def test_plan_and_remote_audit_state_are_deeply_immutable(self) -> None:
        movies = [_movie(1)]
        source_snapshot = _snapshot(movies)
        built = build_full_recovery_plan(source_snapshot, movies, ())
        mutable_puts = list(built.movie_puts)
        mutable_deletes: list[str] = []
        mutable_expected = ["movie:1"]
        plan = MutationPlan(
            current_snapshot=source_snapshot,
            movie_puts=mutable_puts,  # type: ignore[arg-type]
            movie_deletes=mutable_deletes,  # type: ignore[arg-type]
            today_put=built.today_put,
            meta_put=built.meta_put,
            unchanged_count=0,
            previous_count=0,
            expected_remote_movie_keys=mutable_expected,  # type: ignore[arg-type]
        )

        mutable_puts.clear()
        mutable_deletes.append("movie:9")
        mutable_expected.append("movie:9")
        source_snapshot["movie_count"] = 99

        self.assertEqual(len(plan.movie_puts), 1)
        self.assertEqual(plan.movie_deletes, ())
        self.assertEqual(plan.expected_remote_movie_keys, ("movie:1",))
        self.assertEqual(plan.current_snapshot["movie_count"], 1)
        with self.assertRaises(TypeError):
            plan.current_snapshot["movie_count"] = 99  # type: ignore[index]
        remote = RemoteAuditState(movie_hashes=dict(plan.current_snapshot["movie_hashes"]), today_value=None, meta_g_value=None)
        with self.assertRaises(TypeError):
            remote.movie_hashes["movie:2"] = "0" * 64  # type: ignore[index]

    def test_plan_rejects_incomplete_current_key_coverage(self) -> None:
        movies = [_movie(1)]
        built = build_full_recovery_plan(_snapshot(movies), movies, ())
        with self.assertRaisesRegex(AssertionError, "cover the current snapshot"):
            MutationPlan(
                current_snapshot=built.current_snapshot,
                movie_puts=(),
                movie_deletes=(),
                today_put=built.today_put,
                meta_put=built.meta_put,
                unchanged_count=0,
                previous_count=0,
            )
        with self.assertRaisesRegex(AssertionError, "both control keys"):
            MutationPlan(
                current_snapshot=built.current_snapshot,
                movie_puts=built.movie_puts,
                movie_deletes=(),
                today_put=None,
                meta_put=built.meta_put,
                unchanged_count=0,
                previous_count=0,
                expected_remote_movie_keys=("movie:1",),
            )

    def test_plan_validates_complete_current_payload_before_quota(self) -> None:
        invalid_today = build_snapshot(
            source_data_version="v1",
            committed_at="2026-01-01T00:00:00Z",
            movies=[_movie(1)],
            today_payload={"date": "not-a-date", "movie_id": 0},
        )
        with self.assertRaisesRegex(SnapshotValidationError, "current today"):
            build_full_recovery_plan(invalid_today, [_movie(1)], ())

        invalid_movies = [_movie(1, genres=["Drama", 7])]
        invalid_movie_snapshot = _snapshot(invalid_movies)
        with self.assertRaisesRegex(SnapshotValidationError, "projection has invalid field types"):
            build_full_recovery_plan(invalid_movie_snapshot, invalid_movies, ())


class TestExecution(unittest.TestCase):
    def test_d3_order_meta_last_readback_then_commit(self) -> None:
        plan = build_incremental_plan(_snapshot([_movie(1), _movie(3)]), _snapshot([_movie(1, title="new"), _movie(2)], today_id=2, version="v2"), [_movie(1, title="new"), _movie(2)])
        calls: list[str] = []
        with mock.patch("cron.sync_og_index_kv.kv_bulk_put", side_effect=lambda **kw: calls.append("put:" + ",".join(entry["key"] for entry in kw["batch"]))), \
             mock.patch("cron.sync_og_index_kv.kv_bulk_delete", side_effect=lambda **kw: calls.append("delete:" + ",".join(kw["keys"]))), \
             mock.patch("cron.sync_og_index_kv.verify_kv_values", side_effect=lambda **kw: calls.append("verify-values")), \
             mock.patch("cron.sync_og_index_kv.verify_kv_absent", side_effect=lambda **kw: calls.append("verify-absent")), \
             mock.patch("cron.sync_og_index_kv.commit_snapshot", side_effect=lambda **kw: calls.append("commit")):
            execute_plan(plan, kv_env=_ENV, r2_client=object(), r2_bucket="bucket", batch_size=1000, dry_run=False)
        self.assertEqual(calls, ["put:movie:1,movie:2", "delete:movie:3", "put:today", "put:meta:G", "verify-values", "verify-absent", "commit"])

    def test_dry_run_has_no_effects(self) -> None:
        plan = build_full_recovery_plan(_snapshot([_movie(1)]), [_movie(1)], ())
        boundaries = (
            "kv_bulk_put",
            "kv_bulk_delete",
            "verify_kv_values",
            "verify_kv_absent",
            "read_remote_movie_keys",
            "commit_snapshot",
        )
        with ExitStack() as stack:
            mocks = [stack.enter_context(mock.patch(f"cron.sync_og_index_kv.{name}")) for name in boundaries]
            execute_plan(plan, kv_env={}, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=True)
        for boundary in mocks:
            boundary.assert_not_called()

    def test_invalid_publish_credentials_fail_before_any_effect(self) -> None:
        plan = build_full_recovery_plan(_snapshot([_movie(1)]), [_movie(1)], ())
        with mock.patch("cron.sync_og_index_kv.kv_bulk_put") as put, \
             mock.patch("cron.sync_og_index_kv.commit_snapshot") as commit:
            with self.assertRaisesRegex(CredentialsError, "R2 snapshot"):
                execute_plan(plan, kv_env=_ENV, r2_client=None, r2_bucket="", batch_size=10, dry_run=False)
            with self.assertRaisesRegex(CredentialsError, "CLOUDFLARE_ACCOUNT_ID"):
                execute_plan(plan, kv_env={}, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=False)
        put.assert_not_called()
        commit.assert_not_called()

    def test_full_recovery_verifies_final_keyset_before_commit(self) -> None:
        movies = [_movie(1)]
        plan = build_full_recovery_plan(_snapshot(movies), movies, ("movie:2",))
        calls: list[str] = []
        verified_keys: set[str] = set()
        with mock.patch("cron.sync_og_index_kv.kv_bulk_put"), \
             mock.patch("cron.sync_og_index_kv.kv_bulk_delete"), \
             mock.patch(
                 "cron.sync_og_index_kv.verify_kv_values",
                 side_effect=lambda **kw: verified_keys.update(kw["expected"]),
             ), \
             mock.patch("cron.sync_og_index_kv.verify_kv_absent"), \
             mock.patch("cron.sync_og_index_kv.read_remote_movie_keys", side_effect=lambda **_kw: calls.append("keyset") or ("movie:1",)), \
             mock.patch("cron.sync_og_index_kv.commit_snapshot", side_effect=lambda **_kw: calls.append("commit")):
            execute_plan(plan, kv_env=_ENV, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=False)
        self.assertEqual(verified_keys, {"movie:1", "today", "meta:G"})
        self.assertEqual(calls, ["keyset", "commit"])

    def test_full_recovery_keyset_mismatch_blocks_commit(self) -> None:
        movies = [_movie(1)]
        plan = build_full_recovery_plan(_snapshot(movies), movies, ("movie:2",))
        with mock.patch("cron.sync_og_index_kv.kv_bulk_put"), \
             mock.patch("cron.sync_og_index_kv.kv_bulk_delete"), \
             mock.patch("cron.sync_og_index_kv.verify_kv_values"), \
             mock.patch("cron.sync_og_index_kv.verify_kv_absent"), \
             mock.patch("cron.sync_og_index_kv.read_remote_movie_keys", return_value=("movie:1", "movie:9")), \
             mock.patch("cron.sync_og_index_kv.commit_snapshot") as commit:
            with self.assertRaisesRegex(RemoteAuditError, "keyset mismatch"):
                execute_plan(plan, kv_env=_ENV, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=False)
        commit.assert_not_called()

    def test_each_d3_failure_blocks_commit(self) -> None:
        plan = build_incremental_plan(
            _snapshot([_movie(1), _movie(2), _movie(3)]),
            _snapshot([_movie(1, title="changed"), _movie(2)], today_id=2, version="v2"),
            [_movie(1, title="changed"), _movie(2)],
        )
        # Each side effect is independently fatal; commit is impossible before it.
        for target in ("kv_bulk_put", "kv_bulk_delete", "verify_kv_values", "verify_kv_absent"):
            def fail_or_succeed(*_args: object, **_kwargs: object) -> None:
                raise RuntimeError(target)
            effects = {name: (fail_or_succeed if name == target else mock.Mock()) for name in ("kv_bulk_put", "kv_bulk_delete", "verify_kv_values", "verify_kv_absent")}
            with self.subTest(target=target), mock.patch("cron.sync_og_index_kv.commit_snapshot") as commit, \
                 mock.patch("cron.sync_og_index_kv.kv_bulk_put", effects["kv_bulk_put"]), \
                 mock.patch("cron.sync_og_index_kv.kv_bulk_delete", effects["kv_bulk_delete"]), \
                 mock.patch("cron.sync_og_index_kv.verify_kv_values", effects["verify_kv_values"]), \
                 mock.patch("cron.sync_og_index_kv.verify_kv_absent", effects["verify_kv_absent"]):
                with self.assertRaisesRegex(RuntimeError, target):
                    execute_plan(plan, kv_env=_ENV, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=False)
                commit.assert_not_called()
        with mock.patch("cron.sync_og_index_kv.commit_snapshot", side_effect=RuntimeError("commit")), \
             mock.patch("cron.sync_og_index_kv.kv_bulk_put"), mock.patch("cron.sync_og_index_kv.kv_bulk_delete"), \
             mock.patch("cron.sync_og_index_kv.verify_kv_values"), mock.patch("cron.sync_og_index_kv.verify_kv_absent"):
            with self.assertRaisesRegex(RuntimeError, "commit"):
                execute_plan(plan, kv_env=_ENV, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=False)

    def test_partial_movie_put_or_delete_batch_failure_blocks_commit(self) -> None:
        old_movies = [_movie(1), _movie(2), _movie(3), _movie(4)]
        current_movies = [_movie(1, title="changed-1"), _movie(2, title="changed-2")]
        plan = build_incremental_plan(_snapshot(old_movies), _snapshot(current_movies, version="v2"), current_movies)
        for target in ("kv_bulk_put", "kv_bulk_delete"):
            calls = 0

            def fail_second(*_args: object, **_kwargs: object) -> None:
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise RuntimeError(f"partial-{target}")

            put_effect = fail_second if target == "kv_bulk_put" else mock.Mock()
            delete_effect = fail_second if target == "kv_bulk_delete" else mock.Mock()
            with self.subTest(target=target), \
                 mock.patch("cron.sync_og_index_kv.kv_bulk_put", side_effect=put_effect), \
                 mock.patch("cron.sync_og_index_kv.kv_bulk_delete", side_effect=delete_effect), \
                 mock.patch("cron.sync_og_index_kv.verify_kv_values"), \
                 mock.patch("cron.sync_og_index_kv.verify_kv_absent"), \
                 mock.patch("cron.sync_og_index_kv.commit_snapshot") as commit:
                with self.assertRaisesRegex(RuntimeError, f"partial-{target}"):
                    execute_plan(plan, kv_env=_ENV, r2_client=object(), r2_bucket="bucket", batch_size=1, dry_run=False)
            self.assertEqual(calls, 2)
            commit.assert_not_called()

    def test_today_or_meta_failure_blocks_commit(self) -> None:
        movies = [_movie(1), _movie(2)]
        plan = build_incremental_plan(_snapshot(movies), _snapshot(movies, today_id=2, version="v2"), movies)
        for failed_key in ("today", "meta:G"):
            def put(**kwargs: object) -> None:
                key = kwargs["batch"][0]["key"]  # type: ignore[index]
                if key == failed_key:
                    raise RuntimeError(failed_key)
            with self.subTest(failed_key=failed_key), mock.patch("cron.sync_og_index_kv.commit_snapshot") as commit, mock.patch("cron.sync_og_index_kv.kv_bulk_put", side_effect=put):
                with self.assertRaisesRegex(RuntimeError, failed_key):
                    execute_plan(plan, kv_env=_ENV, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=False)
                commit.assert_not_called()


class TestRemoteAudit(unittest.TestCase):
    def test_strict_paged_audit_and_invalid_value(self) -> None:
        movie_value = json.dumps({"title": "Film", "release_date": "2000", "genres": ["Drama"], "poster_url": ""}, separators=(",", ":"))
        with mock.patch("cron.sync_og_index_kv.kv_list_movie_keys", return_value=["movie:1"]), mock.patch("cron.sync_og_index_kv.kv_read_many", side_effect=[{"movie:1": movie_value}, {"today": None, "meta:G": None}]):
            state = read_remote_audit_state(kv_env=_ENV)
        self.assertEqual(set(state.movie_hashes), {"movie:1"})
        with mock.patch("cron.sync_og_index_kv.kv_list_movie_keys", return_value=["movie:1"]), mock.patch("cron.sync_og_index_kv.kv_read_many", side_effect=[{"movie:1": "{}"}, {"today": None, "meta:G": None}]):
            with self.assertRaises(RemoteAuditError):
                read_remote_audit_state(kv_env=_ENV)

    def test_audit_rejects_duplicate_json_keys(self) -> None:
        movie_value = '{"title":"first","title":"second","release_date":"2000","genres":[],"poster_url":""}'
        with mock.patch("cron.sync_og_index_kv.kv_list_movie_keys", return_value=["movie:1"]), \
             mock.patch("cron.sync_og_index_kv.kv_read_many", return_value={"movie:1": movie_value}):
            with self.assertRaisesRegex(RemoteAuditError, "duplicate JSON key"):
                read_remote_audit_state(kv_env=_ENV)

    def test_audit_rejects_illegal_or_duplicate_movie_keys(self) -> None:
        for keys in (["movie:0"], ["movie:1", "movie:1"]):
            with self.subTest(keys=keys), mock.patch("cron.sync_og_index_kv.kv_list_movie_keys", return_value=keys):
                with self.assertRaises(RemoteAuditError):
                    read_remote_audit_state(kv_env=_ENV)


class TestApplication(unittest.TestCase):
    def _data(self) -> tempfile.TemporaryDirectory[str]:
        tmp = tempfile.TemporaryDirectory()
        path = Path(tmp.name)
        path.joinpath("galaxy_data.json").write_text(json.dumps({"meta": {"version": "v1"}, "movies": [_movie(1)]}), encoding="utf-8")
        path.joinpath("today.json").write_text(json.dumps({"date": "2026-01-01", "movie_id": 1}), encoding="utf-8")
        return tmp

    def test_missing_and_corrupt_stop_without_full(self) -> None:
        tmp = self._data()
        self.addCleanup(tmp.cleanup)
        with mock.patch("cron.sync_og_index_kv.load_snapshot", side_effect=SnapshotMissingError("missing")):
            with self.assertRaisesRegex(SnapshotMissingError, "bootstrap"):
                run_sync(public_data=Path(tmp.name), r2_client=object(), r2_bucket="b", kv_env=_ENV, dry_run=True)
        with mock.patch("cron.sync_og_index_kv.load_snapshot", side_effect=SnapshotCorruptError("bad")):
            with self.assertRaises(SnapshotCorruptError):
                run_sync(public_data=Path(tmp.name), r2_client=object(), r2_bucket="b", kv_env=_ENV, dry_run=True)

    def test_bootstrap_dry_run_only_reads(self) -> None:
        tmp = self._data()
        self.addCleanup(tmp.cleanup)
        remote = RemoteAuditState(movie_hashes={}, today_value=None, meta_g_value=None)
        with mock.patch("cron.sync_og_index_kv.load_snapshot", side_effect=SnapshotMissingError("missing")), mock.patch("cron.sync_og_index_kv.read_remote_audit_state", return_value=remote) as audit, mock.patch("cron.sync_og_index_kv.execute_plan") as execute:
            plan = run_sync(public_data=Path(tmp.name), r2_client=object(), r2_bucket="b", kv_env=_ENV, dry_run=True, bootstrap_remote_audit=True, max_puts=10)
        self.assertTrue(plan.bootstrap)
        audit.assert_called_once()
        execute.assert_not_called()

    def test_bootstrap_rejects_existing_checkpoint_without_audit_or_execution(self) -> None:
        tmp = self._data()
        self.addCleanup(tmp.cleanup)
        with mock.patch("cron.sync_og_index_kv.load_snapshot", return_value=_snapshot([_movie(1)])), \
             mock.patch("cron.sync_og_index_kv.read_remote_audit_state") as audit, \
             mock.patch("cron.sync_og_index_kv.execute_plan") as execute:
            with self.assertRaisesRegex(RuntimeError, "already exists"):
                run_sync(
                    public_data=Path(tmp.name),
                    r2_client=object(),
                    r2_bucket="b",
                    kv_env=_ENV,
                    bootstrap_remote_audit=True,
                    dry_run=True,
                )
        audit.assert_not_called()
        execute.assert_not_called()

    def test_bootstrap_audit_or_quota_failure_never_executes(self) -> None:
        tmp = self._data()
        self.addCleanup(tmp.cleanup)
        with mock.patch("cron.sync_og_index_kv.load_snapshot", side_effect=SnapshotMissingError("missing")), \
             mock.patch("cron.sync_og_index_kv.read_remote_audit_state", side_effect=RemoteAuditError("audit failed")), \
             mock.patch("cron.sync_og_index_kv.execute_plan") as execute:
            with self.assertRaisesRegex(RemoteAuditError, "audit failed"):
                run_sync(
                    public_data=Path(tmp.name),
                    r2_client=object(),
                    r2_bucket="b",
                    kv_env=_ENV,
                    bootstrap_remote_audit=True,
                )
        execute.assert_not_called()

        remote = RemoteAuditState(movie_hashes={}, today_value=None, meta_g_value=None)
        with mock.patch("cron.sync_og_index_kv.load_snapshot", side_effect=SnapshotMissingError("missing")), \
             mock.patch("cron.sync_og_index_kv.read_remote_audit_state", return_value=remote), \
             mock.patch("cron.sync_og_index_kv.execute_plan") as execute:
            with self.assertRaises(QuotaExceededError):
                run_sync(
                    public_data=Path(tmp.name),
                    r2_client=object(),
                    r2_bucket="b",
                    kv_env=_ENV,
                    bootstrap_remote_audit=True,
                    max_puts=0,
                )
        execute.assert_not_called()

    def test_application_flags_require_booleans(self) -> None:
        tmp = self._data()
        self.addCleanup(tmp.cleanup)
        with self.assertRaisesRegex(ValueError, "allow_full_recovery must be bool"):
            run_sync(
                public_data=Path(tmp.name),
                r2_client=object(),
                r2_bucket="b",
                allow_full_recovery=1,  # type: ignore[arg-type]
                dry_run=True,
            )

    def test_full_requires_explicit_authorization(self) -> None:
        tmp = self._data()
        self.addCleanup(tmp.cleanup)
        with self.assertRaises(PermissionError):
            run_sync(public_data=Path(tmp.name), r2_client=object(), r2_bucket="b", kv_env=_ENV, scope="full", dry_run=True)

    def test_full_recovery_audits_and_deletes_stale_remote_keys(self) -> None:
        tmp = self._data()
        self.addCleanup(tmp.cleanup)
        with mock.patch("cron.sync_og_index_kv.load_snapshot") as load, \
             mock.patch("cron.sync_og_index_kv.read_remote_movie_keys", return_value=("movie:2",)), \
             mock.patch("cron.sync_og_index_kv.execute_plan") as execute:
            plan = run_sync(
                public_data=Path(tmp.name),
                r2_client=object(),
                r2_bucket="b",
                kv_env=_ENV,
                scope="full",
                allow_full_recovery=True,
                dry_run=True,
            )
        self.assertEqual(plan.movie_deletes, ("movie:2",))
        self.assertEqual(plan.expected_remote_movie_keys, ("movie:1",))
        load.assert_not_called()
        execute.assert_not_called()

    def test_full_recovery_does_not_depend_on_previous_checkpoint(self) -> None:
        tmp = self._data()
        self.addCleanup(tmp.cleanup)
        with mock.patch("cron.sync_og_index_kv.load_snapshot", side_effect=SnapshotCorruptError("bad")) as load, \
             mock.patch("cron.sync_og_index_kv.read_remote_movie_keys", return_value=()):
            plan = run_sync(
                public_data=Path(tmp.name),
                r2_client=object(),
                r2_bucket="b",
                kv_env=_ENV,
                scope="full",
                allow_full_recovery=True,
                dry_run=True,
            )
        self.assertEqual(plan.expected_remote_movie_keys, ("movie:1",))
        load.assert_not_called()

    def test_cli_defaults_to_incremental_without_override_flags(self) -> None:
        with mock.patch("cron.sync_og_index_kv._required_kv_env", return_value=None), \
             mock.patch("cron.sync_og_index_kv.run_sync") as sync:
            self.assertEqual(main(["--dry-run"]), 0)
        kwargs = sync.call_args.kwargs
        self.assertEqual(kwargs["scope"], "incremental")
        self.assertTrue(kwargs["dry_run"])
        self.assertFalse(kwargs["bootstrap_remote_audit"])
        self.assertFalse(kwargs["allow_full_recovery"])
        self.assertFalse(kwargs["allow_over_quota"])

    def test_cli_returns_nonzero_for_invalid_current_export(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        with mock.patch("cron.sync_og_index_kv._required_kv_env", return_value=None), \
             mock.patch("sys.stderr", new_callable=io.StringIO) as stderr:
            result = main(["--public-data-dir", tmp.name, "--dry-run"])
        self.assertEqual(result, 2)
        self.assertIn("current OG export is invalid", stderr.getvalue())

    def test_legacy_cron_facade_preserves_skip_and_full_behavior_without_r2(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        with mock.patch("cron.sync_og_index_kv._required_kv_env", return_value=None), \
             mock.patch("cron.sync_og_index_kv.create_r2_client") as create_r2:
            self.assertIsNone(sync_og_index_after_galaxy_export(Path(tmp.name), scope="daily"))
        create_r2.assert_not_called()

        movies = [_movie(1)]
        with mock.patch("cron.sync_og_index_kv._required_kv_env", return_value=_ENV), \
             mock.patch("cron.sync_og_index_kv.load_galaxy_and_today", return_value=("v1", {"date": "2026-01-01", "movie_id": 1}, movies)), \
             mock.patch("cron.sync_og_index_kv.sync_entries_to_kv", return_value=3) as sync_entries, \
             mock.patch("cron.sync_og_index_kv.create_r2_client") as create_r2:
            self.assertTrue(sync_og_index_after_galaxy_export(Path(tmp.name), scope="full"))
        self.assertEqual(len(sync_entries.call_args.args[0]), 3)
        create_r2.assert_not_called()

        with mock.patch("cron.sync_og_index_kv._required_kv_env", return_value=_ENV), \
             mock.patch("cron.sync_og_index_kv.load_galaxy_and_today", return_value=("v1", {"date": "2026-01-01", "movie_id": 1}, movies)), \
             mock.patch("cron.sync_og_index_kv.sync_entries_to_kv", return_value=2) as sync_entries:
            self.assertTrue(sync_og_index_after_galaxy_export(Path(tmp.name), scope="daily", batch_size=7))
        self.assertEqual([key for key, _value in sync_entries.call_args.args[0]], ["meta:G", "today"])
        self.assertEqual(sync_entries.call_args.kwargs["batch_size"], 7)


if __name__ == "__main__":
    unittest.main()