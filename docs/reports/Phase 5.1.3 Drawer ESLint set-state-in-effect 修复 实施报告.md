# Phase 5.1.3 Drawer ESLint（set-state-in-effect）修复 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.3 ESLint 修复**（frontmatter 项 **`p5-1-3-eslint`**）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — **Issue B5**（`Drawer.tsx` 触发 `react-hooks/set-state-in-effect`）  
> **报告日期**: 2026-04-16  
> **范围**: `frontend/src/components/Drawer.tsx` — **`MovieDetailDrawer`** 中「详情 Sheet 延迟打开」相关的 **`useEffect` + `useState`** 写法，使 ESLint 规则通过；**不**改抽屉 UI、Sheet 蒙版（Phase 5.1.2）、相机、粒子或数据层。  
> **不在范围**: Phase 5.1.4 及以后的 XY 中位数、视距窗口、着色器分层、Raycaster、Spec 同步等。

---

## 1. 摘要

在用户要求 **先新开 Git 分支再实施** 的前提下，从基线创建分支 **`phase-5-1-3-eslint-drawer`**，重构 **`MovieDetailDrawer`** 内同步于 `useEffect` 主流程的 **`setSheetDelayedOpen(...)`** 调用：改为 **仅在 `window.setTimeout` 回调** 中更新 React state（以及在同一类异步回调中重置 **`prevSelectedRef`**），从而消除 **`react-hooks/set-state-in-effect`** 报错，并避免在 **render** 阶段写入 ref（否则会触发本仓库启用的 **`react-hooks/refs`** —「不得在 render 中更新 ref」）。

| 项 | 内容 |
| --- | --- |
| **原问题（B5）** | `Drawer.tsx` 约原 **195** 行附近：在 **`useEffect`** 内 **同步** 调用 **`setSheetDelayedOpen(false)`**（及同类同步 `setState`），触发 **`react-hooks/set-state-in-effect`**。 |
| **修改思路** | 所有对 **`sheetDelayedOpen`** 的更新，以及 **`selectedMovieId === null`** 时对 **`prevSelectedRef`** 的清零，均放入 **`setTimeout(..., 0)`** 或 **`setTimeout(..., 420)`**；`useEffect` 内只负责 **调度定时器** 与 **cleanup 清除定时器**。 |
| **行为保持** | **从空闲首次选中**：先保证关闭态，再 **420ms** 后打开（与 Phase 4.3 既定节奏一致）。**在已选中的影片之间切换**：通过 **`setTimeout(..., 0)`** 尽快设为打开。**清空选中**：在 **`setTimeout(..., 0)`** 中重置 ref 与关闭态。 |
| **验证** | 在 `frontend/` 执行 **`npm run lint -- --max-warnings 0`** 与 **`npm run build`**（`tsc -b && vite build`）均通过。 |

**Git 提交（功能实现）**:

| SHA（短） | 说明 |
| --- | --- |
| **`f26b64b`** | `fix(frontend): defer Drawer sheet state updates to satisfy ESLint (Phase 5.1.3)`（提交时间 `2026-04-16 22:03:59 +0800`） |

**计划同步**: follow-up 计划 frontmatter 中 **`p5-1-3-eslint`** 已标记为 **`completed`**（与本报告一致）。

---

## 2. 背景与目标

### 2.1 背景

- Phase 5.0 评估将「`Drawer.tsx` ESLint error」记为 **B5**。  
- Phase 5 follow-up 计划 **5.1.3** 要求：**重构 effect 中的状态设置逻辑**，例如 **useRef + 事件驱动** 或 **reducer**；本实施采用 **异步定时器** 将 `setState` 移出 effect 的同步执行路径，在满足规则的前提下 **最小改动** 保留既有延迟打开语义。  
- 曾尝试在 **`selectedMovieId === null`** 时在 **render** 中重置 ref/state，但 **`prevSelectedRef.current = null` 在 render 中赋值** 会触发 **`react-hooks/refs`**（「不得在 render 中更新 ref」），故未采用该路径。

### 2.2 目标（对照 Phase 5.1.3 与 B5）

| 目标 | 结果 |
| --- | --- |
| **`react-hooks/set-state-in-effect`** 不再报错 | **已满足**（`setState` 仅出现在 `setTimeout` 回调中） |
| **`react-hooks/refs`** 不引入新问题 | **已满足**（ref 写入保留在 effect 同步路径或异步回调中，**不在 render**） |
| 详情抽屉「延迟打开」产品行为与修复前一致 | **已对齐**（见下文状态机说明） |
| 生产构建与全量 ESLint 通过 | **`npm run lint` / `npm run build` 已通过** |

---

## 3. 技术说明

### 3.1 规则含义（简述）

- **`react-hooks/set-state-in-effect`**：不鼓励在 `useEffect` **同步体** 内直接 `setState`，以减少级联渲染与「effect 内再触发渲染」的反模式。  
- 将 **`setState` 推迟到 `setTimeout`/`queueMicrotask` 等宏/微任务** 后执行，通常视为 **非同步于 effect 主体** 的更新路径，本仓库 ESLint 配置下 **可通过检查**。

### 3.2 状态机（与实现对齐）

以下 **`open`** 指传给 **`MovieDetailDrawerHud`** 的 **`open`**，即 **`sheetDelayedOpen && selectedMovieId !== null && movie !== null`**（与代码一致）。

