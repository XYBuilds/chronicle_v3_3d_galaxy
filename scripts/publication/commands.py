"""Shared command argv for Site and Daily publication entry points."""
from __future__ import annotations

import sys
import os
from datetime import date
from pathlib import Path
from tempfile import gettempdir
from typing import Sequence

from publication.errors import PublicationError

WRANGLER_PACKAGE = "wrangler@3.114.0"
PRODUCTION_PAGES_BRANCH = "main"
WINDOWS_PREVIEW_BRANCH = "p1-windows-preview"
PAGES_BUNDLE = "pages-bundle"
DANGEROUS_TOKENS = (
    "force_skip_dim_check",
    "allow_profile_bootstrap",
    "force_profile_activation",
    "force_profile_reason",
    "bootstrap_og_index",
    "--allow-bootstrap",
    "--force-activation",
    "--allow-full-recovery",
    "--allow-over-quota",
    "--continue-candidate",
    "candidate continuation",
)


def work_paths() -> dict[str, str]:
    root = Path(gettempdir()) / "chronicle-publication"
    return {
        "live_manifest": str(root / "live-manifest.json"),
        "site_identity": str(root / "site-identity.json"),
        "site_tar": str(root / "site-artifact.tar"),
        "site_registry": str(root / "site-registry.json"),
        "hold": str(root / "publication-hold.json"),
        "deployed_sidecar": str(root / "deployed-sidecar.json"),
        "previous_manifest": str(root / "previous-manifest.json"),
        "pages_bundle": PAGES_BUNDLE,
    }


def wrangler_pages_deploy(*, project_name: str, branch: str, dist_dir: str = "dist") -> tuple[str, ...]:
    return (
        "npx",
        "--yes",
        WRANGLER_PACKAGE,
        "pages",
        "deploy",
        dist_dir,
        f"--project-name={project_name}",
        f"--branch={branch}",
    )


def python_script(script: str, *args: str) -> tuple[str, ...]:
    return (sys.executable, script, *args)


def og_sync_command(*, started_at: str) -> tuple[str, ...]:
    """An operator may lower a UTC day's per-run budget, never raise 900.

    This is not an account usage meter: the operator must subtract all earlier
    writes and update the remaining allowance before each admitted replay.
    Capture the cap at entry so a long refit crossing midnight stays conservative.
    """
    raw_limit = os.environ.get("OG_INDEX_PUT_BUDGET", "").strip()
    raw_day = os.environ.get("OG_INDEX_PUT_BUDGET_DATE", "").strip()
    limit = 900
    if raw_limit or raw_day:
        try:
            parsed_day = date.fromisoformat(raw_day)
            configured = int(raw_limit)
            if parsed_day.isoformat() != raw_day or not 0 <= configured <= 900:
                raise ValueError
        except ValueError as exc:
            raise PublicationError("OG put budget requires a UTC YYYY-MM-DD date and an integer in 0..900") from exc
        if raw_day == started_at[:10]:
            limit = configured
    return python_script("scripts/cron/sync_og_index_kv.py", "--scope", "incremental", "--max-puts", str(limit))


def assert_no_dangerous_tokens(argv: Sequence[str]) -> None:
    joined = " ".join(argv)
    for token in DANGEROUS_TOKENS:
        if token in joined:
            raise PublicationError(f"dangerous recovery control leaked into publication argv: {token}")
