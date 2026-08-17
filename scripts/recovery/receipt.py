"""Sanitized snapshot receipt: aggregates only, no secrets or inventories."""
from __future__ import annotations

import re
from typing import Any, Mapping

ALLOWED_RECEIPT_KEYS = frozenset(
    {
        "acquired_at",
        "restic_version",
        "snapshot_id",
        "tree_id",
        "source_labels",
        "file_count",
        "byte_count",
        "exclusion_policy_id",
        "check_read_data",
        "restore_compare",
        "git_integrity",
        "evidence_bundle_hash",
    }
)
_SECRET_KEYS = frozenset({"password", "secret", "token", "credential", "api_key", "private_key"})
_PATH_RE = re.compile(r"([A-Za-z]:\\|\\\\|/)[^\s\"']+")


class ReceiptError(ValueError):
    """A receipt attempted to carry forbidden recovery detail."""


def sanitize_receipt(payload: Mapping[str, Any]) -> dict[str, Any]:
    lowered_keys = {str(key).lower() for key in payload}
    if lowered_keys & _SECRET_KEYS:
        raise ReceiptError("secret values are forbidden in the sanitized receipt")
    if "files" in payload and any(
        isinstance(item, Mapping) and ("sha256" in item or "path" in item) for item in payload["files"]  # type: ignore[index]
    ):
        raise ReceiptError("per-file hashes are forbidden in the sanitized receipt")
    if "unreachable_objects" in payload or "object_inventory" in payload or "stash" in payload:
        raise ReceiptError("object inventory is forbidden in the sanitized receipt")
    rendered = str(payload)
    if _PATH_RE.search(rendered) or "E:\\" in rendered or "C:\\" in rendered:
        raise ReceiptError("sensitive paths are forbidden in the sanitized receipt")
    unknown = set(payload) - ALLOWED_RECEIPT_KEYS
    if unknown:
        raise ReceiptError(f"forbidden receipt fields: {sorted(unknown)}")
    return {key: payload[key] for key in ALLOWED_RECEIPT_KEYS if key in payload}
