# Phase 5.1.7 Raycaster 适配 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.7**（frontmatter 项 **`p5-1-7-raycaster`**）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — 相关 Issue：**T6**（hover/click 触发位置与「仅应对窗内大星球响应」的预期不一致）  
> **报告日期**: 2026-04-18  
> **实施分支**: `phase-5-1-7-raycaster`（自 `main` 新开分支后提交）

---

## 1. 摘要

Phase **5.1.7** 在仍使用 **单 `THREE.Points`** 的前提下，将 **Raycaster 拾取语义**与 **5.1.5 视距窗口**、**5.1.6 点云 A/B 分层**对齐：**只有焦点 slab（层 B）** 中的粒子可以成为 **hover / click** 的目标；`intersectObject` 返回的命中序列中，**Z 落在窗外的一律跳过**。同时，将原先基于 **全数据集 3D 外包盒 + 总粒子数** 估算的 **`Raycaster.params.Points.threshold`**，改为基于 **「当前 Z 窗口宽度」与「发行年跨度」估算 slab 内期望点数**，再在 **UMAP XY 足迹矩形面积** 上推导 **典型平面间距**，用于 world-space 拾取半径。计划在「双 Points 仅对窗内对象 `intersectObject`」列为可选路径，**本次未拆几何体**，以降低改动面。

---

## 2. 背景与目标（对照计划 5.1.7）

| 计划要求 | 实施要点 |
| --- | --- |
| 拾取 **仅对窗口内层（B）** 生效 | `pickIndex` 在 `raycaster.intersectObject(points)` 后 **按命中顺序** 遍历；仅当 `movies[idx].z` 满足 **`zCurrent ≤ z ≤ zCurrent + zVisWindow`** 时返回该索引 |
| 与 shader / store 一致 | **闭区间** slab 与 `point.vert.glsl` 中 `uZCurrent` / `uZVisWindow` 及 `vInFocus` 判定一致；`zCurrent` / `zVisWindow` 来自 **`useGalaxyInteractionStore`** |
| **threshold** 按窗内密度重算 | 新增 **`computeFocusSlabPointsThreshold`**，用 **`nSlab ≈ movieCount × zVisWindow / \|z_range\|`** 与 **`xy_range` 面积** 得 **`avgXYSpacing = sqrt(xyArea / nSlab)`**，再 **`threshold = clamp(0.75 × avgXYSpacing, …)`** |
| 双 Points 方案 | **未实施**；计划允许在 Bloom/分层困难时采用，当前架构仍为单 Points |

---

## 3. 变更文件与职责

| 文件 | 变更说明 |
| --- | --- |
| `frontend/src/three/interaction.ts` | **`computeFocusSlabPointsThreshold`** 替代原 **`computePointsThreshold`**（全库 span / √N）；**`syncPickThreshold`** 在 **`zVisWindow` 变化** 时更新 **`raycaster.params.Points.threshold`** 并打诊断日志；**`pickIndex`** 开头同步 threshold；**`attachGalaxyPointsInteraction`** JSDoc 标明 Phase 5.1.7 行为 |
| `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` | frontmatter 将 **`p5-1-7-raycaster`** 标为 **`completed`** |

**未纳入本子阶段**

- **双 `THREE.Points`**：窗内/窗外分对象拾取（计划备选）。  
- **`zCurrent` 依赖的阈值精细化**：当前 **`nSlab`** 仅随 **`zVisWindow` / `z_span`** 变化，**未**按 **`zCurrent` 滑动重算 slab 内真实计数（假设年份方向大致均匀）；若后续 T6 仍有边缘案例，可再评估按 z 分桶预计算或二分。

---

## 4. 技术细节

### 4.1 Z slab 与命中过滤

- **判定函数**：**`movieInZFocusSlab(z, zCurrent, zVisWindow)`** — `zHi = zCurrent + zVisWindow`，**`z >= zCurrent && z <= zHi`**。  
- **逻辑位置**：**`pickIndex`** 内，在得到 **`hits`** 后循环；**第一个** 同时满足索引合法且 **slab 内** 的命中即作为拾取结果。  
- **与 Three.js 排序的关系**：命中列表按射线距离排序；跳过窗外点后，等价于「**距离射线最近的、且在 B 层内的粒子**」（在 threshold 允许范围内）。

### 4.2 `threshold` 公式（焦点 slab 密度启发式）

在 **`computeFocusSlabPointsThreshold(meta, movieCount, zVisWindow)`** 中：

1. **`zSpan = |z_range[1] - z_range[0]|`**（避免 range 端点顺序依赖，使用 **`Math.abs`**）。  
2. **`nSlab = max(1, movieCount × max(zVisWindow, ε) / max(zSpan, ε))`** — 在 **「发行年在 `z_range` 上近似均匀」** 假设下，宽度为 **`zVisWindow`** 的 slab 内期望点数。  
3. **`xyArea = (x_max - x_min) × (y_max - y_min)`**（来自 **`meta.xy_range`**）。  
4. **`avgXYSpacing = sqrt(xyArea / nSlab)`** — 将 slab 内粒子近似铺在 XY 矩形上的 **平均平面间距**。  
5. **`threshold = clamp(0.75 × avgXYSpacing, xyMin × 1e-4, xyMin × 0.08)`**，其中 **`xyMin = min(x 跨度, y 跨度)`** — 系数 **0.75** 与上下界比例 **延续原实现量级**，便于与旧行为对比调参。

**说明**：`Raycaster` 对 Points 的 **`threshold`** 为 **世界空间** 中射线到点心的最大距离；它与 **片元里 `gl_PointSize` 的屏幕像素大小** 并非同一套度量，因此仍可能出现「极密局部簇」或「非均匀年分布」下的手感偏差；**Z 过滤**保证窗外点 **绝不会** 成为交互目标。

### 4.3 `syncPickThreshold` 与性能

- 使用 **`cachedThresholdZVis`**：仅当 **`zVisWindow`** 与上次不同时重算并 **`console.log`**，避免滚轮只改 **`zCurrent`** 时的重复计算与日志刷屏。  
- **`pickIndex`** 每次仍调用 **`syncPickThreshold()`**：在 **`zVisWindow`** 未变时 **O(1)** 早退。  
- 挂载时 **`attachGalaxyPointsInteraction`** 末尾执行一次 **`syncPickThreshold()`**，保证首帧 threshold 与 store 一致。

### 4.4 验收对照（计划原文）

- **「只有当前时间窗口内的可见大星球能被 hover / click」**  
  - **窗外**：**`movieInZFocusSlab`** 为 false，**不会** 被 **`pickIndex`** 返回，故 **不会** 驱动 **`hoveredMovieId` / `selectedMovieId`**。  
  - **窗内**：在射线 **`threshold`** 内且排序在前的窗内点优先成为候选。

---

## 5. 构建与后续建议

- **构建**：变更后已通过 **`frontend`** 目录下 **`npm run build`**（`tsc -b` + `vite build`）。  
- **手动回归建议**：在 **`zVisWindow = 1`** 与滚轮改变 **`zCurrent`** 的场景下，确认 **仅窗内** 粒子出现 **Tooltip / 选中**；若未来 **`zVisWindow`** 改为可配置 UI，应复测 **threshold 日志** 是否随 **`zVisWindow`** 更新。  
- **文档**：**Phase 5.1.8**（Tech Spec / Design Spec 同步）仍可按计划单独排期，将 **「拾取 = B 层 + slab 密度 threshold」** 写入交互章节。
