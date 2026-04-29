# Phase 12.2 · P12.2 状态层扩充（Zustand）— 实施报告

> 对应 [Phase 12 计划](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md) 中 **P12.2**（`p122-store-extend`）：在 **`galaxyInteractionStore`** 增加搜索与会话相关字段、**不存储**的 **`viswindowDisabled` 派生**、以及封装互斥规则的 **helpers**；**不**在本步实现 SearchBar、索引加载、selectionMask 或状态机 ESC 栈（留待 P12.3+）。  
> **SSOT**：[`TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) §4；[`TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) §4.5（`viswindow` 解耦）；[`星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) §3.6。  
> **日期**：2026-04-29。

---

## 1. 目标与最终决策

| 议题 | 决策 |
|------|------|
| 状态存放位置 | 全部挂在现有 **`useGalaxyInteractionStore`**（`frontend/src/store/galaxyInteractionStore.ts`），与 hover / `selectedMovieId` / 时间轴 **`zCurrent` / `zVisWindow` / `zCamDistance`** 同仓，避免新建平行 store。 |
| `SearchMode` 枚举 | **`'idle' \| 'movie' \| 'person' \| 'genre'`**，与计划及 Design Spec 三档搜索 + 「未进入搜索选择会话」一致；**`idle`** 表示无 person/genre 多选会话（电影名搜索在 P12.4 仍主要走 `selectedMovieId`，`searchMode` 由 P12.3 与 Tab 联动写入）。 |
| `SearchSuggestion` 形状 | **判别联合**三类：`movie`（`movieId` + `label`）、`person`（`personKey` + `label` + `movieCount`）、`genre`（`genreName` + `label` + `count`）。**打分与高亮**归属 P12.3（`searchScore.ts`）；本步仅定义 store 可承载的最小展示载荷。 |
| `selectionIds` 语义 | **`number[] | null`**：`null` 表示非多选会话；非空数组为 **TMDB `Movie.id[]`**，**约定**由调用方（管线侧索引或 P12.3）保持 **按 `release_date` 升序**，供 P12.7 星座连线顺序消费。 |
| `constellationEnabled` | **默认 `true`**；计划明确仅 **Leva** 暴露（P12.7），本步只落字段，不写 Leva。 |
| `viswindowDisabled` | **不写入 store**，导出 **Zustand selector 函数** **`selectViswindowDisabled(state)`**：当 **`searchMode === 'person' || searchMode === 'genre'`** 时为 `true`，与 Tech Spec「person/genre 选择态下条带不按 `zVisWindow` 驱动 `inFocus`」对齐；P12.6 在 shader / RAF 侧消费。 |
| 互斥与清空 | **`clearSearch()`**：`searchMode='idle'`、`searchQuery=''`、`searchResults=[]`、`selectionIds=null`；**不**修改 `constellationEnabled`（视为调试偏好）。**`setSearchMode('idle')`** 与 **`clearSearch()`** 在搜索字段上等价。**`setSearchMode('movie')`** 仅 **`selectionIds=null`**，保留 query/results（Tab 切到「电影」时 UI 可另行清空，见计划 P12.3）。**`setSearchMode('person'|'genre')`** 不自动清空 `selectionIds`（由联想点击与 `setSelectionIds` 配合写入）。 |
| 状态可见性 | 沿用 P8.4 / scene 的 **`[Search]`** 前缀 **`console.log`**：在 **`setSearchMode`（仅 mode 变化时）**、**`setSearchResults`（仅 results 条数变化时）**、**`setSelectionIds`（长度或 null 性变化时）**、**`clearSearch`（总是）** 打日志，对象内带 **`mode`、`selectionLen`、`resultsLen`、`queryTrimLen`**。 |
| `setSearchQuery` | **纯写入** `searchQuery`，不打日志（避免每键刷屏）；debounce 在 P12.3 UI 层。 |
| Git 工作流 | 在 **`feat/p12.2-search-store-extend`** 分支上开发并提交，**不**在本报告编写时要求已合并主分支。 |

---

## 2. 操作记录（工程）

| 操作 | 说明 |
|------|------|
| 新建分支 | `git checkout -b feat/p12.2-search-store-extend` |
| 修改文件 | [`frontend/src/store/galaxyInteractionStore.ts`](../../frontend/src/store/galaxyInteractionStore.ts) |
| 计划勾选 | [`.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md`](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md) 中 `p122-store-extend` → **completed** |
| 提交 | **`72d77a4`** — `feat(P12.2): extend galaxyInteractionStore for search and select` |
| 本地验证（实施时） | `npm run test -- --run`（`frontend` workspace）、`npm run build`（`tsc -b && vite build`）通过 |

---

## 3. 交付物：类型与初始值

### 3.1 新增导出类型

- **`SearchMode`**、**`SearchSuggestion`**（见 §1）。
- **`selectViswindowDisabled`**：`GalaxyInteractionState => boolean`。

### 3.2 `GalaxyInteractionState` 新增字段与默认值

| 字段 | 默认值 |
|------|--------|
| `searchMode` | `'idle'` |
| `searchQuery` | `''` |
| `searchResults` | `[]` |
| `selectionIds` | `null` |
| `constellationEnabled` | `true` |

### 3.3 新增 action helpers

| 函数 | 行为摘要 |
|------|----------|
| `setSearchMode(mode)` | 写入 `searchMode`；`idle` 时同步清空 query/results/selectionIds；`movie` 时仅清空 `selectionIds`；若 mode 变化则打 `[Search]` 日志。 |
| `setSearchQuery(query)` | 仅更新 `searchQuery`。 |
| `setSearchResults(results)` | 更新 `searchResults`；仅当结果**条数**变化时打日志。 |
| `setSelectionIds(ids)` | 更新 `selectionIds`；当长度或 null 性变化时打日志。 |
| `clearSearch()` | 等价于「完全退出搜索选择会话」的 idle 重置（§1）；始终打日志。 |

---

## 4. 与后续 Phase 的接口约定

- **P12.3**：SearchBar 使用上述字段与 helpers；联想结果写入 **`searchResults`**；Tab 切换时调用 **`setSearchMode`** / 清空 query 等与计划 §P12.3 一致即可。
- **P12.4**：电影项点击仍以 **`selectedMovieId`** 为主路径；**不必**为纯电影搜索进入 `person`/`genre` 的 `selectionIds`。
- **P12.6 / scene**：订阅 **`searchMode`**、**`selectionIds`**；用 **`selectViswindowDisabled(getState())`** 或等价表达式决定是否忽略 viswindow 对 `inFocus` 的贡献（与 shader 中 `uSelectionMode` 配合）。
- **P12.8**：ESC 栈第四级调用 **`clearSearch()`**（计划已写明）。

---

## 5. 验收（本步）

- Store **直读直写**，无异步副作用。
- **未改动**既有字段语义：`hoveredMovieId`、`selectedMovieId`、`hoverAnchorCss`、`hoverPlanetRadiusCss`、`zCurrent`、`zVisWindow`、`zCamDistance`。
- TypeScript **`noUnusedLocals`** 下构建通过；Vitest 全绿。

---

## 6. 已知边界

- **未实现**：索引 `fetch`、`SearchBar.tsx`、`searchScore.ts`、**`selectionMask`**、**星座连线**、**ESC 焦点栈**（均属 P12.3+）。
- **`setSearchResults` 日志**：仅在「结果数组长度」变化时输出；同长度替换内容不触发日志（可接受；调试时可临时改为深度比较或全量 log）。
