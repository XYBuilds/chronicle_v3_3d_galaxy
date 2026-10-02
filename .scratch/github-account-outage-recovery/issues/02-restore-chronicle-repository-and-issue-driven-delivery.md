# 02 — Restore Chronicle repository and Issue-driven delivery

**Portable ID:** `tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC`

**Parent:** [Restore development and operations without a GitHub account single point of failure](../spec.md) (`tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`)

**What to build:** Restore Chronicle as the first authoritative private GitLab repository and prove that its normal Issue-owned branch, automated-check, reviewed merge-request, and fresh-clone workflow works without GitHub. This slice must also migrate the recovery specification and tracker context into one writable Issue authority while keeping all deployment and publication capabilities disabled.

**Blocked by:** [01 — P0 Common Protection and GitLab Admission](./01-p0-common-protection-and-gitlab-admission.md)

**Status:** ready-for-agent
**Assignee:** PEXY98
**Tracker:** frozen local Markdown; GitLab is the destination writable tracker after import.

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
- [ ] One Issue-owned bootstrap merge request installs current domain and tracker guidance plus a thin, non-deploying GitLab CI adapter without introducing production deployment copies or schedules.
- [ ] The bootstrap change passes Chronicle's scope-matching frontend tests, lint, build, current documentation-authority checks, non-deploying GitLab pipeline, and diff validation.
- [ ] The maintainer approves and merges through the protected branch without bypass, and the Issue remains open until the development-resume evidence is reviewed and human closure is explicitly approved.
- [ ] A new empty-directory clone reproduces the approved `main` and tag object identities, contains zero unexpected or missing promoted refs, and passes full Git integrity checks.
- [ ] The recovered remote is promoted only after acceptance; the suspended GitHub URL remains a named alias for later capture and reconciliation rather than being overwritten.
- [ ] A sanitized evidence bundle records the recovery-snapshot receipt, ref manifests, tracker export identity, project visibility and protection, pipeline and merge-request references, test results, human approvals, clone proof, UTC times, and accepted server-only GitHub uncertainty.
- [ ] Chronicle is explicitly marked as having crossed its development-resume gate, while deployment, Site Release, Data Release, production recovery, production secrets, and schedules remain disabled.

