# Phase 30.4 / P30.4 用户动作 URL 同步 实施报告

## 1. 任务目标

收敛所有会改变影片 focus 的用户入口到统一的 store→URL 同步：Three 点击、搜索选片、Drawer 关闭、ESC、FocusExit、Today cover 进入 focus；遵守 Phase 29 spec **B1–B6**（push `/movie/:id`、replace `/`）、**R6–R8**（Today→focus 迁移、Back 不回到已关 drawer）、**R7**（URL↔store 循环守卫）。

对应计划：[`.cursor/plans/phase_30_routing_sharing.plan.md`](../../.cursor/plans/phase_30_routing_sharing.plan.md) · TODO `p30-action-url-sync`（30.4）。

契约 SSOT：[Phase 29 spec](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) **§5.4 方向 B、§5.6–§5.7**。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| 收敛方式 | 新增 `routeActions.ts`；`useRouteController` 订阅 `selectedMovieId`，各入口仍只写 Zustand |
| B1 / B2 | `selectedMovieId` 非 null 且变化 → `history.pushState` `buildMoviePath(id)` |
| B3–B6 | `selectedMovieId` 从有 → 无 → `history.replaceState` `buildHomePath()` |
| B7 / B8 | person/genre select、`clearSearch` 不改 `selectedMovieId` → 不触发 path 变更 |
| R7 | `routeSyncGuard.suppressStoreToUrl` 包裹 URL→store；`isPopstate` 阻止 store→URL push |
| R8 | 清 focus 用 **replace** `/`，非 push |
| 模块拆分 | `routeSyncGuard.ts` 供 30.3/30.4 共用；`replaceRoutePath` 供 R1/R2 程序纠错 |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `frontend/src/lib/routeSyncGuard.ts` | `active` / `isPopstate` / `suppressStoreToUrl` / `lastAppliedPath` |
| `frontend/src/lib/routeActions.ts` | `pushMovieRoute`、`replaceHomeRoute`、`replaceRoutePath` |
| `frontend/src/lib/routeActions.spec.ts` | push/replace 与 guard 单测（3 项） |
| `frontend/src/lib/useRouteController.ts` | URL→store 加 `suppressStoreToUrl`；boot 后 `selectedMovieId` 订阅 → routeActions |

**未改组件文件**：`interaction.ts`、`SearchBar`、`Drawer`、`App` ESC、`FocusExitButton`、`coverModeStore` 继续只改 store，由订阅统一写 URL。

分支：`feat/p30.4-action-url-sync`。

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/lib/routeActions.spec.ts` | **3/3 passed** |
| `npm run test -w frontend -- src/lib/routes.spec.ts` | **11/11 passed**（回归） |
| `npm run build -w frontend` | **通过** |
| 人工 smoke | 用户 **通过**：点片 push、Today→focus push `/movie/:todayId`、关 Drawer/ESC/FocusExit replace `/`、Back/Forward 无二次 push |

---

## 5. 风险与后续

| 风险 | 分流 |
| :--- | :--- |
| 分享仍指向 `/` | **30.5** Drawer 当前影片分享 |
| Drawer 分享 i18n | **30.6** |
| 深链刷新 404 | **30.7** `_redirects` |
| controller 集成/E2E 测试 | **30.8** |

**建议下一任务**：30.5 Drawer 分享迁移至 `/movie/:id`。
