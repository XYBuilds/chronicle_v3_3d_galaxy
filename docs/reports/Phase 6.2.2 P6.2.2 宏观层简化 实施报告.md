# Phase 6.2.2 · P6.2.2 宏观层简化 — 实施报告

> 对应 Plan A **[phase_6_i1_i3_i4_adfb5e1b](../../.cursor/plans/phase_6_i1_i3_i4_adfb5e1b.plan.md)** 中的 **P6.2.2（`p6-2-2-macro-simplify`）**。本变更 **取代（supersedes）** P6.2 / P6.2.1 的「半透明 + Bloom + 深度预通双 Pass」路线；原 P6.2、P6.2.1 实施报告正文顶部已加 `**SUPERSEDED by P6.2.2**` 说明。

## 1. 背景与目标

| 项目 | 说明 |
|------|------|
| 动机 | 用户在设计阶段重新评估：halo + HDR emissive + Bloom + 深度预通双 Pass 链路复杂度高，宏观层降级为 **简单不透明圆点** 即可满足当前迭代。 |
| I4 口径变化 | 不再依赖半透明排序与双 Pass 深度；宏观层 **单 Pass、`transparent:false`、`depthWrite:true`**，近远遮挡由深度缓冲自然表达。 |
| 颜色语义 | 由「HDR 亮度 + 流派色」改为在顶点着色器内 **OKLCH 风格编码**：`vote_average → L`（经 `voteNorm`）、流派 palette 在 OKLab 平面上的 **色相 → H**、**固定色度 `uChroma`**；**不修改** Python 导出与 `galaxy_data.json` 字段契约。 |
| 焦点切片 | 保留 Z slab **仅调制 `gl_PointSize`**（`uFocusSizeMul` / `uBgSizeMul`）；焦点内外 **颜色一致**，无宏观层透明度渐变。 |
| 选中动效 | **方案 X**：保留约 600–800ms 的 camera fly-in / fly-out（`easeOutCubic`）；在阶段边界对 **`galaxy.points.visible`** 与 **`planet.mesh.visible`** 做硬切，移除 `uPointsOpacity` 与选中过程中的 shader / planet 透明度 ramp。 |
| Bloom | **默认关闭**；保留 `EffectComposer` + `UnrealBloomPass` 实例，通过 **`window.__bloom.enable()` / `disable()`** 热切换至 `composer.render()` 作为 polish / 对比通道。 |

## 2. 代码与文件变更摘要

| 区域 | 变更 |
|------|------|
| `frontend/src/three/shaders/point.depth.frag.glsl` | **删除**（P6.2.1 深度预通片元着色器不再需要）。 |
| `frontend/src/three/shaders/point.vert.glsl` | 重写：sRGB→linear→**OKLab**（Björn Ottosson 常用矩阵）→由流派 `color` 取 `atan2(b,a)` 得色相 → `L = mix(uLMin,uLMax,voteNorm)`、`a,b = uChroma * (cos,sin)(hue)` → OKLab→linear→**sRGB `vColor`**；`gl_PointSize` 使用 `mix(uBgSizeMul, uFocusSizeMul, inFocus)`，移除 `uBgPointSizePx` 与 `emissive` varying。 |
| `frontend/src/three/shaders/point.frag.glsl` | 重写：仅 **`vColor` + 圆盘 discard + 一行 `smoothstep` 边缘抗锯齿**；无 halo / core / Bloom 相关逻辑。 |
| `frontend/src/three/galaxy.ts` | 移除 `GALAXY_DEPTH_PREPASS_RADIUS`、`depthMaterial` / `depthPoints` 及 `point.depth.frag.glsl` 引用；`GalaxyPointsHandle` 仅保留 `points` + `material`；几何属性 **`emissive` → `voteNorm`**（值为 `clamp(vote_average/10,0,1)`）；材质 **`transparent:false`、`depthWrite:true`**；新增 uniform：`uLMin`、`uLMax`、`uChroma`、`uFocusSizeMul`、`uBgSizeMul`（默认与 Plan 一致：0.4 / 0.85 / 0.15 / 1.0 / 0.4）。 |
| `frontend/src/three/scene.ts` | 移除 `scene.add(depthPoints)` 及 dispose 中的对应清理；**`renderer.outputColorSpace = THREE.SRGBColorSpace`**；默认 **`renderer.render(scene, camera)`**，仅当 `__bloom.enable()` 后为 `composer.render()`；Bloom 初始 **不** `composer.addPass(bloomPass)`；选中逻辑改为 **visible 硬切** + 维持 camera lerp；新增 **`window.__galaxyColor`**（`lMin` / `lMax` / `chroma`）；扩展 **`window.__galaxyPointScale`**（`focusSizeMul` / `bgSizeMul`）；`__bloom` 增加 `enable` / `disable` / `enabled`。 |
| `frontend/src/storybook/GalaxyThreeLayerLab.tsx` / `.stories.tsx` | 控件与 Plan 对齐：去掉 `uBgPointSizePx`，增加 OKLCH 与 size mul、**`postProcessBloom`**；`PointsAndBloom` 故事默认 `postProcessBloom: true` 便于对比 Bloom。 |
| `frontend/src/storybook/fixtures/subsampleMovies.ts` | 注释补充：`voteNorm` 由运行时从 `vote_average` 填充；`emissive` 仍为 JSON 占位说明。 |
| `.cursor/rules/frontend-threejs.mdc` | **Macro layer** / **Post-processing** 两段改写为 P6.2.2 口径。 |
| `docs/reports/Phase 6.2 …` / `Phase 6.2.1 …` | 顶部增加 **SUPERSEDED by P6.2.2** 横幅（归档边界）。 |

