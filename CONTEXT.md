# OG Index / OG Worker Context

This context defines the shared language for the cross-repository Open Graph integration between Chronicle and the independent OG Worker.

## Ownership and boundaries

**Cross-repository contract**:
The set of compatibility rules that Chronicle and the OG Worker must share. It records externally observable behavior and producer/consumer invariants, not either repository's full implementation or deployment runbook.
_Avoid_: full system runbook, copied implementation specification

**Producer contract**:
The Chronicle-owned definition of the OG Index data projection and its synchronization semantics. It describes what the producer publishes for the consumer, not how the Worker renders a response.
_Avoid_: Worker runtime, deployment procedure

**Worker runtime**:
The OG Worker-owned behavior for consuming the projection and serving movie OG PNG and HTML responses, including rendering, caching, fallback, and route handling.
_Avoid_: producer contract, Chronicle workflow

**OG Index**:
The movie-focused metadata projection shared from Chronicle to the OG Worker through KV. Its current product path is movie-only; the retired Today path is not part of the active projection.
_Avoid_: Today index, legacy `today` feed

**Retired Today path**:
The historical `/today`, `/og/today.png`, `/share/today`, and `today`-key behavior that is no longer an active product capability. These names remain reserved from product reuse. `/today` and `/share/today` follow Chronicle ordinary invalid-path handling; `/og/today.png` is an unknown route inside the active `/og/*` Worker namespace. There is no active `today` KV key. Reuse requires a new product Initiative plus an explicit contract migration.
_Avoid_: active Today contract, specially bound Worker 404, fallback data source

**Ordered completion marker**:
The role of `meta:G` after Chronicle has written and verified the current movie delta. It orders publication but does not create a transactional snapshot across Cloudflare KV keys.
_Avoid_: atomic generation barrier, KV transaction

**Coordinated best-effort cutover**:
A deliberately short cross-repository release window for a breaking OG contract change. Chronicle and the OG Worker are deployed separately, and brief brand fallback or request failure is an accepted risk rather than hidden behind an atomic-release claim.
_Avoid_: atomic deployment, zero-downtime guarantee

## Data lifecycle and publication

**Light Refresh**:
An update to dynamic facts for the current galaxy membership that preserves the membership, spatial arrangement, and active visual-distribution profile. Newly eligible movies may wait for a later Galaxy Refit.
_Avoid_: nightly, daily rebuild, refit

**Galaxy Refit**:
A recalculation of galaxy eligibility, membership, and spatial arrangement that can admit waiting movies and produce a candidate visual-distribution profile.
_Avoid_: monthly job, light refresh, full refresh

**Monthly Data Release suspension**:
An intentional operating state in which the Monthly Data Release remains recoverable but no production Galaxy Refit attempt may run. Light Refresh continues against the last active membership, spatial arrangement, and visual-distribution profile.
_Avoid_: failed Monthly Data Release, restored Monthly Data Release, Daily Data Release suspension

**Canonical embedding bundle**:
The validated, hash-identified four-file input set required to perform a Galaxy Refit. It must remain recoverable independently of an execution system's transient cache.
_Avoid_: CI cache, job artifact, published galaxy assets

**Data Release**:
A consumer-identifiable publication of validated galaxy content and its associated compatibility metadata. It is distinct from publishing the application that presents the content.
_Avoid_: site deployment, frontend release

**Site Release**:
A publication of the application shell and interactive client that preserves the selected compatible Data Release.
_Avoid_: data refresh, galaxy publication

**Publication control plane**:
The authority that admits, orders, and records production Site Release and Data Release attempts. It coordinates publication without becoming the product runtime or the secrets authority.
_Avoid_: development control plane, production host, secrets store

**Publication sequence**:
A Chronicle-owned monotonically increasing identity that orders production publication attempts independently of the system executing them.
_Avoid_: CI run number, forge pipeline id, timestamp ordering

**Publication receipt**:
The durable record of a publication attempt's identity, inputs, completed stages, outputs, verification, and final disposition.
_Avoid_: CI log, cache, transient job artifact

**Publication replay**:
A new publication attempt that restarts an entry point after failure while safely tolerating durable mutations left by the prior attempt. It does not continue an earlier candidate from an internal stage.
_Avoid_: candidate continuation, stage resume, full rollback

**Recovery plan**:
A non-mutating, evidence-backed description of one exact production recovery action, including its observed starting state, intended target, safety checks, and expected mutations.
_Avoid_: recovery execution, informal checklist, ordinary publication receipt

