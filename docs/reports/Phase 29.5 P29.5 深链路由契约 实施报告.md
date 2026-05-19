# Phase 29.5 / P29.5 深链路由契约 实施报告

## 1. 任务目标

确定 `/`、`/movie/:id`、`/today` 的 **Phase 30 路由契约**与 **Zustand 状态同步边界**；完成深链预检（无 React Router、无完整产品实现）。

对应计划：[`.cursor/plans/phase_29_release_gates_technical_decision.plan.md`](../../.cursor/plans/phase_29_release_gates_technical_decision.plan.md) · TODO `p29-route-contract`（29.5）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **R1** | 未知 path → `replaceState` 到 `home`（`/` + BASE_URL 前缀） |
| **R2** | 合法整数但不在星系数据 → `replace '/'`，不开 Drawer，仅 `console.warn` |
| **R3** | `/today` 与 `/` 共用 `resolveTodayMovieId`；path 仅作分享/入口语义 |
| **R4** | 冷启动 `/movie/:id` **跳过** cover boot（`setCover`），避免覆盖 `selectedMovieId` |
| **R5** | path 更新 **只改 pathname**，保留全部 query（含未知参数）；**不得**误删 `lang`/`theme`/`timeline` |
| **R6** | Today cover → focus 必须 **push** `/movie/:todayId`（禁止 URL 仍为 `/today` 而已 focus） |
| **R7** | route controller 单轮同步守卫，防 URL↔store 循环 |
| **R8** | 清 focus / 关 Drawer 用 **replace** `/`，避免 Back 回到已关闭的 `/movie/:id` |
| **R9** | person/genre **select** 不占 path；深链 movie focus 不强制 `clearSearch` |

契约 SSOT：[`docs/project_docs/Phase 29 发布门槛与技术判定 spec.md`](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) **§5**。

---

## 3. 现状预检摘要

| 锚点 | 现状 | Phase 30 影响 |
| :--- | :--- | :--- |
| `App.tsx` | 无 path 路由；固定 cover boot 链 | 须 `pendingRoute` + movie 深链跳过 `setCover` |
| `galaxyInteractionStore` | `selectedMovieId` 已驱动 focus/Drawer | B1–B6 写回 URL |
| `coverModeStore` | `setCover` / `exitCoverIntoFocus` | `/today`、`/` 与 B2 迁移 |
| `ShareMovieTodayButton` | 分享 `origin/` | 30.5 改为 `/movie/:id` |
| `localeStore` | `setLocale` 已 `replaceState` 保留 query | 与 route controller 共用 URL |
| `Drawer` | `onOpenChange(false)` 清 `selectedMovieId` | 须挂钩 B3 |
| 全局 ESC | 清 focus 未改 URL | 须挂钩 B4 |

---

## 4. 实现摘要

本 TODO **无运行时代码变更**（符合 Phase 29 范围）。

| 产出物 | 说明 |
| :--- | :--- |
| **Phase 29 spec §5** | 扩充 path/query 契约、URL↔store 表（B1–B9）、boot 序列、ESC/Back 规则、T1–T8 测试矩阵 |
| **Design Spec §1.3** | 增加「深链契约（29.5）」行，区分 29.5 契约 vs Phase 30 实现 |
| **本报告** | 决策 R1–R9 与预检结论 |

建议 Phase 30 模块：`frontend/src/lib/routes.ts`、`frontend/src/lib/useRouteController.ts`（名称可与 plan 30.2–30.3 对齐）。

---

## 5. 验证

| 检查 | 结果 |
| :--- | :--- |
| 与 Phase 30 plan 30.2–30.4 对齐 | **一致**（parser、controller、动作同步） |
| 与 Design Spec §4.6 ESC 栈 | **一致**（Cover ESC 不改 path；focus 清理由 replace `/`） |
| 与 D5–D9 决策 | **一致** |
| 前端 build | **未执行**（本 TODO 无代码） |

---

## 6. 风险与 Phase 30 前置

| 风险 | 缓解 |
| :--- | :--- |
| cover boot 与 `/movie/:id` 竞态 | **R4** + `pendingRoute`（§5.5） |
| `scene.ts` mount 时 cover 假设 | movie 深链须先 `coverMode=false` 再 mount |
| 静态托管深链 404 | **29.6** 已预检；**30.7** 落地显式 `_redirects` + GHP `404.html` |
| Sheet ESC vs App ESC 双路径 | B2/B3 均走 route controller，单写 URL |

**Phase 30 可开工条件**：§5 契约 + §6 rewrite 方案（**29.6 已完成**）。

---

## 7. 已知后续

- **29.6**：已完成 — 见 [Phase 29.6 报告](./Phase%2029.6%20P29.6%20静态部署%20rewrite%20预检%20实施报告.md)
- **29.7**：Gate report 汇总
- **Phase 30**：按 §5.8 矩阵实现并验收 T1–T8
