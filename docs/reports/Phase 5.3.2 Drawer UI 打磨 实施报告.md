# Phase 5.3.2 — Drawer UI 打磨实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — Phase 5.3「交互增强」— **5.3.2 Drawer UI 打磨**  
> **计划 Todo ID**: `p5-3-2-drawer-polish`（YAML frontmatter 中 **`status: completed`**）  
> **关联评估 Issue**: H3（小窗口下海报高度/尺寸不理想）、H4（Movie detail 界面层次单调）、H5（缺省字段统一显示「—」不优雅）  
> **报告日期**: 2026-04-19  
> **实施分支**: `phase-5-3-2-drawer-polish`  
> **提交**: `55f1046` — `feat(ui): Phase 5.3.2 Drawer polish — responsive poster, sections, hide empty fields`  
> **主要变更文件**: `frontend/src/components/Drawer.tsx`  

---

## 1. 本次目标

依据 Phase 5 后续计划中 **5.3.2** 与评估报告中的 H3/H4/H5，对影片详情 **Sheet 抽屉**（`MovieDetailDrawerHud`）进行 UI 打磨：

| 代号 | 目标 |
| --- | --- |
| **H3** | 响应式优化海报区域：`AspectRatio`（2:3）在窄屏/窄抽屉下的宽度策略，避免海报在视觉上过小或比例失调。 |
| **H4** | 提升视觉层次：分区卡片化、标题区与内容区层次区分、适度微交互（过渡与 `tw-animate-css` 入场）。 |
| **H5** | 缺省字段**条件隐藏**：不再用统一占位符「—」填满无数据行；无 Cast 时整段 Cast 不展示。 |

**非目标**（本阶段未做）：

- 不改变 `MovieDetailDrawer` 与 Zustand 的选片/延迟打开逻辑。  
- 不恢复 Sheet 全屏遮罩/背景 blur（与 Phase 5.1.2 去除 overlay blur 的决策一致）；本阶段亦**未**在抽屉顶栏使用 `backdrop-blur`。  
- 不新增搜索、不改动数据管线。  

---

## 2. Git 与执行摘要

| 项 | 内容 |
| --- | --- |
| 分支 | `git checkout -b phase-5-3-2-drawer-polish`（相对当时 `main` 新开分支后实施） |
| 变更文件 | `frontend/src/components/Drawer.tsx`；计划文件 `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md`（Todo 状态） |
| 提交 | `55f1046` |

实施时在前端目录执行 **`npm run lint`**、**`npm run build`**，均已通过。

---

## 3. 代码改动说明（`Drawer.tsx`）

### 3.1 H3 — 响应式海报

- 海报外层增加 **`flex justify-center sm:justify-start`**：超窄宽度下海报相对抽屉**水平居中**，`sm` 及以上与原文案习惯一致**左对齐**。  
- `AspectRatio`（`ratio={2/3}`）的宽度类名：  
  - 默认：**`w-[min(100%,max(8.875rem,min(56vw,15rem)))]`** — 在 `100%` 父宽内，宽度不低于约 **8.875rem**、且随 **56vw** 与上限 **15rem（240px）** 取中间值再与父宽取 min，缓解「抽屉可用宽度很窄时海报过细」的问题。  
  - **`sm:`**：**`sm:w-[min(100%,15rem)]`** — 与计划中原 `max-w-[220px]` 量级接近的上限，略放宽至 **15rem**。  
- 圆角与边框：**`rounded-lg`**、**`border-border/80`**、**`shadow-sm`**。  
- **微交互**（尊重 **`prefers-reduced-motion`**）：**`motion-safe:`** 前缀下的 `transition`、`hover` 时边框与阴影略增强。  

### 3.2 H4 — 视觉层次与分区

- **`SheetHeader`**：**`bg-muted/25`**、**`border-border/80`**；标题 **`font-semibold tracking-tight`**。  
- **评分 / 票量 / 日期 / 流派 Badge**：增加短时 **`transition-colors`**，与顶栏层次一致。  
- **引语（tagline）**：左侧强调线 **`border-l-2 border-primary/35`**；使用与项目内 Tooltip 一致的 **`animate-in` / `fade-in-0` / `slide-in-from-left-2`**（`tw-animate-css`），并套 **`motion-safe:`**。  
- **Overview**：独立 **`<section>`**，**`rounded-lg border border-border/60 bg-card/40 p-3 shadow-sm`**，小标题统一为 **`text-[0.65rem] font-semibold uppercase tracking-wider`**。  
- **元数据（原线性 `dl`）**：归入 **「Details」** 区块，**`bg-muted/20`** 与边框/阴影与 Overview 区分。  
- **Cast**：独立 section；**`ScrollArea`** 使用 **`rounded-lg border-border/60 bg-card/30`** 与 **`motion-safe:hover:shadow-md`**。  
- 主滚动容器：**`gap-5`**、**`motion-safe:scroll-smooth`**。  

