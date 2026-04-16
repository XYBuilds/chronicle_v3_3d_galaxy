# Phase 5.1.2 Detail 模糊蒙版修复 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.2 Detail 模糊蒙版修复**  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — **Issue H1**（Detail 态多余的模糊蒙版遮挡星球）  
> **报告日期**: 2026-04-16  
> **范围**: `frontend/src/components/ui/sheet.tsx` — 电影详情 **Sheet（Drawer）** 打开时是否对 **左侧 Three.js 星系画布** 施加全屏 **Backdrop（半透明 + 背景模糊）**；不涉及 `Drawer.tsx` 业务布局、相机、粒子或 Phase 5.1.3 的 ESLint 修复。  
> **不在范围**: 点击画布关闭抽屉、时间轴 `zCurrent`、中位数 XY 居中、视距窗口、着色器分层等后续 Phase 5.1 条目。

---

## 1. 摘要

在用户要求 **先新开 Git 分支再实施** 的前提下，从基线创建分支 **`phase-5-1-2-detail-blur-fix`**，对 shadcn 风格的 **Sheet** 实现做结构性调整：**删除 `SheetContent` 内的全屏 `SheetPrimitive.Backdrop`（原 `SheetOverlay` 组件）**，使详情抽屉打开时 **不再对整屏（含左侧 3D）叠加变暗与 `backdrop-blur`**。

| 项 | 内容 |
| --- | --- |
| **现象（H1）** | `SheetOverlay` 使用 `fixed inset-0` 全屏层，样式含 `bg-black/10` 与 `supports-backdrop-filter:backdrop-blur-xs`，导致 **左侧星系被轻微遮挡与模糊**。 |
| **修改** | 移除 **`SheetOverlay` 函数组件**；在 **`SheetContent`** 的 **`SheetPortal`** 中 **不再渲染** Backdrop，仅保留 **`SheetPrimitive.Popup`**（右侧抽屉面板）。 |
| **调用面** | 仓库内 **`SheetContent` 仅被** `frontend/src/components/Drawer.tsx` **使用**，无其它 Sheet 消费方需单独适配。 |
| **验证** | 在 `frontend/` 执行 **`npm run build`**（`tsc -b && vite build`）通过。 |

**Git 提交（功能实现）**:

| SHA（短） | 说明 |
| --- | --- |
| **`bd4000f`** | `fix(ui): remove Sheet overlay blur for detail drawer (Phase 5.1.2)`（提交时间 `2026-04-16 21:55:29 +0800`） |

**本报告与计划同步**（若已合入同分支）: 新增本文件，并将 follow-up 计划 frontmatter 中 **`p5-1-2-blur-fix`** 标记为 **`completed`**。

---

## 2. 背景与目标

### 2.1 背景

- Phase 5.0 评估将「详情抽屉打开时，蒙版 + 模糊影响左侧 3D 观感」记为 **H1**。  
- Phase 5 follow-up 计划 **5.1.2** 明确：**完全去除 `SheetOverlay`**，抽屉打开时 **背景无任何遮挡**，左侧 3D **无遮罩、无模糊**。  
- 技术栈上，UI 基于 **@base-ui/react** 的 **`Dialog` 原语**（在 `sheet.tsx` 中以 `SheetPrimitive` 别名使用）；原先 **Popup 与 Backdrop 同层叠在 Portal 内**，Backdrop 覆盖 **整个视口**。

### 2.2 目标（对照 Phase 5.1.2 验收）

| 目标 | 结果 |
| --- | --- |
| 点击星球 → 抽屉弹出时，**左侧 3D 场景无遮罩、无模糊** | **已满足**（移除全屏 Backdrop） |
| 实现方式与计划一致（去除 SheetOverlay / 等价物） | **已满足** |
| 生产构建通过 | **`npm run build` 已通过** |

---

## 3. 技术说明

### 3.1 修改前行为

- **`SheetContent`** 在 **`SheetPortal`** 内依次渲染：  
  1. **`SheetOverlay`** → **`SheetPrimitive.Backdrop`**，`className` 含 **`fixed inset-0 z-50`**、**`bg-black/10`**、**`supports-backdrop-filter:backdrop-blur-xs`** 等；  
  2. **`SheetPrimitive.Popup`** → 实际抽屉内容（右侧 `side="right"` 等）。  
