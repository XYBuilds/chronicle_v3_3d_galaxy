# 01 — P0 Common Protection and GitLab Admission

**Portable ID:** `tmc:chronicle:01M09Y4T00V0P1XJFNPFGE2QDV`

**Parent:** [Restore development and operations without a GitHub account single point of failure](../spec.md) (`tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`)

**What to build:** Give the maintainer one proven recovery baseline before anything moves: a recoverable secrets authority, a complete encrypted MacBook snapshot of all three repositories and their non-Git operational state, and a disposable-data proof that GitLab can serve as the temporary development control plane. The completed slice must make it safe to begin real repository restoration without having pushed source, copied production secrets into CI, or changed production.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent
**Assignee:** PEXY98

- [ ] The maintainer records the Issue's R0–R3 tier and canonical protected surfaces after reviewing the exact execution scope; no automated path classifier supplies the declaration.
- [ ] Bitwarden Free is configured as the secrets authority, and a synthetic password-protected export/import drill proves record equality without using live credentials.
- [ ] The independent vault recovery material and restic recovery credentials are prepared without placing live values in agent context, chat, logs, screenshots, repository content, command arguments, or persistent plaintext files.
- [ ] MacBook capacity, pinned restic binaries and checksums, Mac SSH host identity, fixed source roots, and the fixed exclusion policy are verified before repository writers are frozen.
- [ ] One encrypted acquisition preserves the complete Chronicle, OG Worker, and Daily Stargazing worktrees and physical Git stores, including Daily's external Git store, ignored operational data, and unclassified recovery objects.
- [ ] Any unreadable source, missing root, source mutation, unresolved external Git store, capacity error, incomplete backup, or changed manifest rejects the joint snapshot rather than accepting a partial result.
- [ ] The restic repository passes a full-data integrity check, then the complete snapshot is restored into a new MacBook location and compared with zero missing, extra, type-changed, link-changed, size-changed, or content-changed entries.
- [ ] All restored Git stores pass full strict integrity checks and reproduce the recorded refs, stash, reflog-only, and unreachable-object evidence; Daily is explicitly paired with its restored external Git store for verification.
- [ ] A sanitized acceptance receipt records aggregate identities, versions, counts, evidence hashes, and pass/fail results without exposing secret values, sensitive paths, per-file hashes, or object inventories; Mac Remote Login is disabled after acceptance.
- [ ] Only after snapshot acceptance, the maintainer completes the live Bitwarden migration locally and creates the required password-protected MacBook export and sealed offline recovery record; agents verify completeness by names and consumers only.
- [ ] A disposable private GitLab project proves Windows and Mac web/Git/API connectivity, clone/commit/push/fetch, one representative non-deploying Node/Python pipeline, a dummy protected value, a downloadable artifact, and portable parent/blocker Issue export and local rendering.
- [ ] GitLab elapsed and billed compute usage is recorded, every tested project remains private, and no real repository, live production credential, deployment job, schedule, or production mutation crosses the admission gate.
- [ ] The sanitized evidence bundle identifies every passed gate and residual uncertainty, and explicit human approval admits GitLab for the next ticket.

