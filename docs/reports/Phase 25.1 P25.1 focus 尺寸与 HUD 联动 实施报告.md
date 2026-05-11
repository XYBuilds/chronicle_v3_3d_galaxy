# Phase 25.1 — focus 尺寸与 HUD 联动 实施报告

**范围**：`.cursor/plans/phase_25_core_experience_polish.plan.md` 子项 **P25.1**（Focus 星球视觉尺度 + focus HUD 联动），以及本阶段迭代中在同一分支上收口的相关 UI/标注调整。  
**分支**：`phase25/p251-focus-scale-hud-layout`  
**日期**：2026-05-11  
**状态**：代码已落地；本报告汇总**最终定稿**的产品与技术决策及工程操作。  
**说明**：Tech Spec / Design Spec /《视觉参数总表》等 SSOT 文档的同步留在 **Phase 25.7**；本报告不替代上述文档，仅作实施留档。

---

## 1. 目标（与计划对齐）

1. **Focus Perlin 星球在屏幕上明显更大**：通过缩短轨道相机与 pivot 的物距（`FOCUS_PERLIN_CAMERA_STANDOFF`），在不变更数据管线与 Perlin 几何的前提下放大角直径。
2. **Focus HUD 与星球尺度联动**：OKLab L 参照条（`FocusLReference`）与「退出 focus」按钮（`FocusExitButton`）在视口上的位置随大屏 / 笔电小屏分别收敛，避免与中心星球、抽屉、搜索等区域产生不合理遮挡或「漂太远」。
3. **验收关注点**（计划原文）：星球明显变大但不裁切；rating 参照与 exit 相对星球自然；focus 轨道拖拽稳定；小视口下 HUD 不明显偏远。

---

## 2. 最终决策总表

| 主题 | 决策 |
|------|------|
| Focus 轨道相机半径 | **定稿 `FOCUS_PERLIN_CAMERA_STANDOFF = 0.4`**（`frontend/src/three/camera.ts`）。迭代中曾试用 `1/1.5` 等中间值；最终由产品定稿为 **0.4** world 单位。 |
| 半径语义 | 仍为 Perlin focus 的**绝对**世界距离（不经 `worldSpan` 缩放）；`setFocusOrbitCameraPosition` 默认半径即该常数；cover / focus 轨道路径共用。 |
| L 参照水平定位 | **响应式 `left`**：默认 `max(0.5rem, calc(50vw - 15.5rem))`（小屏更靠视口中心）；`lg`：`max(0.75rem, calc(50vw - 23rem))`；`2xl`：`max(0.75rem, calc(50vw - 26rem))`（大屏为更大角直径的星球让出左侧空间）。 |
| Exit focus 垂直定位 | **定稿**：`top: min(calc(50% + 22rem), calc(100dvh - max(1.5rem, env(safe-area-inset-bottom, 0px)) - 4rem))`；`lg+` 将 `22rem` 换为 **`24rem`**，兼顾大屏星球占位与短视口 / Home Indicator 上限。 |
| vote 档位标注（Canvas Sprite）— 字族与字重 | 与 HUD 评分数字一致：**`Geist Variable` 优先**（与 `frontend/src/index.css` `@theme` `--font-sans` 一致），**字重 600**（对应 `FocusLReference` 的 `font-semibold`）。 |
| vote 档位标注 — 世界「字号」单旋钮 | **仅导出 `LABEL_TEXT_WORLD_HEIGHT`** 作为对外可调的世界空间垂直边长（Sprite `scale.y`）；与 `max(·, r * 0.06)` 取大，避免极小环上标签糊成一团。 |
| vote 档位标注 — 纹理内字号 | **不单独对外导出**：由内部 `LABEL_TEX_H` 与固定比例 `LABEL_TEX_FONT_FILL = 18/112` 派生 `ctx.font` 像素（等价历史 **18px @ 112px** 纹理高度比例），仅服务贴图清晰度与字形在贴图内的垂直占比，**不与世界尺寸二次博弈**。 |
| vote 档位标注 — 锚点 | `sprite.center = (0.5, 0.5)`；`sprite.position` 置于环面局部 XY 上 `radialDist = r + stroke/2 + LABEL_OUTSIDE_GAP_WORLD`（**当前仓库** `LABEL_OUTSIDE_GAP_WORLD = 0.003`）。 |
| 计划看板 | `.cursor/plans/phase_25_core_experience_polish.plan.md` 中 **P25.1 todo** 已标为 **completed**。 |

