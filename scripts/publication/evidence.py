"""Sanitized P1 cutover evidence. Human enablement remains mandatory."""
from __future__ import annotations

from typing import Any, Mapping

from publication.errors import PublicationError
from publication.inventory import evaluate_inventory

REQUIRED_GATES = (
    "gitlab_ci",
    "resource_group",
    "tests",
    "inventory",
    "manual_site_release",
    "manual_daily_release",
    "windows_preview",
    "job_minutes",
    "r3_integration",
    "production_enablement",
)

_REQUIRED_SURFACES = ("publication", "planet_export", "og_worker", "daily")


def _require_ok(name: str, value: Any) -> dict[str, Any]:
    if not isinstance(value, Mapping) or value.get("ok") is not True:
        raise PublicationError(f"P1 evidence failed closed: {name}")
    return dict(value)


def assemble_p1_evidence(
    *,
    gates: Mapping[str, Any],
    risk_declaration: Mapping[str, Any] | None,
    merge_approved: bool,
    production_enablement_approved: bool,
    recorded_at: str | None = None,
) -> dict[str, Any]:
    if not risk_declaration:
        raise PublicationError("human risk declaration is required")
    if risk_declaration.get("schema") != "chronicle-risk-declaration-v1":
        raise PublicationError("human risk declaration schema is required")
    if risk_declaration.get("tier") != "R3":
        raise PublicationError("P1 requires the accepted R3 declaration")
    surfaces = tuple(risk_declaration.get("surfaces") or ())
    if surfaces != _REQUIRED_SURFACES:
        raise PublicationError("P1 protected surfaces must be publication, planet_export, og_worker, and daily")
    missing = [name for name in REQUIRED_GATES if name not in gates]
    if missing:
        raise PublicationError(f"P1 evidence is missing {missing}")
    inventory_gate = gates["inventory"]
    if not isinstance(inventory_gate, Mapping):
        raise PublicationError("P1 evidence failed closed: inventory")
    if inventory_gate.get("ok") is True and isinstance(inventory_gate.get("checks"), Mapping):
        inventory = evaluate_inventory(inventory_gate["checks"])
    else:
        inventory = evaluate_inventory(inventory_gate)
    normalized = {
        "gitlab_ci": _require_ok("gitlab_ci", gates["gitlab_ci"]),
        "resource_group": _require_ok("resource_group", gates["resource_group"]),
        "tests": _require_ok("tests", gates["tests"]),
        "inventory": inventory,
        "manual_site_release": _require_ok("manual_site_release", gates["manual_site_release"]),
        "manual_daily_release": _require_ok("manual_daily_release", gates["manual_daily_release"]),
        "windows_preview": _require_ok("windows_preview", gates["windows_preview"]),
        "job_minutes": _require_ok("job_minutes", gates["job_minutes"]),
        "r3_integration": _require_ok("r3_integration", gates["r3_integration"]),
        "production_enablement": _require_ok("production_enablement", gates["production_enablement"]),
    }
    if not merge_approved:
        raise PublicationError("human merge approval is required")
    if not production_enablement_approved:
        raise PublicationError("human production enablement approval is required")
    preview = normalized["windows_preview"]
    if preview.get("scheduler") is True:
        raise PublicationError("Windows must not be configured as a scheduler")
    if preview.get("updates_production_branch") is True:
        raise PublicationError("Windows Pages Preview cannot change the production branch")
    if preview.get("updates_active_registry") is True:
        raise PublicationError("Windows Pages Preview cannot change the active Site Artifact registry")
    return {
        "schema": "chronicle-p1-evidence-v1",
        "ok": True,
        "merge_approved": True,
        "production_enablement_approved": True,
        "gitlab_sole_scheduler": True,
        "recorded_at": recorded_at,
        "risk_declaration": {
            "schema": risk_declaration["schema"],
            "tier": "R3",
            "surfaces": list(surfaces),
            "notes": risk_declaration.get("notes", ""),
        },
        "gates": normalized,
    }
