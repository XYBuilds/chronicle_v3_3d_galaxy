from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import pytest

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import cron.monthly_profile_generator as monthly_profile_generator  # noqa: E402
from cron.monthly_profile_generator import (  # noqa: E402
    INTENSITY_MAX,
    INTENSITY_MIN,
    SAMPLE_COUNT,
    MonthlyProfileError,
    _git_commit,
    _validate_profile,
    calculate_drift_metrics,
    generate_lut,
    generate_monthly_profile,
    load_monthly_export,
    profile_curve_hash_input,
    sha256_text,
    stable_json,
    write_monthly_profile_artifacts,
)


@pytest.fixture
def final_export() -> tuple[list[dict[str, object]], dict[str, str]]:
    return (
        [
            {"id": 30, "imdb_id": "tt0000030", "vote_average": 8.0},
            {"id": 10, "imdb_id": "tt0000010", "vote_average": 6.0},
            {"id": 20, "imdb_id": "tt0000020", "vote_average": 6.0},
            {"id": 40, "imdb_id": "tt0000040", "vote_average": 4.0},
        ],
        {
            "version": "2026.07.22.monthly.42",
            "threshold_version": "dynamic-vote-count-v42",
            "generated_at": "2026-07-22T01:02:03.000Z",
        },
    )


def test_profile_matches_contract_shape_endpoints_and_is_byte_stable(final_export: tuple[list[dict[str, object]], dict[str, str]]) -> None:
    movies, metadata = final_export
    first = generate_monthly_profile(movies, metadata, git_commit="0123456789abcdef")
    second = generate_monthly_profile(list(reversed(movies)), metadata, git_commit="0123456789abcdef")

    assert stable_json(first) == stable_json(second)
    assert len(first["samples"]) == SAMPLE_COUNT
    assert first["samples"][0] == INTENSITY_MIN
    assert first["samples"][-1] == INTENSITY_MAX
    assert all(a <= b for a, b in zip(first["samples"], first["samples"][1:]))
    assert first["curve_sha256"] == sha256_text(profile_curve_hash_input(first))
    assert first["source_movie_count"] == len(movies)


def test_python_fixture_matches_typescript_curve_hash(final_export: tuple[list[dict[str, object]], dict[str, str]]) -> None:
    movies, metadata = final_export
    profile = generate_monthly_profile(movies, metadata, git_commit="0123456789abcdef")
    assert profile["curve_sha256"] == "79bb84a97d49bdc8c1fe4260706eca27fbbcca1ac0e46757c13a68d0a89f5dc8"


def test_profile_identity_includes_full_immutable_provenance(final_export: tuple[list[dict[str, object]], dict[str, str]]) -> None:
    movies, metadata = final_export
    baseline = generate_monthly_profile(movies, metadata, git_commit="0123456789abcdef")
    changed_source = generate_monthly_profile(movies, {**metadata, "version": "2026.07.22.monthly.43"}, git_commit="0123456789abcdef")
    changed_threshold = generate_monthly_profile(movies, {**metadata, "threshold_version": "dynamic-vote-count-v43"}, git_commit="0123456789abcdef")
    changed_time = generate_monthly_profile(movies, {**metadata, "generated_at": "2026-07-22T01:02:04.000Z"}, git_commit="0123456789abcdef")
    changed_commit = generate_monthly_profile(movies, metadata, git_commit="abcdef0")

    assert len({baseline["profile_id"], changed_source["profile_id"], changed_threshold["profile_id"], changed_time["profile_id"], changed_commit["profile_id"]}) == 5
    assert generate_monthly_profile(movies, metadata, git_commit="0123456789abcdef") == baseline


