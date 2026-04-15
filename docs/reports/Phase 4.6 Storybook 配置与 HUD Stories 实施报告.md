# Phase 4.6 — Storybook 配置与全部 HUD Stories 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 4.6「Storybook 配置（`@storybook/react-vite`）+ 全部 HUD stories」  
> **计划 Todo ID**: `p4-storybook`（本报告同步后，计划 YAML 中标记为 **`completed`**）  
> **报告日期**: 2026-04-15  
> **实施分支**: `phase-4.6-storybook-hud-stories`  
> **提交**: `e0ca2a8` — `feat(storybook): Phase 4.6 HUD stories and subsample fixtures`  
> **范围**: Storybook 预览层接入全局样式、subsample 派生的 `Movie` fixtures、Loading / MovieTooltip / Drawer / Timeline 的 stories 补齐与侧栏排序；**不包含** Raycaster、Drawer 业务逻辑、Timeline 运行态组件本身的重写（仅 Storybook 与展示用 `TimelineHud`）

---

## 1. 本次目标

依据开发计划 **Phase 4.6** 与验收描述（计划中 §4.6），本次交付目标为：

1. **Storybook 配置收口**：在保留既有 `@storybook/react-vite` 框架的前提下，保证预览 iframe 内 **Tailwind / 主题变量** 与主应用一致。  
2. **四个 HUD 组件在侧栏可发现**：**Loading**、**MovieTooltip**、**Drawer**、**Timeline** 各自有独立 story 入口，且每个组件至少具备 **默认态 + 一种边界/变体态**。  
3. **Mock 数据来源**：HUD 中依赖的 **`Movie`** 等结构，从仓库 **`data/subsample/tmdb2025_random20.csv`** 抽取真实行（标题、演职员、海报 URL、空 tagline / 空 cast 等），与计划「Mock 数据从 `data/subsample/` 提取」一致；星系专用字段（`x/y/size/emissive/genre_color`）在 fixtures 中为 **UI 占位**，不冒充管线产出的 UMAP 坐标。  
4. **Timeline**：以 **`TimelineHud`** 注入受控 `zRange` / `cameraZ`，避免在 Storybook 中依赖 Zustand 与 Three.js 相机桥。  
5. **Git**：在用户要求下于**独立分支**完成实现并提交。

---

## 2. Git 与执行前状态

| 项 | 内容 |
| --- | --- |
| 基线分支 | `main` |
| 用户要求 | 先新开分支再实施 Phase 4.6 |
| 创建分支 | `git checkout -b phase-4.6-storybook-hud-stories` |
| 结果 | 在该分支上完成修改并以单次提交落地 |

---

## 3. 代码改动概览

### 3.1 新增文件

| 路径 | 说明 |
| --- | --- |
| `frontend/src/storybook/fixtures/subsampleMovies.ts` | 从 subsample CSV 整理的 4 条完整 **`Movie`**：`subsampleMovieKika`、`subsampleMovieMarthasVineyard`、`subsampleMovieParadiseRoad`、`subsampleMovieHappiness`；导出 **`SUBSAMPLE_DECIMAL_Z_RANGE`**；`releaseDateToDecimalYear` + 运行时 **`assert`** |
| `frontend/src/components/Loading.stories.tsx` | `Loading` 的 `Default`、`CustomLabel` |
| `frontend/src/components/Timeline.stories.tsx` | `TimelineHud` 的 `Default`、`CameraAtMinZ`、`CameraAtMaxZ`、`WideZSpan` |

### 3.2 修改文件

| 路径 | 说明 |
| --- | --- |
| `frontend/.storybook/preview.ts` | **`import '../src/index.css'`**；**`parameters.options.storySort.order`**：`Loading` → `MovieTooltip` → `Drawer` → `Timeline` → `Dev` |
| `frontend/src/components/Drawer.stories.tsx` | `title` 改为 **`Drawer`**；移除内联手写 `makeMockMovie`，改用 fixtures；新增 **`EmptyCast`**（Happiness）；`Default` 使用 **Kika**（有 tagline），**NoTagline** 使用 **Martha's Vineyard** |
| `frontend/src/components/MovieTooltip.stories.tsx` | `title` 改为 **`MovieTooltip`**；文案与主类型来自 subsample fixtures |
| `frontend/src/components/ScaffoldStatus.stories.tsx` | `title` 改为 **`Dev/ScaffoldStatus`**，与四个 HUD 分组区分 |

### 3.3 依赖

