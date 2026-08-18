"""Scheduled Daily backlog collapse: at most one current catch-up Light Refresh."""
from __future__ import annotations

from typing import Any, Mapping

from publication.errors import PublicationError


def evaluate_schedule_backlog(intent: Mapping[str, Any]) -> dict[str, Any]:
    trigger = str(intent.get("trigger") or "")
    if trigger != "schedule":
        return {"action": "proceed", "reason": "not a scheduled intent"}
    covered_by = intent.get("covered_by_sequence")
    if covered_by is None:
        return {"action": "catch-up", "reason": "current scheduled catch-up"}
    if not isinstance(covered_by, int) or covered_by < 1:
        raise PublicationError("scheduled backlog coverage sequence is invalid")
    return {
        "action": "exit",
        "reason": "older scheduled intent already covered by a later catch-up",
        "covered_by_sequence": covered_by,
    }
