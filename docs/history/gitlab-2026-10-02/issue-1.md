# Restore development and operations without a GitHub account single point of failure



Source: https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/work_items/1

State at capture: **opened**

Original author: @yixie.ixd

Created: 2026-08-18T09:52:22.427Z; updated: 2026-08-18T09:52:22.427Z



Labels at capture: ready-for-agent, spec

Assignees at capture: (none)

## Original body



**Portable ID:** `tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`
**Parent:** None
**Blocked by:** None
**Local state:** ready-for-agent
# Restore development and operations without a GitHub account single point of failure

## Problem Statement

The maintainer has lost access to the GitHub account that hosted the authoritative Git repositories, Issues, and hosted automation for The Movie Cosmos. The public site and its currently published artifacts may still be available, but development delivery, Issue-driven coordination, Chronicle Site Release, Daily Data Release, Monthly Data Release, and GitHub-hosted recovery controls cannot be treated as operable.

The three local repositories contain the best currently available source state, including work that ordinary Git pushes do not preserve. A rushed migration could discard reflog-only objects, stash, ignored operational state, the Daily Stargazing external Git store, or secret-bearing local data. It could also create two writable trackers, expose production credentials, run two publication authorities concurrently, or mutate production before a recoverable baseline exists.

The maintainer needs a simple, evidence-backed route that first protects all recoverable local state, then restores Issue-owned development for Chronicle, the OG Worker, and Daily Stargazing, then restores the essential Chronicle publication paths without changing the current product contracts. The route must preserve repository responsibility boundaries, keep production on last-known-good artifacts when a step fails, and leave future GitHub return, failback, and long-term cold recovery as explicit human-gated decisions rather than automatic side effects.

## Solution

Create one Chronicle-owned Recovery Initiative with six delivery Issues executed behind strict dependency gates. The first delivery slice establishes Bitwarden as the secrets authority, creates and completely verifies one encrypted restic recovery snapshot on the maintainer's MacBook, and admits GitLab.com Free using disposable, secret-free data. No real forge migration, live-secret migration, repository push, or production mutation occurs before the recovery snapshot passes a full-data check and a zero-difference complete restore.

Restore Chronicle to a private GitLab project first, then restore the OG Worker and Daily Stargazing in parallel. Each repository crosses its own development-resume gate only after approved refs survive a fresh clone, `main` protection is verified, exactly one tracker is writable, and one real non-deploying Issue-to-merge-request cycle passes the repository's own checks with human approval. This restores development without claiming that deployment or publication has been restored.

After all three repositories pass their development-resume gates, restore Chronicle Site Release and Daily Data Release through two complete, mutually exclusive GitLab jobs that call provider-neutral Chronicle entry points. Replace forge-owned run identity with a Chronicle-owned monotonically increasing publication sequence and durable publication receipts. Preserve existing Cloudflare, Supabase, R2, OG projection, manifest, Site Artifact, smoke, rollback, and last-known-good semantics. Keep Windows as a tested, human-started emergency path, never as a normal scheduler.

Migrate the Monthly Data Release as one intact but disabled production entry point. While GitLab is temporary primary, keep Monthly Data Release deliberately suspended and continue Daily Data Release against the last active membership, spatial arrangement, thresholds, and visual-distribution profile. Move Production Recovery to an audited local planner plus the existing repository-owned mutation commands; do not create a new hosted recovery executor. Any consumer-visible recovery publication receives a new publication sequence and receipt.

The Recovery Initiative is accepted through one ordered integration seam. Its six delivery Issues contribute sanitized evidence from their repository-owned gates; P1 and P2 each receive the already accepted R3 declaration with protected surfaces `publication`, `planet_export`, `og_worker`, and `daily`, while P0 risk declarations remain human decisions made after the exact implementation scope is known. Human approval remains mandatory for merges, production enablement, recovery mutations, Issue closure, GitHub cutback, and Monthly re-enablement.

## User Stories

