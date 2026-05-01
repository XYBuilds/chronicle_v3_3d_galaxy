# Phase 14.5 — Cmd / Ctrl+K 聚焦搜索框实施报告（定稿）

本文档归档 Phase 14 子项 **P14.5** 的**最终决策**、**已落地操作**与**验收口径**。  
关联计划：`.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md`（`p145-cmdk-focus`）。  
交叉引用：《TMDB 电影宇宙 Design Spec》键盘快捷键（**Cmd+K** / **Ctrl+K** → 聚焦搜索）、**`data-galaxy-search-input`**（`frontend/src/components/SearchBar.tsx`）。

---

## 1. 背景与范围

### 1.1 目标

在**不改动** 3D 渲染管线与数据契约的前提下：

- 全局 **Cmd+K**（macOS）或 **Ctrl+K**（Windows / Linux）在 **capture** 阶段聚焦 Galaxy 搜索框。
- 搜索索引不可用时（输入 **`disabled`**）**不拦截、不聚焦**（**noop**）。
- 与 **其它可编辑控件**（非本搜索框）聚焦时**不劫持**浏览器默认行为，避免与正文输入、地址栏习惯冲突（与计划风险表「与文本输入不冲突」一致）。
- 已存在查询时，快捷键触发后 **全选** 当前文本，便于一键替换（计划验收口径）。

### 1.2 范围边界

| 纳入 P14.5 | 不纳入（其他子项） |
| ---------- | ------------------ |
| `App.tsx` 内 `keydown` capture 分支；依赖既有 **`input[data-galaxy-search-input]`** | 搜索框 placeholder / 清空逻辑变更（P14.1 / P13.6 已决）；Design Spec 全文同步（**P14.8**）；**F** 全屏（**P14.4**） |

---

## 2. 最终锁定决策

| 编号 | 决策项 | 最终方案 |
| ---- | ------ | -------- |
| **D1** | 快捷键判定 | **`(e.metaKey \|\| e.ctrlKey) && e.key.toLowerCase() === 'k'`**，覆盖 mac **Cmd** 与 Win/Linux **Ctrl**。 |
| **D2** | 监听阶段与 DOM 作用域 | 与 **ESC 焦点栈**、**F 全屏**共用同一 **`window.addEventListener('keydown', handler, true)`**（**capture**）。 |
| **D3** | 目标元素定位 | **`document.querySelector<HTMLInputElement>('input[data-galaxy-search-input]')`**；**不**改为 React ref 跨层传递，保持 HUD 根组件单一注册点。 |
| **D4** | `disabled` 行为 | 若元素不存在或 **`searchInput.disabled === true`**：**直接 return**，**不** `preventDefault`，避免在无搜索能力时吞掉系统/浏览器对 Ctrl+K 的默认行为。 |
| **D5** | 与其它可编辑区冲突 | 当 **`activeElement`** 为 **`HTMLInputElement` / `HTMLTextAreaElement` / `contentEditable` 宿主**，且**不是**带 **`data-galaxy-search-input`** 的搜索框时：**return**，不拦截。 |
| **D6** | 搜索框已聚焦 | 仍执行 **`preventDefault` + `stopPropagation` + `focus()` + `select()`**：满足「再按一次不报错」且 **全选** 便于替换 query。 |
| **D7** | 与 **F** / **Esc** 分支顺序 | **Cmd/Ctrl+K** 分支置于 **`onKeyDownCapture` 最前**（先于 **F**、**Escape**），命中后即 **`return`**，避免与后续逻辑交叉。 |
| **D8** | 事件控制 | 在生效路径上同时调用 **`e.preventDefault()`** 与 **`e.stopPropagation()`**（与计划 §P14.5 一致）。 |
| **D9** | 全选语义 | 在 **`focus()`** 之后调用 **`HTMLInputElement.select()`**，满足验收「聚焦 + 全选已有 query」。 |
| **D10** | 文案与 a11y | 本子项**不新增** `en.json` 键；搜索框 **`aria`** / **`role="searchbox"`** 维持 **SearchBar** 既有实现。 |

---

## 3. 架构与数据流

