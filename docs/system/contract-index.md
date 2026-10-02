# The Movie Cosmos cross-repository contract index

## Purpose

This index names the boundaries between Chronicle, the OG Worker, and Daily Stargazing. The producer owns the contract definition; each consumer owns its local adapter and compatibility tests. A contract entry is not complete until producer and consumer behavior have both been checked.

## Contract entries

### C-001 · Movie identity and route

- **Status:** active
- **Producer:** Chronicle
- **Consumers:** Chronicle frontend, OG Worker movie routes, Daily Stargazing movie references
- **Identity:** TMDB `id` is the primary movie identity; `/movie/{tmdbId}` is the canonical site route.
- **Evidence:** [`docs/product/supported-experience.md`](../product/supported-experience.md), [`docs/frontend/runtime.md`](../frontend/runtime.md), frontend routing tests.
- **Change rule:** identity or route changes require a cross-repository Initiative and compatibility review.

### C-002 · OG Index KV projection

- **Status:** active / maintenance
- **Producer:** Chronicle `scripts/cron/` projection and sync workflow
- **Consumer:** [themoviecosmos-og-worker](https://github.com/XYBuilds/themoviecosmos-og-worker)
- **Current contract:** [`og-index-worker-contract.md`](./og-index-worker-contract.md)
- **Active keys:** `movie:{id}` and `meta:G`.
- **Retired key and routes:** KV `today` is not an active key. `/today` and `/share/today` have no Worker-specific binding and follow Chronicle ordinary invalid-path handling. `/og/today.png` is an unknown route inside the active `/og/*` Worker namespace. These names remain reserved from product reuse.
- **Projection fields:** required `title`, `release_date`, `genres`, and `poster_url`; see the current contract for types, fallback, generation, checkpoint, HTTP, and release semantics.
- **Evidence:** current producer and Worker source/tests; Phase 38 and Phase 40 records remain historical evidence.
- **Change rule:** classify compatibility against the current contract. Breaking field, key, generation, version, or fallback changes require a coordinated best-effort cutover and producer-first rollback. `meta:G` is an ordered completion marker, not a transactional generation barrier.

### C-003 · Planet Export CLI

- **Status:** active / maintenance
- **Producer:** Chronicle `tools/planet-exporter/`
- **Consumer:** Daily Stargazing planet-render adapter
- **Current contract:** [`planet-export-contract.md`](./planet-export-contract.md)
- **Input:** TMDB movie ID, explicit output/render options, and exactly one release input (`--manifest-url` or `--data-file`).
- **Output:** transparent PNG plus render metadata with data/profile provenance.
- **Evidence:** planet-exporter focused tests; Daily adapter compatibility is owned by the Daily repository Issue.
- **Change rule:** CLI arguments, exit codes, stdout JSON, PNG dimensions, metadata fields, or environment discovery are versioned compatibility surfaces.

### C-004 · Galaxy assets, manifest, and active emission profile

- **Status:** active
- **Producer:** Chronicle data/export pipeline
- **Consumers:** Chronicle frontend and Chronicle planet exporter; Daily consumes through the C-003 adapter's configured release input.
- **Current contract:** [`planet-export-contract.md`](./planet-export-contract.md)
- **Boundary:** versioned manifest and validated galaxy data schema; active emission profile pointer + controlled profile URL; large generated assets are not committed to Git.
- **Evidence:** [`docs/data/galaxy-model.md`](../data/galaxy-model.md), [`docs/data/refresh-and-publication.md`](../data/refresh-and-publication.md), `frontend/src/lib/galaxyAssetUrls.ts`, planet-exporter data-source tests.
- **Change rule:** schema or source URL changes require validation fixtures and consumer smoke tests. No global atomic release protocol; incompatible inputs fail closed.

## Lean release semantics

The [GitHub cutback](../agents/github-cutback.md) preserves C-001 through C-004. Initiative [#401](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/401) owns the cross-repository acceptance and rollout order; Worker [#10](https://github.com/XYBuilds/themoviecosmos-og-worker/pull/10) and Daily [#169](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/pull/169) retain consumer ownership. Code/fixture acceptance does not imply that production publication authority has transferred.

- Do not add a global generation barrier across KV, R2, manifest, shell, and profile commits.
- C-002 keeps its accepted coordinated-best-effort semantics.
- Other consumers use their last successfully published compatible artifact.
- Build/deploy failures are visible operational failures; recover by retry or repository revert.

## Contract change procedure

1. Open or update a parent Initiative in the product-control owner repository.
2. Name producer, consumers, current version, compatibility expectations, and rollback path.
3. Create one implementation Issue in every affected repository.
4. Update this index in the producer-side PR and link consumer PRs.
5. Run producer contract tests and consumer compatibility tests before closing the parent Initiative.
6. If the change is durable and hard to reverse, record a new ADR in the owning repository; do not rewrite an old decision silently.
