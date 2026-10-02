# Restore GitLab Site and Daily publication control



Source: https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/merge_requests/2

State at capture: **merged**

Original author: @yixie.ixd

Created: 2026-08-18T14:08:58.050Z; updated: 2026-08-18T14:11:52.181Z



Labels at capture: (none)

Assignees at capture: @yixie.ixd

## Original body



Issue-owned P1 publication-control restoration for `tmc:chronicle:01M09Y4T044FR6X31Q618TC2K9` (GitLab #6).

Adds provider-neutral Chronicle Site Release and Daily Data Release entry points, a durable publication sequence/receipt seam, and GitLab jobs that share `galaxy-r2-pages-release`. Production triggers stay disabled (`P1_SITE_TRIGGER_ENABLED` / `P1_DAILY_SCHEDULE_ENABLED` = false). GitHub publication workflows remain in-tree as disabled cutback artifacts.

**Risk declaration:** R3; protected surfaces `publication`, `planet_export`, `og_worker`, `daily`. Machine-readable copy: `scripts/publication/fixtures/risk-declaration.json`. Concrete production resources and secrets are recorded only in declaration notes.

**Implementation evidence (HEAD `d03e824`):** `/implement` ran 67 related pytest cases and `git diff --check`. Standards/Spec review was performed on that commit; remaining open items are human-gated cutover, not merge-blocking code defects.

**Not claimed in this merge:** scoped GitLab production copies, API read-back of `oldest_first`, live inventory, manual production Site/Daily runs, Windows preview against live Pages, job-minute measurement, schedule enablement, and R3 integration acceptance.

Human merge approval is required. Do not merge with bypass. Production enablement and Issue closure remain separately human-gated.



## Original notes



### @yixie.ixd — 2026-08-18T14:08:58.472Z (note 3700222031; system)



assigned to @yixie.ixd



### @yixie.ixd — 2026-08-18T14:10:50.041Z (note 3700232801; system)



enabled an automatic merge when all merge checks for d03e824dd6163880ca935466899d9e28e33ce7f6 pass



### @yixie.ixd — 2026-08-18T14:11:52.630Z (note 3700238175; system)



mentioned in commit e2f92538e1756d98bc1f2e84ad9c99bf77d068df



### @yixie.ixd — 2026-08-18T14:13:06.607Z (note 3700244351; system)



mentioned in issue #6
