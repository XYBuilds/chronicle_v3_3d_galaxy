# Phase 6.2.1 · I4 深度预通（双 Pass）— 实施报告

> 对应 Plan A **P6.2.1**：P6.2 所采用的 **M1**（`depthWrite: true` + `alphaTest`）在背景层 **α 上限 0.55** 的约束下，**仅**能在大约核心范围内稳定写深度；外圈光晕在 `alphaTest` 之外**几乎不参与深度缓冲**，近处点仍难在「核心区」上正确遮挡远处点。本任务改为 **「深度预通 + 半透明颜色通」** 两趟绘制，在不牺牲 `point.frag.glsl` 软边与真 alpha 混合的前提下，为星点**核心**写入可用深度。承接 [Phase 6.2 I4 深度修复 实施报告](Phase%206.2%20I4%20深度修复%20实施报告.md) 的 M1 经验，**撤回** M1 的 `alphaTest` 路径。

## 1. 动机与方案要点

| 项目 | 说明 |
|------|------|
| M1 未根治的原因 | 背景与焦点混合下片元 `a` 有上限；`alphaTest` 裁边后，仅极小核心圆盘写深度，光晕不参与，远处星仍可「穿透」近处亮区核心。 |
| P6.2.1 方案 B | **Pass 1**（深度）：`colorWrite: false`，`depthWrite: true`，`transparent: false`；新片元 `point.depth.frag.glsl` 在 **与主片元相同** 的 `r`（`gl_PointCoord`）上，**仅当** `r ≤ uDepthPrepassRadius` 时写深度，否则 `discard`。 **Pass 2**（颜色）：`transparent: true`，`depthWrite: false`；**不再使用** `alphaTest`，`point.frag.glsl` 保持原软边与 Bloom 友好输出。 |
| 几何与调用 | 两趟 **`THREE.Points` 共享同一份** `BufferGeometry`；**顶点着色器**仍为 `point.vert.glsl`（`uZCurrent` / `uZVisWindow` / `uBgPointSizePx` 等在两材质间 **共享 uniform 引用**，避免双份更新）。 |
| 场景与交互 | `scene` 中 **先** `add(depthPoints)` **后** `add(points)`；Pass 1 设 **`renderOrder = -1`**；**`depthPoints.raycast = () => {}`**，拾取与 hover 仍只绑定**颜色**那套 `points`，避免命中数翻倍。 |
| 选择动效 | 深度片元中拷贝 **`uPointsOpacity` 引用**；`uPointsOpacity < 0.001` 时 **discard**，避免点阵淡出/隐藏时深度仍挡选中星球。 |
| 调参 | 导出 **`GALAXY_DEPTH_PREPASS_RADIUS`**（默认 `0.65`）；Plan 建议探索区间约 **0.55–0.70**（偏小易穿越、偏大可出现与羽化交界的边缘感，需与 Bloom 目检一起调）。 |

## 2. 文件与代码变更摘要

| 文件 | 变更 |
|------|------|
| `frontend/src/three/shaders/point.depth.frag.glsl` | **新增**：与主片元一致计算 `r`；`r > 1.0` 或 `r > uDepthPrepassRadius` 或 `uPointsOpacity` 过低时 `discard`；`gl_FragColor = vec4(0.0)`（`colorWrite` 关闭，主要为片元存在以写深度）。 |
| `frontend/src/three/shaders/point.frag.glsl` | 本实施 **不强制修改**；软边与 `uPointsOpacity` 逻辑留由 P6.2.1 颜色通使用（后续若单独调光晕，与本报告 P6.2.1 核心变更独立）。 |
| `frontend/src/three/galaxy.ts` | 移除 P6.2 的 **`GALAXY_POINT_ALPHA_TEST` / `alphaTest`**。颜色材质：`depthWrite: false`。新增 `depthMaterial` + `depthPoints`；`GalaxyPointsHandle` 扩展 `depthPoints` / `depthMaterial`；`dispose` 中释放两材质、几何仅释放一次。日志中说明 **2 draw、共享 BufferGeometry**。 |
| `frontend/src/three/scene.ts` | `scene.add(galaxy.depthPoints)` 在 `scene.add(galaxy.points)` **之前**；`dispose` 中先 `remove` `depthPoints` 再 `points`。 |

## 3. 回归与验收（建议仍人工目检）

与 Plan 中 P6.2.1 验收项对齐：

- **①** 近处点相对远处点的 **核心** 遮挡关系与深度直觉一致，无明显「远处球透过近处球核心」。
- **②** 光晕外缘无 **M1 式** 硬边；**Bloom** 无异常黑环（若 `GALAXY_DEPTH_PREPASS_RADIUS` 过大，羽化与深度盘交界处需单独调参）。
- **③** 三层 `vInFocus` / `uZCurrent` / `uZVisWindow` / `uPointsOpacity` 动画与 P5.1.6 行为无逻辑分歧（uniform 共享后应与 P6.2 前**同一套**更新路径）。
- **④** hover / raycast 命中不翻倍；仅对 `galaxy.points` 做交互的既有代码**无需**改 `points` 数组长度。
- 性能：相对单 Pass 多 **1 次** `Points` draw，59K 点量级通常可接受；可对比 DevTools/帧时间作 smoke。

## 4. 分支与提交（参考）

- 工作分支名示例：`**p6-2-1-i4-depth-prepass**`；核心功能提交示例：`61e36d5`（`feat(frontend): I4 depth prepass (P6.2.1) dual pass for point occlusion`）。若之后在同分支有独立 shader 微调提交，以 **P6.2.1 双 Pass 与上述文件** 为准作归档边界。

## 5. 后续

- **P6.3**（I3 hover / threshold）仍独立在 `export_galaxy_json.py` / `interaction.ts` 等。
- 若仅羽化重叠区排序仍不可接受，Plan 已备 **M2**（CPU 重排等）可叠加，见 `phase_6_i1_i3_i4` Plan **I4 · P6.2.1 风险** 与 **M1 残留** 小节的延伸说明。

---

*与 [phase_6_i1_i3_i4 计划](../../.cursor/plans/phase_6_i1_i3_i4_adfb5e1b.plan.md) 中 **P6.2.1**（`p6-2-1-fix-i4-depth-prepass`）对齐 · 2026-04-23*