1. As the maintainer, I want all three local repositories protected before any migration, so that an attempted recovery cannot destroy the only complete source state.
2. As the maintainer, I want Chronicle's complete worktree and physical Git store preserved, so that ordinary refs and local-only recovery objects remain available.
3. As the maintainer, I want the OG Worker's complete worktree and physical Git store preserved, so that its independent deployment history remains recoverable.
4. As the maintainer, I want Daily Stargazing's worktree and external Git store preserved together, so that the mounted worktree is not mistaken for a self-contained repository.
5. As the maintainer, I want stash, reflogs, dangling objects, Codex refs, ignored operational state, and unclassified work preserved without up-front classification, so that recovery does not force risky editorial decisions under pressure.
6. As the maintainer, I want reproducible dependencies and build outputs excluded by a fixed policy, so that snapshot size can be controlled without silently excluding irreplaceable state.
7. As the maintainer, I want unreadable sources, capacity shortfalls, source mutations, or incomplete backups to fail the joint snapshot, so that partial protection is never reported as complete protection.
8. As the maintainer, I want the encrypted repository checked by reading all stored data, so that metadata-only success cannot conceal corrupt backup content.
9. As the maintainer, I want the complete snapshot restored on the MacBook and compared with the acquisition manifest, so that every missing, extra, changed, or mis-typed entry is detected.
10. As the maintainer, I want all restored Git stores to pass full integrity checks, so that file equality is not mistaken for usable repository recovery.
11. As the maintainer, I want a sanitized snapshot receipt, so that acceptance can be proven without exposing secret values, sensitive paths, per-file hashes, or object inventories.
12. As the maintainer, I want the first accepted recovery outcome to be the verified MacBook snapshot, so that no forge, credential, or production work outruns physical preservation.
13. As the maintainer, I want Bitwarden Free to become the human-controlled secrets authority, so that CI systems and ignored local files are replaceable deployment copies rather than the source of truth.
14. As the maintainer, I want live credential values transferred without entering agent context, chat, logs, screenshots, repository files, or plaintext import artifacts, so that recovery does not create a new disclosure incident.
15. As the maintainer, I want a password-protected portable vault export on the MacBook and a sealed offline recovery record, so that forge or account loss does not make the vault unrecoverable.
16. As the maintainer, I want a synthetic export/import drill before live migration, so that portability is proven without exposing production credentials.
17. As the maintainer, I want credentials rotated only after evidence-based triggers, so that an availability incident does not create unnecessary production risk.
18. As the maintainer, I want GitLab admitted with disposable data from both Windows and the MacBook, so that real repository state is not used to discover basic access or runner failures.
19. As the maintainer, I want the admission trial to prove private Git transfer, a non-deploying Node/Python job, dummy protected values, artifacts, and portable Issue export, so that the selected development control plane is usable end to end.
20. As the maintainer, I want GitLab Free usage measured before normal schedules are enabled, so that recovery does not silently require an unapproved subscription.
21. As the maintainer, I want every recovered repository private until history and secret checks pass, so that outage recovery does not accidentally publish sensitive history.
22. As the maintainer, I want only reviewed branches and tags pushed with explicit ref selections, so that recovery material and provider-specific refs do not become ordinary remote history.
23. As the maintainer, I want reachable history scanned before a real push, so that evidence of a secret stops migration before exposure.
24. As the maintainer, I want `main` protected against direct and force pushes, so that the recovered forge preserves reviewed delivery.
25. As a contributor, I want one active Issue tracker for each repository, so that claims, decisions, and status cannot diverge between GitHub, GitLab, and local Markdown.
26. As a contributor, I want accepted Specs, delivery Issues, Wayfinder records, and cross-repository work to carry portable identities, so that provider numbers are aliases rather than permanent identity.
27. As a contributor, I want parent and blocker relationships readable in Issue bodies and normalized exports, so that workflow meaning survives tracker migration.
28. As the maintainer, I want tracker transitions to freeze, export, verify, import, and only then promote the destination, so that two writable copies never exist.
29. As the maintainer, I want the inaccessible GitHub Issue 370 captured before editing if access returns, so that its original body, comments, relationships, timestamps, and status remain available for human reconciliation.
30. As the Chronicle owner, I want Chronicle restored before the two consumer repositories, so that product-level coordination and the Recovery Initiative have an authoritative home.
31. As the OG Worker owner, I want the Worker restored through its own Issue, tests, merge request, and evidence, so that Chronicle does not absorb Worker runtime responsibility.
32. As the Daily Stargazing owner, I want Daily restored through its own Issue, tests, merge request, and evidence, so that Chronicle does not absorb Daily editorial or publication responsibility.
33. As the maintainer, I want Worker and Daily restoration to proceed in parallel after Chronicle passes, so that independent repository work is not serialized unnecessarily.
34. As a contributor, I want each repository to pass a fresh-clone, ref, integrity, protected-branch, tracker, and non-deploying delivery gate, so that development resumes only from a verified remote.
35. As a contributor, I want a repository that passes its own gate to resume repository-local work, so that an unrelated repository failure does not block all development.
36. As a product owner, I want cross-repository work to wait for every affected repository, so that coordination never depends on an unavailable delivery path.
37. As the maintainer, I want all production jobs, schedules, and production deployment copies disabled during P0, so that development recovery cannot mutate production accidentally.
38. As a site visitor, I want the current public site and compatible data to remain available during recovery, so that control-plane loss does not become an avoidable product outage.
39. As the Chronicle operator, I want Site Release and Daily Data Release serialized through the same publication lane, so that their Cloudflare and R2 mutations cannot overlap.
40. As the Chronicle operator, I want production jobs restricted to protected `main`, so that merge requests, forks, and arbitrary branches cannot obtain production authority.
41. As the Chronicle operator, I want Site Release and Daily Data Release to call the same provider-neutral entry points from hosted and Windows environments, so that provider adapters do not duplicate production ordering.
42. As the Chronicle operator, I want scheduled backlogs collapsed into one current Light Refresh, so that missed calendar intents do not replay stale production work.
43. As the Chronicle operator, I want every Site or Data publication attempt to receive a monotonically increasing publication sequence, so that provenance does not depend on a forge's run-number namespace.
44. As the Chronicle operator, I want a durable receipt for every publication attempt, so that inputs, mutations, results, rollback attempts, and final disposition remain auditable outside transient CI logs.
45. As the Chronicle operator, I want failed Site or Daily attempts recovered by a whole-entry publication replay under a new sequence, so that unsupported stage continuation is not presented as safe resumability.
46. As the Chronicle operator, I want a replay blocked from publishing behind a newer success, so that retry cannot regress consumer-visible state.
47. As the OG Worker owner, I want OG movie mutations and verification to precede `meta:G`, so that the ordered completion marker retains its accepted contract meaning.
48. As the OG Worker owner, I want `meta:G` treated as an opaque Data Release identity, so that the new sequence format does not create a Worker parsing dependency.
49. As a Planet Export consumer, I want manifests, data identities, profiles, and CLI compatibility preserved, so that publication-control migration does not change the export contract.
50. As the Daily Stargazing owner, I want Planet Export-to-Daily compatibility checked during the first R3 cutover acceptance, so that restored Chronicle publication does not silently break the consumer.
51. As the Chronicle operator, I want completed Supabase, KV, checkpoint, and immutable R2 mutations preserved after downstream failure, so that cleanup does not destroy diagnostic state or pretend there is a global transaction.
52. As the Chronicle operator, I want rollback to select retained compatible Site and Data artifacts, so that consumers return to last-known-good state without rewriting history.
53. As the Chronicle operator, I want missing Site Artifact registry state, OG checkpoints, profiles, holds, or sequence evidence to stop normal P1 cutover, so that recovery-only bootstraps are not smuggled into ordinary release paths.
54. As the Chronicle operator, I want one successful hosted Site Release and one successful hosted Daily Data Release before schedules are enabled, so that production authority is proven manually before automation resumes.
55. As the Chronicle operator, I want the Windows path to prove read-only inventory, fixture execution, and a non-production Pages Preview, so that emergency readiness is tested without manufacturing a live mutation.
56. As the Chronicle operator, I want local takeover to require proof that hosted publication is inactive, so that Windows and GitLab can never become simultaneous publishers.
57. As the maintainer, I want Daily cadence retained only when measured free compute supports it, so that cost constraints are explicit.
58. As a site visitor, I want a temporary weekly refresh rather than an unsafe or unaffordable scheduler when daily cadence cannot fit, so that publication remains controlled and predictable.
59. As the Chronicle operator, I want the Monthly Data Release migrated as one intact but disabled entry point, so that its recoverability can be tested without enabling a Galaxy Refit.
60. As the Chronicle operator, I want Monthly Data Release explicitly suspended throughout the GitLab-primary period, so that migration is not mistaken for authorization to run it.
61. As a site visitor, I want Daily Data Release to continue using the last active membership, spatial arrangement, thresholds, and profile, so that data freshness can resume without an unsafe refit.
62. As the Chronicle operator, I want the canonical four-file embedding bundle preserved on the MacBook and private R2 with a verified hash, so that a future Galaxy Refit does not depend on a forge cache.
63. As the Chronicle operator, I want Monthly fixture rehearsals to validate bundle, profile, identity, ordering, and failure rules without mutating production, so that suspended functionality remains verifiable.
64. As the Chronicle operator, I want dangerous profile, dimension, OG, and bootstrap controls absent from normal release inputs, so that ordinary publication cannot invoke recovery-only behavior.
65. As the recovery operator, I want a provider-neutral, non-mutating recovery planner, so that each proposed production action states its starting state, target, mutations, rollback boundary, actor, reason, and required smoke.
66. As the recovery operator, I want a fresh inventory compared with the approved plan immediately before mutation, so that stale recovery intent fails closed.
67. As the recovery operator, I want publication hold/resume to remain the only direct recovery-control mutation, so that the planner does not become a second orchestration platform.
68. As the recovery operator, I want Data, Site, profile, and OG recovery performed by repository-owned commands, so that ownership and existing contract tests remain intact.
69. As the recovery operator, I want consumer-visible recovery publications to receive new sequences and receipts, so that recovery never rewrites or reuses a failed publication identity.
70. As the maintainer, I want immutable, sanitized recovery evidence stored outside transient CI, so that real operations can be audited without disclosing credentials.
71. As the maintainer, I want P1 and P2 protected by one-time R3 integration acceptance, so that publication, Planet Export, OG Worker, and Daily outcomes are proven together at the delivery boundary.
72. As the maintainer, I want ordinary Site and Daily smoke to stay focused after cutover, so that a one-time integration gate does not make every publication unnecessarily expensive.
73. As the maintainer, I want risk tiers and protected surfaces declared by a human, so that agents do not invent a path-based risk classifier.
74. As the maintainer, I want every merge, production enablement, recovery mutation, and Issue closure to remain human-gated, so that automation cannot silently acquire irreversible authority.
75. As the maintainer, I want GitLab to remain the sole publication scheduler until an approved cutback completes, so that returning GitHub access cannot create overlapping control planes.
76. As the maintainer, I want Monthly re-enablement decided separately from GitHub cutback, so that an account recovery does not implicitly authorize a production Galaxy Refit.
77. As the maintainer, I want future GitHub state captured into isolated recovery inputs before reconciliation, so that server-only refs or Issue history cannot overwrite the recovered primary automatically.
78. As the maintainer, I want a future account-wide cold recovery mirror to use one controller and no duplicate live product tracker, so that long-term resilience does not recreate dual authority.
79. As the maintainer, I want future cold recovery points to be no more than 24 hours old and periodically restored, so that backup existence is supported by recovery evidence.
80. As the maintainer, I want a changed provider, pricing limit, permanent GitHub loss, or mirror failure to open a new Wayfinder effort, so that contingencies are never promoted silently.

