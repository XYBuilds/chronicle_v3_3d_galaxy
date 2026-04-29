# Phase 12.8 · P12.8 select 态正式入状态机 + ESC 焦点栈 — 实施报告

> 对应 [Phase 12 计划](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md) 中 **P12.8**（`p128-state-machine-select`）：在 P12.6 / P12.7 功能落地后，将 **ESC 焦点栈** 收敛为 **单一全局入口**（与 [Design Spec §4.6](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) 一致），并在 **`星球状态机 spec.md`** 增加实现层收口说明；顺带修正 **`constellation.ts`** 注释编码以消除生产构建失败。  
> **SSOT**：[`星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) §3.6 / §3.6.1；Design Spec §4.6；[`galaxyInteractionStore`](../../frontend/src/store/galaxyInteractionStore.ts) 中 **`clearSearch`**。  
> **Git 分支**：`feat/p12-8-esc-state-machine`。  
> **日期**：2026-04-29。

---

## 1. 目标与最终决策

| 议题 | 决策 |
|------|------|
| ESC 单一事实源 | **`App.tsx`** 注册 **`window` + `keydown` + capture (`true`)**，在任何子组件 bubble 之前处理 Escape，避免与 SearchBar 内重复逻辑冲突；命中一级后即 **`preventDefault` + `stopPropagation`**，降低与 Radix Sheet 双重响应的概率。 |
| 四级栈与设计对齐（语义） | **1** 搜索框聚焦 → **仅 `blur()`**，不清 query、不收面板、不改 **`searchMode` / `selectionIds`**。**2** Drawer（Sheet）打开 → 关抽屉。**3** **`selectedMovieId !== null`** → 取消 focus（`selectedMovieId → null`）；若 **`searchMode ∈ {'person','genre'}`** 则 **保留 select 会话**（mask / 连线 / `selectionIds` 不变）。**4** **`searchMode !== 'idle'`** → **`clearSearch()`**（mask 归零、连线隐藏、会话退出）。 |
| 实现层合并 | 代码路径将 **「Sheet 打开」与「仅 selectedMovieId 非空」** 统一为 **`selectedMovieId !== null` → `setState({ selectedMovieId: null })`**：抽屉由同一 store 字段驱动，关闭抽屉与取消 focus 等价；**飞入途中** Sheet 尚未打开时仍走同一分支，符合「先取消 focus，再下一拍 ESC 才退 select」的体验。 |
| 搜索框可识别性 | 顶部搜索 **`input`** 增加 **`data-galaxy-search-input`**（布尔属性），供第 1 级判断；**不**依赖 `id` 或 `role` 单独判定，避免与其它 `role="searchbox"` 冲突。 |
| SearchBar 内 Escape | **移除**输入框内对 Escape 的 **`preventDefault` + blur**；第 1 级完全由 **`App` capture** 处理（若全局未挂载则失去兜底——当前应用唯一入口为 `App`，可接受）。 |
| 与 INFO Modal 不交叠 | 若 **`document.activeElement`** 位于 **`#app-info-dialog`**（[`InfoModal`](../../frontend/src/hud/InfoModal.tsx) 内 **`DialogContent`**） subtree，**整段 ESC 栈直接 return**，交由 Radix Dialog 默认 Esc 关闭；避免在说明面板打开且焦点在对话框内时误清 **`selectedMovieId` / clearSearch**。 |
| focus × select 嵌套 | 第 3 级仅写 **`selectedMovieId: null`**，**不**调用 **`clearSearch()`**，与 §3.6「ESC 取消 focus 保留 select」一致。 |
| 搜片名路径 | 电影联想仅写 **`selectedMovieId`**，**`searchMode` 保持 `'idle'`**，故第 4 级不触发；连续 Esc：**blur（若焦点在搜索框）→ 取消 focus**。 |
| 可验证性 | 第 3、4 级命中时 **`console.log('[ESC]', …)`** 输出当前 **`searchMode`** 或 **`clearSearch`** 提示（与项目「状态可见性」准则一致）。 |
| 文档收口 | **`星球状态机 spec.md`** 新增 **§3.6.1**，用表格固化四级栈与 INFO 排除规则；链接至 Design Spec §4.6。 |
| HUD 占位文案 | **`infoCopy.ts`** 中 **`INFO_INTRO_BODY` / `INFO_STACK_BODY`** 略补一句功能语境（仍为占位级，非正式产品文案）。 |
| 计划清单 | **`.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md`** 将 **`p128-state-machine-select`** 标为 **completed**。 |

---

## 2. 附带修复：`constellation.ts` 与构建

| 问题 | 处理 |
|------|------|
| `vite build` / Rolldown 报 **`constellation.ts` stream did not contain valid UTF-8** | 源文件注释中存在 **损坏字节 / 替换字符**（显示为 `�`、`?` 等）。 |
| 决策 | **仅重写注释**为合法 UTF-8（如 **`§4.5.1`**、**`—`**、**`A–B`**、**`P12.7 —`**），**不改运行时代码路径**。 |

---

## 3. 交付物清单

| 类型 | 路径 | 说明 |
|------|------|------|
| 全局 ESC | [`frontend/src/App.tsx`](../../frontend/src/App.tsx) | `useEffect` 注册 **`keydown` capture**；分支顺序见 §1 |
| 搜索框标记 | [`frontend/src/components/SearchBar.tsx`](../../frontend/src/components/SearchBar.tsx) | **`data-galaxy-search-input`**；移除输入框内 Escape 专用分支 |
| 状态机 SSOT | [`docs/project_docs/星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) | **§3.6.1** ESC 焦点栈实现表 + 变更记录行 |
| HUD 占位 | [`frontend/src/hud/infoCopy.ts`](../../frontend/src/hud/infoCopy.ts) | 简介 / 技术栈占位微调 |
| 编码修复 | [`frontend/src/three/constellation.ts`](../../frontend/src/three/constellation.ts) | 注释 UTF-8 修正 |
| 计划状态 | [`.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md`](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md) | P12.8 todo **completed** |

---

## 4. ESC 处理顺序（实现伪代码）

```text
on keydown Escape (capture):
  if activeElement inside #app-info-dialog → return  // Radix Dialog
  if activeElement is INPUT[data-galaxy-search-input] → blur(); stop
  if selectedMovieId !== null → set selectedMovieId null; stop  // 保留 person/genre select
  if searchMode !== 'idle' → clearSearch(); stop
  // else: 不拦截，默认行为
```

---

## 5. 验收对照（计划口径）

| 验收项 | 结果 |
|--------|------|
| ESC 第 1 级仅失焦搜索框，不清 select | **达成**（仅 `blur()`） |
| ESC 在 person/genre select + focus 下：先取消 focus，再 ESC 才 `clearSearch` | **达成**（两级分离） |
| 搜电影名 → focus → ESC：取消 focus；无第 4 级 | **达成**（`searchMode === 'idle'`） |
| shadcn Sheet 与全局 ESC：同一 store 关闭 drawer，capture 优先减少双触发 | **达成**（以实测为准；冲突时以 `stopPropagation` 为准） |
| `npm run build` | **通过**（含 `constellation.ts` 修复后） |
| `npm run test`（Vitest） | **通过**（执行时全绿） |

---

## 6. 已知边界与未决项

| 项 | 说明 |
|----|------|
| INFO Modal 打开且焦点在画布 / 非对话框 | 当前 **仅**在焦点位于 `#app-info-dialog` 内时让渡 Esc；若焦点在外且 Modal 仍打开，全局栈 **可能**先于 Dialog 处理——属低频交互，若需严格优先级可后续监听 **`Dialog` open state** 再扩展。 |
| Radix Sheet 与 Esc | 以 **`selectedMovieId`** 为单一真相关闭抽屉；若未来 Sheet 与 store 脱钩，需复测 capture 顺序。 |

---

## 7. 变更记录（本报告）

| 日期 | 说明 |
|------|------|
| 2026-04-29 | 初稿：P12.8 决策、文件清单、`constellation.ts` 编码修复与验收结果归档。 |
