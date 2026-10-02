"""GitHub production admission, separate from the non-deploying PR workflow."""
from __future__ import annotations

from typing import Mapping

from publication.errors import PublicationError

REPOSITORY = "XYBuilds/chronicle_v3_3d_galaxy"


def verify_github_context(environment: Mapping[str, str], *, entry_point: str) -> dict[str, str]:
    if environment.get("PUBLICATION_AUTHORITY") != "github":
        raise PublicationError("GitHub publication authority has not been enabled")
    if environment.get("GITHUB_REPOSITORY") != REPOSITORY:
        raise PublicationError("GitHub publication is restricted to the owner repository")
    if environment.get("GITHUB_REF") != "refs/heads/main" or environment.get("GITHUB_REF_PROTECTED") != "true":
        raise PublicationError("GitHub publication requires protected main")
    event = environment.get("GITHUB_EVENT_NAME", "")
    allowed = {"site": {"push", "workflow_dispatch"}, "daily": {"schedule", "workflow_dispatch"}}
    if event not in allowed.get(entry_point, set()):
        raise PublicationError("GitHub event cannot invoke this publication entry point")
    gate = "P1_SITE_TRIGGER_ENABLED" if entry_point == "site" else "P1_DAILY_SCHEDULE_ENABLED"
    if event != "workflow_dispatch" and environment.get(gate) != "true":
        raise PublicationError("automatic GitHub publication is not enabled")
    return {"event": event, "run_id": environment.get("GITHUB_RUN_ID", ""), "attempt": environment.get("GITHUB_RUN_ATTEMPT", "")}