## Implementation Decisions

- Chronicle owns one Recovery Initiative containing exactly six current delivery Issues: Common P0 Protection and GitLab Admission; Chronicle P0 repository restoration; OG Worker P0 repository restoration; Daily Stargazing P0 repository restoration; Chronicle P1 publication-control restoration; and Chronicle P2 Monthly-suspension and Production-Recovery migration.
- The dependency order is Common P0, Chronicle P0, Worker and Daily P0 in parallel, Chronicle P1 after all three development-resume gates, then Chronicle P2. The parent owns product goal, compatibility window, dependency order, integration evidence, rollback coordination, and final human closure approval.
- The first P0 slice includes Bitwarden, restic, Mac capacity, and SSH preparation. Its first accepted outcome is the fully checked, fully restored, zero-difference MacBook snapshot. No real forge, live-secret, repository-push, or production mutation may precede it.
- The recovery snapshot preserves the three complete worktrees and physical Git stores, including Daily's external Git store, plus tracked, untracked, ignored, secret-bearing, and operational data. Only a fixed set of reproducible dependencies, caches, and build outputs may be excluded.
- Snapshot acquisition freezes writers and records encrypted manifests and Git inventories without inspecting unclassified object contents. Acceptance requires a full restic data check, a complete Mac restore, zero manifest differences, restored-store Git integrity, and a sanitized receipt.
- Bitwarden Free is the secrets authority. CI values and ignored local environments are scoped deployment copies. Agents never receive live values. A password-protected portable export and sealed offline recovery material provide the independent recovery path.
- GitLab.com Free is the acceptance-gated temporary development control plane. Azure DevOps remains a contingency only after a reproducible GitLab failure and a reopened platform decision. Start with one personal namespace and three private projects.
- The GitLab admission harness uses only disposable data and proves two-machine Git/API access, a representative non-deploying Node/Python job, dummy protected values, artifacts, portable Issue data, and measured compute usage.
- Remote migration pushes only approved ordinary branches and formal tags through explicit ref selections. The encrypted snapshot, not the forge, remains authority for stash, reflogs, dangling objects, provider/Codex refs, ignored state, and unclassified work.
- Every accepted Spec, delivery Issue, Wayfinder record, and cross-repository Initiative receives an immutable `tmc:<repo-key>:<ULID>` portable identity. Provider numbers and URLs are aliases.
- Exactly one tracker is writable for a repository. A transition freezes the old tracker, creates and verifies a normalized Markdown export, imports and verifies the destination, and only then promotes it. Local and remote trackers are never reconciled through simultaneous writes.
- GitHub Issue 370 uses capture-first reconciliation if access returns. Its state and history are not changed until the maintainer classifies its relationship to the migrated record and approves the resulting single active representation.
- Chronicle crosses its development-resume gate first. Worker and Daily may then proceed in parallel. Each repository owns its Issue, branch, tests, merge request, evidence, deployment boundary, and human approvals.
- A development-resume gate proves private visibility, approved ref equality in a fresh clone, Git integrity, protected `main`, one active tracker, current agent/tracker guidance, and one passing non-deploying Issue-to-merge-request cycle. It does not prove deployment or publication readiness.
- The Worker P0 slice corrects its repository-local authority so ignored environments are deployment copies rather than the secrets authority and rollback never restores retired Today routes. Daily's gate proves its recovered repository is self-contained rather than dependent on the former external Git-store layout.
- P1 contains one complete Site Release job and one complete Daily Data Release job. Both use the same non-interruptible `galaxy-r2-pages-release` GitLab resource group in oldest-first mode and run only from protected `main`.
- Chronicle provides one cross-platform, provider-neutral entry point for Site Release and one for Daily Data Release. Provider adapters remain thin. Hosted and Windows paths pass argument arrays into the same ordering logic.
- P1 preserves current Site Artifact, manifest composition, Light Refresh, Supabase preflight, OG synchronization, immutable R2, Direct Upload, smoke, rollback, and last-known-good semantics. It does not add a global transaction or distributed lock.
- A Chronicle-owned durable publication sequence replaces forge-owned run numbers. Daily and Monthly Data Release identities use the sequence as their decimal suffix; Monthly also uses it in the threshold label. Site attempts receive a sequence and receipt without changing the selected Data Release.
- Every Site or Data attempt, including replay and consumer-visible recovery, gets a new sequence and durable publication receipt. Receipts record provenance and mutations but are not execution checkpoints.
- Failed Site and Daily attempts recover through whole-entry publication replay. Stage-level candidate continuation is not part of P1 and is removed from the supported P2 recovery surface.
- The ordinary P1 smoke boundary remains focused on supported page responses, retired Today equivalence, expected Data Release identity, and reachable referenced assets. Planet Export-to-Daily and OG Worker checks belong to the one-time delivery acceptance rather than every publication.
- GitLab receives separate least-privilege deployment copies where providers support them. Production values are protected and restricted to protected `main`; Bitwarden sessions and vault-wide access never enter CI.
- Windows is a tested emergency publisher but never a scheduler. Local mutation requires paused hosted triggers and proof that no hosted publication job is running or queued. Ambiguous authority stops the local attempt.
- P1 production cutover occurs only after all P0 gates, disabled-job merge, scoped-secret installation, read-only inventory, resource-group verification, one successful manual Site Release, one successful manual Daily Data Release, and Windows non-production evidence.
- Daily remains daily only when measured GitLab Free compute supports it. Otherwise it temporarily runs weekly on Sunday at 18:00 UTC. If the weekly plan or hosted job limit is not viable, the hosted-CI decision is reopened.
- P2 migrates Monthly Data Release as one intact but disabled production entry point. No schedule or manual production run is allowed while GitLab is temporary primary. Monthly re-enablement is a separate post-cutback human decision.
- Daily continues against the last active membership, spatial arrangement, threshold state, and visual-distribution profile during Monthly suspension. It does not generate or activate a profile.
- The canonical four-file embedding bundle is retained in the verified MacBook snapshot and one immutable private R2 object with a recorded whole-bundle SHA-256. Forge cache and artifacts are never the authority.
- Monthly acceptance uses configuration validation, provider-contract tests, and a complete non-production fixture rehearsal with fake/local service adapters. It does not claim that a real refit fits hosted limits or that production Monthly has run.
- Production Recovery becomes a provider-neutral local dry-run planner plus repository-owned mutation commands. No unified live recovery executor, plan-hash handshake, duplicate approval service, or hosted recovery path is introduced.
- Dangerous recovery controls remain absent from normal Site, Daily, and Monthly inputs. The operator reruns inventory immediately before mutation and stops when the observed starting identity differs from the reviewed plan.
- Completed Supabase, KV, checkpoint, profile, and immutable R2 mutations remain diagnostic state after failure. Rollback selects retained compatible artifacts or creates a new Data Release; it does not rewrite history or claim cross-system atomicity.
- Real recovery operations write one immutable, sanitized evidence bundle containing the plan, before/after inventories, resolved source commit, attempted mutations, receipts, smoke, disposition, and timestamps. Secrets never enter the bundle.
- P1 and P2 are R3 with protected surfaces `publication`, `planet_export`, `og_worker`, and `daily`. P0 Issues receive human-declared risk tiers and canonical surfaces only when their exact implementation scope is known.
- Human merge and Issue closure approval remain mandatory. Production enablement, local takeover, recovery mutation, publication resume, GitHub cutback, and Monthly re-enablement also require explicit human approval.
- If GitHub returns, GitLab remains sole development/publication primary until a separate Cutback & Resilience effort captures both sides, reconciles them, proves GitHub gates, drains publication, and transfers authority. GitHub and GitLab are never simultaneous normal schedulers.
- The accepted long-term topology is a future account-wide GitHub-to-GitLab cold recovery mirror with a formal `mirror-control` repository, no duplicate live product tracker, a 24-hour maximum recovery-point age, encrypted Mac/R2 archives, and periodic complete restore drills. Its implementation is not part of the six current delivery Issues.

