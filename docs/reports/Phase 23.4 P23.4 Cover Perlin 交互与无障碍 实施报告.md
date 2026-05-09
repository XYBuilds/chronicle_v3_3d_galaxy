# Phase 23.4 · P23.4 Cover Perlin 交互与无障碍 — 实施报告

> 对应 [Phase 23 计划](../../.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md) 中 **P23.4**：  
> cover 阶段中心 Perlin 球**复用主体** hover（白圈 + `MovieTooltip`，字段与主体一致）；点击 / Enter / Space 进入 focus 并展开 drawer；相机角度沿用由 P23.3 + `exitCoverPreserveOrbit` 链路保证；补充无障碍与品牌层淡出。  
> 本报告汇总本次交付的**最终决策**与**最终操作**，并记录验收口径与已知边界。  
> **Git 证据**：分支 `feat/p23-4-cover-tooltip-keyboard-a11y`，提交 `823acac`。  
> **报告日期**：2026-05-09。

---

## 1. 目标与最终决策

### 1.1 Hover / Tooltip（与主体单一路径）

| 议题 | 最终决策 |
|------|----------|
| 白圈 | 继续使用 `HoverRing` + `galaxyInteractionStore` 的 `hoverAnchorCss` / `hoverPlanetRadiusCss`；cover 下由 `interaction.ts` 的 `planetAnchorMovieId()` 将 today 与 focus 的 anchor 逻辑对齐（**P23.3 已具备，P23.4 不重复实现**）。 |
| MovieTooltip | 仍由 `hoveredMovieId` 驱动，展示 **title + 主类型（`genres[0]`）**，与当前主体实现一致；**不增加** `compact` 等 cover 专用分支，避免双源维护。 |
| 字段演进 | 今后若主体 `MovieTooltip` 扩展字段，cover 侧自动跟随。 |

### 1.2 指针点击进入 focus

| 议题 | 最终决策 |
|------|----------|
| active 射线球命中 today | 维持既有逻辑：`pickAlongRay` 命中 today 时调用 `exitCoverIntoFocus()`（**P23.3 已具备**）。 |
| Perlin 壳层命中 today | **最终决策**：与主体一致走 `focusPlanetBeatsActiveAlongRay` 时，在 **cover + today** 下必须调用 `exitCoverIntoFocus()`，不得再因 early `return` 漏掉入口。 |
| 空白 / 非 today | 不进入 focus；拖拽 orbit 行为沿用 P23.3（与 `CLICK_MAX_MOVE_PX` 区分 click / drag）。 |

### 1.3 键盘与焦点

| 议题 | 最终决策 |
|------|----------|
| Enter / Space | 在 `App` 根级 `keydown` **捕获阶段**处理：当 `coverMode && todayMovieId != null` 时，若焦点不在 `input` / `textarea` / `contenteditable`，则 `preventDefault` + `stopPropagation` 并 `exitCoverIntoFocus()`。 |
| ESC | cover 阶段**无「取消 today」语义**：同一条件下对 **Escape** 仅吞掉事件（`preventDefault` + `stopPropagation`），不修改 `selectedMovieId` / 不退出 cover；focus 阶段 ESC 行为仍按既有 P22 链路。 |
| 无障碍焦点靶 | 在 `CoverBackdrop` 内增加居中、**默认 `pointer-events: none`** 的透明 `button`，`:focus-visible` 时允许指针并显示细 ring；`aria-label` 使用本地化模板 **`cover.todayFocusAriaLabel`**（含 `{{title}}`）。Tab 可达后 Enter/Space 与全局快捷键语义一致（捕获阶段会先处理）。 |

### 1.4 Cover 品牌层淡出

| 议题 | 最终决策 |
|------|----------|
| 视觉 | 离开 cover 时，品牌容器使用 **`opacity` 约 300ms** 过渡到 0，再于 `transitionend` 卸载，避免文案瞬间消失。 |
| 实现 | `coverBrandMounted` + `useLayoutEffect` 在进入 cover 时确保挂载；`coverMode === false` 后触发动画并在过渡结束置 `coverBrandMounted === false`。 |

### 1.5 相机沿用（验收口径）

