"""Normalized portable Issue export, relationship check, freeze, and local render."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Mapping

_PORTABLE_RE = re.compile(r"tmc:[a-z0-9-]+:[0-9A-HJKMNP-TV-Z]{26}")
_PORTABLE_EXACT = re.compile(r"^tmc:[a-z0-9-]+:[0-9A-HJKMNP-TV-Z]{26}$")
_HEADING_RE = re.compile(r"^#\s+(.+)$", re.MULTILINE)
_FRONT_ID_RE = re.compile(r"^id:\s*(\S+)\s*$", re.MULTILINE)
_FRONT_PORTABLE_RE = re.compile(r"^portable_id:\s*(\S+)\s*$", re.MULTILINE)
_FRONT_TITLE_RE = re.compile(r"^title:\s*(.+)$", re.MULTILINE)
_FRONT_STATUS_RE = re.compile(r"^status:\s*(\S+)\s*$", re.MULTILINE)
_BODY_ID_RE = re.compile(r"\*\*Portable ID:\*\*\s*`([^`]+)`")
_BODY_STATUS_RE = re.compile(r"\*\*Status:\*\*\s*(\S+)")
_PARENT_LINE_RE = re.compile(r"^\*\*Parent:\*\*\s*(.+)$", re.MULTILINE)
_BLOCKED_LINE_RE = re.compile(r"^\*\*Blocked by:\*\*\s*(.+)$", re.MULTILINE)
_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_COMMENT_RE = re.compile(r"^###\s+(\d{4}-\d{2}-\d{2})\s+[—-]\s+(.+)$", re.MULTILINE)


class TrackerError(ValueError):
    """The tracker export, import, or freeze transition is invalid."""


def _split_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        return "", text
    end = text.find("\n---\n", 4)
    if end < 0:
        return "", text
    return text[4:end], text[end + 5 :]


_FRONT_PARENT_RE = re.compile(r"^parent:\s*(\S+)\s*$", re.MULTILINE)


def _yaml_list(front: str, key: str) -> list[str]:
    values: list[str] = []
    in_list = False
    for line in front.splitlines():
        if line.startswith(f"{key}:"):
            in_list = True
            rest = line.split(":", 1)[1].strip()
            if rest:
                values.append(rest)
            continue
        if in_list:
            stripped = line.strip()
            if stripped.startswith("- "):
                values.append(stripped[2:].strip())
                continue
            if line.startswith(" ") or line.startswith("\t"):
                continue
            in_list = False
    return values


def _portable_id(front: str, body: str, *, alias_map: Mapping[str, str], filename: str) -> str:
    body_match = _BODY_ID_RE.search(body)
    if body_match and _PORTABLE_EXACT.match(body_match.group(1)):
        return body_match.group(1)
    front_portable = _FRONT_PORTABLE_RE.search(front)
    if front_portable and _PORTABLE_EXACT.match(front_portable.group(1)):
        return front_portable.group(1)
    front_match = _FRONT_ID_RE.search(front)
    if front_match and _PORTABLE_EXACT.match(front_match.group(1)):
        return front_match.group(1)
    mapped = alias_map.get(filename)
    if mapped and _PORTABLE_EXACT.match(mapped):
        return mapped
    raise TrackerError("portable identity is required")


def _title(front: str, body: str) -> str:
    front_match = _FRONT_TITLE_RE.search(front)
    if front_match:
        return front_match.group(1).strip()
    heading = _HEADING_RE.search(body)
    if heading:
        return heading.group(1).strip()
    raise TrackerError("Issue title is required")


def _state(front: str, body: str) -> str:
    front_match = _FRONT_STATUS_RE.search(front)
    if front_match:
        return front_match.group(1).strip()
    body_match = _BODY_STATUS_RE.search(body)
    if body_match:
        return body_match.group(1).strip()
    return "open"


def _parse_issue(
    path: Path,
    cache: dict[Path, dict[str, Any]],
    alias_map: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    resolved = path.resolve()
    if resolved in cache:
        return cache[resolved]
    aliases = dict(alias_map or {})
    text = resolved.read_text(encoding="utf-8")
    front, body = _split_frontmatter(text)
    portable_id = _portable_id(front, body, alias_map=aliases, filename=resolved.name)
    local_id_match = _FRONT_ID_RE.search(front)
    local_alias = []
    if local_id_match and not _PORTABLE_EXACT.match(local_id_match.group(1)):
        local_alias.append({"provider": "local-markdown", "id": local_id_match.group(1)})
    placeholder = {"portable_id": portable_id, "title": _title(front, body)}
    cache[resolved] = placeholder
    parent_line = _PARENT_LINE_RE.search(body)
    blocked_line = _BLOCKED_LINE_RE.search(body)
    parent_rels = _rels_from_line(parent_line.group(1), resolved, cache, aliases) if parent_line else []
    blocked_rels = _rels_from_line(blocked_line.group(1), resolved, cache, aliases) if blocked_line else []
    front_parent = _FRONT_PARENT_RE.search(front)
    if not parent_rels and front_parent:
        parent_rels = _rels_from_href(front_parent.group(1), resolved, cache, aliases)
    if not blocked_rels:
        blocked_rels = []
        for href in _yaml_list(front, "blocked_by"):
            blocked_rels.extend(_rels_from_href(href, resolved, cache, aliases))
    resolution = ""
    marker = "## Resolution comments"
    if marker in body:
        resolution = body.split(marker, 1)[1].strip()
    record = {
        "portable_id": portable_id,
        "title": _title(front, body),
        "state": _state(front, body),
        "parent": parent_rels[0] if parent_rels else None,
        "blocked_by": blocked_rels,
        "provider_aliases": local_alias,
        "path": str(resolved),
        "body": body.strip(),
        "comments": [
            {"authored_at": match.group(1), "body": match.group(2).strip()}
            for match in _COMMENT_RE.finditer(body)
        ],
        "resolution": resolution,
    }
    cache[resolved] = record
    return record


def _rels_from_href(
    href: str,
    current: Path,
    cache: dict[Path, dict[str, Any]],
    alias_map: Mapping[str, str],
) -> list[dict[str, str]]:
    target = (current.parent / href).resolve()
    if not target.is_file() and target not in cache:
        return []
    related = _parse_issue(target, cache, alias_map)
    return [{"title": str(related["title"]), "portable_id": str(related["portable_id"])}]


def _rels_from_line(
    line: str,
    current: Path,
    cache: dict[Path, dict[str, Any]],
    alias_map: Mapping[str, str] | None = None,
) -> list[dict[str, str]]:
    aliases = dict(alias_map or {})
    if re.search(r"\bNone\b", line) and not _PORTABLE_RE.search(line) and not _LINK_RE.search(line):
        return []
    rels: list[dict[str, str]] = []
    seen: set[str] = set()
    for title, href in _LINK_RE.findall(line):
        portable_id = ""
        if _PORTABLE_EXACT.match(href):
            portable_id = href
        elif href.endswith(".md"):
            target = (current.parent / href).resolve()
            if target.is_file() or target in cache:
                portable_id = str(_parse_issue(target, cache, aliases)["portable_id"])
        if not portable_id or portable_id in seen:
            continue
        seen.add(portable_id)
        rels.append({"title": title.strip(), "portable_id": portable_id})
    for portable_id in _PORTABLE_RE.findall(line):
        if portable_id in seen:
            continue
        seen.add(portable_id)
        rels.append({"title": "", "portable_id": portable_id})
    return rels


def check_relationships(bundle: Mapping[str, Any]) -> None:
    records = tuple(bundle.get("records") or ())
    ids = [str(record.get("portable_id") or "") for record in records]
    if any(not _PORTABLE_EXACT.match(item) for item in ids):
        raise TrackerError("portable identity is required")
    if len(ids) != len(set(ids)):
        raise TrackerError("portable identities must be unique")
    known = set(ids)
    for record in records:
        parent = record.get("parent")
        if parent and parent.get("portable_id") not in known:
            raise TrackerError("relationship check failed")
        for blocker in tuple(record.get("blocked_by") or ()):
            if blocker.get("portable_id") not in known:
                raise TrackerError("relationship check failed")


def export_local_tracker(root: Path) -> dict[str, Any]:
    cache: dict[Path, dict[str, Any]] = {}
    records: list[dict[str, Any]] = []
    spec = root / "spec.md"
    if spec.is_file():
        records.append(_parse_issue(spec, cache))
    issues_dir = root / "issues"
    if issues_dir.is_dir():
        for path in sorted(issues_dir.glob("*.md")):
            records.append(_parse_issue(path, cache))
    bundle = {"schema": "tmc-tracker-export-v1", "records": records}
    check_relationships(bundle)
    return bundle


def export_wayfinder(root: Path, alias_map: Mapping[str, str]) -> dict[str, Any]:
    cache: dict[Path, dict[str, Any]] = {}
    records: list[dict[str, Any]] = []
    mapping = dict(alias_map)
    map_path = root / "map.md"
    if map_path.is_file():
        records.append(_parse_issue(map_path, cache, mapping))
    tickets = root / "tickets"
    if tickets.is_dir():
        for path in sorted(tickets.glob("*.md")):
            if path.name.lower() == "readme.md":
                continue
            records.append(_parse_issue(path, cache, mapping))
    bundle = {"schema": "tmc-tracker-export-v1", "records": records}
    check_relationships(bundle)
    return bundle


def export_handoff(scratch: Path, wayfinder: Path, alias_map: Mapping[str, str]) -> dict[str, Any]:
    delivery = export_local_tracker(scratch)
    history = export_wayfinder(wayfinder, alias_map)
    bundle = {
        "schema": "tmc-tracker-export-v1",
        "records": [*delivery["records"], *history["records"]],
    }
    check_relationships(bundle)
    return bundle


def import_tracker(bundle: Mapping[str, Any]) -> dict[str, Any]:
    if bundle.get("schema") != "tmc-tracker-export-v1":
        raise TrackerError("tracker export schema is required")
    imported = {
        "schema": "tmc-tracker-export-v1",
        "records": [dict(record) for record in tuple(bundle.get("records") or ())],
    }
    check_relationships(imported)
    return imported


def render_export(bundle: Mapping[str, Any]) -> str:
    chunks: list[str] = []
    for record in tuple(bundle.get("records") or ()):
        parent = record.get("parent") or {}
        blocked_by = tuple(record.get("blocked_by") or ())
        parent_line = (
            f"**Parent:** {parent.get('title')} (`{parent.get('portable_id')}`)"
            if parent
            else "**Parent:** None"
        )
        blocked_line = (
            "**Blocked by: "
            + ", ".join(f"{item.get('title')} (`{item.get('portable_id')}`)" for item in blocked_by)
            + "**"
            if blocked_by
            else "**Blocked by: None**"
        )
        chunks.append(
            "\n".join(
                [
                    f"# {record.get('title')}",
                    "",
                    f"**Portable ID:** `{record.get('portable_id')}`",
                    parent_line,
                    blocked_line,
                    f"**Status:** {record.get('state')}",
                    "",
                    str(record.get("body") or ""),
                ]
            )
        )
    return "\n\n".join(chunks)


def validate_tracker_transition(plan: Mapping[str, Any]) -> dict[str, Any]:
    dual = plan.get("dual_writable") is True or (
        plan.get("predecessor") == "writable" and plan.get("destination") == "writable"
    )
    if dual:
        raise TrackerError("exactly one tracker may be writable")
    if plan.get("predecessor") != "frozen" or plan.get("destination") != "writable":
        raise TrackerError("the predecessor must freeze before the destination becomes writable")
    records = tuple(plan.get("records") or ())
    for record in records:
        portable_id = str(record.get("portable_id") or "")
        if not _PORTABLE_EXACT.match(portable_id):
            raise TrackerError("provider numbers remain aliases rather than portable identities")
    check_relationships({"records": records})
    return {
        "predecessor": "frozen",
        "destination": "writable",
        "dual_writable": False,
        "records": [dict(record) for record in records],
    }
