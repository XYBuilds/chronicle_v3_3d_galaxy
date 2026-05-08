# Phase 21.5 · P21.5 SearchBar 浅色模式 Tab 与输入框 — 实施报告

> 对应 [Phase 21 计划](../../.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md) 中 **P21.5**（`p215-light-mode-tab-fix`）：浅色主题（**`?theme=light`**）下 **Movie / Person / Genre** 三个 tab 的 **选中态** 与 **未选中态** 对比清晰；**不修改** [`button-variants.ts`](../../frontend/src/components/ui/button-variants.ts)。  
> 在同一工作流中，根据 **P9.5**（浅色 HUD token 叠在 **黑色 WebGL 画布** 上）对 **movie/person 搜索输入框** 做了 **idle 弱化** 与 **浅色 idle 下 query 字色** 修正，本节一并列为 **最终决策** 与 **最终操作**。  
> **报告日期**：2026-05-08。

---

## 1. 目标与最终决策

### 1.1 Tab 选中态（计划 P21.5 核心）

| 议题 | 最终决策 |
|------|----------|
| 是否改 `buttonVariants` | **否**。仅改 **SearchBar** 内 tab 的 **`className` 叠加**，避免影响全局 Button 语义。 |
| 计划内备选 vs `default` variant | 计划曾给出 **`default`** variant（浅色对比强、深色可能过亮）与 **条件 class** 两案；**最终采用条件 class**：选中 / 未选中均先套 **`buttonVariants({ variant: 'ghost', size: 'xs' })`**，再叠 **浅色 / 深色** 不同的背景与字色。 |
| **浅色（无 `.dark`）选中 tab** | **`bg-foreground text-background shadow-sm`**，hover：**`hover:bg-foreground/90 hover:text-background`**，在 **黑画布** 上形成清晰的 **深底浅字** 选中块。 |
| **浅色未选中 tab** | **`bg-transparent text-muted-foreground`**，**`hover:bg-muted/50 hover:text-muted-foreground`**。 |
| **深色（`.dark`）选中 tab** | **`dark:bg-secondary dark:text-secondary-foreground`**，hover：**`dark:hover:bg-secondary/80 dark:hover:text-secondary-foreground`**，与原先 **`secondary`** 块感对齐，避免浅色那套「死黑大块」在深色 HUD 上过抢。 |
| **深色未选中 tab** | **`dark:hover:bg-muted/50`**，与 ghost 在深色下的 hover 协调。 |
| **无障碍** | 维持 **`aria-pressed={hudTab === tab}`**；**`buttonVariants`** 自带的 **`focus-visible:ring`** 等仍生效。 |

### 1.2 搜索输入框（浅色 HUD + P21.4 `group-data`）

| 议题 | 最终决策 |
|------|----------|
| 问题背景 | **`?theme=light`** 时 **`html` 无 `.dark`**（见 [`useThemeFromQuery.ts`](../../frontend/src/hooks/useThemeFromQuery.ts)），Tailwind **无前缀** 类作用于 **浅色 token**；HUD 仍叠在 **黑色画布** 上。原 **`border-input` + `bg-background/30`** 在 idle 时像 **半透明白卡片**，视觉过重。 |
| **浅色 + idle**（`group-data-[state=idle]`） | **弱白边 + 极低白透明度底**：**`border-white/10`**、**`bg-white/[0.05]`**、**`shadow-none`**，与 P21.4 的「idle 少遮挡」一致方向。 |
| **浅色 + active**（`group-data-[state=active]`） | **略抬对比**：**`border-white/22`**、**`bg-white/[0.14]`**、**`shadow-sm`**；仍偏 **玻璃感**，不回到厚重 **`border-input` + 高不透明度白底**。 |
| **深色** | **保持 P21.4 口径**：idle **`dark:border-input dark:bg-background/30`**；active **`dark:bg-background/80`**（与 **`border-input`** 一致）。 |
| **浅色 idle 下 query 不可见** | 弱化底后 **`text-foreground`**（深色字）贴在画布上 **对比不足**。**最终**：idle 使用 **`text-white`**、**`placeholder:text-white/50`**；**active** 恢复 **`text-foreground`** 与 **`placeholder:text-muted-foreground`**（略亮底上读正文）。 |
| **深色** 字色 | 显式 **`dark:group-data-[state=idle]:text-foreground`** 与 **`…placeholder:text-muted-foreground`**，避免浅色 idle 的白字规则 **泄漏到深色**。 |
| **过渡** | **`transition-[background-color,border-color,box-shadow,color] duration-150`**，idle ↔ active **含字色** 平滑。 |
| **未改范围** | **Genre** 下仍为 **`sr-only`** 的 **`data-galaxy-search-input`**；**`button-variants.ts`**、**索引 / normalize / store** 均未因本项改动。 |

---

## 2. 最终操作清单（建议执行顺序）

