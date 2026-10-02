# 02 — Restore Chronicle repository and Issue-driven delivery



Source: https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/work_items/3

State at capture: **closed**

Original author: @yixie.ixd

Created: 2026-08-18T09:52:27.058Z; updated: 2026-08-18T10:43:42.357Z



Labels at capture: ready-for-agent

Assignees at capture: (none)

## Original body



**Portable ID:** `tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC`
**Parent:** Restore development and operations without a GitHub account single point of failure (`tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`)
**Blocked by:** 01 ? P0 Common Protection and GitLab Admission (`tmc:chronicle:01M09Y4T00V0P1XJFNPFGE2QDV`)
**Local state:** closed
# 02 ? Restore Chronicle repository and Issue-driven delivery

**Portable ID:** `tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC`

**Parent:** [Restore development and operations without a GitHub account single point of failure](../spec.md) (`tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`)

**What to build:** Restore Chronicle as the first authoritative private GitLab repository and prove that its normal Issue-owned branch, automated-check, reviewed merge-request, and fresh-clone workflow works without GitHub. This slice must also migrate the recovery specification and tracker context into one writable Issue authority while keeping all deployment and publication capabilities disabled.

**Blocked by:** [01 ? P0 Common Protection and GitLab Admission](./01-p0-common-protection-and-gitlab-admission.md)

**Status:** closed
**Assignee:** PEXY98
**Tracker:** GitLab is the sole writable tracker. Local Markdown remains frozen archival.

**Risk declaration:** R0; protected surfaces none. Machine-readable copy stored with restore evidence.

```json
{
  "schema": "chronicle-risk-declaration-v1",
  "tier": "R0",
  "surfaces": [],
  "notes": "Issue 02 exact scope after review: private GitLab Chronicle candidate, approved-ref push, protected main, tracker freeze/import, and one non-deploying bootstrap merge request. No production mutation, no production secrets in CI, no Site Release, Data Release, Production Recovery, or schedules, and no change to visual output, browser journeys, publication, Planet Export, OG Worker runtime, or Daily editorial/publication behavior."
}
```

- [x] A human-approved risk declaration identifies the P0 tier and canonical protected surfaces for the actual Chronicle restoration scope.
- [x] Chronicle is created as a private project in the admitted GitLab namespace and remains a non-authoritative candidate until every development-resume criterion passes.
- [x] Reachable history intended for promotion is reviewed for secret evidence, and only approved `main`, formal tags, and Issue-owned active branches are pushed through explicit ref selections.
- [x] `main` is the declared default branch; direct push and force push are disabled; the effective protection settings are read back through the provider API.
- [x] The closed Wayfinder decisions, accepted Spec, six delivery Issues, comments/resolution context, portable identities, parent references, and blocker edges survive a normalized export, import, relationship check, and complete local render.
- [x] The local tracker is frozen before GitLab becomes writable, leaving exactly one active tracker; provider Issue numbers remain aliases rather than portable identities.
- [x] One Issue-owned bootstrap merge request installs current domain and tracker guidance plus a thin, non-deploying GitLab CI adapter without introducing production deployment copies or schedules.
- [x] The bootstrap change passes Chronicle's scope-matching frontend tests, lint, build, current documentation-authority checks, non-deploying GitLab pipeline, and diff validation.
- [x] The maintainer approves and merges through the protected branch without bypass, and the Issue remains open until the development-resume evidence is reviewed and human closure is explicitly approved.
- [x] A new empty-directory clone reproduces the approved `main` and tag object identities, contains zero unexpected or missing promoted refs, and passes full Git integrity checks.
- [x] The recovered remote is promoted only after acceptance; the suspended GitHub URL remains a named alias for later capture and reconciliation rather than being overwritten.
- [x] A sanitized evidence bundle records the recovery-snapshot receipt, ref manifests, tracker export identity, project visibility and protection, pipeline and merge-request references, test results, human approvals, clone proof, UTC times, and accepted server-only GitHub uncertainty.
- [x] Chronicle is explicitly marked as having crossed its development-resume gate, while deployment, Site Release, Data Release, production recovery, production secrets, and schedules remain disabled.

## Development-resume

Chronicle crossed its development-resume gate on 2026-08-18 after maintainer acceptance of the sanitized resume evidence, protected-main merge of !1, post-merge clone proof, and remote promotion.

- origin is https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy.git
- GitHub remains github-suspended at https://github.com/XYBuilds/chronicle_v3_3d_galaxy.git and was not overwritten
- Deployment, Site Release, Data Release, Production Recovery, production secrets, and schedules remain disabled



## Original notes



### @yixie.ixd — 2026-08-18T09:54:27.598Z (note 3698900200; system)



mentioned in merge request !1



### @yixie.ixd — 2026-08-18T10:11:26.277Z (note 3698983413)



### 2026-08-18

Bootstrap merge request !1 is ready for maintainer review. Pipeline #5 succeeded for both `frontend_verify` and `docs_verify` on `91c49f995c5f67d1bacd937458c0dace298f66c5`.

https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/merge_requests/1
https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/pipelines/2768726684

A pre-merge empty-directory clone of the candidate reproduced `main` `2878cd94c321581a229f8b14d968a43e048dbbab` and the four approved tags, contained no research branches, and passed `git fsck --full --strict`.