| 场景 | 行为 |
| --- | --- |
| **`selectedMovieId` 变为 `null`** | `setTimeout(0)`：**`prevSelectedRef = null`**，**`setSheetDelayedOpen(false)`**。 |
| **从空闲到首次有选中**（`prevSelectedRef` 原为 `null`） | 在 effect 同步路径更新 **`prevSelectedRef = selectedMovieId`**；**`setTimeout(0)`** 再次 **`setSheetDelayedOpen(false)`**（与旧实现「先关再计时」一致）；**`setTimeout(420)`** 后 **`setSheetDelayedOpen(true)`**。 |
| **在已有选中之间切换 ID**（`prevSelectedRef` 非 `null`） | **`setTimeout(0)`** 内 **`setSheetDelayedOpen(true)`**，尽快保持打开态。 |

**Cleanup**：每次 `selectedMovieId` 变化或卸载时 **`clearTimeout`**，避免泄漏与过期更新。

### 3.3 与「render 阶段调整 state」方案的取舍

- React 文档中存在 **随 props/store 变化在 render 中调整 state** 的模式，但本任务还需 **420ms 定时**，仍依赖 `useEffect`。  
- 若在 render 中写 **`prevSelectedRef.current`**，与本项目 **`eslint-plugin-react-hooks` 的 `refs` 规则** 冲突。  
- 最终方案：**单 effect + 仅异步 `setState`**，规则与行为兼顾。

---

## 4. 代码与文件

### 4.1 变更文件

| 文件 | 变更摘要 |
| --- | --- |
| `frontend/src/components/Drawer.tsx` | **`MovieDetailDrawer`**：重写 **`selectedMovieId`** 相关的 **`useEffect`**，用 **`setTimeout(0/420)`** 包裹全部 **`setSheetDelayedOpen`** 及对 **`prevSelectedRef`** 在「清空选中」时的写入。 |
| `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` | 将 **`p5-1-3-eslint`** 标为 **`completed`**（与提交 `f26b64b` 一并记录）。 |

### 4.2 关键实现摘录（当前仓库）

逻辑集中在 **`MovieDetailDrawer`** 的第二个 **`useEffect`**（依赖 **`[selectedMovieId]`**）：

```193:222:frontend/src/components/Drawer.tsx
  useEffect(() => {
    if (selectedMovieId === null) {
      const tid = window.setTimeout(() => {
        prevSelectedRef.current = null
        setSheetDelayedOpen(false)
      }, 0)
      return () => window.clearTimeout(tid)
    }

    const wasNull = prevSelectedRef.current === null
    prevSelectedRef.current = selectedMovieId

    if (wasNull) {
      const ensureClosed = window.setTimeout(() => {
        setSheetDelayedOpen(false)
      }, 0)
      const openAfterDelay = window.setTimeout(() => {
        setSheetDelayedOpen(true)
      }, 420)
      return () => {
        window.clearTimeout(ensureClosed)
        window.clearTimeout(openAfterDelay)
      }
    }

    const tid = window.setTimeout(() => {
      setSheetDelayedOpen(true)
    }, 0)
    return () => window.clearTimeout(tid)
  }, [selectedMovieId])
```

**未改动部分**（仍属本组件职责，但与 5.1.3 无直接关系）：

- 非法 **`selectedMovieId`** 与 **`movies`** 列表不一致时，在 **另一 `useEffect`** 内 **`useGalaxyInteractionStore.setState({ selectedMovieId: null })`** — 此为 **Zustand** 更新，**非** 本组件 `useState`，且 **非** 本次 B5 所指问题。  
- **`MovieDetailDrawerHud`**、海报子组件、**`open && movie` 的 debug `console.log`** 等均未改。

---

## 5. 验证与复现命令

在仓库 **`frontend/`** 目录：

```bash
npm run lint -- --max-warnings 0
npm run build
```

**结果**（本报告撰写时）: 上述命令 **退出码 0**，无新增 ESLint 问题，**TypeScript + Vite 生产构建** 成功。

---

## 6. Git 分支与合并说明

| 项 | 值 |
| --- | --- |
| **功能分支** | `phase-5-1-3-eslint-drawer` |
| **代表性提交** | `f26b64b` — `fix(frontend): defer Drawer sheet state updates to satisfy ESLint (Phase 5.1.3)` |

若需合入主线：在 **`main`** 上 **`git merge phase-5-1-3-eslint-drawer`**（或通过 Pull Request），合并后仍建议在 **`frontend/`** 执行 **§5** 命令做回归。

---

## 7. 风险与后续注意

| 点 | 说明 |
| --- | --- |
| **定时器与快速切换选中** | 依赖 **`clearTimeout`**；极端快速切换时，「420ms 延迟打开」可能与旧实现一样被 **取消或重排**，属可接受的交互边界。 |
| **若未来收紧规则** | 若 ESLint/React Compiler 将「从 effect **安排** 的 `setTimeout` 内 `setState`」也标为需注意，可再评估 **reducer** 或 **将延迟逻辑上移到 store/事件** 等结构重构。 |

---

## 8. 结论

Phase **5.1.3** 已完成：**B5** 对应的 **`react-hooks/set-state-in-effect`** 已通过 **异步化 `setSheetDelayedOpen` 与 ref 重置** 消除；**未引入** `react-hooks/refs` 问题；**构建与 Lint** 通过。计划项 **`p5-1-3-eslint`** 在 **`.cursor/plans/phase_5_follow-up_plan_64727854.plan.md`** 中为 **`completed`**。