| 步骤 | 操作 |
|------|------|
| 1 | **新开 Git 分支**（与 Phase 习惯一致），例如 **`feat/p21-5-searchbar-tab-light-contrast`**，在其上开发与合并。 |
| 2 | 修改 **[`frontend/src/components/SearchBar.tsx`](../../frontend/src/components/SearchBar.tsx)** — **Tab**：将 **`hudTab === tab ? 'secondary' : 'ghost'`** 改为 **统一 `ghost`**，并叠 **§1.1** 中的 **浅色默认 + `dark:`** 选中 / 未选中 class。 |
| 3 | **提交**（示例信息）：**`fix(search): P21.5 light-mode SearchBar tab selected contrast`**，说明 **不动 `button-variants`**。 |
| 4 | **迭代（同一组件）** — **Input**：为 **无 `dark:`** 路径写入 **§1.2** 的 **白边 / 低 alpha 白底** 与 **idle 白字、active 深色字**；为 **`dark:`** 路径写回 **P21.4** 的 **input** 边框与背景及字色占位。 |
| 5 | **本地验证**：**`npm run test --workspace=frontend`**（Vitest）通过；可选 **`npm run build --workspace=frontend`**。 |
| 6 | **人工验收**：**`?theme=light`** 下 tab **选中一眼可辨**；idle **输入框不抢眼**、**已输入 query 为白色可读**；**`?theme=dark` 或默认深色** 下 tab 与输入框 **无明显回退**；键盘 **Tab** 焦点环仍可见。 |

---

## 3. 交付物清单（路径）

| 类型 | 路径 | 说明 |
|------|------|------|
| Tab + Input 最终实现 | [`frontend/src/components/SearchBar.tsx`](../../frontend/src/components/SearchBar.tsx) | **Tab**：`ghost` + 条件 **`bg-foreground` / `dark:bg-secondary`** 等；**Input**：**`group-data-[state=*]`** 下 **浅色玻璃 + 字色** 与 **`dark:`** 下 **P21.4 风格** |
| 主题与 DOM 契约 | [`frontend/src/hooks/useThemeFromQuery.ts`](../../frontend/src/hooks/useThemeFromQuery.ts) | **`theme=light`** → **`data-theme="light"`** 且 **移除 `html.dark`**，供本报告 **Tailwind 分层** 理解 |
| 画布与 token 说明 | [`frontend/src/index.css`](../../frontend/src/index.css) | **P9.5**：**`html[data-theme="light"]`** 覆盖 HUD token，**画布保持黑色** |
| 计划引用 | [`.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md`](../../.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md) | **P21.5** 原文与验收条目 |

---

## 4. 行为与技术说明

### 4.1 为何用「默认类 = 浅色」+ `dark:` = 深色

- **`useThemeFromQuery`** 在 **`theme=light`** 时会 **`classList.remove('dark')`**，因此 **`dark:*` 不生效**，无前缀类即 **浅色 HUD 叠黑画布** 场景。  
- **`theme=dark`** 或未带参默认时 **`html` 带 `.dark`**，**`dark:*`** 生效，SearchBar 走 **深色 HUD** 既有视觉。

### 4.2 与 P21.4 的关系

- **`data-state="idle" | "active"`** 与 **`group`** 仍由 **P21.4** 定义；本项 **input** 的 **浅色** 规则全部挂在 **`group-data-[state=idle|active]`** 上，与外层 **idle/active** 语义一致。  
- **深色** 下 **input** 的 **背景 / 边框** 与 **P21.4** 的 **`bg-background/30` · `/80`** 对齐；**tab 条** **`group-data-[state=idle]:bg-muted/20`** 等 **未在本项重复改动**（除非后续全局再调）。

### 4.3 Tab 与 Input 的验收要点（摘要）

- **Tab**：浅色选中 **深底浅字**；深色选中 **secondary 块**；**`aria-pressed`** 正确。  
- **Input**：浅色 **idle** 低对比玻璃 + **白字**；**active** 略强玻璃 + **深色字**；深色全程 **foreground / muted** 体系。

---

## 5. 验收建议（手工）

1. 打开 **`?theme=light`**：未操作搜索区前，**input** 应为 **极淡玻璃**，**query 为白色**；**tab** 选中项与未选中 **对比明显**。  
2. **鼠标移入** SearchBar 或 **聚焦** 搜索框：**active** 后 **input** 略实、**正文为深色**、占位符回到 **muted** 系。  
3. **`?theme=dark`**（或默认）：**tab** 与 **input** 与改前 **P21.4 + secondary tab** 时代 **无突兀回退**。  
4. **键盘**：**Tab** 在 tab 与搜索框间移动，**focus ring** 仍清晰。

---

## 6. 分支与提交说明（参考）

- **分支名**（实施时）：**`feat/p21-5-searchbar-tab-light-contrast`**（或与 PR 一致的其他名）。  
- **Tab 对比度** 可与 **Input 浅色迭代** 分 **两次 commit** 便于 review，或 **单次合并提交**；以仓库 **`git log`** 为准。  
- 本报告 **不绑定** 具体 SHA，避免与读者本地 **cherry-pick / squash** 不一致；以 **`SearchBar.tsx` 当前 §1 行为** 为 **SSOT**。

---

## 7. 未纳入本项的内容

| 内容 | 说明 |
|------|------|
| **P21.6** 电影联想条数上限 | 见计划 **P21.6**，非本报告范围。 |
| **P21.7** 文档总同步 | 全局 SSOT 同步；本文件为 **P21.5 专题报告**。 |
| **`button-variants.ts`** | 按决策 **未修改**。 |

---

*文档结束。*
