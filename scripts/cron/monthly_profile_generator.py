#!/usr/bin/env python3
"""Generate the frozen monthly rating-to-emission profile from a final export.

This module deliberately consumes only the final ``{"meta": ..., "movies": [...]}``
export.  It does not read the raw dataset, update an active pointer, or publish
anything.  The profile JSON uses the same canonical JSON and midrank CDF rules as
``frontend/src/three/focusEmission.ts``.
"""
from __future__ import annotations

import argparse
import bisect
import gzip
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Mapping, Sequence

_REPO_ROOT = Path(__file__).resolve().parents[2]

SCHEMA_VERSION = "rating-emission-profile-v1"
MODEL_VERSION = "rating-midrank-cdf-lut-v1"
METHOD = "midrank-cdf-linear-lut-v1"
RATING_MIN = 0.0
RATING_MAX = 10.0
SAMPLE_STEP = 0.05
SAMPLE_COUNT = 201
INTENSITY_MIN = 0.005
INTENSITY_MAX = 0.65

_PROFILE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,127}$")
_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
_COMMIT_RE = re.compile(r"^[a-f0-9]{7,40}$")
_PERIOD_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


class MonthlyProfileError(ValueError):
    """Raised when a monthly final export cannot produce a valid profile."""


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise MonthlyProfileError(message)


def _finite(value: float, label: str) -> float:
    _assert(math.isfinite(value), f"{label} must be finite; received {value!r}")
    return value


def _number(value: Any, label: str) -> float:
    _assert(isinstance(value, (int, float)) and not isinstance(value, bool), f"{label} must be a JSON number")
    return _finite(float(value), label)


def _js_number(value: float) -> str:
    """Encode a finite Python float as the number grammar used by JSON.stringify.

    Python and JavaScript use the same IEEE-754 binary64 operations, but their
    JSON encoders differ for exponent padding and the decimal/scientific cutoff.
    The profile values are represented from Python's shortest round-trip spelling,
    then normalised to ECMAScript's spelling rules.
    """
    number = _finite(float(value), "stable JSON number")
    if number == 0.0:
        return "0"
    raw = repr(number).lower()
    sign = ""
    if raw.startswith("-"):
        sign, raw = "-", raw[1:]
    if "e" in raw:
        mantissa, exponent_text = raw.split("e", 1)
        exponent = int(exponent_text)
    else:
        mantissa, exponent = raw, 0

    absolute = abs(number)
    # JSON.stringify uses fixed notation for 1e-6 <= abs < 1e21.
    if 1e-6 <= absolute < 1e21:
        try:
            fixed = format(Decimal(mantissa) * (Decimal(10) ** exponent), "f")
        except (InvalidOperation, ValueError) as exc:
            raise MonthlyProfileError(f"cannot canonicalize number {number!r}") from exc
        if "." in fixed:
            fixed = fixed.rstrip("0").rstrip(".")
        if fixed in ("", "-0"):
            fixed = "0"
        return sign + fixed.lstrip("+")

    # Keep the shortest mantissa from repr and canonicalise exponent padding.
    mantissa = mantissa.rstrip("0").rstrip(".")
    if mantissa in ("", "-0"):
        mantissa = "0"
    exponent_sign = "+" if exponent >= 0 else "-"
    return f"{sign}{mantissa}e{exponent_sign}{abs(exponent)}"


def stable_json(value: Any) -> str:
    """Return the lexical-key, finite-number JSON used by the TS contract."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return _js_number(float(value))
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(stable_json(item) for item in value) + "]"
    if isinstance(value, Mapping):
        _assert(all(isinstance(key, str) for key in value.keys()), "stable JSON object keys must be strings")
        keys = sorted(value.keys())
        return "{" + ",".join(
            json.dumps(key, ensure_ascii=False) + ":" + stable_json(value[key]) for key in keys
        ) + "}"
    raise MonthlyProfileError(f"unsupported stable JSON value: {type(value).__name__}")


def sha256_text(value: str) -> str:
    """Hash UTF-8 canonical JSON text."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def profile_curve_hash_input(profile: Mapping[str, Any]) -> str:
    """Match ``profileCurveHashInput`` in ``focusEmission.ts`` exactly."""
    return stable_json(
        {
            "emission_endpoints": profile["emission_endpoints"],
            "model_version": profile["model_version"],
            "rating_domain": profile["rating_domain"],
            "sample_step": profile["sample_step"],
            "samples": profile["samples"],
        }
    )


