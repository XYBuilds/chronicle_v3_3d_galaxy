# The Movie Cosmos decision index

## Purpose

This index is the only documentation status and navigation layer for current Chronicle concerns. It answers where a decision or current topic lives. It does not copy decision text and does not turn historical execution records into current specifications.

## Current topics

| Topic | Current source |
| --- | --- |
| Supported product experience | [`docs/product/supported-experience.md`](../product/supported-experience.md) |
| Galaxy exploration | [`docs/product/galaxy-exploration.md`](../product/galaxy-exploration.md) |
| Search and HUD | [`docs/product/search-and-hud.md`](../product/search-and-hud.md) |
| Frontend runtime | [`docs/frontend/runtime.md`](../frontend/runtime.md) |
| Galaxy data model | [`docs/data/galaxy-model.md`](../data/galaxy-model.md) |
| Refresh and publication | [`docs/data/refresh-and-publication.md`](../data/refresh-and-publication.md) |

## Contracts and durable decisions

| Topic | Current source |
| --- | --- |
| Planet Export / galaxy manifest / active profile | [`planet-export-contract.md`](./planet-export-contract.md) |
| OG Index KV projection | [`og-index-worker-contract.md`](./og-index-worker-contract.md) |
| Focus / select lifecycle rationale | [`docs/adr/0001-focus-select-lifecycle.md`](../adr/0001-focus-select-lifecycle.md) |
| Shared terminology | [`CONTEXT.md`](../../CONTEXT.md) |

## Supporting references (not authority)

| Topic | Reference |
| --- | --- |
| Feature-to-rendering quick lookup | [`docs/project_docs/TMDB 数据特征工程与 3D 映射总表.md`](../project_docs/TMDB%20数据特征工程与%203D%20映射总表.md) — semantics defer to data/exploration topics; exact mappings defer to schema/source |
| Visual parameter quick lookup | [`docs/project_docs/视觉参数总表.md`](../project_docs/%E8%A7%86%E8%A7%89%E5%8F%82%E6%95%B0%E6%80%BB%E8%A1%A8.md) — behavior defers to exploration/search topics; exact defaults and active profile defer to source and C-004 |

Stable historical paths under `docs/project_docs/` for the former PRD, Tech Spec, Design Spec, planet state-machine spec, and Data Pipeline remain as thin, non-authoritative one-hop pointers while archive references still cite them.

## High-value historical records

| Area | Plan | Report / evidence |
| --- | --- | --- |
| Social preview and OG Worker integration | [`phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) | `docs/reports/Phase 34.*` |
| Planet Export and Daily integration | [`phase_36_planet_export.plan.md`](../../.cursor/plans/phase_36_planet_export.plan.md) | `docs/reports/Phase 36.*`, especially the cross-repository acceptance report |
| OG Index KV incremental synchronization | [`phase_38_og_index_kv_incremental_sync.plan.md`](../../.cursor/plans/phase_38_og_index_kv_incremental_sync.plan.md) | [`Phase 38 P38 KV 增量同步与配额保护 实施报告.md`](../reports/Phase%2038%20P38%20KV%20增量同步与配额保护%20实施报告.md) |
| Retirement of Today path | [`phase_40_movie_today_retirement.plan.md`](../../.cursor/plans/phase_40_movie_today_retirement.plan.md) | `docs/reports/Phase 40.*` |
| TMDB ID search | [`phase_43_tmdb_id_search_and_suggestions.plan.md`](../../.cursor/plans/phase_43_tmdb_id_search_and_suggestions.plan.md) | Phase-specific evidence where present; do not infer missing evidence |

## External domain decisions

Daily Stargazing owns its editorial terminology and ADRs. Start from its [CONTEXT.md](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/main/CONTEXT.md) and [ADR directory](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/tree/main/docs/adr). The OG Worker owns its Cloudflare runtime decisions in its own repository.

## Decision lifecycle

- An accepted ADR is an immutable record of a decision at a point in time.
- A later decision creates a new ADR that explicitly supersedes the old one.
- A Plan or Issue tracks active work; after completion it becomes historical evidence.
- A Report records results that are useful beyond the PR; it is not the current design source by default.
- When a capability changes, update this index and `capability-map.md` in the same documentation PR.
- Current topics describe implemented state only. Accepted-but-not-live behavior waits for its implementing Issue and production acceptance.
