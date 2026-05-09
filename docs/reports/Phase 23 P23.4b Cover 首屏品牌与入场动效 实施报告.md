# Phase 23 — P23.4b Cover 首屏品牌与入场动效 — 实施报告

本文档记录 **P23.4b**（计划见 `.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md` 中「P23.4b Cover 交互动画细化」）在本次迭代中的 **最终决策** 与 **最终代码操作**，作为交付与回溯依据。视觉像素级 SSOT 仍以计划中的 Figma 为准；本报告描述的是当前仓库已落地的实现。

后续对 **Cover 角标 / Loading 行为 / 进度条位置** 的补充决策见对话追溯 [P23.4b HUD 与 Loading 调整](c9584cfd-3dd5-4c5f-9618-ddead4bfb875)。

---

## 1. 范围与不做

**做**

- 首屏宇宙黑与浅灰品牌色 **CSS 变量化**，供 Loading、Cover、主画布容器复用。
- Loading：品牌分轨字色、浅灰底、**左下角**进度文案（`{percent}%` + 阶段词）；**不在** Loading 内渲染右上角 HUD（避免与全屏 Loading / `cover-loading-today` 叠层冲突）。
- **主场景 `started`**：右上角 **Info / Language / Fullscreen** 与 cover 共存（`z-40` 高于 cover 品牌层 `z-30`）；SearchBar、Timeline、Drawer 等仍在 `!coverMode` 内，避免 cover 上误触。
- Cover 就绪后 **约 1000ms** 的入场：页面浅灰幕、品牌字色与透明度动效（见第 2.3 节）。
- 移除 Loading/Cover 品牌区上曾使用的 **text-shadow** 等泛光；不保留 cover/loading 背景的 **渐变动画**（本阶段未引入）。
- 修复退出 cover 时 **全屏浅灰/白闪**：根因与修复见第 2.6 节。

**不做（本报告对应代码未扩展）**

- 不改变 P23.4 的 hover / click / Enter·Space / 相机语义（仅叠在既有行为之上的视觉层）。
- 未在本次中更新 Design Spec / Tech Spec 正文（计划归 **P23.7** 文档收口）。

---

## 2. 最终决策

### 2.1 设计 Token（`frontend/src/index.css`）

| Token | 值 | 用途 |
|--------|-----|------|
| `--cosmos-universe-bg` | `#000000` | 「宇宙场」底色：主界面与 WebGL 宿主背景；Loading / Cover 上 **the · movie · cosmos** 的深色字（压在浅灰底上）；**cosmos** 在 Cover 黑底阶段字色保持宇宙黑（见 2.3）。 |
| `--cosmos-brand-muted` | `#f2f2f2` | 浅灰：Loading 全屏底；Cover 入场幕布起点；**today** 与 Cover 结束后 **the / movie** 字色。 |

Tailwind `@theme inline` 中映射为 `--color-cosmos-universe-bg`、`--color-cosmos-brand-muted`，便于工具类或后续扩展。

### 2.2 Loading（`frontend/src/components/Loading.tsx`）

- **背景**：`bg-[color:var(--cosmos-brand-muted)]`（浅灰场）。
- **the / movie / cosmos**：统一 `text-[color:var(--cosmos-universe-bg)]`（宇宙黑压在浅灰底上，可读）。
- **today**：`text-[color:var(--cosmos-brand-muted)]`；**不使用 text-shadow**。
- **进度行**：`{percent}%` 与阶段文案置于 **左下角**（`bottom-8 left-8`，`sm:bottom-10 sm:left-12`），与左侧竖排大标题同侧，保留 `max-w` 与 `text-left` 便于折行。
- **右上角 HUD**：**不渲染**。历史上曾在 `gzipDone && indexTerminal`（含 `cover-loading-today`）时在 Loading 内叠一组 outline 角标；按产品要求 **Loading 全阶段不显示** 该组按钮，角标仅由主界面 `App.tsx` 在 `phase === 'started'` 时提供（见 2.5）。
- **卸载时机**：不在 Loading 内部做多段「cosmos-fade → brand-ready」延迟；galaxy + index 就绪后由 App 切相；**Cover 的 1s 入场** 在 `CoverBackdrop` + 全屏幕布上实现。

### 2.3 Cover 入场 1000ms（`CoverBackdrop` + CSS）

与计划「加载完成后约 1s 过渡到 cover 就绪」对齐，由以下组成：

1. **全屏幕布**（`App.tsx` 内 `cosmos-cover-entry-page-shade`）：`background-color` 从 `--cosmos-brand-muted` 动画到 **transparent**，时长 **1000ms**，与品牌入场同步，用于从 Loading 浅灰场过渡到露出黑画布。
2. **the / movie**：**仅 color** 动画，从 `--cosmos-universe-bg` → `--cosmos-brand-muted`，**1000ms**，`ease-out`，`forwards`（类名 `.cosmos-cover-entry-the-movie`）。
3. **cosmos**：**字色固定** `--cosmos-universe-bg`，**不参与变到浅灰**；在 1000ms 内做 **opacity 1 → 0**（`.cosmos-cover-entry-cosmos-opacity`）。 settled 后为 `opacity-0`，避免在黑底上再画一条「黑字」线。
4. **today**：**字色** `--cosmos-brand-muted`；在 1000ms 内做 **opacity 0 → 1**（`.cosmos-cover-entry-today-opacity`）。

