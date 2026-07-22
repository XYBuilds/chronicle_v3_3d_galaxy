#!/usr/bin/env python3
"""Pure release-state helpers for the frozen monthly Focus emission profile.

The module owns activation decisions and manifest assembly only.  CDF/LUT generation
and validation remain in :mod:`monthly_profile_generator`.
"""
from __future__ import annotations

import json
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse

try:  # Direct CLI execution vs tests importing ``cron`` as a package.
    from cron.monthly_profile_generator import MonthlyProfileError, _validate_profile
except ModuleNotFoundError:  # pragma: no cover - exercised by direct workflow invocation
    from monthly_profile_generator import MonthlyProfileError, _validate_profile

_PERIOD_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_PROFILE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,127}$")
_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")


class ProfileReleaseError(ValueError):
    """A release state or provenance invariant was violated."""


@dataclass(frozen=True)
class ActivationDecision:
    action: str
    pointer: dict[str, Any]
    audit: dict[str, Any]


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise ProfileReleaseError(message)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _valid_timestamp(value: Any, label: str) -> str:
    _assert(isinstance(value, str), f"{label} must be a UTC timestamp")
    text = value.strip()
    _assert(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z", text) is not None, f"{label} must be UTC ISO-8601")
    try:
        datetime.fromisoformat(text[:-1] + "+00:00")
    except ValueError as exc:
        raise ProfileReleaseError(f"{label} must be a valid timestamp") from exc
    return text


def pointer_from_profile(profile: Mapping[str, Any], *, activated_at: str) -> dict[str, Any]:
    """Create the minimal runtime pointer from an already validated immutable profile."""
    try:
        validated = _validate_profile(profile)
    except MonthlyProfileError as exc:
        raise ProfileReleaseError(f"invalid profile candidate: {exc}") from exc
    return {
        "profile_id": validated["profile_id"],
        "period": validated["period"],
        "model_version": validated["model_version"],
        "curve_sha256": validated["curve_sha256"],
        "source_data_version": validated["source_data_version"],
        "source_movie_count": validated["source_movie_count"],
        "status": "active",
        "activated_at": _valid_timestamp(activated_at, "activated_at"),
    }


def validate_active_pointer(raw: Mapping[str, Any]) -> dict[str, Any]:
    """Validate the release pointer consumed by R2 publication and the web manifest."""
    _assert(isinstance(raw, Mapping), "active profile pointer must be an object")
    allowed = {
        "profile_id", "period", "model_version", "curve_sha256",
        "source_data_version", "source_movie_count", "status", "activated_at",
    }
    _assert(set(raw) == allowed, "active profile pointer has unexpected or missing fields")
    _assert(isinstance(raw["profile_id"], str) and _PROFILE_ID_RE.fullmatch(raw["profile_id"]) is not None, "active pointer profile_id invalid")
    _assert(isinstance(raw["period"], str) and _PERIOD_RE.fullmatch(raw["period"]) is not None, "active pointer period invalid")
    _assert(raw["model_version"] == "rating-midrank-cdf-lut-v1", "active pointer model_version mismatch")
    _assert(isinstance(raw["curve_sha256"], str) and _SHA256_RE.fullmatch(raw["curve_sha256"]) is not None, "active pointer curve_sha256 invalid")
    _assert(isinstance(raw["source_data_version"], str) and bool(raw["source_data_version"].strip()), "active pointer source_data_version missing")
    count = raw["source_movie_count"]
    _assert(isinstance(count, int) and not isinstance(count, bool) and count > 0, "active pointer source_movie_count invalid")
    _assert(raw["status"] == "active", "active pointer status must be active")
    _valid_timestamp(raw["activated_at"], "active pointer activated_at")
    return dict(raw)


def verify_profile_matches_active_pointer(profile: Mapping[str, Any], pointer: Mapping[str, Any]) -> dict[str, Any]:
    """Validate a downloaded immutable artifact against the pointer that names it."""
    active = validate_active_pointer(pointer)
    try:
        validated = _validate_profile(profile)
    except MonthlyProfileError as exc:
        raise ProfileReleaseError(f"invalid active profile artifact: {exc}") from exc
    for key in ("profile_id", "period", "model_version", "curve_sha256", "source_data_version", "source_movie_count"):
        _assert(validated[key] == active[key], f"active profile artifact {key} does not match pointer")
    return validated


def decide_activation(
    *,
    candidate_profile: Mapping[str, Any],
    existing_active_pointer: Mapping[str, Any] | None,
    force: bool = False,
    reason: str | None = None,
    actor: str | None = None,
    activated_at: str | None = None,
) -> ActivationDecision:
    """Freeze same-month reruns unless an explicit, fully audited force is supplied."""
    now = _valid_timestamp(activated_at or _utc_now(), "activated_at")
    candidate = pointer_from_profile(candidate_profile, activated_at=now)
    previous = validate_active_pointer(existing_active_pointer) if existing_active_pointer is not None else None
    if force:
        _assert(isinstance(reason, str) and bool(reason.strip()), "force activation requires a non-empty reason")
        _assert(isinstance(actor, str) and bool(actor.strip()), "force activation requires an actor/source")
        return ActivationDecision(
            action="activated-force",
            pointer=candidate,
            audit={
                "action": "force-activation",
                "old_profile_id": None if previous is None else previous["profile_id"],
                "new_profile_id": candidate["profile_id"],
                "reason": reason.strip(),
                "actor": actor.strip(),
                "activated_at": now,
            },
        )
    if previous is not None and previous["period"] == candidate["period"]:
        return ActivationDecision(
            action="frozen-same-period",
            pointer=previous,
            audit={
                "action": "same-period-freeze",
                "old_profile_id": previous["profile_id"],
                "candidate_profile_id": candidate["profile_id"],
                "period": candidate["period"],
            },
        )
    _assert(previous is None or candidate["period"] > previous["period"], "ordinary activation cannot move the active period backwards")
    return ActivationDecision(
        action="activated",
        pointer=candidate,
        audit={
            "action": "monthly-activation",
            "old_profile_id": None if previous is None else previous["profile_id"],
            "new_profile_id": candidate["profile_id"],
            "activated_at": now,
        },
    )


def immutable_profile_key(prefix: str, profile_id: str) -> str:
    _assert(_PROFILE_ID_RE.fullmatch(profile_id) is not None, "profile_id invalid for immutable key")
    base = prefix.strip().strip("/")
    return f"{base}/focus-emission-profiles/{profile_id}.json" if base else f"focus-emission-profiles/{profile_id}.json"


def active_pointer_key(prefix: str) -> str:
    base = prefix.strip().strip("/")
    return f"{base}/focus-emission-profiles/active.json" if base else "focus-emission-profiles/active.json"


def immutable_profile_url(public_base: str, profile_key: str) -> str:
    base = public_base.rstrip("/")
    _assert(base.startswith("https://") or base.startswith("http://"), "R2 public base URL must be http(s)")
    url = f"{base}/{profile_key.lstrip('/')}"
    validate_profile_url(url, profile_id=profile_key.rsplit("/", 1)[-1].removesuffix(".json"))
    return url


def validate_profile_url(value: str, *, profile_id: str) -> str:
    _assert(isinstance(value, str) and bool(value.strip()), "profile URL is required")
    url = value.strip()
    parsed = urlparse(url)
    _assert(parsed.scheme in {"https", "http"} and bool(parsed.netloc), "profile URL must be absolute http(s)")
    _assert(parsed.username is None and parsed.password is None, "profile URL must not include userinfo credentials")
    _assert(not parsed.query and not parsed.fragment, "immutable profile URL must not include a query or fragment")
    _assert(parsed.path.endswith(f"/focus-emission-profiles/{profile_id}.json"), "profile URL does not match immutable profile resource")
    return url


def validate_release_asset_url(value: str, *, label: str) -> str:
    _assert(isinstance(value, str) and bool(value.strip()), f"{label} URL is required")
    url = value.strip()
    parsed = urlparse(url)
    _assert(parsed.scheme in {"https", "http"} and bool(parsed.netloc), f"{label} URL must be absolute http(s)")
    _assert(parsed.username is None and parsed.password is None, f"{label} URL must not include userinfo credentials")
    return url


def build_assets_manifest(
    *,
    galaxy_url: str,
    search_url: str,
    data_version: str,
    exported_at: str,
    r2_object_keys: Mapping[str, str],
    active_pointer: Mapping[str, Any] | None,
    profile_url: str | None,
) -> dict[str, Any]:
    """Assemble the Pages manifest; omission retains legacy-manifest compatibility."""
    _assert(isinstance(galaxy_url, str) and bool(galaxy_url.strip()), "galaxy URL is required")
    _assert(isinstance(search_url, str) and bool(search_url.strip()), "search URL is required")
    _assert(isinstance(data_version, str) and bool(data_version.strip()), "data_version is required")
    _assert(isinstance(r2_object_keys, Mapping) and "galaxy_data" in r2_object_keys and "galaxy_search_index" in r2_object_keys, "R2 galaxy object keys are required")
    result: dict[str, Any] = {
        "galaxy_data_gzip_url": validate_release_asset_url(galaxy_url, label="galaxy"),
        "galaxy_search_index_gzip_url": validate_release_asset_url(search_url, label="search"),
        "data_version": data_version.strip(),
        "exported_at": _valid_timestamp(exported_at, "exported_at"),
        "r2_object_keys": dict(r2_object_keys),
    }
    if active_pointer is None:
        _assert(profile_url is None, "profile URL requires an active pointer")
        return result
    pointer = validate_active_pointer(active_pointer)
    _assert(profile_url is not None, "active pointer requires an immutable profile URL")
    result["focus_emission_profile"] = pointer
    result["focus_emission_profile_url"] = validate_profile_url(profile_url, profile_id=pointer["profile_id"])
    return result


def write_json_atomic(path: Path, payload: Mapping[str, Any]) -> None:
    """Write a small pointer/manifest only after all its fields have been validated."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    text = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def build_monthly_refit_meta_payload(
    existing: Mapping[str, Any] | None,
    *,
    candidate_profile: Mapping[str, Any] | None,
    active_pointer: Mapping[str, Any] | None,
    decision: ActivationDecision | None,
    failure_reason: str | None = None,
    candidate_drift: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Validate existing monthly metadata and construct its complete next payload without writing."""
    _assert(existing is None or isinstance(existing, Mapping), "monthly_refit_meta.json must be an object")
    current = {} if existing is None else dict(existing)
    profile_state: dict[str, Any] = {"candidate": None, "active": None, "failure_reason": failure_reason}
    if candidate_profile is not None:
        candidate = _validate_profile(candidate_profile)
        profile_state["candidate"] = {
            "profile_id": candidate["profile_id"], "period": candidate["period"],
            "curve_sha256": candidate["curve_sha256"], "source_data_version": candidate["source_data_version"],
            "source_movie_count": candidate["source_movie_count"],
        }
        if candidate_drift is not None:
            _assert(isinstance(candidate_drift, Mapping), "candidate drift must be an object")
            profile_state["drift"] = dict(candidate_drift)
    if active_pointer is not None:
        profile_state["active"] = validate_active_pointer(active_pointer)
    if decision is not None:
        profile_state["candidate_status"] = decision.action
        profile_state["activation_audit"] = decision.audit
    current["emission_profile"] = profile_state
    return current


def load_monthly_refit_meta(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ProfileReleaseError(f"cannot read monthly_refit_meta.json: {exc}") from exc
    _assert(isinstance(loaded, dict), "monthly_refit_meta.json must be an object")
    return dict(loaded)


def update_monthly_refit_meta(
    path: Path,
    *,
    candidate_profile: Mapping[str, Any] | None,
    active_pointer: Mapping[str, Any] | None,
    decision: ActivationDecision | None,
    failure_reason: str | None = None,
    candidate_drift: Mapping[str, Any] | None = None,
) -> None:
    """Compatibility wrapper for failure paths that need to construct and atomically write evidence."""
    write_json_atomic(path, build_monthly_refit_meta_payload(
        load_monthly_refit_meta(path), candidate_profile=candidate_profile,
        active_pointer=active_pointer, decision=decision, failure_reason=failure_reason,
        candidate_drift=candidate_drift,
    ))