## Testing Decisions

- The highest test seam is one ordered Recovery Initiative acceptance. It verifies the user-visible recovery outcome by consuming sanitized evidence from the six delivery Issues rather than duplicating every repository's test suite in Chronicle.
- Good tests exercise externally observable recovery behavior: complete recoverability, ref equality, protected delivery, single tracker authority, publication ordering, identities and receipts, consumer compatibility, fail-closed gates, last-known-good preservation, and human authorization boundaries. Tests must not couple to internal helper structure merely to increase coverage.
- Common P0 is accepted only by the complete snapshot/restore seam and the disposable control-plane admission seam. Sampling, metadata-only backup checks, a single-machine Git test, or documentation-only platform claims are insufficient.
- Each repository's P0 slice is tested at its development-resume gate. Chronicle uses its existing frontend checks, documentation-authority tests, build, and diff validation; the Worker uses its existing unit and type checks; Daily uses its existing pytest suite. Every repository adds fresh-clone/ref/integrity, protected-branch, tracker-export, and non-deploying pipeline evidence around those owner checks.
- P1 tests the shared Site and Daily entry points with fixture and workflow-contract coverage for ordering, protected-ref admission, resource-group configuration, sequence allocation, receipt contents, replay, backlog collapse, rollback attempts, and fail-closed production inventory.
- P1 reuses Chronicle's existing release-script pytest suites and current production-smoke semantics as prior art. The acceptance harness remains the owner-check and R3 evidence coordinator rather than becoming a second publisher.
- P1 hosted/local equivalence is tested through the same entry-point arguments and fixture results. The Windows side adds read-only production inventory and non-production Pages Preview evidence; it does not manufacture a local production release solely for testing.
- P2 tests the same Monthly entry point through a complete non-production fixture with fake/local Supabase, R2, KV, Pages, and smoke adapters. Assertions cover canonical-bundle validation, profile activation rules, identity/hashes, command order, dangerous-input exclusion, failure behavior, and the fact that production triggers remain disabled.
- P2 recovery tests cover required audit fields, fresh-inventory mismatch, hold corruption and held behavior, removal of candidate continuation, retained rollback plans, OG ordering, receipt linkage, immutable evidence, and fail-closed takeover. There is no false hosted/local live-recovery equivalence test because no hosted recovery executor exists.
- The first P1 and first P2 deliveries each run one complete R3 integration acceptance through the existing Chronicle acceptance harness. It includes Planet Export-to-Daily compatibility and the relevant OG Worker surface using owner-repository evidence, without running Monthly or manufacturing a production recovery mutation.
- Cross-repository contracts use strict equivalence for routes, schemas, CLI exit/stdout, manifest/profile/provenance, hashes, headers, and identities. Visual output, when touched by a declared surface, follows the existing fixed-input perceptual review rather than an invented screenshot threshold.
- No new failure is accepted. A pre-existing failure is admissible only when the identical command and signature reproduce on the clean merge base and the delivery does not touch that surface. Evidence records both revisions, command, environment, and signature.
- Every delivery runs checks matching its changed scope, its human risk declaration, the parent Initiative, and its owning repository. `git diff --check` and current documentation-authority checks are required where applicable.
- A ticket is not accepted by green automation alone when its gate requires identity-bound setup, visual Go/No-Go, protected settings, production smoke, or merge/closure approval. Those remain explicit human evidence.

