# Phase 9.5（P9.5）— URL `?theme=` 查询与 HUD 亮暗切换 — 实施报告

> **范围**：仅 Phase 9.5。在 `App` 挂载时读取查询参数，驱动 `<html>` 上的主题标记与 `dark` class，从而切换 shadcn / Tailwind 所依赖的 CSS 变量与 `dark:` 变体。**不**改 Three.js 场景配色、**不**改 `galaxy_data` 契约。  
> **主文件**：`frontend/src/hooks/useThemeFromQuery.ts`、`frontend/src/App.tsx`、`frontend/index.html`、`frontend/src/index.css`  
> **计划来源**：`.cursor/plans/phase_9_hud_polish_5e3d5977.plan.md`（P9.5 条目）  
> **Git 分支（实施时）**：`phase/p9-5-theme-query`（示例提交信息：`feat(hud): P9.5 URL ?theme=light|dark toggles HUD tokens (dataset + dark class)`）

---

## 1. 目标与边界（计划对齐）

| 计划项 | 最终处理 |
|--------|----------|
| `App` mount 时读 `URLSearchParams`，命中 `light` / `dark` 时写 `document.documentElement.dataset.theme` | **已实现**：`useThemeFromQuery` 内 `useEffect` 执行一次 |
| 默认仍为 dark；无 query 时「不动」语义 | **已实现**：无合法参数时 `delete root.dataset.theme`，并保证回到深色 HUD（见下文决策） |
| shadcn 通过 CSS 变量响应浅色；不动 canvas | **`App.tsx` 未改**：主舞台仍为 `bg-black` / 固定黑底 canvas 宿主 |
| `?theme=` 变更监听（stretch） | **未做**：仅首屏挂载读一次；改 query 需刷新页面才生效 |

---

## 2. 最终产品与技术决策（汇总）

### 2.1 查询参数契约

1. **参数名**：固定为 `theme`（即 `?theme=light`、`?theme=dark`）。  
2. **合法值**：仅 **`light`** 与 **`dark`** 精确匹配（大小写敏感，与常见浏览器 query 行为一致）。  
3. **其它或缺失**：视为「未通过 URL 指定主题」，走 **默认深色 HUD** 恢复逻辑（见 2.3）。

### 2.2 同时使用 `data-theme` 与 `class="dark"`

计划原文强调在 `<html>` 上写 **`dataset.theme`**（即 `data-theme` 属性）。本仓库的 Tailwind v4 配置为 **`@custom-variant dark (&:is(.dark *));`**，即 `dark:` 工具类依赖 **祖先节点带 `.dark`**，而非仅依赖 CSS 变量。

**决策**：

1. **`?theme=light`**：设置 `html.dataset.theme = 'light'`，并 **`classList.remove('dark')`**，使 `dark:` 变体不生效，与浅色语义一致。  
2. **`?theme=dark`**：设置 `html.dataset.theme = 'dark'`，并 **`classList.add('dark')`**，满足计划「写入 dataset」与 Tailwind 深色变体同时成立。  
3. **无合法参数**：**删除** `data-theme`，并 **`classList.add('dark')`**，回到与 dev 默认一致的深色 HUD。

### 2.3 默认深色：静态 `index.html` 与运行时一致

实施前 `<html>` 无 `class="dark"` 时，`.dark { … }` 中的深色 token **不会**作用在文档根上，易出现「变量与 `dark:` 不一致」的灰区。

**决策**：在 **`frontend/index.html`** 的根节点上增加 **`class="dark"`**，使首屏（含 Loading）在 JS 运行前即处于 shadcn 深色变量体系；与「产品默认 dark」一致。  
「无 query 时不动 `<html>`」在计划中的含义落实为：**不通过 URL 逻辑写入 `data-theme`**；静态模板上的 `class="dark"` 属于基线约定，与「仅在有 query 时设置 `dataset.theme`」不冲突。

### 2.4 浅色 token：`html[data-theme="light"]` 显式块

