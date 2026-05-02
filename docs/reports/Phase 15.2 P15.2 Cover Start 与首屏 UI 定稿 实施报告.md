# Phase 15.2 — Cover / Start 手势挂载与首屏 UI 定稿（归档）

本文档归档 Phase 15 子项 **P15.2** 的**最终决策**、**代码与文案操作**及**与规格文档的对齐**，作为首屏体验（四阶段加载 → Cover → WebGL）的单一事实补充。  
关联计划：`.cursor/plans/phase_15_cover_and_loading_502f5515.plan.md`（`p152-cover-start`）。  
前置交付：**P15.1**（四阶段进度与索引 hydrate 与 UI 并行）见 [`Phase 15.1 P15.1 加载顺序与四阶段进度 实施报告.md`](./Phase%2015.1%20P15.1%20加载顺序与四阶段进度%20实施报告.md)。

---

## 1. 范围说明

| 纳入 P15.2 | 不在本报告展开 |
| ---------- | ---------------- |
| `App.tsx`：`started`、阶段 `await-start` / `started`、`mountGalaxyScene` 仅在用户确认后执行 | 底层 `galaxyDataStore` / `searchIndexStore` 加载协议变更 |
| `Loading.tsx`：`mode === 'await-start'`、吸底 **Start**、移除 Spinner 与冗余文案行 | Three.js 渲染管线、数据契约 |
| `locales/en.json`：`cover` 键精简（无 `subtitle`） | Phase 18+ 音效等与 Cover 无关的规划 |

---

## 2. 最终锁定决策（产品 / 架构）

### 2.1 与 Phase 15 总计划决策表（计划文档 D1–D4）对齐

| 编号 | 决策项 | 最终方案（P15.2 落地） |
| ---- | ------ | ------------------------ |
| **D1** | Cover 视觉范围 | **极简**：同一全屏覆盖层；四阶段 **`ol` + 进度条**贯穿加载与 Cover；**无**品牌长文案、**无**教程块。**后续整理**：去掉独立 **Spinner**、去掉进度区上方**标题行**（与进度条语义重复）。 |
| **D2** | Search index 进度展示 | 仍为四阶段合并进度条（承接 P15.1）；未改数据层。 |
| **D3** | search index 失败回退 | **`error` / `skipped`** 仍**不阻塞** Cover；第四阶段视觉区分保留；用户 **Start** 后进主壳，搜索 disabled 策略仍按 Phase 12 §4.8。 |
| **D4** | 3D 场景 mount 时机 | **`started === true`** 后首次挂载 **`mountGalaxyScene`**（用户点击 **Start** 或键盘 **Enter** / **Space** 于焦点按钮上）。Cover 阶段 DOM **无** canvas 宿主 → **无** `WebGLRenderer`。 |

### 2.2 首屏 UI 整理（用户定稿，报告归档）

| 编号 | 决策项 | 最终方案 |
| ---- | ------ | -------- |
| **U1** | Spinner 与标题行 | **删除**。加载阶段仅依赖 **四阶段列表 + 进度条**（及 gzip/索引 **footerMessage**）。 |
| **U2** | Cover 副提示句 | **删除**（原英文：Press Start to enter the galaxy…）。**`en.json` 移除 `cover.subtitle`**，避免 SSOT 死键。 |
| **U3** | **Start** 位置 | **视口下方**：外层 **`flex-col`**，进度区 **`flex-1`** 居中；**Start** 置于 **`shrink-0`** 底栏（`pb-10` 等）。 |
| **U4** | 可访问性 | Cover：**`role="dialog"`**、**`aria-labelledby`** → **`sr-only` `h1#cover-title`**（`STRINGS.cover.title`）；根 **`aria-label`** 仍随 **`label` prop**。**移除 `aria-describedby`**（无独立副文段）。按钮 **`aria-label`** → **`STRINGS.cover.startAriaLabel`**；**`autoFocus`** 保留。 |

---

## 3. 实现摘要（源码）

### 3.1 `frontend/src/App.tsx`