| 议题 | 最终决策 |
|------|----------|
| yaw / pitch / distance | 仍由 **`coverModeStore.exitCoverPreserveOrbit` + `scene.ts` `beginSelect`** 在 cover → focus 时承接（**P23.3 已落地**）；P23.4 不改动该契约，仅保证「点击 Perlin 壳」也能触发同一条 `exitCoverIntoFocus()` 路径。 |

---

## 2. 最终操作清单（代码）

### 2.1 实现改动

| 路径 | 最终操作 |
|------|----------|
| `frontend/src/three/interaction.ts` | `onWindowPointerUp`：在 `focusPlanetBeatsActiveAlongRay === true` 分支内，若 cover 且命中 today 语义，调用 `exitCoverIntoFocus()` 后再 `return`。 |
| `frontend/src/App.tsx` | cover 键盘分支（Escape / Enter / Space）；`coverBrandMounted` 与淡出容器；向 `CoverBackdrop` 传入 `todayFocusAriaLabel` 与 `showTodayFocusTrap`。 |
| `frontend/src/hud/CoverBackdrop.tsx` | 新增 props：`todayFocusAriaLabel`、`showTodayFocusTrap`；条件渲染透明焦点 `button`，`onClick` → `exitCoverIntoFocus()`。 |
| `frontend/src/lib/strings.ts` | `cover.todayFocusAriaLabel(title)` 插值函数（`{{title}}`）。 |
| `frontend/src/lib/locales/en.json` 等 7 个 locale | 新增 `cover.todayFocusAriaLabel` 字符串（英/法使用规范冒号间距，中文使用全角冒号版本与 en 产品名并存）。 |

### 2.2 未改动的既有能力（P23.3 已覆盖，本阶段跳过）

- `uCoverMode` / `uCoverTodayInstanceId` 与 idle/active shader cull。
- cover 空白处 orbit 与 `?orbitDrag=` 一致性。
- `MovieTooltip` / `HoverRing` 数据流与主体字段集合。

### 2.3 构建与提交

| 项目 | 说明 |
|------|------|
| 本地校验 | `npm run build`（`tsc -b && vite build`）已通过。 |
| 提交信息 | `feat(frontend): P23.4 cover perlin click, keyboard, a11y, brand fade` |

---

## 3. 验收清单（P23.4 口径）

| 项 | 状态 |
|----|------|
| Hover today：白圈 + tooltip，字段与主体一致 | 依赖 P23.3 路径 + 本阶段无 tooltip 分叉 → **设计满足** |
| 点击 Perlin 壳进入 focus + drawer | **本阶段修复 early return 后满足** |
| 点击 today 的 active 拾取球 | **P23.3 已满足** |
| Enter / Space（非输入框焦点） | **本阶段已实现** |
| Tab 至透明按钮 + 键盘激活 | **本阶段已实现** |
| cover 下 ESC 不退出 today | **本阶段已实现** |
| 品牌层淡出 | **本阶段已实现** |
| 空白拖拽仅 orbit、不误进 focus | **沿用 P23.3 + 既有 drag 阈值** |

建议在合并后主路径上做一次人工 smoke：Perlin 壳点击、壳外拖拽、Enter、Tab+Enter、cover 下按 ESC 确认无抽屉误开。

---

## 4. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 |
|------|------|-------------|
| 捕获阶段 Enter/Space 与未来新控件冲突 | 极少数焦点场景误触进入 focus | 已在输入类元素上短路；新全局可编辑区域需同类排除。 |
| 透明按钮 `focus-visible:ring` 与主题对比 | 弱对比环境下 ring 不明显 | 当前使用 `ring-white/55`；若设计 token 变更可单点调整 class。 |
| 双通道触发 `exitCoverIntoFocus` | 重复调用 | `todayMovieId` 第二次为 `null` 时 store 内早退，无副作用。 |

回滚：还原 `823acac` 涉及文件即可恢复 P23.3 行为（Perlin 壳点击仍可能无法进 focus）。

---

## 5. 最终结论

P23.4 在 P23.3 已交付的 cover 渲染、orbit、tooltip 数据链路与 `exitCoverPreserveOrbit` 基础上，补齐了 **Perlin 壳层点击**、**键盘与 ESC 语义**、**焦点靶与 i18n aria 文案**、**品牌层淡出**，并与计划中的「单一路径 MovieTooltip / 无 compact 分支」保持一致。

合并至默认分支后，建议按 §3 完成一轮浏览器手测，并与 P23.7 文档总同步一并勾选。

---

*文档结束。*