---

## 3. 工程操作（修改路径一览）

| 路径 | 操作摘要 |
|------|-----------|
| `frontend/src/three/camera.ts` | `FOCUS_PERLIN_CAMERA_STANDOFF` 定稿为 **0.4**；注释标明 P25.1 production standoff。 |
| `frontend/src/hud/FocusLReference.tsx` | P25.1 响应式 `left` 三档（默认 / `lg` / `2xl`）；文件头注释说明与更大 focus 星球联动。 |
| `frontend/src/hud/FocusExitButton.tsx` | P25.1 垂直偏移定稿（`22rem` / `lg` 为 `24rem`）+ safe-area / 短视口 `min` 上限；注释同步。 |
| `frontend/src/three/FocusSizeReferenceRings.ts` | （1）vote  tier 标签 Canvas：**Geist + 600**、描边线宽随 `fontPx` 比例；（2）**重构**：移除对外双旋钮（原 `LABEL_CANVAS_FONT_PX` + `LABEL_SPRITE_WORLD_HEIGHT`），改为 **`LABEL_TEXT_WORLD_HEIGHT` + 内部纹理比例**；文件头中文注释说明锚点与单旋钮语义。 |
| `.cursor/plans/phase_25_core_experience_polish.plan.md` | P25.1 子任务状态更新为 **completed**（若后续计划文件另有改动，以仓库为准）。 |

**未在本报告期强制完成的项（按 Phase 25 总计划）**

- **P25.7**：Tech Spec、Design Spec、《视觉参数总表》中与 `FOCUS_PERLIN_CAMERA_STANDOFF`、focus HUD 偏移、vote 参照标注相关的条文仍以旧数值描述者为**待同步**；本实施报告为中间事实来源之一。

---

## 4. 关键常量速查（以仓库当前代码为准）

| 符号 / 位置 | 当前值 |
|---------------|--------|
| `FOCUS_PERLIN_CAMERA_STANDOFF` | `0.4` |
| `LABEL_TEXT_WORLD_HEIGHT` | `0.02` |
| `LABEL_OUTSIDE_GAP_WORLD` | `0.003` |
| `LABEL_CANVAS_FONT_WEIGHT` | `600` |
| `LABEL_TEX_W` × `LABEL_TEX_H` | `720` × `112`（内部） |
| `LABEL_TEX_FONT_FILL` | `18/112`（内部） |

---

## 5. 验收与回归

| 项 | 结果 / 说明 |
|----|----------------|
| 单元测试 | `frontend` 下 **`npx vitest run`**（含 `locales.schema.spec.ts` 等）在报告撰写时 **12 files / 97 tests 通过**。 |
| 手工建议 | focus 进入后确认：星球裁切与 near 平面、orbit 拖拽、`FocusLReference` / `FocusExitButton` 与 drawer、搜索的相对关系；多语言 tier 文案刷新后 Sprite 纹理是否正常。 |

---

## 6. Git 提交线索（便于审计）

本阶段相关改动分布在分支 `phase25/p251-focus-scale-hud-layout` 上多笔提交，主题包含但不限于：`FOCUS_PERLIN_CAMERA_STANDOFF` 定稿、`FocusExitButton` 垂直定稿、vote tier 标签字体与 **单世界旋钮** 重构等。精确哈希以 `git log --oneline frontend/src/three/camera.ts frontend/src/hud/FocusLReference.tsx frontend/src/hud/FocusExitButton.tsx frontend/src/three/FocusSizeReferenceRings.ts` 为准。

---

## 7. 后续建议

1. **P25.7**：将《视觉参数总表》中 Perlin 焦点相机一行由历史 `movie.z - 1` / `=1` 更新为 **定稿 0.4**；并同步 focus HUD 与 vote 参照标注的**工程定稿**描述（含单旋钮 `LABEL_TEXT_WORLD_HEIGHT` 与内部纹理比例说明）。  
2. 若后续继续收紧 `FOCUS_PERLIN_CAMERA_STANDOFF`，建议每次走一遍 **near / Perlin 壳半径** 相容性检查（历史 Phase 11 文档中有 near 与 standoff 相容讨论，可作回归清单参考）。
