# Phase 14.6 — Drawer Details 四组逻辑、组间换行、文案与 Storybook 实施报告（定稿）

本文档归档 Phase 14 子项 **P14.6** 的**最终产品决策**、**与初版计划对照的变更**、**已落地代码路径**与**验收口径**。  
关联计划：`.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md`（`p146-drawer-reorder`：**completed**）。  
范围边界：仅 **Drawer「Details」小标题下** 的元数据区；**不动** `galaxy_data` 电影对象字段契约、3D 渲染与交互状态机。

---

## 1. 背景与目标

### 1.1 目标（计划原文摘要）

- 将 Details 内多栏元数据按**固定四组**规则排序与显隐，避免与旧版线性混排不一致。
- **Runtime / Language** 与 **Budget / Revenue** 的「有无」判定与占位符 **`/`** 行为与产品表一致。
- 抽**纯函数**（或等价模块）便于 Vitest 与 Storybook 对照验收。
- Storybook 覆盖典型组合（含 `0`、`null`、整组隐藏、奇数栏换行等）。

### 1.2 最终交付形态（代码 SSOT）

| 维度 | 最终方案 |
| --- | --- |
| 逻辑与类型 | `frontend/src/components/drawerDetailsLayout.ts`：`buildDrawerDetailsGroups`、`buildDrawerDetailsFields`、`formatUsdPresent` |
| UI 装配 | `frontend/src/components/Drawer.tsx`：`MovieDetailDrawerHud` 内 Details 区块 |
| 占位与标签 | `frontend/src/lib/locales/en.json` 的 `drawer.details.*`，经 `STRINGS`（`strings.ts`）读取 |
| 验收用例 | `drawerDetailsLayout.test.ts` + `Drawer.stories.tsx`（`DetailsP14_*`） |

---

## 2. 最终锁定决策表

| 编号 | 决策项 | 最终方案（与计划 §P14.6 关系） |
| --- | --- | --- |
| **D1** | 组内「栏 / 行」语义 | 与计划一致：**栏** = 标签 + 值；**行** = `grid-cols-2` 下一行最多两栏；奇数栏末栏仅占左格。 |
| **D2** | 组 1（Runtime → Language） | **整组永远渲染**。无数据时**值**为 `STRINGS.drawer.details.missingValue`（**`/`**，存于 `en.json`）。**Runtime = `0` 分钟视为有**，格式化为 `{{minutes}} min`，**不**显示 `/`。仅 `runtime == null`（契约上为「缺失」）视为无。 |
| **D3** | 创作职务（Director → Producers → Writers） | 与计划一致：名单栏无有效字符串则**该栏不渲染**；三栏可全缺则**该组不出现**。 |
| **D4** | 技术 / 音乐（DOP → Music Composer） | 与计划一致：同上逐栏省略；可全缺则整组不出现。 |
| **D5** | Budget / Revenue | 与计划一致：`null` / `undefined` / 非有限 / **`≤ 0`（含 0）** 视为该侧无有效金额。整组仅当 **至少一侧** 有正数 USD 时渲染；否则**整组不渲染**。渲染时单侧无数据则该栏值为 **`/`**。金额格式：`Intl.NumberFormat` USD、整数。 |
| **D6** | 名单类「无」 | 与计划一致：`null` / `undefined` / 缺失、空串、**全空串数组**视为该栏无；**不**用数字 `0` 表达名单语义。 |
| **D7** | 组与组之间版式 | **初版计划**：「仅换行、无新分割线」。**实现决策**：每组单独包一层 **`grid-cols-2`**，外层用 **`flex flex-col gap-y-5`** 堆叠，避免上一组**奇数栏**与下一组首栏落在**同一视觉行**（见 §4.2）。 |
| **D8** | 四组**视觉顺序**（相对计划表格） | **计划表**中财务为「组 4」、创作为「组 2」、技术为「组 3」。**产品定稿**：**Runtime + Language → Budget + Revenue → Director / Producers / Writers → DOP / Music Composer**（财务块上移到语言之下、创作职务之上）。代码中 `DrawerDetailsGroups` 的 `group2` = 财务、`group3` = 创作、`group4` = 技术。 |
| **D9** | Details 区块是否可出现「空壳」 | 有 `movie` 时 **Details 标题下必有内容**：组 1 恒有两栏（允许值为 `/`），**不再**依赖旧版「任一 meta 才显示整块」的聚合条件。 |
| **D10** | 字段标签英文 | **Director of Photography**（首字母大写规范）、**Music Composer**（原「Composer」升级为完整职能名）；仍走 `en.json` / `STRINGS.drawer.details`。 |
| **D11** | 数据契约 | **未改** `Movie` 类型与管线导出字段名；仅消费侧布局与展示规则变更。 |

---

## 3. 与计划文档的差异说明（刻意偏离或增补）

| 项目 | 计划 §P14.6 表格顺序 | 定稿（本报告 §2 D8 / D10） |
| --- | --- | --- |
| 财务块相对创作块 | 创作（组 2）→ 技术（组 3）→ 财务（组 4） | **财务夹在组 1 与创作之间**。 |
| 标签 copy | 计划中示例为「Director of photography」「Composer」类表述 | HUD 定稿为 **Director of Photography**、**Music Composer**。 |
| 组间换行 | 文案写「仅自然换行」 | 工程上采用**多 grid 堆叠**以满足「组间必换行」的严格解读（§4.2）。 |