def profile_identity_hash_input(profile_without_identity: Mapping[str, Any]) -> str:
    """Canonical immutable identity input, deliberately excluding profile_id and curve hash."""
    identity_fields = (
        "schema_version", "period", "model_version", "method", "rating_domain", "sample_step", "samples",
        "emission_endpoints", "source_data_version", "source_data_sha256", "source_movie_count",
        "source_threshold_version", "generated_at", "git_commit",
    )
    return stable_json({key: profile_without_identity[key] for key in identity_fields})


def profile_identity_sha256(profile_without_identity: Mapping[str, Any]) -> str:
    """Hash the complete immutable profile body before profile_id/curve_sha256 exist."""
    return sha256_text(profile_identity_hash_input(profile_without_identity))


def _movie_id(value: Any, index: int) -> int:
    _assert(not isinstance(value, bool), f"movies[{index}].id must be an integer identity")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise MonthlyProfileError(f"movies[{index}].id must be an integer identity") from exc
    _finite(number, f"movies[{index}].id")
    _assert(number.is_integer() and number > 0, f"movies[{index}].id must be a positive integer")
    result = int(number)
    _assert(result <= 9_007_199_254_740_991, f"movies[{index}].id exceeds JavaScript safe integer range")
    return result


def _rating(value: Any, index: int) -> float:
    _assert(not isinstance(value, bool), f"movies[{index}].vote_average must be numeric")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise MonthlyProfileError(f"movies[{index}].vote_average must be numeric") from exc
    _finite(result, f"movies[{index}].vote_average")
    _assert(RATING_MIN <= result <= RATING_MAX, f"movies[{index}].vote_average must be within [0, 10]")
    return result


