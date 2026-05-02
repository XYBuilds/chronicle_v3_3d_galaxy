# Phase 15.1 — 加载顺序整合与四阶段进度条（定稿）

本文档归档 Phase 15 子项 **P15.1** 的**最终决策**、**已落地操作**与**与后续子项的边界**，供评审、回归与 P15.2（Cover + Start + WebGL 手势挂载）对齐。  
关联计划：`.cursor/plans/phase_15_cover_and_loading_502f5515.plan.md`（`p151-load-orchestration`：**completed**）。  
上层产品叙述：Phase 15 总览（首屏四阶段 + Cover-with-Start）；本报告**仅覆盖 P15.1 已交付范围**。

---

## 1. 背景与范围

### 1.1 目标

在**不改动** `galaxy_data` / 搜索索引**数据契约**、**不改动** `searchIndexStore` / `galaxyDataStore` 内部加载逻辑的前提下：

- 将首屏体验从「galaxy gzip 三阶段」扩展为与 UI **一一对应**的**四阶段**：Download → Decompress → Parse → **Search index**；
- 在 **galaxy 已 `ready`** 之后、搜索索引进入**终态**（`ready` / `skipped` / `error`）之前，以**全屏 Loading** 覆盖主壳，使用户明确感知第四阶段；
- **`hydrateFromGalaxyMeta`** 仍在 **`status === 'ready' && data`** 时由 `useEffect` 触发（与改造前一致），从而在时间线上 **galaxy 一就绪即开始索引拉取**，与「索引阶段」全屏 UI **并行**，仅将 **Three.js 场景挂载**推迟到索引阶段结束且主界面已渲染出 canvas 宿主之后。

### 1.2 范围边界

| 纳入 P15.1 | 刻意排除（留给 P15.2 / P15.3） |
| ---------- | -------------------------------- |
| `App.tsx` 顶层阶段机（galaxy-loading / galaxy-error / index-loading / **main**） | **`await-start` / `started` 状态**及「用户点 Start 后才挂载 WebGL」 |
| `Loading.tsx` 四步 `ol`、进度条分段、`indexStatus` / `gzipDone` / `mode` / `onStart` **API 与 await-start 视觉占位**（供 P15.2 接线） | Cover 的完整产品验收（Enter/Space、DevTools 0 WebGL 直至 Start 等） |
| `mountGalaxyScene` 依赖 **`indexHydrationTerminal`** | 三份主 spec（Tech / Design / PRD）全文同步（**P15.3**） |
| `en.json` 第四阶段 **skipped / failed** 展示用文案键 | 实施报告以外的额外文档（本文件除外） |
| Storybook：`PhaseSearchIndexLoading` / `Skipped` / `Failed` | P15.2 要求的 Cover 三条 Story 命名与用例定稿 |

---

## 2. 最终锁定决策

| 编号 | 决策项 | 最终方案 |
| ---- | ------ | -------- |
| **D1** | 与 Phase 15 总计划 D2 的关系 | 第四阶段与前三阶段**同一套** `ol` + 单色进度条节奏；**不**单独开第二套进度 UI。 |
| **D2** | 与 Phase 15 总计划 D3 的关系 | 索引 **fetch/hydrate 失败**或 **skipped** 时，第四项使用 **destructive / muted** 等视觉区分 + 专用英文句（见 `en.json`）；**不阻塞**进入主应用（与 Phase 12 搜索不可用策略一致；主壳仍由 `SearchBar` 与 meta 驱动）。 |
| **D3** | 顶层状态存放位置 | **仅 `App.tsx` 内** `useMemo` 推导 `phase`；**不**扩展 `galaxyDataStore` / `searchIndexStore` 承载「壳层阶段」。 |
| **D4** | `index-loading` 判定 | `galaxy.status === 'ready' && data !== null` 且 **`!(indexStatus ∈ { ready, skipped, error })`**。含 **`idle`** 的极短窗口（hydrate 尚未把状态置为 `loading` 的首帧），一律视为仍在索引阶段，避免「主界面闪一帧」。 |
| **D5** | WebGL 挂载时机（P15.1 定稿） | **`mountGalaxyScene`** 仅在 **`indexHydrationTerminal === true`** 且 **`status === 'ready' && data`** 时执行；与 P15.2「**Start 手势后**才挂载」**不同**——P15.1 **未**引入 `started`，挂载发生在**索引终态后自动进入 main**。 |
| **D6** | `Loading` 的 `mode === 'await-start'` | **组件层已实现**（隐藏 spinner、满进度视觉、`role="dialog"`、`onStart` CTA 等）；**`App.tsx` 在 P15.1 不切换该 mode`**，留待 P15.2 接入。 |
| **D7** | 进度条宽度语义 | gzip 三阶段离散锚点：**download** 按字节比例映射至 **0–25%** 条宽；**decompress** → **50%**；**parse** → **75%**；**索引 loading** → **75%** + `animate-pulse`；索引终态 → **100%**。 |
| **D8** | 状态可见性（工程准则） | 进入 **`index-loading`** 时 `console.log` 输出 `movies.length` 与当前 `indexStatus`。 |
| **D9** | Git 交付形态 | 开发使用分支 **`feat/p15-1-load-orchestration`**；报告撰写时主干以仓库内文件为准（合并后亦适用本报告）。 |

---

## 3. 架构说明（落地形态）

```
galaxyDataStore          searchIndexStore
     │                          │
     │ status / data            │ status (idle|loading|ready|skipped|error)
     └──────────┬───────────────┘
                ▼
          App.tsx useMemo → phase
                │
     ┌──────────┼──────────┬─────────────┐
     ▼          ▼          ▼             ▼
