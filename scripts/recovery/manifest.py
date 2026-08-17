"""Encrypted source-manifest construction and fail-closed restore comparison."""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Mapping, Sequence

from recovery.policy import is_excluded

ReadFile = Callable[[Path, str], bytes]


class ManifestError(ValueError):
    """A source root could not be fully inventoried."""


@dataclass(frozen=True)
class ManifestEntry:
    label: str
    relative_path: str
    entry_type: str
    size: int | None
    sha256: str | None
    symlink_target: str | None = None


@dataclass(frozen=True)
class SourceManifest:
    entries: tuple[ManifestEntry, ...]


@dataclass(frozen=True)
class CompareResult:
    ok: bool
    differences: tuple[str, ...]


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _as_entry(item: ManifestEntry | Mapping[str, object]) -> ManifestEntry:
    if isinstance(item, ManifestEntry):
        return item
    return ManifestEntry(
        label=str(item["label"]),
        relative_path=str(item["relative_path"]),
        entry_type=str(item["entry_type"]),
        size=item["size"] if item["size"] is None else int(item["size"]),  # type: ignore[arg-type]
        sha256=None if item["sha256"] is None else str(item["sha256"]),
        symlink_target=None if item["symlink_target"] is None else str(item["symlink_target"]),
    )


def _relative_posix(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def _read_bytes(path: Path, relative_path: str) -> bytes:
    del relative_path
    return path.read_bytes()


def build_source_manifest(
    roots: Mapping[str, Path],
    *,
    require_labels: Sequence[str] | None = None,
    read_file: ReadFile | None = None,
    is_symlink: Callable[[Path], bool] | None = None,
    read_symlink: Callable[[Path], str] | None = None,
) -> SourceManifest:
    required = tuple(require_labels) if require_labels is not None else tuple(roots)
    missing = [label for label in required if label not in roots or not Path(roots[label]).exists()]
    if missing:
        joined = ", ".join(missing)
        if require_labels is not None and set(missing) != set(required):
            raise ManifestError(f"joint snapshot rejected; missing source root: {joined}")
        raise ManifestError(f"missing source root: {joined}")

    reader = read_file or _read_bytes
    is_link = is_symlink or (lambda path: path.is_symlink())
    read_link = read_symlink or (lambda path: os.readlink(path))
    entries: list[ManifestEntry] = []
    for label in required:
        root = Path(roots[label])
        for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
            current = Path(dirpath)
            relative_dir = "" if current == root else _relative_posix(root, current)
            if relative_dir and is_excluded(label, relative_dir):
                dirnames[:] = []
                continue
            kept_dirs: list[str] = []
            for name in dirnames:
                child = f"{relative_dir}/{name}" if relative_dir else name
                if is_excluded(label, child):
                    continue
                kept_dirs.append(name)
                child_path = current / name
                if is_link(child_path):
                    entries.append(
                        ManifestEntry(
                            label=label,
                            relative_path=child,
                            entry_type="symlink",
                            size=None,
                            sha256=None,
                            symlink_target=read_link(child_path),
                        )
                    )
                else:
                    entries.append(
                        ManifestEntry(
                            label=label,
                            relative_path=child,
                            entry_type="directory",
                            size=None,
                            sha256=None,
                        )
                    )
            dirnames[:] = kept_dirs
            for name in filenames:
                relative_path = f"{relative_dir}/{name}" if relative_dir else name
                if is_excluded(label, relative_path):
                    continue
                path = current / name
                try:
                    if is_link(path):
                        entries.append(
                            ManifestEntry(
                                label=label,
                                relative_path=relative_path,
                                entry_type="symlink",
                                size=None,
                                sha256=None,
                                symlink_target=read_link(path),
                            )
                        )
                        continue
                    payload = reader(path, relative_path)
                except OSError as exc:
                    raise ManifestError(f"unreadable source {label}:{relative_path}") from exc
                entries.append(
                    ManifestEntry(
                        label=label,
                        relative_path=relative_path,
                        entry_type="file",
                        size=len(payload),
                        sha256=sha256_bytes(payload),
                    )
                )
    entries.sort(key=lambda item: (item.label, item.relative_path))
    return SourceManifest(entries=tuple(entries))


def compare_manifests(
    acquired: Iterable[ManifestEntry | Mapping[str, object]],
    restored: Iterable[ManifestEntry | Mapping[str, object]],
) -> CompareResult:
    left = {_entry_key(item): _as_entry(item) for item in acquired}
    right = {_entry_key(item): _as_entry(item) for item in restored}
    differences: list[str] = []
    for key in sorted(set(left) | set(right)):
        if key not in right:
            differences.append(f"missing {key[0]}:{key[1]}")
            continue
        if key not in left:
            differences.append(f"extra {key[0]}:{key[1]}")
            continue
        before = left[key]
        after = right[key]
        if before.entry_type != after.entry_type:
            differences.append(f"type-changed {key[0]}:{key[1]}")
        elif before.entry_type == "symlink" and before.symlink_target != after.symlink_target:
            differences.append(f"link-changed {key[0]}:{key[1]}")
        elif before.size != after.size:
            differences.append(f"size-changed {key[0]}:{key[1]}")
        elif before.sha256 != after.sha256:
            differences.append(f"content-changed {key[0]}:{key[1]}")
    return CompareResult(ok=not differences, differences=tuple(differences))


def _entry_key(item: ManifestEntry | Mapping[str, object]) -> tuple[str, str]:
    entry = _as_entry(item)
    return (entry.label, entry.relative_path)
