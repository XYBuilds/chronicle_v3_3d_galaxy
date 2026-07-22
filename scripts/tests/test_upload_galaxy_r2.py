from __future__ import annotations

import gzip
import json
import os
import sys
import tempfile
import types
from pathlib import Path
from unittest.mock import patch

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron import upload_galaxy_r2  # noqa: E402
from cron.emission_profile_release import pointer_from_profile  # noqa: E402
from cron.monthly_profile_generator import generate_monthly_profile  # noqa: E402


class _UploadTransportFailure(Exception):
    """Synthetic non-OSError transport failure from a boto-style client."""


class _FakeR2Client:
    def __init__(self, fail_key: str | None = None, objects: dict[str, bytes] | None = None) -> None:
        self.fail_key = fail_key
        self.objects = dict(objects or {})
        self.uploads: list[str] = []

    def download_file(self, _bucket: str, key: str, destination: str) -> None:
        if key not in self.objects:
            raise FileNotFoundError(key)
        Path(destination).write_bytes(self.objects[key])

    def upload_file(self, path: str, _bucket: str, key: str, ExtraArgs: dict[str, str]) -> None:
        if key == self.fail_key or (self.fail_key == "galaxy-data" and key.endswith("/galaxy_data.json.gz")):
            raise _UploadTransportFailure(f"injected upload transport failure for {key}")
        self.uploads.append(key)
        self.objects[key] = Path(path).read_bytes()


def _remote_active(profile: dict[str, object]) -> dict[str, bytes]:
    pointer = pointer_from_profile(profile, activated_at="2026-07-01T00:00:00.000Z")
    return {
        "galaxy/focus-emission-profiles/active.json": json.dumps(pointer).encode(),
        f"galaxy/focus-emission-profiles/{profile['profile_id']}.json": json.dumps(profile).encode(),
    }


def _profile(period: str, version: str) -> dict[str, object]:
    return generate_monthly_profile(
        [{"id": 1, "vote_average": 5.0}, {"id": 2, "vote_average": 7.0}],
        {"version": version, "threshold_version": "threshold-v1", "generated_at": f"{period}-01T00:00:00.000Z"},
        period=period, git_commit="0123456",
    )


def _write_assets(root: Path, *, version: str = "fixture-v1") -> None:
    root.joinpath("galaxy_data.json").write_text(json.dumps({"meta": {"version": version}}), encoding="utf-8")
    for name in ("galaxy_data.json.gz", "galaxy_search_index.json.gz"):
        root.joinpath(name).write_bytes(gzip.compress(b"fixture", mtime=0))


def _env() -> dict[str, str]:
    return {
        "R2_ACCOUNT_ID": "account", "R2_ACCESS_KEY_ID": "key", "R2_SECRET_ACCESS_KEY": "secret",
        "R2_BUCKET": "bucket", "R2_PUBLIC_BASE_URL": "https://assets.example.test/", "R2_KEY_PREFIX": "galaxy",
    }


def _install_boto3(client: _FakeR2Client) -> types.ModuleType:
    boto3 = types.ModuleType("boto3")
    boto3.client = lambda *_args, **_kwargs: client  # type: ignore[attr-defined]
    return boto3


def test_nightly_reuses_pointer_identity_without_profile_upload() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _write_assets(root)
        active_profile = _profile("2026-07", "2026.07.monthly.1")
        active = pointer_from_profile(active_profile, activated_at="2026-07-01T00:00:00.000Z")
        client = _FakeR2Client(objects=_remote_active(active_profile))
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}):
            result = upload_galaxy_r2.main(["--mode", "nightly", "--public-data-dir", str(root)])

        assert result == 0
        assert len(client.uploads) == 2
        assert client.uploads[0].endswith("/galaxy_data.json.gz")
        assert client.uploads[1].endswith("/galaxy_search_index.json.gz")
        assert all("focus-emission-profiles" not in key for key in client.uploads)
        manifest = json.loads(root.joinpath("galaxy_assets_manifest.json").read_text(encoding="utf-8"))
        assert manifest["focus_emission_profile"]["profile_id"] == active["profile_id"]
        assert manifest["focus_emission_profile"]["curve_sha256"] == active["curve_sha256"]
        assert manifest["focus_emission_profile_url"].endswith(f"/{active['profile_id']}.json")