- **未新增** npm 依赖；沿用既有 **`@storybook/react-vite`**（及现有 addons）。

---

## 4. 详细实现说明

### 4.1 `preview.ts` 与全局样式

- Storybook iframe 默认不会执行应用入口 `main.tsx`，因此此前 **未显式引入** `src/index.css` 时，部分 Tailwind 工具类可能不完整或与设计稿偏差。  
- 在 **`preview.ts` 顶层** 增加对 **`../src/index.css`** 的导入后，构建产物中出现独立 CSS chunk（`iframe-*.css`），说明样式管线已接入 Storybook 构建。

### 4.2 Fixtures：`subsampleMovies.ts`

- **行来源**：TMDB id **657018**（Martha's Vineyard）、**77223**（Paradise Road）、**8223**（Kika）、**489533**（Happiness），字段与 CSV 语义对齐（如 Happiness 的 **空 cast**、Martha 的 **空 tagline**）。  
- **`releaseDateToDecimalYear`**：用 UTC 年内比例将 `YYYY-MM-DD` 映射为小数年，供 **`z`** 与 **`SUBSAMPLE_DECIMAL_Z_RANGE`** 使用。  
- **`assert`**：对 decimal year 与 `z_range` 顺序做硬失败，符合项目「关键路径显式断言」习惯。

### 4.3 Stories 设计要点

| 组件 | Storybook `title` | Stories（摘要） |
| --- | --- | --- |
| `Loading` | `Loading` | `Default`、`CustomLabel` |
| `MovieTooltip` | `MovieTooltip` | `Default`（Happiness）、`LongTitle`（Martha 长标题）、`NoPrimaryGenre`、`CornerAnchor` |
| `MovieDetailDrawerHud` | `Drawer` | `Default`（Kika）、`NoTagline`、`NoPoster`、`LongCastList`（Paradise）、`EmptyCast`（Happiness）、`Toggle` |
| `TimelineHud` | `Timeline` | `Default`、`CameraAtMinZ`、`CameraAtMaxZ`、`WideZSpan`（1874–2026 刻度压力） |

### 4.4 侧栏排序

- 使用 Storybook **`parameters.options.storySort.order`**，使左侧导航中四个 HUD 以计划书写顺序优先展示；**`Dev`** 组（如 `Dev/ScaffoldStatus`）排在末尾。

---

## 5. 验收对照（计划 Phase 4.6 Checkpoint）

| 检查项 | 结论 |
| --- | --- |
| `npm run storybook` 可启动 | 未在本报告中重复启动 dev server；实施时已通过 **`npm run build-storybook`** 静态构建验证 |
| 左侧导航列出 **Loading / MovieTooltip / Drawer / Timeline** | 满足：四个顶层 `title` 与 `storySort` 一致 |
| 每个组件至少 **default + edge-case** | 满足：见 §4.3 表 |
| Mock 与 **`data/subsample/`** 对齐 | 满足：fixtures 注释与字段与 **`tmdb2025_random20.csv`** 对应行一致 |

**建议人工 smoke**：在 `frontend` 目录执行 **`npm run storybook`**，依次打开上述四个组件的 default 与 edge story，确认无运行时错误、Tooltip 需 `TooltipProvider` 的 story 仍正常。

---

## 6. 类型检查与构建

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit`（`frontend` 工作目录） | 通过（实施时） |
| `npm run build-storybook` | 通过；产出 `frontend/storybook-static` |

### 6.1 已知 lint 项（非本次 diff 引入）

- 在 **`frontend`** 执行 **`npm run lint`** 时，**`Drawer.tsx`** 可能仍触发 **`react-hooks/set-state-in-effect`**（约第 195 行）。本次 Phase 4.6 **未修改** `Drawer.tsx`；若需 CI 全绿，应在独立任务中重构该 effect 或按团队规范处理规则例外。

---

## 7. 计划文件同步

- **`.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md`**  
  - YAML `todos` 中 **`id: p4-storybook`** 的 **`status`** 已设为 **`completed`**，与 Phase 4.6 交付一致。

---

## 8. 后续可选改进（非本次范围）

- 若希望 fixtures **自动从 CSV 再生成**，可增加小型脚本将 `tmdb2025_random20.csv` 转为 `subsampleMovies.generated.ts`（注意 UTF-8 与 Windows 控制台编码）。  
- 将 **`storySort`** 与 **Autodocs** 标签策略统一，便于长期维护多批次 stories。
