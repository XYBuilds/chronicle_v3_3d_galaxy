# Phase 16.1 — 搜索框三档 placeholder hint 实施报告（定稿）

本文档为 Phase 16 子项 **P16.1** 的**最终决策**、**已落地操作**与**验收口径**归档，供评审与后续 P16.2–P16.4 对齐。  
关联计划：`.cursor/plans/phase_16_search_refinements_22478218.plan.md`（条目 **p161-placeholder**）。  
产品规范：《TMDB 电影宇宙 Design Spec》**§4.1**（搜索占位与分段切换）；HUD 英文文案 SSOT 延续 **P14.1**（`en.json` + `STRINGS`）。

---

## 1. 背景与范围

### 1.1 目标

在**不改动** `galaxy_data` / 搜索索引**数据契约**、**不新增** zCurrent 或 active 材质逻辑的前提下：

- 将搜索输入框 `placeholder` 从「单一套路 / 旧版 ≥3 字符提示」升级为**三档分段文案**（电影 / 人名 / 流派），与设计决策 **D1** 一致；
- 在搜索不可用时使用**独立短文案**作为 input 的 `placeholder`，与下方技术性 `disabledReason` 说明区分。

### 1.2 范围边界

| 纳入 P16.1 | 不纳入（本报告范围外） |
| ---------- | ---------------------- |
| `en.json` 中 `searchBar` 占位键扩展与英文定稿 | P16.2 人名 zCurrent snap、P16.3 active 双路径材质 |
| `SearchBar.tsx` 按 HUD tab 与 blocked 状态切换 `placeholder` | 文档大规模同步（归入 **P16.4**） |

---

## 2. 最终锁定决策

| 编号 | 决策项 | 最终方案 |
| ---- | ------ | -------- |
| **D1** | 三档 placeholder 精确字符串（计划 Phase 16 **决策表**） | **movie**：`Search movie titles…`；**person**：`Director / Producer / Cast …`；**genre**：`Drama / Comedy / Thriller …` |
| **D2** | 无搜索索引 / 索引未就绪等「禁用搜索」时 input 的 `placeholder` | 专用键 **`placeholderDisabled`**，文案 **`Search index unavailable`**（短句，与验收「无索引数据集」一致） |
| **D3** | 禁用态是否仍用长串 `disabledReason` 作占位 | **否**。占位一律 `STRINGS.searchBar.placeholderDisabled`；**详细原因**仍通过组件底部既有说明段落（`disabledReason`）展示 |
| **D4** | 键结构 | 与现有 `searchBar.placeholderMovie` 等**并列**（未改为嵌套 `placeholder.*`），减少 diff 与调用方改动 |
| **D5** | `STRINGS` 装配 | **`strings.ts` 无需改代码**：`searchBar: en.searchBar` 已透传整张对象，新键自动进入 **`STRINGS.searchBar`** |
| **D6** | 「idle」与默认 tab | HUD 本地状态 **`hudTab`** 默认 **`'movie'`**；未引入单独 `idle` tab，与计划「idle → 取 movie 默认」等价 |

---

## 3. Git 与分支操作

| 操作 | 说明 |
| ---- | ---- |
| 分支名 | `phase/p16.1-placeholder-hints` |
| 提交（示例） | `fa762b3` — `feat(search): P16.1 three-tier placeholder hints and disabled copy` |
| 变更文件数 | 2（见下节） |

> 合并主分支前请以当前仓库 `git log` 为准核对 commit hash。

---

## 4. 实施操作清单

### 4.1 修改的文件

| 路径 | 变更摘要 |
| ---- | -------- |
| `frontend/src/lib/locales/en.json` | 在 `searchBar` 下更新 `placeholderMovie` / `placeholderPerson` / `placeholderGenre` 为 D1 文案；新增 **`placeholderDisabled`** |
| `frontend/src/components/SearchBar.tsx` | `placeholder`：`isBlocked` → `STRINGS.searchBar.placeholderDisabled`；否则按 `hudTab` 选择三档之一 |

### 4.2 未修改但相关的文件

| 路径 | 说明 |
| ---- | ---- |
| `frontend/src/lib/strings.ts` | 仍为 `searchBar: en.searchBar`，无额外字段映射 |

### 4.3 行为说明（运行时）

- **切换分段（Titles / People / Genres）**：沿用既有 `onTabChange`，清空 query；**placeholder 随 `hudTab` 立即更新**（受控 input，无动画）。
- **blocked** 条件未改：`!hasSearchIndex`、`indexStatus` 为 skipped / loading / error / 非 ready 等组合逻辑不变；仅 **input 占位**从「复用 `disabledReason`」改为 **`placeholderDisabled`**。

---

## 5. 验收口径（P16.1）

| 项 | 预期 |
| -- | ---- |
| 三档 tab | 各自 `placeholder` 与 **§2 D1** 字符串完全一致 |
| `meta.has_search_index === false`（或等价阻塞） | input **disabled**，`placeholder === "Search index unavailable"` |
| 构建 | `frontend` 下 `npm run build`（`tsc -b && vite build`）通过 |

---

## 6. 已知事项与后续

- **P16.2**：人名联想选中后 zCurrent 动画、电影继承 P13.4、genre 不动 zCurrent。
- **P16.3**：select 单态 active 材质 opaque / transparent 双路径。
- **P16.4**：Design Spec / 状态机 / 视觉参数总表 / Tech Spec 与本 phase 代码的最终对齐及回归记录。

---

*报告归档日期：2026-05-02。*
