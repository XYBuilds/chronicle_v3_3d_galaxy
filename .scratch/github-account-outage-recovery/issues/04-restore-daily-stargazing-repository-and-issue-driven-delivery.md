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

