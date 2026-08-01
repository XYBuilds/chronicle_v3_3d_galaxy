# The Movie Cosmos capability map

## Purpose

This is a current-state index, not a second implementation specification. Each row points to the owning repository and its strongest available evidence. `needs-reconciliation` means the source documents disagree or runtime behavior still needs confirmation.

## Product capabilities

| Capability | Status | Owner | Current source of truth | Implementation evidence |
| --- | --- | --- | --- | --- |
| Galaxy browsing and time-depth navigation | active | Chronicle | `docs/project_docs/TMDB 电影宇宙 PRD.md`, `TMDB 电影宇宙 Design Spec.md` | `frontend/src/three/`, `frontend/src/store/` |
| Movie focus, selection, drawer, and `/movie/{tmdbId}` routing | active | Chronicle | `docs/project_docs/星球状态机 spec.md`, `TMDB 电影宇宙 Tech Spec.md` | `frontend/src/`, Phase 30 history |
| Title, person, genre, and TMDB ID search | active | Chronicle | Phase 43 Plan and related search specs | `frontend/src/components/`, `frontend/src/utils/` |
| Sharing and movie OG entry points | active | Chronicle + OG Worker | Phase 30/34/40 records and current README | Chronicle routes plus Worker runtime |
| HUD localization | active | Chronicle | `frontend/src/lib/locales/en.json` and `frontend/src/lib/strings.ts` | `frontend/src/lib/locales/`, locale schema tests |

## Data and production capabilities

| Capability | Status | Owner | Current source of truth | Implementation evidence |
| --- | --- | --- | --- | --- |
| CSV cleaning and feature engineering | active | Chronicle | `docs/project_docs/TMDB 电影宇宙 Data Pipeline.md` | `scripts/feature_engineering/`, `scripts/export/` |
| Embedding, multimodal fusion, UMAP, and galaxy export | active | Chronicle | Data Pipeline and Tech Spec | `scripts/`, generated asset validation |
| Nightly/monthly refresh and R2/Pages publication | active | Chronicle | Data Pipeline and relevant workflow files | `.github/workflows/`, `scripts/cron/` |
| OG Index KV projection | active / maintenance | Chronicle producer + OG Worker consumer | Phase 38 Plan, Phase 40 retirement record | `scripts/cron/`, Worker `src/kv.ts` |
| Planet image export | active / maintenance | Chronicle producer + Daily consumer | Phase 36 Plan and reports | `tools/planet-exporter/`, Daily adapter |
| Daily Stargazing editorial pipeline | active | Daily Stargazing | [Daily `CONTEXT.md`](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/main/CONTEXT.md), [Daily SSOT](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/tree/main/docs/SSOT) | Daily repository |

## Reconciliation queue

- Verify the active OG Worker consumer behavior for `movie:{id}` and `meta:G` against the current deployed code.
- Confirm whether any remaining `today` references are historical documentation or an active compatibility path.
- Replace broad Phase references with direct links to the strongest current SSOT as each capability is touched.
- Add a capability row only when its owner, status, and evidence can be named.

## Update rule

Update this map in the same PR as a new capability, ownership transfer, contract change, retirement, or a correction to a status claim. Do not update it for every implementation detail.