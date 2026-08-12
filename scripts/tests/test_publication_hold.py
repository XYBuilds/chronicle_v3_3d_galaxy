"""Publication hold for Daily/Monthly Data Release (#388)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.publication_hold import (  # noqa: E402
    HoldError,
    apply_hold,
    check_hold,
    main as hold_main,
)

NOW = "2026-08-13T04:00:00.000Z"


def test_missing_hold_file_allows_publication(tmp_path: Path) -> None:
    assert check_hold(tmp_path / "ops" / "publication-hold.json")["held"] is False


def test_held_publication_fails_closed(tmp_path: Path) -> None:
    path = tmp_path / "publication-hold.json"
    apply_hold(path, held=True, reason="rollback in progress", actor="XYBuilds", recorded_at=NOW)
    with pytest.raises(HoldError, match="publication is on hold"):
        check_hold(path)


def test_resume_clears_hold(tmp_path: Path) -> None:
    path = tmp_path / "publication-hold.json"
    apply_hold(path, held=True, reason="rollback in progress", actor="XYBuilds", recorded_at=NOW)
    apply_hold(path, held=False, reason="resume after smoke", actor="XYBuilds", recorded_at=NOW)
    assert check_hold(path)["held"] is False


def test_cli_check_and_set(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    path = tmp_path / "publication-hold.json"
    assert hold_main(["check", "--path", str(path)]) == 0
    assert hold_main(["set", "--path", str(path), "--reason", "hold", "--actor", "XYBuilds", "--recorded-at", NOW]) == 0
    assert hold_main(["check", "--path", str(path)]) == 1
    assert "publication is on hold" in capsys.readouterr().out
    assert hold_main(["clear", "--path", str(path), "--reason", "resume", "--actor", "XYBuilds", "--recorded-at", NOW]) == 0
    assert hold_main(["check", "--path", str(path)]) == 0