- **`useState(false)` → `started`**：仅当 **`started`** 为 **true** 且 **`status === 'ready'`**、**`data`** 存在、**`indexHydrationTerminal`** 时执行 **`mountGalaxyScene`**。
- **`AppLoadPhase`**：**`galaxy-loading` | `galaxy-error` | `index-loading` | `await-start` | `started`**。
- **`await-start`**：渲染 **`<Loading mode="await-start" … onStart={() => setStarted(true)} />`**；**`indexStatus`** 映射为 **`ready` / `skipped` / `error`** 供第四阶段样式。
- **兜底**：**`phase !== 'started' || data === null`** 时 **`console.warn`** 并回退通用 **Loading**（防御性分支）。
- **`hydrateFromGalaxyMeta`**：**仍在** **`status === 'ready' && data`** 的 **`useEffect`** 中触发（与 P15.1 一致），**不**依赖 **`started`**。

### 3.2 `frontend/src/components/Loading.tsx`

- **移除** **`Spinner`** 组件及 import。
- **移除** 可见 **`<p>{label}</p>`**；**`label`** 仍用于根 **`aria-label`**（读屏）。
- **`await-start`**：上半 **`flex-1`** 显示四阶段与进度条；**Start** 单独底部容器。
- **移除** **`STRINGS.cover.subtitle`** 与 **`aria-describedby`**。

### 3.3 `frontend/src/lib/locales/en.json`（`cover`）

当前键：**`title`**、**`start`**、**`startAriaLabel`**（**无 `subtitle`**）。

### 3.4 Storybook

**`Loading.stories.tsx`**：**`CoverAwaitStart`**、**`CoverIndexSkipped`**、**`CoverIndexFailed`**（**`mode: 'await-start'`**，**`label: STRINGS.cover.title`**）。

---

## 4. 已同步的项目文档

| 文档 | 更新要点 |
| ---- | -------- |
| [`TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) §3.5 | Cover/加载：**无 Spinner**、**无标题行**、**无副文案键**、**Start 吸底**、ARIA 规则 |
| [`TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) §1.4.7 | Cover：**Start 置底**、**不**强调隐藏 Spinner 旧措辞，改为与实现一致的「无 Spinner / 无标题行」+ **`started`** 门闩 |
| [`TMDB 电影宇宙 PRD.md`](../project_docs/TMDB%20电影宇宙%20PRD.md) §3.1 | **层级零 · 入场**：极简封面（进度终态 + 底部 Start） |
| [`视觉参数总表.md`](../project_docs/视觉参数总表.md) §1 段 | **`STRINGS.cover`** 键列举与 **无 subtitle** 说明 |
| [`Phase 15.1 … 实施报告.md`](./Phase%2015.1%20P15.1%20加载顺序与四阶段进度%20实施报告.md) | 文首**历史说明**：D5–D6 为 P15.1 快照，挂载规则以 **P15.2 + Tech Spec** 为准 |

---

## 5. 验收建议（工程）

1. **Network**：**`galaxy_search_index.json.gz`** 在 **galaxy ready** 后与索引阶段 UI 时间线一致（P15.1 已保证并行 hydrate）。  
2. **DevTools**：Cover 阶段 **`WebGLRenderingContext`** 为 **0**；**Start** 后为 **1**（单实例预期）。  
3. **键盘**：**Start** 聚焦 → **Enter** / **Space** 触发 **`onStart`**。  
4. **异常路径**：**galaxy** 失败 → 错误页 + Retry，**不**出现 Cover；索引 **failed/skipped** → 仍可 **Start**，搜索能力按 meta / store（Phase 12 §4.8）。

---

## 6. 后续（Phase 15.3 计划项）

计划文档 **`p153-doc-sync`** 中「全文写入 spec」已由本报告 **§4** 与本次提交覆盖；**DevTools / 三条异常路径手测**仍建议在发版前按 [`phase_15_cover_and_loading_502f5515.plan.md`](../../.cursor/plans/phase_15_cover_and_loading_502f5515.plan.md) **P15.3 回归清单**执行并勾选。

---

## 7. 修订记录

| 日期 | 说明 |
| ---- | ---- |
| 2026-05-02 | 初稿：P15.2 决策 + 实现 + 文档对齐 + 首屏 UI 整理（U1–U4） |
