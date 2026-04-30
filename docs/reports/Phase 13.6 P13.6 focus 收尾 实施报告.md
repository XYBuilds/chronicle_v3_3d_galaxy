# Phase 13.6 — focus 收尾（搜索 X / 默认 alpha / pick–hover 对齐）实施报告

**范围**：P13.6（`phase_13_focus_experience` 子项「收尾：搜索 X 同步清 `selectedMovieId`、`uFocusNonTargetActiveAlpha` 默认扫参、focus 邻域 hover ring 回归」）  
**日期**：2026-05-01  
**状态**：已合并至交付链路；**人工验收通过**（见 §7）。本报告为 P13.6 **最终决策与工程操作**的单一事实来源（SSOT）之一。

---

## 1. 目标（与计划对齐）

对照 `.cursor/plans/phase_13_focus_experience_ab016b85.plan.md` §「P13.6 收尾」：

1. **6a**：搜索框清除按钮（X）与 Design Spec §4.6 一致，**一次动作**退出搜索相关状态并**同步清除 focus**（`selectedMovieId: null`），避免用户清搜索后仍需再按 ESC 才退出 focus。
2. **6b**：在 focus 邻域球点亮后非目标 active 变密的前提下，对 `uFocusNonTargetActiveAlpha` **扫参收口**并写回 `galaxyMeshes.ts` 默认值。
3. **6c**：保证 **CPU 拾取 / hover 环半径** 与 GPU 上 focus 邻域 mask 语义一致（回归：邻域上 hover ring 正确）。

不动数据契约；无后端变更。

---

## 2. 最终决策总表

| 主题 | 决策 |
|------|------|
| **6a 搜索 X 行为** | `onClear`：`clearSearch()` 之后立即 `useGalaxyInteractionStore.setState({ selectedMovieId: null })`。与「ESC §4.6 多级栈」中对「退出 focus」的诉求对齐：**搜索清除 = 同时卸 focus**，不要求第二次 ESC。 |
| **6a 实现粒度** | 保持 `clearSearch()` 为独立函数调用（不合并进 `clearSearch` 内部），避免把「电影 focus」语义隐式耦合进通用 `clearSearch()`，便于后续若需拆分行为时单点修改 `SearchBar`。 |
| **6b 默认 `uFocusNonTargetActiveAlpha`** | 由 **0.10 调整为 0.08**。计划建议浏览器内对比 `0.05 / 0.08 / 0.10`；本版取 **0.08** 作为邻域变密后的折中（较 0.10 略降噪，较 0.05 保留更多邻域可读对比）。 |
| **6b 可调通道** | 运行时仍可通过 `window.__galaxyColor.focusNonTargetActiveAlpha`（`scene.ts` 暴露的 debug 对象）微调；`galaxyMeshes` 默认仅影响冷启动初始 uniform。 |
| **6c `getSelectionMaskPickSet`** | 当 `selectedMovieId !== null` 且 **`focusNeighborIds !== null`** 时，**一律**返回 `new Set(focusNeighborIds)`（**允许空 Set**）。不再要求 `focusNeighborIds.length > 0` 才进入 focus mask 分支。 |
| **6c 动机** | 避免在「已处于 focus、且 store 已提交邻域 id 列表」的窗口内，因边界条件误退回 **vis 条带** 的 `inFocus` 近似，导致 **pick / `computeActiveMeshScreenRadiusCss`（hover 环）** 与 shader `uSelectionMode === 2` 的 mask 语义短暂或不一致。 |
| **Git 分支策略** | 独立分支 `phase/p13-6-cleanup` 上实施，与计划「新开 branch 再做」一致。 |

---

## 3. 工程操作（修改文件与提交）

| 路径 | 作用 |
|------|------|
| `frontend/src/components/SearchBar.tsx` | X 按钮 `onClear`：在 `clearSearch()` 后 `setState({ selectedMovieId: null })`。 |
| `frontend/src/three/galaxyMeshes.ts` | `uFocusNonTargetActiveAlpha` 默认值 `0.1` → `0.08`；注释标明 P13.6 扫参收口。 |
| `frontend/src/three/screenRadius.ts` | `getSelectionMaskPickSet`：focus 分支条件改为 `focusNeighborIds !== null`。 |
| `frontend/src/three/scene.ts` | `GalaxyColorDebug` 类型注释中默认 alpha 文案与 0.08 一致（文档性）。 |
| `.cursor/plans/phase_13_focus_experience_ab016b85.plan.md` | 将 todo `p136-cleanup` 标为 `completed`（计划内进度跟踪）。 |

**提交记录（代表性）**：

- `3b792e5` — `feat(focus): P13.6 cleanup — search X clears focus, alpha default, pick mask`

（若主仓库后续 merge 策略产生 merge commit，以远端 `main` 上实际指向为准。）

---

## 4. 与计划条目的映射

| 计划小节 | 本报告 § |
|----------|-----------|
| 6a 搜索 X 同步清 `selectedMovieId` | §2 第一、二行；§3 `SearchBar.tsx` |
| 6b `uFocusNonTargetActiveAlpha` 扫参写回 | §2 第三、四行；§3 `galaxyMeshes.ts` |
| 6c 回归（含 hover ring） | §2 第五、六行；§3 `screenRadius.ts`；§7 |

---

## 5. 未纳入本 Phase 的项（明确边界）

- **P13.7**：全量 spec / 基线 fps 文档同步等，**不在** P13.6 报告范围。
- **6b 若需再次改默认**：仅需改 `galaxyMeshes.ts` 中单一数值，并在本报告 §2「6b」表与变更记录中追加一行日期与取值理由。

---

## 6. 自动化验证（工程门槛）

在交付前已执行并通过：

- `frontend`：`npm run build`（`tsc -b` + `vite build`）
- `npx vitest run`（当时为 4 files / 22 tests 全绿）

**说明**：上述不替代 §7 的人工验收。

---

## 7. 人工验收结论

验收人按先前提供的清单完成手测，结论为 **通过**。覆盖要点包括：

- 搜索 X：在 **仅 focus**、**person/genre select + focus 嵌套** 等场景下，清除搜索即退出 focus，无需二次 ESC。
- 邻域视觉：默认 **0.08** 下 focus 邻域非目标 active 可接受。
- Orbit、切 pivot、ESC 与 mask 恢复、Timeline 留在 `movie.z`、邻域 **hover 环** 与拾取一致；Drawer 关闭 / 搜索 X / ESC 三条退出路径无逻辑倒退。

（若需审计追溯，建议在版本控制或项目管理工具中保留「验收人 + 日期 + 构建号」。）

---

## 8. 与后续 Phase 的关系

- **P13.7**：应在文档与 Phase 8 基线中引用本报告 §2 的**最终默认 alpha**与 **搜索 X 行为**，避免 spec 与代码漂移。
- **P13.5**：L/size 参照与本收尾独立；若未来修改 `getSelectionMaskPickSet` 契约，需同时回归 **邻域 pick + hover 环**。

---

*本报告与 `.cursor/plans/phase_13_focus_experience_ab016b85.plan.md` 中 P13.6 条目互补：计划描述意图与验收清单，本报告描述**已落地的最终决策与操作**。*
