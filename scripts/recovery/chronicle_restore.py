"""Chronicle P0 repository restore gates: refs, remotes, protection, CI, clone proof."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

from recovery.evidence import EvidenceError, require_risk_declaration
from recovery.secrets import production_credential_names


class RestoreError(ValueError):
    """A Chronicle development-resume restore plan violated a hard stop."""


_ISSUE_BRANCH_PREFIXES = ("cursor/", "codex/", "claude/", "ai/")
_UNREVIEWED_TAG_PREFIXES = ("codex/", "tmp/", "wip/")
_FORBIDDEN_NAMESPACES = (
    ("refs/stash", "stash"),
    ("refs/remotes/", "remote-tracking"),
    ("refs/codex/", "provider"),
    ("refs/pull/", "provider"),
    ("refs/merge-requests/", "provider"),
)


def _ref_kind(name: str) -> str:
    if name.startswith("refs/heads/"):
        return "branch"
    if name.startswith("refs/tags/"):
        return "tag"
    return "other"


def _branch_name(ref: str) -> str:
    return ref.removeprefix("refs/heads/")


def _tag_name(ref: str) -> str:
    return ref.removeprefix("refs/tags/")


def _assert_approved_ref(src: str, dst: str) -> None:
    for prefix, label in _FORBIDDEN_NAMESPACES:
        if src.startswith(prefix) or src == prefix.rstrip("/"):
            raise RestoreError(f"{label} refs cannot be promoted")
    if src != dst:
        raise RestoreError("explicit refspecs must push each approved ref to the same name")
    kind = _ref_kind(src)
    if kind == "branch":
        short = _branch_name(src)
        if short == "main":
            return
        if short.startswith("research/"):
            raise RestoreError("research branches are not Issue-owned active branches")
        if any(short.startswith(prefix) for prefix in _ISSUE_BRANCH_PREFIXES):
            return
        raise RestoreError("only main and Issue-owned active branches may be promoted")
    if kind == "tag":
        short = _tag_name(src)
        if any(short.startswith(prefix) for prefix in _UNREVIEWED_TAG_PREFIXES):
            raise RestoreError("unreviewed ref namespace cannot be promoted")
        return
    raise RestoreError("unreviewed ref namespace cannot be promoted")


def validate_ref_plan(plan: Mapping[str, Any]) -> dict[str, Any]:
    if plan.get("mirror"):
        raise RestoreError("mirror pushes cannot promote a repository")
    refs = tuple(plan.get("refs") or ())
    if not refs:
        raise RestoreError("explicit ref selections are required")
    normalized: list[dict[str, str]] = []
    seen: set[str] = set()
    has_main = False
    for item in refs:
        src = str(item.get("src") or "")
        dst = str(item.get("dst") or "")
        _assert_approved_ref(src, dst)
        if src in seen:
            raise RestoreError("duplicate explicit ref selection")
        seen.add(src)
        if src == "refs/heads/main":
            has_main = True
        normalized.append({"src": src, "dst": dst})
    if not has_main:
        raise RestoreError("approved main must be included in the explicit ref plan")
    return {"mirror": False, "refs": normalized}


def validate_secret_scan(
    report: Mapping[str, Any], *, planned_refs: Sequence[str]
) -> dict[str, Any]:
    scanned = tuple(str(item) for item in tuple(report.get("refs_scanned") or ()))
    planned = tuple(planned_refs)
    if not scanned or set(scanned) != set(planned):
        raise RestoreError("secret scan must cover every planned ref")
    findings = tuple(report.get("findings") or ())
    if findings:
        raise RestoreError("secret evidence stops promotion")
    return {"refs_scanned": scanned, "findings": ()}


def _host(url: str) -> str:
    without_scheme = url.split("://", 1)[-1]
    return without_scheme.split("/", 1)[0].lower()


def validate_remotes(plan: Mapping[str, Any]) -> dict[str, Any]:
    origin = str(plan.get("origin") or "")
    promoted = bool(plan.get("promoted"))
    if not origin:
        raise RestoreError("origin remote is required")
    if promoted:
        suspended = str(plan.get("github-suspended") or "")
        if not suspended:
            raise RestoreError("suspended GitHub URL must remain a named alias")
        if _host(origin) != "gitlab.com":
            raise RestoreError("promoted origin must be the GitLab candidate")
        if _host(suspended) != "github.com":
            raise RestoreError("suspended GitHub URL cannot be overwritten")
        if origin == suspended:
            raise RestoreError("suspended GitHub URL cannot be overwritten")
        return {
            "origin": origin,
            "github-suspended": suspended,
            "promoted": True,
        }
    candidate = str(plan.get("gitlab-candidate") or "")
    if _host(origin) != "github.com":
        raise RestoreError("candidate remote is not authoritative until the gate passes")
    if _host(candidate) != "gitlab.com":
        raise RestoreError("gitlab-candidate must be the private GitLab project")
    return {
        "origin": origin,
        "gitlab-candidate": candidate,
        "promoted": False,
    }


def validate_protection(observed: Mapping[str, Any]) -> dict[str, Any]:
    if observed.get("source") != "api":
        raise RestoreError("protected-branch settings must be read back through the provider API")
    if observed.get("default_branch") != "main" or observed.get("name") != "main":
        raise RestoreError("main must be the declared default branch")
    if observed.get("allow_force_push") is not False:
        raise RestoreError("force push must be disabled on main")
    push_level = observed.get("push_access_level")
    if push_level != 0:
        raise RestoreError("direct push to main must be disabled")
    merge_level = observed.get("merge_access_level")
    if not isinstance(merge_level, int) or merge_level <= 0:
        raise RestoreError("merge through protected main is required")
    return {
        "default_branch": "main",
        "name": "main",
        "allow_force_push": False,
        "push_access_level": 0,
        "merge_access_level": merge_level,
        "source": "api",
    }


_OWNER_MARKERS = (
    "npm test",
    "npm run lint",
    "npm run build",
    "test_current_documentation_authority.py",
    "git diff --check",
)


def validate_ci_adapter(text: str) -> dict[str, Any]:
    lowered = text.lower()
    if "\nschedule:" in f"\n{text}" or text.strip().startswith("schedule:"):
        raise RestoreError("schedules cannot enter the Chronicle P0 CI adapter")
    if "pages:" in lowered or "\ndeploy:" in f"\n{lowered}" or lowered.strip().startswith("deploy:"):
        raise RestoreError("deployment jobs cannot enter the Chronicle P0 CI adapter")
    production = sorted(name for name in production_credential_names() if name in text)
    if production:
        raise RestoreError("production credentials cannot enter the Chronicle P0 CI adapter")
    missing = [marker for marker in _OWNER_MARKERS if marker not in text]
    if missing:
        raise RestoreError("owner checks are required in the Chronicle P0 CI adapter")
    if "when: never" not in text or "CI_PIPELINE_SOURCE == \"schedule\"" not in text:
        raise RestoreError("schedules cannot enter the Chronicle P0 CI adapter")
    return {"deploy": False, "schedule": False}


def validate_clone_proof(approved: Mapping[str, Any], cloned: Mapping[str, Any]) -> dict[str, Any]:
    if cloned.get("empty_directory") is not True:
        raise RestoreError("clone proof requires a new empty directory")
    if approved.get("main") != cloned.get("main"):
        raise RestoreError("cloned main object identity must match the approved main")
    approved_refs = dict(approved.get("refs") or {})
    cloned_refs = dict(cloned.get("refs") or {})
    unexpected = sorted(set(cloned_refs) - set(approved_refs))
    if unexpected:
        raise RestoreError("unexpected promoted refs in the fresh clone")
    missing = sorted(set(approved_refs) - set(cloned_refs))
    if missing:
        raise RestoreError("missing promoted refs in the fresh clone")
    for name, object_id in approved_refs.items():
        if cloned_refs.get(name) != object_id:
            raise RestoreError("cloned ref object identity must match the approved refs")
    if cloned.get("fsck_ok") is not True:
        raise RestoreError("fresh clone git fsck did not pass")
    return {
        "empty_directory": True,
        "main": cloned["main"],
        "refs": dict(cloned_refs),
        "fsck_ok": True,
    }


def assemble_resume_evidence(
    *,
    gates: Mapping[str, Any],
    risk_declaration: Mapping[str, Any] | None,
    merge_approved: bool,
    recorded_at: str | None = None,
) -> dict[str, Any]:
    try:
        risk = require_risk_declaration(risk_declaration)
    except EvidenceError as exc:
        raise RestoreError(str(exc)) from exc
    if gates.get("visibility") != "private":
        raise RestoreError("Chronicle restore project must remain private")
    if gates.get("issue_open") is not True:
        raise RestoreError("the Issue must remain open until human closure is approved")
    if not merge_approved:
        raise RestoreError("human merge approval is required")
    if gates.get("deployment_disabled") is not True or gates.get("schedules_disabled") is not True:
        raise RestoreError("deployment and schedules must remain disabled")
    if gates.get("production_secrets_absent") is not True:
        raise RestoreError("production secrets must remain absent from CI")
    required = (
        "snapshot_receipt_id",
        "ref_plan",
        "secret_scan",
        "protection",
        "tracker_transition",
        "ci_adapter",
        "pipeline",
        "merge_request",
        "clone_proof",
    )
    missing = [name for name in required if name not in gates]
    if missing:
        raise RestoreError(f"missing resume gates: {missing}")
    if gates["secret_scan"].get("findings"):
        raise RestoreError("secret evidence stops promotion")
    if gates["ci_adapter"].get("deploy") or gates["pipeline"].get("deploy"):
        raise RestoreError("deployment jobs cannot enter the Chronicle P0 CI adapter")
    if gates["merge_request"].get("bypass"):
        raise RestoreError("protected-branch merge cannot be bypassed")
    if gates["clone_proof"].get("fsck_ok") is not True:
        raise RestoreError("fresh clone git fsck did not pass")
    if gates["protection"].get("source") != "api":
        raise RestoreError("protected-branch settings must be read back through the provider API")
    uncertainty = str(gates.get("github_uncertainty") or "")
    if "GitHub" not in uncertainty:
        raise RestoreError("accepted GitHub server-only uncertainty must be recorded")
    stamp = recorded_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "risk_declaration": risk,
        "development_resume": True,
        "issue_open": True,
        "deployment_disabled": True,
        "schedules_disabled": True,
        "visibility": "private",
        "snapshot_receipt_id": gates["snapshot_receipt_id"],
        "ref_plan": dict(gates["ref_plan"]),
        "protection": dict(gates["protection"]),
        "tracker_transition": dict(gates["tracker_transition"]),
        "pipeline": dict(gates["pipeline"]),
        "merge_request": dict(gates["merge_request"]),
        "clone_proof": dict(gates["clone_proof"]),
        "recorded_at": stamp,
        "residual_uncertainty": [uncertainty],
    }
