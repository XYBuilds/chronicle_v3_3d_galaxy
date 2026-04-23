# Phase 6.3 · P6.3 I3 hover 拾取阈值 — 实施报告

> 对应 Plan A **P6.3**（I3：悬停 / 拾取与视觉锚点不一致）。依据 [Phase 6.1 I3+I4 根因调查 报告](Phase%206.1%20I3%2bI4%20%E6%A0%B9%E5%9B%A0%E8%B0%83%E6%9F%A5%20%E6%8A%A5%E5%91%8A.md)：Path 1（`meta.xy_range` 与坐标脱节）对当前主数据**不成立**；Path 2（按「Z 均匀」估 slab 人数导致 `Raycaster.params.Points.threshold` **偏大**）成立。本轮仅走 **Path 2**，改动集中在 `frontend/src/three/interaction.ts`。

## 1. 代码变更摘要

| 项目 | 说明 |
|------|------|
| **Slab 人数** | 新增 `countMoviesInFocusSlab()`，对当前 `[zCurrent, zCurrent + zVisWindow]` 内影片做线性计数，将该计数作为 `computeFocusSlabPointsThreshold` 中的 `nSlab`，替代原先的 `movieCount × zVisWindow / z_span` 全局近似。 |
| **阈值同步时机** | `syncPickThreshold` 的缓存键从「仅 `zVisWindow`」改为 **`zCurrent` + `zVisWindow`**；滚轮/时间轴改变 `zCurrent` 时会重算阈值（此前年份变化但窗口宽度不变时阈值不更新）。 |
| **诊断日志** | 移除 attach / threshold / hover / select / detach 等 `console.log`；保留 `console.assert` 用于开发期契约检查。 |
| **Git** | 分支 `phase-6-3-i3-hover-threshold`，提交信息示例：`fix(interaction): P6.3 hover pick threshold uses actual Z-slab count`。 |

未改 `scripts/export/export_galaxy_json.py`（Path 1 已排除）；未引入每帧 kNN 或「屏幕像素半径 → 世界单位」等更重逻辑。

## 2. 行为与验收（相对 P6.1 结论）

- **预期**：高密度发行年 slab 内，`nSlab` 接近真实点数后，`avgXYSpacing` 与 `threshold` 下降，Raycaster 在星团内误拾**相邻**星的概率应较 P6.1 报告中的全局公式明显改善。
- **构建**：`frontend` 下 `npm run build`（`tsc -b && vite build`）已通过。

## 3. 已知局限与后续（用户备注）

**当下每个星球的可交互面积仍然偏大**：鼠标尚未与画面上「星球圆盘」视觉重叠时，仍可能触发悬停 / 拾取。这与 Three.js `Points` 的射线检测使用 **世界空间阈值**（与片元里 `gl_PointSize` 圆盘在屏幕上的像素覆盖并非同一几何）有关；本轮只修正了阈值与 **Z  slab 密度** 的统计方式，**未**把阈值收紧到与屏幕像素圆盘 1:1 对齐。

**需要未来再调整**：可选方向包括（但不限于）按相机距离与 `gl_PointSize` 反推世界空间等效半径、降低 `0.75` 系数、或在 polish 阶段评估 InstancedMesh / 自定义拾取以贴合视觉圆盘。

## 4. 相关文档与代码

- 调查：[Phase 6.1 I3+I4 根因调查 报告.md](Phase%206.1%20I3%2bI4%20%E6%A0%B9%E5%9B%A0%E8%B0%83%E6%9F%A5%20%E6%8A%A5%E5%91%8A.md)
- 实现：`frontend/src/three/interaction.ts`
- Plan：`.cursor/plans/phase_6_i1_i3_i4_adfb5e1b.plan.md` · todo `p6-3-fix-i3` → **completed**

---

*与 Phase 6 Plan A P6.3 对齐 · 2026-04-23*
