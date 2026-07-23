from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from export.export_contract import canonical_utc_timestamp  # noqa: E402


def test_canonicalizes_python_utc_isoformat_to_millisecond_z() -> None:
    value = datetime(2026, 7, 23, 20, 10, 9, 987654, tzinfo=timezone.utc)

    assert canonical_utc_timestamp(value) == "2026-07-23T20:10:09.987Z"
    assert canonical_utc_timestamp("2026-07-23T20:10:09.987654+00:00") == "2026-07-23T20:10:09.987Z"
    assert canonical_utc_timestamp("2026-07-23T20:10:09Z") == "2026-07-23T20:10:09.000Z"


@pytest.mark.parametrize(
    "value",
    [
        datetime(2026, 7, 23, 20, 10, 9),
        datetime(2026, 7, 23, 20, 10, 9, tzinfo=timezone(timedelta(hours=8))),
        "2026-07-23 20:10:09+00:00",
        "2026-07-23T20:10:09+08:00",
    ],
)
def test_rejects_non_utc_contract_timestamp(value: datetime | str) -> None:
    with pytest.raises(ValueError, match="UTC"):
        canonical_utc_timestamp(value)