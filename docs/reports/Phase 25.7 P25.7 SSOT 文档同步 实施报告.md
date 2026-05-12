# Phase 25.7 — SSOT 文档同步 实施报告

**范围**：`.cursor/plans/phase_25_core_experience_polish.plan.md` 子项 **P25.7**（在 P25.1–P25.6 行为与契约稳定后，收口 Tech / Design / 视觉速查表 / Data Pipeline / 状态机 spec 与 Phase 25 子报告交叉引用）。  
**分支**：`phase25/p25-7-ssot-doc-sync`  
**日期**：2026-05-12  
**状态**：**已完成**

---

## 1. 同步清单（文件 → 要点）

| 文档 | 更新要点 |
|------|----------|
| **`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`** | **§1.1**：区分 **`uFocusCameraBlend`**（相机）与 **`uFocusActiveDimBlend`**（非目标 active alpha，**P25.3** focus 内换星保持 dim）；**P11.2** 默认乘子更正为 **`1` / `1`**（与 Phase 17 定稿一致）。**§1.4.1**：新增 **Phase 25.2** focus 下 Timeline **只读**、无障碍 **`img` / 非 slider`** 契约。 |
| **`docs/project_docs/TMDB 电影宇宙 Design Spec.md`** | **§2.1**：`uActiveSizeMul` 初值与 Tech / 源码对齐为 **`0.01`**。**§2.2**：Drawer 动效、层级与 **Phase 25.6** 一致。**§3.1**：宏观 Timeline 交互已落地 + **focus 被动**说明。**§3.3 / §3.4.1**：退出 focus 文案 **`View cosmos`**（`STRINGS.hud.exitFocus`）；Cast **无序号**、**1/2/3 列**栅格、全量列表与可滚动区。 |
| **`docs/project_docs/视觉参数总表.md`** | **扫描基线**纳入 **Phase 25**；**§1** `FOCUS_PERLIN_CAMERA_STANDOFF` 更正为 **`0.4`**；**§2** 增补 **`uFocusActiveDimBlend`** 行与共享 uniform 列表；**§7c** 增补 **Timeline focus 被动** 与 **Drawer** 速查行。 |
| **`docs/project_docs/星球状态机 spec.md`** | **§3.2.1** 路径 B 备注与 **§3.4.3** 全文：以 **`uFocusActiveDimBlend`** 为 dim 驱动，**`uFocusCameraBlend`** 主司相机；**P25.3** retarget 语义与 `scene.ts` / `galaxyActive.vert.glsl` 对齐。 |
| **`docs/project_docs/TMDB 电影宇宙 Data Pipeline.md`** | **§3.1 Phase 2.5**：cast **全量**句补充 **不参与 UMAP**、Drawer 全量展示及 **Phase 25.4** 评估报告链接。 |
| **`docs/project_docs/TMDB 数据特征工程与 3D 映射总表.md`** | **cast** 行已含「全量加入 HUD」；本次未改（与主包策略一致）。 |
| **`.cursor/plans/phase_25_core_experience_polish.plan.md`** | **P25.7** todo 标为 **completed**。 |

---

## 2. Phase 25 子报告索引（实现细节 SSOT 仍优先读源码 + 下列报告）

| 子项 | 报告 |
|------|------|
| P25.1 | [`Phase 25.1 P25.1 focus 尺寸与 HUD 联动 实施报告.md`](./Phase%2025.1%20P25.1%20focus%20尺寸与%20HUD%20联动%20实施报告.md) |
| P25.2 | [`Phase 25.2 P25.2 Focus 被动 Timeline 实施报告.md`](./Phase%2025.2%20P25.2%20Focus%20被动%20Timeline%20实施报告.md) |
| P25.3 | [`Phase 25.3 P25.3 active mesh retarget alpha 实施报告.md`](./Phase%2025.3%20P25.3%20active%20mesh%20retarget%20alpha%20实施报告.md) |
| P25.4 | [`Phase 25.4 P25.4 全量 cast 主包影响评估 实施报告.md`](./Phase%2025.4%20P25.4%20全量%20cast%20主包影响评估%20实施报告.md) |
| P25.5 | [`Phase 25.5 P25.5 Drawer cast 与全量 cast 导出 实施报告.md`](./Phase%2025.5%20P25.5%20Drawer%20cast%20与全量%20cast%20导出%20实施报告.md) |
| P25.6 | [`Phase 25.6 P25.6 Drawer 层级动画与 View cosmos 文案 实施报告.md`](./Phase%2025.6%20P25.6%20Drawer%20层级动画与%20View%20cosmos%20文案%20实施报告.md) |

---

## 3. 验收（对照计划 P25.7）

- **cast**：主包 **默认全量**、`--cast-max` 为可选缩包；Tech Spec / Data Pipeline / 映射表与 **P25.4 / P25.5** 报告一致。  
- **focus HUD / Timeline**：文档不再声称 focus 下可操作 Timeline 或沿用「Exit focus」定稿；与 **`Timeline.tsx`**、**`en.json` `hud.exitFocus`** 一致。  
- **相机与 alpha 参数**：**`FOCUS_PERLIN_CAMERA_STANDOFF`**、**`uFocusActiveDimBlend`** 与 **`camera.ts` / `scene.ts` / `galaxyActive.vert.glsl`** 一致。  
- **Drawer**：宽度、cast 栅格、**`z-[110]`**、滑入方向与 **P25.6** 及 **`Drawer.tsx`** 一致。

---

## 4. 备注

- 本任务**仅**更新中文项目文档与计划 frontmatter；未触发 `locales` 多语言同步（`sync-doc` 规则：非用户显式 **sync/i18n** 指令不改其他 locale）。
