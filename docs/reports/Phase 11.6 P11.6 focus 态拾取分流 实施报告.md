# Phase 11.6（P11.6）— focus 态拾取分流（Perlin 优先 vs active 射线球）— 实施报告

> **范围**：仅在用户 **已进入 focus**（`selectedMovieId !== null`）且 Perlin 选择球 **可见** 时，对 hover / click 与 **背景 active 星** 的拾取做 **射线深度优先级** 分流；idle 态行为不变。  
> **主文件**：`frontend/src/three/interaction.ts`、`frontend/src/three/screenRadius.ts`、`frontend/src/three/scene.ts`（接线）  
> **计划来源**：`.cursor/plans/phase_11_focus_visual_upgrade_b71acde5.plan.md` §「P11.6 focus 态拾取分流」  
> **Git 分支（实施时）**：`feat/p11-6-focus-pick-routing`（合并前请以仓库实际分支名为准）

---

## 1. 目标与边界（计划对齐）

| 计划需求 | 最终处理 |
|----------|----------|
| focus 态 raycaster **优先**「焦点 Perlin」再考虑 active mesh，避免误点后景 active | **已实现**：同一相机射线下比较 **Perlin 包围球** 与 **各 active 世界球** 的 **最近正根 \(t\)**；Perlin 更近则视为「焦点星交互」 |
| `selected != null` 时 hover 焦点球仍正常显示 tooltip | **已实现**：分流命中 Perlin 时写入 `hoveredMovieId = 当前选中 TMDB id`，锚点与环半径按焦点片数据计算 |
| 背景另一颗 active 可切换 focus | **已实现**：若 **active 命中更近**（\(t_\mathrm{active} < t_\mathrm{focus}\)），走原有 `pickClosestActiveMovieAlongRay`，click 时 `setState({ selectedMovieId })` 更新为新片 |
| 点击空白处保留现有取消 focus 行为 | **未改**：仍由「未命中任何 active（含 slab gate）」→ `selectedMovieId: null` |
| 计划草案曾写 `Raycaster.intersectObject(selectionPlanetMesh)` | **未采用**：见 §2.1 |

---

## 2. 最终技术决策（汇总）

### 2.1 为何不用 `THREE.Raycaster` 打 Perlin `Mesh`

Perlin 表面形状由 **顶点着色器**沿法线位移（阶梯地形）得到，CPU 侧 `BufferGeometry` 仍是单位/icosa 基础网格；`Raycaster` 与 **GPU 位移不一致**，命中结果不可作为 SSOT。

**定稿**：拾取使用 **`SelectionPlanetHandle.lastRadius`**（在 `planet.ts` 的 `setFromMovie` 中与 P11.3/P11.5 阶梯外扩一致：`worldRadius × (1 + cuts × uStepHeight)`）构造 **世界空间包围球**，与射线求 **解析交**（最小正 \(t\)）。

### 2.2 优先级规则：沿射线的最小 \(t\)「决胜」

对同一条从相机发出的射线：

1. 计算焦点片中心 \((m_x,m_y,m_z)\) 与半径 \(R = \texttt{lastRadius}\) 的球的第一正面交点 \(t_\mathrm{focus}\)（无交则该项无效）。
2. 计算现有逻辑 **`pickClosestActiveMovieAlongRay`** 的最近命中 \(t_\mathrm{active}\)（含 `inFocus`、`requireSlabInteraction` 等既有门槛）。
3. **若** `selectionPlanet.mesh.visible` **且** `selectedMovieId` 对应片存在 **且** \(t_\mathrm{focus}\) 有效 **且**（无 active 命中 **或** \(t_\mathrm{focus} < t_\mathrm{active}\)）→ 判定为 **Perlin 胜出**。

这样在「焦点球与某颗背景 active 共线」时，以 **谁离相机更近** 为准：前景 active 点另一颗星可切换 focus；点在焦点 Perlin 球壳内侧更近处则稳定落在焦点语义上。

### 2.3 `mesh.visible` 门闸

飞入/飞出或透明度逻辑可能短暂隐藏 Perlin；此时 **不参与** Perlin 分流，避免用陈旧 `lastRadius` 抢 hover。

### 2.4 Hover 的 tooltip 半径

分流命中焦点 Perlin 时，`hoverPlanetRadiusCss` 不再使用 active shader 的 `computeActiveMeshScreenRadiusCss`，而使用 **`computeWorldSphereScreenRadiusCss`**，传入 **`rWorld = lastRadius`**，与包围球拾取一致，避免环与真实可点区域错位。

### 2.5 Click：焦点 Perlin 胜出时不写 store

`pointerup` 若在分流下判定 Perlin 胜出，**直接 return**，不调用 `setState({ selectedMovieId })`，从而 **保持当前 focus**（与「点击空白取消」路径分离）。

---

## 3. 代码落地摘要

| 模块 | 变更 |
|------|------|
| `screenRadius.ts` | 导出 **`rayPositiveSphereFirstT`**（封装既有射线–球最近正根）；新增 **`computeWorldSphereScreenRadiusCss`**（任意世界球 → CSS 半径，供 tooltip） |
| `interaction.ts` | `attachGalaxyActiveMeshInteraction` 增加可选 **`selectionPlanet?: SelectionPlanetHandle`**；提炼 **`rayFromClient`**；实现 **`focusPlanetBeatsActiveAlongRay(..., requireSlabInteraction)`**；在 **`setHoverFromClient`** / **`onWindowPointerUp`** 中接入 |
| `scene.ts` | `attachGalaxyActiveMeshInteraction({ ..., selectionPlanet: planet })` |

---

## 4. 与计划文档的差异说明（刻意采纳）

| 计划原文 | 实施 |
|----------|------|
| 「`intersectObject(selectionPlanetMesh)`」 | 改为 **`lastRadius` 包围球解析射线**，理由见 §2.1 |
| 「拾取用 `lastRadius`」 | **一致**，作为唯一 SSOT |

---

## 5. 验收对照（计划 §P11.6）

| 验收项 | 状态 |
|--------|------|
| focus 态鼠标停在焦点 Perlin 上 → tooltip 为焦点电影 | 由 Perlin 胜出分支写入 `hoveredMovieId` + `lastRadius` 屏上半径 支撑 |
| 停在另一颗 active 上 → 可切换 focus | \(t_\mathrm{active} < t_\mathrm{focus}\) 时走原 active 拾取 |
| 空白处无 hover；点击空白取消 focus | 未改既有 active-only 清空逻辑 |

---

## 6. 构建与回归

- 实施完成后执行：`frontend` 下 `npm run build`（`tsc -b` + `vite build`）**通过**。

---

## 7. 相关文档索引

- 计划：`.cursor/plans/phase_11_focus_visual_upgrade_b71acde5.plan.md`（P11.6 小节）  
- Perlin 半径与 opaque：`docs/reports/Phase 11.5 P11.5 Perlin 不透明化与包围球拾取 实施报告.md`（`lastRadius` 语义）  
- 技术规格后续条目：计划 **P11.7** 拟将「focus 优先 Perlin 分流」写入 `Tech Spec §1.5`（若尚未合并请以仓库为准）
