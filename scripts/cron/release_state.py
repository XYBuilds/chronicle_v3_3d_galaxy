#!/usr/bin/env python3
"""Reusable stage-level release identities for Chronicle publication.

Models Light Refresh, Galaxy Refit, Data Release, and Site Release as distinct
concepts with per-candidate stage records. This is not a global release ledger:
each candidate owns its own records, a completed upstream stage cannot be rewritten
as failed, and consumers stay on last-known-good until Pages promotion succeeds.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping, MutableMapping

CONCEPTS = ("light_refresh", "galaxy_refit", "data_release", "site_release")

STAGE_ORDER: dict[str, tuple[str, ...]] = {
    "light_refresh": ("compute",),
    "galaxy_refit": ("compute",),
    "data_release": (
        "candidate_validation",
        "og_projection",
        "immutable_publication",
        "pages_promotion",
        "smoke",
    ),
    "site_release": (
        "artifact_build",
        "artifact_verify",
        "pages_deploy",
        "smoke",
        "mark_active",
    ),
}

DATA_RELEASE_STAGES = STAGE_ORDER["data_release"]
SITE_RELEASE_STAGES = STAGE_ORDER["site_release"]
_REQUIRED_FIELDS = (
    "stage",
    "release_identity",
    "inputs",
    "attempted_mutations",
    "outputs",
    "artifact_hashes",
    "result",
    "recorded_at",
    "manual",
)
_RESULTS = ("succeeded", "failed", "skipped")


class ReleaseStateError(ValueError):
    """A stage record violated a release-state invariant."""


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise ReleaseStateError(message)


def _validate_record(record: Mapping[str, Any], *, candidate_id: str, concept: str) -> dict[str, Any]:
    _assert(isinstance(record, Mapping), "stage record must be an object")
    missing = [field for field in _REQUIRED_FIELDS if field not in record]
    _assert(not missing, f"stage record missing fields: {', '.join(missing)}")
    stage = record["stage"]
    _assert(isinstance(stage, str) and stage in STAGE_ORDER[concept], f"unknown stage {stage!r} for {concept}")
    _assert(record["release_identity"] == candidate_id, "release_identity must match candidate_id")
    _assert(isinstance(record["inputs"], Mapping), "inputs must be an object")
    _assert(isinstance(record["attempted_mutations"], list), "attempted_mutations must be a list")
    _assert(isinstance(record["outputs"], Mapping), "outputs must be an object")
    _assert(isinstance(record["artifact_hashes"], Mapping), "artifact_hashes must be an object")
    _assert(record["result"] in _RESULTS, "result must be succeeded, failed, or skipped")
    _assert(isinstance(record["recorded_at"], str) and record["recorded_at"].endswith("Z"), "recorded_at must be UTC")
    manual = record["manual"]
    _assert(isinstance(manual, bool), "manual must be a boolean")
    payload = {field: record[field] for field in _REQUIRED_FIELDS}
    if manual:
        actor = record.get("actor")
        reason = record.get("reason")
        _assert(isinstance(actor, str) and bool(actor.strip()), "manual stage requires actor")
        _assert(isinstance(reason, str) and bool(reason.strip()), "manual stage requires reason")
        payload["actor"] = actor.strip()
        payload["reason"] = reason.strip()
    return payload


def _published(concept: str, stages: Mapping[str, Any]) -> bool:
    if concept not in {"data_release", "site_release"}:
        return False
    return all(
        isinstance(stages.get(stage), Mapping) and stages[stage].get("result") == "succeeded"
        for stage in STAGE_ORDER[concept]
    )


def record_stage(
    store: MutableMapping[str, dict[str, Any]],
    *,
    concept: str,
    candidate_id: str,
    record: Mapping[str, Any],
) -> dict[str, Any]:
    """Persist one stage result onto a candidate without rewriting succeeded upstream stages."""
    _assert(concept in CONCEPTS, f"unknown concept {concept!r}")
    _assert(isinstance(candidate_id, str) and bool(candidate_id.strip()), "candidate_id is required")
    payload = _validate_record(record, candidate_id=candidate_id, concept=concept)
    existing = store.get(candidate_id)
    if existing is None:
        candidate: dict[str, Any] = {
            "candidate_id": candidate_id,
            "concept": concept,
            "stages": {},
            "published": False,
        }
    else:
        _assert(existing["concept"] == concept, "candidate concept cannot change")
        candidate = {
            "candidate_id": existing["candidate_id"],
            "concept": existing["concept"],
            "stages": dict(existing["stages"]),
            "published": bool(existing.get("published")),
        }
    prior = candidate["stages"].get(payload["stage"])
    if isinstance(prior, Mapping) and prior.get("result") == "succeeded":
        raise ReleaseStateError(f"stage {payload['stage']!r} already succeeded")
    expected = continuation_point(candidate) if candidate["stages"] else STAGE_ORDER[concept][0]
    _assert(payload["stage"] == expected, f"stage {payload['stage']!r} is not the continuation point {expected!r}")
    candidate["stages"][payload["stage"]] = payload
    candidate["published"] = _published(concept, candidate["stages"])
    store[candidate_id] = candidate
    return dict(candidate)


def load_candidate(store: Mapping[str, Mapping[str, Any]], candidate_id: str) -> dict[str, Any]:
    candidate = store.get(candidate_id)
    _assert(candidate is not None, f"unknown candidate {candidate_id!r}")
    return {
        "candidate_id": candidate["candidate_id"],
        "concept": candidate["concept"],
        "stages": dict(candidate["stages"]),
        "published": bool(candidate.get("published")),
    }


def continuation_point(candidate: Mapping[str, Any]) -> str | None:
    """Return the first unfinished stage, or None when the candidate is complete."""
    _assert(isinstance(candidate, Mapping), "candidate must be an object")
    concept = candidate.get("concept")
    _assert(concept in CONCEPTS, "candidate concept is required")
    stages = candidate.get("stages")
    _assert(isinstance(stages, Mapping), "candidate stages must be an object")
    for stage in STAGE_ORDER[concept]:
        record = stages.get(stage)
        if not isinstance(record, Mapping) or record.get("result") != "succeeded":
            return stage
    return None


def read_store(path: Path) -> dict[str, dict[str, Any]]:
    """Load a per-candidate JSON store. Missing files start empty; corrupt files fail closed."""
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReleaseStateError(f"candidate store is unreadable: {exc}") from exc
    _assert(isinstance(payload, dict), "candidate store must be an object")
    return {str(key): dict(value) for key, value in payload.items()}


def write_store(path: Path, store: Mapping[str, Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(store, indent=2, sort_keys=True) + "\n", encoding="utf-8")
