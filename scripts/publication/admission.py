"""Protected-ref admission, resource-group verification, and Windows takeover."""
from __future__ import annotations

from typing import Any, Mapping

from publication.errors import PublicationError

RESOURCE_GROUP = "galaxy-r2-pages-release"
PROCESS_MODE = "oldest_first"
PRODUCTION_MODES = frozenset({"production", "windows-emergency"})


def admit_protected_ref(request: Mapping[str, Any]) -> dict[str, Any]:
    ref = str(request.get("ref") or "")
    protected = request.get("protected") is True
    pipeline_source = str(request.get("pipeline_source") or "")
    mode = str(request.get("mode") or "")
    if mode in PRODUCTION_MODES:
        if ref != "main" or not protected:
            raise PublicationError("production publication is restricted to protected main")
        if pipeline_source in {"merge_request_event", "fork", "branch", "external_pull_request_event"}:
            raise PublicationError("merge-request, fork, and ordinary branch pipelines cannot enter production paths")
    return {"ref": ref, "protected": protected, "pipeline_source": pipeline_source, "mode": mode}


def validate_resource_group(observed: Mapping[str, Any]) -> dict[str, Any]:
    if observed.get("key") != RESOURCE_GROUP:
        raise PublicationError("publication resource group must be galaxy-r2-pages-release")
    if observed.get("process_mode") != PROCESS_MODE:
        raise PublicationError("publication resource group must use oldest_first process mode")
    if observed.get("source") != "api":
        raise PublicationError("publication resource group must be verified through the provider API")
    return {
        "key": RESOURCE_GROUP,
        "process_mode": PROCESS_MODE,
        "source": "api",
    }


def prove_local_takeover(hosted: Mapping[str, Any]) -> dict[str, Any]:
    if hosted.get("authority_ambiguous") is True:
        raise PublicationError("local takeover stops when hosted publication authority is ambiguous")
    if hosted.get("accessible") is True:
        if hosted.get("triggers_paused") is not True:
            raise PublicationError("local takeover requires paused hosted publication triggers")
        if hosted.get("running_or_queued") is True:
            raise PublicationError("local takeover requires no hosted publication job running or queued")
    else:
        if hosted.get("schedule_inactive") is not True:
            raise PublicationError("local takeover requires proof that the hosted schedule is inactive")
        if hosted.get("running_or_queued") is True:
            raise PublicationError("local takeover requires no hosted publication job remaining active")
    return {"ok": True, "path": "windows-emergency"}
