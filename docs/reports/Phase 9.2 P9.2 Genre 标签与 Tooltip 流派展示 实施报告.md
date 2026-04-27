# Phase 9.2（P9.2）— Genre 标签染色与 Tooltip 流派展示 — 实施报告

> **范围**：仅 Phase 9.2。纯 React / DOM / CSS 变更，**不动** Three.js、shader、`galaxy_data.json` 数据契约。  
> **主设计文档**：`docs/project_docs/视觉参数总表.md`、`.cursor/plans/phase_9_hud_polish_5e3d5977.plan.md`（P9.2 节）  
> **实施分支（参考）**：`phase-9-p92-genre-tag`  
> **相关提交**：
> - `668f84f` — `feat(hud): P9.2 genre tag tint (Badge genre variant, drawer + tooltip)`  
> - `b7ebb15` — `refactor(tooltip): primary genre only, text color from palette, no badge`

---

## 1. 目标与计划对齐

| 计划项（P9.2 原文） | 最终处理 |
|---------------------|----------|
| `Badge` 增加 `genre` variant；`--genre-color` + 背景 18% / 边 60% / 字用 `foreground`；`color-mix` 不可行时 `hex → rgb` 的 alpha 回退 | **已实现**（`badge.tsx` + `index.css` + `getGenreChipSurfaceStyle` + `CSS.supports` 分支） |
| Drawer 渲染 `movie.genres` **全量**（取消 `slice(0,4)`） | **已实现** |
| Tooltip 与抽屉「同源」的 genre 展示 | **迭代为最终决策**（见第 2 节）：**不用 Badge**；**仅主流派 `genres[0]`**；**字色 = palette 中的 genre 色** |
| 验收入门：暗色面板上对比度、hex 缺失时 outline 回退 | **Drawer 侧**：无 palette 或非法 hex 的流派走 `Badge variant="outline"`；**Tooltip 侧**：有文案但无色可用时走 `text-muted-foreground` |
| 对照度 ≥ 4.5（计划表述） | **未做单独仪器测量**；Drawer 为浅底 + 主前景字；Tooltip 为 genre 实色小字。若需量化可在后续用浏览器对比度 API 或设计审查补记 |

---

## 2. 最终产品决策（对计划的补充与修正）

1. **Drawer：genre 以 Badge 色标全量展示**  
   每个流派名在 `meta.genre_palette[流派名]` 有合法可解析的 hex 时使用 `variant="genre"`；否则为 **outline**（与计划一致）。

2. **Tooltip：不采用 Badge，与 P9.2 初版实现不同**  
   经需求细化，Tooltip 第二行改为 **纯文字**（小写大写、字距与原先副标题行一致的大致层级），**不再**与抽屉共用 `GenreBadgesList`。

3. **Tooltip：只显示主流派**  
   仅展示 `movie.genres[0]`。无流派数组或为空时，不显示第二行。

4. **Tooltip：主流派字色**  
   在能在 palette 中解析出颜色时，使用 `style={{ color: <normalized #rrggbb> }}`；**无法**解析时，使用 `text-muted-foreground`，保证可读性。

5. **复用**  
   `meta.genre_palette` 与 Three.js 星球用色同源；Tooltip 的 hex 经 `normalizeGenreHex` 与 `genreColor.ts` 共用，与 Drawer 的色源一致。

6. **架构**  
   将 Drawer 的流派 Badge 行抽为 `GenreBadgesList`，避免与 Tooltip 的纯文字行重复逻辑、减少分叉。

7. **可观测性**  
   - `MovieDetailDrawer` 打开时日志含 `genres` 条数等（在 P9.2 中已并入既有打开日志）。  
   - `MovieTooltip` 在 **开发模式** 下、hover 打开时通过 `useEffect` 打一条与 `primaryGenre` / 色 相关的日志，避免每帧刷屏。

8. **与 P9.3 的边界**  
   **标题行仍仅为 `title` 字符串**；P9.3 计划的「`Title (YYYY)`」拼接在 **包装层** 完成。P9.2 **未**改标题行格式，避免与 P9.3 重复实现。

---

## 3. 技术实现要点

### 3.1 `frontend/src/lib/genreColor.ts`

- `parseHex6ToRgb` / `normalizeGenreHex`：供 Drawer Badge、Tooltip 字色、Storybook 等统一解析 pipeline 的 hex 字符串。  
- `getGenreChipSurfaceStyle`：在 **`CSS.supports('background', 'color-mix(in oklch, ...')` 为真** 时，仅设 `--genre-color`；否则内联 `background` / `borderColor` 使用 `rgb(r g b / 0.18)` 与 `0.6`（边框）。  
- 开发环境下若传入 `getGenreChipSurfaceStyle` 的字符串无法解析为 hex，**抛错** 以快失败；生产路径依赖上游已 `normalize` 的调用方。

