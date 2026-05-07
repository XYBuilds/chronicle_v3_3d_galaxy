# Phase 21.3 · P21.3 Genre tab AND 多选徽章 — 实施报告

> 对应 [Phase 21 计划](../../.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md) 中 **P21.3**（`p213-genre-badge-multi-select`）：将 SearchBar **Genres** 从「输入联想」改为 **AND 多选徽章**；利用 `searchIndex.genres[*].movie_ids` 在前端做交集；**死路预测**（再选则交集为 0 的徽章禁用）；`selectionIds` / `searchMode` / `searchQuery` 写回 **`useGalaxyInteractionStore`**（scene 侧无需改动）。  
> 计划在迭代中补充了 **UI 打磨**（流派色、尺寸、已选与候选分区、顶栏提示与固定高度），均以本报告 **§1** 为最终口径。  
> **报告日期**：2026-05-08。

---

## 1. 目标与最终决策

| 议题 | 最终决策 |
|------|----------|
| 筛选语义 | **AND**：当前选中流派对应 `movie_ids` 集合逐档求交；结果按 **`release_date`** 字符串升序排序后写入 **`selectionIds`**。 |
| 数据依赖 | **`SearchIndex.genres[name].movie_ids`**；流派名列表优先 **`meta.genre_palette`** 的 key（排序），否则回退 **`searchIndex.genres`** 的 key。 |
| 死路（dead-end） | 对**未选**流派 **G**，计算若在当前交集上再交 **G** 后的规模 **`previewN`**；**`previewN === 0`** 则该徽章 **`disabled`**（灰 + 不可点）。已选项不设死路禁用（移除靠顶栏）。 |
| 本地状态 | **`selectedGenres: string[]`**，与 store 的 **`searchMode === 'genre'`** 配对；**无选中**时需退出 genre 会话（见 §3.2）。 |
| 写回 store | **`searchMode: 'genre'`**、**`selectionIds`**、**`selectionPersonKey: null`**、**`selectedMovieId: null`**、**`searchQuery: selectedGenres.join(' + ')`**。 |
| 与 ESC / `clearSearch` | App 全局 ESC 调用 **`clearSearch()`** 后 **`searchMode → idle`**；组件内用 **`useLayoutEffect`** 检测 **`prev === 'genre' && searchMode === 'idle'`** 清空 **`selectedGenres`**，避免与「写回 genre」的 effect **同帧竞态**把会话写回。 |
| 离开 Genre tab | **`onTabChange`** 若从 genre 切走：**`setSelectedGenres([])`** + **`clearSearch()`**。 |
| Genre tab 与 Cmd/Ctrl+K | 可见搜索框在 genre 模式下不展示时，仍渲染 **`sr-only`** 的 **`input[data-galaxy-search-input]`**，保证 **`App.tsx`** 中 **Cmd/Ctrl+K** 能聚焦搜索控件。 |
| 流派色（候选网格） | 原 **`index.css`** 仅 **`.group/badge.badge-genre`** 生效；网格为原生 **`<button>`**，增加共用规则 **`.genre-chip-tint`**（与 Badge 同源 **color-mix**）；**`getGenreChipSurfaceStyle`** 在 RGB 回退分支同时写入 **`--genre-color`**，与变量路径一致。 |
| 候选徽章尺寸 | 网格候选 **`GenreBadge`** 使用 **`size="sm"`**（**`h-6`**、更小字号与 padding）；顶栏已选条仍为默认 **`md`**（**`h-7`**）。 |
| 候选 vs 已选展示 | **已选流派仅出现在顶栏**（可移除）；**网格 `candidateGenreNames`** = 全集去掉已选，避免重复。 |
| 顶栏与底部文案 | **顶栏始终占位**：有已选 → 徽章 + 右侧交集计数；**无已选** → 单行提示 **`genreMultiEmptyHint`**（如英文 *Click genre(s) to filter…*）。**删除**原网格下方 **`genreMultiHelp`**；键名改为 **`genreMultiEmptyHint`**，全 locale 同步。 |
| 顶栏高度 | **有选 / 无选** 顶栏区域统一 **`min-h-8`**：无选时 **`flex items-center`** 垂直居中提示；有选时 **`min-h-8`** + **`flex-wrap`**，多选换行仍可增高。 |
| i18n | **`searchBar.genreMultiEmptyHint`**、**`genreMultiMatches`**、**`genreMultiRemove`**；所有 **`frontend/src/lib/locales/*.json`** 与 **`en.json`** 对齐（含 **ar / es / fr / ja / zh / zh-Hant**）。已移除 **`genreMultiHelp`**。 |
| 下游 scene / 类型 | **不修改** `scene.ts` 等对 **`selectionIds`** 的消费；不改 pipeline。 |

---

## 2. 交付物清单（路径）

| 类型 | 路径 | 说明 |
|------|------|------|
| Genre 徽章组件 | [`frontend/src/components/GenreBadge.tsx`](../../frontend/src/components/GenreBadge.tsx) | 可选 **`size="md" \| "sm"`**；**`genre-chip-tint`** + **`getGenreChipSurfaceStyle`**；条带移除 **`onRemove` + CloseButton** |
| SearchBar Genre 分支 | [`frontend/src/components/SearchBar.tsx`](../../frontend/src/components/SearchBar.tsx) | **`selectedGenres`**、交集与 **`previewCountIfAdded`**、**`candidateGenreNames`**、**`useLayoutEffect`** 同步 store、隐藏 input、顶栏布局 |
| 全局样式（流派 tint） | [`frontend/src/index.css`](../../frontend/src/index.css) | **`.group/badge.badge-genre`** 与 **`.genre-chip-tint`** 共用同一套 **color-mix** 规则 |
| 流派色工具 | [`frontend/src/lib/genreColor.ts`](../../frontend/src/lib/genreColor.ts) | RGB 回退分支增加 **`--genre-color`** |
| HUD 文案 | [`frontend/src/lib/locales/*.json`](../../frontend/src/lib/locales/) | **`genreMultiEmptyHint`**、**`genreMultiMatches`**、**`genreMultiRemove`**；删除 **`genreMultiHelp`** |
| 计划 todo | [`.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md`](../../.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md) | **P21.3** 标记为 **completed**（若已合并则以 main 为准） |

