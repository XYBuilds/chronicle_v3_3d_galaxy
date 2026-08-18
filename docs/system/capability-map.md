# The Movie Cosmos capability map

## Purpose

This is a current-state index, not a second implementation specification. Each row points to the owning repository and its strongest available evidence. Product/data rows name exactly one current topic owner; cross-repository contracts remain the owner for shared producer/consumer surfaces.

## Product capabilities

| Capability | Status | Owner | Current source of truth | Implementation evidence |
| --- | --- | --- | --- | --- |
| Supported product journeys and public support surfaces | active | Chronicle | [`docs/product/supported-experience.md`](../product/supported-experience.md) | `frontend/src/` routes/HUD chrome; locale and OG contract tests |
| Galaxy browsing and time-depth navigation | active | Chronicle | [`docs/product/galaxy-exploration.md`](../product/galaxy-exploration.md) | `frontend/src/three/`, `frontend/src/store/` |
| Movie focus, selection, and focus-sphere presentation | active | Chronicle | [`docs/product/galaxy-exploration.md`](../product/galaxy-exploration.md) | exploration lifecycle tests; `frontend/src/three/` |
| Title, person, genre, and TMDB ID search plus HUD chrome | active | Chronicle | [`docs/product/search-and-hud.md`](../product/search-and-hud.md) | `frontend/src/components/`, `frontend/src/utils/`, search/locale tests |
| Public routing (`/` idle, `/movie/{tmdbId}` focus) and frontend load/runtime | active | Chronicle | [`docs/frontend/runtime.md`](../frontend/runtime.md) | `frontend/src/`, routing/load tests |
| Sharing and movie OG entry points | active | Chronicle + OG Worker | [`docs/system/og-index-worker-contract.md`](./og-index-worker-contract.md) | Chronicle routes plus Worker `src/index.ts`, `src/html.ts`, and tests |
| HUD localization | active | Chronicle | [`docs/product/search-and-hud.md`](../product/search-and-hud.md) | `frontend/src/lib/locales/en.json`, `frontend/src/lib/strings.ts`, locale schema tests |

## Data and production capabilities

| Capability | Status | Owner | Current source of truth | Implementation evidence |
| --- | --- | --- | --- | --- |
| CSV cleaning and feature engineering | active | Chronicle | [`docs/data/galaxy-model.md`](../data/galaxy-model.md) | `scripts/feature_engineering/`, `scripts/export/` |
| Embedding, multimodal fusion, UMAP, and galaxy export | active | Chronicle | [`docs/data/galaxy-model.md`](../data/galaxy-model.md) | `scripts/`, generated asset validation |
| Daily/Monthly compute and OG Index sync | active | Chronicle | [`docs/data/refresh-and-publication.md`](../data/refresh-and-publication.md) | GitLab `daily_data_release` plus `scripts/publication/` and `scripts/cron/`; Monthly remains disabled while GitLab is temporary primary |
| R2 galaxy/search publication | active | Chronicle | [`docs/data/refresh-and-publication.md`](../data/refresh-and-publication.md) | `scripts/cron/upload_galaxy_r2.py`, manifest fixtures/tests; C-004 in [`planet-export-contract.md`](./planet-export-contract.md) |
| Frontend build and Cloudflare Pages deploy | active | Chronicle | [`docs/data/refresh-and-publication.md`](../data/refresh-and-publication.md) | GitLab Site Release `npm run build` + Data Release compose/Wrangler Direct Upload; runtime host notes in [`docs/frontend/runtime.md`](../frontend/runtime.md) |
| OG Index KV projection | active / maintenance | Chronicle producer + OG Worker consumer | [`docs/system/og-index-worker-contract.md`](./og-index-worker-contract.md) | `scripts/cron/`, Worker `src/kv.ts`, `src/index.ts`, and contract tests |
| Planet image export | active / maintenance | Chronicle producer + Daily consumer | [`planet-export-contract.md`](./planet-export-contract.md) | `tools/planet-exporter/`, Daily adapter |
| Active focus emission profile | active | Chronicle | [`planet-export-contract.md`](./planet-export-contract.md) | `frontend/src/three/focusEmission.ts`; manifest pointer + profile resource tests |
| Release-state, retention, and audited recovery | active | Chronicle | [`docs/data/refresh-and-publication.md`](../data/refresh-and-publication.md) | `scripts/publication/`, `scripts/cron/release_state.py`, `site_artifact.py`, `pages_compose.py`, `publication_hold.py`, `r2_retention.py`, `production_recovery.py`; `scripts/tests/test_p1_publication_control.py`, `test_release_state.py`, `test_site_artifact.py`, `test_pages_compose.py`, `test_r2_retention.py`, `test_production_recovery.py`, `test_release_primitives_contract.py`; `.gitlab-ci.yml` |
| Daily Stargazing editorial pipeline | active | Daily Stargazing | [Daily `CONTEXT.md`](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/main/CONTEXT.md), [Daily SSOT](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/tree/main/docs/SSOT) | Daily repository |

## Retired / maintenance boundaries

| Boundary | Status | Notes |
| --- | --- | --- |
| The Movie Today picker / routes / OG | retired | No active capability; `/today` and `/share/today` follow ordinary invalid-path handling; `/og/today.png` is an unknown `/og/*` path; historical guides remain non-executable |
| GitHub Pages gray / manual-smoke workflow | retired | `.github/workflows/deploy-pages.yml` deleted; Cloudflare Pages is the only site deploy surface |
| Phase 39 production emission curve | historical | Superseded by active monthly `rating-midrank-cdf-lut-v1` profile |
| Phase 39 / 41 / P42.6 diagnostic graphs | retired | Closed HTML entries, evidence generators, and the completed P42.6 harness are removed; current invariants live on frontend/Planet Export tests |
| Runtime HDR window probes | retired | `window.__hdrCapabilities` / `window.__hdrProbe` are not installed; production remains SDR |

## Reconciled boundaries

- The active OG Worker reads only `movie:{id}` and `meta:G`; current movie/brand routes, fallback, and version behavior are captured in [`og-index-worker-contract.md`](./og-index-worker-contract.md). Retired `/today` and `/share/today` follow Chronicle ordinary invalid-path handling; `/og/today.png` is an unknown `/og/*` path.
- Remaining Today references in Phase plans, reports, and explicitly marked historical guides are archival evidence, not an active compatibility path.
- Publication stages (compute, OG sync, R2 upload, site-artifact composition, Pages deploy) succeed or fail independently. Consumers use their last successfully published compatible artifact; there is no global generation barrier.
- Daily/Monthly Data Releases compose the candidate manifest onto the active Site Release artifact. Production Recovery holds or resumes that cadence and records audited rollback plans.

## Update rule

Update this map in the same PR as a new capability, ownership transfer, contract change, retirement, or a correction to a status claim. Do not update it for every implementation detail.
