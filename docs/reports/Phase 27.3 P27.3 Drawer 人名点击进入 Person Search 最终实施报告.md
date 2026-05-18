# Phase 27.3 — Drawer 人名点击进入 Person Search（最终实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 27（增长与轻量功能）子项 **P27.3** |
| 计划来源 | [`.cursor/plans/phase_27_growth_light_features.plan.md`](../../.cursor/plans/phase_27_growth_light_features.plan.md) 正文「P27.3 人名点击进入 Person Search」 |
| 日期 | 2026-05-18 |
| Git | 分支 **`feat/p27-3-drawer-person-search`**（具体提交哈希以 `git log` 为准） |
| 状态 | **已落地**：Drawer 内 **cast** 与 **Details 中的 crew 名单**（导演 / 制片 / 编剧 / DOP / 作曲）在具备搜索索引时均可点击，行为与顶部 **SearchBar** 选中人物建议一致。 |
| 报告性质 | **工作留档**：汇总本阶段**最终决策**与**已执行操作**。人物索引键与管线 **SSOT** 仍以 `scripts/export/export_search_index.py` 中 `normalize_for_search_v2` 为准；前端镜像为 `frontend/src/utils/searchScore.ts` 的 **`normalizeForSearch`**。 |

**范围说明**：本阶段仅增加 **从 Drawer 进入已有 person search 会话** 的入口与文案；**不**修改搜索索引生成逻辑、**不**改 `galaxyInteractionStore` 状态形状、**不**承担 P27.2 onboarding 或 P27.5 全量文档 SSOT 同步（后者见 Phase 27 计划后续子项）。

---

## 1. 目标（与计划对齐）

1. **Drawer 中 cast / crew 人名可点击**，点击后进入与 SearchBar 一致的 **person search session**（`searchMode: 'person'`、`selectionIds`、`selectionPersonKey`、`searchQuery`）。
2. **复用搜索索引的 person key 归一化**，避免「展示字符串」与「索引字典键」不一致；**不**从已 `join` 的展示串反解析人名。
3. **Fallback**：无索引、或规范化键在 `people` 中不存在时，**不抛错**；无匹配时 `console.warn` 留痕，UI 上无索引时退化为**纯文本**（不可点）。
4. **时间轴联动**：与 SearchBar 相同，在选中人物有有效 `z` 时调用 **`animateZCurrentTo(zMin, 700)`**。

---

## 2. 最终决策总表

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **抽出共享模块 `personSearchSession.ts`** | `enterPersonSearchSession`、`lookupPersonKeyForRawName`、`tryEnterPersonSearchFromRawName`、`sortIdsByRelease` 与 SearchBar 选人路径共用，避免 Drawer / SearchBar 双份漂移。 |
| D2 | **person key = `normalizeForSearch(trim(rawName))`** | 与管线 `normalize_for_search_v2` 对齐（NFKC、去 Mn 组合音标、小写）；字典键存在则进入会话。 |
| D3 | **crew 名单以 `rawNames` 数组驱动 UI，禁止从 `value` 反拆** | `drawerDetailsLayout` 在导演 / 制片 / 编剧 / DOP / 作曲字段上同时输出 `value`（逗号拼接展示）与 **`rawNames`**（已 trim 的数组），Drawer 仅对 `rawNames` 渲染可点击单元。 |
| D4 | **cast 仍用 `movie.cast` 数组元素** | 每人名单元一条原始字符串，与索引构建时 `cast` 来源一致。 |
| D5 | **`personLinkActive = hasSearchIndex && searchIndex`** | `hasSearchIndex` 来自 `meta.has_search_index`（App 注入）；`searchIndex` 来自 `useSearchIndexStore` 的已加载 `data`。二者缺一则**不**渲染为按钮，避免误点与空状态。 |
| D6 | **无 Toast / 无额外交互组件** | 计划允许「无操作或提示」；本实现采用 **静默 + `console.warn`**，避免为单句提示新增运营负担；无障碍仅依赖 **`aria-label`**（见 D8）。 |
| D7 | **点击人物后关闭 Drawer** | 与 SearchBar 一致将 `selectedMovieId` 置为 `null`，沿用既有 Sheet 关闭逻辑；**非**单独「关抽屉」API。 |
| D8 | **新增 HUD 文案键 `drawer.personSearchNameAriaLabel`** | 插值 `{{name}}`；**`en.json` 为结构 SSOT**，全 bundle（`zh`、`zh-Hant`、`ja`、`es`、`fr`、`ar`）同键补齐；`strings.ts` 增加 `personSearchNameAriaLabel(name)`。 |
| D9 | **Storybook 默认 `hasSearchIndex: false`** | `Drawer.stories` 的 `meta.args` 默认关闭索引依赖，避免独立故事中无 Zustand 索引数据时出现误导性可点击态。 |
| D10 | **`MovieDetailDrawer` 接收与 `SearchBar` 同源 props** | `App.tsx` 传入 `animateZCurrentTo`、`hasSearchIndex`，保证 Z 动画与「是否承诺带索引包」一致。 |

