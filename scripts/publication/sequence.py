"""Chronicle-owned monotonically increasing publication sequence."""
from __future__ import annotations

import json
import re
from typing import Any, Mapping, Sequence

from publication.errors import PublicationError
from publication.store import SEQUENCE_KEY, PublicationStore

SCHEMA = "chronicle-publication-sequence-v1"
_IDENTITY_SUFFIX = re.compile(r"(?:daily|monthly)\.(\d+)\s*$")


def parse_identity_suffix(identity: str) -> int | None:
    if not isinstance(identity, str) or not identity.strip():
        return None
    match = _IDENTITY_SUFFIX.search(identity.strip())
    if match is None:
        return None
    return int(match.group(1))


def greatest_verified_suffix(identities: Sequence[str]) -> int:
    suffixes = [parsed for parsed in (parse_identity_suffix(item) for item in identities) if parsed is not None]
    if not suffixes:
        raise PublicationError("bootstrap requires at least one verified production suffix")
    return max(suffixes)


def _load_head(store: PublicationStore) -> dict[str, Any] | None:
    raw = store.get(SEQUENCE_KEY)
    if raw is None:
        return None
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PublicationError("durable publication sequence is corrupt") from exc
    if not isinstance(payload, Mapping) or payload.get("schema") != SCHEMA:
        raise PublicationError("durable publication sequence is corrupt")
    head = payload.get("head")
    bootstrap_min = payload.get("bootstrap_min")
    if not isinstance(head, int) or head < 1 or not isinstance(bootstrap_min, int) or bootstrap_min < 1:
        raise PublicationError("durable publication sequence is corrupt")
    if head < bootstrap_min:
        raise PublicationError("durable publication sequence is behind accepted bootstrap evidence")
    return {"schema": SCHEMA, "head": head, "bootstrap_min": bootstrap_min}


def bootstrap_sequence(store: PublicationStore, *, verified_identities: Sequence[str]) -> dict[str, Any]:
    bootstrap_min = greatest_verified_suffix(verified_identities)
    current = _load_head(store)
    if current is None:
        payload = {"schema": SCHEMA, "head": bootstrap_min, "bootstrap_min": bootstrap_min}
        store.put(SEQUENCE_KEY, json.dumps(payload, sort_keys=True).encode("utf-8"))
        return payload
    if current["head"] < bootstrap_min or current["bootstrap_min"] < bootstrap_min:
        raise PublicationError("durable publication sequence is behind accepted bootstrap evidence")
    return current


def allocate_sequence(store: PublicationStore) -> int:
    current = _load_head(store)
    if current is None:
        raise PublicationError("durable publication sequence is missing")
    nxt = int(current["head"]) + 1
    payload = {"schema": SCHEMA, "head": nxt, "bootstrap_min": current["bootstrap_min"]}
    store.put(SEQUENCE_KEY, json.dumps(payload, sort_keys=True).encode("utf-8"))
    return nxt


def reject_publish_behind(*, attempt_sequence: int, latest_success_sequence: int | None) -> None:
    if latest_success_sequence is None:
        return
    if int(attempt_sequence) <= int(latest_success_sequence):
        raise PublicationError("replay cannot publish behind a newer success")
