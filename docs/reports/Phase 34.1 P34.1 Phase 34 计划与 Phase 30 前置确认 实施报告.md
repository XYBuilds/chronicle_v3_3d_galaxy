# Phase 34.1 / P34.1 Phase 34 计划与 Phase 30 前置确认 实施报告

## 1. 任务目标

创建并维护 Phase 34 计划文件；确认 Phase 30 深链（`/movie/:id`、`/today`、Drawer 分享、静态 rewrite）已稳定，作为社交预览工作的前置 Gate。

对应计划：[`.cursor/plans/phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) · TODO `p34-plan-doc-preflight`（34.1）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| Phase 30 → 34 衔接 | **Go** — 30.1–30.8 均 completed；34.2+ 可在不破坏深链前提下推进 OG |
| Phase 34 与 Phase 33 | **无依赖** — HDR production 不阻塞社交预览 |
| Movie per-path OG | **不在 34.1 决策** — 静态共用 `index.html` meta 现状记入计划；策略归 34.3/34.5 |
| 生产深链手测 | **未复验** — 与 P30.8 一致，契约由 `_redirects` + `verify-spa-fallback-dist.mjs` 兜底 |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `.cursor/plans/phase_34_social_preview_distribution.plan.md` | 扩充 §34.1.1 计划状态、§34.1.2 Phase 30 前置检查表与后续约束 |
| TODO `p34-plan-doc-preflight` | **completed** |
| 分支 | `feat/p34.1-phase30-preflight` |

**未实施（归属后续 TODO）**：OG 链路审计、today OG 强化、movie OG 策略、平台验证、部署 cache 文档化。

---

## 4. Phase 30 前置确认结果

| 前置条件 | 状态 | 证据 |
| :--- | :--- | :--- |
| `/movie/:id` 刷新 → focus + Drawer | **满足** | `routeControllerSync` T1/R4；`MovieDetailDrawer` ← `selectedMovieId` |
| `/today` 刷新 → today 体验 | **满足** | `routeControllerSync` T3 |
| Drawer 分享 URL 新 tab 可复现 | **满足（单测）** | `shareLinks.spec.ts` · `DrawerMovieShare` + `buildMovieSharePageUrl` |
| rewrite 不吞 `/data/*`、OG | **满足** | `spaRedirects.spec.ts`；`public/_headers` `/data/og-today.png` |

**Gate 结论**：Phase 34 **可开工**（34.2 起）。

---

## 5. 验证

| 项 | 结果 |
| :--- | :--- |
| `vitest run` 子集（routes · routeControllerSync · routeActions · shareLinks · spaRedirects） | **28/28** 通过 |
| `npm run build -w frontend` | 通过；`[spa-fallback-dist] ok` |
| `og-today-image-cache-bust` | build 日志 `v=2026-05-08` |
| CF 生产深链刷新 R1–R8 | **未在本机执行**（继承 P30.8） |

---

## 6. 风险与后续

| 风险 | 缓解 |
| :--- | :--- |
| 仅单测/构建验证，无 E2E 浏览器 | 34.6 平台验证阶段在 CF preview 抽测分享 URL |
| 全站共用 OG meta | 34.3 明确 movie 策略；避免 crawler 误以为 per-movie 卡片 |
| `og-today.png` 可能未提交 `public/` | 34.2 审计 cron 与部署产物路径 |

**下一步**：34.2 审计 `render_og_today.py`、`today.json`、`index.html` meta 与 cache-bust。