- Backdrop 的 **`inset-0`** 使 **画布左侧区域** 同样处于 **叠层之下**，视觉上出现 **变暗 + 模糊**（H1）。

### 3.2 修改后行为

- **`SheetPortal`** 内 **仅** 渲染 **`SheetPrimitive.Popup`**，**无 Backdrop**。  
- 左侧 **未被 DOM 叠层覆盖**（除浏览器默认 stacking 外，无全屏半透明层），**无 `backdrop-filter`** 作用在星系上。  
- 右侧抽屉面板 **样式、动画、关闭按钮** 仍由 **`Popup` 的 `className` 与 `SheetPrimitive.Close`** 负责，**未改**。

### 3.3 刻意未采用的做法

- **未** 改为「保留 Backdrop 但去掉 blur / 降低透明度」：计划要求 **完全去除** 蒙版层，而非仅减弱效果。  
- **未** 修改 `Drawer.tsx` 的 Sheet 用法（`side="right"`、`className` 等）：**单点** 在 **`sheet.tsx`** 即可满足 H1。

---

## 4. 代码与文件

### 4.1 变更文件

| 文件 | 变更摘要 |
| --- | --- |
| `frontend/src/components/ui/sheet.tsx` | 删除 **`SheetOverlay`**；**`SheetContent`** 内移除 **`<SheetOverlay />`** |

### 4.2 当前 `SheetContent` 结构（语义摘要）

`SheetContent` 返回 **`SheetPortal` → `SheetPrimitive.Popup`**（子节点为 `children` 与可选关闭按钮），**无** `Backdrop`。

### 4.3 导出 API

- **`SheetOverlay` 从未在 `sheet.tsx` 的 `export { ... }` 中导出**，仅为内部组件；删除后 **对外导出列表不变**（`Sheet`, `SheetTrigger`, `SheetClose`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`）。

---

## 5. 验证与已知限制

### 5.1 已执行

| 检查项 | 结果 |
| --- | --- |
| `npm run build`（`frontend/`） | **通过** |

### 5.2 ESLint（与本任务无关的既有问题）

- 当前仓库 **`npm run lint`** 仍可能因 **`Drawer.tsx`** 中 **`react-hooks/set-state-in-effect`**（约第 195 行）报错 — 对应 Phase 5 计划中 **5.1.3（B5）**，**非 5.1.2 范围**。  
- 实施 5.1.2 **未引入** 该规则的新违规。

### 5.3 交互行为变化（产品说明）

- 移除全屏 Backdrop 后，用户 **无法再通过点击「半透明蒙版区域」关闭抽屉**（该层已不存在）。  
- **关闭路径** 仍以 **抽屉内关闭按钮** 及既有 **`onOpenChange`** 逻辑为主；若产品需要「点击左侧画布关闭详情」，需在 **Three 交互层或布局层** 另行设计（未包含在本 Phase 5.1.2 交付内）。

### 5.4 建议人工验收

- 运行 **`npm run dev`**，选中一颗星球打开详情：确认 **左侧星系清晰、无模糊、无整屏变暗遮罩**；右侧抽屉 **正常弹出与关闭**。

---

## 6. Git 与分支

| 项 | 内容 |
| --- | --- |
| 工作分支 | **`phase-5-1-2-detail-blur-fix`** |
| 功能提交 | **`bd4000f`** — 移除 Sheet Backdrop / 模糊蒙版 |

> **合并说明**: 合入目标分支前请 **`git log`** 核对提交；若本报告与计划更新为单独提交，以仓库实际历史为准。

---

## 7. 相关引用

| 类型 | 路径 / 标识 |
| --- | --- |
| 计划条目 | `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **§5.1.2**，todo **`p5-1-2-blur-fix`** |
| 实现文件 | `frontend/src/components/ui/sheet.tsx` |
| 唯一 Sheet 详情调用 | `frontend/src/components/Drawer.tsx` |
| 评估 Issue | Phase 5.0 报告 — **H1** |

---

## 8. 结论

Phase 5.1.2 已按计划 **去除详情 Sheet 的全屏 Backdrop**，消除 **对左侧 Three.js 星系的模糊与遮罩**，构建验证通过。后续可在 **5.1.3** 处理 Drawer 相关 ESLint；若需 **点击场景关闭抽屉**，可作为独立交互项排期。
