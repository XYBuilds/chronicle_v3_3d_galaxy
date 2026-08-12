"""Stage-level release identities and candidate continuation (#387)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.release_state import (  # noqa: E402
    CONCEPTS,
    DATA_RELEASE_STAGES,
    ReleaseStateError,
    continuation_point,
    load_candidate,
    read_store,
    record_stage,
    write_store,
)

NOW = "2026-08-13T04:00:00.000Z"
CANDIDATE_ID = "data-2026.08.13.1-aabbccddeeff0011"


def _store() -> dict[str, dict[str, object]]:
    return {}


def _stage(
    name: str,
    *,
    result: str = "succeeded",
    mutations: list[str] | None = None,
    outputs: dict[str, str] | None = None,
    hashes: dict[str, str] | None = None,
    manual: bool = False,
    actor: str | None = None,
    reason: str | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "stage": name,
        "release_identity": CANDIDATE_ID,
        "inputs": {"data_version": "2026.08.13.1"},
        "attempted_mutations": mutations or [],
        "outputs": outputs or {"manifest": "galaxy/releases/2026.08.13.1-aabbccddeeff0011/galaxy_data.json.gz"},
        "artifact_hashes": hashes or {"galaxy_data.json.gz": "a" * 64},
        "result": result,
        "recorded_at": NOW,
        "manual": manual,
    }
    if actor is not None:
        payload["actor"] = actor
    if reason is not None:
        payload["reason"] = reason
    return payload


def test_concepts_are_the_four_accepted_release_identities() -> None:
    assert CONCEPTS == ("light_refresh", "galaxy_refit", "data_release", "site_release")
    assert DATA_RELEASE_STAGES == (
        "candidate_validation",
        "og_projection",
        "immutable_publication",
        "pages_promotion",
        "smoke",
    )


def test_successful_stage_is_retrievable_on_the_candidate() -> None:
    store = _store()
    record_stage(store, concept="data_release", candidate_id=CANDIDATE_ID, record=_stage("candidate_validation"))
    candidate = load_candidate(store, CANDIDATE_ID)
    assert candidate["concept"] == "data_release"
    assert candidate["candidate_id"] == CANDIDATE_ID
    assert candidate["published"] is False
    assert candidate["stages"]["candidate_validation"]["result"] == "succeeded"


def test_continuation_starts_at_the_first_unfinished_data_release_stage() -> None:
    store = _store()
    record_stage(store, concept="data_release", candidate_id=CANDIDATE_ID, record=_stage("candidate_validation"))
    record_stage(
        store,
        concept="data_release",
        candidate_id=CANDIDATE_ID,
        record=_stage("og_projection", result="failed", mutations=["kv:movie:1"]),
    )
    assert continuation_point(load_candidate(store, CANDIDATE_ID)) == "og_projection"


def test_downstream_failure_does_not_rewrite_a_completed_upstream_stage() -> None:
    store = _store()
    record_stage(store, concept="data_release", candidate_id=CANDIDATE_ID, record=_stage("candidate_validation"))
    record_stage(store, concept="data_release", candidate_id=CANDIDATE_ID, record=_stage("og_projection"))
    record_stage(
        store,
        concept="data_release",
        candidate_id=CANDIDATE_ID,
        record=_stage("immutable_publication", result="failed"),
    )
    with pytest.raises(ReleaseStateError, match="already succeeded"):
        record_stage(
            store,
            concept="data_release",
            candidate_id=CANDIDATE_ID,
            record=_stage("og_projection", result="failed"),
        )
    candidate = load_candidate(store, CANDIDATE_ID)
    assert candidate["stages"]["og_projection"]["result"] == "succeeded"
    assert candidate["stages"]["immutable_publication"]["result"] == "failed"
    assert continuation_point(candidate) == "immutable_publication"


def test_failed_stage_can_be_retried_without_recomputing_earlier_stages() -> None:
    store = _store()
    record_stage(store, concept="data_release", candidate_id=CANDIDATE_ID, record=_stage("candidate_validation"))
    record_stage(
        store,
        concept="data_release",
        candidate_id=CANDIDATE_ID,
        record=_stage("og_projection", result="failed"),
    )
    record_stage(store, concept="data_release", candidate_id=CANDIDATE_ID, record=_stage("og_projection"))
    candidate = load_candidate(store, CANDIDATE_ID)
    assert candidate["stages"]["candidate_validation"]["result"] == "succeeded"
    assert candidate["stages"]["og_projection"]["result"] == "succeeded"
    assert continuation_point(candidate) == "immutable_publication"


def test_data_release_is_unpublished_until_smoke_succeeds() -> None:
    store = _store()
    for stage in DATA_RELEASE_STAGES[:-1]:
        record_stage(store, concept="data_release", candidate_id=CANDIDATE_ID, record=_stage(stage))
    candidate = load_candidate(store, CANDIDATE_ID)
    assert candidate["published"] is False
    assert continuation_point(candidate) == "smoke"
    record_stage(store, concept="data_release", candidate_id=CANDIDATE_ID, record=_stage("smoke"))
    published = load_candidate(store, CANDIDATE_ID)
    assert published["published"] is True
    assert continuation_point(published) is None


def test_cannot_skip_ahead_of_the_continuation_point() -> None:
    store = _store()
    with pytest.raises(ReleaseStateError, match="continuation"):
        record_stage(store, concept="data_release", candidate_id=CANDIDATE_ID, record=_stage("pages_promotion"))


def test_manual_stage_requires_actor_and_reason() -> None:
    store = _store()
    with pytest.raises(ReleaseStateError, match="actor"):
        record_stage(
            store,
            concept="data_release",
            candidate_id=CANDIDATE_ID,
            record=_stage("candidate_validation", manual=True, reason="retry"),
        )
    with pytest.raises(ReleaseStateError, match="reason"):
        record_stage(
            store,
            concept="data_release",
            candidate_id=CANDIDATE_ID,
            record=_stage("candidate_validation", manual=True, actor="XYBuilds"),
        )


def test_light_refresh_and_site_release_use_their_own_stage_orders() -> None:
    store = _store()
    record_stage(
        store,
        concept="light_refresh",
        candidate_id="light-1",
        record={
            "stage": "compute",
            "release_identity": "light-1",
            "inputs": {"membership": "current"},
            "attempted_mutations": ["supabase:votes"],
            "outputs": {"export": "galaxy_data.json.gz"},
            "artifact_hashes": {"galaxy_data.json.gz": "b" * 64},
            "result": "succeeded",
            "recorded_at": NOW,
            "manual": False,
        },
    )
    light = load_candidate(store, "light-1")
    assert light["concept"] == "light_refresh"
    assert continuation_point(light) is None
    record_stage(
        store,
        concept="site_release",
        candidate_id="site-1",
        record={
            "stage": "artifact_build",
            "release_identity": "site-1",
            "inputs": {"git_commit": "e9a2608"},
            "attempted_mutations": [],
            "outputs": {"artifact_id": "site-aaaa"},
            "artifact_hashes": {"bundle": "c" * 64},
            "result": "succeeded",
            "recorded_at": NOW,
            "manual": False,
        },
    )
    site = load_candidate(store, "site-1")
    assert site["published"] is False
    assert continuation_point(site) == "artifact_verify"


def test_candidate_store_round_trips_json_bytes() -> None:
    store = _store()
    record_stage(store, concept="data_release", candidate_id=CANDIDATE_ID, record=_stage("candidate_validation"))
    raw = json.dumps(store[CANDIDATE_ID], sort_keys=True)
    restored = json.loads(raw)
    assert restored["stages"]["candidate_validation"]["artifact_hashes"]["galaxy_data.json.gz"] == "a" * 64


def test_candidate_store_persists_to_a_json_file(tmp_path: Path) -> None:
    store = _store()
    record_stage(store, concept="data_release", candidate_id=CANDIDATE_ID, record=_stage("candidate_validation"))
    path = tmp_path / "candidates.json"
    write_store(path, store)
    loaded = read_store(path)
    assert continuation_point(load_candidate(loaded, CANDIDATE_ID)) == "og_projection"
