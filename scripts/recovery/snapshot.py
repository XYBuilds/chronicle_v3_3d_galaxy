"""Restic acquisition commands and pre-backup hard stops."""
from __future__ import annotations

from typing import Callable, Mapping, Sequence

from recovery.policy import SNAPSHOT_TAG

Runner = Callable[[list[str], dict[str, str]], int]


class SnapshotError(ValueError):
    """Acquisition, capacity, host identity, or freeze proof failed."""


def restic_argv(action: str, *, repository: str, paths: Sequence[str] = ()) -> list[str]:
    argv = ["restic", "-r", repository, action]
    if action == "backup":
        argv.extend(["--tag", SNAPSHOT_TAG, *paths])
    elif action == "check":
        argv.append("--read-data")
    return argv


def assert_capacity(*, free_bytes: int, required_bytes: int) -> None:
    if free_bytes < required_bytes:
        raise SnapshotError("capacity shortfall rejects the snapshot")


def verify_ssh_host_identity(*, expected: str, observed: str) -> None:
    if expected != observed:
        raise SnapshotError("SSH host identity mismatch")


def assert_sources_frozen(before: Mapping[str, str], after: Mapping[str, str]) -> None:
    if dict(before) != dict(after):
        raise SnapshotError("source mutation rejects the snapshot")


def run_acquisition(
    *,
    repository: str,
    paths: Sequence[str],
    runner: Runner,
    env: Mapping[str, str],
) -> None:
    isolated = {key: value for key, value in env.items() if key not in {"RESTIC_PASSWORD", "RESTIC_PASSWORD_FILE"}}
    status = runner(restic_argv("backup", repository=repository, paths=paths), isolated)
    if status != 0:
        raise SnapshotError("incomplete backup rejects the snapshot")
