"""Regression coverage for fail-closed OG-index v2 synchronization.

All side-effect boundaries are mocked; these tests perform no Cloudflare or R2 I/O.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cron.og_index_snapshot_r2 import SnapshotCorruptError, SnapshotMissingError
from cron.og_index_state import build_snapshot
from cron.sync_og_index_kv import (
    CredentialsError,
    MutationPlan,
    QuotaExceededError,
    RemoteAuditError,
    build_full_recovery_plan,
    build_incremental_plan,
    build_migration_plan,
    enforce_quota,
    execute_plan,
    run_sync,
)

ENV = {
    "CLOUDFLARE_ACCOUNT_ID": "account",
    "OG_INDEX_KV_NAMESPACE_ID": "namespace",
    "CLOUDFLARE_API_TOKEN": "token",
}


def movie(movie_id: int, **changes: object) -> dict[str, object]:
    result: dict[str, object] = {
        "id": movie_id,
        "title": f"Film {movie_id}",
        "release_date": "2000-01-01",
        "genres": ["Drama"],
        "poster_url": f"https://example.test/{movie_id}.jpg",
    }
    result.update(changes)
    return result


def v2(movies: list[dict[str, object]], version: str = "version") -> dict[str, object]:
    return build_snapshot(
        source_data_version=version,
        committed_at="2026-01-01T00:00:00Z",
        movies=movies,
    )


def v1(movies: list[dict[str, object]], version: str = "version") -> dict[str, object]:
    snapshot = v2(movies, version)
    snapshot["schema_version"] = 1
    snapshot["projection_version"] = "og-index-v1"
    snapshot["control"] = {
        "today_value": '{"date":"2026-01-01","movie_id":1}',
        "meta_g_value": version,
    }
    return snapshot


class TestMutationPlans(unittest.TestCase):
    def test_incremental_noop_and_delta_are_today_free(self) -> None:
        old = v2([movie(1), movie(2)])
        noop = build_incremental_plan(old, v2([movie(1), movie(2)]), [movie(1), movie(2)])
        self.assertEqual(noop.movie_puts, ())
        self.assertEqual(noop.movie_deletes, ())
        self.assertIsNone(noop.meta_put)
        self.assertFalse(noop.migration)

        delta = build_incremental_plan(
            old,
            v2([movie(1, title="Changed"), movie(3)], "next"),
            [movie(1, title="Changed"), movie(3)],
        )
        self.assertEqual([key for key, _ in delta.movie_puts], ["movie:1", "movie:3"])
        self.assertEqual(delta.movie_deletes, ("movie:2",))
        self.assertEqual(delta.meta_put, "next")
        self.assertNotIn("today", repr(delta).lower())

    def test_migration_counts_today_delete_in_summary_and_quota(self) -> None:
        plan = build_migration_plan(v1([movie(1), movie(2)]), v2([movie(1)]), [movie(1)])
        summary = plan.summary(batch_size=1, dry_run=True)
        self.assertTrue(plan.migration)
        self.assertEqual(summary["movie_delete"], 1)
        self.assertEqual(summary["today_delete"], 1)
        self.assertEqual(summary["total_delete"], 2)
        self.assertEqual(summary["movie_delete_batches"], 1)
        self.assertEqual(summary["today_delete_batches"], 1)
        self.assertEqual(summary["total_delete_batches"], 2)
        enforce_quota(plan, max_puts=1, max_deletes=2)
        with self.assertRaises(QuotaExceededError):
            enforce_quota(plan, max_puts=1, max_deletes=1)

    def test_full_recovery_uses_remote_count_and_complete_keyset(self) -> None:
        plan = build_full_recovery_plan(
            v2([movie(1), movie(2)]),
            [movie(1), movie(2)],
            ("movie:1", "movie:3", "movie:4"),
        )
        self.assertEqual(plan.previous_count, 3)
        self.assertEqual([key for key, _ in plan.movie_puts], ["movie:1", "movie:2"])
        self.assertEqual(plan.movie_deletes, ("movie:3", "movie:4"))
        self.assertEqual(plan.expected_remote_movie_keys, ("movie:1", "movie:2"))

    def test_plan_is_deeply_immutable_and_rejects_inconsistent_shapes(self) -> None:
        source = v2([movie(1)])
        plan = build_full_recovery_plan(source, [movie(1)], ())
        source["movie_count"] = 9
        self.assertEqual(plan.current_snapshot["movie_count"], 1)
        with self.assertRaises(TypeError):
            plan.current_snapshot["movie_count"] = 9  # type: ignore[index]
        with self.assertRaises(AssertionError):
            MutationPlan(
                current_snapshot=v2([movie(1)]),
                movie_puts=(),
                movie_deletes=(),
                meta_put="version",
                unchanged_count=0,
                previous_count=0,
            )
        with self.assertRaises(AssertionError):
            MutationPlan(
                current_snapshot=v2([movie(1)]),
                movie_puts=(("movie:1", "not-json"),),
                movie_deletes=(),
                meta_put="version",
                unchanged_count=0,
                previous_count=1,
            )

    def test_invalid_quota_and_batch_inputs_fail_before_effects(self) -> None:
        plan = build_full_recovery_plan(v2([movie(1)]), [movie(1)], ())
        for kwargs in (
            {"max_puts": True},
            {"max_deletes": -1},
            {"allow_over_quota": 1},
            {"batch_size": 0},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                enforce_quota(plan, **kwargs)  # type: ignore[arg-type]


class TestExecutionOrder(unittest.TestCase):
    def migration_plan(self) -> MutationPlan:
        return build_migration_plan(
            v1([movie(1), movie(2), movie(3)]),
            v2([movie(1, title="Changed")], "next"),
            [movie(1, title="Changed")],
        )

    def test_scheduled_v2_executes_movie_delta_and_meta_without_touching_today(self) -> None:
        previous = v2([movie(1), movie(2)])
        current_movies = [movie(1, title="Changed"), movie(3)]
        plan = build_incremental_plan(previous, v2(current_movies, "next"), current_movies)
        events: list[str] = []

        with (
            mock.patch(
                "cron.sync_og_index_kv.kv_bulk_put",
                side_effect=lambda **kw: events.append(
                    "put:" + ",".join(item["key"] for item in kw["batch"])
                ),
            ),
            mock.patch(
                "cron.sync_og_index_kv.kv_bulk_delete",
                side_effect=lambda **kw: events.append("delete:" + ",".join(kw["keys"])),
            ),
            mock.patch(
                "cron.sync_og_index_kv.verify_kv_values",
                side_effect=lambda **kw: events.append(
                    "verify-values:" + ",".join(kw["expected"])
                ),
            ),
            mock.patch(
                "cron.sync_og_index_kv.verify_kv_absent",
                side_effect=lambda **kw: events.append(
                    "verify-absent:" + ",".join(kw["keys"])
                ),
            ),
            mock.patch(
                "cron.sync_og_index_kv.commit_snapshot",
                side_effect=lambda **kw: events.append("commit"),
            ),
        ):
            execute_plan(plan, kv_env=ENV, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=False)

        self.assertEqual(
            events,
            [
                "put:movie:1,movie:3",
                "delete:movie:2",
                "verify-values:movie:1,movie:3",
                "verify-absent:movie:2",
                "put:meta:G",
                "verify-values:meta:G",
                "commit",
            ],
        )
        self.assertFalse(any("today" in event for event in events))

        calls: list[str] = []
        with (
            mock.patch(
                "cron.sync_og_index_kv.kv_bulk_put",
                side_effect=lambda **kw: calls.append(
                    "put:" + ",".join(item["key"] for item in kw["batch"])
                ),
            ),
            mock.patch(
                "cron.sync_og_index_kv.kv_bulk_delete",
                side_effect=lambda **kw: calls.append("delete:" + ",".join(kw["keys"])),
            ),
            mock.patch(
                "cron.sync_og_index_kv.verify_kv_values",
                side_effect=lambda **kw: calls.append(
                    "verify-values:" + ",".join(kw["expected"])
                ),
            ),
            mock.patch(
                "cron.sync_og_index_kv.verify_kv_absent",
                side_effect=lambda **kw: calls.append(
                    "verify-absent:" + ",".join(kw["keys"])
                ),
            ),
            mock.patch(
                "cron.sync_og_index_kv.commit_snapshot",
                side_effect=lambda **kw: calls.append("commit"),
            ),
        ):
            execute_plan(self.migration_plan(), kv_env=ENV, r2_client=object(), r2_bucket="bucket", batch_size=1, dry_run=False)
        self.assertEqual(
            calls,
            [
                "put:movie:1",
                "delete:movie:2",
                "delete:movie:3",
                "verify-values:movie:1",
                "verify-absent:movie:2,movie:3",
                "delete:today",
                "verify-absent:today",
                "put:meta:G",
                "verify-values:meta:G",
                "commit",
            ],
        )

    def test_every_failure_short_circuits_checkpoint_and_later_steps(self) -> None:
        plan = self.migration_plan()
        cases = (
            (
                "movie-put",
                "kv_bulk_put",
                lambda kw: kw["batch"][0]["key"] == "movie:1",
                ["put:movie:1"],
            ),
            (
                "movie-delete",
                "kv_bulk_delete",
                lambda kw: "movie:2" in kw["keys"],
                ["put:movie:1", "delete:movie:2,movie:3"],
            ),
            (
                "movie-verify",
                "verify_kv_values",
                lambda kw: "movie:1" in kw["expected"],
                [
                    "put:movie:1",
                    "delete:movie:2,movie:3",
                    "verify-values:movie:1",
                ],
            ),
            (
                "today-delete",
                "kv_bulk_delete",
                lambda kw: kw["keys"] == ["today"],
                [
                    "put:movie:1",
                    "delete:movie:2,movie:3",
                    "verify-values:movie:1",
                    "verify-absent:movie:2,movie:3",
                    "delete:today",
                ],
            ),
            (
                "today-verify",
                "verify_kv_absent",
                lambda kw: kw["keys"] == ["today"],
                [
                    "put:movie:1",
                    "delete:movie:2,movie:3",
                    "verify-values:movie:1",
                    "verify-absent:movie:2,movie:3",
                    "delete:today",
                    "verify-absent:today",
                ],
            ),
            (
                "meta-put",
                "kv_bulk_put",
                lambda kw: kw["batch"][0]["key"] == "meta:G",
                [
                    "put:movie:1",
                    "delete:movie:2,movie:3",
                    "verify-values:movie:1",
                    "verify-absent:movie:2,movie:3",
                    "delete:today",
                    "verify-absent:today",
                    "put:meta:G",
                ],
            ),
            (
                "meta-verify",
                "verify_kv_values",
                lambda kw: "meta:G" in kw["expected"],
                [
                    "put:movie:1",
                    "delete:movie:2,movie:3",
                    "verify-values:movie:1",
                    "verify-absent:movie:2,movie:3",
                    "delete:today",
                    "verify-absent:today",
                    "put:meta:G",
                    "verify-values:meta:G",
                ],
            ),
        )
        for label, target, predicate, expected_events in cases:
            events: list[str] = []

            def record(name: str, kwargs: dict[str, object]) -> str:
                if name == "kv_bulk_put":
                    return "put:" + ",".join(item["key"] for item in kwargs["batch"])  # type: ignore[index]
                if name == "kv_bulk_delete":
                    return "delete:" + ",".join(kwargs["keys"])  # type: ignore[index]
                if name == "verify_kv_values":
                    return "verify-values:" + ",".join(kwargs["expected"])  # type: ignore[index]
                return "verify-absent:" + ",".join(kwargs["keys"])  # type: ignore[index]

            def side_effect_for(name: str):
                def side_effect(**kwargs: object) -> None:
                    events.append(record(name, kwargs))
                    if name == target and predicate(kwargs):
                        raise RuntimeError(label)

                return side_effect

            with self.subTest(label=label), ExitStack() as stack:
                for name in ("kv_bulk_put", "kv_bulk_delete", "verify_kv_values", "verify_kv_absent"):
                    stack.enter_context(
                        mock.patch(
                            f"cron.sync_og_index_kv.{name}",
                            side_effect=side_effect_for(name),
                        )
                    )
                commit = stack.enter_context(
                    mock.patch(
                        "cron.sync_og_index_kv.commit_snapshot",
                        side_effect=lambda **kw: events.append("commit"),
                    )
                )
                with self.assertRaisesRegex(RuntimeError, label):
                    execute_plan(plan, kv_env=ENV, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=False)

            self.assertEqual(events, expected_events)
            commit.assert_not_called()

    def test_full_recovery_final_keyset_is_checked_before_commit(self) -> None:
        plan = build_full_recovery_plan(v2([movie(1)]), [movie(1)], ("movie:2",))
        with (
            mock.patch("cron.sync_og_index_kv.kv_bulk_put"),
            mock.patch("cron.sync_og_index_kv.kv_bulk_delete"),
            mock.patch("cron.sync_og_index_kv.verify_kv_values"),
            mock.patch("cron.sync_og_index_kv.verify_kv_absent"),
            mock.patch("cron.sync_og_index_kv.read_remote_movie_keys", return_value=("movie:1", "movie:9")),
            mock.patch("cron.sync_og_index_kv.commit_snapshot") as commit,
        ):
            with self.assertRaises(RemoteAuditError):
                execute_plan(plan, kv_env=ENV, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=False)
        commit.assert_not_called()

    def test_full_recovery_matching_final_keyset_commits(self) -> None:
        plan = build_full_recovery_plan(v2([movie(1)]), [movie(1)], ("movie:2",))
        events: list[str] = []
        with (
            mock.patch("cron.sync_og_index_kv.kv_bulk_put"),
            mock.patch("cron.sync_og_index_kv.kv_bulk_delete"),
            mock.patch("cron.sync_og_index_kv.verify_kv_values"),
            mock.patch("cron.sync_og_index_kv.verify_kv_absent"),
            mock.patch(
                "cron.sync_og_index_kv.read_remote_movie_keys",
                side_effect=lambda **kw: events.append("final-keyset") or ("movie:1",),
            ),
            mock.patch(
                "cron.sync_og_index_kv.commit_snapshot",
                side_effect=lambda **kw: events.append("commit"),
            ),
        ):
            execute_plan(plan, kv_env=ENV, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=False)
        self.assertEqual(events, ["final-keyset", "commit"])

    def test_dry_run_and_bad_credentials_have_no_effects(self) -> None:
        plan = build_full_recovery_plan(v2([movie(1)]), [movie(1)], ())
        names = ("kv_bulk_put", "kv_bulk_delete", "verify_kv_values", "verify_kv_absent", "commit_snapshot")
        with ExitStack() as stack:
            boundaries = [stack.enter_context(mock.patch(f"cron.sync_og_index_kv.{name}")) for name in names]
            execute_plan(plan, kv_env={}, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=True)
        for boundary in boundaries:
            boundary.assert_not_called()
        with mock.patch("cron.sync_og_index_kv.kv_bulk_put") as put:
            with self.assertRaises(CredentialsError):
                execute_plan(plan, kv_env={}, r2_client=object(), r2_bucket="bucket", batch_size=10, dry_run=False)
        put.assert_not_called()

    def test_execute_plan_rejects_non_boolean_dry_run_before_effects(self) -> None:
        plan = build_full_recovery_plan(v2([movie(1)]), [movie(1)], ())
        with mock.patch("cron.sync_og_index_kv.kv_bulk_put") as put:
            with self.assertRaisesRegex(ValueError, "dry_run must be bool"):
                execute_plan(
                    plan,
                    kv_env=ENV,
                    r2_client=object(),
                    r2_bucket="bucket",
                    batch_size=10,
                    dry_run=1,  # type: ignore[arg-type]
                )
        put.assert_not_called()


class TestApplicationBoundary(unittest.TestCase):
    def data_dir(self) -> tempfile.TemporaryDirectory[str]:
        temporary = tempfile.TemporaryDirectory()
        Path(temporary.name, "galaxy_data.json").write_text(
            json.dumps({"meta": {"version": "version"}, "movies": [movie(1)]}),
            encoding="utf-8",
        )
        return temporary

    def test_normal_path_never_reads_v1_or_today_and_missing_v2_fails_closed(self) -> None:
        temporary = self.data_dir()
        self.addCleanup(temporary.cleanup)
        with (
            mock.patch("cron.sync_og_index_kv.load_snapshot", side_effect=SnapshotMissingError("missing")),
            mock.patch("cron.sync_og_index_kv.load_v1_snapshot_for_migration") as legacy,
        ):
            with self.assertRaisesRegex(SnapshotMissingError, "--migrate-v1"):
                run_sync(public_data=Path(temporary.name), r2_client=object(), r2_bucket="bucket", kv_env=ENV, dry_run=True)
        legacy.assert_not_called()

    def test_corrupt_v2_fails_closed_without_v1_fallback(self) -> None:
        temporary = self.data_dir()
        self.addCleanup(temporary.cleanup)
        with (
            mock.patch("cron.sync_og_index_kv.load_snapshot", side_effect=SnapshotCorruptError("bad")),
            mock.patch("cron.sync_og_index_kv.load_v1_snapshot_for_migration") as legacy,
        ):
            with self.assertRaises(SnapshotCorruptError):
                run_sync(public_data=Path(temporary.name), r2_client=object(), r2_bucket="bucket", kv_env=ENV, dry_run=True)
        legacy.assert_not_called()

    def test_migration_only_reads_v1_when_v2_missing_and_rejects_repeat(self) -> None:
        temporary = self.data_dir()
        self.addCleanup(temporary.cleanup)
        with (
            mock.patch("cron.sync_og_index_kv.load_snapshot", side_effect=SnapshotMissingError("missing")),
            mock.patch("cron.sync_og_index_kv.load_v1_snapshot_for_migration", return_value=v1([movie(1)])) as legacy,
        ):
            plan = run_sync(public_data=Path(temporary.name), r2_client=object(), r2_bucket="bucket", kv_env=ENV, dry_run=True, migrate_v1=True)
        self.assertTrue(plan.migration)
        legacy.assert_called_once()
        with (
            mock.patch("cron.sync_og_index_kv.load_snapshot", return_value=v2([movie(1)])),
            mock.patch("cron.sync_og_index_kv.load_v1_snapshot_for_migration") as legacy,
        ):
            with self.assertRaisesRegex(RuntimeError, "already exists"):
                run_sync(public_data=Path(temporary.name), r2_client=object(), r2_bucket="bucket", kv_env=ENV, dry_run=True, migrate_v1=True)
        legacy.assert_not_called()

    def test_failed_migration_commit_replays_same_v1_after_v2_remains_missing(self) -> None:
        temporary = self.data_dir()
        self.addCleanup(temporary.cleanup)
        Path(temporary.name, "galaxy_data.json").write_text(
            json.dumps({"meta": {"version": "next"}, "movies": [movie(1, title="Changed")]}),
            encoding="utf-8",
        )
        legacy_snapshot = v1([movie(1), movie(2)])
        r2_client = mock.Mock()
        expected_d5_prefix = [
            "put:movie:1",
            "delete:movie:2",
            "verify-values:movie:1",
            "verify-absent:movie:2",
            "delete:today",
            "verify-absent:today",
            "put:meta:G",
            "verify-values:meta:G",
        ]

        def record_boundaries(events: list[str]) -> ExitStack:
            stack = ExitStack()
            stack.enter_context(
                mock.patch(
                    "cron.sync_og_index_kv.kv_bulk_put",
                    side_effect=lambda **kw: events.append(
                        "put:" + ",".join(item["key"] for item in kw["batch"])
                    ),
                )
            )
            stack.enter_context(
                mock.patch(
                    "cron.sync_og_index_kv.kv_bulk_delete",
                    side_effect=lambda **kw: events.append("delete:" + ",".join(kw["keys"])),
                )
            )
            stack.enter_context(
                mock.patch(
                    "cron.sync_og_index_kv.verify_kv_values",
                    side_effect=lambda **kw: events.append(
                        "verify-values:" + ",".join(kw["expected"])
                    ),
                )
            )
            stack.enter_context(
                mock.patch(
                    "cron.sync_og_index_kv.verify_kv_absent",
                    side_effect=lambda **kw: events.append(
                        "verify-absent:" + ",".join(kw["keys"])
                    ),
                )
            )
            return stack

        failed_events: list[str] = []
        with record_boundaries(failed_events) as stack:
            stack.enter_context(
                mock.patch("cron.sync_og_index_kv.load_snapshot", side_effect=SnapshotMissingError("missing"))
            )
            legacy = stack.enter_context(
                mock.patch(
                    "cron.sync_og_index_kv.load_v1_snapshot_for_migration",
                    return_value=legacy_snapshot,
                )
            )
            stack.enter_context(
                mock.patch(
                    "cron.sync_og_index_kv.commit_snapshot",
                    side_effect=RuntimeError("commit failure"),
                )
            )
            with self.assertRaisesRegex(RuntimeError, "commit failure"):
                run_sync(
                    public_data=Path(temporary.name),
                    r2_client=r2_client,
                    r2_bucket="bucket",
                    kv_env=ENV,
                    dry_run=False,
                    migrate_v1=True,
                )
        self.assertEqual(failed_events, expected_d5_prefix)
        legacy.assert_called_once()
        self.assertEqual(r2_client.mock_calls, [])

        replay_events: list[str] = []
        with record_boundaries(replay_events) as stack:
            stack.enter_context(
                mock.patch("cron.sync_og_index_kv.load_snapshot", side_effect=SnapshotMissingError("still missing"))
            )
            legacy = stack.enter_context(
                mock.patch(
                    "cron.sync_og_index_kv.load_v1_snapshot_for_migration",
                    return_value=legacy_snapshot,
                )
            )
            commit = stack.enter_context(
                mock.patch(
                    "cron.sync_og_index_kv.commit_snapshot",
                    side_effect=lambda **kw: replay_events.append("commit-v2"),
                )
            )
            plan = run_sync(
                public_data=Path(temporary.name),
                r2_client=r2_client,
                r2_bucket="bucket",
                kv_env=ENV,
                dry_run=False,
                migrate_v1=True,
            )
        self.assertTrue(plan.migration)
        self.assertEqual(replay_events, expected_d5_prefix + ["commit-v2"])
        legacy.assert_called_once()
        commit.assert_called_once()
        self.assertEqual(r2_client.mock_calls, [])

    def test_full_recovery_requires_explicit_authorization_and_reports_remote_previous_count(self) -> None:
        temporary = self.data_dir()
        self.addCleanup(temporary.cleanup)
        with self.assertRaises(PermissionError):
            run_sync(public_data=Path(temporary.name), r2_client=object(), r2_bucket="bucket", kv_env=ENV, scope="full", dry_run=True)
        with mock.patch("cron.sync_og_index_kv.read_remote_movie_keys", return_value=("movie:2", "movie:3")):
            plan = run_sync(public_data=Path(temporary.name), r2_client=object(), r2_bucket="bucket", kv_env=ENV, scope="full", allow_full_recovery=True, dry_run=True)
        self.assertEqual(plan.previous_count, 2)


if __name__ == "__main__":
    unittest.main()
