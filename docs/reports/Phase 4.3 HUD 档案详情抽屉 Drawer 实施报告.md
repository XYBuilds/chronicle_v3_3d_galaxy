# Phase 4.3 HUD — 档案详情抽屉（MovieDetailDrawer / Sheet）实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 4.3「HUD — 档案详情抽屉（点击层）」  
> **计划 Todo ID**: `p4-drawer`（YAML frontmatter 中已标记为 **`completed`**）  
> **报告日期**: 2026-04-14  
> **实施分支**: `phase/4.3-detail-drawer`  
> **提交**: `4999497` — `feat(frontend): Phase 4.3 movie detail drawer (Sheet) + stories`  
> **范围**: 基于 shadcn **Sheet**（Base UI Dialog）的点击详情抽屉、与 Phase 4.1 `selectedMovieId` 及数据 Store 的联动、Storybook 多状态与边界用例；不包含 Phase 4.4 时间轴、4.5 选中态 IcoSphere、4.6 Storybook 总览收口

---

## 1. 本次目标

根据开发计划 Phase 4.3 与 PRD「漫游 → 悬停 → 点击检视」中的**点击检视层**，本次实现目标为：

1. 新增 `frontend/src/components/Drawer.tsx`（计划约定文件名），提供可复用的 **`MovieDetailDrawerHud`** 与运行态 **`MovieDetailDrawer`**。  
2. UI 基于 **shadcn Sheet**（`@base-ui/react/dialog` 封装），从**右侧**滑出，展示完整档案级信息。  
3. 使用 **AspectRatio** 承载海报（2:3）、**Badge** 展示评分与元数据、**ScrollArea** 承载可滚动演职员列表。  
4. 动效落在计划区间：**打开约 250–350ms**（实现为 **300ms** + easeOutCubic）、**关闭约 400–500ms**（实现为 **450ms**）。  
5. **Storybook**：使用 subsample 风格的 **mock `Movie`**，覆盖无 tagline、无海报、超长 cast 等边界；另提供可切换开关的 **Toggle** story。  
6. **Git**：在独立分支上完成改动并提交；与 Phase 4.1 Raycaster 的 `selectedMovieId` 打通。

---

## 2. Git 与执行前状态

| 项 | 内容 |
| --- | --- |
| 基线分支 | `main` |
| 用户要求 | 先新开分支再实施 |
| 创建分支命令 | `git checkout -b phase/4.3-detail-drawer` |
| 分支创建结果 | 在新分支上完成全部代码修改并提交 |

---

## 3. 代码改动概览

### 3.1 新增文件

| 路径 | 说明 |
| --- | --- |
| `frontend/src/components/Drawer.tsx` | 详情抽屉：`MovieDetailDrawerHud`、`MovieDetailDrawer`、`DrawerPoster`、日期/票数/金额格式化 |
| `frontend/src/components/Drawer.stories.tsx` | Storybook：`HUD/MovieDetailDrawer` 下 Default / NoTagline / NoPoster / LongCastList / Toggle |
| `frontend/src/components/ui/sheet.tsx` | shadcn 生成：Sheet / SheetContent / SheetOverlay / SheetHeader / SheetTitle / SheetDescription 等 |
| `frontend/src/components/ui/aspect-ratio.tsx` | shadcn 生成：海报比例容器（使用 `ComponentProps<"div">` 类型，避免未导入 `React` 命名空间） |
| `frontend/src/components/ui/badge.tsx` | shadcn 生成：Badge + `badgeVariants`（CVA） |
| `frontend/src/components/ui/scroll-area.tsx` | shadcn 生成：`@base-ui/react/scroll-area` 封装 |

### 3.2 修改文件

| 路径 | 说明 |
| --- | --- |
| `frontend/src/App.tsx` | 数据就绪主界面中挂载 `<MovieDetailDrawer />`（与 `<MovieTooltip />` 同级） |
| `frontend/src/three/scene.ts` | `mountGalaxyScene` 的 `meta` 参数类型由 `Pick<Meta, 'z_range' \| 'xy_range'>` 扩展为包含 **`count`**，与 `attachGalaxyPointsInteraction` 所需 `Pick<Meta, 'xy_range' \| 'z_range' \| 'count'>` 一致，消除 `tsc` 报错 |
| `frontend/eslint.config.js` | `globalIgnores` 增加 **`storybook-static`**，避免对 Storybook 构建产物执行 ESLint |
| `frontend/src/components/ui/badge.tsx` | 将 `badgeVariants` 单独导出并加 `eslint-disable-next-line react-refresh/only-export-components` 说明（shadcn 常见 CVA 导出模式） |
| `frontend/src/components/ui/scroll-area.tsx` | 移除未使用的 `import * as React`，满足 `tsc` 无未使用声明 |