**未改 / 保留约定**

- `Movie.emissive` 与 JSON 中的 `emissive` 字段 **保留**（契约镜像）；GPU 宏观层不再使用该属性名。
- `frontend/src/three/planet.ts` 中 **`setOpacity` 保留**（Plan 允许后续 polish 再收敛）；主流程不再依赖其渐变行为，而以 `mesh.visible` + `uAlpha` 在硬切时刻赋值为主。

## 3. 默认调参（与 Plan 一致）

| Uniform / 含义 | 默认值 |
|------------------|--------|
| `uLMin` / `uLMax` | 0.40 / 0.85 |
| `uChroma` | 0.15 |
| `uFocusSizeMul` / `uBgSizeMul` | 1.0 / 0.4 |

运行时可通过 `window.__galaxyColor`、`window.__galaxyPointScale` 调整。

## 4. 验收对照（Plan P6.2.2）

| # | 项 | 说明 |
|---|----|------|
| ① | 单 pass 遮挡 | 宏观层不透明写深度，I4「半透明排序」类问题在默认路径上不再存在。 |
| ② | 焦点内外颜色 | 仅 **尺寸** 随 slab 变化，片元不再读 `vInFocus` 调色。 |
| ③ | 评分 → 明暗 | `voteNorm` 驱动 OKLab `L`，高评分更亮、低评分更暗（可调 `uLMin`/`uLMax`）。 |
| ④ | 飞入飞出 | `SELECT_MS` / `DESELECT_MS` 与原先一致量级；无 `uPointsOpacity` 闪烁。 |
| ⑤ | Hover | 仍为单套 `galaxy.points` 拾取，无第二套 Points。 |
| ⑥ | 性能 | 相对 P6.2.1 减少 Bloom pass 与深度预通 draw（具体帧时间需本机 DevTools 目检）。 |
| ⑦ | Bloom 复活 | `window.__bloom.enable()` 附加 Bloom pass 并切回 composer 渲染链。 |

## 5. 分支与提交（参考）

- 分支示例：`feat/p6-2-2-macro-simplify`
- 提交示例：`feat(frontend): P6.2.2 macro layer simplify (OKLCH, opaque points, Bloom optional)`（以仓库 `git log` 为准）

## 6. 后续（Plan 内其他项）

- **P6.3**（I3 hover / threshold）仍为独立任务。
- **P6.4 / P6.5**：I1 重训与全量回归与本报告无直接代码耦合。

---

*与 `.cursor/plans/phase_6_i1_i3_i4_adfb5e1b.plan.md` **P6.2.2** 对齐 · 2026-04-23*