---

## 3. 行为与技术说明

### 3.1 交集与死路预览

- **`currentIntersection`**：对 **`selectedGenres`** 依次用 **`movieIdsByGenre`** 做集合交集（实现上为显式循环，避免 TS 对 `filter` 推断为 `never` 的问题）。
- **`previewCountIfAdded`**：只对「未选」流派计算；若当前尚无选中（**`currentIntersection === null`**），预览为该流派单独 **`movie_ids.length`**。

### 3.2 何时调用 `clearSearch`

- **`selectedGenres.length === 0`** 且当前 store **`searchMode === 'genre'`**：在 **`useLayoutEffect`** 内 **`clearSearch()`**，退出多选会话。
- 用户 **ESC** 或 **`clearSearch`**：先 **idle**，再由 **`genre → idle`** 分支清空 **`selectedGenres`**。

### 3.3 顶栏计数

- 右侧展示 **`currentIntersection?.size`** 与 **`genreMultiMatches`**（英文 *matches*，中文量词 **部** 等按 locale）。

### 3.4 与 P21.2（i18n）的关系

- 文案走 **`useStrings()`**；**`searchBar.*`** 键扩展后，各语言 JSON 需 **同构**（与 P21.2 的 schema 单测策略一致）。

---

## 4. 验收建议（手工）

1. 进入 **Genres**：顶栏见提示或已选；下方为 **带流派色** 的小号候选徽章（未选中的流派不应再出现在网格里）。  
2. 单选某流派：scene 高亮该流派全部影片；计数与交集一致。  
3. 再选第二个：**AND** 交集；计数实时变化；不可能组合的第三个流派 **灰且不可点**。  
4. 顶栏移除某一流派：死路徽章恢复可点（若预览 > 0）。  
5. **ESC**：退出 genre 会话；顶栏清空为提示；scene 无多选 mask。  
6. **Cmd/Ctrl+K**：在 Genre tab 仍能聚焦搜索（**`sr-only` input**）。  
7. 切换 **浅色/深色**：**`.genre-chip-tint`** 与顶栏可读性正常。  
8. 切换语言：**`genreMultiEmptyHint`** / **matches 文案** 随 locale 变化。

---

## 5. 分支与提交说明（参考）

实现主要在分支 **`feat/p21.3-genre-badge-multi-select`**。以下为与本任务相关的 **提交顺序（摘要）**，精确哈希以仓库 **`git log`** 为准：

| 顺序（新→旧） | 说明 |
|----------------|------|
| `fix(search): fixed min height for genre selected strip (empty vs badges)` | 顶栏 **`min-h-8`**，避免空/有选高度跳变 |
| `feat(search): genre strip always visible with empty hint; drop footer copy` | **`genreMultiEmptyHint`**；移除底部 **`genreMultiHelp`** |
| `fix(search): hide selected genres from genre grid (strip only)` | **`candidateGenreNames`** |
| `style(search): smaller GenreBadge size for genre grid candidates` | **`size="sm"`** |
| `fix(ui): show genre palette tint on SearchBar grid chips` | **`.genre-chip-tint`** + **`--genre-color`** 回退 |
| `feat(search): P21.3 genre AND badge multi-select with dead-end preview` | 首版 AND 徽章、`GenreBadge`、**`useLayoutEffect`** 同步、隐藏 input |

合并入 **`main`** 后，可在 **`main`** 上 **`git log --grep=P21.3`** 或按文件路径检索 **`GenreBadge.tsx`** 定位合并提交。

---

## 6. 后续（计划内其他子项）

Phase 21 计划中 **P21.4**（SearchBar idle/active）、**P21.5**（浅色 tab 对比）、**P21.6**（电影联想去 cap）、**P21.7**（SSOT 文档 + 总报告）为 **独立子任务**；本报告 **仅覆盖 P21.3** 及其迭代 UX 决策。

---

## 7. 风险与回滚

| 风险 | 缓解 |
|------|------|
| 全集 ~60K **`movie_ids`** 上做多次 Set 交集 | 流派仅 ~19 档，实测交集循环可接受；若未来卡顿再评估 **排序数组 + 双指针** 等优化。 |
| ESC 与本地 **`selectedGenres`** 不同步 | 以 **`useLayoutEffect`** + **`genre → idle`** 过渡清空为主；离开 tab 显式 **`clearSearch`**。 |
| `genre_palette` 与 index 键不一致 | 列表优先 palette keys，缺省回退 index keys；无效 hex 走 outline / muted。 |

回滚：还原 **`SearchBar.tsx`** Genre 分支、删除或停用 **`GenreBadge.tsx`**、恢复 **`index.css`** / **`genreColor.ts`** 中与 **`.genre-chip-tint`** 相关的改动，并恢复 locale 键（若需兼容旧 PR，可暂时保留已删 **`genreMultiHelp`** 的别名键——当前主线已移除）。
