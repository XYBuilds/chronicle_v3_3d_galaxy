# Phase 21.4 · P21.4 SearchBar idle / active 双态 — 实施报告

> 对应 [Phase 21 计划](../../.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md) 中 **P21.4**（`p214-searchbar-idle-active`）：顶部 **SearchBar** 在未交互时尽量 **透明 + 弱描边**，减少对星空的遮挡；在 **悬停 / 焦点在内 / 联想面板展开** 任一成立时切换为 **实底 + 模糊 + 阴影** 的 **active** 态。迭代中又对用户可见层做了 **idle 下 input 与 tab 条透明度分级**，本节 **§1** 为最终口径。  
> **报告日期**：2026-05-08。

---

## 1. 目标与最终决策

| 议题 | 最终决策 |
|------|----------|
| 根节点与语义 | 联想面板容器（**`ref={panelRootRef}`**，仍承担 **document mousedown 外部关闭** 的包含判定）设置 **`data-state="idle" \| "active"`**，供 Tailwind **`data-[state=*]`** 与 **`group-data-[state=*]`** 使用。 |
| **active** 触发条件（三者其一即可） | **`hoverInside`**：鼠标进入容器任意区域；**`focusInside`**：焦点在容器内任意可聚焦子节点（**`onFocusCapture` / `onBlurCapture`**，仅在 **`relatedTarget` 不在容器内** 时清除 focus 态）；**`panelVisible`**：与既有逻辑一致 — **`hudTab !== 'genre'`** 且 **`listOpen && canShowList`**（movie/person 联想列表展开）。 |
| **idle** 视觉（外层面板） | **透明背景**、**弱边框**（**`border-border/40`**）、**无阴影**、**无 backdrop-blur**。 |
| **active** 视觉（外层面板） | **`bg-popover/95`**、**`backdrop-blur-md`**、**`shadow-lg`**、较强边框（**`border-border/80`**）；过渡 **`transition-[background-color,backdrop-filter,box-shadow,border-color] duration-150`**。 |
| **`group` 用途 | 根节点加 **`group`**，使 **movie/person** 下可见 **`<input>`** 能用 **`group-data-[state=idle]` / `[state=active]`** 前缀类随面板状态切换背景，而不把 **`data-state`** 复制到 input 上。 |
| **Input（movie/person）idle / active 背景** | **idle**：**`bg-background/30`**（相较初版 **`/40` 再提高一档通透度）；**active**：**`bg-background/80`**。保证 idle 时仍有可读底色，而非全透明。 |
| **Tab 条容器 idle / active 背景** | 原固定 **`bg-muted/40`** 改为随面板状态：**idle** **`bg-muted/20`**（相对 **`/40` 提高两档通透度）；**active** **`bg-muted/40`**。增加 **`transition-colors duration-150`** 与外层过渡一致。 |
| **Genre tab** | 无下拉联想时 **`panelVisible === false`**；**active** 仍可由 **悬停** 或 **焦点在 tab / 徽章** 等子控件触发，避免整块长期「糊」在画面上。 |
| **阻塞态 `isBlocked`** | 维持既有 **`pointer-events-none`** 与整体上壳 **`opacity-60`**；**data-state** 仍可随计划逻辑变化，交互受限行为不变。 |
| **未采纳 / 非本项** | **P21.5**（浅色模式 tab 选中对比度）为独立条目，不在本报告范围；管道、索引、normalize **均未改动**。 |

---

## 2. 最终操作清单（执行顺序）

| 步骤 | 操作 |
|------|------|
| 1 | **新开 Git 分支** **`feat/p21-4-searchbar-idle-active`**，在其上开发与后续合并（与 Phase 计划「先分支再改」一致）。 |
| 2 | 修改 **[`frontend/src/components/SearchBar.tsx`](../../frontend/src/components/SearchBar.tsx)**：新增 **`hoverInside` / `focusInside`**；**`isActive = hoverInside \|\| focusInside \|\| panelVisible`**；面板 **`data-state`**、**`onMouseEnter` / `onMouseLeave`**、**`onFocusCapture` / `onBlurCapture`**（含 **`contains(relatedTarget)`** 判定）。 |
| 3 | 同一文件：面板 **`className`** 按 idle/active 拆分背景、边框、阴影、blur；根节点 **`group`**；input 使用 **`group-data-[state=idle]:bg-background/40`** 与 **`…active…/80`**（初版）。 |
| 4 | **迭代（视觉反馈）**：在同一组件内将 idle 下 **input** 调整为 **`bg-background/30`**（一档）；**tab 条** 改为 **`group-data-[state=idle]:bg-muted/20`**、**`group-data-[state=active]:bg-muted/40`**（两档），并加 **`transition-colors`**。 |
| 5 | **本地验证**：**`frontend`** 下 **`npm run build`**（**`tsc -b && vite build`**）通过，确认 Tailwind 任意变体（如 **`group-data-[state=idle]`**）可编译。 |
| 6 | **提交**：核心双态已有提交 **`a6d81b0`**（**`feat(search): P21.4 SearchBar idle/active panel state`**）。若 §1 中 **input `/30`、tab（idle `muted/20`，active `muted/40`）** 尚未单独入库，合并前可与当前分支其余改动 **一并 commit**。 |

