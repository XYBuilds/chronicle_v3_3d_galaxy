---
portable_id: tmc:chronicle:01M0WFG000000000000000000B
id: WFG-010
parent: ../map.md
type: wayfinder:grilling
status: closed
assignee: /root
blocked_by:
  - ./design-p1-publication-control-plane.md
---

# Design the P2 Monthly and Production Recovery path

## Question

How should Monthly Data Release and Production Recovery operate independently of GitHub while preserving the current profile activation rules, embedding-bundle availability, publication holds, audited dangerous overrides, recovery-plan evidence, shared release lock, Cloudflare/Supabase boundaries, and repository-owned rollback? Decide which entry points are hosted CI, which are local emergency commands, and how their equivalence is verified.

## Resolution comments

### 2026-08-18 — Resolved

P2 remains Chronicle-owned and deliberately favors a small, faithful migration over a new recovery platform. During GitLab's temporary-primary period, Chronicle migrates the Monthly Data Release implementation but intentionally does not run it. Production Recovery moves off GitHub as a local, evidence-backed manual procedure; it does not become a new unified live executor. Daily Stargazing publication and the OG Worker runtime remain independent repository responsibilities and receive no empty implementation work.

#### Scope and operating state

- P2 covers Chronicle's Monthly Data Release and Production Recovery. Daily Stargazing publication is not Chronicle's Daily Data Release and was not GitHub-dependent; Daily remains a consumer in cross-repository acceptance only.
- The Monthly Data Release is migrated as one intact production entry point. Do not split it into candidate-preparation and production-commit jobs.
- While GitLab is the temporary development and publication primary, Monthly has no active schedule and no permitted manual production run. This is an intentional **Monthly Data Release suspension**, not a successful production restoration claim.
- Daily Data Release continues against the last active membership, spatial arrangement, threshold state, and `rating-midrank-cdf-lut-v1` profile. Newly eligible movies may remain pending until a later Galaxy Refit.
- Monthly may be re-enabled only after GitHub returns, publication authority has completed the separately approved GitLab-to-GitHub cutback, and a human Go confirms the then-current runtime, compute budget, bundle, secrets, production inventory, and rollback targets. The cutback and Monthly re-enable are separate follow-on Wayfinder efforts; neither is implicit implementation work in this map. There is no GitLab-period emergency exception that silently turns Monthly back on.

#### Dormant Monthly migration and proof

- Move the provider-specific GitHub substitutions (`run_number`, `run_id`, actor, ref, cache/artifact actions, Wrangler action, secrets syntax) behind the Chronicle-owned provider-neutral publication identity and receipt boundary already decided by [Design the P1 Chronicle publication control plane](./design-p1-publication-control-plane.md).
- Keep one complete Monthly production job and one cross-platform Chronicle entry point. The disabled GitLab adapter and a future GitHub adapter call that same entry point; normal workflow inputs still exclude profile bootstrap/force, dimension bypass, OG full recovery, and recovery-only behavior.
- A disabled job is not accepted merely because its YAML parses. Migration evidence must include GitLab CI configuration validation, provider-contract tests, and a complete non-production fixture rehearsal of the same entry point with fake/local Supabase, R2, KV, Pages, and smoke adapters. This fixture may be exercised in ordinary test jobs without splitting the production Monthly entry point.
- The fixture proves command ordering, bundle validation, profile rules, output identities/hashes, failure behavior, and hosted/Windows argument equivalence. It does not run a full production UMAP refit, write Supabase, mutate Cloudflare, or claim a live Monthly success.
- GitLab.com's three-hour hosted-job limit and namespace compute budget are re-evaluated only at a later enablement gate. Migration while suspended is not evidence that a real Monthly run fits those limits.

#### Canonical embedding bundle availability

- Preserve the current four-file canonical embedding bundle (`cleaned.csv`, `text_embeddings.npy`, `genre_vectors.npy`, and `language_vectors.npy`) in the verified MacBook recovery snapshot and as one immutable private R2 object. Record the complete bundle SHA-256 in repository-owned recovery evidence so either copy can be checked without GitHub.
- Validate the restored bundle with the existing deterministic packer rules before it is admitted: required filenames, aligned row counts, expected shapes, finite values, and vector normalization. A GitLab cache may accelerate a rehearsal but is never a source of authority or the only copy.
- Do not introduce an active-bundle pointer, registry, or lifecycle service while Monthly is suspended. Replacing the canonical bundle is a future explicit migration with a new immutable object and recorded hash, not a cache overwrite.

#### Profile activation rules

- Preserve the current monthly profile contract unchanged: upload the immutable candidate before any pointer change; ordinary same-period reruns retain the existing active profile; ordinary activation moves the period only forward; candidate source data must match its Data Release.
- Daily never generates or activates a profile and continues to validate and reuse the current active immutable profile during the Monthly suspension.
- Missing-profile bootstrap, same-period force activation, and profile rollback remain recovery-only actions. Bootstrap/force require their existing explicit reason and actor fields; profile rollback creates a new Data Release that selects the retained profile rather than flipping the live pointer in place.

#### Production Recovery model

