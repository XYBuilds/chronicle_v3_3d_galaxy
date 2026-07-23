"""Canonical metadata values shared by galaxy export producers and consumers."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

_UTC_TIMESTAMP_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$"
)


def canonical_utc_timestamp(value: datetime | str) -> str:
    """Return an aware UTC timestamp as millisecond-precision ISO text ending in ``Z``."""
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        text = value.strip()
        if _UTC_TIMESTAMP_RE.fullmatch(text) is None:
            raise ValueError("timestamp must be a UTC ISO-8601 value")
        try:
            parsed = datetime.fromisoformat(text[:-1] + "+00:00" if text.endswith("Z") else text)
        except ValueError as exc:
            raise ValueError("timestamp must be a valid ISO-8601 value") from exc
    else:
        raise ValueError("timestamp must be a datetime or non-empty ISO-8601 string")

    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise ValueError("timestamp must use UTC")
    return parsed.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")