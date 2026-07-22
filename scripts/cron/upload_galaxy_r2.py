#!/usr/bin/env python3
"""P18.6b / P42.4: Upload galaxy assets and frozen emission-profile releases to Cloudflare R2.

Writes ``frontend/public/data/galaxy_assets_manifest.json`` for Pages. Galaxy gzip
objects retain the existing cache-busted URL contract. Focus-emission profiles use
immutable object keys; only monthly mode may upload a profile or advance its active
pointer. Nightly mode downloads and verifies that pointer, then reuses it unchanged.

Required env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
R2_PUBLIC_BASE_URL. Missing configuration is a failure: publishing an asset manifest
without its active-profile provenance would be an unsafe mixed release.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import quote

try:  # Direct script execution vs package imports in tests.
    from cron.emission_profile_release import (
        ProfileReleaseError,
        active_pointer_key,
        build_assets_manifest,
        build_monthly_refit_meta_payload,
        load_monthly_refit_meta,
        decide_activation,
        immutable_profile_key,
        immutable_profile_url,
        update_monthly_refit_meta,
        validate_active_pointer,
        verify_profile_matches_active_pointer,
        write_json_atomic,
    )
    from cron.monthly_profile_generator import calculate_drift_metrics
except ModuleNotFoundError:  # pragma: no cover - direct workflow execution
    from emission_profile_release import (
        ProfileReleaseError,
        active_pointer_key,
        build_assets_manifest,
        build_monthly_refit_meta_payload,
        load_monthly_refit_meta,
        decide_activation,
        immutable_profile_key,
        immutable_profile_url,
        update_monthly_refit_meta,
        validate_active_pointer,
        verify_profile_matches_active_pointer,
        write_json_atomic,
    )
    from monthly_profile_generator import calculate_drift_metrics

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_PUBLIC_DATA = _REPO_ROOT / "frontend" / "public" / "data"


class RemoteObjectNotFound(ProfileReleaseError):
    """R2/S3 explicitly reported that the requested immutable object does not exist."""


def _is_explicit_not_found(error: Exception) -> bool:
    if isinstance(error, FileNotFoundError):
        return True
    response = getattr(error, "response", None)
    if not isinstance(response, Mapping):
        return False
    detail = response.get("Error")
    if not isinstance(detail, Mapping):
        return False
    code = detail.get("Code")
    return isinstance(code, str) and code in {"NoSuchKey", "NotFound", "404"}


def _required_r2_credentials() -> dict[str, str] | None:
    """Return the shared R2 S3 credentials without any public-serving settings."""
    keys = (
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET",
    )
    out: dict[str, str] = {}
    for key in keys:
        value = os.environ.get(key, "").strip()
        if not value:
            return None
        out[key] = value
    return out


def _required_env() -> dict[str, str] | None:
    """Return upload credentials plus the public URL required by manifest generation."""
    out = _required_r2_credentials()
    if out is None:
        return None
    public_base_url = os.environ.get("R2_PUBLIC_BASE_URL", "").strip()
    if not public_base_url:
        return None
    return {**out, "R2_PUBLIC_BASE_URL": public_base_url}


def _public_base_url(base: str) -> str:
    b = base.rstrip("/")
    return b


def _object_urls(*, public_base: str, gal_key: str, idx_key: str) -> tuple[str, str]:
    base = public_base.rstrip("/")
    return f"{base}/{gal_key}", f"{base}/{idx_key}"


def content_release_id(*, version: str, galaxy_gzip: Path, search_gzip: Path) -> tuple[str, str, str]:
    """Return a stable release ID and the complete content hashes it represents."""
    def digest(path: Path) -> str:
        assert path.is_file(), f"release asset missing: {path}"
        hasher = hashlib.sha256()
        with path.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                hasher.update(chunk)
        return hasher.hexdigest()

    galaxy_sha256 = digest(galaxy_gzip)
    search_sha256 = digest(search_gzip)
    release_id = hashlib.sha256(
        f"{version}\0{galaxy_sha256}\0{search_sha256}".encode("utf-8")
    ).hexdigest()[:16]
    return release_id, galaxy_sha256, search_sha256


# Every galaxy release receives an immutable R2 key. The Pages manifest is the
# only mutable reference, so an interrupted upload cannot poison a prior release.
R2_VERSIONED_GZIP_CACHE_CONTROL = "public, max-age=31536000, immutable"


def _upload_one(
    client: Any,
    bucket: str,
    key: str,
    path: Path,
    content_type: str,
    *,
    cache_control: str,
) -> None:
    assert path.is_file(), f"missing file to upload: {path}"
    size = path.stat().st_size
    print(
        f"[R2] upload key={key!r} bytes={size} content_type={content_type} "
        f"cache_control={cache_control!r}",
        flush=True,
    )
    try:
        client.upload_file(
            str(path),
            bucket,
            key,
            ExtraArgs={
                "ContentType": content_type,
                "CacheControl": cache_control,
            },
        )
    except Exception as exc:
        # Deliberately excludes BaseException: Ctrl-C and process termination must propagate.
        raise ProfileReleaseError(f"upload failed key={key!r}: {exc}") from exc


def _best_effort_print(message: str) -> None:
    """Emit post-publication diagnostics without changing an already-live release."""
    try:
        print(message, flush=True)
    except Exception:
        pass


def _best_effort_success_log(*, manifest_path: Path, mode: str, profile_id: str) -> None:
    """Log a committed release without allowing path or output failures to affect it."""
    try:
        display_path = manifest_path.relative_to(_REPO_ROOT) if manifest_path.is_relative_to(_REPO_ROOT) else manifest_path
        _best_effort_print(f"[R2] wrote {display_path} mode={mode} profile_id={profile_id}")
    except Exception:
        pass


def _maybe_prune(public_data: Path, *, manifest_path: Path) -> None:
    to_remove = [
        public_data / "galaxy_data.json",
        public_data / "galaxy_data.json.gz",
        public_data / "galaxy_search_index.json.gz",
    ]
    for p in to_remove:
        if p.is_file():
            print(f"[R2] prune {p.relative_to(_REPO_ROOT)}", flush=True)
            p.unlink()
    assert manifest_path.is_file(), "manifest must remain after prune"
    print("[R2] prune done; manifest kept for Pages bundle", flush=True)


def _restore_or_remove_manifest(manifest_path: Path, prior_bytes: bytes | None) -> None:
    """Remove a prepared manifest or restore the exact pre-release local state."""
    if prior_bytes is None:
        manifest_path.unlink(missing_ok=True)
        return
    rollback_path = manifest_path.with_name(f".{manifest_path.name}.rollback")
    try:
        rollback_path.write_bytes(prior_bytes)
        os.replace(rollback_path, manifest_path)
    finally:
        rollback_path.unlink(missing_ok=True)


def _load_json_object(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ProfileReleaseError(f"cannot read {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise ProfileReleaseError(f"{label} must be a JSON object")
    return value


def _download_json_object(client: Any, bucket: str, key: str, destination: Path, *, label: str) -> dict[str, Any]:
    try:
        client.download_file(bucket, key, str(destination))
    except Exception as exc:  # boto3 client errors vary by configured endpoint.
        if _is_explicit_not_found(exc):
            raise RemoteObjectNotFound(f"remote object absent for {label} key={key!r}") from exc
        raise ProfileReleaseError(f"cannot download {label} key={key!r}: {exc}") from exc
    return _load_json_object(destination, label=label)


def _read_galaxy_data_version(path: Path) -> str:
    """Return the mandatory export version; releases cannot safely fall back to a synthetic ID."""
    if not path.is_file():
        raise ProfileReleaseError(f"missing required galaxy data metadata file: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ProfileReleaseError(f"cannot parse galaxy data metadata file {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ProfileReleaseError("galaxy_data.json must be a JSON object")
    meta = payload.get("meta")
    if not isinstance(meta, dict):
        raise ProfileReleaseError("galaxy_data.json meta must be an object")
    version = meta.get("version")
    if not isinstance(version, str) or not version.strip():
        raise ProfileReleaseError("galaxy_data.json meta.version must be a non-empty string")
    return version.strip()


def _upload_profile_release(
    *,
    client: Any,
    bucket: str,
    prefix: str,
    public_base: str,
    profile_path: Path,
    existing_active: Mapping[str, Any] | None,
    force_activation: bool,
    force_reason: str | None,
    actor: str | None,
) -> tuple[dict[str, Any], str, Any]:
    """Upload immutable profile first; only then decide/upload its active pointer."""
    candidate = _load_json_object(profile_path, label="candidate profile")
    profile_id = str(candidate.get("profile_id", ""))
    profile_key = immutable_profile_key(prefix, profile_id)
    _upload_one(client, bucket, profile_key, profile_path, "application/json", cache_control=R2_VERSIONED_GZIP_CACHE_CONTROL)
    decision = decide_activation(
        candidate_profile=candidate,
        existing_active_pointer=existing_active,
        force=force_activation,
        reason=force_reason,
        actor=actor,
    )
    # The caller uploads galaxy assets before advancing this pointer. That keeps the
    # public active state as the final remote mutation, never a half-published release.
    return decision.pointer, immutable_profile_url(public_base, profile_key), decision


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--mode",
        choices=("monthly", "nightly"),
        required=True,
        help="monthly may upload a validated candidate; nightly must only reuse the remote active pointer",
    )
    p.add_argument("--profile", type=Path, default=None, help="Validated immutable candidate profile (monthly only)")
    p.add_argument("--active-pointer-file", type=Path, default=None, help="Optional downloaded active pointer fixture")
    p.add_argument("--allow-bootstrap", action="store_true", help="Monthly-only explicit first-profile bootstrap when no remote pointer exists")
    p.add_argument("--force-activation", action="store_true", help="Monthly-only audited override of same-period freeze")
    p.add_argument("--force-reason", default=None)
    p.add_argument("--actor", default=None)
    p.add_argument("--monthly-meta", type=Path, default=_REPO_ROOT / "monthly_refit_meta.json")
    p.add_argument(
        "--public-data-dir",
        type=Path,
        default=_DEFAULT_PUBLIC_DATA,
        help="Directory with galaxy export files (default: frontend/public/data)",
    )
    args = p.parse_args(argv)

    public_data: Path = args.public_data_dir.resolve()
    gal_json = public_data / "galaxy_data.json"
    gal_gz = public_data / "galaxy_data.json.gz"
    idx_gz = public_data / "galaxy_search_index.json.gz"
    manifest_path = public_data / "galaxy_assets_manifest.json"

    env = _required_env()
    if env is None:
        print(
            "[R2] error: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and R2_PUBLIC_BASE_URL are required for a profile-safe release",
            flush=True,
        )
        return 1

    if not gal_gz.is_file():
        print(f"[R2] error: missing {gal_gz}", flush=True)
        return 1
    if not idx_gz.is_file():
        print(f"[R2] error: missing {idx_gz}", flush=True)
        return 1

    gz_size = gal_gz.stat().st_size
    idx_size = idx_gz.stat().st_size
    assert gz_size > 0, "galaxy_data.json.gz must be non-empty"
    assert idx_size > 0, "galaxy_search_index.json.gz must be non-empty"

    try:
        version = _read_galaxy_data_version(gal_json)
    except ProfileReleaseError as exc:
        if args.mode == "monthly" and args.profile is not None and args.profile.expanduser().is_file():
            try:
                failed_candidate = _load_json_object(args.profile.expanduser().resolve(), label="candidate profile")
                update_monthly_refit_meta(
                    args.monthly_meta.expanduser().resolve(),
                    candidate_profile=failed_candidate,
                    active_pointer=None,
                    decision=None,
                    failure_reason=str(exc),
                )
            except (ProfileReleaseError, OSError, RuntimeError):
                pass
        print(f"[R2] error: {exc}", flush=True)
        return 1
    release_id, galaxy_sha256, search_sha256 = content_release_id(
        version=version,
        galaxy_gzip=gal_gz,
        search_gzip=idx_gz,
    )
    version_segment = quote(version, safe="")

    prefix = os.environ.get("R2_KEY_PREFIX", "galaxy").strip().strip("/")
    account_id = env["R2_ACCOUNT_ID"]
    bucket = env["R2_BUCKET"]
    public_base = _public_base_url(env["R2_PUBLIC_BASE_URL"])

    release_prefix = f"{prefix}/releases/{version_segment}-{release_id}" if prefix else f"releases/{version_segment}-{release_id}"
    gal_key = f"{release_prefix}/galaxy_data.json.gz"
    idx_key = f"{release_prefix}/galaxy_search_index.json.gz"

    print(
        f"[R2] shapes: gal_gz_bytes={gz_size} idx_gz_bytes={idx_size} version={version!r} "
        f"galaxy_gzip_sha256={galaxy_sha256} search_gzip_sha256={search_sha256} release_id={release_id}",
        flush=True,
    )

    try:
        import boto3  # noqa: WPS433
    except ImportError:
        print("[R2] error: boto3 not installed (add to requirements.cpu.txt)", flush=True)
        return 1

    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )

    existing_active: dict[str, Any] | None = None
    prior_active: dict[str, Any] | None = None
    profile_url: str | None = None
    activation_audit: dict[str, Any] | None = None
    monthly_decision: Any | None = None
    candidate_profile: dict[str, Any] | None = None
    candidate_drift: Mapping[str, Any] | None = None
    prepared_monthly_meta: dict[str, Any] | None = None
    prior_manifest_bytes: bytes | None = None
    success_manifest_written = False
    pointer_committed = False
    try:
        if manifest_path.is_file():
            prior_manifest_bytes = manifest_path.read_bytes()
        pointer_key = active_pointer_key(prefix)
        if args.active_pointer_file is not None:
            existing_active = validate_active_pointer(_load_json_object(args.active_pointer_file.resolve(), label="active profile pointer"))
        else:
            pointer_temp = public_data / ".active-focus-emission-profile.json"
            try:
                existing_active = validate_active_pointer(
                    _download_json_object(client, bucket, pointer_key, pointer_temp, label="active profile pointer")
                )
            except RemoteObjectNotFound:
                if args.mode == "nightly" or not args.allow_bootstrap:
                    raise
                # Bootstrap is explicitly opt-in and only permits a typed absent-pointer result.
                existing_active = None
            finally:
                pointer_temp.unlink(missing_ok=True)

        prior_active = existing_active
        verified_previous_profile: dict[str, Any] | None = None
        if existing_active is not None:
            previous_profile_key = immutable_profile_key(prefix, existing_active["profile_id"])
            profile_temp = public_data / ".active-focus-emission-profile-artifact.json"
            try:
                verified_previous_profile = _download_json_object(
                    client, bucket, previous_profile_key, profile_temp, label="active immutable profile"
                )
                verify_profile_matches_active_pointer(verified_previous_profile, existing_active)
            finally:
                profile_temp.unlink(missing_ok=True)

        if args.mode == "nightly":
            if args.profile is not None or args.force_activation:
                raise ProfileReleaseError("nightly must not generate or activate a profile")
            if existing_active is None:
                raise ProfileReleaseError("nightly requires an existing active profile pointer")
            assert verified_previous_profile is not None, "existing active pointer must have a verified artifact"
            profile_url = immutable_profile_url(public_base, immutable_profile_key(prefix, existing_active["profile_id"]))
            # A nightly release never writes either profile object or active pointer.
            activation_audit = {"action": "nightly-reused-active", "profile_id": existing_active["profile_id"]}
        else:
            if args.profile is None or not args.profile.expanduser().is_file():
                raise ProfileReleaseError("monthly requires --profile pointing to a validated candidate artifact")
            candidate_profile = _load_json_object(args.profile.expanduser().resolve(), label="candidate profile")
            candidate_source_version = candidate_profile.get("source_data_version")
            if candidate_source_version != version:
                raise ProfileReleaseError(
                    "candidate source_data_version must equal current galaxy_data meta.version "
                    f"(candidate={candidate_source_version!r}, galaxy={version!r})"
                )
            # Both ordinary activation and same-period freeze retain measured candidate→active drift.
            candidate_drift = calculate_drift_metrics(candidate_profile, verified_previous_profile)
            active_pointer, profile_url, monthly_decision = _upload_profile_release(
                client=client,
                bucket=bucket,
                prefix=prefix,
                public_base=public_base,
                profile_path=args.profile.expanduser().resolve(),
                existing_active=existing_active,
                force_activation=bool(args.force_activation),
                force_reason=args.force_reason,
                actor=args.actor,
            )
            activation_audit = monthly_decision.audit
            # Same-period freeze keeps the old pointer identity and URL in the released manifest.
            existing_active = active_pointer
            profile_url = immutable_profile_url(public_base, immutable_profile_key(prefix, existing_active["profile_id"]))

        _upload_one(client, bucket, gal_key, gal_gz, "application/gzip", cache_control=R2_VERSIONED_GZIP_CACHE_CONTROL)
        _upload_one(client, bucket, idx_key, idx_gz, "application/gzip", cache_control=R2_VERSIONED_GZIP_CACHE_CONTROL)

        gal_url, idx_url = _object_urls(public_base=public_base, gal_key=gal_key, idx_key=idx_key)
        exported_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        r2_object_keys: dict[str, str] = {"galaxy_data": gal_key, "galaxy_search_index": idx_key}
        manifest = build_assets_manifest(
            galaxy_url=gal_url,
            search_url=idx_url,
            data_version=version,
            exported_at=exported_at,
            r2_object_keys=r2_object_keys,
            active_pointer=existing_active,
            profile_url=profile_url,
        )
        if args.mode == "monthly":
            assert candidate_profile is not None and candidate_drift is not None and monthly_decision is not None
            # Read, validate, and fully assemble this audit payload before active pointer mutation.
            prepared_monthly_meta = build_monthly_refit_meta_payload(
                load_monthly_refit_meta(args.monthly_meta.expanduser().resolve()),
                candidate_profile=candidate_profile,
                active_pointer=existing_active,
                decision=monthly_decision,
                candidate_drift=candidate_drift,
            )
        rid = os.environ.get("GITHUB_RUN_ID", "").strip()
        if rid:
            manifest["github_run_id"] = rid

        # Persist all local state before the mutable remote pointer. Pages is not deployed yet,
        # so this temporary local manifest cannot become public before the pointer transition.
        write_json_atomic(manifest_path, manifest)
        success_manifest_written = True
        if args.mode == "monthly":
            assert prepared_monthly_meta is not None
            write_json_atomic(args.monthly_meta.expanduser().resolve(), prepared_monthly_meta)

        # The pointer is deliberately the final fallible publication action. Do not add writes
        # after this transition: a failure above leaves the old remote pointer intact.
        if args.mode == "monthly" and activation_audit is not None and activation_audit["action"] in {"monthly-activation", "force-activation"}:
            pointer_temp = public_data / ".active-focus-emission-profile.json"
            try:
                write_json_atomic(pointer_temp, existing_active)
                _upload_one(client, bucket, pointer_key, pointer_temp, "application/json", cache_control="no-cache, must-revalidate")
                pointer_committed = True
            finally:
                try:
                    pointer_temp.unlink(missing_ok=True)
                except Exception as cleanup_error:
                    # The pointer may already be live; scratch-file cleanup is never release state.
                    _best_effort_print(f"[R2] warning: pointer scratch cleanup failed: {cleanup_error}")
    except Exception as exc:
        if pointer_committed:
            # Guard the invariant for future maintenance: after the active pointer is live,
            # local diagnostics and cleanup must never report or roll back a failed release.
            _best_effort_print(f"[R2] warning: post-pointer action failed: {exc}")
            return 0
        if not isinstance(exc, (ProfileReleaseError, OSError, RuntimeError)):
            raise
        if success_manifest_written:
            try:
                _restore_or_remove_manifest(manifest_path, prior_manifest_bytes)
            except OSError:
                pass
        if args.mode == "monthly" and args.profile is not None and args.profile.expanduser().is_file():
            try:
                failed_candidate = _load_json_object(args.profile.expanduser().resolve(), label="candidate profile")
                update_monthly_refit_meta(
                    args.monthly_meta.expanduser().resolve(),
                    candidate_profile=failed_candidate,
                    active_pointer=prior_active,
                    decision=None,
                    failure_reason=str(exc),
                )
            except (ProfileReleaseError, OSError, RuntimeError):
                # The original publication failure remains authoritative; metadata evidence must
                # never hide it or create a new active pointer.
                pass
        print(f"[R2] error: {exc}", flush=True)
        return 1

    _best_effort_success_log(manifest_path=manifest_path, mode=args.mode, profile_id=existing_active["profile_id"])

    if os.environ.get("R2_GALAXY_PRUNE_AFTER_UPLOAD", "").strip() == "1":
        try:
            _maybe_prune(public_data, manifest_path=manifest_path)
        except Exception as exc:
            # Remote pointer already committed; pruning is a local size optimization, not release state.
            print(f"[R2] warning: post-release local prune failed: {exc}", flush=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
