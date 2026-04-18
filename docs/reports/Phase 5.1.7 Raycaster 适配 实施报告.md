# Phase 5.1.7 Raycaster 适配 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.7**（frontmatter 项 **`p5-1-7-raycaster`**）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — 相关 Issue：**T6**（hover / click 触发位置或对象异常）  
> **报告日期**: 2026-04-18  
> **实施分支**: `phase-5-1-7-raycaster`（自 `main` 新开分支后提交）

---

## 1. 摘要

本次 Phase **5.1.7** 在 **单 `THREE.Points`** 架构不变的前提下，完成 **Raycaster 与视距窗口（方案 1）+ 粒子分层（方案 2）的拾取侧对齐**：

1. **拾取语义**：仅 **B 焦点层**（时间轴上 **`z ∈ [zCurrent, zCurrent + zVisWindow]`** 闭区间）内的粒子可成为 **hover / click** 的最终结果；射线若先命中窗外背景粒子，在结果集中 **跳过** 直至找到窗内命中或返回空。该区间与 **`point.vert.glsl`** 中 **`vInFocus` / `gl_PointSize`** 分支使用的 slab **一致**。
2. **阈值模型**：将 **`Raycaster.params.Points.threshold`** 从「全数据集 3D 包围盒尺度 + 总粒子数」的粗估，改为 **按可见 Z 窗口宽度比例估计 slab 内粒子数**，再在 **XY 足迹矩形面积**上估计 **平均面内间距**，并沿用 **`0.75` 系数与相对短边的上下限 clamp**（与旧版数量级控制方式兼容，但密度锚点改为 **窗内**）。

**未采用**计划中的备选路径「**双 Points：仅对窗内 Points 调用 `intersectObject`**」——当前仍以 **单 Points + 命中后过滤 + 新阈值** 交付，以降低几何与材质拆分成本；若后续 T6 仍有边角案例，可再评估双对象方案。

---

## 2. 背景与目标（对照计划 5.1.7）

| 计划要求 | 实施要点 |
| -------- | -------- |
| **拾取仅对窗口内层（B）生效** | `pickIndex` 在 `intersectObject` 返回的 **hits** 上顺序扫描，**仅采纳** `movieInZFocusSlab(z, zCurrent, zVisWindow)` 为真的条目 |
| **或：双 Points 仅 intersect 窗内** | **未实施**；保留为可选升级路径 |
| **threshold 基于窗内粒子密度重算** | 新增 **`computeFocusSlabPointsThreshold`**；**`syncPickThreshold`** 在 **`zVisWindow` 变化** 时更新 `raycaster.params.Points` 并打日志 |
| **验收：仅窗内可见大星球可 hover/click** | 逻辑上由 **Z 过滤** 保证；**阈值** 减轻窗外交叠对排序首位的干扰（见 §4.3） |

---

## 3. 变更文件与职责

| 文件 | 变更说明 |
| ---- | -------- |
| `frontend/src/three/interaction.ts` | 新增 **`computeFocusSlabPointsThreshold`**、**`syncPickThreshold`**；**`pickIndex`** 每次拾取前同步阈值；**`attachGalaxyPointsInteraction`** 增加 Phase 5.1.7 说明注释；移除旧版 **`computePointsThreshold`**（全量 `span / sqrt(n)` 单尺度估法） |
| `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` | frontmatter 将 **`p5-1-7-raycaster`** 标为 **`completed`** |

**与 Phase 5.1.6 的关系**：5.1.6 报告已记录 **Z slab 命中过滤** 的初版行为；5.1.7 在其基础上补全计划所述 **窗内密度驱动的 threshold**，并固化文档与计划状态。

---

## 4. 技术细节

### 4.1 Z slab 与 shader / store 的一致性

- **判定函数**：**`movieInZFocusSlab(z, zCurrent, zVisWindow)`** — `zHi = zCurrent + zVisWindow`，**`z >= zCurrent && z <= zHi`**。  
- **顶点层**（`point.vert.glsl`）：**`zHi = uZCurrent + uZVisWindow`**，**`inFocus = step(uZCurrent, z) * step(z, zHi)`**，即同一闭区间。  
- **运行时状态**：**`zCurrent` / `zVisWindow`** 来自 **`useGalaxyInteractionStore.getState()`**，与 **5.1.5** 相机与 **5.1.6** uniform 同步链路一致。

### 4.2 `pickIndex` 行为（命中顺序与「第一个窗内命中」）

每次拾取：

1. **`syncPickThreshold()`** — 若 **`zVisWindow`** 与缓存不同，则重算并写入 **`raycaster.params.Points.threshold`**。  
2. **`raycaster.intersectObject(points, false)`** — Three.js 返回的 **hits 按沿射线距离排序**（近者优先）。  
3. **顺序遍历 hits**：跳过非法 **`index`**；跳过 **`movie.z` 不在焦点 slab** 的命中；**返回第一个通过的索引**。

因此：若最近的几何命中均为 **A 层**（窗外），会被跳过，直到出现 **B 层**命中；若射线上 **不存在** 窗内命中（或均在 threshold 之外），返回 **`null`**。