def test_python_validation_rejects_typescript_parser_incompatible_values(final_export: tuple[list[dict[str, object]], dict[str, str]]) -> None:
    movies, metadata = final_export
    profile = generate_monthly_profile(movies, metadata, git_commit="0123456789abcdef")
    invalid_profiles = [
        {**profile, "samples": [True, *profile["samples"][1:]]},
        {**profile, "samples": ["0.005", *profile["samples"][1:]]},
        {**profile, "samples": [None, *profile["samples"][1:]]},
        {**profile, "source_movie_count": True},
        {**profile, "source_movie_count": "4"},
        {**profile, "source_movie_count": 4.5},
        {**profile, "source_movie_count": 9_007_199_254_740_992},
        {**profile, "generated_at": "2026-07-22T01:02:03+00:00"},
        {**profile, "generated_at": "2026-02-30T01:02:03.000Z"},
        {**profile, "generated_at": 123},
        {**profile, "profile_id": "Bad_Profile"},
        {**profile, "source_data_sha256": "A" * 64},
        {**profile, "git_commit": "000000"},
        {**profile, "git_commit": 1234567},
    ]
    for invalid in invalid_profiles:
        with pytest.raises(MonthlyProfileError):
            _validate_profile(invalid)


def test_stable_json_rejects_non_string_mapping_keys() -> None:
    with pytest.raises(MonthlyProfileError, match="keys"):
        stable_json({1: "one"})


def test_git_commit_resolution_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GIT_COMMIT", raising=False)
    monkeypatch.setattr(monthly_profile_generator.subprocess, "check_output", lambda *args, **kwargs: (_ for _ in ()).throw(OSError("git unavailable")))
    with pytest.raises(MonthlyProfileError, match="unable to resolve"):
        _git_commit()
    monkeypatch.setenv("GIT_COMMIT", "not-a-revision")
    with pytest.raises(MonthlyProfileError, match="GIT_COMMIT"):
        _git_commit()


@pytest.mark.parametrize(
    ("movies", "error_match"),
    [
        pytest.param([], "must not be empty", id="empty"),
        pytest.param([{"id": 1, "vote_average": float("nan")}], "vote_average must be finite", id="nan"),
        pytest.param([{"id": 1, "vote_average": float("inf")}], "vote_average must be finite", id="infinity"),
        pytest.param([{"id": 1, "vote_average": 10.1}], r"within \[0, 10\]", id="out-of-domain"),
        pytest.param(
            [{"id": 1, "vote_average": 5}, {"id": 1, "vote_average": 6}],
            "duplicate movie identity id=1",
            id="duplicate-id",
        ),
        pytest.param(
            [{"id": 1, "imdb_id": "tt1", "vote_average": 5}, {"id": 2, "imdb_id": "tt1", "vote_average": 6}],
            "duplicate movie identity imdb_id='tt1'",
            id="duplicate-imdb-id",
        ),
    ],
)
def test_bad_final_movies_fail_fast(movies: list[dict[str, object]], error_match: str) -> None:
    metadata = {
        "version": "2026.07.22.monthly.1",
        "threshold_version": "threshold-v1",
        "generated_at": "2026-07-22T01:02:03.000Z",
    }
    with pytest.raises(MonthlyProfileError, match=error_match):
        generate_monthly_profile(movies, metadata, git_commit="0123456")


def test_lut_rejects_unstable_input_and_always_has_201_points() -> None:
    with pytest.raises(MonthlyProfileError):
        generate_lut([])
    with pytest.raises(MonthlyProfileError):
        generate_lut([6.0, 4.0])
    samples = generate_lut([4.0, 6.0, 6.0, 8.0])
    assert len(samples) == 201
    assert samples[0] == 0.005
    assert samples[-1] == 0.65


def test_drift_metrics_include_nodes_counts_and_source_version(final_export: tuple[list[dict[str, object]], dict[str, str]]) -> None:
    movies, metadata = final_export
    previous = generate_monthly_profile(movies, metadata, source_data_version="2026.06.30.monthly.1", git_commit="0123456")
    current = generate_monthly_profile(
        [{**movie, "vote_average": float(movie["vote_average"]) + 0.5} for movie in movies],
        {**metadata, "version": "2026.07.22.monthly.2"},
        source_data_version="2026.07.22.monthly.2",
        git_commit="0123456",
    )
    drift = calculate_drift_metrics(current, previous)
    assert drift["status"] == "compared"
    assert drift["lut_mean_absolute_delta"] > 0
    assert drift["lut_max_absolute_delta"] >= drift["lut_mean_absolute_delta"]
    assert len(drift["key_rating_nodes"]) == 5
    assert drift["movie_count_delta"] == 0
    assert drift["source_data_version_changed"] is True