def _optional_identity(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return None if not text or text.casefold() in {"none", "null"} else text


def sorted_final_render_ratings(movies: Sequence[Mapping[str, Any]]) -> tuple[list[float], list[dict[str, Any]]]:
    """Validate identities and return a deterministic id-sorted final-render set."""
    _assert(len(movies) > 0, "final monthly movies collection must not be empty")
    records: list[dict[str, Any]] = []
    ids: set[int] = set()
    imdb_ids: set[str] = set()
    for index, movie in enumerate(movies):
        _assert(isinstance(movie, Mapping), f"movies[{index}] must be an object")
        identity = _movie_id(movie.get("id"), index)
        _assert(identity not in ids, f"duplicate movie identity id={identity}")
        ids.add(identity)
        imdb_id = _optional_identity(movie.get("imdb_id"))
        if imdb_id is not None:
            _assert(imdb_id not in imdb_ids, f"duplicate movie identity imdb_id={imdb_id!r}")
            imdb_ids.add(imdb_id)
        records.append({"id": identity, "imdb_id": imdb_id, "vote_average": _rating(movie.get("vote_average"), index)})

    records.sort(key=lambda record: int(record["id"]))
    sorted_ids = [int(record["id"]) for record in records]
    _assert(sorted_ids == sorted(set(sorted_ids)), "final movie identity ordering is not deterministic")
    ratings = [float(record["vote_average"]) for record in records]
    ratings.sort()
    print(
        f"[MonthlyProfile] ratings.shape=({len(ratings)},) rating_min={min(ratings):.12g} rating_max={max(ratings):.12g}",
        flush=True,
    )
    return ratings, records


def _midrank_cdf(rating: float, sorted_ratings: Sequence[float]) -> float:
    lower = bisect.bisect_left(sorted_ratings, rating)
    equal_end = bisect.bisect_right(sorted_ratings, rating)
    percentile = (lower + 0.5 * (equal_end - lower)) / len(sorted_ratings)
    _assert(0.0 <= percentile <= 1.0 and math.isfinite(percentile), "midrank CDF must be finite within [0, 1]")
    return percentile


def generate_lut(sorted_ratings: Sequence[float]) -> list[float]:
    """Generate the 201-point LUT matching generateRatingMidrankCdfLutProfile."""
    _assert(len(sorted_ratings) > 0, "final rendered rating samples must not be empty")
    previous = -math.inf
    for index, value in enumerate(sorted_ratings):
        rating = _finite(float(value), f"sorted rating {index}")
        _assert(RATING_MIN <= rating <= RATING_MAX, f"sorted rating {index} must be within [0, 10]")
        _assert(rating >= previous, f"sorted ratings must be monotonic at index {index}")
        previous = rating
    samples: list[float] = []
    for index in range(SAMPLE_COUNT):
        if index == 0:
            emission = INTENSITY_MIN
        elif index == SAMPLE_COUNT - 1:
            emission = INTENSITY_MAX
        else:
            grid_rating = index * SAMPLE_STEP
            percentile = _midrank_cdf(grid_rating, sorted_ratings)
            emission = INTENSITY_MIN + percentile * (INTENSITY_MAX - INTENSITY_MIN)
        samples.append(float(emission))
    _assert(len(samples) == SAMPLE_COUNT, "LUT must contain exactly 201 samples")
    assert len(samples) == SAMPLE_COUNT, "LUT shape invariant"
    _assert(samples[0] == INTENSITY_MIN and samples[-1] == INTENSITY_MAX, "LUT endpoints must be exact")
    _assert(all(math.isfinite(value) for value in samples), "LUT samples must be finite")
    _assert(all(a <= b for a, b in zip(samples, samples[1:])), "LUT samples must be monotonic")
    print(
        f"[MonthlyProfile] samples.shape=({len(samples)},) emission_min={min(samples):.12g} emission_max={max(samples):.12g}",
        flush=True,
    )
    return samples


def _canonical_source_records(records: Sequence[Mapping[str, Any]]) -> str:
    return stable_json({"movies": list(records)})


def _utc_timestamp(value: str | None) -> str:
    _assert(value is not None and isinstance(value, str) and value.strip(), "generated_at is required in export metadata or arguments")
    text = value.strip()
    _assert(
        re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z", text) is not None,
        "generated_at must be a UTC YYYY-MM-DDTHH:mm:ss(.sss)Z timestamp",
    )
    try:
        datetime.fromisoformat(text[:-1] + "+00:00")
    except ValueError as exc:
        raise MonthlyProfileError("generated_at must be a valid timestamp") from exc
    return text


def _period_from_metadata(metadata: Mapping[str, Any]) -> str:
    explicit = str(metadata.get("period", "")).strip()
    if explicit:
        return explicit
    version = str(metadata.get("version", metadata.get("data_version", ""))).strip()
    match = re.search(r"(\d{4})[.-](\d{2})", version)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    generated = str(metadata.get("generated_at", ""))
    match = re.match(r"^(\d{4})-(\d{2})", generated)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    raise MonthlyProfileError("monthly export metadata must provide period or YYYY-MM version")


def _valid_git_commit(value: Any, label: str = "git_commit") -> str:
    _assert(isinstance(value, str), f"invalid {label}")
    _assert(_COMMIT_RE.fullmatch(value) is not None, f"invalid {label}")
    return value


def _git_commit() -> str:
    env_value = os.environ.get("GIT_COMMIT")
    if env_value is not None and env_value != "":
        return _valid_git_commit(env_value, "GIT_COMMIT")
    try:
        value = subprocess.check_output(
            ["git", "rev-parse", "--short=40", "HEAD"], cwd=str(_REPO_ROOT), text=True, stderr=subprocess.PIPE
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise MonthlyProfileError("unable to resolve git_commit; set a valid GIT_COMMIT explicitly") from exc
    return _valid_git_commit(value.strip(), "git_commit")


def _validate_profile(profile: Mapping[str, Any]) -> dict[str, Any]:
    required = (
        "schema_version", "profile_id", "period", "model_version", "method", "rating_domain",
        "sample_step", "samples", "emission_endpoints", "source_data_version", "source_data_sha256",
        "source_movie_count", "source_threshold_version", "curve_sha256", "generated_at", "git_commit",
    )
    for key in required:
        _assert(key in profile, f"profile missing {key}")
    _assert(profile["schema_version"] == SCHEMA_VERSION, "schema_version mismatch")
    _assert(isinstance(profile["profile_id"], str) and _PROFILE_ID_RE.fullmatch(profile["profile_id"]), "invalid profile_id")
    _assert(isinstance(profile["period"], str) and _PERIOD_RE.fullmatch(profile["period"]), "invalid period")
    _assert(profile["model_version"] == MODEL_VERSION, "model_version mismatch")
    _assert(profile["method"] == METHOD, "method mismatch")
    rating_domain = profile["rating_domain"]
    endpoints = profile["emission_endpoints"]
    _assert(
        isinstance(rating_domain, Mapping)
        and _number(rating_domain.get("min"), "rating_domain.min") == 0
        and _number(rating_domain.get("max"), "rating_domain.max") == 10,
        "rating_domain must equal [0, 10]",
    )
    _assert(_number(profile["sample_step"], "sample_step") == SAMPLE_STEP, "sample_step must equal 0.05")
    _assert(
        isinstance(endpoints, Mapping)
        and _number(endpoints.get("min"), "emission_endpoints.min") == INTENSITY_MIN
        and _number(endpoints.get("max"), "emission_endpoints.max") == INTENSITY_MAX,
        "emission_endpoints mismatch",
    )
    samples = profile["samples"]
    _assert(isinstance(samples, list) and len(samples) == SAMPLE_COUNT, "samples must contain 201 points")
    previous = -math.inf
    for index, sample in enumerate(samples):
        number = _number(sample, f"samples[{index}]")
        _assert(INTENSITY_MIN <= number <= INTENSITY_MAX and number >= previous, f"samples[{index}] is outside monotonic emission range")
        previous = number
    _assert(_number(samples[0], "samples[0]") == INTENSITY_MIN and _number(samples[-1], "samples[-1]") == INTENSITY_MAX, "samples endpoints mismatch")
    count = _number(profile["source_movie_count"], "source_movie_count")
    _assert(
        count.is_integer() and 0 < count <= 9_007_199_254_740_991,
        "source_movie_count must be a positive JavaScript safe integer",
    )
    _assert(isinstance(profile["source_data_version"], str) and profile["source_data_version"].strip(), "source_data_version is required")
    _assert(isinstance(profile["source_threshold_version"], str) and profile["source_threshold_version"].strip(), "source_threshold_version is required")
    _assert(isinstance(profile["source_data_sha256"], str) and _SHA256_RE.fullmatch(profile["source_data_sha256"]), "invalid source_data_sha256")
    _assert(isinstance(profile["curve_sha256"], str) and _SHA256_RE.fullmatch(profile["curve_sha256"]), "invalid curve_sha256")
    _utc_timestamp(profile["generated_at"])
    _valid_git_commit(profile["git_commit"])
    expected_hash = sha256_text(profile_curve_hash_input(profile))
    _assert(expected_hash == profile["curve_sha256"], "curve_sha256 does not match canonical curve input")
    return dict(profile)


def generate_monthly_profile(
    movies: Sequence[Mapping[str, Any]],
    metadata: Mapping[str, Any],
    *,
    period: str | None = None,
    source_data_version: str | None = None,
    source_threshold_version: str | None = None,
    generated_at: str | None = None,
    git_commit: str | None = None,
    profile_id: str | None = None,
) -> dict[str, Any]:
    """Pure profile generation boundary for a final monthly movies collection."""
    ratings, records = sorted_final_render_ratings(movies)
    samples = generate_lut(ratings)
    source_version = str(source_data_version or metadata.get("version", metadata.get("data_version", ""))).strip()
    threshold_version = str(source_threshold_version or metadata.get("threshold_version", "")).strip()
    _assert(source_version, "source_data_version is required in export metadata or arguments")
    _assert(threshold_version, "source_threshold_version is required in export metadata or arguments")
    resolved_period = str(period or _period_from_metadata(metadata)).strip()
    _assert(_PERIOD_RE.fullmatch(resolved_period) is not None, "period must be YYYY-MM")
    source_hash = sha256_text(_canonical_source_records(records))
    resolved_generated_at = _utc_timestamp(generated_at if generated_at is not None else metadata.get("generated_at"))
    resolved_commit = _valid_git_commit(git_commit if git_commit is not None else _git_commit())
    identity_payload: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "period": resolved_period,
        "model_version": MODEL_VERSION,
        "method": METHOD,
        "rating_domain": {"min": 0, "max": 10},
        "sample_step": SAMPLE_STEP,
        "samples": samples,
        "emission_endpoints": {"min": INTENSITY_MIN, "max": INTENSITY_MAX},
        "source_data_version": source_version,
        "source_data_sha256": source_hash,
        "source_movie_count": len(records),
        "source_threshold_version": threshold_version,
        "generated_at": resolved_generated_at,
        "git_commit": resolved_commit,
    }
    identity_sha256 = profile_identity_sha256(identity_payload)
    resolved_profile_id = f"rating-emission-{resolved_period}-{identity_sha256[:24]}"
    if profile_id is not None:
        _assert(profile_id == resolved_profile_id, "profile_id must equal the derived immutable profile identity")
    profile: dict[str, Any] = {
        **identity_payload,
        "profile_id": resolved_profile_id,
        "curve_sha256": "0" * 64,
    }
    profile["curve_sha256"] = sha256_text(profile_curve_hash_input(profile))
    validated = _validate_profile(profile)
    assert validated["curve_sha256"] == sha256_text(profile_curve_hash_input(validated)), "curve hash invariant"
    print(
        f"[MonthlyProfile] profile_id={validated['profile_id']} movie_count={validated['source_movie_count']} "
        f"curve_sha256={validated['curve_sha256']} source_data_sha256={validated['source_data_sha256']} "
        f"source_data_version={validated['source_data_version']} source_threshold_version={validated['source_threshold_version']}",
        flush=True,
    )
    return validated


def calculate_drift_metrics(current: Mapping[str, Any], previous: Mapping[str, Any] | None) -> dict[str, Any]:
    """Return audit evidence against the previous active profile; never applies a threshold."""
    current_profile = _validate_profile(current)
    if previous is None:
        return {
            "status": "no-previous-active-profile",
            "lut_mean_absolute_delta": None,
            "lut_max_absolute_delta": None,
            "key_rating_nodes": [],
            "sample_count_delta": 0,
            "movie_count_delta": None,
            "source_data_version_changed": None,
        }
    previous_profile = _validate_profile(previous)
    current_samples = [float(value) for value in current_profile["samples"]]
    previous_samples = [float(value) for value in previous_profile["samples"]]
    deltas = [abs(a - b) for a, b in zip(current_samples, previous_samples)]
    node_indices = (0, 50, 100, 150, 200)
    nodes = [
        {
            "rating": index * SAMPLE_STEP,
            "previous": previous_samples[index],
            "current": current_samples[index],
            "delta": current_samples[index] - previous_samples[index],
            "absolute_delta": deltas[index],
        }
        for index in node_indices
    ]
    result = {
        "status": "compared",
        "previous_profile_id": previous_profile["profile_id"],
        "current_profile_id": current_profile["profile_id"],
        "lut_mean_absolute_delta": sum(deltas) / SAMPLE_COUNT,
        "lut_max_absolute_delta": max(deltas),
        "key_rating_nodes": nodes,
        "sample_count": len(current_samples),
        "previous_sample_count": len(previous_samples),
        "sample_count_delta": len(current_samples) - len(previous_samples),
        "movie_count": current_profile["source_movie_count"],
        "previous_movie_count": previous_profile["source_movie_count"],
        "movie_count_delta": current_profile["source_movie_count"] - previous_profile["source_movie_count"],
        "previous_source_data_version": previous_profile["source_data_version"],
        "current_source_data_version": current_profile["source_data_version"],
        "source_data_version_changed": current_profile["source_data_version"] != previous_profile["source_data_version"],
    }
    print(
        f"[MonthlyProfile] drift mean_abs={result['lut_mean_absolute_delta']:.12g} "
        f"max={result['lut_max_absolute_delta']:.12g} movie_count_delta={result['movie_count_delta']}",
        flush=True,
    )
    return result


def load_monthly_export(path: Path) -> tuple[dict[str, Any], list[Mapping[str, Any]]]:
    """Load plain or gzip final export without touching raw data."""
    source = path.expanduser().resolve()
    raw = gzip.open(source, "rt", encoding="utf-8") if source.suffix == ".gz" else source.open("r", encoding="utf-8")
    with raw as stream:
        payload = json.load(stream)
    _assert(isinstance(payload, Mapping), "monthly export must be an object")
    metadata = payload.get("meta", payload.get("metadata"))
    movies = payload.get("movies")
    _assert(isinstance(metadata, Mapping), "monthly export must contain meta")
    _assert(isinstance(movies, list), "monthly export must contain movies list")
    return dict(metadata), movies


def _prepare_artifact_temp(path: Path, text: str) -> Path:
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
    except OSError:
        temporary.unlink(missing_ok=True)
        raise
    return temporary


def _cleanup_paths(paths: Sequence[Path]) -> None:
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


def _write_artifact_batch(artifacts: Mapping[Path, str], publish_order: Sequence[Path]) -> None:
    """Prepare/fsync every temp first, then publish in a readiness-safe order."""
    final_paths = list(artifacts)
    _assert(set(final_paths) == set(publish_order), "artifact publish order must include every final path")
    output_dir = final_paths[0].parent
    output_dir.mkdir(parents=True, exist_ok=True)
    existing = [path for path in final_paths if path.exists()]
    if existing:
        if len(existing) == len(final_paths) and all(path.read_text(encoding="utf-8") == artifacts[path] for path in final_paths):
            return
        raise MonthlyProfileError(f"refusing to overwrite existing immutable artifact: {existing[0]}")

    temporaries: dict[Path, Path] = {}
    published: list[Path] = []
    try:
        for path, text in artifacts.items():
            temporaries[path] = _prepare_artifact_temp(path, text)
        for path in publish_order:
            os.replace(temporaries[path], path)
            published.append(path)
    except OSError as exc:
        _cleanup_paths(list(temporaries.values()))
        _cleanup_paths(published)
        raise MonthlyProfileError("failed to publish monthly profile artifact batch") from exc


def write_monthly_profile_artifacts(
    profile: Mapping[str, Any],
    *,
    output_dir: Path,
    previous_active_profile: Mapping[str, Any] | None = None,
) -> dict[str, Path]:
    """Publish a fully prepared candidate batch; this TODO never writes an active pointer."""
    validated = _validate_profile(profile)
    drift = calculate_drift_metrics(validated, previous_active_profile)
    profile_id = str(validated["profile_id"])
    paths = {
        "profile": output_dir / f"profile-{profile_id}.json",
        "candidate": output_dir / f"candidate-{profile_id}.json",
        "metadata": output_dir / f"metadata-{profile_id}.json",
        "drift": output_dir / f"drift-{profile_id}.json",
    }
    profile_text = stable_json(validated) + "\n"
    candidate = {"schema_version": "rating-emission-candidate-v1", "status": "candidate", "profile": validated, "drift": drift}
    metadata = {
        "schema_version": "monthly-rating-emission-metadata-v1",
        "status": "candidate-validated",
        "profile_id": profile_id,
        "period": validated["period"],
        "profile_path": paths["profile"].name,
        "source_data_version": validated["source_data_version"],
        "source_data_sha256": validated["source_data_sha256"],
        "source_movie_count": validated["source_movie_count"],
        "source_threshold_version": validated["source_threshold_version"],
        "curve_sha256": validated["curve_sha256"],
        "drift": drift,
    }
    artifacts = {
        paths["profile"]: profile_text,
        paths["drift"]: stable_json(drift) + "\n",
        paths["candidate"]: stable_json(candidate) + "\n",
        paths["metadata"]: stable_json(metadata) + "\n",
    }
    # Candidate and metadata are the readiness markers, so both are published last.
    _write_artifact_batch(artifacts, [paths["profile"], paths["drift"], paths["candidate"], paths["metadata"]])
    print(f"[MonthlyProfile] wrote candidate artifacts under {output_dir}", flush=True)
    return paths


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Final monthly export JSON or JSON.gz")
    parser.add_argument(
        "--output-dir", type=Path, default=_REPO_ROOT / "data" / "output" / "monthly_profiles", help="Versioned candidate artifact directory"
    )
    parser.add_argument("--period", default=None, help="YYYY-MM; otherwise inferred from export metadata")
    parser.add_argument("--source-data-version", default=None)
    parser.add_argument("--source-threshold-version", default=None)
    parser.add_argument("--generated-at", default=None, help="UTC ISO timestamp; otherwise final export generated_at")
    parser.add_argument("--git-commit", default=None, help="7..40 lowercase hex revision; otherwise current HEAD")
    parser.add_argument("--profile-id", default=None, help="Optional immutable profile identifier")
    parser.add_argument("--previous-active-profile", type=Path, default=None, help="Previous active profile JSON for drift evidence")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        metadata, movies = load_monthly_export(args.input)
        profile = generate_monthly_profile(
            movies,
            metadata,
            period=args.period,
            source_data_version=args.source_data_version,
            source_threshold_version=args.source_threshold_version,
            generated_at=args.generated_at,
            git_commit=args.git_commit,
            profile_id=args.profile_id,
        )
        previous = None
        if args.previous_active_profile is not None:
            with args.previous_active_profile.expanduser().resolve().open("r", encoding="utf-8") as stream:
                previous = json.load(stream)
            _assert(isinstance(previous, Mapping), "previous active profile must be an object")
        write_monthly_profile_artifacts(
            profile,
            output_dir=args.output_dir.expanduser().resolve(),
            previous_active_profile=previous,
        )
        return 0
    except (MonthlyProfileError, OSError, json.JSONDecodeError, ValueError, TypeError) as exc:
        print(f"[MonthlyProfile] ERROR: {exc}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())