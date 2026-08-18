"""GitLab CI contract for Chronicle P1 publication jobs."""
from __future__ import annotations

from publication.admission import RESOURCE_GROUP
from publication.errors import PublicationError

_FORBIDDEN_SECRET_ASSIGNMENTS = (
    "BW_SESSION:",
    "BITWARDEN",
    "CLOUDFLARE_API_TOKEN: ",
    "R2_SECRET_ACCESS_KEY: ",
    "SUPABASE_SERVICE_ROLE_KEY: ",
)


def validate_p1_gitlab_ci(text: str) -> dict[str, object]:
    if "site_release:" not in text or "daily_data_release:" not in text:
        raise PublicationError("GitLab CI must define one Site Release job and one Daily Data Release job")
    if f"resource_group: {RESOURCE_GROUP}" not in text:
        raise PublicationError("GitLab publication jobs must share galaxy-r2-pages-release")
    if text.count(f"resource_group: {RESOURCE_GROUP}") < 2:
        raise PublicationError("GitLab publication jobs must share galaxy-r2-pages-release")
    if "P1_SITE_TRIGGER_ENABLED: \"false\"" not in text or "P1_DAILY_SCHEDULE_ENABLED: \"false\"" not in text:
        raise PublicationError("production triggers must start disabled")
    if "CI_COMMIT_REF_PROTECTED" not in text:
        raise PublicationError("production jobs must require protected main")
    if "merge_request_event" not in text:
        raise PublicationError("merge-request pipelines must remain non-production")
    if "interruptible: false" not in text:
        raise PublicationError("running publication jobs must be non-interruptible")
    if "scripts/publication/cli.py site-release" not in text:
        raise PublicationError("Site Release must call the shared Chronicle entry point")
    if "scripts/publication/cli.py daily-release" not in text:
        raise PublicationError("Daily Data Release must call the shared Chronicle entry point")
    if "cloudflare/wrangler-action" in text:
        raise PublicationError("publication jobs must use the cross-platform Wrangler CLI")
    if "continue-candidate" in text or "--continue-candidate" in text:
        raise PublicationError("unsupported stage-level candidate continuation is not exposed")
    for token in _FORBIDDEN_SECRET_ASSIGNMENTS:
        if token in text:
            raise PublicationError("CI must not contain Bitwarden sessions or inline production secret values")
    if "npm test" not in text or "test_current_documentation_authority.py" not in text:
        raise PublicationError("owner checks are required in the Chronicle GitLab adapter")
    site_start = text.index("site_release:")
    daily_start = text.index("daily_data_release:")
    site_block = text[site_start:daily_start]
    daily_block = text[daily_start:]
    if "when: manual" not in site_block or "when: manual" not in daily_block:
        raise PublicationError("production jobs remain manual until human enablement")
    if "npm run build" not in site_block:
        raise PublicationError("Site Release must build the application shell")
    if "npm run build" in daily_block or "npm install" in daily_block:
        raise PublicationError("Daily Data Release must not build the frontend")
    return {
        "site_release": True,
        "daily_data_release": True,
        "resource_group": RESOURCE_GROUP,
        "triggers_enabled": False,
        "wrangler_action": False,
    }
