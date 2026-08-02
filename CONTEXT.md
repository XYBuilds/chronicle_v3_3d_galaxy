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
The historical `/today`, `/og/today.png`, `/share/today`, and `today`-key behavior that is no longer an active product capability. These names are reserved: current routing returns a side-effect-free 404, and reuse requires a new product Initiative plus an explicit contract migration.
_Avoid_: active Today contract, fallback data source

**Ordered completion marker**:
The role of `meta:G` after Chronicle has written and verified the current movie delta. It orders publication but does not create a transactional snapshot across Cloudflare KV keys.
_Avoid_: atomic generation barrier, KV transaction

**Coordinated best-effort cutover**:
A deliberately short cross-repository release window for a breaking OG contract change. Chronicle and the OG Worker are deployed separately, and brief brand fallback or request failure is an accepted risk rather than hidden behind an atomic-release claim.
_Avoid_: atomic deployment, zero-downtime guarantee

## Current documentation model

**Current contract SSOT**:
The single Chronicle-owned document for the cross-repository compatibility rules. The OG Worker README links to it and remains authoritative for Worker-local implementation and deployment instructions.
_Avoid_: duplicated runbook, historical Phase plan