Design Spec / 计划表若仍写旧顺序，可在 **P14.8 文档同步** 中改为与本文 **D8** 一致，避免双 SSOT。

---

## 4. 实施操作清单

### 4.1 新增与修改的源码文件

| 路径 | 职责 |
| --- | --- |
| `frontend/src/components/drawerDetailsLayout.ts` | `buildDrawerDetailsGroups(movie)` → `{ group1, group2, group3, group4 }`；`buildDrawerDetailsFields` 为扁平顺序（测试 / 序列化）；`formatUsdPresent`；组 1 顺序 `assert`。 |
| `frontend/src/components/Drawer.tsx` | Details：`flex` + 多段 `grid`；`DrawerDetailCells`；`drawerDetailLabel` 映射 `DrawerDetailFieldId` → `STRINGS.drawer.details.*`。 |
| `frontend/src/components/drawerDetailsLayout.test.ts` | `formatUsdPresent`、扁平顺序、分组结构、Martha / Paradise / Kika / Happiness 变体。 |
| `frontend/src/components/Drawer.stories.tsx` | 既有 Default / Cast 等 + **`DetailsP14_*`** 规则矩阵（见 §4.3）。 |
| `frontend/src/lib/locales/en.json` | `drawer.details.missingValue`、`directorOfPhotography`、`composer`（显示为 Music Composer）等。 |
| `frontend/src/lib/strings.ts` | 暴露 `STRINGS.drawer.details.missingValue`（随 P14.6 增补）。 |

### 4.2 UI 结构（组间换行）

- 外层：`detailsGroupsStackClass` → `flex flex-col gap-y-5 text-sm`
- 每组子层：`detailsGroupGridClass` → `grid grid-cols-2 gap-x-8 gap-y-5 text-sm`
- 子层内：`DrawerDetailCells` 映射 `fields` → 标签 + 值

### 4.3 Storybook（`DetailsP14_*`）

| Story 名 | 覆盖意图 |
| --- | --- |
| `DetailsP14_Group1Slashes_Group4Hidden` | 组 1 双 `/`；财务 0/0 → 财务整组不出现（story 注释仍写「Group 4」指计划语义之财务组）。 |
| `DetailsP14_RuntimeZero` | Runtime = 0 → `0 min`，非 `/`。 |
| `DetailsP14_Group4BudgetSlash` | 一侧无有效金额 → `/`，另一侧货币（Kika）。 |
| `DetailsP14_Group2WritersOnly` | 仅 Writers、无 Director/Producers；组内奇数栏换行。 |
| `DetailsP14_FullCreditsGrid` | 多栏满载（Paradise Road）。 |

### 4.4 Vitest

- `npm run test`：`drawerDetailsLayout.test.ts` 与其它既有测试需全绿。
- 重点断言：财务隐藏、`0 min`、Director/Producers/Writers 顺序、**有财务时 revenue 出现在 director 之前**、分组数组结构（Paradise / Martha / 清空 credits）。

### 4.5 Git 提交轨迹（本专题相关）

在分支 **`feat/p14-6-drawer-details-layout`** 上，与 P14.6 专题直接相关的提交示例：

| Commit | 说明 |
| --- | --- |
| `62e709b` | 初版：四组逻辑、`drawerDetailsLayout`、Storybook、Vitest、`missingValue` |
| `c3e4ef9` | 组间强制换行：每组独立 `grid` + `flex` 栈 |
| `922ee0a` | 标签定稿 + 财务块顺序上移到 Runtime/Language 之下 |

（若已 squash 或合并进主分支，以仓库 `git log` 为准。）

---

## 5. 验收口径（Checklist）

- [ ] 有选中影片时，Details 下**至少**可见 Runtime + Language（值可为 `/`）。
- [ ] Runtime = `0` 显示 **`0 min`**，不为 `/`。
- [ ] Budget/Revenue 均为无效（含 0）时，**不出现** Budget/Revenue 两行；任一侧有效时出现整组，缺失侧为 **`/`**。
- [ ] Director / Producers / Writers 仅展示非空栏，顺序固定。
- [ ] DOP / Music Composer 同上。
- [ ] **视觉顺序**：语言下方若为财务块，则紧接 Budget/Revenue；再下为创作职务，再下为 DOP/Music Composer。
- [ ] **组与组之间**：新组首栏不与上一组奇数尾栏同一行（多 grid 堆叠）。
- [ ] 标签为 **Director of Photography**、**Music Composer**。
- [ ] Storybook `DetailsP14_*` 可逐条目视验收；Vitest 全通过。

---

## 6. 风险与后续

| 风险 | 缓解 |
| --- | --- |
| 计划 / Design Spec 仍写「财务为最后一组」 | P14.8 同步文档与本文 **D8** 对齐。 |
| Story 注释中的「Group 2/4」与代码 `group2/4` 语义不完全同名 | 以 **`DrawerDetailsGroups` 接口注释** 与本文为准；可选小修 story 注释。 |
| 日后需区分 Budget/Revenue 的「0」与「未知」 | 需**数据契约或产品单独立项**；当前与 §P14.6 锁定一致：`0` = 无。 |

---

## 7. 文档信息

| 项 | 值 |
| --- | --- |
| 文档类型 | Phase 14 子项实施报告（定稿） |
| 对应计划条目 | P14.6 `p146-drawer-reorder` |
| 维护建议 | P14.8 全局文档同步时引用本文 **§2、§3** 更新 Design Spec Details 小节 |
