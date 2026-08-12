#!/usr/bin/env python3
"""Persistent publication hold for Daily and Monthly Data Releases.

Production Recovery sets or clears this flag. Missing state means not held.
An explicit held document fails closed so cadence cannot overlap a rollback.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Mapping


class HoldError(ValueError):
    """Publication hold state is held or unreadable."""


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise HoldError(message)


def check_hold(path: Path) -> dict[str, Any]:
    """Return hold state. Missing files are not held; corrupt files fail closed."""
    if not path.is_file():
        return {"held": False, "path": str(path)}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HoldError(f"publication hold is unreadable: {exc}") from exc
    _assert(isinstance(payload, Mapping), "publication hold is unreadable")
    held = payload.get("held")
    _assert(isinstance(held, bool), "publication hold is unreadable")
    if held:
        reason = payload.get("reason")
        actor = payload.get("actor")
        detail = f" reason={reason!r} actor={actor!r}" if reason or actor else ""
        raise HoldError(f"publication is on hold{detail}")
    return {"held": False, "path": str(path)}


def apply_hold(
    path: Path,
    *,
    held: bool,
    reason: str,
    actor: str,
    recorded_at: str,
) -> dict[str, Any]:
    """Write the hold document. Does not mutate Daily/Monthly workflow files."""
    _assert(isinstance(reason, str) and bool(reason.strip()), "reason is required")
    _assert(isinstance(actor, str) and bool(actor.strip()), "actor is required")
    _assert(isinstance(recorded_at, str) and recorded_at.endswith("Z"), "recorded_at must be UTC")
    payload = {
        "held": bool(held),
        "reason": reason.strip(),
        "actor": actor.strip(),
        "recorded_at": recorded_at,
        "cadence": "daily-monthly",
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check")
    check.add_argument("--path", type=Path, required=True)
    mutate = argparse.ArgumentParser(add_help=False)
    mutate.add_argument("--path", type=Path, required=True)
    mutate.add_argument("--reason", required=True)
    mutate.add_argument("--actor", required=True)
    mutate.add_argument("--recorded-at", required=True)
    sub.add_parser("set", parents=[mutate])
    sub.add_parser("clear", parents=[mutate])
    args = parser.parse_args(argv)
    try:
        if args.command == "check":
            payload = check_hold(args.path)
        else:
            payload = apply_hold(
                args.path,
                held=args.command == "set",
                reason=args.reason,
                actor=args.actor,
                recorded_at=args.recorded_at,
            )
    except HoldError as exc:
        print(f"[publication-hold] error: {exc}", flush=True)
        return 1
    print(json.dumps(payload, indent=2, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
