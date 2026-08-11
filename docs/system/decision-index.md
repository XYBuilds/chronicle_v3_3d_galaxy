# The Movie Cosmos decision index

## Purpose

This index answers where a decision is recorded. It does not copy the decision text and does not turn historical execution records into current specifications.

## Current Chronicle SSOT

| Topic | Current source |
| --- | --- |
| Product goals and user journey | [`docs/project_docs/TMDB 电影宇宙 PRD.md`](../project_docs/TMDB%20电影宇宙%20PRD.md) |
| System architecture and data schema | [`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) |
| Visual and interaction behavior | [`docs/project_docs/TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) |
| Data cleaning, feature engineering, export, and automation | [`docs/project_docs/TMDB 电影宇宙 Data Pipeline.md`](../project_docs/TMDB%20电影宇宙%20Data%20Pipeline.md) |
| Feature-to-rendering mapping | [`docs/project_docs/TMDB 数据特征工程与 3D 映射总表.md`](../project_docs/TMDB%20数据特征工程与%203D%20映射总表.md) |
| Planet selection and focus state machine | [`docs/project_docs/星球状态机 spec.md`](../project_docs/%E6%98%9F%E7%90%83%E7%8A%B6%E6%80%81%E6%9C%BA%20spec.md) |
| Visual parameter values | [`docs/project_docs/视觉参数总表.md`](../project_docs/%E8%A7%86%E8%A7%89%E5%8F%82%E6%95%B0%E6%80%BB%E8%A1%A8.md) (static defaults); active emission profile via [`planet-export-contract.md`](./planet-export-contract.md) |
| Planet Export / galaxy manifest / active profile | [`planet-export-contract.md`](./planet-export-contract.md) |
| OG Index KV projection | [`og-index-worker-contract.md`](./og-index-worker-contract.md) |

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