def test_monthly_galaxy_upload_failure_keeps_old_remote_active_pointer() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _write_assets(root, version="2026.08.monthly.1")
        old = pointer_from_profile(_profile("2026-07", "2026.07.monthly.1"), activated_at="2026-07-01T00:00:00.000Z")
        pointer_path = root / "active.json"
        pointer_path.write_text(json.dumps(old), encoding="utf-8")
        candidate = _profile("2026-08", "2026.08.monthly.1")
        candidate_path = root / "profile-candidate.json"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        client = _FakeR2Client(fail_key="galaxy-data", objects=_remote_active(_profile("2026-07", "2026.07.monthly.1")))
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}):
            result = upload_galaxy_r2.main([
                "--mode", "monthly", "--public-data-dir", str(root), "--profile", str(candidate_path), "--monthly-meta", str(root / "monthly_refit_meta.json"),
            ])

        assert result == 1
        assert f"galaxy/focus-emission-profiles/{candidate['profile_id']}.json" in client.uploads
        assert "galaxy/focus-emission-profiles/active.json" not in client.uploads
        assert json.loads(pointer_path.read_text(encoding="utf-8")) == old
        assert json.loads(client.objects["galaxy/focus-emission-profiles/active.json"]) == old
        meta = json.loads(root.joinpath("monthly_refit_meta.json").read_text(encoding="utf-8"))
        assert meta["emission_profile"]["active"]["profile_id"] == old["profile_id"]
        assert "upload failed key=" in meta["emission_profile"]["failure_reason"]
        assert "galaxy_data.json.gz" in meta["emission_profile"]["failure_reason"]




def test_monthly_new_period_advances_remote_pointer_last_after_assets() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _write_assets(root, version="2026.08.monthly.1")
        old_profile = _profile("2026-07", "2026.07.monthly.1")
        candidate = _profile("2026-08", "2026.08.monthly.1")
        candidate_path = root / "profile-candidate.json"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        client = _FakeR2Client(objects=_remote_active(old_profile))
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}):
            result = upload_galaxy_r2.main([
                "--mode", "monthly", "--public-data-dir", str(root), "--profile", str(candidate_path),
                "--monthly-meta", str(root / "monthly_refit_meta.json"),
            ])
        assert result == 0
        assert client.uploads[-1] == "galaxy/focus-emission-profiles/active.json"
        assert json.loads(client.objects[client.uploads[-1]])["profile_id"] == candidate["profile_id"]
        meta = json.loads((root / "monthly_refit_meta.json").read_text(encoding="utf-8"))
        assert meta["emission_profile"]["drift"]["status"] == "compared"


def test_monthly_local_manifest_or_meta_failure_never_advances_pointer() -> None:
    for fail_target in ("manifest", "monthly_meta"):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old_profile = _profile("2026-07", "2026.07.monthly.1")
            candidate = _profile("2026-08", "2026.08.monthly.1")
            _write_assets(root, version="2026.08.monthly.1")
            candidate_path = root / "candidate.json"
            candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
            manifest_path = root / "galaxy_assets_manifest.json"
            manifest_path.write_text('{"prior":true}', encoding="utf-8")
            meta_path = root / "meta.json"
            client = _FakeR2Client(objects=_remote_active(old_profile))
            original_write = upload_galaxy_r2.write_json_atomic

            def fail_preparation(path: Path, payload: object) -> None:
                if (fail_target == "manifest" and path == manifest_path) or (
                    fail_target == "monthly_meta" and path == meta_path
                ):
                    raise OSError(f"injected {fail_target} write failure")
                original_write(path, payload)

            with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}), patch.object(upload_galaxy_r2, "write_json_atomic", side_effect=fail_preparation):
                assert upload_galaxy_r2.main([
                    "--mode", "monthly", "--profile", str(candidate_path), "--public-data-dir", str(root),
                    "--monthly-meta", str(meta_path),
                ]) == 1

            assert "galaxy/focus-emission-profiles/active.json" not in client.uploads
            assert json.loads(client.objects["galaxy/focus-emission-profiles/active.json"])["profile_id"] == old_profile["profile_id"]
            assert manifest_path.read_text(encoding="utf-8") == '{"prior":true}'
            failure_meta = json.loads(meta_path.read_text(encoding="utf-8"))["emission_profile"]
            assert failure_meta["active"]["profile_id"] == old_profile["profile_id"]
            assert f"injected {fail_target} write failure" in failure_meta["failure_reason"]


