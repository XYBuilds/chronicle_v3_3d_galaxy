# Phase 4.2 HUD — MovieTooltip（悬停层）实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 4.2「HUD — Tooltip（悬停层）」  
> **报告日期**: 2026-04-14  
> **实施分支**: `phase-4.2-movie-tooltip`  
> **提交**: `ce3bc57` — `feat(frontend): Phase 4.2 MovieTooltip HUD + Storybook`  
> **范围**: 基于 shadcn（Base UI）的悬停 Tooltip、与 Phase 4.1 Raycaster 的 Zustand 联动、屏幕锚点投影、Storybook 多状态预览；不包含 Phase 4.3 抽屉、4.4 时间轴、4.5 选中态球体

---

## 1. 本次目标

根据开发计划 Phase 4.2 与 PRD「漫游 → 悬停 → 点击检视」中的悬停层，本次实现目标为：

1. 新增 `MovieTooltip` HUD：在 Raycaster 命中粒子时展示 **`title`** 与 **`genres[0]`**。  
2. UI 基于 **shadcn Tooltip**（项目栈为 **Base UI** `@base-ui/react/tooltip`，通过 `npx shadcn add tooltip` 生成）。  
3. 锚点策略：将命中粒子的 **世界坐标 (x, y, z)** 经当前相机 **投影为视口 CSS 像素**，用 `position: fixed` 的不可见触发器承载 Tooltip，由 Base UI `Positioner` 处理贴边与翻转。  
4. 提供 **Storybook** 故事，覆盖短标题、长标题、无主类型、角落锚点等状态。  
5. Git 流程：在独立分支上完成全部改动后再提交。

---

## 2. Git 与执行前状态

| 项 | 内容 |
| --- | --- |
| 基线分支 | `main` |
| 用户要求 | 先新开分支再实施 |
| 创建分支命令 | `git checkout -b phase-4.2-movie-tooltip` |
| 分支创建结果 | 在新分支上完成全部代码修改并提交 |

---

## 3. 代码改动概览

| 类型 | 路径 |
| --- | --- |
| 新增 | `frontend/src/components/ui/tooltip.tsx` — shadcn 生成的 Tooltip / TooltipTrigger / TooltipContent / TooltipProvider |
| 新增 | `frontend/src/components/MovieTooltip.tsx` — `MovieTooltipHud`（纯展示 + Storybook）与 `MovieTooltip`（Zustand 接线） |
| 新增 | `frontend/src/components/MovieTooltip.stories.tsx` — `HUD/MovieTooltip` 下 4 个 story |
| 修改 | `frontend/src/store/galaxyInteractionStore.ts` — 增加 `hoverAnchorCss` |
| 修改 | `frontend/src/three/interaction.ts` — 世界坐标 → 屏幕 CSS 投影；与 `hoveredMovieId` 同步更新锚点；节流避免同 id 下亚像素抖动重复 setState |
| 修改 | `frontend/src/main.tsx` — 根节点包裹 `TooltipProvider`（`delay={0}`，悬停 HUD 无额外延迟） |
| 修改 | `frontend/src/App.tsx` — 数据就绪主界面中挂载 `<MovieTooltip />` |

依赖：`tooltip` 组件仅使用已有依赖 `@base-ui/react`，**未新增 npm 包**。

---

## 4. 详细实现说明

### 4.1 Zustand：`hoverAnchorCss`

在 `GalaxyInteractionState` 中扩展字段：

- `hoverAnchorCss: { x: number; y: number } | null`  
  表示当前悬停粒子在**浏览器视口**中的锚点（与 `getBoundingClientRect()` 一致的 CSS 像素坐标系）。

与 Phase 4.1 已有字段配合使用：

- `hoveredMovieId` — TMDB `Movie.id`  
- `selectedMovieId` — 点击选中（本阶段 Tooltip 不依赖，保持原行为）

指针离开 WebGL canvas、或 `attachGalaxyPointsInteraction` 卸载时，将 `hoveredMovieId` 与 `hoverAnchorCss` 一并清空。

### 4.2 `interaction.ts`：屏幕投影与状态更新

1. **`movieToScreenCss`**  
   - 使用复用的 `THREE.Vector3`，写入粒子 `(movie.x, movie.y, movie.z)`。  
   - 调用 `.project(camera)` 得到 NDC，再按 canvas 的 `getBoundingClientRect()` 换算为 `left/top` 视口坐标（与 Three.js 常用公式一致：`x = (ndcX * 0.5 + 0.5) * width + rect.left`，`y` 对 `ndcY` 取负号以匹配屏幕 Y 向下）。

2. **`emitHover` 与节流**  
   - 每次 `pointermove` 在命中粒子时都会重算锚点（同一粒子在**相机平移/缩放**后屏幕位置会变）。  
   - 使用 `lastEmitted` 快照：仅当 `id` 变化，或锚点相对上次变化超过约 **0.25px** 时才调用 `setState`，减轻 Zustand + React 在同 id 下的无意义重渲染，同时避免浮点抖动。

3. **日志**  
   - 保留 Phase 4.1 的 `[Hover] id=...` / `[Hover] null` 行为；`id` 变化时才打印，避免刷屏。

### 4.3 `MovieTooltip.tsx`：HUD 结构