### 3.3 H5 — 缺省字段条件隐藏

- 新增 **`formatUsdPresent(n): string | null`**：仅当 **`Number.isFinite(n)` 且 `n > 0`** 时返回格式化的 USD 字符串；否则 **`null`**（不渲染 Budget/Revenue 行）。原 **`formatUsd`**（对 0 返回「—」）已移除，避免与「隐藏缺省」策略重复。  
- **`runtime`**：仅当 **`runtimeMin != null`** 时渲染 Runtime 行；使用顶层 **`runtimeMin = movie?.runtime ?? null`** 保证类型清晰。  
- **`original_language`**：仅当 **`trim()` 后非空** 时渲染 Language 行。  
- **`director` / `writers`**：仅当数组 **`.length > 0`** 时渲染对应行。  
- **`overview`**：仅当 **`trim()` 后长度大于 0** 时渲染整个 Overview **section**（不再显示「—」占位正文）。  
- **`cast`**：仅当 **`movie.cast.length > 0`** 时渲染整个 Cast **section**（移除「空列表时一条 `—`」的占位项）。  
- **`showMetaBlock`**：若上述元数据项与预算/票房**全部**无可展示内容，则**整个 Details 区块不渲染**，避免出现空壳标题。  

### 3.4 Storybook 行为变化说明

- **`Drawer.stories.tsx`** 未改文件名与导出；**`EmptyCast`** 故事仍使用无演职员表影片，但 UI 上 **Cast 区块整段消失**（符合 H5 验收）。若后续需要专门展示「无 Cast 时的说明文案」，可作为独立低优先级 story 再补。  

---

## 4. 验收对照（计划 5.3.2 与 Issue H3/H4/H5）

| 计划 / Issue | 验收要点 | 结果 |
| --- | --- | --- |
| H3 | 响应式调整 `AspectRatio` + 窄屏下 `max-w` 表现 | 已用 **vw + min/max + sm 断点** 宽度策略 + 居中/左对齐组合实现 |
| H4 | 分区、层次、微动效 | 已分区 **Overview / Details / Cast**，卡片化边框与阴影；tagline 使用 **`animate-in`** 等 |
| H5 | 缺省字段条件隐藏，非统一「—」 | 已按字段与区块级条件渲染；预算/票房以 **正数** 为展示前提 |

---

## 5. 验证建议

1. **应用内**：点击星系中粒子，打开右侧抽屉，在浏览器窗口宽度 **&lt; `sm`** 与 **`≥ sm`** 下切换，观察海报宽度与对齐。  
2. **缺省数据**：选取无 overview、无 cast、无 budget/revenue 或 runtime 为空的影片（若数据集中存在），确认对应区块或行不出现「—」占位。  
3. **Storybook**：打开 **Drawer → Default / NoTagline / LongCastList / EmptyCast**，确认 **EmptyCast** 无 Cast 区块。  
4. **无障碍与动效**：在系统开启 **减少动画** 时，确认 **`motion-safe:`** 下强动效弱化或不起作用。  
5. **回归**：确认 **5.1.2** 相关行为不变（抽屉仍无全屏 overlay blur；本改动仅作用于 `Drawer` 内容样式与条件渲染）。  

---

## 6. 后续可选改进（不在 5.3.2 范围内）

- 为「无 Cast」增加可选 **一行说明**（例如「演职员表未收录」），与「整段隐藏」二选一由产品决定。  
- **IMDb** 等扩展字段若在类型中已有但 UI 未展示，可单独开项做「有数据才展示」的区块。  
- 与 **5.3.3 搜索** 联动时，在抽屉内增加「在结果中高亮」等交互。  

---

## 7. 文档与计划同步

- 本报告路径：`docs/reports/Phase 5.3.2 Drawer UI 打磨 实施报告.md`  
- 计划文件 `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` 中 **`p5-3-2-drawer-polish`** 的 **`status`** 为 **`completed`**（与本次交付一致）。  

---

## 8. 参考链接（仓库内）

- Phase 5 后续计划（5.3.2 原文）：`.cursor/plans/phase_5_follow-up_plan_64727854.plan.md`  
- Phase 5.0 评估报告（H3/H4/H5 出处）：`docs/reports/Phase 5.0 项目全面评估与测试报告.md`  
- 既有 Drawer 功能说明（历史交付）：`docs/reports/Phase 4.3 HUD 档案详情抽屉 Drawer 实施报告.md`  
