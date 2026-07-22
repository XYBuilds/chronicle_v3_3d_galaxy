#!/usr/bin/env python3
"""Local-only Phase 42.6 monthly lifecycle production-gate evidence.

Runs deterministic fixture activation, nightly reuse, rollback/freeze/force checks, then
invokes the real web loader and Planet exporter through a localhost-only fake adapter.
It never reads raw CSVs or talks to R2/Pages.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from cron.emission_profile_release import (  # noqa: E402
    ProfileReleaseError,
    build_assets_manifest,
    build_monthly_refit_meta_payload,
    decide_activation,
    immutable_profile_key,
    pointer_from_profile,
    write_json_atomic,
)
from cron.monthly_profile_generator import (  # noqa: E402
    calculate_drift_metrics,
    generate_monthly_profile,
)

FIXTURE = ROOT / "scripts" / "tests" / "phase42_monthly_nightly.fixture.json"
DEFAULT_OUTPUT = ROOT / "data" / "runs" / "phase42" / "p42.6-production-gate"


def git_commit() -> str:
    completed = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, capture_output=True, check=True)
    commit = completed.stdout.strip()
    assert_gate(re.fullmatch(r"[a-f0-9]{40}", commit) is not None, "git rev-parse HEAD must return a 40-hex commit")
    return commit


def profile_fingerprint(profile: Mapping[str, Any]) -> dict[str, Any]:
    samples = profile.get("samples")
    assert_gate(isinstance(samples, list) and len(samples) == 201, "active profile must have 201 samples")
    return {
        "profile_id": profile["profile_id"],
        "curve_sha256": profile["curve_sha256"],
        "samples": samples,
        "samples_sha256": hashlib.sha256(json.dumps(samples, separators=(",", ":")).encode("utf-8")).hexdigest(),
        "source_data_version": profile["source_data_version"],
        "source_movie_count": profile["source_movie_count"],
        "source_data_sha256": profile["source_data_sha256"],
    }


def assert_gate(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(f"[P42.6 gate] {message}")


def stable_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(stable_json(value), encoding="utf-8", newline="\n")


@dataclass
class FakeLocalPublicationAdapter:
    """Filesystem-only immutable object store and atomic-pointer boundary."""

    root: Path
    profiles: dict[str, dict[str, Any]] = field(default_factory=dict)
    active: dict[str, Any] | None = None

    def upload_immutable(self, profile: Mapping[str, Any]) -> Path:
        profile_id = str(profile["profile_id"])
        destination = self.root / "raw" / "fake-r2" / immutable_profile_key("galaxy", profile_id)
        if destination.exists():
            assert_gate(json.loads(destination.read_text(encoding="utf-8")) == dict(profile), "immutable profile content changed")
        else:
            write_json_atomic(destination, profile)
        self.profiles[profile_id] = dict(profile)
        return destination

    def update_pointer(self, pointer: Mapping[str, Any], *, fail: bool = False) -> None:
        if fail:
            raise RuntimeError("injected local pointer update failure")
        candidate = dict(pointer)
        assert_gate(str(candidate["profile_id"]) in self.profiles, "pointer target was not uploaded immutable")
        self.active = candidate
        write_json_atomic(self.root / "raw" / "fake-r2" / "galaxy" / "focus-emission-profiles" / "active.json", candidate)

    def read_active_profile(self) -> tuple[dict[str, Any], dict[str, Any]]:
        pointer_path = self.root / "raw" / "fake-r2" / "galaxy" / "focus-emission-profiles" / "active.json"
        pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
        profile_path = self.root / "raw" / "fake-r2" / immutable_profile_key("galaxy", str(pointer["profile_id"]))
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        assert_gate(profile["profile_id"] == pointer["profile_id"], "fake active pointer/profile id mismatch")
        assert_gate(profile["curve_sha256"] == pointer["curve_sha256"], "fake active pointer/profile curve mismatch")
        return pointer, profile


def profile_for(export: Mapping[str, Any], *, period: str, generated_at: str, commit: str) -> dict[str, Any]:
    metadata = {**export["meta"], "threshold_version": export["meta"].get("threshold_version", "dynamic-vote-count-v42")}
    return generate_monthly_profile(
        export["movies"], metadata, period=period, generated_at=generated_at, git_commit=commit,
    )


def manifest_for(pointer: Mapping[str, Any], *, data_version: str, exported_at: str) -> dict[str, Any]:
    profile_id = str(pointer["profile_id"])
    return build_assets_manifest(
        galaxy_url="https://assets.fixture.invalid/galaxy/releases/local/galaxy_data.json.gz",
        search_url="https://assets.fixture.invalid/galaxy/releases/local/galaxy_search_index.json.gz",
        data_version=data_version,
        exported_at=exported_at,
        r2_object_keys={"galaxy_data": "local/galaxy_data.json.gz", "galaxy_search_index": "local/galaxy_search_index.json.gz"},
        active_pointer=pointer,
        profile_url=f"https://assets.fixture.invalid/{immutable_profile_key('galaxy', profile_id)}",
    )


def create_planet_fixture(monthly: Mapping[str, Any]) -> dict[str, Any]:
    """Minimal final-export-shaped fixture, read by actual Planet exporter, not a mocked renderer."""
    source = monthly["movies"][0]
    movies = [{
        "x": 0.0, "y": 0.0, "z": 2000.0, "size": 1.0, "emissive": 0.5,
        "genre_color": [0.5, 0.5, 0.5], "genre_hue": 0.0,
        "title": "P42.6 same-movie", "original_title": "P42.6 same-movie",
        "overview": "local fixture", "tagline": None, "release_date": "2000-01-01", "genres": ["Drama"],
        "original_language": "en", "vote_count": 100, "vote_average": float(source["vote_average"]), "popularity": 1.0,
        "imdb_rating": None, "imdb_votes": None, "runtime": None, "revenue": 0, "budget": 0,
        "production_countries": [], "production_companies": [], "spoken_languages": [], "cast": [], "director": [],
        "writers": [], "producers": [], "director_of_photography": [], "music_composer": [], "poster_url": "",
        "id": int(source["id"]), "imdb_id": source.get("imdb_id"),
    }]
    return {
        "meta": {
            "version": monthly["meta"]["version"], "generated_at": monthly["meta"]["generated_at"], "count": len(movies),
            "search_normalize_version": "v2", "embedding_model": "fixture", "umap_params": {"n_neighbors": 15, "min_dist": 0.1, "metric": "cosine", "random_state": 42, "densmap": True},
            "genre_weight_ratio": 0.5, "has_genre_hue": True, "genre_palette": {"Drama": "#808080"},
            "feature_weights": {"text": 1, "genre": 1, "lang": 0}, "z_range": [2000, 2000], "xy_range": {"x": [0, 0], "y": [0, 0]},
        },
        "movies": movies,
    }


def run(output: Path) -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    monthly = fixture["monthly_export"]
    nightly = fixture["nightly_export"]
    shutil.rmtree(output, ignore_errors=True)
    (output / "raw").mkdir(parents=True)
    (output / "derived").mkdir()
    write_json(output / "raw" / "monthly-export.json", monthly)
    write_json(output / "raw" / "nightly-export-vote-average-changed.json", nightly)

    commit = git_commit()
    adapter = FakeLocalPublicationAdapter(output)
    initial = profile_for(monthly, period="2026-07", generated_at="2026-07-22T02:00:00.000Z", commit=commit)
    initial_decision = decide_activation(candidate_profile=initial, existing_active_pointer=None, activated_at="2026-07-22T02:30:00.000Z")
    assert_gate(initial_decision.action == "activated", "first fixture candidate must activate")
    immutable_initial = adapter.upload_immutable(initial)
    adapter.update_pointer(initial_decision.pointer)
    initial_active_pointer, initial_active_profile = adapter.read_active_profile()
    assert_gate(initial_active_pointer == initial_decision.pointer, "initial active pointer did not persist")
    initial_manifest = manifest_for(initial_active_pointer, data_version=str(monthly["meta"]["version"]), exported_at=str(monthly["meta"]["generated_at"]))
    write_json(output / "derived" / "initial-profile.json", initial)
    write_json(output / "derived" / "initial-manifest.json", initial_manifest)
    write_json(output / "raw" / "planet-export-fixture.json", create_planet_fixture(monthly))

    # B: reconcile both points through a fresh fake immutable-pointer/object read, never a retained object.
    nightly_active_pointer, nightly_active_profile = adapter.read_active_profile()
    nightly_manifest = manifest_for(nightly_active_pointer, data_version=str(nightly["meta"]["version"]), exported_at=str(nightly["meta"]["generated_at"]))
    before = profile_fingerprint(initial_active_profile)
    after = profile_fingerprint(nightly_active_profile)
    assert_gate(nightly_manifest["data_version"] != initial_manifest["data_version"], "nightly data version must change")
    assert_gate(before == after, "nightly fake-pointer/object re-read changed active profile or full LUT")
    assert_gate(nightly_manifest["focus_emission_profile"] == initial_manifest["focus_emission_profile"], "nightly changed active pointer")
    write_json(output / "derived" / "nightly-profile-reuse.json", {
        "entry": "fake-r2/active.json -> immutable profile object re-read", "before": before, "after": after,
        "assertions": {"profile_id": "pass", "curve_sha256": "pass", "samples_201": "pass", "samples_sha256": "pass", "source_provenance": "pass"},
    })
    write_json(output / "derived" / "nightly-manifest.json", nightly_manifest)

    # C: a valid immutable candidate is uploaded, then pointer update fails; old active survives and can roll back.
    failed_candidate = profile_for(nightly, period="2026-08", generated_at="2026-08-01T02:00:00.000Z", commit=commit)
    adapter.upload_immutable(failed_candidate)
    failed_decision = decide_activation(candidate_profile=failed_candidate, existing_active_pointer=adapter.active, activated_at="2026-08-01T02:30:00.000Z")
    failure_reason: str
    try:
        adapter.update_pointer(failed_decision.pointer, fail=True)
    except RuntimeError as error:
        failure_reason = str(error)
    else:  # pragma: no cover - defensive gate
        raise AssertionError("injected pointer failure did not fail")
    failed_active_pointer, _failed_active_profile = adapter.read_active_profile()
    assert_gate(failed_active_pointer == initial_active_pointer, "failed pointer update replaced old active profile")
    failure_meta = build_monthly_refit_meta_payload({}, candidate_profile=failed_candidate, active_pointer=failed_active_pointer, decision=None, failure_reason=failure_reason)
    failure_meta["emission_profile"]["rollback_targets"] = sorted(adapter.profiles)
    write_json(output / "derived" / "failure-rollback-meta.json", failure_meta)

    # D: same monthly period freezes by default; explicit force moves pointer with complete audit.
    same_month_candidate = profile_for(nightly, period="2026-07", generated_at="2026-07-23T02:00:00.000Z", commit=commit)
    adapter.upload_immutable(same_month_candidate)
    frozen = decide_activation(candidate_profile=same_month_candidate, existing_active_pointer=adapter.active, activated_at="2026-07-23T02:30:00.000Z")
    assert_gate(frozen.action == "frozen-same-period" and frozen.pointer == adapter.active, "same-period rerun must freeze")
    forced = decide_activation(candidate_profile=same_month_candidate, existing_active_pointer=adapter.active, force=True, reason="local production-gate fixture force activation", actor="phase42.6-local-gate", activated_at="2026-07-23T03:00:00.000Z")
    adapter.update_pointer(forced.pointer)
    assert_gate(forced.audit["old_profile_id"] == initial["profile_id"] and forced.audit["new_profile_id"] == same_month_candidate["profile_id"], "force audit old/new mismatch")
    assert_gate(all(forced.audit[key] for key in ("reason", "actor", "activated_at")), "force audit incomplete")
    write_json(output / "derived" / "same-period-freeze.json", {"decision": frozen.action, "pointer": frozen.pointer, "audit": frozen.audit})
    write_json(output / "derived" / "force-activation-audit.json", {"decision": forced.action, "pointer": forced.pointer, "audit": forced.audit, "drift": calculate_drift_metrics(same_month_candidate, initial)})

    summary = {
        "schema_version": "p42.6-local-production-gate-v1", "mode": "local-fixture-fake-adapter", "status": "pending-human-review",
        "reproduction_command": "python scripts/cron/run_p426_production_gate.py",
        "no_remote_operations": True,
        "git_commit": commit,
        "initial_activation": {"profile_id": initial["profile_id"], "curve_sha256": initial["curve_sha256"], "sample_count": len(initial["samples"]), "source_data_version": initial["source_data_version"], "source_movie_count": initial["source_movie_count"], "immutable_path": str(immutable_initial.relative_to(output))},
        "nightly": {"data_version": nightly_manifest["data_version"], "vote_average_changed": True, "profile_reuse_evidence": "derived/nightly-profile-reuse.json", "before": before, "after": after},
        "failure": {"step": "pointer-update", "reason": failure_reason, "active_profile_id": initial["profile_id"], "rollback_targets": sorted(adapter.profiles)},
        "same_period": {"action": frozen.action, "force_action": forced.action, "audit": forced.audit},
    }
    write_json(output / "derived" / "lifecycle-summary.json", summary)
    website_command = ["npm.cmd", "exec", "tsx", "scripts/verify-p426-runtime.ts", "--", "--profile", str(output / "derived" / "initial-profile.json"), "--manifest", str(output / "derived" / "initial-manifest.json"), "--output", str(output / "derived" / "website-runtime.json")]
    website = subprocess.run(website_command, cwd=ROOT / "frontend", text=True, capture_output=True)
    (output / "derived" / "p426-website-runtime.stdout.log").write_text(website.stdout, encoding="utf-8")
    (output / "derived" / "p426-website-runtime.stderr.log").write_text(website.stderr, encoding="utf-8")
    if website.returncode != 0:
        raise RuntimeError(f"website runtime evidence failed; see {output / 'derived' / 'p426-website-runtime.stderr.log'}")
    command = ["npm.cmd", "exec", "tsx", "tools/planet-exporter/scripts/generate-p426-production-gate.ts", "--", "--evidence-root", str(output)]
    completed = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    (output / "derived" / "p426-render.stdout.log").write_text(completed.stdout, encoding="utf-8")
    (output / "derived" / "p426-render.stderr.log").write_text(completed.stderr, encoding="utf-8")
    if completed.returncode != 0:
        raise RuntimeError(f"actual runtime/exporter evidence failed; see {output / 'derived' / 'p426-render.stderr.log'}")
    print(json.dumps({"output": str(output), "initial_profile": initial["profile_id"], "forced_profile": same_month_candidate["profile_id"], "movie_count": len(monthly["movies"]), "rating_min": min(movie["vote_average"] for movie in monthly["movies"]), "rating_max": max(movie["vote_average"] for movie in monthly["movies"]), "emission_min": min(initial["samples"]), "emission_max": max(initial["samples"]), "curve_sha256": initial["curve_sha256"]}, sort_keys=True))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    run(args.output.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())