def test_successful_activation_writes_local_state_before_final_pointer_upload() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        old_profile = _profile("2026-07", "2026.07.monthly.1")
        candidate = _profile("2026-08", "2026.08.monthly.1")
        _write_assets(root, version="2026.08.monthly.1")
        candidate_path = root / "candidate.json"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        meta_path = root / "meta.json"
        events: list[str] = []

        class OrderedClient(_FakeR2Client):
            def upload_file(self, path: str, bucket: str, key: str, ExtraArgs: dict[str, str]) -> None:
                events.append(f"upload:{key}")
                super().upload_file(path, bucket, key, ExtraArgs)

        client = OrderedClient(objects=_remote_active(old_profile))
        original_write = upload_galaxy_r2.write_json_atomic

        def record_write(path: Path, payload: object) -> None:
            events.append(f"write:{path.name}")
            original_write(path, payload)

        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}), patch.object(upload_galaxy_r2, "write_json_atomic", side_effect=record_write):
            assert upload_galaxy_r2.main([
                "--mode", "monthly", "--profile", str(candidate_path), "--public-data-dir", str(root),
                "--monthly-meta", str(meta_path),
            ]) == 0

        pointer_event = "upload:galaxy/focus-emission-profiles/active.json"
        assert events[-1] == pointer_event
        assert events.index("write:galaxy_assets_manifest.json") < events.index(pointer_event)
        assert events.index("write:meta.json") < events.index(pointer_event)


def test_post_pointer_success_log_failure_keeps_committed_release_state() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        old_profile = _profile("2026-07", "2026.07.monthly.1")
        candidate = _profile("2026-08", "2026.08.monthly.1")
        _write_assets(root, version="2026.08.monthly.1")
        candidate_path = root / "candidate.json"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        manifest_path = root / "galaxy_assets_manifest.json"
        manifest_path.write_text('{"prior":true}', encoding="utf-8")
        meta_path = root / "meta.json"
        client = _FakeR2Client(objects=_remote_active(old_profile))
        original_print = print

        def fail_only_success_log(*values: object, **kwargs: object) -> None:
            if values and str(values[0]).startswith("[R2] wrote "):
                raise OSError("injected success-log output failure")
            original_print(*values, **kwargs)

        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}), patch("builtins.print", side_effect=fail_only_success_log):
            assert upload_galaxy_r2.main([
                "--mode", "monthly", "--profile", str(candidate_path), "--public-data-dir", str(root),
                "--monthly-meta", str(meta_path),
            ]) == 0

        active = json.loads(client.objects["galaxy/focus-emission-profiles/active.json"])
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        meta = json.loads(meta_path.read_text(encoding="utf-8"))["emission_profile"]
        assert active["profile_id"] == candidate["profile_id"]
        assert manifest["focus_emission_profile"]["profile_id"] == candidate["profile_id"]
        assert meta["active"]["profile_id"] == candidate["profile_id"]


def test_monthly_bootstrap_requires_explicit_allowance() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _write_assets(root, version="2026.08.monthly.1")
        candidate = _profile("2026-08", "2026.08.monthly.1")
        candidate_path = root / "profile-candidate.json"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        for allow, expected in ((False, 1), (True, 0)):
            client = _FakeR2Client()
            meta_path = root / f"bootstrap-{allow}.json"
            assert not meta_path.exists()
            with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}):
                args = [
                    "--mode", "monthly", "--public-data-dir", str(root), "--profile", str(candidate_path),
                    "--monthly-meta", str(meta_path),
                ]
                if allow:
                    args.append("--allow-bootstrap")
                assert upload_galaxy_r2.main(args) == expected
            assert meta_path.is_file()
            if allow:
                assert "galaxy/focus-emission-profiles/active.json" in client.objects
                assert json.loads(meta_path.read_text(encoding="utf-8"))["emission_profile"]["active"]["profile_id"] == candidate["profile_id"]