def test_hash_mismatch_leaves_active_pointer_and_candidate_directory_untouched(tmp_path: Path, final_export: tuple[list[dict[str, object]], dict[str, str]]) -> None:
    movies, metadata = final_export
    profile = generate_monthly_profile(movies, metadata, git_commit="0123456")
    broken = {**profile, "curve_sha256": "f" * 64}
    active_pointer = tmp_path / "active-profile.json"
    active_pointer.write_text('{"profile_id":"previous"}\n', encoding="utf-8")
    candidate_dir = tmp_path / "candidates"
    with pytest.raises(MonthlyProfileError, match="curve_sha256"):
        write_monthly_profile_artifacts(broken, output_dir=candidate_dir)
    assert active_pointer.read_text(encoding="utf-8") == '{"profile_id":"previous"}\n'
    assert not candidate_dir.exists()


def test_artifact_batch_prepare_failure_leaves_no_finals(
    tmp_path: Path,
    final_export: tuple[list[dict[str, object]], dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    movies, metadata = final_export
    profile = generate_monthly_profile(movies, metadata, git_commit="0123456")
    real_prepare = monthly_profile_generator._prepare_artifact_temp
    calls = 0

    def fail_second_prepare(path: Path, text: str) -> Path:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("injected prepare failure")
        return real_prepare(path, text)

    monkeypatch.setattr(monthly_profile_generator, "_prepare_artifact_temp", fail_second_prepare)
    with pytest.raises(MonthlyProfileError, match="artifact batch"):
        write_monthly_profile_artifacts(profile, output_dir=tmp_path)
    assert list(tmp_path.glob("*.json")) == []
    assert list(tmp_path.glob(".*.tmp")) == []


def test_artifact_batch_rename_failure_rolls_back_all_finals(
    tmp_path: Path,
    final_export: tuple[list[dict[str, object]], dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    movies, metadata = final_export
    profile = generate_monthly_profile(movies, metadata, git_commit="0123456")
    real_replace = monthly_profile_generator.os.replace
    calls = 0

    def fail_second_replace(source: object, target: object) -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("injected rename failure")
        real_replace(source, target)

    monkeypatch.setattr(monthly_profile_generator.os, "replace", fail_second_replace)
    with pytest.raises(MonthlyProfileError, match="artifact batch"):
        write_monthly_profile_artifacts(profile, output_dir=tmp_path)
    assert list(tmp_path.glob("*.json")) == []
    assert list(tmp_path.glob(".*.tmp")) == []


def test_validated_profile_writes_only_candidate_artifacts(tmp_path: Path, final_export: tuple[list[dict[str, object]], dict[str, str]]) -> None:
    movies, metadata = final_export
    profile = generate_monthly_profile(movies, metadata, git_commit="0123456")
    paths = write_monthly_profile_artifacts(profile, output_dir=tmp_path)
    assert set(paths) == {"profile", "candidate", "metadata", "drift"}
    assert all(path.is_file() for path in paths.values())
    assert not (tmp_path / "active-profile.json").exists()
    assert json.loads(paths["candidate"].read_text(encoding="utf-8"))["status"] == "candidate"


def test_final_export_json_and_gzip_are_supported(tmp_path: Path, final_export: tuple[list[dict[str, object]], dict[str, str]]) -> None:
    movies, metadata = final_export
    payload = {"meta": metadata, "movies": movies}
    plain = tmp_path / "final.json"
    zipped = tmp_path / "final.json.gz"
    plain.write_text(json.dumps(payload), encoding="utf-8")
    with gzip.open(zipped, "wt", encoding="utf-8") as stream:
        json.dump(payload, stream)
    assert load_monthly_export(plain)[1] == movies
    assert load_monthly_export(zipped)[1] == movies