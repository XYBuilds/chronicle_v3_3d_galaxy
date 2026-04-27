# Phase 9.1（P9.1）— Drawer HUD 视觉吸收与交互 — 实施报告

> **范围**：仅 Phase 9.1（电影详情抽屉 `MovieDetailDrawerHud` / `MovieDetailDrawer`）。不动 Three.js 管线、不改 `galaxy_data` 契约。  
> **主文件**：`frontend/src/components/Drawer.tsx`  
> **对照文档**：`docs/project_docs/TMDB 电影宇宙 Design Spec.md`（§3.4 Phase 9 HUD）、`.cursor/plans/phase_9_hud_polish_5e3d5977.plan.md`（P9.1 条目）  
> **分支（实施时）**：`phase9/p9.1-drawer-visual`（与仓库实际分支名一致即可）

---

## 1. 目标与边界（计划对齐）

| 计划项 | 最终处理 |
|--------|----------|
| 保留 shadcn `Sheet` / `SheetContent` / `AspectRatio` / `Badge` 骨架 | **保留**；关闭按钮改为 Drawer 内自定义 `SheetClose`（`showCloseButton={false}`），避免与版式冲突 |
| 吸收参考示例的 typography 与信息层级 | **已吸收**：主标题、副标题、评分行、genre pill、blockquote、Overview/Details/Cast 小标题、Details 两列网格、Cast 双列编号 |
| 六人字段：dop / producers / composer | **已展示**；空数组不渲染对应行（与 director / writers 一致） |
| IMDb 外链 | **有 `imdb_id` 时显示**；ghost + 外链图标 |
| `SHEET_OPEN_EASE`（Phase 4.3） | **保留** |
| 流派全量 + 流派染色（P9.2） | **未在本轮做**：抽屉内 genre 仍为 `slice(0, 4)`，染色留给 P9.2 |

---

## 2. 最终产品决策（汇总）

### 2.1 视觉与版式

1. **整体气质**：抽屉内容区采用「流式排版」为主，Overview / Details / Cast **不再使用**带边框的卡片容器，与参考白底长文面板一致；颜色一律走 **shadcn / Tailwind 语义类**（`bg-popover`、`text-foreground`、`text-muted-foreground`、`border-border` 等），**不写死 hex**。
2. **主标题**：`text-2xl font-bold leading-tight`，`text-foreground`。
3. **副标题**（`original_title`）：仅当 `original_title` 存在且 **不等于** `title` 时显示；`text-sm font-medium text-muted-foreground`。
4. **评分行**：单行 flex 换行；`Star` + 分数 + votes + 日期；辅色用 `text-muted-foreground`，分数与日期强调用 `text-foreground`。
5. **流派**：`Badge variant="secondary"` + `rounded-full`，与 TMDB/IMDb 链接同一行区域。
6. **海报**：`AspectRatio` 2:3；`rounded-xl`、`shadow-sm`；宽度随内容列 **满宽**；`DrawerPoster` 失败占位使用 **token 渐变**（`from-primary/20 via-accent to-secondary`）+ 文案占位，不用硬编码色板。
7. **Tagline**：`blockquote` + 左侧 `border-l-2 border-border`，斜体 muted。
8. **区块小标题**（Overview / Details / Cast）：`text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground`；与正文间距 **`space-y-3`**（相对 `space-y-4` 收紧一档）。
9. **Details 字段名**（Runtime、Language 等）：比区块标题再小一档，使用 **`text-xs font-semibold`**（`detailFieldLabelClass`）；值为 `text-muted-foreground`；网格 **`grid-cols-2 gap-x-8 gap-y-5`**，长名单占格与参考两列一致。
10. **Cast**：双列网格（`sm:grid-cols-2`），序号 + `truncate` 人名；人名字号 **`text-xs`**；**不设内部 ScrollArea**，长列表随外层滚动。
11. **标题栏层级**：`SheetHeader` 底边 `border-b border-border/70` 下增加 **轻投影**，使用 `color-mix(in oklch, var(--foreground) 10%, transparent)`，暗示标题区与正文分层（仍无固定 hex）。

### 2.2 外链与数据

1. **TMDB**：始终提供（有 `movie` 时）`https://www.themoviedb.org/movie/{movie.id}`（`Movie.id` 即 TMDB 电影 id）。
2. **IMDb**：`imdb_id` 去空格后非空才渲染；`https://www.imdb.com/title/{id}/`。
3. **外链样式**：`buttonVariants({ variant: 'ghost', size: 'sm' })` + 统一 `externalHudLinkClass`；`target="_blank"` + `rel="noopener noreferrer"`；`ExternalLink` 图标。

