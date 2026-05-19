# Phase 30.3 / P30.3 App route controller 实施报告

## 1. 任务目标

在 App 层实现轻量 route controller：冷启动与 `popstate` 时将 URL 同步到 Zustand（`selectedMovieId`、`coverMode` / `todayMovieId`）；`galaxyData` ready 前缓存 `pendingRoute`；`/movie/:id` 深链跳过 cover boot（R4）；非法 path（R1）与不在星系 id（R2）用 `replaceState` 纠错。

对应计划：[`.cursor/plans/phase_30_routing_sharing.plan.md`](../../.cursor/plans/phase_30_routing_sharing.plan.md) · TODO `p30-route-controller`（30.3）。

契约 SSOT：[Phase 29 spec](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) **§5.2、§5.4 方向 A、§5.5–§5.6**。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| 模块路径 | `frontend/src/lib/useRouteController.ts`，由 `App.tsx` 调用 |
| 方向 A only | 本 TODO 仅 URL→store；B1–B6 store→URL 归属 **30.4** |
| R4 cover boot | `initialRouteBootKind === 'movie'` 时跳过 `resolveToday → setCover`，直接 `setCoverBootReady` |
| R1 / R2 | `unknown` → `replaceState(buildHomePath)`；合法 id 不在星系 → 同 + 回退 cover boot |
| `popstate` | `coverBootReady` 后监听；`routeSyncGuard.isPopstate` 供 30.4 禁止二次 push |
| R7 | 导出 `routeSyncGuard`（`active` / `lastAppliedPath`），30.4 扩展 |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `frontend/src/lib/useRouteController.ts` | `pendingRoute` 缓存、初始 boot、`applyRouteToStore`、`popstate`、R1/R2 `replaceState` |
| `frontend/src/App.tsx` | `routeReady`、`useRouteController`、`initialRouteBootKind` 门控 cover boot |
| 分支 | `feat/p30.3-route-controller` |

**未实施（归属后续 TODO）**：用户动作 push/replace URL（**30.4**）、Drawer 分享（**30.5**）、route controller 单测（**30.8**）。

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/lib/routes.spec.ts` | **11/11 passed** |
| `npm run build -w frontend` | **通过**（tsc + vite build） |
| `eslint` `useRouteController.ts` | **无新增问题** |
| 人工 smoke（`http://127.0.0.1:4173`） | 用户 **通过**：`/movie/550` 深链 focus、Today/Home cover、R2/R1 纠错、`popstate` 后退 |

---

## 5. 风险与后续

| 风险 | 分流 |
| :--- | :--- |
| 点击/搜索/ESC/Drawer 未改 URL | **30.4** B1–B6 |
| 分享仍指向 `/` | **30.5** |
| 深链刷新 404 | **30.7** `_redirects` |
| 无 controller 自动化测试 | **30.8** |

**建议下一任务**：30.4 用户动作到 URL 同步（`pushState` / `replaceState` + `routeSyncGuard`）。
