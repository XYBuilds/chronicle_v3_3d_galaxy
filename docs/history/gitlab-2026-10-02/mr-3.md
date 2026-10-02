# Migrate suspended Monthly and local Production Recovery



Source: https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/merge_requests/3

State at capture: **merged**

Original author: @yixie.ixd

Created: 2026-08-18T15:44:38.906Z; updated: 2026-08-18T15:55:14.779Z



Labels at capture: (none)

Assignees at capture: @yixie.ixd

## Original body



Issue-owned P2 Monthly-suspension and Production-Recovery migration for `tmc:chronicle:01M09Y4T05BTWFBX7H5N67MBXR` (GitLab #7).

Adds an intact GitLab `monthly_data_release` job and provider-neutral `monthly-release` entry point while keeping every production trigger and manual production run disabled. Daily continues to reuse the last active profile. Production Recovery moves to a local audited planner; hold/resume is the only direct mutation, and `continue_candidate` is removed from the supported surface.

**Risk declaration:** R3; protected surfaces `publication`, `planet_export`, `og_worker`, `daily`. Machine-readable copy: `scripts/publication/fixtures/risk-declaration.json`. Concrete production resources and secrets are recorded only in declaration notes.

**Implementation evidence (HEAD `2aa85ac5b61f6507ee43ce66695c200fa18df120`):** `/implement` ran 106 pytest cases in the GitLab `docs_verify` set and `git diff --check`. Standards/Spec review was performed on that commit; remaining open items are human-gated operations, not merge-blocking code defects.

**Not claimed in this merge:** real MacBook/R2 canonical-bundle copy and production SHA-256 recording, live R3 owner-check/Planet Export-to-Daily/OG Worker execution, any production recovery mutation, publication resume, GitHub cutback, Monthly re-enablement, or Issue closure.

Human merge approval is required. Do not merge with bypass. Bundle-copy execution, recovery mutation, publication resume, Monthly re-enablement, and Issue closure remain separately human-gated. Related to #7.



## Original notes



### @yixie.ixd — 2026-08-18T15:44:39.063Z (note 3700783803; system)



assigned to @yixie.ixd



### @yixie.ixd — 2026-08-18T15:55:14.378Z (note 3700856330; system)



mentioned in commit 6a27d3d08f95f67401d6a2ad349cdae78f5b4d07