galaxy-    galaxy-   index-         main
loading    error     loading    (canvas + HUD)
     │                    │
     └─ <Loading …>       └─ <Loading gzipDone index loading>
                │
     useEffect: hydrateFromGalaxyMeta(meta)  ← galaxy ready 即触发
                │
     useEffect: mountGalaxyScene(...)        ← 仅 index 终态 + DOM 有 canvas 宿主
```

- **索引与 gzip 并行**：hydrate 不等待用户操作；全屏第四阶段仅表达**产品层进度叙事**。  
- **WebGL 与索引串行（相对 galaxy ready）**：在 P15.1 中，**主 DOM 在 index 未结束时未挂载**，故 `canvasHostRef` 为空，客观上避免「galaxy 一好就占 GPU」；完整「手势门闩」在 **P15.2** 补齐。

---

## 4. 实施操作清单

### 4.1 变更文件

| 路径 | 操作摘要 |
| ---- | -------- |
| `frontend/src/App.tsx` | 引入 `useSearchIndexStore`、`indexHydrationTerminal`、`phase` 四向分支；`mountGalaxyScene` 依赖扩展；`index-loading` 诊断 `console.log`；保留 `data === null` 兜底以通过 TypeScript 收窄。 |
| `frontend/src/components/Loading.tsx` | 四步列表、`gzipDone` / `indexStatus` / `computeBarWidth`、`LoadingIndexStatus` / `LoadingMode` 导出；`await-start` + `onStart` 分支（P15.2 就绪）。 |
| `frontend/src/components/Loading.stories.tsx` | 新增 `PhaseSearchIndexLoading` / `PhaseSearchIndexSkipped` / `PhaseSearchIndexFailed`。 |
| `frontend/src/lib/locales/en.json` | `loading.phaseIndexSkipped`、`loading.phaseIndexFailed`（第四项失败/跳过展示）。 |
| `.cursor/plans/phase_15_cover_and_loading_502f5515.plan.md` | `p151-load-orchestration` 标记 **completed**（若仓库跟踪该文件）。 |

### 4.2 未改动的契约与模块（明确非本项）

- `frontend/src/store/searchIndexStore.ts`：`hydrateFromGalaxyMeta` 行为未改。  
- `frontend/src/store/galaxyDataStore.ts`：未改。  
- `galaxy_data.json` / `galaxy_search_index.json.gz` 路径与解析：未改。

---

## 5. 验收口径（P15.1）

| 场景 | 期望 |
| ---- | ---- |
| 正常冷启动 | gzip 三阶段 + 第四阶段 **Search index**；索引完成后进入主界面；场景可交互。 |
| `meta.has_search_index !== true` | hydrate 快速 **`skipped`**；第四项展示 skipped 文案（Storybook 可验）；主界面搜索侧逻辑保持既有 Phase 12 行为。 |
| 索引拉取失败 | 第四项 **failed** 文案；控制台 `searchIndexStore` 既有 `console.error`；仍进入 **main**（不锁死在 Loading）。 |
| `galaxy` 失败 | 仍走 **galaxy-error** 全屏错误页 + Retry，**不**进入索引阶段。 |
| 构建 | `frontend` 下 `npm run build`（`tsc -b && vite build`）通过。 |

---

## 6. 后续衔接（P15.2 / P15.3）

- **P15.2**：在 `App` 增加 `started`；`phase` 在索引终态后进入 **`await-start`** 直至 `setStarted(true)`；`mountGalaxyScene` 改为依赖 **`started`**；`Loading` 使用已存在的 **`mode="await-start"`** 与 **`onStart`**。  
- **P15.3**：Tech Spec §1.4.7、Design §3.5、PRD §3.1 与代码对齐；Cover 相关 DevTools 与异常路径手测清单收口。

---

## 7. 修订记录

| 日期 | 说明 |
| ---- | ---- |
| 2026-05-02 | 初版：对应 P15.1 实施定稿与仓库落地状态。 |