def test_same_period_freeze_uploads_candidate_without_advancing_pointer() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        old_profile = _profile("2026-08", "2026.08.monthly.1")
        candidate = _profile("2026-08", "2026.08.monthly.2")
        _write_assets(root, version="2026.08.monthly.2")
        candidate_path = root / "candidate.json"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        client = _FakeR2Client(objects=_remote_active(old_profile))
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}):
            assert upload_galaxy_r2.main(["--mode", "monthly", "--profile", str(candidate_path), "--public-data-dir", str(root), "--monthly-meta", str(root / "meta.json")]) == 0
        assert f"galaxy/focus-emission-profiles/{candidate['profile_id']}.json" in client.uploads
        assert "galaxy/focus-emission-profiles/active.json" not in client.uploads
        manifest = json.loads((root / "galaxy_assets_manifest.json").read_text())
        meta = json.loads((root / "meta.json").read_text())
        assert manifest["focus_emission_profile"]["profile_id"] == old_profile["profile_id"]
        assert meta["emission_profile"]["active"]["profile_id"] == old_profile["profile_id"]
        assert meta["emission_profile"]["drift"]["status"] == "compared"


def test_force_and_pointer_upload_failure_preserve_or_audit_active_state() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        old_profile = _profile("2026-08", "2026.08.monthly.1")
        candidate = _profile("2026-08", "2026.08.monthly.2")
        _write_assets(root, version="2026.08.monthly.2")
        candidate_path = root / "candidate.json"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        client = _FakeR2Client(objects=_remote_active(old_profile))
        args = ["--mode", "monthly", "--profile", str(candidate_path), "--public-data-dir", str(root), "--monthly-meta", str(root / "meta.json"), "--force-activation", "--force-reason", "repair", "--actor", "github:test"]
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}):
            assert upload_galaxy_r2.main(args) == 0
        audit = json.loads((root / "meta.json").read_text())["emission_profile"]["activation_audit"]
        assert audit["old_profile_id"] == old_profile["profile_id"] and audit["new_profile_id"] == candidate["profile_id"]
        assert audit["reason"] == "repair" and audit["actor"] == "github:test"

        failed = _FakeR2Client(fail_key="galaxy/focus-emission-profiles/active.json", objects=_remote_active(old_profile))
        (root / "galaxy_assets_manifest.json").unlink()
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(failed)}):
            assert upload_galaxy_r2.main(args) == 1
        assert failed.uploads[-1].endswith("galaxy_search_index.json.gz")
        assert json.loads(failed.objects["galaxy/focus-emission-profiles/active.json"])["profile_id"] == old_profile["profile_id"]
        assert not (root / "galaxy_assets_manifest.json").exists()
        failure_meta = json.loads((root / "meta.json").read_text())["emission_profile"]
        assert failure_meta["active"]["profile_id"] == old_profile["profile_id"]
        assert "upload failed key='galaxy/focus-emission-profiles/active.json'" in failure_meta["failure_reason"]



def test_previous_active_artifact_missing_or_mismatched_fails_closed() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        candidate = _profile("2026-08", "2026.08.monthly.1")
        _write_assets(root, version="2026.08.monthly.1")
        candidate_path = root / "candidate.json"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        old = _profile("2026-07", "2026.07.monthly.1")
        objects = _remote_active(old)
        objects.pop(f"galaxy/focus-emission-profiles/{old['profile_id']}.json")
        missing = _FakeR2Client(objects=objects)
        missing_meta_path = root / "missing-active-meta.json"
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(missing)}):
            assert upload_galaxy_r2.main([
                "--mode", "monthly", "--profile", str(candidate_path), "--public-data-dir", str(root),
                "--monthly-meta", str(missing_meta_path), "--allow-bootstrap",
            ]) == 1
        assert missing.uploads == []

        corrupt_objects = _remote_active(old)
        corrupt = dict(old)
        corrupt["source_data_version"] = "other"
        corrupt_objects[f"galaxy/focus-emission-profiles/{old['profile_id']}.json"] = json.dumps(corrupt).encode()
        mismatch = _FakeR2Client(objects=corrupt_objects)
        mismatch_meta_path = root / "mismatched-active-meta.json"
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(mismatch)}):
            assert upload_galaxy_r2.main([
                "--mode", "monthly", "--profile", str(candidate_path), "--public-data-dir", str(root),
                "--monthly-meta", str(mismatch_meta_path),
            ]) == 1
        assert mismatch.uploads == []

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _write_assets(root, version="galaxy-v1")
        candidate = _profile("2026-08", "profile-v2")
        candidate_path = root / "candidate.json"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        client = _FakeR2Client(objects=_remote_active(_profile("2026-07", "2026.07.monthly.1")))
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}):
            assert upload_galaxy_r2.main(["--mode", "monthly", "--profile", str(candidate_path), "--public-data-dir", str(root), "--monthly-meta", str(root / "meta.json")]) == 1
        assert client.uploads == []
        assert "source_data_version" in json.loads((root / "meta.json").read_text())["emission_profile"]["failure_reason"]

        class DeniedClient(_FakeR2Client):
            def download_file(self, _bucket: str, _key: str, _destination: str) -> None:
                raise PermissionError("denied")
        denied = DeniedClient()
        denied_meta_path = root / "denied-bootstrap-meta.json"
        _write_assets(root, version="profile-v2")
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(denied)}):
            assert upload_galaxy_r2.main([
                "--mode", "monthly", "--profile", str(candidate_path), "--public-data-dir", str(root),
                "--monthly-meta", str(denied_meta_path), "--allow-bootstrap",
            ]) == 1
        assert denied.uploads == []



