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

**Data Release**:
A consumer-identifiable publication of validated galaxy content and its associated compatibility metadata. It is distinct from publishing the application that presents the content.
_Avoid_: site deployment, frontend release

**Site Release**:
A publication of the application shell and interactive client that preserves the selected compatible Data Release.
_Avoid_: data refresh, galaxy publication

## Current documentation model

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