### 2.3 滚动与「无滚动条」体验

1. **结构**：`SheetContent` **`overflow-hidden` + `min-h-0` + `max-h-[100dvh]`**；**标题区 `shrink-0`**；**正文区 `flex-1 min-h-0 overflow-y-auto`**（`drawerBodyScrollClass`）。
2. **效果**：标题区不随正文滚动；正文可滚；**隐藏原生滚动条**（Firefox `scrollbar-width:none`、IE 系 `-ms-overflow-style:none`、WebKit `[&::-webkit-scrollbar]:hidden`），触控板/滚轮仍可用。
3. **与先前需求的统一**：曾将整扇抽屉放在 `SheetContent` 上滚动导致「标题跟滚」；最终改回 **头固定 + 体滚动**，并满足「内容区不要单独出现一条 scrollbar」的诉求（视觉上无条、逻辑上仍可滚）。

### 2.4 抽屉宽度

1. **现象**：在 `SheetContent` 上写裸的 `sm:max-w-lg` 时，**视觉宽度不变**。
2. **根因**：`frontend/src/components/ui/sheet.tsx` 默认使用 **`data-[side=right]:sm:max-w-sm`**。与裸 `sm:max-w-*` 在 **tailwind-merge / CSS 特异性**上不等价，后者无法稳定覆盖前者。
3. **决策**：在 Drawer 的 `SheetContent` 上使用 **`data-[side=right]:sm:max-w-lg`** 覆盖默认 `max-w-sm`（约 24rem → **32rem**）；宽度仍与基座 **`data-[side=right]:w-3/4`** 组合（视口较宽时由 max-width 封顶）。

### 2.5 可观测性（项目准则）

- `MovieDetailDrawer` 在抽屉打开时 `console.log` 含 cast / dop / producers / composer 数量及是否有 `imdb_id`，便于联调与回归。

---

## 3. 实施操作清单（按类型）

### 3.1 代码

| 操作 | 说明 |
|------|------|
| 编辑 `Drawer.tsx` | 版式、六人字段、外链、滚动、宽度、标题投影、Cast 字号等最终实现均收敛于此文件 |
| 不修改 `sheet.tsx` 默认全局 Sheet | 通过 Drawer 传入 class 覆盖，避免影响其他 Sheet 消费者 |
| `npm run build` | 每次较大改动后执行 `tsc -b && vite build` 通过 |

### 3.2 Git / 计划

| 操作 | 说明 |
|------|------|
| 新建分支 `phase9/p9.1-drawer-visual` | 用户要求「新开分支再做」 |
| 更新 `.cursor/plans/phase_9_hud_polish_5e3d5977.plan.md` 中 P9.1 todo 为 completed | 与计划追踪同步（若仓库中已合并可忽略） |

### 3.3 文档

| 操作 | 说明 |
|------|------|
| P9.0 | 吸收对照已并入 **Design Spec §3.4**；原独立清单文件已移除 |
| 本报告 | 记录 P9.1 **最终决策**与**已执行操作**，便于评审与 P9.2+ 引用 |

---

## 4. 验收建议（手动）

1. 选中一部电影：抽屉打开，**标题区固定**，正文可滚，**无原生滚动条**。
2. 长 overview + 长 cast：**仅正文区域滚动**，标题与分割线始终可见；Cast **无内嵌滚动条**。
3. **TMDB / IMDb** 链接新开页正确；无 `imdb_id` 时仅 TMDB。
4. 窄屏 / `sm` 以上：抽屉宽度在 **`max-w-lg`** 与 **`w-3/4`** 规则下表现合理。
5. 回归：射线选中、`selectedMovieId` 清空、关闭抽屉、`SHEET_OPEN_EASE` 动效与 Phase 4.3 一致。

---

## 5. 明确不在 P9.1 的内容

- P9.2：流派 Badge 染色、抽屉内流派全量、`MovieTooltip` 流派一致。
- P9.3：Tooltip 标题年份。
- P9.4：InfoModal 与 Drawer 排版对齐。
- P9.5：`?theme=` 与 `<html data-theme>`。
- P9.6：Design Spec / 视觉总表文档同步。

---

## 6. 版本说明

- **报告性质**：汇总 P9.1 交付时的**最终**决策与操作；中间迭代（例如仅整页滚动、再改回头固定头）已合并进上文「最终」表述。  
- **若与代码不一致**：以 `frontend/src/components/Drawer.tsx` 当前实现为准，并建议更新本报告对应小节。

---

*文档版本：Phase 9.1 收口报告（P9.1）。*
