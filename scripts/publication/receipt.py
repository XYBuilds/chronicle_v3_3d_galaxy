"""Durable sanitized publication receipts."""
from __future__ import annotations

import json
import re
from typing import Any, Mapping

from publication.errors import PublicationError
from publication.store import PublicationStore, receipt_key

SCHEMA = "chronicle-publication-receipt-v1"
ENTRY_POINTS = frozenset({"site-release", "daily-data-release"})
TRIGGERS = frozenset({"merge", "schedule", "manual", "replay", "windows-emergency", "fixture"})
RESULTS = frozenset({"pending", "success", "failed", "rolled-back", "skipped-backlog", "stopped"})
_SECRETISH = re.compile(r"(token|secret|password|key|session|authorization|credential)", re.I)
_REQUIRED = (
    "entry_point",
    "sequence",
    "trigger",
    "requested_at",
    "source_commit",
    "actor",
    "inputs",
    "stages",
    "mutations",
    "pages_deployment",
    "smoke",
    "rollback_attempt",
    "result",
    "started_at",
    "finished_at",
)


def _reject_secrets(value: Any, path: str = "receipt") -> None:
    if isinstance(value, Mapping):
        for key, inner in value.items():
            name = str(key)
            if _SECRETISH.search(name) or name.upper() in {"BW_SESSION", "BITWARDEN_ACCESS_TOKEN"}:
                raise PublicationError("publication receipts cannot contain secret values")
            _reject_secrets(inner, f"{path}.{name}")
        return
    if isinstance(value, (list, tuple)):
        for index, inner in enumerate(value):
            _reject_secrets(inner, f"{path}[{index}]")


def build_receipt(payload: Mapping[str, Any]) -> dict[str, Any]:
    missing = [name for name in _REQUIRED if name not in payload]
    if missing:
        raise PublicationError(f"publication receipt is missing {missing}")
    if payload.get("schema", SCHEMA) != SCHEMA:
        raise PublicationError("publication receipt schema is required")
    if payload.get("entry_point") not in ENTRY_POINTS:
        raise PublicationError("publication receipt entry point is invalid")
    if not isinstance(payload.get("sequence"), int) or int(payload["sequence"]) < 1:
        raise PublicationError("publication receipt sequence is invalid")
    if payload.get("trigger") not in TRIGGERS:
        raise PublicationError("publication receipt trigger is invalid")
    if payload.get("result") not in RESULTS:
        raise PublicationError("publication receipt result is invalid")
    receipt = {
        "schema": SCHEMA,
        "entry_point": payload["entry_point"],
        "sequence": int(payload["sequence"]),
        "trigger": payload["trigger"],
        "requested_at": str(payload["requested_at"]),
        "source_commit": str(payload["source_commit"]),
        "provider": dict(payload.get("provider") or {}),
        "actor": str(payload["actor"]),
        "takeover_reason": str(payload.get("takeover_reason") or ""),
        "inputs": dict(payload.get("inputs") or {}),
        "tool_versions": dict(payload.get("tool_versions") or {}),
        "data_release_identity": payload.get("data_release_identity"),
        "site_artifact_identity": payload.get("site_artifact_identity"),
        "og_evidence": dict(payload.get("og_evidence") or {}),
        "r2_objects": dict(payload.get("r2_objects") or {}),
        "stages": list(payload.get("stages") or []),
        "mutations": list(payload.get("mutations") or []),
        "pages_deployment": dict(payload.get("pages_deployment") or {}),
        "smoke": dict(payload.get("smoke") or {}),
        "rollback_attempt": dict(payload.get("rollback_attempt") or {}),
        "result": payload["result"],
        "started_at": str(payload["started_at"]),
        "finished_at": str(payload["finished_at"]),
    }
    _reject_secrets(receipt)
    return receipt


def write_receipt(store: PublicationStore, payload: Mapping[str, Any]) -> dict[str, Any]:
    receipt = build_receipt(payload)
    store.put(receipt_key(int(receipt["sequence"])), json.dumps(receipt, sort_keys=True).encode("utf-8"))
    return receipt


def latest_success_sequence(store: PublicationStore, *, head: int) -> int | None:
    for sequence in range(int(head), 0, -1):
        raw = store.get(receipt_key(sequence))
        if raw is None:
            continue
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            continue
        if isinstance(payload, Mapping) and payload.get("result") == "success":
            return int(payload["sequence"])
    return None
