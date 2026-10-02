---
portable_id: tmc:chronicle:01M0WFG000000000000000000A
id: WFG-009
parent: ../map.md
type: wayfinder:grilling
status: closed
assignee: /root
blocked_by:
  - ./choose-independent-control-plane.md
  - ./choose-secrets-authority.md
  - ./define-p0-restoration.md
---

# Design the P1 Chronicle publication control plane

## Question

How should Chronicle's Site Release and Daily Data Release move from GitHub Actions to the selected hosted CI while preserving the `galaxy-r2-pages-release` mutual exclusion, immutable artifacts, cache/bundle inputs, monotonic publication provenance, Cloudflare Pages Direct Upload, R2/OG ordering, Supabase preflight, smoke checks, resumability, and last-known-good behavior? Define a tested local emergency path without making the Windows workstation the normal scheduler.

## Resolution comments

### 2026-08-18 — Resolved

Restore P1 publication through GitLab.com Free while preserving Chronicle's current release semantics rather than redesigning production. GitLab becomes the sole normal publication scheduler while it is the temporary development control plane. Chronicle owns the Site Release and the Data Release entry points; the OG Worker and Daily Stargazing remain independent consumers/deployment units and require no P1 code change.

P1 is deliberately a controlled migration, not a literal YAML translation. It removes the `GITHUB_RUN_NUMBER` / `GITHUB_RUN_ID` identity dependency, adds durable provider-neutral provenance, makes the existing local fallback testable, and closes the arbitrary-ref production-dispatch hole. It does not introduce a distributed lock, stage-level candidate continuation, full dependency pinning, deeper production smoke, or cross-system rollback.

#### Hosted entry points and mutual exclusion

- Keep one complete GitLab job for **Site Release** and one complete GitLab job for **Daily Data Release**. Do not split either mutation path across separately locked jobs and do not add a child-pipeline locking topology.
- Both jobs use the same project-local GitLab `resource_group`, named `galaxy-r2-pages-release`, with running publication jobs non-interruptible. Set and API-read-back the group process mode as `oldest_first` before production enablement.
- Site Release runs after an accepted merge reaches protected `main` and may be manually replayed only from protected `main`. Daily Data Release runs from its schedule and may be manually replayed only from protected `main`. Merge-request, fork, and ordinary branch pipelines cannot obtain production deployment copies or enter either production job.
- Preserve the existing single-job order and last-known-good behavior. Site Release fetches the live Data Release manifest, builds and identifies the shell artifact, composes and Direct Uploads Pages, runs the existing production smoke, attempts the existing previous-artifact redeploy on failure, and marks the site artifact active only after success. Daily checks the publication hold, runs the Supabase read-only preflight, performs Light Refresh, synchronizes the OG projection, publishes immutable R2 galaxy assets, composes the active site artifact with the candidate manifest, Direct Uploads Pages, runs the existing smoke, and attempts the existing previous-manifest redeploy on failure.
- Preserve the OG producer ordering and contract: movie changes, deletions and read-back verification precede `meta:G`; the verified `meta:G` precedes the v2 checkpoint; OG synchronization completes before the consumer-visible R2/Pages promotion. `meta:G` remains an ordered completion marker rather than an atomic generation barrier.
- GitLab cache is an optional speed-up and GitLab artifacts are short-lived job transport/diagnostic evidence. Neither is an input authority, last-known-good store, nor durable publication artifact. The existing content-addressed/versioned R2 galaxy objects and site artifacts remain the durable product artifacts.
- Keep the current npm/Python dependency-resolution policy for P1. Do not add a custom runner image, full Python lock, or an `npm ci` conversion merely for the outage recovery. Record the resolved tool/dependency versions and output hashes in publication evidence. Replace the GitHub-only Wrangler action with one cross-platform Wrangler CLI version used by both hosted and local entry points.

GitLab's queued-job behavior is not identical to GitHub Actions concurrency. A backlog of scheduled Daily pipelines must still produce only one catch-up Light Refresh using the newest available source data. After that successful catch-up, older scheduled intents already covered by its completion exit before production mutation. Do not replay each missed calendar day. Monthly and first-of-month behavior remains P2-owned.

#### Repository-owned orchestration

Move only the provider-neutral ordering into two thin Chronicle-owned, cross-platform entry points—one Site Release command and one Daily Data Release command—implemented as Python orchestration over the existing release primitives. GitLab and the Windows emergency path call the same entry points; a future GitHub adapter can call them too. The entry points pass argument arrays rather than copying POSIX shell fragments into a second Windows implementation.