```
App.tsx (useEffect, status === ready 之后与场景同生命周期挂载的 HUD 阶段)
  └── window keydown capture
        ├── Cmd/Ctrl+K → querySelector(input[data-galaxy-search-input])
        │       ├── 无节点或 disabled → noop（不 preventDefault）
        │       ├── 其它可编辑区聚焦（非本 input）→ noop（不 preventDefault）
        │       └── 否则 → preventDefault + stopPropagation + focus + select
        ├── F → …（P14.4）
        └── Escape → …（Design Spec §4.6）

SearchBar.tsx
  └── <input data-galaxy-search-input … disabled={isBlocked} />
```

---

## 4. 实施操作清单

### 4.1 新增文件

无（仅逻辑扩展）。

### 4.2 修改文件

| 路径 | 变更摘要 |
| ---- | -------- |
| `frontend/src/App.tsx` | 在同一 **`useEffect`** 的 **`onKeyDownCapture`** 内增加 **Cmd/Ctrl+K** 分支；注释更新为包含 **§P14.5**。 |

### 4.3 未修改但依赖的契约

| 路径 | 说明 |
| ---- | ---- |
| `frontend/src/components/SearchBar.tsx` | 搜索 **`input`** 已具备 **`data-galaxy-search-input`**；**`disabled`** 与索引可用性绑定，P14.5 依赖该属性判定 **noop**。 |

### 4.4 Git 交付（参考）

| 说明 | 值 |
| ---- | -- |
| 分支（实施时） | `phase/p14-5-cmdk-focus-search` |
| 提交 | **`e639a8b`** — `feat(hud): Cmd/Ctrl+K focuses galaxy search input (P14.5)` |

以仓库 **`git log`** 为准。

---

## 5. 无障碍与键盘

- **聚焦目标**：原生 **`input[type="text"]`**，由 **SearchBar** 维护 **`role="searchbox"`** 与 **`aria-*`**（本项未改）。
- **系统快捷键**：在「其它可编辑区」故意**不** `preventDefault`，减少与浏览器/OS 默认 **Ctrl+K** 行为的无谓对抗；在「可聚焦搜索且非它处编辑」路径上统一拦截并聚焦本应用搜索框。

---

## 6. 验收与回归

### 6.1 构建

- `cd frontend && npm run build`（`tsc -b` + `vite build`）在实施时已通过。

### 6.2 功能清单（计划 §P14.5 / §P14.8 摘录）

1. **mac Cmd+K / Win Ctrl+K**：搜索框获得焦点，且 **已有文本被全选**。  
2. **搜索框已聚焦**时再次 **Cmd/Ctrl+K**：仍 **focus + select**，无异常。  
3. **搜索 disabled**（无索引）：快捷键 **不** 被应用拦截（**noop**）。  
4. **焦点在其它 input / textarea / contenteditable**：**不** 拦截，便于与「文本输入不冲突」及风险表缓解策略一致。  
5. **ESC 焦点栈**、**F 全屏**：与 P14.4 / Design Spec §4.6 行为保持独立分支，互不覆盖。

### 6.3 建议手测环境

- **Chrome / Edge**（Win：**Ctrl+K**）。  
- **Safari / Chrome**（mac：**Cmd+K**）：确认与浏览器 UI 快捷键无不可接受冲突；若仅在特定页面 URL 下冲突，以产品取舍为准。

---

## 7. 风险与已知取舍

| 风险 | 缓解（定稿） |
| ---- | ------------ |
| **Ctrl+K** 在部分浏览器中另有默认绑定 | 仅在「安全」场景 **`preventDefault`**；**disabled** 与**其它可编辑区**不拦截。 |
| **`querySelector`** 若未来存在多个匹配 | 当前约定 **单例** `input[data-galaxy-search-input]`；若将来多实例，应改为 **ref** 或 **`data-galaxy-search-input` + 容器作用域** 查询。 |

---

## 8. 出口核对（P14.5 子项）

- [x] **App.tsx** capture 阶段 **Cmd/Ctrl+K** 实现。  
- [x] **`input[data-galaxy-search-input]`** 聚焦；**`disabled`** 时 **noop**。  
- [x] 验收：**focus** + **select**；与其它输入不冲突的 **`inOtherEditable`** 判定。  
- [x] **前端构建**通过。  

**P14.8** 文档总同步时，可将本报告路径列入 Phase 14 总报告「实施报告」索引。