Please merge !1 through protected `main` without bypass. This Issue stays open. Do not promote remotes until after a post-merge clone proof and explicit acceptance.



### @yixie.ixd — 2026-08-18T10:38:21.980Z (note 3699094680)



### 2026-08-18

Maintainer authorized `glab mr merge` for !1. Merged through protected `main` without bypass.

- MR: https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/merge_requests/1
- merge commit: `524d1276220fb9ae914b0c00cb19a40370084d9c`
- reviewed SHA: `91c49f995c5f67d1bacd937458c0dace298f66c5`
- pipeline #5 success: https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/pipelines/2768726684

Post-merge empty-directory clone reproduced `main` and the four approved tags, contained no unexpected local heads or research branches, and passed `git fsck --full --strict`. Sanitized resume evidence is at `C:\Users\pexy9\recovery\chronicle-p0-restore\resume-evidence.json` with `development_resume=true`.

This Issue remains open. Remotes are not promoted: `origin` is still GitHub, GitLab remains `gitlab-candidate`. Deployment, Site Release, Data Release, production secrets, and schedules stay disabled. Waiting for explicit remote-promotion acceptance and Issue-closure approval.



### @yixie.ixd — 2026-08-18T10:42:45.694Z (note 3699110455; system)



marked the checklist item **Chronicle is created as a private project in the admitted GitLab namespace and remains a non\-authoritative candidate until every development\-resume criterion passes\.** as completed



### @yixie.ixd — 2026-08-18T10:42:45.761Z (note 3699110461; system)



marked the checklist item **Reachable history intended for promotion is reviewed for secret evidence, and only approved main, formal tags, and Issue\-owned active branches are pushed through explicit ref selections\.** as completed



### @yixie.ixd — 2026-08-18T10:42:45.804Z (note 3699110469; system)



marked the checklist item **main is the declared default branch; direct push and force push are disabled; the effective protection settings are read back through the provider API\.** as completed



### @yixie.ixd — 2026-08-18T10:42:45.845Z (note 3699110473; system)



marked the checklist item **The closed Wayfinder decisions, accepted Spec, six delivery Issues, comments/resolution context, portable identities, parent references, and blocker edges survive a normalized export, import, relationship check, and complete local render\.** as completed



### @yixie.ixd — 2026-08-18T10:42:45.885Z (note 3699110478; system)



marked the checklist item **The local tracker is frozen before GitLab becomes writable, leaving exactly one active tracker; provider Issue numbers remain aliases rather than portable identities\.** as completed



### @yixie.ixd — 2026-08-18T10:42:45.919Z (note 3699110481; system)



marked the checklist item **One Issue\-owned bootstrap merge request installs current domain and tracker guidance plus a thin, non\-deploying GitLab CI adapter without introducing production deployment copies or schedules\.** as completed



### @yixie.ixd — 2026-08-18T10:42:45.951Z (note 3699110483; system)



marked the checklist item **The bootstrap change passes Chronicle's scope\-matching frontend tests, lint, build, current documentation\-authority checks, non\-deploying GitLab pipeline, and diff validation\.** as completed



### @yixie.ixd — 2026-08-18T10:42:45.983Z (note 3699110485; system)



marked the checklist item **The maintainer approves and merges through the protected branch without bypass, and the Issue remains open until the development\-resume evidence is reviewed and human closure is explicitly approved\.** as completed



### @yixie.ixd — 2026-08-18T10:42:46.024Z (note 3699110491; system)



marked the checklist item **A new empty\-directory clone reproduces the approved main and tag object identities, contains zero unexpected or missing promoted refs, and passes full Git integrity checks\.** as completed



### @yixie.ixd — 2026-08-18T10:42:46.064Z (note 3699110493; system)



marked the checklist item **The recovered remote is promoted only after acceptance; the suspended GitHub URL remains a named alias for later capture and reconciliation rather than being overwritten\.** as completed



### @yixie.ixd — 2026-08-18T10:42:46.107Z (note 3699110497; system)



marked the checklist item **A sanitized evidence bundle records the recovery\-snapshot receipt, ref manifests, tracker export identity, project visibility and protection, pipeline and merge\-request references, test results, human approvals, clone proof, UTC times, and accepted server\-only GitHub uncertainty\.** as completed



### @yixie.ixd — 2026-08-18T10:42:46.147Z (note 3699110500; system)



marked the checklist item **Chronicle is explicitly marked as having crossed its development\-resume gate, while deployment, Site Release, Data Release, production recovery, production secrets, and schedules remain disabled\.** as completed



### @yixie.ixd — 2026-08-18T10:43:19.222Z (note 3699112658)



### 2026-08-18

Maintainer accepted the resume evidence and approved remote promotion plus Issue closure.

Chronicle has crossed its development-resume gate.

- `origin` is now GitLab `https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy.git`
- GitHub remains `github-suspended` at the original URL and was not overwritten
- local `main` is `524d1276220fb9ae914b0c00cb19a40370084d9c` tracking `origin/main`
- Deployment, Site Release, Data Release, Production Recovery, production secrets, and schedules remain disabled

Closing this Issue by explicit maintainer approval. Parent Recovery Initiative stays open. OG Worker Issue 03 and Daily Issue 04 may proceed in parallel next.
