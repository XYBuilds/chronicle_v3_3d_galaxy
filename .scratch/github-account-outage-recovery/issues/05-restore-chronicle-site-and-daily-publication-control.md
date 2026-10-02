# 05 — Restore Chronicle Site and Daily publication control

**Portable ID:** `tmc:chronicle:01M09Y4T044FR6X31Q618TC2K9`

**Parent:** [Restore development and operations without a GitHub account single point of failure](../spec.md) (`tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`)

**What to build:** Restore Chronicle's Site Release and Daily Data Release as the sole normal GitLab-hosted publication paths while preserving the current Cloudflare, Supabase, R2, OG, manifest, Planet Export, smoke, rollback, and last-known-good contracts. Every attempt must have forge-independent identity and evidence, production work must be serialized and restricted to protected `main`, and Windows must be a tested but human-started emergency path rather than a second scheduler.

**Blocked by:** [03 — Restore OG Worker repository and Issue-driven delivery](./03-restore-og-worker-repository-and-issue-driven-delivery.md) and [04 — Restore Daily Stargazing repository and Issue-driven delivery](./04-restore-daily-stargazing-repository-and-issue-driven-delivery.md)

**Status:** ready-for-agent

- [ ] The delivery uses the accepted R3 declaration with exactly the canonical protected surfaces `publication`, `planet_export`, `og_worker`, and `daily`; concrete production resources and secrets are recorded only in declaration notes.
- [ ] One complete Site Release job and one complete Daily Data Release job call shared provider-neutral Chronicle entry points and use the same non-interruptible `galaxy-r2-pages-release` resource group in verified oldest-first mode.
- [ ] Production jobs and deployment copies are available only from protected `main`; merge-request, fork, and ordinary branch pipelines cannot enter production paths.
- [ ] Site and Daily preserve their accepted ordering, Direct Upload, Supabase preflight, OG projection, immutable R2, Site Artifact, manifest composition, smoke, rollback-attempt, and last-known-good behavior without adding a global transaction or distributed lock.
- [ ] Scheduled backlog handling performs at most one current catch-up Light Refresh and causes already-covered older schedule intents to exit before production mutation.
- [ ] A Chronicle-owned durable counter is bootstrapped strictly above every verified accepted production suffix, fails closed on missing/corrupt/behind state, and supplies the sequence for every Site or Data attempt.
- [ ] Data Release identities and Monthly threshold labels use the Chronicle sequence where applicable, while `meta:G`, manifest, Planet Export, and Daily consumers retain opaque-string compatibility.
- [ ] Every attempt, replay, and rollback attempt writes a durable sanitized publication receipt covering inputs, identities, hashes, provenance, mutations, deployment, smoke, final result, and UTC timestamps.
- [ ] Failed Site or Daily work is recovered only by whole-entry publication replay under a new sequence; a replay cannot publish behind a newer success, and unsupported stage-level candidate continuation is not exposed.
- [ ] Bitwarden remains the secrets authority, GitLab receives only least-privilege protected deployment copies, and CI receives no Bitwarden session or vault-wide credential.
- [ ] Scope-matching frontend checks, release-script pytest suites, workflow/provider contract tests, GitLab configuration validation, documentation-authority checks, and diff validation pass.
- [ ] Windows proves the same entry-point fixtures, read-only production inventory, and a Pages Preview incapable of changing the production branch or active Site Artifact registry; it is not configured as a scheduler.
- [ ] Before live cutover, read-only inventory proves the expected Pages project, manifest, active and rollback Site Artifacts, OG checkpoint, active profile, publication hold, R2 access, Supabase readiness, and accepted sequence bootstrap; any missing, corrupt, mismatched, or ambiguous prerequisite stops the cutover.
- [ ] With production triggers initially disabled, one manual Site Release and one manual Daily Data Release from protected `main` pass their existing smoke before any schedule is enabled.
- [ ] Representative job minutes are measured; Daily remains at 18:00 UTC only when the free namespace budget fits, otherwise Sunday 18:00 UTC weekly is used, and an unviable weekly plan reopens the hosted-CI decision.
- [ ] The first cutover completes one R3 integration acceptance through the existing owner-check seam, including Planet Export-to-Daily compatibility and relevant OG Worker evidence, without permanently expanding every ordinary publication smoke.
- [ ] Human approval is recorded for merge and production enablement, and GitLab remains the sole scheduler until a separately approved GitHub cutback transfers authority.
- [ ] A sanitized evidence bundle records configuration, tests, inventory, sequences/receipts, manual runs, smoke, consumer handoffs, budget, approvals, and stop/rollback outcomes without containing live secret values.