- **`MovieTooltipHud`**（供应用与 Storybook 共用）  
  - `Tooltip` 使用受控 **`open`**，由外部布尔决定显隐；**`onOpenChange`** 置为无操作函数，避免 Tooltip 内部逻辑反向覆盖「以 Raycaster 为准」的悬停态。  
  - **`TooltipTrigger`**：`fixed`、`1×1` 像素、`pointer-events-none`、透明、`transform: translate(-50%, -50%)` 使锚点对准粒子投影中心。  
  - **`TooltipContent`**：`side="top"`、`max-w-sm`；主行标题，次行 `genres[0]`（大写、小字号）；无 `genres[0]` 时不渲染次行。

- **`MovieTooltip`**（仅运行态）  
  - 从 `useGalaxyInteractionStore` 读取 `hoveredMovieId`、`hoverAnchorCss`。  
  - 从 `useGalaxyDataStore` 读取 `data.movies`，`useMemo` + `find` 解析当前影片。  
  - 三者齐全时 `open === true`，否则关闭。

### 4.4 应用入口接线

- **`main.tsx`**：`TooltipProvider` 必须包裹使用 Tooltip 的子树（shadcn 生成组件的说明与 Base UI 要求一致）。  
- **`App.tsx`**：在 `status === 'ready'` 的主布局中，与 WebGL 容器同级渲染 `<MovieTooltip />`，保证 Tooltip Portal 层级与全屏画布共存。

### 4.5 Storybook

- 路径标题：**`HUD/MovieTooltip`**。  
- **Decorators**：每个 story 外包 `TooltipProvider delay={0}` 与深色背景容器，便于观察 Tooltip 与箭头。  
- **Stories**  
  - `Default` — 中等长度标题 + 主类型  
  - `LongTitle` — 超长标题（验证 `max-w-sm` 与换行）  
  - `NoPrimaryGenre` — `primaryGenreLabel: null`  
  - `CornerAnchor` — 锚点靠近边缘（便于肉眼观察 Positioner 翻转/避裁切）

---

## 5. 验收与自检命令

计划在 Phase 4.2 中的 Checkpoint 对应关系如下：

| 计划要求 | 实施情况 |
| --- | --- |
| hover 粒子 → Tooltip 显示 `title` + `genres[0]` | `MovieTooltip` 从 store + `movies` 解析并渲染 |
| 锚定在星球屏幕投影旁 | `hoverAnchorCss` + 固定定位触发器 + `translate(-50%,-50%)` |
| Radix/Base 侧贴边与碰撞 | 使用 shadcn 封装的 `TooltipPrimitive.Positioner`（含 `Portal`） |
| 离开粒子 → Tooltip 消失 | `hoveredMovieId` / `hoverAnchorCss` 清空 |
| Storybook 多文本长度 | 见 `MovieTooltip.stories.tsx` |

建议在本地执行：

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm run build-storybook
npm run dev
```

- **应用**：加载 `galaxy_data.json` 后，在粒子上移动鼠标应看到 Tooltip；移出粒子或离开 canvas 应消失。  
- **Storybook**：`npm run storybook`，打开 **HUD → MovieTooltip**，确认四个 story 无报错、Tooltip 可见。

本次实施已在上述命令上通过（`tsc`、`eslint`、`build-storybook`）。

---

## 6. 已知限制与后续可选优化

1. **相机变化与鼠标静止**  
   若用户在不移动鼠标的情况下仅通过滚轮等方式改变相机，拾取索引可能仍指向同一粒子，但**屏幕投影已变**；当前实现依赖后续 **`pointermove`** 才会更新 `hoverAnchorCss`。若需「相机每帧更新锚点」，可在 Phase 4 后期在 `scene.ts` 的 `tick` 或相机控制回调中向 store 同步投影（需注意性能）。

2. **`movies.find` 复杂度**  
   悬停 `id` 变化时做一次 O(n) 查找；在 ~60K 规模下可接受。若将来成为瓶颈，可在数据加载时构建 `Map<id, Movie>` 放入 store。

3. **受控 Tooltip 与无障碍**  
   `onOpenChange` 未接业务状态；键盘/焦点关闭 Tooltip 的行为以 Base UI 默认为准。若产品要求「仅指针驱动」，当前设计与之一致。

---

## 7. 与后续 Phase 的关系

- **Phase 4.3**：详情抽屉（Sheet）将消费 `selectedMovieId`，与 Tooltip 并行存在。  
- **Phase 4.4**：时间轴与相机 Z 联动，与 Tooltip 无直接冲突。  
- **Phase 4.5**：选中态 IcoSphere 与相机动画；Tooltip 仍为悬停层，需注意与「选中」视觉层级区分（当前 `z-[100]` 可按设计再调）。

---

## 8. 小结

Phase 4.2 已按计划完成：**shadcn Tooltip + 世界坐标屏幕锚点 + Zustand 与 Raycaster 联动 + Storybook 覆盖**，并在独立 Git 分支 `phase-4.2-movie-tooltip` 上以提交 `ce3bc57` 落地。

---

## 9. 文档与计划同步（本报告与 todo 状态）

| 操作 | 路径 / 项 |
| --- | --- |
| 新增本实施报告 | `docs/reports/Phase 4.2 HUD MovieTooltip 实施报告.md` |
| 更新开发计划 todo | `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — `p4-tooltip`：`pending` → **`completed`** |

若上述文档与计划修改尚未进入版本库，请在当前工作分支上执行 `git add` 与 `git commit` 一并纳入。
