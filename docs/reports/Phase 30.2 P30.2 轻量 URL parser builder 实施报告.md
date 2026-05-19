# Phase 30.2 / P30.2 轻量 URL parser / builder 实施报告

## 1. 任务目标

新增纯函数路由模块，覆盖 `/`、`/movie/:id`、`/today` 的解析与 path 构造；更新 path 时完整保留 query（R5）；读写 path 时剥离/前缀 `import.meta.env.BASE_URL`（T7）。不引入 React Router。

对应计划：[`.cursor/plans/phase_30_routing_sharing.plan.md`](../../.cursor/plans/phase_30_routing_sharing.plan.md) · TODO `p30-route-parser`（30.2）。

契约 SSOT：[Phase 29 spec](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) **§5.1–§5.3**。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| 模块路径 | `frontend/src/lib/routes.ts` |
| 非法 `:id` | `parseRoute` → `kind: 'unknown'`（R1 纠错由 30.3 `replaceState('/')` 执行） |
| Query | `build*Path` 原样拼接 `currentSearch`，不删 `lang`/`theme`/`timeline` 或 UTM |
| 子路径 home | `buildHomePath` 在 `BASE_URL=/repo/` 时 pathname 为 `/repo`（无尾斜杠）；`stripAppBasePath` 同时接受 `/repo` 与 `/repo/` |
| 范围 | **仅** parser/builder + 单测；无 App route controller（30.3） |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `frontend/src/lib/routes.ts` | `parseRoute`、`buildMoviePath` / `buildTodayPath` / `buildHomePath`、`stripAppBasePath` / `withAppBasePath`、`parseMovieIdSegment` |
| `frontend/src/lib/routes.spec.ts` | 合法/非法 id、query 保留、子路径 round-trip |
| 分支 | `feat/p30.2-route-parser` |

**未实施（归属后续 TODO）**：`useRouteController`、`pendingRoute`、Drawer 分享、`_redirects`、popstate 集成。

---

## 4. 验证

| 命令 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/lib/routes.spec.ts` | **11/11 passed** |
| `read_lints`（`routes.ts` / `routes.spec.ts`） | **无新增问题** |

---

## 5. 风险与后续

| 风险 | 分流 |
| :--- | :--- |
| `unknown` / 不在星系 id 仅解析层标记 | **30.3** 应用 R1/R2 `replaceState` |
| URL↔store 循环 | **30.3** R7 `syncingRef` |
| 分享仍指向 `/` | **30.5** |

**建议下一任务**：30.3 App 层 route controller（`pendingRoute` + R4 cover boot 跳过）。
