# Phase 4.1 Raycaster 交互（悬停与点击拾取）实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 4.1「Raycaster 交互」  
> **报告日期**: 2026-04-14  
> **实施分支**: `phase-4.1-raycaster-interaction`  
> **提交**: `f674980` — `feat(frontend): Phase 4.1 raycaster hover and click picking`  
> **范围**: `THREE.Raycaster` 对星系 `THREE.Points` 的拾取；悬停/选中状态写入 Zustand；Console 可观测日志。不包含 Phase 4.2 Tooltip、4.3 Drawer 等 HUD 组件。

---

## 1. 本次目标

根据开发计划 Phase 4.1，本次交付需满足：

1. 新增独立模块 `frontend/src/three/interaction.ts`，对粒子点云做 Raycaster 拾取。  
2. **悬停**：鼠标移动时更新 Zustand 中的 `hoveredMovieId`（TMDB `Movie.id`，无命中时为 `null`）。  
3. **点击**：在有效「点击」手势下更新 `selectedMovieId`；空白处点击清空选中。  
4. **验收日志**（计划 Checkpoint）：  
   - 悬停粒子：`[Hover] id={id} title="..."`；离开粒子或离开画布：`[Hover] null`。  
   - 点击粒子：`[Select] id={id} title="..."`；点空白：`[Select] null`。  
5. 与现有「无旋转、仅 truck/pedestal + 滚轮 Z」相机控制共存：区分**平移相机**与**点选**，避免拖拽画布结束时误触发选中。

---

## 2. Git 与执行前状态

| 项 | 内容 |
| --- | --- |
| 基线分支 | `main` |
| 用户要求 | 先新开 Git 分支再实施 Phase 4.1 |
| 创建分支命令 | `git checkout -b phase-4.1-raycaster-interaction` |
| 分支与提交 | 在新分支上完成开发与提交；当前报告撰写时该分支最新提交为 `f674980` |

---

## 3. 代码改动概览

| 类型 | 路径 | 说明 |
| --- | --- | --- |
| 新增 | `frontend/src/store/galaxyInteractionStore.ts` | Zustand：`hoveredMovieId`、`selectedMovieId` |
| 新增 | `frontend/src/three/interaction.ts` | `attachGalaxyPointsInteraction`：Raycaster、事件、阈值、日志 |
| 修改 | `frontend/src/three/scene.ts` | 挂载/卸载交互；`renderer.domElement` 抽为 `canvas` 复用 |

**未纳入本次范围**（按计划留给后续 Phase）：

- 开发计划 YAML 中 `p4-raycaster` 任务状态未在本次操作中改为 `completed`（若需与计划看板一致，可另提一次小改动）。  
- Tooltip / Sheet / Timeline / 选中 IcoSphere 等 Phase 4.2+ 功能。

---

## 4. 详细实现说明

### 4.1 Zustand：`galaxyInteractionStore`

新建 `useGalaxyInteractionStore`，仅承载与 Raycaster 相关的两项 ID：

- `hoveredMovieId: number | null`  
- `selectedMovieId: number | null`  

与 `galaxyDataStore`（加载 JSON、错误态）拆分，避免把「数据加载」与「指针交互」混在同一 store 中，便于后续 Phase 4.2+ 的 HUD 订阅。

### 4.2 拾取几何与索引契约

- 星系粒子由 `createGalaxyPoints` 写入 `BufferGeometry` 的 `position`，**第 `i` 个顶点**对应 `movies[i]`。  
- `interaction.ts` 在挂载时 `console.assert`：  
  - 存在 `position` 属性；  
  - `position.count === movies.length`；  
  - `meta.count === movies.length`（与 JSON 合同一致）。  
- `raycaster.intersectObject(points)` 取 `hits[0].index` 映射到 `movies[idx].id`。

### 4.3 `Raycaster.params.Points.threshold`（世界空间）

Three.js 对 `Points` 的射线检测使用**世界空间**距离阈值，需与数据云尺度匹配。实现为 `computePointsThreshold(meta, movieCount)`：

- 由 `xy_range`、`z_range` 计算场景主轴跨度 `span`；  
- 用 `avgSpacing = span / sqrt(n)`（`n = movies.length`）近似平均点距；  
- `threshold = clamp(avgSpacing * 0.75, span * 1e-4, span * 0.08)`；  
- 挂载时打印一行 `[Interaction] Points pick threshold (world): ...`，便于全量 ~60K 点下人工判断过松/过紧。

若后续全量数据上体验不佳，优先调整上述系数与上下限，而非改 JSON。

### 4.4 屏幕坐标 → NDC

