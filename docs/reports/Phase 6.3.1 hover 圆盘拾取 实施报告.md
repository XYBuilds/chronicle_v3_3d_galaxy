# Phase 6.3.1 · P6.3.1 I3 hover 圆盘拾取 — 实施报告

> 对应 Plan A **P6.3.1**，取代 P6.3 的 `Raycaster.params.Points.threshold` ×  slab 密度方案。根因：世界空间柱半径与片元里 **屏幕** `gl_PointSize` 圆盘维度不一致，只能「太松 / 太紧」二选一。

## 1. 实现摘要

| 项目 | 说明 |
|------|------|
| **拾取** | 仅遍历 **Z 焦点 slab** 内影片；对每个候选计算与 `point.vert.glsl` 同构的 **CSS 半径** `computePointScreenRadiusCss`，以 `(mouse - 投影中心)² ≤ r²` 判定；命中多颗时取 **front-most**（`distCam` 最小）。 |
| **Shader 耦合** | 半径公式见 `frontend/src/three/interaction.ts` 文件头与 `computePointScreenRadiusCss`；改 `point.vert.glsl` 中 `gl_PointSize` 时必须同步改此函数。 |
| **运行时** | 从 `ShaderMaterial` **uniforms** 读取 `uSizeScale` / `uFocusSizeMul`（与 `window.__galaxyPointScale` 一致时即时生效）。 |
| **移除** | `computeFocusSlabPointsThreshold`、`countMoviesInFocusSlab`、`syncPickThreshold`、**Raycaster** 整条 `intersectObject(points)` 链。 |
| **调用** | `mountGalaxyScene` 向 `attachGalaxyPointsInteraction` 传入 `material: galaxy.material`。 |

## 2. 验收

- 悬停 / 点击仅在**视觉圆盘**内；背景 slab 不可拾（与 Phase 5.1.7 一致，遍历层已排除）。
- 同像素多颗星取最近（深度意义上一致）。

## 3. 相关

- 调查与上一版： [Phase 6.3 P6.3 I3 hover 拾取阈值 实施报告.md](Phase%206.3%20P6.3%20I3%20hover%20%E6%8B%BE%E5%8F%96%E9%98%88%E5%80%BC%20%E5%AE%9E%E6%96%BD%E6%8A%A5%E5%91%8A.md)（已打 supersede 标）
- 代码：`frontend/src/three/interaction.ts`, `frontend/src/three/shaders/point.vert.glsl`
