# Phase 30.1 / P30.1 Phase 30 计划与前置确认 实施报告

## 1. 任务目标

创建并维护 Phase 30 计划文件；对照 Phase 29 深链路由契约（§5）与静态 rewrite 预检（§6），确认 30.2–30.8 可执行；修正计划内路径与部署优先级表述。

对应计划：[`.cursor/plans/phase_30_routing_sharing.plan.md`](../../.cursor/plans/phase_30_routing_sharing.plan.md) · TODO `p30-plan-doc-preflight`（30.1）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| Phase 29 → 30 衔接 | **无契约变更**；实施 SSOT 仍为 [Phase 29 spec](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) §5–§6 |
| Phase 30 与 Phase 33 | **无依赖**；HDR production No-go 不阻塞深链 |
| 30.7 部署优先级 | **CF Pages `_redirects` 优先** + GHP `404.html`；非 Vercel 优先 |
| `galaxyAssetUrls` 文档路径 | 计划内更正为 `frontend/src/lib/galaxyAssetUrls.ts` |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `.cursor/plans/phase_30_routing_sharing.plan.md` | 扩充 §30.1：计划状态、Phase 29 检查表、仓库核对、30.2–30.8 约束 |
| §30.7 表述 | CF Pages / GHP 与 spec §6.4–§6.5 对齐 |
| 分支 | `docs/p30.1-plan-preflight` |

**未实施（归属后续 TODO）**：`routes.ts`、route controller、Drawer 分享、`_redirects` / `404.html`、路由测试。

---

## 4. Phase 29 前置确认结果

### 4.1 路由契约（P29.5 / spec §5）

| 检查项 | 状态 |
| :--- | :--- |
| `/` · `/movie/:id` · `/today` | **可执行** |
| R1–R9 · B1–B9 | **已锁定** |
| cover boot 竞态（R4 + `pendingRoute`） | **须在 30.3 实现**（`App.tsx` 现状仍无条件 `setCover`） |

### 4.2 静态 rewrite（P29.6 / spec §6）

| 检查项 | 状态 |
| :--- | :--- |
| CF Pages 隐式 SPA（主域） | **已具备** |
| D8：`/data/*`、fonts、assets 豁免 | **方案已锁定** |
| 显式 `_redirects` | **待 30.7** |
| GHP `404.html` | **待 30.7** |
| `vite preview` 深链验收 | **不可用**（30.8 用 CF / wrangler） |

### 4.3 仓库核对（30.1 执行日）

| 资产 | 现状 |
| :--- | :--- |
| `frontend/src/lib/routes.ts` | 不存在（预期） |
| `frontend/public/_redirects` | 不存在（预期） |
| `ShareMovieTodayButton` | HUD 分享 `/` |
| `Drawer.tsx` 分享区 | 无 |

**Gate 结论**：Phase 30 **可开工**（与 [P29.7 §6](./Phase%2029.7%20P29.7%20Phase%2029%20Gate%20report%20实施报告.md) 一致）。

---

## 5. 验证

| 项 | 结果 |
| :--- | :--- |
| 对照 P29.5 / P29.6 / P29.7 报告与 spec §5–§6 | 一致 |
| 计划 §30.1 检查表与仓库 `grep` / 文件存在性 | 一致 |
| 前端构建 / 测试 | **未跑**（本 TODO 仅文档） |

---

## 6. 风险与后续

| 风险 | 分流 |
| :--- | :--- |
| cover boot 覆盖 `/movie/:id` | **30.3** R4 + `pendingRoute` |
| GHP 深链 404 | **30.7** `404.html` |
| HUD 分享仍指向 `/` | **30.5** Drawer `/movie/:id` |

**建议下一任务**：30.2（`routes.ts` parser/builder）与 30.7（rewrite 配置）可并行规划。
