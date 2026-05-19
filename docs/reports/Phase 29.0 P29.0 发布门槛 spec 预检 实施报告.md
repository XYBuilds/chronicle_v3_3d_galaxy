# Phase 29.0 / P29.0 发布门槛 spec 预检 实施报告

## 1. 任务目标

建立 Phase 29 的文档 SSOT，并在不改动前端代码的前提下，将 HDR 发布门槛语义、深链路由契约与静态托管 rewrite 预检结论写入项目 spec，供 29.1–29.7 与 Phase 30/33 引用。

对应计划：[`.cursor/plans/phase_29_release_gates_technical_decision.plan.md`](../../.cursor/plans/phase_29_release_gates_technical_decision.plan.md) · TODO `p29-spec-preflight`（29.0）。

---

## 2. 关键决策（D1–D9 摘要）

| ID | 决策 |
| :--- | :--- |
| D1 | 真实 HDR = 可证扩展亮度，≠ SDR 提亮 / Bloom |
| D2–D3 | 生产为 `SRGBColorSpace` + SDR WebGL；Bloom 默认关 |
| D4 | Phase 33 仅在 proof 稳定时启动 |
| D5–D7 | 轻量 path parser；`/`、`/movie/:id`、`/today`；保留 `lang`/`theme`/`timeline` query |
| D6 | `selectedMovieId` / `coverModeStore` 为状态 SSOT |
| D8–D9 | SPA fallback 须豁免 `/data/*`、`/fonts/*`；Today 以 `today.json` 为准 |

全文见 [`docs/project_docs/Phase 29 发布门槛与技术判定 spec.md`](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md)。

---

## 3. 实现摘要

| 产出物 | 说明 |
| :--- | :--- |
| **Phase 29 spec（新建）** | SSOT：决策表、现状基线、深链 §5、静态预检 §6、HDR probe/proof/fallback 契约 §7–§9、gate 模板 §10 |
| **Tech Spec §5.4** | Phase 29 交叉引用摘要 |
| **Design Spec §1.3** | HDR / 深链 / 分享现状决策摘要 |
| **Plan YAML** | 新增 `p29-spec-preflight` 并标 `completed` |

**无** `frontend/` 或管线代码变更。

---

## 4. 验证

- 与 `scene.ts`（`SRGBColorSpace`、`postFxBloomEnabled`）、`App.tsx`（无 path 路由）、`public/_headers`（无 rewrite）、仓库内无 `vercel.json` 对照一致。
- 文档-only，未运行 build/typecheck。

---

## 5. 风险与后续

| 项 | 说明 |
| :--- | :--- |
| 深链 404 | 生产尚无 SPA fallback；**Phase 30.7** 须按 spec §6 落地 rewrite |
| HDR 矩阵 / proof | **29.1–29.3** 填 §4、§8 并决定是否进 Phase 33 |
| Gate 结论 | **29.7** 汇总 §10 go/no-go |

---

## 6. 分支

- `docs/p29.0-phase-29-spec-preflight`
