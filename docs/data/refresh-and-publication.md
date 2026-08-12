# Refresh and publication

> Answers: how Chronicle currently refreshes galaxy data and publishes site/data artifacts—Daily and Monthly Data Releases, Site Release, OG projection, R2, and Cloudflare Pages
> Excludes: feature/UMAP math detail, frontend loader internals, Planet Export CLI flag encyclopedias, and historical combined nightly/monthly build+deploy coupling
> Update when: workflow schedule/steps, R2/manifest/cache semantics, OG sync ordering, emission-profile publish rules, or host/deploy boundaries change
> Required authorities: [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md); [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md)

## Current answer

Chronicle publishes through four operator entry points. Data publication is separate from application-shell builds. There is no global generation barrier across Supabase, KV, R2, manifest, site artifact, and Pages.

| Entry point | Workflow | Trigger | Responsibility |
| --- | --- | --- | --- |
| Daily Data Release | `.github/workflows/nightly_vote_refresh.yml` | `18:00 UTC` daily plus manual rerun | Supabase preflight; Light Refresh; validated export; daily OG projection diff; immutable R2 publication with the active emission profile reused (not generated); compose the candidate manifest onto the active site artifact; Pages promotion; smoke. |
| Monthly Data Release | `.github/workflows/monthly_refit.yml` | `20:00 UTC` on day 1 plus manual rerun | Supabase preflight; Galaxy Refit (thresholds, membership, coordinates, pending admission); emission-profile generation/activation; OG projection; immutable R2 publication; compose the candidate manifest onto the active site artifact; Pages promotion; smoke. |
| Site Release | `.github/workflows/site_release.yml` | accepted merge to `main` plus manual rerun | Build and verify one immutable application-shell artifact without a production manifest; compose it with the current production Data Release; deploy/smoke; then mark the site artifact active. |
| Production Recovery | `.github/workflows/production_recovery.yml` | manual only | Hold/resume Daily and Monthly publication; candidate continuation; Data/Site/profile rollback plans; OG bootstrap/full recovery; dangerous dimension/profile overrides with explicit audit fields. |
| Supabase preflight | `.github/workflows/supabase_preflight.yml` | automatic at Daily/Monthly start and independently dispatchable | Read-only configuration, connectivity, and unique-active-threshold readiness. |

Daily and Monthly share the `galaxy-r2-pages-release` lock with Site Release. Both Data Releases run on day 1; the two-hour offset lets Daily finish first, and the lock prevents overlap. A publication-hold flag set by Production Recovery fails closed at Daily/Monthly start.

Canonical compute distinctions:

- **Light Refresh** updates dynamic facts for current membership and collects pending movies. It does not change membership, coordinates, or the active visual profile.
- **Galaxy Refit** recalculates eligibility/membership/spatial arrangement, admits pending movies, and creates the candidate emission profile.
- Daily validates and reuses the active profile. Normal generation/activation remains Monthly-only. Bootstrap, force activation, rollback, and dimension bypass are audited recovery actions, not normal dispatch inputs.

Data/Site boundary:

- Daily and Monthly do not install Node dependencies or build the frontend.
- Site Release builds without a production manifest and preserves the selected compatible Data Release. The first Site Release after cutover bootstraps the active/previous artifact registry in R2; Daily and Monthly fail closed until that registry exists.
- A Data Release obtains the active verified site artifact, injects the candidate manifest, and deploys Pages. It is not published until the production manifest is readable and smoke passes.
- An active-site-artifact/deployed-site mismatch fails closed so a later data promotion cannot silently downgrade the site.
- Independent success/failure is preserved for Supabase, OG KV, immutable R2/profile objects, site artifact, manifest composition, Pages promotion, and smoke.

OG and last-known-good:

- Daily keeps the OG projection diff. When there is no actual delta, it performs no `movie:*` mutation and does not advance `meta:G` or commit an identical checkpoint.
- A downstream failure does not undo completed mutations. A candidate remains resumable and consumers remain on last-known-good until promotion and smoke pass.

Publication shape:

- Cloudflare Pages hosts the application shell composed with the current production manifest.
- R2 hosts the large gzip galaxy/search objects (`galaxy_data.json.gz`, `galaxy_search_index.json.gz`) and retained site artifacts; manifest pointers on Pages use short TTL while versioned gzip objects remain immutable.
- GitHub Pages is retired and must not be treated as a gray/manual-smoke path.
- OG Index projection (C-002) writes `movie:{id}` and `meta:G`, with checkpoint evidence under `ops/og-index/state-v2.json.gz`. Sync runs before consumer-visible R2/site promotion.
- Planet Export production calls require an explicit `--manifest-url` (C-003/C-004). Active focus emission remains the monthly `rating-midrank-cdf-lut-v1` profile pointed by the live manifest.

## Boundaries and invariants

- Describe the live Daily/Monthly/Site/Recovery entry points above. Do not document the retired combined nightly/monthly frontend-build path as current.
- Dangerous dimension-drift bypass, profile bootstrap/force, OG bootstrap/full recovery, and candidate continuation stay off the normal Daily/Monthly/Site dispatch inputs.
- Direct Cloudflare/Supabase operations and local CLI remain documented emergency fallbacks. The isolated read-only Supabase preflight workflow stays independent.
- Do not restore a Worker-specific Today binding, scheduled Today generation, `today_url`, or GitHub Pages deploy. Retired `/today` and `/share/today` follow ordinary invalid-path handling; `/og/today.png` is an unknown `/og/*` path.
- Do not recreate an active `today` KV key or Today product capability.
- `meta:G` is an ordered completion marker, not a transactional multi-key snapshot.
- Dimension drift on unknown genre/language fails closed unless an explicit emergency bypass is used.

## Verification evidence

- `.github/workflows/nightly_vote_refresh.yml`, `.github/workflows/monthly_refit.yml`, `.github/workflows/site_release.yml`, `.github/workflows/production_recovery.yml`, `.github/workflows/supabase_preflight.yml`
- `scripts/cron/nightly_vote_refresh.py`, `monthly_refit.py`, `upload_galaxy_r2.py`, `sync_og_index_kv.py`
- `scripts/cron/release_state.py`, `site_artifact.py`, `pages_compose.py`, `publication_hold.py`, `site_artifact_store.py`, `production_smoke.py`, `retired_today_route_smoke.py`, `r2_retention.py`, `production_recovery.py` and their `scripts/tests/` suites
- [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md) and producer/Worker contract tests
- [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md) and planet-exporter tests
- Capability/publication rows in [`docs/system/capability-map.md`](../system/capability-map.md)

## Related topics

- [`galaxy-model.md`](./galaxy-model.md)
- [`../frontend/runtime.md`](../frontend/runtime.md)
- [`../product/supported-experience.md`](../product/supported-experience.md)