**`prefers-reduced-motion: reduce`**：上述 CSS 动画全部关闭；幕布直接透明；`CoverBackdrop` 内 `useState` 初始与 effect 将 `entrySettled` 视为已结束，直接应用 settled 类（the/movie 浅灰、cosmos 透明、today 不透明）。

### 2.4 主场景容器（`frontend/src/App.tsx`）

- `main` 与 `canvasHostRef` 容器使用 `bg-[color:var(--cosmos-universe-bg)]`，与 token 一致。

### 2.5 右上角 HUD 与 Cover 共存（`frontend/src/App.tsx`）

**问题**：`InfoButton`、`LanguageSwitch`、`FullscreenButton` 原与 SearchBar 等一同包在 `{!coverMode ? ( ... ) : null}` 内，进入 cover 后整段不渲染，导致 **cover 阶段右上角无角标**。

**决策**：在 **`phase === 'started'`** 且主界面已挂载的前提下，将上述三个按钮 **移出** `!coverMode` 条件，与 `HoverRing`、`MovieTooltip` 同级始终渲染；**`z-40`** 高于 cover 品牌叠层 **`z-30`**，保证可见可点。各按钮组件（如 `InfoButton`）在 class 中保留 **`pointer-events-auto`**，以抵消外层容器的 `pointer-events-none`（避免点击穿透）。

**未采纳**：cover 上强制 `styleMode="outline"` 与 Loading 时期一致；当前沿用默认 HUD 样式，若需与浅灰入场期对比可读性可再迭代。

### 2.6 退出 Cover 全屏闪动 — 根因与最终修复

**现象**：退出 cover 时出现全屏浅灰/白闪。

**根因**：`exitCoverIntoFocus` 将 `todayMovieId` 置为 `null` 后，若浅灰幕或 `CoverBackdrop` 使用 **`key` 依赖 `todayMovieId`**，React 会在同一退出路径上 **卸载旧节点、挂载新节点**。浅灰幕上的 class `cosmos-cover-entry-page-shade` 会 **重新执行** 自 `#f2f2f2` 起的 1000ms 动画，首帧即全屏浅场，表现为闪白/闪灰。`CoverBackdrop` 的 key 变化还会导致入场逻辑 **中途 remount**，加重异常帧。

**最终操作**：对浅灰幕与 `CoverBackdrop` **不使用随 `todayMovieId` 变化的 `key`**，保持单次 cover 会话内稳定挂载；在 `App.tsx` 用注释固化该决策。若未来需要在「换片 id」时强制重播入场，应使用独立 **`entryNonce`** 等信号，而非在退出时会被清空的 id。

---

## 3. 最终操作（文件与要点）

| 文件 | 操作摘要 |
|------|-----------|
| `frontend/src/index.css` | 在 `:root` 增加 `--cosmos-universe-bg`、`--cosmos-brand-muted`；`@theme inline` 映射；新增 `@keyframes` / 工具类：`cosmos-cover-the-movie-color`、`cosmos-cover-cosmos-opacity`、`cosmos-cover-today-opacity`、`cosmos-cover-page-shade-fade` 及对应 `.cosmos-cover-entry-*`；`prefers-reduced-motion` 分支。 |
| `frontend/src/components/Loading.tsx` | Token 化背景与字色；today 无阴影；**进度左下**；**移除** Loading 内右上角 HUD 及 `useEffect` 日志。 |
| `frontend/src/hud/CoverBackdrop.tsx` | 1000ms 入场：`entrySettled` + 上述 CSS 类；`prefersReducedMotion`；settled 日志。 |
| `frontend/src/App.tsx` | 主界面与 canvas 宿主使用 `--cosmos-universe-bg`；cover 分支内全屏幕布 + 品牌层 z-index；**移除**幕布与 `CoverBackdrop` 的 `todayMovieId` 驱动 `key`；**右上角三按钮**移出 `!coverMode` 与 cover 共存。 |

**Git 分支（早期会话）**：`p23.4b-cover-entry-brand`（若已合并或改名，以仓库实际为准）。

---

## 4. 验收建议（手工）

- DevTools：可见 `--cosmos-universe-bg`、`--cosmos-brand-muted`，且 Loading / App 主层有引用。
- **Loading**（含 galaxy-loading、index-loading、cover-loading-today）：浅灰底 + the/movie/cosmos 深色 + today 浅灰；**无**右上角 Info / 语言 / 全屏；**左下**可见 `{percent}%` 与阶段文案；无 text-shadow。
- **Cover**：约 1s 内幕布变浅透、the/movie 变浅色、cosmos 淡出、today 淡入；画布为黑；**右上角三按钮可见可点**。
- **退出 cover**：无全屏浅灰幕再次从头播放；品牌层 300ms opacity 淡出后卸载正常。
- 系统开启「减少动态效果」：入场无 CSS 动画，幕布透明，字色直接为 settled 状态。

---

## 5. 已知与后续

- **cosmos** 在 Cover 黑底阶段字色为宇宙黑且 opacity 动画至 0，视觉上主要依赖「淡出」而非读字；与「cosmos 不变色」决策一致。
- Design Spec 中 P23.4b 条目、Figma 链接与 MCP 对齐记录建议在 **P23.7** 一并更新。
- 若在极窄视口下左侧大标题与左下进度行重叠，可再调 `max-w` 或垂直偏移（当前与 transcript 一致）。

---

*报告已按仓库当前实现与对话 [P23.4b HUD 与 Loading 调整](c9584cfd-3dd5-4c5f-9618-ddead4bfb875) 修订；若后续提交有变，以 `git log` 与源文件为准。*
