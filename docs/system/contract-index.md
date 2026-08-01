# The Movie Cosmos cross-repository contract index

## Purpose

This index names the boundaries between Chronicle, the OG Worker, and Daily Stargazing. The producer owns the contract definition; each consumer owns its local adapter and compatibility tests. A contract entry is not complete until producer and consumer behavior have both been checked.

## Contract entries

### C-001 · Movie identity and route

- **Status:** active
- **Producer:** Chronicle
- **Consumers:** Chronicle frontend, OG Worker movie routes, Daily Stargazing movie references
- **Identity:** TMDB `id` is the primary movie identity; `/movie/{tmdbId}` is the canonical site route.
- **Evidence:** Chronicle Tech Spec, Phase 43 ID search Plan, current README.
- **Change rule:** identity or route changes require a cross-repository Initiative and compatibility review.

### C-002 · OG Index KV projection

- **Status:** active / maintenance
- **Producer:** Chronicle `scripts/cron/` projection and sync workflow
- **Consumer:** [themoviecosmos-og-worker](https://github.com/XYBuilds/themoviecosmos-og-worker)
- **Active keys:** `movie:{id}` and `meta:G`.
- **Historical key:** `today` is retired in the current Chronicle product path; any remaining consumer must be verified before removal or reintroduction.
- **Projection fields:** movie title, release date, genres, and poster URL, subject to the current producer implementation.
- **Evidence:** Phase 38 KV incremental sync Plan, Phase 40 retirement reports, Worker source.
- **Change rule:** projection field, key, hash, generation, or fallback changes require producer/consumer tests and a coordinated deployment order.

### C-003 · Planet Export CLI

- **Status:** active / maintenance
- **Producer:** Chronicle `tools/planet-exporter/`
- **Consumer:** Daily Stargazing planet-render adapter
- **Input:** TMDB movie ID and explicit output/render options.
- **Output:** transparent PNG plus render metadata.
- **Evidence:** Phase 36 Plan and reports, especially the cross-repository acceptance record.
- **Change rule:** CLI arguments, exit codes, stdout JSON, PNG dimensions, metadata fields, or environment discovery are versioned compatibility surfaces.

### C-004 · Galaxy assets and manifest

- **Status:** active
- **Producer:** Chronicle data/export pipeline
- **Consumers:** Chronicle frontend and Chronicle planet exporter; Daily may consume through the C-003 adapter's configured data source.
- **Boundary:** versioned manifest and validated galaxy data schema; large generated assets are not committed to Git.
- **Evidence:** Tech Spec, Data Pipeline, frontend data loader, Phase 36 Plan.
- **Change rule:** schema or source URL changes require validation fixtures and consumer smoke tests.

## Contract change procedure

1. Open or update a parent Initiative in the product-control owner repository.
2. Name producer, consumers, current version, compatibility window, and rollback path.
3. Create one implementation Issue in every affected repository.
4. Update this index in the producer-side PR and link consumer PRs.
5. Run producer contract tests and consumer compatibility tests before closing the parent Initiative.
6. If the change is durable and hard to reverse, record a new ADR in the owning repository; do not rewrite an old decision silently.