使用 `getBoundingClientRect()` 将 `clientX/clientY` 转为归一化设备坐标，再 `raycaster.setFromCamera(ndc, camera)`，与画布 CSS 尺寸及 DPR 解耦（与相机 aspect 由 `setSize` 维护一致）。

### 4.5 悬停（Hover）

- 在 WebGL `canvas` 上监听 `pointermove`，每帧根据指针位置拾取并更新 store。  
- 使用 `lastHoverId`（`number | null | undefined`）去重：仅在「当前悬停 ID」变化时写 store 并打日志，避免在空白处移动时刷屏 `[Hover] null`。  
- `pointerleave`：清空 hover、打 `[Hover] null`，并重置内部 `lastHoverId`，以便再次进入画布时能重新记录状态。

### 4.6 点击（Select）与相机平移的区分

相机控制在同一 `canvas` 上使用主键拖拽做 truck/pedestal。若仅用 `click` 事件或在 `canvas` 上监听 `pointerup`，容易出现「拖动画布松手仍算一次点击」的误选。

本次策略：

1. `pointerdown`（主键）：记录 `pressX/pressY`，`dragExceededDuringPress = false`，并注册 **`window` 上的 `pointerup` / `pointercancel`（capture: true）**。  
2. `pointermove`：若主键按下 `(e.buttons & 1)`，且指针相对按下点移动超过 **`CLICK_MAX_MOVE_PX = 6`** 像素，则标记 `dragExceededDuringPress = true`。  
3. `pointerup`（全局）：若未标记为拖拽超限，则在**释放点**做一次 `pickIndex`，更新 `selectedMovieId` 并打印 `[Select] ...`；否则不更新选中（视为纯相机操作）。  

这样在画布外松开主键仍能完成一次合法拾取（只要按下在画布内开始），同时减少与平移手势冲突。

### 4.7 生命周期与 `scene.ts` 集成

在 `mountGalaxyScene` 中，在 `attachGalaxyCameraControls` 之后调用 `attachGalaxyPointsInteraction`，传入：

- `camera`  
- `domElement: canvas`（`renderer.domElement`）  
- `points: galaxy.points`  
- `movies`、`meta`（用于阈值与断言）  

在 `dispose` 中**先**调用交互返回的 `detachInteraction()`，再卸载相机控制、从场景移除 Points、释放 Bloom 等，保证：

- 移除 `window` 与 `canvas` 上的监听器；  
- `useGalaxyInteractionStore.setState({ hoveredMovieId: null, selectedMovieId: null })`；  
- 打印 `[Interaction] detached, cleared hover/select`。

---

## 5. 验收步骤（与计划 Checkpoint 对齐）

1. 确保 `frontend/public/data/galaxy_data.json` 存在且应用能进入「就绪」态（见 Phase 3.3 加载流程）。  
2. `npm run dev`，打开应用，打开 DevTools Console。  
3. **悬停**：在粒子上缓慢移动鼠标，应看到 `[Hover] id=... title=...`；移开粒子或移出画布应看到 `[Hover] null`。  
4. **点击**：在粒子上单击（几乎不拖动），应看到 `[Select] id=... title=...`；在空白处单击，应看到 `[Select] null`。  
5. **相机**：按住主键拖动画布平移后松开，不应因本次拖动而误触发选中（除非松开点恰好落在粒子上且未超像素阈值——属预期射线行为）。  
6. **挂载日志**：应出现 `[Interaction] attach | movies=...` 与 `Points pick threshold` 一行。

---

## 6. 已知限制与后续可做

| 项 | 说明 |
| --- | --- |
| 性能 | 悬停每次 `pointermove` 对全量 Points 做 Raycast，在低端机或超高刷下可能成为瓶颈；后续可做 rAF 合并、节流或 GPU picking。 |
| 阈值 | 阈值由经验公式推导，极端密度或非均匀分布时可能需产品侧微调系数。 |
| 与 Phase 4.2 衔接 | HUD 可订阅 `useGalaxyInteractionStore` 的 `hoveredMovieId` / `selectedMovieId`，并在 `useGalaxyDataStore` 的 `movies` 中按 `id` 查找详情。 |

---

## 7. 小结

本次在分支 `phase-4.1-raycaster-interaction` 上完成了 Phase 4.1：**Raycaster 对星系粒子的悬停与点击拾取**，状态写入独立 Zustand store，并在 `mountGalaxyScene` 中与相机、Bloom、Resize 生命周期正确挂载与释放。计划中的 Console 可观测性已落实，为 Phase 4.2 Tooltip 与 Phase 4.3 Drawer 提供了稳定的选中/hover 数据源。
