# The Movie Cosmos capability map

## Purpose

This is a current-state index, not a second implementation specification. Each row points to the owning repository and its strongest available evidence. `needs-reconciliation` means the source documents disagree or runtime behavior still needs confirmation.

## Product capabilities

| Capability | Status | Owner | Current source of truth | Implementation evidence |
| --- | --- | --- | --- | --- |
| Galaxy browsing and time-depth navigation | active | Chronicle | `docs/project_docs/TMDB 电影宇宙 PRD.md`, `TMDB 电影宇宙 Design Spec.md` | `frontend/src/three/`, `frontend/src/store/` |
| Movie focus, selection, drawer, and `/movie/{tmdbId}` routing | active | Chronicle | `docs/project_docs/星球状态机 spec.md`, `TMDB 电影宇宙 Tech Spec.md` | `frontend/src/`, Phase 30 history |
| Title, person, genre, and TMDB ID search | active | Chronicle | Phase 43 Plan and related search specs | `frontend/src/components/`, `frontend/src/utils/` |
| Sharing and movie OG entry points | active | Chronicle + OG Worker | [`docs/system/og-index-worker-contract.md`](./og-index-worker-contract.md) | Chronicle routes plus Worker `src/index.ts`, `src/html.ts`, and tests |
| HUD localization | active | Chronicle | `frontend/src/lib/locales/en.json` and `frontend/src/lib/strings.ts` | `frontend/src/lib/locales/`, locale schema tests |

## Data and production capabilities

| Capability | Status | Owner | Current source of truth | Implementation evidence |
| --- | --- | --- | --- | --- |
| CSV cleaning and feature engineering | active | Chronicle | `docs/project_docs/TMDB 电影宇宙 Data Pipeline.md` | `scripts/feature_engineering/`, `scripts/export/` |
| Embedding, multimodal fusion, UMAP, and galaxy export | active | Chronicle | Data Pipeline and Tech Spec | `scripts/`, generated asset validation |
| Nightly/monthly refresh and R2/Pages publication | active | Chronicle | Data Pipeline and relevant workflow files | `.github/workflows/`, `scripts/cron/` |
| OG Index KV projection | active / maintenance | Chronicle producer + OG Worker consumer | [`docs/system/og-index-worker-contract.md`](./og-index-worker-contract.md) | `scripts/cron/`, Worker `src/kv.ts`, `src/index.ts`, and contract tests |
| Planet image export | active / maintenance | Chronicle producer + Daily consumer | Phase 36 Plan and reports | `tools/planet-exporter/`, Daily adapter |
| Daily Stargazing editorial pipeline | active | Daily Stargazing | [Daily `CONTEXT.md`](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/main/CONTEXT.md), [Daily SSOT](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/tree/main/docs/SSOT) | Daily repository |

## Reconciliation queue

- Replace remaining broad Phase references with direct links to the strongest current SSOT as each unrelated capability is touched.
- Add a capability row only when its owner, status, and evidence can be named.

## Reconciled boundaries

- The active OG Worker reads only `movie:{id}` and `meta:G`; its current routes, fallback, version behavior, and retired Today 404 surface are captured in [`og-index-worker-contract.md`](./og-index-worker-contract.md).
- Remaining Today references in Phase plans, reports, and explicitly marked historical guides are archival evidence, not an active compatibility path.

## Update rule

Update this map in the same PR as a new capability, ownership transfer, contract change, retirement, or a correction to a status claim. Do not update it for every implementation detail.