# Phase 34.1 / P34.1 Phase 34 计划与 Phase 30 前置确认 实施报告

## 1. 任务目标

维护 Phase 34 计划文件；对照 Phase 30 深链契约，确认 `/movie/:id`、`/today`、Drawer 分享 URL 与 `_redirects` 不吞静态/数据路径；给出 **Go/No-Go**，为 34.2 静态 OG 基线审计开门。

对应计划：[`.cursor/plans/phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) · TODO `p34-plan-preflight`（34.1）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| Phase 30 → 34 衔接 | **无路由契约变更**；34.x 在现有 `routes.ts` / route controller 上叠加 OG |
| `?lang=` 分享 URL | **不属 34.1**；明确留待 **34.6** |
| `/og/*` 路由 | **34.5** Worker 同 zone 绑定；34.1 仅确认 Pages `_redirects` **未** SPA-rewrite `/og/` |
| Go/No-Go | **Go** — 可进入 34.2 |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `.cursor/plans/phase_34_social_preview_distribution.plan.md` | 新增 §34.1 前置检查表、Go/No-Go、缺口与验证命令；`p34-plan-preflight` → `completed` |
| `frontend/src/lib/spaRedirects.spec.ts` | 负向断言 `_redirects` 不含 `/og/` |
| 分支 | `feat/p34.1-plan-preflight` |

**未实施（归属后续 TODO）**：KV 索引、Worker `/og/*`、HTML meta 注入、`?lang=` 分享、静态 OG 移除。

---

## 4. Phase 30 前置确认结果

| 检查项 | 期望 | 结果 |
| :--- | :--- | :--- |
| `/movie/:id` 刷新 | focus + Drawer | **Pass** — `routeControllerSync` T1/T2、`runInitialRouteBoot`；`Drawer.tsx` 绑定 `selectedMovieId` |
| `/today` 刷新 | today 体验 | **Pass** — T3：cover + `todayMovieId`，无 focus |
| Drawer 分享 URL | `/movie/:id` | **Pass** — `DrawerMovieShare` → `buildMovieSharePageUrl`；`shareLinks.spec.ts` |
| `_redirects` | 不吞 `/og/*`、assets、fonts、`/data/*` | **Pass** — 仅 `/movie/*`、`/today`；`spaRedirects.spec.ts` |
| Phase 30 计划 | 深链 TODO 完成 | **Pass** — `phase_30_routing_sharing.plan.md` 全部 `completed` |

**Gate 结论**：Phase 34 **可开工**（34.2 静态 OG 基线审计）。

### 已知缺口（不阻塞 34.2）

- 分享 URL 尚未显式 `?lang=`（34.6）。
- `/og/*` 尚无 Worker；34.5 需在 CF 将 Worker 路由置于 SPA fallback 之前。
- 生产深链仍依赖 build 后 `dist/_redirects`（`verify-spa-fallback-dist.mjs`）。

---

## 5. 验证

```bash
cd frontend && npx vitest run \
  src/lib/routeControllerSync.spec.ts \
  src/lib/spaRedirects.spec.ts \
  src/lib/shareLinks.spec.ts \
  src/lib/routes.spec.ts
```

| 项 | 结果 |
| :--- | :--- |
| Vitest（4 files） | **22 passed** |
| 前端 build / lint | **未跑**（本 TODO 为计划 + 前置断言） |

---

## 6. 风险与后续

| 风险 | 分流 |
| :--- | :--- |
| `/movie/:id` crawler 仍见全站 `og-today.png` | **34.2** 基线审计 → **34.5/34.6** Worker meta |
| `_redirects` 未来误加 `/og/*` | `spaRedirects.spec.ts` 回归 |
| 分享无 `?lang=` | **34.6** |

**建议下一任务**：34.2（`render_og_today`、`index.html` meta、vite cache-bust、R2 上传路径审计）。