核心循环如下（节选）：

```127:140:frontend/src/three/interaction.ts
  const pickIndex = (clientX: number, clientY: number): number | null => {
    syncPickThreshold()
    ndc.copy(ndcFromClient(domElement, clientX, clientY))
    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObject(points, false)
    if (hits.length === 0) return null
    const { zCurrent, zVisWindow } = useGalaxyInteractionStore.getState()
    for (let i = 0; i < hits.length; i++) {
      const idx = hits[i].index
      if (idx === undefined || idx < 0 || idx >= movies.length) continue
      if (!movieInZFocusSlab(movies[idx].z, zCurrent, zVisWindow)) continue
      return idx
    }
    return null
  }
```

### 4.3 新 threshold 公式（`computeFocusSlabPointsThreshold`）

记 **`zSpan = |z_range[1] - z_range[0]|`**，**`zWin = max(zVisWindow, ε)`**，在 **「上映年份在 `z_range` 内近似均匀」** 的假设下：

- **估计 slab 内粒子数**：**`nSlab = max(1, movieCount * zWin / max(zSpan, ε))`**。  
- **XY 足迹面积**：**`xyArea = (x_max - x_min) * (y_max - y_min)`**（来自 **`meta.xy_range`**）。  
- **特征面内间距**：**`avgXYSpacing = sqrt(xyArea / nSlab)`**。  
- **阈值**：**`clamp(0.75 * avgXYSpacing, xyMin * 1e-4, xyMin * 0.08)`**，其中 **`xyMin = min(x 跨度, y 跨度)`**。

**说明与局限**：

- **均匀 Z 分布**为简化假设；真实排片密度随年代波动，**`nSlab` 为期望值而非精确计数**，不随 **`zCurrent`** 滑动而重算（避免每帧 **`O(n)`** 扫描）。若未来 **`zVisWindow`** 很大或数据极度不均匀，可再引入 **按 `z` 分桶的预计算** 或 **双 Points**。  
- Three.js 的 Points 射线检测使用 **世界空间** 的 **点–射线距离阈值**，与 **片元里按像素缩放的 `gl_PointSize`** 并非同一模型；**T6** 的「手感」仍建议在 **多 DPR、多时间窗** 下做肉眼回归。

### 4.4 `syncPickThreshold` 与日志

- 使用 **`cachedThresholdZVis`**：**仅当 `zVisWindow` 变化** 时重算 threshold 并 **`console.log`** 一行摘要（含 **`nSlab≈`** 便于联调）。  
- **挂载时**调用一次 **`syncPickThreshold()`**，保证首帧与 store 一致。

---

## 5. 验收对照（计划 5.1.7 原文要点）

| 验收项 | 状态 |
| ------ | ---- |
| 仅当前时间窗口内的「焦点」粒子可被 **hover** | **已实现**（`setHoverFromClient` → `pickIndex`） |
| 仅同上窗口内粒子可被 **click** 选中 | **已实现**（`onWindowPointerUp` → `pickIndex`） |
| **threshold** 与窗内密度策略挂钩 | **已实现**（§4.3） |
| 计划备选「仅 intersect 窗内 Points」 | **未做**（单 Points 方案已满足当前计划条文中的主路径） |

---

## 6. 构建与静态检查

在 `frontend/` 目录执行：

- **`npm run build`**（`tsc -b` + `vite build`）— **通过**（实施时验证）

建议在合并前再执行 **`npm run lint`** 作为常规门禁。

---

## 7. Git 信息

| 项 | 值 |
| --- | --- |
| **分支** | `phase-5-1-7-raycaster` |
| **代码提交** | **`43811b6`** — `feat(frontend): Phase 5.1.7 raycaster focus-slab threshold (T6)` |
| **本报告提交** | **`3552d40`** — `docs(reports): add Phase 5.1.7 Raycaster implementation report` |

---

## 8. 结论与后续可选工作

**结论**：Phase **5.1.7** 在 follow-up 计划中的 **Raycaster 适配**条目（**T6**、窗内拾取、窗内密度阈值）**已按主路径交付**；计划 frontmatter 已标记完成。

**可选后续**（非本阶段必须）：

- **`zCurrent` 敏感的局部密度**：对 `z` 做直方图或分桶，按当前窗口精算 **`nSlab`**，进一步微调 threshold。  
- **双 `THREE.Points`**：窗内 / 窗外分离几何体，**`intersectObject` 仅绑定窗内**，从引擎层彻底避免 A 层进入 raycast 候选集。  
- **自动化测试**：待 **Phase 5.4.1（Vitest）** 落地后，可为 **`computeFocusSlabPointsThreshold`** 与 **slab 过滤** 补充纯函数单测。

---

## 9. 修订记录

| 日期 | 摘要 | 关联提交 |
| ---- | ---- | -------- |
| 2026-04-18 | 首版：实施说明、公式、验收与 Git 信息 | **`43811b6`**（代码）、**`3552d40`**（本报告） |

---

*本报告随代码演进可增补「修订记录」表（日期 / 变更摘要 / 关联提交）。*