Cloudflare Pages remains a Direct Upload project. The Site and Daily entry points deploy the fully composed `dist`, including the current Functions payload where applicable, through Wrangler. GitLab Environments may index deployments but are not treated as the rollback authority, and the design does not claim paid protected-environment or deployment-approval features on GitLab Free.

#### Provider-neutral provenance

Replace forge-owned run numbers with a Chronicle-owned **publication sequence** and durable **publication receipt** state in the existing operational R2 boundary. Before cutover, inventory every accepted production identity that may contain the prior workflow-local suffix; bootstrap the new global counter strictly above the greatest verified suffix rather than relying only on the currently observed `2026.08.02.daily.131`. Fail closed if the durable head is missing, corrupt, or behind the accepted bootstrap evidence.

For a Daily or Monthly Data Release, the allocated publication sequence replaces `GITHUB_RUN_NUMBER` as the decimal suffix in the existing `YYYY.MM.DD.<daily|monthly>.<sequence>` Data Release identity. Monthly also uses the same sequence in its threshold-version label. A Site Release receives a sequence and receipt but preserves the selected Data Release identity. The OG producer may continue to publish the Data Release identity as opaque `meta:G`; the Worker must not parse the new sequence, and manifest, Planet Export, and Daily consumers retain their existing opaque-string compatibility boundary.

Each Site or Data publication attempt, including a replay, receives a new monotonically increasing sequence while holding the publication resource group or after an accepted local takeover. Its receipt records at least:

- entry point and sequence;
- trigger type, requested time, source commit, provider/pipeline/job identifiers where present, actor, and local takeover reason where applicable;
- relevant input identities and hashes, resolved tool/dependency versions, Data Release identity, Site Artifact identity, OG checkpoint/generation evidence, and immutable R2 object identities;
- attempted stages and external mutations, Pages deployment reference, smoke outcome, rollback attempt, final result, and UTC timestamps.

Receipts are durable evidence, not an execution checkpoint. A failed Site or Daily publication is recovered by a **publication replay** of the whole entry point under a new sequence. P1 does not resume the old candidate at an internal stage, even though existing durable/idempotent mutations may make the replay cheap. Before mutable promotion, the entry point rejects an attempt that could publish behind a newer successful sequence. Existing candidate-continuation primitives remain P2 recovery inputs and must not be represented as wired P1 resumability.

#### Last-known-good and smoke boundary

Preserve the current non-transactional rollback boundary. A Daily downstream failure may redeploy the previous live Pages manifest, and a Site failure may redeploy the previous verified site artifact with the selected Data Release. Completed Supabase, OG KV, checkpoint, profile, or immutable R2 mutations are retained rather than force-reversed. The current production smoke remains the ordinary release check: supported page responses, retired Today equivalence, expected Data Release version, and referenced galaxy/search/profile reachability. P1 does not add OG Worker, Planet Export-to-Daily, cache-header, full-schema, exact Site Artifact sidecar, or post-rollback smoke checks to every release.

#### Secrets and production authorization

Bitwarden remains the secrets authority. GitLab and the ignored local environment receive only replaceable, workload-scoped deployment copies. Create independent least-privilege Cloudflare account-owned tokens for the GitLab workloads where Cloudflare supports that boundary; do not give CI a Bitwarden session or introduce an OIDC broker. Create GitLab values as protected, masked, and hidden where supported, scope them to the production jobs, and expose them only on protected `main`. Preserve the existing separate Cloudflare Pages, OG KV, R2, Supabase, and Kaggle responsibility boundaries rather than consolidating them into a master credential.

Normal manual replays rely on the authenticated GitLab actor recorded by the platform and do not require a second approval form or reason field. The Windows emergency path records the operator and takeover reason in its publication receipt. GitLab Free's lack of protected environments is accepted; protected `main`, reviewed CI configuration, protected deployment copies, and the one-maintainer project permission boundary are the production authorization controls.

#### Tested Windows emergency path

Windows supports both entry points but never becomes a scheduler. Do not configure Task Scheduler or an alternate daily cadence. Before a local production attempt:

1. if GitLab is accessible, pause the relevant schedule/trigger and prove that no publication job is running or queued;
2. if the maintainer account is blocked, verify the GitLab schedule is inactive and that no publication job remains active;
3. if hosted inactivity cannot be confirmed, stop—do not attempt local publication;
4. run the shared repository entry point from an ignored, scope-limited local deployment environment; and
5. restore hosted authority only after the local attempt and evidence are complete.

