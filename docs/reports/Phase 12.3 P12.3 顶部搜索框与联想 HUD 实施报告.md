# Phase 12.3 · P12.3 顶部搜索框与联想（HUD）— 实施报告

> 对应 [Phase 12 计划](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md) 中 **P12.3**（`p123-search-input-hud`）：顶部 **SearchBar**、三档 Tab（电影 / 影人 / 流派）、**200ms debounce** + **`useDeferredValue`**、**`searchScore.ts`** 打分与高亮、**`searchIndexStore`** 与 **`App.tsx`** 在 `galaxy_data` ready 后加载 **`galaxy_search_index.json.gz`**；**Vitest** 覆盖 `searchScore`。  
> **前置**：P12.1（索引 + `title_normalized`）、P12.2（`galaxyInteractionStore` 搜索字段）。**本步未做**：P12.4 仅「电影 focus」的独立验收文案可合并理解（电影联想已写 `selectedMovieId`）；P12.5–P12.8（selectionMask、多选渲染收口、星座线、ESC 栈）仍待后续 Phase。  
> **SSOT**：[`TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) §4；[`TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) §4.5；[`星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) §3.6。  
> **日期**：2026-04-29。

---

## 1. 目标与最终决策

| 议题 | 决策 |
|------|------|
| 组件与挂载 | 新建 **`SearchBar`**（[`frontend/src/components/SearchBar.tsx`](../../frontend/src/components/SearchBar.tsx)），在 [`App.tsx`](../../frontend/src/App.tsx) 于 `status === 'ready'` 时与画布同屏挂载；传入 **`hasSearchIndex`**（`meta.has_search_index === true`）与 **`movies`**。 |
| 索引加载 | 新建 **`useSearchIndexStore`**（[`frontend/src/store/searchIndexStore.ts`](../../frontend/src/store/searchIndexStore.ts)）：`hydrateFromGalaxyMeta(meta)`；`has_search_index !== true` → **`skipped`**，不请求 gzip；`ready` 且 **`version === meta.version`** 时跳过重复拉取；失败 **`error`** + `errorMessage`。 |
| 与 P12.2 store 分工 | **`searchQuery` / `setSearchQuery`** 由 SearchBar 绑定输入；**`setSearchResults`** 由 `useEffect` 随联想计算结果同步（供调试与未来 HUD）；**`applySuggestion`** 写 **`selectedMovieId`**（电影）或 **`searchMode` + `selectionIds`**（影人 / 流派）并 **`selectedMovieId: null`**。 |
| 联想触发 | **`trim` 后长度 ≥ 3**（`SEARCH_MIN_QUERY_LEN`，与 Design Spec §4.2 一致）；低于阈值不展开列表。 |
| Debounce | **`searchQuery` → 200ms → `debouncedQuery`**，再以 **`useDeferredValue(debouncedQuery)`** 驱动重计算，减轻连击卡顿。 |
| 选中后输入框展示（最终 UX） | **不再**使用输入框上方的独立 banner 字段；选中联想后 **直接替换 `searchQuery`**：电影 → **`formatMovieSuggestionLabel(m)`**；影人 → **`entry.full`**；流派 → **`${genreName} (${count})`**；并 **`setDebouncedQuery(q)`** 与 store 同步，避免 debounce 回写旧词。曾短暂实现 **`searchBannerText`**，已在 **`a4d165f`** 移除。 |
| Tab 切换 | 本地 **`hudTab`**（`'movie' \| 'person' \| 'genre'`）+ **`onTabChange`**：清空 **`searchQuery`**、**`searchResults`**、**`debouncedQuery`**、收起列表与高亮；**不**在此步自动改 `searchMode`（由选中影人/流派写入）。 |
| 无障碍与键盘 | **`role="search"`**、**`role="searchbox"`**、列表 **`listbox` / `option`**；**`↑` `↓`** 导航、**`Enter`** 提交高亮项、**`Esc`**：**仅 `blur` 输入框**（Design §4.6 第一级；完整四级栈属 P12.8）。 |
| 清空 | 单一 **X** 按钮（`searchQuery.length > 0` 且未 block 时显示），调用 **`clearSearch()`**（P12.2 定义的全量搜索字段重置）。输入使用 **`type="text"`** 以避免浏览器自带清除与自定义 X 重复。 |
| 布局与视觉 | **`fixed top-4`** 居中；**`max-w-lg`**、`w-[calc(100%-2rem)]`；联想列表 **隐藏滚动条**（`scrollbar-width: none` 等）；阻塞态 **`opacity-60`** + **`pointer-events-none`** + **`title` / 文案** 说明原因。 |
| 打分与上限 | 逻辑集中在 [`frontend/src/utils/searchScore.ts`](../../frontend/src/utils/searchScore.ts)：电影 **prefix > contains**，同档 **`log10(vote_count+1) * vote_average`**；影人 **任意 token 前缀** 与整串 contains；流派 **prefix > contains**，同档 **`count`**； caps：**12 / 8 / 5** 条。 |
| 高亮 | **`TextHighlightRange[]`**；React 分段渲染 **`<mark className="bg-primary/30">`**。 |
| 测试文件 | 使用 **`searchScore.spec.ts`**（与 P12.1 的 `loadSearchIndex.test.ts` 命名并存，均符合 Vitest `include`）。 |
| 同分支顺带修复（非 P12.3 核心但本迭代完成） | **Genre 索引 `count === len(movie_ids)`**：Python 侧对每片 **`genres` 去重**（[`scripts/export/export_search_index.py`](../../scripts/export/export_search_index.py)），避免重复流派串导致校验失败。**Focus 相机包围球**：[`frontend/src/three/screenRadius.ts`](../../frontend/src/three/screenRadius.ts) 在 off-slab 等场景用 **`uSizeScale * uActiveSizeMul * movie.size`** 解析选中球半径，避免误用 **`worldSpan`** 导致相机在过大球内。 |

---

## 2. 操作记录（工程）

| 操作 | 说明 |
|------|------|
| 分支 | 主要在 **`feature/p12.3-search-input-hud`**（及合并前等价开发分支）上迭代。 |
| 核心提交（按时间大致顺序） | **`f547254`** — `feat(p12.3): top HUD search bar, debounced suggestions, searchScore + index store`；**`5653426`** — `fix(export): dedupe genres per movie so genre count matches movie_ids`；**`87dfc6d`** — `fix(selection): Perlin radius for off-slab matches full active shell, not worldSpan`；**`0dc5aaa`** — SearchBar 宽度 / 滚动条 / 单一清除；**`817e53d`** — 曾加 `searchBannerText`（已废弃）；**`a4d165f`** — `refactor(Search): replace input query on pick; remove searchBannerText`。 |
| 计划勾选 | [`.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md`](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md) 中 **`p123-search-input-hud`** → **completed**。 |

---

## 3. 交付物清单

| 类型 | 路径 | 说明 |
|------|------|------|
| HUD 组件 | [`frontend/src/components/SearchBar.tsx`](../../frontend/src/components/SearchBar.tsx) | Tab、输入、debounce、联想面板、键盘、点击外部关闭、`applySuggestion` |
| 打分工具 | [`frontend/src/utils/searchScore.ts`](../../frontend/src/utils/searchScore.ts) | `normalizeForSearch`、`scoreMoviesForQuery` / `scorePeopleForQuery` / `scoreGenresForQuery`、`formatMovieSuggestionLabel`、高亮 range |
| 单元测试 | [`frontend/src/utils/searchScore.spec.ts`](../../frontend/src/utils/searchScore.spec.ts) | 前缀 / 包含、加权、token 前缀、最小长度等 |
| 索引 store | [`frontend/src/store/searchIndexStore.ts`](../../frontend/src/store/searchIndexStore.ts) | `hydrateFromGalaxyMeta`、`status` 机 |
| 应用接线 | [`frontend/src/App.tsx`](../../frontend/src/App.tsx) | `ready` 后 `hydrateFromGalaxyMeta`；渲染 `<SearchBar />` |
| 数据与导出（修复） | [`scripts/export/export_search_index.py`](../../scripts/export/export_search_index.py) | 每电影 genre 去重，保证 **`count === len(movie_ids)`** |
| 相机 / 拾取（修复） | [`frontend/src/three/screenRadius.ts`](../../frontend/src/three/screenRadius.ts)、[`frontend/src/three/scene.ts`](../../frontend/src/three/scene.ts)（若调用签名有变） | off-slab focus 半径 |

---

## 4. 行为摘要（验收对照）

- 顶部出现搜索卡片；**无索引或加载失败**时控件不可用并有说明。  
- **≥3 字符** 后出现联想（受 debounce + deferred 影响，略晚于按键）。  
- **电影**：点选或 Enter → **`selectedMovieId`** 设置、输入框变为规范片名标签、列表关闭；相机 / Drawer 沿用既有 focus 链路。  
- **影人 / 流派**：点选 → **`searchMode`** 为 **`person` / `genre`**，**`selectionIds`** 为按 **`release_date`** 升序排序的 `movie_id[]`，**`selectedMovieId`** 清空；输入框为 **全名** 或 **`流派 (count)`**。  
- **`setSearchResults`** 与列表一致，便于控制台与其他订阅者观察。  
- TypeScript **`tsc -b`** 与 Vitest 在实施时通过；全量性能（60K 下 **&lt;16ms/frame**）建议在目标机器上再跑 **Performance** 复核（计划验收项）。

---

## 5. 与后续 Phase 的接口

- **P12.4**：电影路径已在 P12.3 打通；后续可将「仅电影、不进入 select」写进更正式的验收用例或 E2E。  
- **P12.5–P12.7**：**`selectionIds` + `searchMode`** 已就绪；**`uSelectionMask`、星座 `LineSegments`** 尚未接。  
- **P12.8**：**`Esc`** 目前仅 blur；四级栈需改 SearchBar / 全局 handler。  
- **P12.9**：若 SSOT 需写明「选中后替换 `searchQuery`」，可在 Design Spec §4 增补一句（本报告为工程事实记录，**不自动改 SSOT**）。

---

## 6. 已知边界

- **影人 / 流派** 选中后 3D 侧 **多实例高亮 / viswindow 解耦** 依赖 P12.5–P12.6；当前可能仅状态已写入、视觉未完全体现计划。  
- **`setSearchResults`** 随 `resultRows` 每次 effect 更新；同长度内容变化也会触发 store 更新（与 P12.2 报告「仅长度打 log」一致：log 仍按条数，但引用相等性需注意）。  
- **旧数据包**无 `has_search_index` 时 SearchBar 保持阻塞态；需重新导出主包 + 索引（见 [Phase 12.1 实施报告](Phase%2012.1%20P12.1%20搜索索引与%20title_normalized%20实施报告.md) §5）。