## Out of Scope

- Executing backups, creating third-party accounts, transferring live secrets, creating real GitLab projects, pushing repositories, migrating Issues, changing CI, or mutating production as part of writing this Spec.
- Moving Cloudflare Pages, R2, KV, Supabase, DNS, or the production domain to new providers unless later evidence proves that retaining them blocks recovery.
- Reconstructing every closed historical Issue or classifying every reflog, stash, dangling object, or Codex ref before preservation.
- Restoring GitHub Pages, retired Today routes or keys, or the historical combined frontend-build/data-refresh workflows.
- Rewriting historical Plans, Reports, accepted ADRs, or current contract history as though the new recovery design were already implemented.
- Guaranteeing repository-specific runtime, deployment, or recovery semantics for repositories outside Chronicle, the OG Worker, and Daily Stargazing.
- Running Monthly Data Release while GitLab is temporary primary, enabling an emergency Monthly exception, or claiming that a fixture rehearsal is a production Galaxy Refit.
- Building a hosted or unified Production Recovery executor, a distributed publication lock, a global generation transaction, or stage-level publication continuation.
- Automatically cutting development or publication back to GitHub when access returns.
- Re-enabling Monthly Data Release as part of GitHub cutback.
- Creating `mirror-control`, implementing the account-wide cold mirror, or selecting a permanent primary/cold endpoint if GitHub never returns. Those conditions open separate Wayfinder and delivery efforts.
- Automatically buying GitLab compute or storage, silently promoting Azure DevOps, or introducing a self-hosted forge or runner.
- Merging pull/merge requests or closing delivery Issues without explicit human approval.