---

## 3. 交付物清单（路径）

| 类型 | 路径 | 说明 |
|------|------|------|
| SearchBar 双态与透明度 | [`frontend/src/components/SearchBar.tsx`](../../frontend/src/components/SearchBar.tsx) | **`data-state`**、**`isActive`**、hover/focus、**`group`**、面板与 input/tab 的 Tailwind 类 |
| 计划引用 | [`.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md`](../../.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md) | **P21.4** 原文需求与验收条目 |

---

## 4. 行为与技术说明

### 4.1 `panelVisible` 与 Genre

- **`panelVisible`** 仍为 **`hudTab !== 'genre' && listOpen && canShowList`**。Genre 模式下列表不打开，故 **仅靠 hover/focus** 进入 active，符合「少遮挡」目标。

### 4.2 焦点与子元素

- **`onFocusCapture`**：任一内部控件获焦 → **`focusInside = true`**。  
- **`onBlurCapture`**：若 **`relatedTarget`** 仍在 **`panelRootRef`** 内（例如从搜索框切到联想 **`<button>`**），**不**清除 **`focusInside`**，避免列表交互时面板闪回 idle。

### 4.3 Query 保留

- 回到 **idle** 仅改变壳层与控件外观，**不**清空 **`searchQuery`**；与计划「blur + 鼠标离开 → idle，但 query 保留」一致。

### 4.4 与 P21.3（Genre AND）的关系

- **Genre** 分支仍含 **`sr-only`** 的 **`data-galaxy-search-input`**（Cmd/Ctrl+K）；双态挂在 **同一面板根**，Genre 下悬停/聚焦同样触发 **active**。

---

## 5. 验收建议（手工）

1. **冷启动未交互**：面板整体接近 **线框 + 透明**，星空遮挡最小；**input** 为 **浅底 `/30`**，**tab 条** 为 **`muted/20`**。  
2. **鼠标移入面板任意处（含 tab、留白）**：立即 **active**（实底、blur、阴影；input **`/80`**，tab 条 **`muted/40`**）。  
3. **聚焦搜索框**：**active**；失焦且鼠标离开且无联想展开 → **idle**，**输入框文字仍在**。  
4. **输入满足最小长度且联想展开**：**panelVisible** 为真期间保持 **active**；点击外部关闭列表后，若已无 hover/focus → **idle**。  
5. **Genre tab**：悬停或 Tab 聚焦徽章/tab → **active**；移开 → **idle**（无选流派时 scene 行为不变，仍由 P21.3 逻辑约束）。  
6. **浅色 / 深色主题** 各看一眼：idle 不过暗也不过亮；active 与 HUD 其余面板协调。

---

## 6. 分支与提交说明（参考）

| 项 | 内容 |
|----|------|
| 开发分支 | **`feat/p21-4-searchbar-idle-active`** |
| 已记录提交（核心 P21.4） | **`a6d81b0`** — *feat(search): P21.4 SearchBar idle/active panel state* |
| 后续增量 | **idle 下 input `/30`、tab（idle `muted/20`，active `muted/40`）** 若单独提交，建议在消息中标注 *style(search)* 或 *polish(search)* 以便追溯。 |

---

## 7. 风险与回滚

| 风险 | 缓解 |
|------|------|
| **`group-data-[state=*]`** 与 Tailwind 版本不一致导致类未生成 | 已用 **`npm run build`** 验证；若 CI 才暴露，检查 **content globs** 是否覆盖 **`SearchBar.tsx`**。 |
| **焦点**在浏览器与辅助技术下 **`relatedTarget`** 异常 | 现行 **`contains`** 判定与 React **capture** 阶段为主流写法；若极端环境出问题，可再评估 **`focusin`/`focusout`** 文档监听（非当前必要）。 |
| **回滚** | 回退 **`SearchBar.tsx`** 中与 **`hoverInside`/`focusInside`/`isActive`/`data-state`** 及 **`group-*`** 相关的改动，即可恢复常驻 **`popover`** 壳层（失去 idle 降噪）。 |
