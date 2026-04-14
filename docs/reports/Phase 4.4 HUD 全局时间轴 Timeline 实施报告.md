# Phase 4.4 HUD — 全局时间轴（Timeline）实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 4.4「HUD — 全局时间轴」  
> **计划 Todo ID**: `p4-timeline`（YAML frontmatter 中已标记为 **`completed`**）  
> **报告日期**: 2026-04-15  
> **实施分支**: `feature/phase-4-4-timeline`  
> **提交**: `2f3ae9e` — `feat(hud): Phase 4.4 passive Z-axis timeline indicator`  
> **范围**: 被动式 Z 轴年代指示条、与 `meta.z_range` 及 Three.js 相机世界坐标 Z 的实时同步、Design Spec §3.1 的低存在感视觉；**不包含** Phase 4.5 选中态 IcoSphere、Phase 4.6 中 Timeline 的 Storybook 专项收口（计划中 4.6 再统一补 stories）

---

## 1. 本次目标

依据开发计划 Phase 4.4、《TMDB 电影宇宙 Design Spec》**§3.1 全局时间轴（Timeline Indicator）**，以及计划中的验收描述，本次交付目标为：

1. 新增 `frontend/src/components/Timeline.tsx`（与计划约定文件名一致），提供 **`TimelineHud`**（纯展示、可 Storybook 化）与运行态 **`Timeline`**（接线数据与相机）。  
2. **形态**：屏幕**左侧**纵向刻度条（右侧已为 Phase 4.3 **Sheet** 抽屉占用，避免叠放冲突）；半透明细轨、小字号等宽数字年份刻度。  
3. **当前位置**：以相机 **`position.z`**（与 JSON 中影片 **`z`** 同一世界轴，小数年份）映射到 `[z_min, z_max]` 区间上的**高亮游标**，并显示 **`Math.round(cameraZ)`** 作为读数。  
4. **极端行为**：当相机 Z 超出 `meta.z_range` 时（当前 `camera.ts` 尚未做 Z clamp，属 Phase 3.7 跟进项），游标在轨道上 **clamp 到端点**，满足计划「最早/最晚不越界」的 UI 语义。  
5. **性能**：不在每帧向 Zustand 写入相机 Z；采用 **`useSyncExternalStore`** + 极薄外部 store，避免整应用因 HUD 刷新而重渲染。  
6. **可观测性**：`Timeline` 在获得有效 `z_range` 时 **`console.log`** 打印区间与小样本刻度（与项目「状态可见」习惯一致）。  
7. **Git**：在用户要求下于**独立分支**完成实现并提交。

---

## 2. Git 与执行前状态

| 项 | 内容 |
| --- | --- |
| 基线分支 | `main` |
| 用户要求 | 先新开分支再实施 Phase 4.4 |
| 创建分支 | `git checkout -b feature/phase-4-4-timeline` |
| 结果 | 在该分支上完成修改并以单次提交落地 |

---

## 3. 代码改动概览

### 3.1 新增文件

| 路径 | 说明 |
| --- | --- |
| `frontend/src/lib/galaxyCameraZBridge.ts` | 模块级 `cameraZ` + `Set` 监听器；`setGalaxyCameraZ` / `getGalaxyCameraZ` / `subscribeGalaxyCameraZ`，供 React `useSyncExternalStore` 订阅 |
| `frontend/src/components/Timeline.tsx` | `yearTickList`、`zToTrackBottomFraction`、`TimelineHud`、`Timeline`；无障碍采用 `role="img"` + 动态 `aria-label` |

### 3.2 修改文件

| 路径 | 说明 |
| --- | --- |
| `frontend/src/three/scene.ts` | 在 `mountGalaxyScene` 内：相机就位后**立即** `setGalaxyCameraZ(camera.position.z)`；在 `requestAnimationFrame` 渲染循环**每帧**再次写入当前 `camera.position.z`，保证滚轮改 Z 时 HUD 连续更新 |
| `frontend/src/App.tsx` | 星系就绪主界面中，在 `<MovieTooltip />` 与 `<MovieDetailDrawer />` 之间挂载 **`<Timeline />`** |

### 3.3 依赖与组件库

- **未新增** npm 依赖。  
- **未引入** shadcn **Slider** 组件；视觉采用 Tailwind 透明度与细线，与「可考虑 Slider 风格对齐」的表述一致，但以自绘轨道降低依赖与交互误读（本阶段为**纯被动**指示，非可拖拽控件）。

---

## 4. 详细实现说明

