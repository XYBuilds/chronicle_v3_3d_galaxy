"""Sanitized P0 evidence bundle and human-gated GitLab admission."""
from __future__ import annotations

from typing import Any, Mapping, Sequence

REQUIRED_GATES = (
    "bitwarden_synthetic_drill",
    "restic_pin",
    "capacity",
    "ssh_host_identity",
    "snapshot_acquisition",
    "restic_check_read_data",
    "restore_compare",
    "git_integrity",
    "sanitized_receipt",
    "live_vault_completeness",
    "gitlab_admission",
)
_CANONICAL_SURFACES = frozenset(
    {
        "visual_output",
        "browser_journey",
        "publication",
        "planet_export",
        "og_worker",
        "daily",
    }
)


class EvidenceError(ValueError):
    """The evidence bundle is incomplete or not human-authorized."""


def _require_risk_declaration(declaration: Mapping[str, Any] | None) -> dict[str, Any]:
    if not declaration:
        raise EvidenceError("human risk declaration is required")
    if declaration.get("schema") != "chronicle-risk-declaration-v1":
        raise EvidenceError("human risk declaration schema is required")
    if declaration.get("tier") not in {"R0", "R1", "R2", "R3"}:
        raise EvidenceError("human risk declaration tier is required")
    surfaces = tuple(declaration.get("surfaces") or ())
    unknown = set(surfaces) - _CANONICAL_SURFACES
    if unknown:
        raise EvidenceError(f"unknown protected surfaces: {sorted(unknown)}")
    return {
        "schema": "chronicle-risk-declaration-v1",
        "tier": declaration["tier"],
        "surfaces": list(surfaces),
        "notes": declaration.get("notes", ""),
    }


def _require_ok(name: str, value: Any, extra: Sequence[str] = ()) -> dict[str, Any]:
    if not isinstance(value, Mapping) or value.get("ok") is not True:
        raise EvidenceError(f"failed gates: [{name}]")
    for field in extra:
        if not value.get(field):
            raise EvidenceError(f"{name} evidence is incomplete")
    return dict(value)


def _normalize_gates(gates: Mapping[str, Any]) -> dict[str, Any]:
    missing = [name for name in REQUIRED_GATES if name not in gates]
    if missing:
        raise EvidenceError(f"missing gates: {missing}")
    normalized: dict[str, Any] = {}
    normalized["bitwarden_synthetic_drill"] = _require_ok("bitwarden_synthetic_drill", gates["bitwarden_synthetic_drill"], ("count",))
    normalized["restic_pin"] = _require_ok("restic_pin", gates["restic_pin"], ("version",))
    normalized["capacity"] = _require_ok("capacity", gates["capacity"])
    normalized["ssh_host_identity"] = _require_ok("ssh_host_identity", gates["ssh_host_identity"])
    normalized["snapshot_acquisition"] = _require_ok(
        "snapshot_acquisition", gates["snapshot_acquisition"], ("snapshot_id", "tree_id")
    )
    normalized["restic_check_read_data"] = _require_ok("restic_check_read_data", gates["restic_check_read_data"])
    compare = _require_ok("restore_compare", gates["restore_compare"])
    if tuple(compare.get("differences") or ()) != ():
        raise EvidenceError("restore compare did not pass")
    normalized["restore_compare"] = compare
    normalized["git_integrity"] = _require_ok("git_integrity", gates["git_integrity"], ("fsck_ok",))
    if gates["git_integrity"].get("fsck_ok") is not True:
        raise EvidenceError("git integrity did not pass")
    receipt = gates["sanitized_receipt"]
    if not isinstance(receipt, Mapping) or receipt.get("check_read_data") != "pass":
        raise EvidenceError("sanitized receipt did not pass")
    normalized["sanitized_receipt"] = dict(receipt)
    normalized["live_vault_completeness"] = _require_ok(
        "live_vault_completeness", gates["live_vault_completeness"], ("name_count",)
    )
    admission = gates["gitlab_admission"]
    if not isinstance(admission, Mapping) or admission.get("visibility") != "private":
        raise EvidenceError("gitlab admission did not pass")
    if admission.get("deploy") or admission.get("schedule"):
        raise EvidenceError("gitlab admission did not pass")
    if not isinstance(admission.get("compute_seconds"), int):
        raise EvidenceError("GitLab compute usage must be recorded")
    normalized["gitlab_admission"] = dict(admission)
    return normalized


def assemble_evidence_bundle(
    *,
    gates: Mapping[str, Any],
    risk_declaration: Mapping[str, Any] | None,
    gitlab_human_approval: bool,
    residual_uncertainty: Sequence[str] = (),
) -> dict[str, Any]:
    risk = _require_risk_declaration(risk_declaration)
    normalized = _normalize_gates(gates)
    if not gitlab_human_approval:
        raise EvidenceError("human approval is required to admit GitLab")
    return {
        "risk_declaration": risk,
        "gates": normalized,
        "gitlab_admitted": True,
        "residual_uncertainty": list(residual_uncertainty),
    }
