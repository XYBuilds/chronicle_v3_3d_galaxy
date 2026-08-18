"""Read-only production inventory that fails closed before P1 cutover."""
from __future__ import annotations

from typing import Any, Mapping

from publication.errors import PublicationError

REQUIRED_CHECKS = (
    "pages_project",
    "manifest",
    "active_site_artifact",
    "rollback_site_artifact",
    "og_checkpoint",
    "active_profile",
    "publication_hold",
    "r2_access",
    "supabase_readiness",
    "sequence_bootstrap",
    "resource_group",
)


def evaluate_inventory(observed: Mapping[str, Any]) -> dict[str, Any]:
    missing = [name for name in REQUIRED_CHECKS if name not in observed]
    if missing:
        raise PublicationError(f"production inventory is missing {missing}")
    for name in REQUIRED_CHECKS:
        check = observed[name]
        if not isinstance(check, Mapping) or check.get("ok") is not True:
            raise PublicationError(f"production inventory failed closed: {name}")
        status = str(check.get("status") or "ok")
        if status in {"missing", "corrupt", "mismatched", "ambiguous"}:
            raise PublicationError(f"production inventory failed closed: {name}")
    if observed["active_site_artifact"].get("artifact_id") and observed["rollback_site_artifact"].get("artifact_id"):
        if observed["active_site_artifact"]["artifact_id"] == observed["rollback_site_artifact"]["artifact_id"]:
            raise PublicationError("production inventory failed closed: rollback_site_artifact")
    return {"ok": True, "checks": {name: dict(observed[name]) for name in REQUIRED_CHECKS}}
