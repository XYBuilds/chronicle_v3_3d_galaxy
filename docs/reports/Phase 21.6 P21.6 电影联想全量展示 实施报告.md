# Phase 21.6 · P21.6 电影搜索联想全量展示 — 实施报告

> 对应 [Phase 21 计划](../../.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md) 中 **P21.6**（`p216-movie-suggestions-show-all`）：**电影** tab 的自动联想**不再**在 `scoreMoviesForQuery` 中截断为 12 条，使 **contains** 级（如标题以 *The …* 开头、查询词出现在词干之后）的命中在列表中仍可见、可滚动到达。人名 / 流派联想的条数上限**未**在本项修改。  
> **报告日期**：2026-05-08。

---

## 1. 目标与最终决策

| 议题 | 最终决策 |
|------|----------|
| 电影联想条数 | **取消** 原硬编码 **`MOVIE_RESULT_CAP = 12`** 与 **`hits.slice(0, 12)`**；`scoreMoviesForQuery` **返回全部** `MovieSearchHit`（在通过最小查询长度等门槛之后）。 |
| 排序规则 | **不变**：**prefix** 优先于 **contains**；同 **tier** 内按 **`moviePopularityScore`**（`log10(vote_count+1) * vote_average`）**降序**。 |
| 人名 / 流派 | **保持** 既有 cap：**`PERSON_RESULT_CAP = 8`**、**`GENRE_RESULT_CAP = 5`**；本项**仅**动电影侧。 |
| 性能与可观测性 | 当命中数 **> 300** 时，在 **开发环境** 输出 **一次** `console.warn`（带当前命中数），提醒依赖 **SearchBar 已有滚动容器**（`max-h-72 overflow-y-auto` 等）承载长列表；**不**在本 phase 引入虚拟列表。 |
| 测试环境 | `import.meta.env.MODE === 'test'`（Vitest）下**不**打上述 warn，避免单测输出噪声。 |
| 未采纳 | 不在本项改 **SearchBar** 布局；不新增虚拟滚动；不调整 **People** 星座线或管道导出。 |

---

## 2. 最终操作清单（执行顺序）

| 步骤 | 操作 |
|------|------|
| 1 | 新开 Git 分支 **`feat/p21.6-movie-suggestions-all-hits`**，在本分支完成修改与提交。 |
| 2 | 编辑 **[`frontend/src/utils/searchScore.ts`](../../frontend/src/utils/searchScore.ts)**：删除 **`MOVIE_RESULT_CAP`**；`scoreMoviesForQuery` 在 `sort` 之后直接 **`return hits`**；在 **DEV 且非 test 且 `hits.length > 300`** 时 **`console.warn`**。 |
| 3 | 编辑 **[`frontend/src/utils/searchScore.spec.ts`](../../frontend/src/utils/searchScore.spec.ts)**：用例 **「20 条标题均含 batman 子串、最后一条为 *The Batman*（contains）」** 断言 **20 条全返回** 且含 *The Batman*；将原 **「最多 12 条」** 用例改为 **30 条全量返回**。 |
| 4 | 更新计划文件 [`.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md`](../../.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md) 中 **P21.6** todo 为 **completed**（与提交一并归档时）。 |
| 5 | 运行 **`npx vitest run src/utils/searchScore.spec.ts`**，确认通过。 |
| 6 | **提交**，消息建议：*feat(search): P21.6 show all movie suggestions (remove 12 cap)*。 |

---

## 3. 交付物清单（路径）

| 类型 | 路径 | 说明 |
|------|------|------|
| 电影联想全量 + DEV 告警 | [`frontend/src/utils/searchScore.ts`](../../frontend/src/utils/searchScore.ts) | `scoreMoviesForQuery` 无 12 条 cap；>300 条 DEV `console.warn` |
| 单测 | [`frontend/src/utils/searchScore.spec.ts`](../../frontend/src/utils/searchScore.spec.ts) | 全量与 *The Batman* 场景、30 条全量场景 |
| 计划状态 | [`.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md`](../../.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md) | **P21.6** 完成标记 |
| 本报告 | [`docs/reports/Phase 21.6 P21.6 电影联想全量展示 实施报告.md`](./Phase%2021.6%20P21.6%20电影联想全量展示%20实施报告.md) | 决策与操作 SSOT（本文件） |

**调用关系（未改接口）**：[`frontend/src/components/SearchBar.tsx`](../../frontend/src/components/SearchBar.tsx) 仍通过 **`scoreMoviesForQuery(movies, q)`** 取列表；全量结果由 **同一滚动面板** 展示。

---

## 4. 行为与技术说明

### 4.1 为何曾出现「搜 batman 看不到 The Batman」

- 归一化后 **haystack** 多为 **`the batman`**，查询 **`batman`** 的 **tier** 为 **contains**（非 **prefix**）。  
- 在 **仅取前 12 条** 时，若大量 **prefix** 为 **`batman …`** 的条目占满排序前列，**contains** 项可能被 **截断** 在列表外。取消 cap 后，用户可 **向下滚动** 看到全部 **contains** 命中。

### 4.2 `console.warn` 条件

- **`import.meta.env.DEV`**：生产构建通常不输出，减少线上噪音。  
- **`MODE !== 'test'`**：Vitest 不触发 warn。  
- 阈值 **300** 与 Phase 21 计划一致，用于极端短查询 + 超多万一条时的开发期提示。

### 4.3 与 P21.4（idle/active）的关系

- SearchBar 面板 **movie/person** 分支仍使用 **滚动列表**；联想变长仅增加 **DOM 节点数量**，本 phase **接受** 极端查询下略长的列表渲染成本。

---

## 5. 验收建议（手工）

1. 切换到 **Movies** tab，输入 **`batman`**（满足最小长度规则），在联想列表中 **滚动**，确认可见 **The Batman**（及同类后缀匹配）。  
2. 确认联想列表区域 **可滚动**，面板高度行为与改前一致（**max-height + overflow**）。  
3. （可选）DEV 下构造或检索命中率极高的短查询，控制台仅在 **>300** 条时出现 **warn**，且无功能性报错。

---

## 6. 分支与提交说明（参考）

| 项 | 内容 |
|----|------|
| 开发分支 | **`feat/p21.6-movie-suggestions-all-hits`** |
| 记录提交 | **`fe3a91e`** — *feat(search): P21.6 show all movie suggestions (remove 12 cap)* |

若分支已合并进 **`main`**，以 **`main`** 上包含上述改动的 merge commit 为准追溯。

---

## 7. 风险与回滚

| 风险 | 缓解 |
|------|------|
| 极端查询命中数千条时 **DOM 变长**、首帧略卡 | 依赖滚动容器；DEV **warn** 可观测；后续 phase 若需要再上 **虚拟列表**（本 phase 明确不做）。 |
| **回滚** | 恢复 **`MOVIE_RESULT_CAP`** 与 **`hits.slice(0, MOVIE_RESULT_CAP)`**，并恢复单测中对 **12** 的断言即可恢复旧行为。 |