### 4.1 坐标与时间轴语义

- **数据源**：`Timeline` 从 **`useGalaxyDataStore`** 读取 **`data.meta.z_range`**（Tech Spec §4.2：`[z_min, z_max]` 小数年）。  
- **相机 Z**：与 `frontend/src/three/camera.ts` 中滚轮/初始位姿一致，使用 **`PerspectiveCamera.position.z`** 作为「当前漫游在时间轴上的位置」。  
- **映射**：`thumbT = clamp((cameraZ - zMin) / (zMax - zMin), 0, 1)`，轨道 **底部对应较早年代、顶部对应较晚年代**（Z 增大向上移动游标）。  
- **`z_range` 顺序**：对 `zRange` 两个端点取 **`Math.min` / `Math.max`** 归一化，避免 JSON 中极小概率的逆序导致显示错误。

### 4.2 年份刻度生成

- **`yearTickList(zMinDec, zMaxDec)`**：在 `floor(zMin)` 与 `ceil(zMax)` 的整数年跨度上，按「约 8 档目标刻度」选择 **1 / 2 / 5 / 10 / 20 / 25 / 50 / …** 步长，生成整数年列表。  
- 各刻度在轨道上的垂直位置与游标使用同一套 **`zToTrackBottomFraction`**，保证刻度与读数几何一致。

### 4.3 `galaxyCameraZBridge` 与 `scene.ts` 的衔接

- **初始化**：场景创建并 `camera.position.set(cx, cy, zMin - 2)` 后立刻同步一次 Z，避免首帧 React 仍读到 bridge 默认值 **0** 造成闪跳。  
- **持续更新**：在原有 `composer.render()` 的同一 `tick` 中先 `setGalaxyCameraZ` 再渲染，顺序对 HUD 无强依赖，但保证每帧至少一次更新。

### 4.4 叠放与无障碍

- **位置**：`fixed left-2`（`sm:left-4`），`z-index: 30`，低于 `MovieTooltip` 触发层的 **`z-[100]`**，避免遮挡悬停层。  
- **`pointer-events-none`**：不拦截画布指针事件，Raycaster 行为不变。  
- **`role="img"`**：表明为装饰性/信息性图示，而非可操作 Slider；`aria-label` 简述整轴范围与当前近似年份。

### 4.5 与 Phase 4.6 的边界

- 计划 Phase 4.6 要求 **Loading / MovieTooltip / Drawer / Timeline** 等在 Storybook 中均有 stories。本次 **未新增** `Timeline.stories.tsx`；建议在执行 **Phase 4.6** 时以 **`TimelineHud`** 注入 mock **`zRange`** 与受控 **`cameraZ`** 即可快速补齐。

---

## 5. 验收对照（计划 Phase 4.4 Checkpoint）

| 检查项 | 结论 |
| --- | --- |
| 时间轴常驻可见（数据 `ready` 后主界面） | 满足：`App.tsx` 始终渲染 `<Timeline />` |
| 滚轮沿 Z 穿梭时指示器实时跟随 | 满足：每帧 `setGalaxyCameraZ` + `useSyncExternalStore` |
| 标注年份与相机 Z 一致（线性映射 + 四舍五入读数） | 满足：游标位置与 `Math.round(cameraZ)` 标签同源 |
| 最早/最晚不越界 | 满足：游标 fraction **clamp 至 [0, 1]** |

**建议人工 smoke**：`npm run dev` → 加载 `galaxy_data.json` → 观察左侧刻度与 `[Camera] Z` 日志、滚轮操作时游标与 `Math.round` 年份是否同步；Console 出现 **`[Timeline] z_range...`**。

---

## 6. 类型检查与静态分析

实施时已对涉及文件执行 **`npm exec --workspace frontend tsc -- --noEmit`** 与针对性 **ESLint**，均通过（与当前仓库脚本一致）。

---

## 7. 计划文件同步

- **`.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md`**  
  - YAML `todos` 中 **`id: p4-timeline`** 的 **`status`** 已设为 **`completed`**，与 Phase 4.4 交付一致。

---

## 8. 后续可选改进（非本次范围）

- **相机 Z clamp**：与 Phase 3.7 follow-up 中「Camera XY/Z clamp」一致，管线侧或 `camera.ts` 限制 `position.z` 后，时间轴游标将更多时间在 `(0,1)` 内部而非贴边。  
- **Storybook**：见 §4.5。  
- **点击刻度跳转 Z**（Design Spec 可选增强）：当前为被动指示，未实现。
