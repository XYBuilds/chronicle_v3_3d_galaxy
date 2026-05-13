# Phase 26.4 — SSOT 文档同步（决策记录）

| 项 | 内容 |
| --- | --- |
| Phase | 26 子项 **P26.4** |
| 计划来源 | [`.cursor/plans/phase_26_device_spatial_optimization.plan.md`](../../.cursor/plans/phase_26_device_spatial_optimization.plan.md) §「P26.4 SSOT 文档同步」 |
| 日期 | 2026-05-13 |
| Git 分支 | `phase26-p264-ssot-doc-sync` |
| 报告性质 | **决策与同步清单**：记录本阶段写入 `docs/project_docs/` 的条文；**实现 SSOT** 仍以源码与既有 Tech / Design / 状态机 spec 为准。 |

---

## 1. 同步范围（已写入的文档）

| 文档 | 变更摘要 |
|------|-----------|
| [`docs/project_docs/TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) | **§1** 视觉映射：更新 idle **alpha** 与 **距离-L / Hunt** 分工；新增 **§1.2 Phase 26 决策摘要表**（P26.1 色彩 / P26.2 HUD / P26.3 idle fade）。**§2.1** 增补 **Phase 26.3** 宏观 idle 空间浏览一句。 |
| [`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) | **§1.1** idle 材质：**构造** opaque + **P26.3** RAF 透明路径、默认 **`enabled=1`**、**`window.__galaxyIdleNearFade`**。**§1.5** 拾取表：新增 **Phase 26.3** 行（`computeIdleNearFadeAlpha` 门限、exempt、`syncCameraWorldForPick`）。 |
| [`docs/project_docs/视觉参数总表.md`](../project_docs/视觉参数总表.md) | 扫描基线补 **Phase 26.3**；**§2** Idle 材质 / **P26.3** uniform 行 / Idle alpha / P10.2 说明与 **P26.3** 不冲突表述；共享 uniform 列表补 **`uIdleNearFade*`**；**§3** 拾取门限行。 |
| [`docs/project_docs/星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) | **§3.1 idle** 大小/色彩行对齐 **P26.3**；**§3.2 active** 可交互性补 CPU 拾取门限；变更记录表 **2026-05-13** 行。 |

**未改**：`TMDB 电影宇宙 Data Pipeline.md`、`TMDB 电影宇宙 PRD.md`（本阶段无契约变更需求）。

---

## 2. 与 P26.1 / P26.2 / P26.3 实施报告的对齐结论

| 主题 | 写入 SSOT 的结论 |
|------|------------------|
| **跨设备 HDR 矩阵** | **本阶段不**作为发布验收项；Mac 偏色按 **顶点着色器 gamut clamp** 收口；产品为 **SDR WebGL**，**无**显示端 HDR 管线。 |
| **小屏 HUD** | 仍以 **Design Spec §3.0** + **`index.css`** token 为 SSOT；P26.2 报告为工作留档。 |
| **idle 近距 fade 是否 production** | **是**：仓库默认 **`IDLE_NEAR_FADE_DEFAULTS.enabled === 1`**；关闭方式见 **`idleNearFade.ts`** 与 **`window.__galaxyIdleNearFade`**。**性能量化**仍为后续设备矩阵待办（见 P26.3 报告 §5）。 |
| **P22.1 世界 Z 近裁** | 仍为 **`NEAR_CULL_WORLD_Z === 0`** 等价关闭；与 **P26.3** 相机距离 fade **独立**（Tech Spec §1.4.5a 不变）。 |

---

## 3. 后续若回退 P26.3 默认

若产品将 **`enabled` 默认改为 `0`**：须同步 **`idleNearFade.ts`**、**Design Spec §1.2 / §1 / §2.1**、**Tech Spec §1.1 / §1.5**、《视觉参数总表》§2–§3、**星球状态机 spec §3.1–3.2**，并更新 **P26.3** 实施报告 §2 决策表。

---

*本文件为 P26.4 收口记录；条文以 `docs/project_docs/` 当前版本为准。*