### 3.2 `frontend/src/index.css`（`Badge` genre 表面样式）

- 为 **非 `@layer` 的** 全局规则，选择器与 shadcn `Badge` 的 `group/badge` 类名结合（`.group\/badge.badge-genre`），避免与 Tailwind `border-transparent` 工具类在层叠中冲突。  
- 背景与边颜色：`color-mix(in oklch, var(--genre-color) 18%, transparent)` 与 60% 的边（与计划三段式一致）；字色在 CSS 层使用 `var(--foreground)`。  
- 在 **rgba 回退** 路径上，由内联 `style` 覆盖 / 补全 `background` 与 `borderColor`（同文件注释所述）。

### 3.3 `frontend/src/components/ui/badge.tsx`

- 新增 CVA 变体：`genre: "badge-genre border text-foreground"`（具体表面色在 `index.css` + 内联 variable / rgba 中完成）。

### 3.4 `frontend/src/components/GenreBadgesList.tsx`（新）

- 入参：`genres`、`genrePalette`、可选 `className`。  
- 仅被 **Drawer** 使用；注释明确 Tooltip **不** 使用本组件。  
- 无 `size="tooltip"` 等分支（初版曾预留，在 Tooltip 改为纯文后已删除）。

### 3.5 `frontend/src/components/Drawer.tsx`

- `useGalaxyDataStore` 读取 `data.meta.genre_palette`。  
- 头部信息区以 `<GenreBadgesList genres={movie.genres} genrePalette={genrePalette} />` 全量展示流派（与 TMDB/IMDb 同一块区域）。

### 3.6 `frontend/src/components/MovieTooltip.tsx` 与 `MovieTooltipHud` props

- 对外（含 Storybook）：`primaryGenreLabel: string | null`，`primaryGenreColorHex: string | null`；由 `MovieTooltip` 用 `genres[0]` 与 `normalizeGenreHex(genrePalette[label])` 计算。  
- UI：第一行标题；第二行条件渲染主流派字串 + 字色 / muted 回退。

### 3.7 Storybook

- `MovieTooltip.stories.tsx`：使用 `primaryGenreColorFromFixtures` 从 `SUBSAMPLE_GENRE_PALETTE` 与 subsample 条目的 `genres[0]` 对齐实机逻辑；`NoPrimaryGenre` 用例覆盖无主流派。  
- `GenreBadgesList` 无独立 story；Drawer 的 Story 若已存在，仍可通过其验证全量色标（本报告不展开）。

---

## 4. 操作记录（可复现）

| 类型 | 操作 |
|------|------|
| 分支 | 在 `e:\projects\chronicle_v3_3d_galaxy` 执行 `git checkout -b phase-9-p92-genre-tag` |
| 实现 | 新增 `lib/genreColor.ts`、`components/GenreBadgesList.tsx`；改 `index.css`、`badge.tsx`、`Drawer.tsx`、`MovieTooltip.tsx`、`MovieTooltip.stories.tsx` |
| 计划追踪 | 更新 `.cursor/plans/phase_9_hud_polish_5e3d5977.plan.md` 中 P9.2 任务为 completed（以仓库内当前内容为准） |
| 验签 | 在 `frontend` 下执行 `npx tsc --noEmit` 与 `npm run build` 通过 |
| 提交 | 见文首两笔提交；`b7ebb15` 在 `668f84f` 之上，反映 Tooltip 需求的细化 |

---

## 5. 未纳入 P9.2 的后续项（供索引）

- **P9.3**：Tooltip 标题行 `title` 的 `(YYYY)` 包装（及异常日期回退）—— 见计划 P9.3 节。  
- **P9.6**：设计文档中 genre tag 三段式 alpha 的成文登记；若 P9.2 报告与 Design Spec 有出入，**以 P9.6 文档同步为准** 收敛。

---

## 6. 文件路径速查

| 路径 | 作用 |
|------|------|
| `frontend/src/lib/genreColor.ts` | 解析、normalize、Badge 用 surface `style` |
| `frontend/src/index.css` | `.group\/badge.badge-genre` 全局表面样式 |
| `frontend/src/components/ui/badge.tsx` | `genre` variant |
| `frontend/src/components/GenreBadgesList.tsx` | Drawer 全量 genre Badge |
| `frontend/src/components/Drawer.tsx` | 接入 `genre_palette` 与 `GenreBadgesList` |
| `frontend/src/components/MovieTooltip.tsx` | 主流派纯文字 + 色 / muted |
| `frontend/src/components/MovieTooltip.stories.tsx` | Tooltip Story 与无流派用例 |