## Further Notes

- The source Wayfinder map reached its destination on 2026-08-18 after all twelve decision tickets closed and the maintainer explicitly accepted the ordered handoff. This Spec synthesizes those decisions; it does not reopen platform, secrets, publication, Monthly, Recovery, or failover design.
- GitHub remains unavailable at publication time, so this Spec is published to the temporary local Markdown tracker with `ready-for-agent`. When an approved remote tracker becomes available, migrate it with its portable identity, full body, labels, parent/child relationships, blocker edges, and resolution context; do not keep both copies writable.
- GitHub Issue 370 is a known alias candidate, not automatically the same record. If access returns, capture it first and let the maintainer classify its relationship and state before any edit.
- The public site, manifest, OG brand endpoint, and current immutable R2 galaxy object were observed reachable on 2026-08-17. Recovery therefore prioritizes restored control and publication freshness while preserving last-known-good service; it does not assume the site is currently offline.
- The last locally cached remote-tracking refs matched the three local branches and all three local Git stores passed integrity checks, but this cannot prove that GitHub held no later server-only state. Returned GitHub state must be captured and reconciled rather than overwritten.
- The temporary local Wayfinder is closed decision history. The Spec and its delivery tickets are the active implementation handoff; they must not create a second writable copy of the closed map.



## Original notes