def test_candidate_profile_upload_failure_leaves_remote_and_pages_state_unchanged() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        old_profile = _profile("2026-07", "2026.07.monthly.1")
        candidate = _profile("2026-08", "2026.08.monthly.1")
        _write_assets(root, version="2026.08.monthly.1")
        candidate_path = root / "candidate.json"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        profile_key = f"galaxy/focus-emission-profiles/{candidate['profile_id']}.json"
        client = _FakeR2Client(fail_key=profile_key, objects=_remote_active(old_profile))
        meta_path = root / "meta.json"
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}):
            assert upload_galaxy_r2.main(["--mode", "monthly", "--profile", str(candidate_path), "--public-data-dir", str(root), "--monthly-meta", str(meta_path)]) == 1
        assert client.uploads == []
        assert json.loads(client.objects["galaxy/focus-emission-profiles/active.json"])["profile_id"] == old_profile["profile_id"]
        assert not (root / "galaxy_assets_manifest.json").exists()
        assert profile_key in json.loads(meta_path.read_text())["emission_profile"]["failure_reason"]
        assert "upload failed" in json.loads(meta_path.read_text())["emission_profile"]["failure_reason"]


def test_release_requires_valid_galaxy_data_metadata_without_uploads() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        # gzip files exist so each failure isolates the required plain metadata boundary.
        for name in ("galaxy_data.json.gz", "galaxy_search_index.json.gz"):
            (root / name).write_bytes(gzip.compress(b"fixture", mtime=0))
        candidate = _profile("2026-08", "2026.08.monthly.1")
        candidate_path = root / "candidate.json"
        candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
        for payload in (None, {"meta": {"version": ""}}, {"meta": []}):
            galaxy_json = root / "galaxy_data.json"
            if payload is None:
                galaxy_json.unlink(missing_ok=True)
            else:
                galaxy_json.write_text(json.dumps(payload), encoding="utf-8")
            client = _FakeR2Client()
            with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}):
                assert upload_galaxy_r2.main(["--mode", "nightly", "--public-data-dir", str(root)]) == 1
            assert client.uploads == []

        meta_path = root / "meta.json"
        client = _FakeR2Client()
        (root / "galaxy_data.json").unlink(missing_ok=True)
        with patch.dict(os.environ, _env(), clear=True), patch.dict(sys.modules, {"boto3": _install_boto3(client)}):
            assert upload_galaxy_r2.main(["--mode", "monthly", "--profile", str(candidate_path), "--public-data-dir", str(root), "--monthly-meta", str(meta_path)]) == 1
        assert client.uploads == []
        assert "missing required galaxy data metadata" in json.loads(meta_path.read_text())["emission_profile"]["failure_reason"]

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        galaxy = root / "galaxy.gz"
        search = root / "search.gz"
        galaxy.write_bytes(b"aaaa")
        search.write_bytes(b"bbbb")
        first = upload_galaxy_r2.content_release_id(version="v1", galaxy_gzip=galaxy, search_gzip=search)
        galaxy.write_bytes(b"zzzz")
        assert first[0] != upload_galaxy_r2.content_release_id(version="v1", galaxy_gzip=galaxy, search_gzip=search)[0]
        galaxy.write_bytes(b"aaaa")
        assert upload_galaxy_r2.content_release_id(version="v1", galaxy_gzip=galaxy, search_gzip=search) == first
