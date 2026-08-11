# The Movie Cosmos capability map

## Purpose

This is a current-state index, not a second implementation specification. Each row points to the owning repository and its strongest available evidence.

## Product capabilities

| Capability | Status | Owner | Current source of truth | Implementation evidence |
| --- | --- | --- | --- | --- |
| Galaxy browsing and time-depth navigation | active | Chronicle | `docs/project_docs/TMDB 电影宇宙 PRD.md`, `TMDB 电影宇宙 Design Spec.md` | `frontend/src/three/`, `frontend/src/store/` |
| Movie focus, selection, drawer, and `/movie/{tmdbId}` routing | active | Chronicle | `docs/project_docs/星球状态机 spec.md`, `TMDB 电影宇宙 Tech Spec.md` | `frontend/src/`, exploration lifecycle tests |
| Title, person, genre, and TMDB ID search | active | Chronicle | Tech Spec §4.5 / search index schema; Design Spec search HUD | `frontend/src/components/`, `frontend/src/utils/`, search/locale tests |
| Sharing and movie OG entry points | active | Chronicle + OG Worker | [`docs/system/og-index-worker-contract.md`](./og-index-worker-contract.md) | Chronicle routes plus Worker `src/index.ts`, `src/html.ts`, and tests |
| HUD localization | active | Chronicle | `frontend/src/lib/locales/en.json` and `frontend/src/lib/strings.ts` | `frontend/src/lib/locales/`, locale schema tests |

## Data and production capabilities

| Capability | Status | Owner | Current source of truth | Implementation evidence |
| --- | --- | --- | --- | --- |
| CSV cleaning and feature engineering | active | Chronicle | `docs/project_docs/TMDB 电影宇宙 Data Pipeline.md` | `scripts/feature_engineering/`, `scripts/export/` |
| Embedding, multimodal fusion, UMAP, and galaxy export | active | Chronicle | Data Pipeline and Tech Spec | `scripts/`, generated asset validation |
| Nightly/monthly compute and OG Index sync | active | Chronicle | Data Pipeline; independently evidenced workflow stages | `.github/workflows/nightly_vote_refresh.yml`, `monthly_refit.yml`, `scripts/cron/` |
| R2 galaxy/search publication | active | Chronicle | Data Pipeline §12; [`planet-export-contract.md`](./planet-export-contract.md) C-004 | `scripts/cron/upload_galaxy_r2.py`, manifest fixtures/tests |
| Frontend build and Cloudflare Pages deploy | active | Chronicle | Data Pipeline §12; Tech Spec §5.2 | nightly/monthly `npm run build` + `wrangler pages deploy` |
| OG Index KV projection | active / maintenance | Chronicle producer + OG Worker consumer | [`docs/system/og-index-worker-contract.md`](./og-index-worker-contract.md) | `scripts/cron/`, Worker `src/kv.ts`, `src/index.ts`, and contract tests |
| Planet image export | active / maintenance | Chronicle producer + Daily consumer | [`planet-export-contract.md`](./planet-export-contract.md) | `tools/planet-exporter/`, Daily adapter |
| Active focus emission profile | active | Chronicle | [`planet-export-contract.md`](./planet-export-contract.md); `frontend/src/three/focusEmission.ts` | manifest pointer + profile resource tests |
| Daily Stargazing editorial pipeline | active | Daily Stargazing | [Daily `CONTEXT.md`](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/main/CONTEXT.md), [Daily SSOT](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/tree/main/docs/SSOT) | Daily repository |

## Retired / maintenance boundaries

| Boundary | Status | Notes |
| --- | --- | --- |
| The Movie Today picker / routes / OG | retired | Keep 404; historical guides remain non-executable |
| GitHub Pages gray / manual-smoke workflow | retired | `.github/workflows/deploy-pages.yml` deleted; Cloudflare Pages is the only site deploy surface |
| Phase 39 production emission curve | historical | Superseded by active monthly `rating-midrank-cdf-lut-v1` profile |

## Reconciled boundaries

- The active OG Worker reads only `movie:{id}` and `meta:G`; its current routes, fallback, version behavior, and retired Today 404 surface are captured in [`og-index-worker-contract.md`](./og-index-worker-contract.md).
- Remaining Today references in Phase plans, reports, and explicitly marked historical guides are archival evidence, not an active compatibility path.
- Publication stages (compute, OG sync, R2 upload, frontend build, Pages deploy) succeed or fail independently. Consumers use their last successfully published compatible artifact; there is no global generation barrier.

## Update rule

Update this map in the same PR as a new capability, ownership transfer, contract change, retirement, or a correction to a status claim. Do not update it for every implementation detail.
