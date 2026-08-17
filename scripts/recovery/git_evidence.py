"""Git-store pairing and integrity evidence without classifying object contents."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Sequence

from recovery.policy import SOURCE_ROOTS

GitRunner = Callable[[Sequence[str], Path], tuple[int, str]]


class GitEvidenceError(ValueError):
    """A worktree could not be paired with its physical Git store."""


@dataclass(frozen=True)
class GitEvidence:
    label: str
    paired_gitdir_label: str | None
    head_object: str
    fsck_ok: bool
    ref_count: int
    stash_count: int


def _paired_label(label: str) -> str | None:
    for root in SOURCE_ROOTS:
        if root.label == label:
            return root.pairs_with
    return None


def _run(runner: GitRunner, args: Sequence[str], gitdir: Path) -> str:
    code, output = runner(tuple(args), gitdir)
    if code != 0:
        raise GitEvidenceError(f"git {' '.join(args)} failed")
    return output


def collect_git_evidence(
    *,
    label: str,
    worktree: Path,
    expected_gitdir: Path | None = None,
    runner: GitRunner,
) -> GitEvidence:
    if expected_gitdir is None or not expected_gitdir.exists():
        raise GitEvidenceError("unresolved external Git store")
    del worktree  # pairing uses the expected store, not a restored Windows .git pointer
    head_object = _run(runner, ("rev-parse", "--verify", "HEAD"), expected_gitdir).strip()
    _run(runner, ("fsck", "--full", "--strict"), expected_gitdir)
    refs = _run(runner, ("for-each-ref", "--format=%(objectname) %(refname)"), expected_gitdir)
    stash = _run(runner, ("stash", "list"), expected_gitdir)
    return GitEvidence(
        label=label,
        paired_gitdir_label=_paired_label(label),
        head_object=head_object,
        fsck_ok=True,
        ref_count=len([line for line in refs.splitlines() if line.strip()]),
        stash_count=len([line for line in stash.splitlines() if line.strip()]),
    )