**Recovery application**:
The explicitly authorized execution of one exact Recovery plan. It must not silently broaden or recompute the approved action while production state is changing.
_Avoid_: dry run, normal release, ad hoc dashboard repair

**Emergency publication takeover**:
An explicit temporary transfer of publication authority from the normal hosted control plane to a human-started local path after the hosted publisher is confirmed inactive.
_Avoid_: local scheduler, second active publisher, automatic failover

## Current documentation model

**Active issue tracker**:
The single work-tracking system currently authorized for Issue writes, claims, and state transitions for a repository. Mirrors, exports, and dormant fallback copies are recovery material rather than additional active trackers.
_Avoid_: synchronized live trackers, writable backup tracker

**Portable Issue record**:
An Issue record whose provider-independent identity and decision-relevant context remain intelligible across tracker migrations. It has one active representation at a time; exported or mirrored representations do not become live copies unless a deliberate failover promotes one.
_Avoid_: forge-native Issue number, duplicated live Issue

**Development control plane**:
The managed layer that is currently authoritative for Git hosting, new-work tracking, and hosted CI. Sharing a control plane does not transfer product or runtime responsibility between repositories.
_Avoid_: product owner, runtime owner, monorepo

**Account-wide recovery mirror**:
The automated backup plane that discovers repositories owned by the maintainer's GitHub account, keeps one cold GitLab project per repository, and preserves portable forge metadata in encrypted archives. It is recovery material rather than a second development control plane or live tracker.
_Avoid_: live dual forge, bidirectional mirror, complete GitHub clone

**Cold recovery endpoint**:
A non-authoritative forge copy retained for verified manual promotion after the primary forge becomes unavailable. It may run backup-only reconciliation but holds no normal product schedule, writable product tracker, or production deployment copy.
_Avoid_: warm standby, secondary primary, automatic failover

**Development-resume gate**:
The repository-local proof that a recovered private remote contains the approved refs, protects its default branch, has one active Issue tracker, and completes one automated non-deploying Issue-to-merge-request delivery cycle. Passing it authorizes Issue-owned branch and review work for that repository; it does not prove that deployment or publication has been restored.
_Avoid_: deployment-ready, production recovery, cross-repository acceptance

**Repository responsibility boundary**:
The assignment under which Chronicle, the OG Worker, and Daily Stargazing each own their repository-local implementation, tests, deployment, and delivery evidence. A cross-repository change does not move this boundary by itself.
_Avoid_: hosting boundary, namespace boundary, code-change boundary

**Secrets authority**:
The human-controlled primary store for long-lived operator credentials and their recovery context. Hosted CI and local environments receive scoped copies but never become authoritative.
_Avoid_: CI secrets store, `.env` source of truth, credential bundle

**Deployment copy**:
A replaceable, scope-limited copy of a credential provisioned from the secrets authority to one hosted CI workload or local emergency environment.
_Avoid_: authoritative secret, vault replica, shared master credential

**Contract conformance defect**:
A repository implementation or deployed runtime that disagrees with an already accepted cross-repository contract while the contract itself remains unchanged. Remediation belongs to the nonconforming repository; it does not require a contract migration or cross-repository Initiative unless the desired semantics also change.
_Avoid_: contract change, coordinated cutover

**Setup-ready**:
A runtime readiness gate reached only when the current contract, repository implementation and tests, auditable deployment control plane, and production-observed behavior agree. Source and tests may establish implementation readiness, but cannot compensate for an inactive route or other production drift.
_Avoid_: repository-only readiness, deployable-in-principle

**Current contract SSOT**:
The single Chronicle-owned document for the cross-repository compatibility rules. The OG Worker README links to it and remains authoritative for Worker-local implementation and deployment instructions.
_Avoid_: duplicated runbook, historical Phase plan

## Galaxy exploration

**Focus**:
A single-film viewing context that takes precedence over the surrounding galaxy or an active select session.
_Avoid_: Selection, selected movie state

**Select session**:
A person- or genre-scoped exploration context with a stable set of films. It can remain beneath a nested focus and resume when that focus ends.
_Avoid_: Multi-select, search results, selection state

**Nested focus**:
A focus whose film belongs to the current select session. The select session remains the parent context only while that membership holds; focusing a non-member produces a replacing focus.
_Avoid_: Focus with search, preserving selection

**Replacing focus**:
A focus entered from an independent film intent, such as title search, TMDB ID search, or direct navigation. It replaces any existing select session rather than nesting inside it.
_Avoid_: External focus, standalone selection