- Preserve the useful shape of the GitHub-era recovery model instead of promoting it into a new orchestration service. Move the current audited dry-run planner to a provider-neutral local command that reads production state and emits the exact target, from/to identities, reason, actor, UTC time, expected mutations, rollback boundary, and required smoke.
- Publication hold/resume remains the only mutation performed directly by the recovery control primitive. It writes the existing R2 hold document consumed by Daily/Monthly.
- Data/Site/profile rollback, OG bootstrap/full recovery, and dangerous dimension/profile overrides continue to use their repository-owned CLI primitives after an operator has generated and reviewed the corresponding recovery plan. Direct Cloudflare operations remain a documented last-resort fallback; they do not become a second normal control plane.
- Do not build a unified `recovery apply` executor, plan-hash handshake, duplicate typed confirmation, second-person approval flow, action-matrix service, or `record-manual` command.
- Dangerous actions remain absent from normal Monthly/Daily/Site inputs. Their recovery plan requires non-empty target/from/to/reason/actor fields and the existing explicit danger flag. Immediately before mutation, the operator reruns the relevant read-only inventory and stops if the observed starting identity no longer matches the plan.
- Remove `continue_candidate` from the supported recovery surface and remove documentation/tests that imply it is wired. The per-candidate JSON stage model was never persisted by the real publication workflows. Site/Daily recovery uses a new whole-entry **publication replay** under the P1 semantics; Monthly has no continuation while suspended.

#### Shared release lane and takeover

- Hosted Site and Daily publication retain the P1 `galaxy-r2-pages-release` GitLab resource group. Do not add a distributed lock or claim that a Windows process owns the GitLab resource group.
- Before any local recovery mutation, pause the relevant GitLab schedules/triggers and prove that no Site/Daily publication job is running or queued. Apply the Daily/Monthly publication hold where relevant. If hosted inactivity cannot be proven, stop; local recovery does not steal ambiguous publication authority.
- Restore hosted authority only after the local operation, evidence capture, required smoke, and an explicit resume decision complete. Monthly remains disabled regardless of recovery completion.

#### Rollback and repository boundaries

- Data rollback selects a retained successful Data Release, composes it with the active verified Site Artifact, and rebuilds the OG projection only when the selected projection differs. It does not reverse Supabase.
- Site rollback composes the previous verified Site Artifact with the current compatible Data Release. It does not reverse Supabase or OG state.
- Profile rollback creates a new Data Release and publication identity; it never edits history or flips an old pointer in place.
- OG bootstrap/full recovery remains Chronicle producer work: stop or repair the producer before any Worker rollback, preserve diagnostic KV state, write and verify movie changes/deletions before `meta:G`, and persist the v2 checkpoint only after the ordered marker is verified. Worker deployment/runtime rollback stays in the Worker repository.
- Do not restore retired Today routes or keys. The Worker README statement about restoring two Today-specific routes conflicts with the current contract and current `/og/*` plus `/movie/*` Wrangler routes; recovery follows the current C-002 contract, not that historical sentence. The already-required Worker P0 Issue owns correction of this repository-local contract-conformance defect, so P2 does not need an otherwise empty Worker Issue.
- Completed Supabase, KV, immutable R2/profile, or checkpoint mutations are retained for diagnosis rather than destructively reversed. There is still no cross-system transaction or global generation barrier.
- Any recovery that creates a consumer-visible Site or Data publication receives a new monotonically increasing P1 publication sequence and publication receipt. The recovery evidence links that receipt; it does not reuse or rewrite the failed publication identity.

#### Evidence and verification

- Store one dated, immutable private-R2 recovery evidence bundle per real operation. It contains the planner JSON, before/after inventories, exact repository command and resolved source commit, actor and reason, relevant Data/Site/profile/OG identities, sanitized command output, attempted mutations, resulting publication receipt identities, smoke results, final disposition, and UTC timestamps. CI logs and caches are diagnostic copies, not evidence authority. No secret values enter the bundle.
- Hosted/local equivalence is intentionally narrow: GitLab and Windows run the same Monthly fixture entry point and the same Recovery dry-run planner fixtures. There is no hosted live-recovery path, so the specification makes no false claim of hosted/local live-mutation equivalence.
- Recovery tests cover fail-closed audit fields, publication hold corruption/held behavior, removal of candidate continuation, retained Data/Site/profile rollback plans, OG ordering, dangerous-input exclusion from normal releases, receipt linkage, and failure/smoke evidence. The operator's fresh-inventory comparison remains an explicit manual gate rather than a disguised live executor.
- The implementation is one Chronicle P2 Issue, one Issue-owned branch, and one reviewed PR. The maintainer has classified this handoff as R3. Its machine-readable protected surfaces are exactly `publication`, `planet_export`, `og_worker`, and `daily`; production secrets, Supabase, KV/checkpoint, R2 bundle/profile/data/site/receipt state, and Cloudflare Pages are recorded in the declaration notes. Do not create empty Daily or Worker implementation Issues.
- Verification includes the focused `scripts/tests/` suites, GitLab configuration validation, cross-platform fixture/contract tests, documentation-authority tests, `git diff --check`, applicable acceptance-harness owner checks, and the Issue-named checks. One complete post-merge R3 integration acceptance covers Planet Export-to-Daily compatibility and the relevant OG Worker surface without running Monthly or manufacturing a production recovery mutation. Human merge, bundle-copy execution, production recovery, publication resume, GitHub cutback, Monthly enablement, and Issue closure approvals remain mandatory.

Any missing/corrupt canonical bundle, hash mismatch, active profile mismatch, sequence uncertainty, unreadable hold, unverified GitLab inactivity, stale recovery starting identity, unavailable retained artifact, unexpected Supabase/KV/R2 prerequisite, failed smoke, evidence-write failure, or attempt to enable Monthly during the GitLab-primary period stops the operation and preserves the last-known-good consumer-visible state.
