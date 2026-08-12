# Refresh and publication

> Answers: how Chronicle currently refreshes galaxy data and publishes site/data artifacts—nightly light refresh, monthly galaxy refit, OG projection, R2, and Cloudflare Pages
> Excludes: feature/UMAP math detail, frontend loader internals, Planet Export CLI flag encyclopedias, and accepted-but-not-shipped release-model redesigns
> Update when: workflow schedule/steps, R2/manifest/cache semantics, OG sync ordering, emission-profile publish rules, or host/deploy boundaries change
> Required authorities: [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md); [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md)

## Current answer

Chronicle currently publishes through two scheduled GitHub Actions workflows that still combine compute, projection, object upload, frontend build, and Pages deploy:

| Cadence | Workflow | Responsibility |
| --- | --- | --- |
| Nightly light refresh | `.github/workflows/nightly_vote_refresh.yml` | Frozen thresholds; refresh votes/popularity for current membership; newly eligible titles stay pending; export daily artifacts; incremental OG Index sync; upload `galaxy_data.json.gz` / `galaxy_search_index.json.gz` (and related manifest fields) to R2; build frontend; Cloudflare Pages Direct Upload. Nightly does **not** generate/activate a new emission profile. |
| Monthly galaxy refit | `.github/workflows/monthly_refit.yml` | Recompute thresholds; full DensMAP fit with Procrustes alignment to `galaxy_v1_reference`; admit pending membership; export monthly artifacts; OG sync; R2 upload **with** monthly active emission-profile handling; build frontend; Pages deploy. |

Shared concurrency protects overlapping galaxy/R2/Pages releases. Stages succeed or fail independently: there is no global generation barrier across Supabase, KV, R2, manifest, and Pages. Consumers keep their last successfully published compatible artifact.

Publication shape today:

- Cloudflare Pages hosts the application shell.
- R2 hosts the large gzip galaxy/search objects; manifest pointers on Pages use short TTL while versioned gzip objects remain immutable.
- GitHub Pages is retired and must not be treated as a gray/manual-smoke path.
- OG Index projection (C-002) writes `movie:{id}` and `meta:G`, with checkpoint evidence under `ops/og-index/state-v2.json.gz`. Sync runs before consumer-visible R2/site promotion in the current workflows. Retired Today keys/routes stay reserved and unsupported.
- Planet Export production calls require an explicit `--manifest-url` (C-003/C-004). Active focus emission remains the monthly `rating-midrank-cdf-lut-v1` profile pointed by the live manifest.

## Boundaries and invariants

- Describe only the implemented combined nightly/monthly publication path above.
- Do **not** document separated “Data Release”, “Site Release”, or “Production Recovery” operator surfaces as current—they are accepted for later Issues and are not live yet.
- Do **not** claim ordinary invalid-path handling for `/today`, `/share/today`, or `/og/today.png`; reserved side-effect-free 404 remains the current contract.
- Do not restore scheduled Today generation, `today_url`, or GitHub Pages deploy.
- `meta:G` is an ordered completion marker, not a transactional multi-key snapshot.
- Dimension drift on unknown genre/language fails closed unless an explicit emergency bypass is used.

## Verification evidence

- `.github/workflows/nightly_vote_refresh.yml`, `.github/workflows/monthly_refit.yml`
- `scripts/cron/nightly_vote_refresh.py`, `monthly_refit.py`, `upload_galaxy_r2.py`, `sync_og_index_kv.py`
- [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md) and producer/Worker contract tests
- [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md) and planet-exporter tests
- Capability/publication rows in [`docs/system/capability-map.md`](../system/capability-map.md)

## Related topics

- [`galaxy-model.md`](./galaxy-model.md)
- [`../frontend/runtime.md`](../frontend/runtime.md)
- [`../product/supported-experience.md`](../product/supported-experience.md)