---

## 3. 工程操作（修改路径一览）

| 路径 | 操作摘要 |
| --- | --- |
| `frontend/src/utils/personSearchSession.ts` | **新增**：人物会话进入、按 raw 名查键、失败分支；`sortIdsByRelease` 从 SearchBar 迁入共用。 |
| `frontend/src/utils/personSearchSession.spec.ts` | **新增**：排序、`lookup`、`enterPersonSearchSession`（spy `setState` + z 动画）、无 index 的 `tryEnter`。 |
| `frontend/src/components/SearchBar.tsx` | **重构**：人物建议选择路径改为调用 `enterPersonSearchSession`；移除本地重复的 `sortIdsByRelease`。 |
| `frontend/src/components/drawerDetailsLayout.ts` | **扩展**：`DrawerDetailField` 增加可选 `rawNames`；crew 行用 `trimmedNameList` + `join` 同步维护 `value` 与 `rawNames`。 |
| `frontend/src/components/drawerDetailsLayout.test.ts` | **增强**：导演字段断言 `rawNames` 非空且 `value === rawNames.join(', ')`。 |
| `frontend/src/components/Drawer.tsx` | **实现**：`DrawerPersonNamesInline`、`DrawerDetailCells` 支持人物链接；`MovieDetailDrawerHud` / `MovieDetailDrawer` props；索引与 `movieById` 订阅。 |
| `frontend/src/components/Drawer.stories.tsx` | **默认参数**：`hasSearchIndex: false`。 |
| `frontend/src/App.tsx` | **接线**：`<MovieDetailDrawer animateZCurrentTo={...} hasSearchIndex={...} />`。 |
| `frontend/src/lib/strings.ts` | **导出**：`drawer.personSearchNameAriaLabel`。 |
| `frontend/src/lib/locales/en.json` 等 7 个 bundle | **新增键**：`drawer.personSearchNameAriaLabel`。 |
| `.cursor/plans/phase_27_growth_light_features.plan.md` | **状态**：P27.3 todo 标为 `completed`（若与仓库实际再冲突，以计划文件为准）。 |

---

## 4. 验收对照（计划 §P27.3）

| 验收项 | 结果 |
| --- | --- |
| 点击 cast 人名后高亮该人相关电影 | **满足**：与 SearchBar 共用 `enterPersonSearchSession`，`selectionIds` / `selectionPersonKey` 一致。 |
| 点击 director / producer / writer 等 crew 一致 | **满足**：group3 / group4 中带 `rawNames` 的字段均走同一路径。 |
| 找不到索引 key 不报错 | **满足**：`lookupPersonKeyForRawName` 返回 `null` 时 `tryEnter` 提前返回；`console.warn` 记录。 |
| 复用 person key 归一化 | **满足**：统一 `normalizeForSearch` + `people[key]` 存在性检查。 |

---

## 5. 测试与类型

- **Vitest**：`personSearchSession.spec.ts`、`drawerDetailsLayout.test.ts`、`locales.schema.spec.ts` 已纳入通过集（本地执行以 CI / `npx vitest run` 为准）。
- **TypeScript**：`frontend` 下 `tsc -b --noEmit` 通过（以当时分支为准）。

---

## 6. 已知边界与后续可选

1. **Python `casefold` 与 JS `toLowerCase`** 在极少数字符上可能不一致（项目内 `searchScore.spec.ts` 已记录 `ß` 等差异）；若未来出现「Drawer 可点但搜索联想不一致」个例，应在管线或前端统一折叠策略后版本化索引。
2. **同名合并**：索引侧已按规范化键合并；Drawer 不提供「多候选人」拆解 UI（与 SearchBar 行为一致）。
3. 若产品后续要求 **「未命中索引时 HUD Toast」**，需在 `en.json` 增键并做全 bundle 同步，同时注意与 `sync-doc` 规则一致。

---

## 7. 品牌与叙述

- 对外叙述与文档类标题沿用 **The Movie Cosmos**；HUD 标识类仍遵循仓库 `branding-name-convention.mdc`（本报告为内部实施留档，不涉及 UI 标识串修改）。

---

*本报告随分支 `feat/p27-3-drawer-person-search` 合入主线后可视为 P27.3 的归档锚点；若合并前有追加提交，请在本节元数据表更新 Git 行或追加脚注说明。*
