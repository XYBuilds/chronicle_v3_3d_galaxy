# Phase 17.4（P17.4）— 文档同步、基线出口与参数定稿 — 实施报告

> **日期**：2026-05-03  
> **范围**：P17.0–P17.3 已落地的实现与 **三份项目 SSOT** + **Phase 8 基线簿** + **《视觉参数总表》** 全文对齐；**不含**新一轮着色器/相机逻辑改动（以当前 `main` 线源码为准）。  
> **计划来源**：`.cursor/plans/phase_17_visual_system_upgrade_e8b64dbb.plan.md` §「P17.4 文档同步 + 回归 + 出口 fps」  
> **Git 分支**：`phase/p17-4-doc-sync`

---

## 1. 定稿参数（代码 SSOT）

下列值与 `frontend/src/three/galaxyMeshes.ts` **`makeSharedUniforms`** 及 `frontend/src/three/camera.ts` **一致**，作为 **P17.4 扫参收口** 登记：

| 项 | 值 | 说明 |
|----|-----|------|
| `uHuntGamma` | **0.3** | Hunt 指数 γ（P17.2 报告 §2.1 / §4 已述扫参结论） |
| `uHuntApplyMask` | **7** | idle + active + Perlin Hunt 全开 |
| `uDistanceLightnessFloor` | **0.5** | 距离-L `pow(d0/d, 2/3)` 下界 clamp |
| `uChroma` | **0.18** | OKLab 色度标量 |
| `uFocusHoveredActiveAlpha` | **0.4** | focus 邻域（`uSelectionMode==2`）hover active 的 alpha 下限抬升 |
| `DOLLY_SPEED_MUL` | **5** | Space dolly 速度系数（与 `zScrollSpeed` 刻度相乘） |
| `nearEase` | **`clamp(prevR/14, 0.22, 1)`** | 强推近时单步缓和（见 P17.3 报告 §3） |
| `zCamDistance`（dolly 路径） | **`[2, 30]`** | 上限 = 默认 standoff，仅允许推近 |

**未实现**：独立 `window.__galaxyInteraction.dollyZoomSpeed` 调试字段（P17.3 报告 §5 已说明）；灵敏度以 `camera.ts` 常量与 `zScrollSpeed` 为准。

---

## 2. 文档变更摘要

| 文档 | 变更 |
|------|------|
| [`星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) | §3.3 补 **GPU hover** 与 focus 邻域分工；§3.4.3 补 **`uHoveredInstanceId` / `uFocusHoveredActiveAlpha`** 数学与 **`uSelectionMode===2`** 限定；§3.4.5 补与 hover uniform 关系及退出时 **`uHoveredInstanceId=-1`**；变更记录 P17.4 |
| [`视觉参数总表.md`](../project_docs/视觉参数总表.md) | §2：`uChroma`、`uHuntGamma`、`uDistanceLightnessFloor` 与源码对齐；新增 **`uHoveredInstanceId`**、**`uFocusHoveredActiveAlpha`** 行；共享 uniform 列表更新；§8 `__galaxyColor` 补 **`focusHoveredActiveAlpha`**；附录改「以源码为准」；§10 指针补 **`## P17 出口`** |
| [`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) | 文首里程碑扩展 + §P8.0.4 补 P17.4；新增 **`## P17 出口`**（三线表留空待本机重录 + 手测回归清单 + 子报告链接） |
| **Tech / Design Spec** | P17.3 批次已对齐 **Space** dolly；本里程碑**无**新增段落需求 |

**既有子报告**（未改写正文，仅在本节索引）：P17.1 / P17.2 / P17.3 实施报告仍在 `docs/reports/`。

---

## 3. 性能（§P8.0.1）与回归

- **Chrome Performance 三线**：与 **§P13 出口** / **§P16 出口** 相同策略——本 Agent 会话**未**代出 DevTools 数值；**`## P17 出口`** 表留 **`待补录`**，由维护者本地填写。  
- **门槛建议**：相对 §P8.0.1（2026-04-27）冻结 fps **±约 10%**；若 idle 因 **depthWrite** 或顶点 **pow** 出现可测回归，优先 Leva / `__galaxyColor` 微调 **γ** 与 **floor**，而非回退 idle alpha。

---

## 4. 验收对照（计划 P17.4 回归清单 → 文档落点）

| 计划条目 | 落点 |
|----------|------|
| 三份 spec + 视觉总表 + §8 | 见 §2 |
| Phase 8 **`## P17 出口`** | 基线簿新增节 |
| γ / mask / floor / dolly 默认值 | §1 + 《视觉参数总表》§2 |
| focus 邻域 hover alpha 与 `uSelectionMode==2` | 《星球状态机 spec》§3.3 / §3.4.3 / §3.4.5 |
| mac/win/chrome/safari 手测 | **`## P17 出口`** §3 清单（需维护者执行） |

---

*本报告为 P17 里程碑收口登记；实现细节仍以源码与 Tech Spec 为 SSOT。*
