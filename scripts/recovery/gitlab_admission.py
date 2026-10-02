"""Disposable GitLab admission plan and portable Issue local render."""
from __future__ import annotations

from typing import Any, Mapping, Sequence

from recovery.secrets import production_credential_names


class AdmissionError(ValueError):
    """The disposable GitLab admission plan violated a hard stop."""


_REAL_REPOSITORY_MARKERS = (
    "chronicle_v3_3d_galaxy",
    "themoviecosmos-og-worker",
    "themoviecosmos-daily-stargazing",
    "chronicle-v3",
)
_PRODUCTION_VARIABLES = production_credential_names()


def validate_admission_plan(plan: Mapping[str, Any]) -> dict[str, Any]:
    name = str(plan.get("project_name", ""))
    lowered = name.lower()
    if any(marker in lowered for marker in _REAL_REPOSITORY_MARKERS):
        raise AdmissionError("real repository names cannot cross the admission gate")
    if plan.get("visibility") != "private":
        raise AdmissionError("admission project must remain private")
    if plan.get("deploy"):
        raise AdmissionError("deployment jobs cannot cross the admission gate")
    if plan.get("schedule"):
        raise AdmissionError("schedules cannot cross the admission gate")
    jobs = tuple(plan.get("jobs") or ())
    if "node_test" not in jobs or "python_test" not in jobs:
        raise AdmissionError("admission requires representative Node and Python jobs")
    variables = dict(plan.get("variables") or {})
    production = sorted(set(variables) & _PRODUCTION_VARIABLES)
    if production:
        raise AdmissionError("production credentials cannot cross the admission gate")
    if "ADMISSION_DUMMY" not in variables or "ADMISSION_DUMMY" not in tuple(plan.get("protected_variables") or ()):
        raise AdmissionError("admission requires a dummy protected value")
    if not tuple(plan.get("artifacts") or ()):
        raise AdmissionError("admission requires a downloadable artifact")
    compute = plan.get("compute_seconds")
    if not isinstance(compute, int) or compute < 0:
        raise AdmissionError("GitLab compute usage must be recorded")
    return {
        "project_name": name,
        "visibility": "private",
        "jobs": jobs,
        "protected_variables": tuple(plan.get("protected_variables") or ()),
        "artifacts": tuple(plan.get("artifacts") or ()),
        "deploy": False,
        "schedule": False,
        "compute_seconds": compute,
    }


def local_render_issue_export(issue: Mapping[str, Any]) -> str:
    parent = issue.get("parent") or {}
    blocked_by: Sequence[Mapping[str, Any]] = tuple(issue.get("blocked_by") or ())
    parent_line = (
        f"**Parent:** {parent.get('title')} (`{parent.get('portable_id')}`)"
        if parent
        else "**Parent:** None"
    )
    if blocked_by:
        blockers = ", ".join(
            f"{item.get('title')} (`{item.get('portable_id')}`)" for item in blocked_by
        )
        blocked_line = f"**Blocked by: {blockers}**"
    else:
        blocked_line = "**Blocked by: None**"
    return "\n".join(
        [
            f"# {issue.get('title')}",
            "",
            f"**Portable ID:** `{issue.get('portable_id')}`",
            parent_line,
            blocked_line,
        ]
    )
