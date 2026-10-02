"""P0 common protection policy: source roots, exclusions, and restic pin."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

SNAPSHOT_TAG = "github-account-outage-pre-migration"
EXCLUSION_POLICY_ID = "tmc-p0-exclusion-v1"


class ExclusionError(ValueError):
    """An operator tried to change the fixed exclusion policy."""


@dataclass(frozen=True)
class SourceRoot:
    label: str
    kind: str
    windows_path: str
    pairs_with: str | None = None


@dataclass(frozen=True)
class ResticAsset:
    filename: str
    sha256: str


@dataclass(frozen=True)
class ResticPin:
    version: str
    snapshot_tag: str
    assets: Mapping[str, ResticAsset]


SOURCE_ROOTS: tuple[SourceRoot, ...] = (
    SourceRoot("chronicle", "worktree", r"E:\projects\chronicle_v3_3d_galaxy"),
    SourceRoot("og-worker", "worktree", r"E:\projects\themoviecosmos-og-worker"),
    SourceRoot(
        "daily-worktree",
        "worktree",
        r"T:\themoviecosmos-daily-stargazing",
        pairs_with="daily-gitdir",
    ),
    SourceRoot(
        "daily-gitdir",
        "gitdir",
        r"C:\Users\pexy9\.git-dirs\themoviecosmos-daily-stargazing",
        pairs_with="daily-worktree",
    ),
)

RESTIC_PIN = ResticPin(
    version="0.19.1",
    snapshot_tag=SNAPSHOT_TAG,
    assets={
        "windows_amd64": ResticAsset(
            "restic_0.19.1_windows_amd64.zip",
            "da948ad707ed690426473aaba2046cd61f8f90f6f0e7dab6be0d5796531de67d",
        ),
        "darwin_arm64": ResticAsset(
            "restic_0.19.1_darwin_arm64.bz2",
            "7be0a144ccc377880f294204aa271d76e4b79554b42a751151d425ce6ebac143",
        ),
        "darwin_amd64": ResticAsset(
            "restic_0.19.1_darwin_amd64.bz2",
            "c38d579622cf602f665234c5a8c315030b6cf70656028fe6dc29a786b60e5f35",
        ),
    },
)

_EXCLUDED_DIRECTORY_NAMES = frozenset(
    {
        "node_modules",
        ".venv",
        "venv",
        "__pycache__",
        ".pytest_cache",
        ".vite",
    }
)
_EXCLUDED_SUFFIXES = (".pyc", ".pyo")
_CHRONICLE_PREFIXES = ("frontend/dist/", "frontend/storybook-static/")
_OG_WORKER_PREFIXES = ("dist/",)


class ExclusionPolicy:
    def __init__(self, extra: Sequence[str] | None = None) -> None:
        if extra:
            raise ExclusionError("exclusion policy is fixed; operator additions are rejected")


def is_excluded(root_label: str, relative_path: str) -> bool:
    normalized = relative_path.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    parts = [part for part in normalized.split("/") if part not in ("", ".")]
    if any(part in _EXCLUDED_DIRECTORY_NAMES for part in parts):
        return True
    if any(normalized.endswith(suffix) for suffix in _EXCLUDED_SUFFIXES):
        return True
    if root_label == "chronicle" and any(normalized.startswith(prefix) for prefix in _CHRONICLE_PREFIXES):
        return True
    if root_label == "og-worker" and any(normalized.startswith(prefix) for prefix in _OG_WORKER_PREFIXES):
        return True
    return False
