# 04 — Restore Daily Stargazing repository and Issue-driven delivery



Source: https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/work_items/5

State at capture: **closed**

Original author: @yixie.ixd

Created: 2026-08-18T09:52:29.702Z; updated: 2026-08-18T13:37:20.248Z



Labels at capture: ready-for-agent

Assignees at capture: @yixie.ixd

## Original body



**Portable ID:** `tmc:daily:01M09Y4T037CYJVTVDKSS7ZP19`
**Parent:** Restore development and operations without a GitHub account single point of failure (`tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`)
**Blocked by:** 02 — Restore Chronicle repository and Issue-driven delivery (`tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC`)
**Local state:** ready-for-agent
# 04 — Restore Daily Stargazing repository and Issue-driven delivery

**Portable ID:** `tmc:daily:01M09Y4T037CYJVTVDKSS7ZP19`

**Parent:** [Restore development and operations without a GitHub account single point of failure](../spec.md) (`tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`)

**What to build:** Restore Daily Stargazing as an independently owned, self-contained private GitLab repository with one active tracker, protected delivery, and a passing non-deploying merge-request cycle. A future clone must contain a normal usable Git repository and must not depend on accidentally copying only the old mounted worktree without its external Git store.

**Blocked by:** [02 — Restore Chronicle repository and Issue-driven delivery](./02-restore-chronicle-repository-and-issue-driven-delivery.md)

**Status:** ready-for-agent

- [ ] A human-approved risk declaration identifies the P0 tier and canonical protected surfaces for the actual Daily restoration scope.
- [ ] Daily Stargazing is created as a private candidate project and receives only secret-reviewed, human-approved ordinary branches and formal tags through explicit ref selections.
- [ ] `main` is the protected default branch, direct and force pushes are disabled, and effective protection is verified through provider output.
- [ ] The repository's delivery Issue carries its own portable identity and a titled portable parent reference to the Chronicle Recovery Initiative.
- [ ] A normalized tracker export/import preserves the Issue body, labels, relationships, comments, and state, and exactly one Daily tracker becomes writable.
- [ ] One Issue-owned bootstrap merge request installs minimal current agent/tracker guidance and a thin, non-deploying GitLab CI path without adding Chronicle-owned runtime rules.
- [ ] The bootstrap change passes Daily's existing pytest suite in the non-deploying pipeline.
- [ ] The maintainer approves and merges through protected `main` without bypass, with separate explicit approval required before Issue closure.
- [ ] A new empty-directory clone is a normal self-contained Git repository, reproduces the approved `main` and formal tags, contains no unexpected or missing promoted refs, and passes full Git integrity checks.
- [ ] The candidate remote is promoted only after the development-resume gate passes; Daily editorial/publication behavior, production secrets, and deployment remain outside this slice.
- [ ] A sanitized evidence bundle records source/remote refs, the former external-Git-store recovery boundary, tracker identity, protection settings, pipeline/tests, merge approval, clone/integrity proof, UTC times, and residual uncertainty without containing secret values.



## Original notes



### @yixie.ixd — 2026-08-18T10:11:26.556Z (note 3698983432; system)



mentioned in issue #3



### @yixie.ixd — 2026-08-18T12:22:44.600Z (note 3699616247; system)



assigned to @yixie.ixd



### @yixie.ixd — 2026-08-18T12:35:19.175Z (note 3699681386)



Tracker transition 2026-08-18T12:35:00Z: this Chronicle Issue is frozen as a named alias. The writable Daily tracker is https://gitlab.com/yixie.ixd/themoviecosmos-daily-stargazing/-/work_items/1 (`tmc:daily:01M09Y4T037CYJVTVDKSS7ZP19`). Portable identity and titled parent/blocker references are unchanged. GitHub remains a capture-first alias if access returns. Human merge and Issue closure stay required.



### @yixie.ixd — 2026-08-18T12:35:19.724Z (note 3699681528; system)



mentioned in issue themoviecosmos-daily-stargazing#1



### @yixie.ixd — 2026-08-18T12:57:24.158Z (note 3699801290; system)



mentioned in merge request themoviecosmos-daily-stargazing!1



### @yixie.ixd — 2026-08-18T13:34:51.468Z (note 3700019891)



Writable Daily Issue https://gitlab.com/yixie.ixd/themoviecosmos-daily-stargazing/-/work_items/1 is closed after human-approved merge of Daily !1. This Chronicle Issue remains a frozen alias only (`tmc:daily:01M09Y4T037CYJVTVDKSS7ZP19`). Closing it so Daily work is not picked up here. Local Markdown stays frozen. Clone proof, origin promotion, and the sanitized evidence bundle were not claimed.



### @yixie.ixd — 2026-08-18T13:37:17.507Z (note 3700037779; system)



marked the checklist item **A human\-approved risk declaration identifies the P0 tier and canonical protected surfaces for the actual Daily restoration scope\.** as completed



### @yixie.ixd — 2026-08-18T13:37:20.480Z (note 3700037979; system)



marked the checklist item **A human\-approved risk declaration identifies the P0 tier and canonical protected surfaces for the actual Daily restoration scope\.** as incomplete
