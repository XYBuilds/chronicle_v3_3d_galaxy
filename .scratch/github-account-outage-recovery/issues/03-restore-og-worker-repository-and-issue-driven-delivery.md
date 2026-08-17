# 03 — Restore OG Worker repository and Issue-driven delivery

**Portable ID:** `tmc:og-worker:01M09Y4T025272CZDXKZAZH0S5`

**Parent:** [Restore development and operations without a GitHub account single point of failure](../spec.md) (`tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`)

**What to build:** Restore the OG Worker as an independently owned private GitLab repository with one active tracker, protected delivery, and a passing non-deploying merge-request cycle. The slice must also bring the Worker's operational guidance back into conformance with the current Chronicle-owned OG contract without deploying or changing the live Worker.

**Blocked by:** [02 — Restore Chronicle repository and Issue-driven delivery](./02-restore-chronicle-repository-and-issue-driven-delivery.md)

**Status:** ready-for-agent

- [ ] A human-approved risk declaration identifies the P0 tier and canonical protected surfaces for the actual Worker restoration scope.
- [ ] The Worker is created as a private candidate project and receives only secret-reviewed, human-approved ordinary branches and formal tags through explicit ref selections.
- [ ] `main` is the protected default branch, direct and force pushes are disabled, and effective protection is verified through provider output.
- [ ] The repository's delivery Issue carries its own portable identity and a titled portable parent reference to the Chronicle Recovery Initiative.
- [ ] A normalized tracker export/import preserves the Issue body, labels, relationships, comments, and state, and exactly one Worker tracker becomes writable.
- [ ] One Issue-owned bootstrap merge request installs minimal current agent/tracker guidance and a thin, non-deploying GitLab CI path.
- [ ] The Worker's authoritative operational guidance states that ignored environment values are replaceable Bitwarden deployment copies rather than the secrets authority.
- [ ] The Worker's rollback guidance follows the current C-002 contract and never restores retired Today routes, keys, or behavior.
- [ ] The bootstrap change passes the Worker's existing unit tests and type checks in the non-deploying pipeline; the secret-bearing deployment dry run is explicitly not required for this P0 gate.
- [ ] The maintainer approves and merges through protected `main` without bypass, with separate explicit approval required before Issue closure.
- [ ] A fresh clone reproduces the approved `main` and formal tags with no unexpected or missing promoted refs and passes full Git integrity checks.
- [ ] The candidate remote is promoted only after the gate passes; production credentials, deployment, and Worker runtime changes remain outside this slice.
- [ ] A sanitized evidence bundle records source/remote refs, tracker identity, protection settings, pipeline/tests, merge approval, clone/integrity proof, UTC times, and residual uncertainty without containing secret values.

