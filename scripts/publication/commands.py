"""Shared command argv for Site and Daily publication entry points."""
from __future__ import annotations

import sys
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


def assert_no_dangerous_tokens(argv: Sequence[str]) -> None:
    joined = " ".join(argv)
    for token in DANGEROUS_TOKENS:
        if token in joined:
            raise PublicationError(f"dangerous recovery control leaked into publication argv: {token}")