### 3.3 依赖与 CLI

- **shadcn**：通过 `npx shadcn@latest add sheet` 等拉取组件；遇已存在 `button.tsx` 时用管道输入 **`n`** 跳过覆盖。  
- **npm 包**：未新增顶层依赖条目；Sheet / ScrollArea 等沿用已有 **`@base-ui/react`** 等栈内依赖。

### 3.4 计划文件同步

- **`.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md`**  
  - YAML `todos` 中 **`id: p4-drawer`** 的 **`status`** 已设为 **`completed`**，与 Phase 4.3 交付一致。

---

## 4. 详细实现说明

### 4.1 `Drawer.tsx`：Sheet 与内容结构

- **`MovieDetailDrawerHud`**（Storybook 与逻辑复用）  
  - 受控 **`open` / `onOpenChange`**，内部使用 `<Sheet>` + `<SheetContent side="right">`。  
  - **`SheetContent` 动效**：`transition-[transform,opacity]` + `duration-[300ms]` + CSS 变量 `--sheet-ease` = `cubic-bezier(0.215, 0.61, 0.355, 1)`（easeOutCubic）；**`data-ending-style:duration-[450ms]`** 拉长收起阶段。  
  - **头部**：`SheetTitle`（标题）、`SheetDescription`（`sr-only` 供无障碍摘要）、可选 `original_title`、**Badge** 行：`vote_average`、`vote_count`（缩写格式）、`release_date`（本地化短日期）、最多 **4** 个 `genres`。  
  - **主体**：`AspectRatio` 2:3 海报；可选 **tagline**（斜体）；**Overview**；`dl` 网格展示 runtime、语言、导演、编剧、预算、票房；**Cast** 使用 **`ScrollArea`** 固定高度 **`h-48`** 与有序列表。  
  - **金额**：`budget` / `revenue` 为 0 或非有限数时显示 **—**。

- **`DrawerPoster`**（同文件子组件）  
  - 负责 **`img` `onError`** 与「无海报」占位（`Clapperboard` 图标 + 文案）。  
  - 父级以 **`key={\`${movie.id}|${movie.poster_url}\`}`** 挂载，在影片或海报 URL 变化时**重挂载**以重置加载失败状态，**避免**在 `useEffect` 中同步 `setState`（满足 `react-hooks` 推荐与当前 ESLint 规则）。

- **`MovieDetailDrawer`**（仅运行态）  
  - 从 **`useGalaxyInteractionStore`** 读取 **`selectedMovieId`**，从 **`useGalaxyDataStore`** 读取 **`data?.movies`**，`useMemo` + `find` 解析 **`Movie`**。  
  - **`open`**：`selectedMovieId !== null && movie !== null`，避免无效 id 时打开空壳。  
  - **`useEffect`**：若 `movies` 已加载但列表中**不存在**当前 `selectedMovieId`，则 **`setState({ selectedMovieId: null })`**，防止脏 id 残留。  
  - 抽屉 **`onOpenChange(false)`** 时清空 **`selectedMovieId`**，与点击遮罩/关闭按钮行为一致。  
  - 打开且解析到影片时 **`console.log`**：`[MovieDetailDrawer] open id=... title=... cast=...`（与项目「状态可见」习惯一致）。

### 4.2 与 Phase 4.1 的衔接

- **选中来源**：`frontend/src/three/interaction.ts` 已在左键释放（且非「平移误判」）时写入 **`selectedMovieId`**；空白点击写入 **`null`**。  
- **关闭路径**：用户关闭 Sheet → 同步清空 **`selectedMovieId`**；用户再次在画布空白处点击 → 交互层同样清空，抽屉与状态一致。

### 4.3 `App.tsx` 接线