P1 tests this fallback without manufacturing a production mutation solely for a drill: Windows runs production read-only preflight, complete fixture/dry-run paths for Site and Data orchestration, and a Cloudflare Pages Preview Direct Upload that cannot update the production branch or active site registry. The hosted production runs prove the shared mutation path. Preview/dry-run success is not permission to run local production without the takeover checks.

#### Admission, cutover, cadence, and cost

P1 starts only after the common P0 gates and the Chronicle, OG Worker, and Daily Stargazing development-resume gates all pass. Before any production secret or job is enabled, read-only inventory must verify the Pages Direct Upload project, current public manifest, a readable active Site Artifact and a verified rollback target in the Site Artifact registry, OG v2 checkpoint, active emission-profile pointer and immutable profile, publication hold, R2 access, Supabase preflight, and the accepted live sequence bootstrap.

A normal P1 Site Release may not establish a missing Site Artifact registry through its first production mutation. A missing or corrupt active artifact or rollback target is a hard stop that requires a separately decided bootstrap or Cloudflare previous-deployment recovery path. A missing/corrupt OG checkpoint, missing active profile, active hold that cannot be safely cleared, sequence uncertainty, or other recovery-only prerequisite is likewise a hard stop; expose the minimum required recovery decision rather than smuggling bootstrap/full-recovery switches into a normal P1 entry point.

Cut over in this order, with production triggers and schedules disabled initially:

1. merge the reviewed P1 implementation with deploy jobs disabled;
2. install scoped GitLab deployment copies and verify protected-main rules without disclosing values;
3. run the read-only production-state inventory and provider/resource-group checks;
4. manually run one GitLab Site Release from protected `main` and require the existing smoke to pass;
5. manually run one GitLab Daily Data Release from protected `main` and require the existing smoke to pass;
6. complete the Windows dry-run/read-only/Pages Preview evidence; and
7. enable the protected-main Site trigger and the measured Data Release schedule.

Measure representative Site and Data job minutes before schedule enablement. Prefer GitLab Free and treat Chronicle as the only repository with routine P1 hosted work; the OG Worker and Daily Stargazing have no P1 schedule/deploy jobs, though their already-decided one-time P0 bootstrap pipelines still consume a small amount. Keep the original daily `18:00 UTC` cadence only when the measured namespace budget fits the free 400 compute minutes. If it does not, use a temporary Sunday `18:00 UTC` weekly cadence while GitLab is primary. Do not buy extra minutes merely to preserve daily cadence, and do not move the normal schedule to Windows. If even the weekly plan cannot fit or a job approaches GitLab's hosted-job limit, stop and reopen the hosted-CI decision.

#### Handoff, evidence, stops, and return to GitHub

Execution is one Chronicle P1 implementation Issue and one Issue-owned branch/PR because all code and production ownership in scope are Chronicle-local. The maintainer has classified this handoff as R3. Its machine-readable protected surfaces are exactly `publication`, `planet_export`, `og_worker`, and `daily`; production secrets, Supabase, OG KV/checkpoint, R2 galaxy/profile/site/receipt state, and Cloudflare Pages are recorded in the declaration notes rather than passed as non-canonical surface values. The implementation runs the scope-matching frontend checks, release-script pytest suites and workflow-contract tests, GitLab configuration validation, documentation-authority checks, local fixture/preview acceptance, `git diff --check`, and every Issue-named check. After the first P1 production cutover, one complete R3 integration acceptance also covers Planet Export-to-Daily compatibility and the relevant OG Worker surface. That one-time delivery acceptance does not enlarge the ordinary smoke run on every Site or Daily publication. Evidence contains no secret values. Human merge and production-enable approval remain mandatory. Do not create empty OG Worker or Daily implementation Issues.

Any wrong project/ref/visibility, unprotected production variable, resource-group mismatch, overlapping publisher, corrupt or non-monotonic sequence, unexpected remote prerequisite, active/deployed Site Artifact mismatch, OG/profile validation failure, failed Direct Upload, failed smoke, inability to prove local takeover, or budget/runtime breach stops promotion. Preserve the last-known-good public site and all diagnostic state; do not delete or force-rewrite Supabase/KV/R2 state as cleanup.

If GitHub access returns, do not automatically re-enable the old Actions schedules or production jobs. GitLab remains the sole publication scheduler until a separate Cutback & Resilience Wayfinder effort decides and approves the implementation that pauses GitLab, drains its publication lane, verifies the GitHub adapter and deployment copies, records the authority transfer, and enables GitHub. At no point are GitHub and GitLab normal publication schedulers simultaneously.