在 **`frontend/src/index.css`** 中于 `.dark { … }` **之前**增加 **`html[data-theme="light"] { … }`**，内容与 `:root` 中浅色 shadcn 变量块对齐（含 chart / sidebar 等同一套键）。

**额外决策**：`:root` 上存在写死的 **`color: #e5e7eb`**、**`background-color: #020617`**（历史遗留，偏「暗色阅读」）。在仅移除 `.dark`、依赖 `:root` 变量切浅色时，**继承色仍可能偏灰**。因此在 `html[data-theme="light"]` 规则首行增加：

- `color: var(--foreground);`  
- `background-color: var(--background);`  

与同规则内随后定义的 `--foreground` / `--background` 一起解析，保证浅色 HUD 下根节点字面色与 token 一致。

### 2.5 可观测性（开发环境）

在 **`import.meta.env.DEV`** 下，当 URL 显式命中 `light` 或 `dark` 时 **`console.log('[useThemeFromQuery] applied', { theme })`** 一次，便于本地验收；生产构建不包含该日志路径的实质输出依赖（由打包裁剪行为决定，此处仅为 dev 辅助）。

### 2.6 明确不做的内容（与计划一致）

1. **不改 WebGL / shader / 场景清色**：canvas 区域仍为应用层黑色宿主。  
2. **不监听 `popstate` / `hashchange` / `history.pushState`**：未实现「改 query 不刷新即生效」。  
3. **不扩展** `next-themes` 等第三方主题栈：保持单文件 hook + 现有 CSS 结构。

---

## 3. 实施操作清单（按文件）

| 文件 | 操作 |
|------|------|
| `frontend/src/hooks/useThemeFromQuery.ts` | **新建**：导出 `useThemeFromQuery()`，在 `useEffect` 中读取 `theme` query 并更新 `document.documentElement` 的 `dataset.theme` 与 `dark` class |
| `frontend/src/App.tsx` | **修改**：在 `App` 组件顶层调用 `useThemeFromQuery()` |
| `frontend/index.html` | **修改**：`<html lang="en" class="dark">` |
| `frontend/src/index.css` | **修改**：插入 `html[data-theme="light"] { … }` 整块（浅色变量 + 根节点 color/background 覆盖） |

---

## 4. 验收方式（建议）

| 步骤 | 预期 |
|------|------|
| 打开 `/`（无 `theme` 参数） | 深色 HUD；`html` 无 `data-theme`（或属性被删除后不存在）；存在 `class="dark"`；canvas 区域仍黑底 |
| 打开 `/?theme=light` | 浅色 HUD；`html` 含 `data-theme="light"`；**无** `dark` class；canvas 仍黑底 |
| 打开 `/?theme=dark` | 深色 HUD；`data-theme="dark"`；存在 `dark` class |
| 刷新切换 query | 每次完整加载后状态与上表一致（因未做 SPA 级 query 订阅） |

---

## 5. 与 Phase 9 其它子项的关系

- **P9.6 文档同步**（Design Spec / 视觉参数总表等）不在本报告交付范围内；若需在产品文档中登记「dev 验收用 `?theme=`」，由 P9.6 或单独文档任务跟进。  
- **P9.1–P9.4** 的 Drawer / Genre / InfoModal 等改动与本条正交；本项仅增加全局主题入口，不修改上述组件业务逻辑。

---

## 6. 风险与备注（落地结论）

| 风险 | 对策（已采纳） |
|------|----------------|
| 仅改 CSS 变量、`dark:` 仍指向旧语义 | **`?theme=light` 时移除 `html` 的 `dark` class** |
| `:root` 写死灰字/深蓝底干扰浅色 | **`html[data-theme="light"]` 上覆盖 `color` / `background-color`** |
| 浅色 HUD 与黑底 canvas 反差大 | 与计划一致：**定位为 dev / 验收用途**，不做 canvas 侧配色适配 |

---

*报告日期：2026-04-28（与仓库 Phase 9 计划周期一致时可作为实施记录锚点）。*