在星系主界面（`status === 'ready'`）中，于全屏 WebGL 容器之后渲染 **`<MovieDetailDrawer />`**，保证 Sheet Portal 与画布叠放顺序正确。

### 4.4 `scene.ts` 类型修正

`attachGalaxyPointsInteraction` 的 `meta` 参数类型要求 **`count`**（用于拾取阈值与 assert）。`mountGalaxyScene` 实际传入的 **`meta`** 来自完整 **`GalaxyData.meta`**，本就含 **`count`**；将函数签名收窄类型扩展为包含 **`count`** 后，调用点 **`App.tsx`** 传入的 `data.meta` **无需改字段**，仅类型对齐。

### 4.5 ESLint 与工程卫生

- **`storybook-static`**：Storybook `build` 产物不应被应用 ESLint 扫描；加入 **`globalIgnores`** 后，`npm run lint` 不再误报第三方 bundle 内缺失 rule 定义等问题。  
- **`badge.tsx`**：`react-refresh/only-export-components` 对 **`badgeVariants`** 的告警通过 **单行 disable + 注释** 说明原因。

### 4.6 Storybook：`Drawer.stories.tsx`

- 导航标题：**`HUD/MovieDetailDrawer`**。  
- **`makeMockMovie(overrides)`**：构造满足 **`Movie`** 类型的完整 mock，便于与真实 JSON 契约一致。  
- **Stories**  
  - **Default**：标准海报 URL、含 tagline、中等 cast。  
  - **NoTagline**：`tagline: null`。  
  - **NoPoster**：`poster_url: ''`，验证占位 UI。  
  - **LongCastList**：**28** 条 cast，验证 **`ScrollArea`** 滚动与长列表可读性。  
  - **Toggle**：本地 `useState` 切换 **`open`**，便于在无画布环境下验证开关与 **`onOpenChange`**。

---

## 5. 验收与自检命令

| 计划 Checkpoint（Phase 4.3） | 实施情况 |
| --- | --- |
| 点击粒子 → 侧边抽屉滑出 | `selectedMovieId` 非空且解析到 `movie` 时 `open === true` |
| 海报加载或 fallback | `DrawerPoster`：`img` 成功显示；失败或空 URL → 占位 |
| 标题 / 评分 / 日期 / overview 有内容 | 头部 Badge + 正文 overview；空 overview 显示 **—** |
| 演职员可滚动 | Cast 区域 **`ScrollArea`** + **`h-48`** |
| 关闭或空白行为 | Sheet **`onOpenChange(false)`** 清空选中；与画布空白点击一致 |
| Storybook 三种 edge case | **NoTagline**、**NoPoster**、**LongCastList** |

建议在仓库根目录执行：

```bash
npm run build -w frontend
npm run lint -w frontend
npm run storybook -w frontend
npm run build-storybook -w frontend
```

运行态：加载星系数据后，**点击粒子**应打开抽屉；**点击关闭按钮或遮罩**应关闭并清空选中（可与 Console `[Select]` / `[MovieDetailDrawer]` 日志对照）。

---

## 6. 已知限制与后续可做事项

1. **动效**：`SheetOverlay` 仍使用 `sheet.tsx` 内默认较短 **`transition-opacity duration-150`**；若需严格「遮罩与面板同频」可再在 `sheet.tsx` 或 Drawer 层统一参数（当前未改，以保持 shadcn 生成件最小差异）。  
2. **演职员**：当前为 **`cast: string[]`** 的纯名单列表；若未来 JSON 含角色名/排序，可再扩展为结构化列表。  
3. **Phase 4.6**：计划要求 Loading / Tooltip / Drawer / Timeline 四类 story 齐全；**Timeline（4.4）** 仍为待办，Storybook 导航在 4.4 完成后可再对照计划做一次清单核对。

---

## 7. 小结

本次在分支 **`phase/4.3-detail-drawer`**（提交 **`4999497`**）完成 Phase 4.3：**shadcn Sheet 详情抽屉**、**海报 / Badge / ScrollArea** 信息架构、与 **Zustand `selectedMovieId`** 的双向同步、**Storybook** 边界用例，并附带 **`scene.ts` 类型**与 **ESLint 忽略 storybook-static** 等工程修复。开发计划 YAML 中 **`p4-drawer`** 已标记为 **`completed`**。
