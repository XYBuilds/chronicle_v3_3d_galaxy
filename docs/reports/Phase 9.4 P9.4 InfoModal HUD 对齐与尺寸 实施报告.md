# Phase 9.4（P9.4）— InfoModal HUD 对齐与尺寸 — 实施报告

> **范围**：仅 Phase 9.4（应用信息弹层 `InfoModal`）。不动 Three.js、不改 `galaxy_data` 契约、不改 `infoCopy.ts` 占位文案内容。  
> **主文件**：`frontend/src/hud/InfoModal.tsx`  
> **对照**：当前线上实现的 `frontend/src/components/Drawer.tsx`（`MovieDetailDrawerHud` 内 Overview / Details / Cast 区块与 `SheetHeader`），**不以**早期静态 `drawer example` 为唯一依据。  
> **计划来源**：`.cursor/plans/phase_9_hud_polish_5e3d5977.plan.md`（P9.4 条目）  
> **Git 分支（实施时）**：`feature/p9-4-info-modal-drawer-align`（P9.4 样式与后续尺寸调整均收敛于该分支上的 `InfoModal` 演进）

---

## 1. 目标与边界（计划对齐）

| 计划项 | 最终处理 |
|--------|----------|
| Section 内部排版与 Drawer 同款 typography | **已对齐**：小标题与正文 class 与 Drawer 正文区块一致 |
| 保留 `infoCopy.ts` 占位文案不动 | **遵守**：仅 `InfoModal.tsx` 改结构与样式，文案仍由 `infoCopy` 常量注入 |
| 数据契约 / 渲染管线 | **未触碰** |
| Dialog 全局默认组件 | **未改** `frontend/src/components/ui/dialog.tsx` 默认值；Info 弹层所需尺寸在 `InfoModal` 内通过 `className` 覆盖 |

---

## 2. 最终产品决策（汇总）

### 2.1 风格锚点：对齐「当前 Drawer」

1. **明确口径**：P9.4 的视觉锚点是 **当前仓库中的 Drawer 实现**（P9.1 已落地的 Sheet 头、Overview 段、间距体系），保证 HUD 内「档案抽屉」与「关于 / 信息」弹层气质一致。  
2. **Section 结构**：与 Drawer 中 Overview 一致，使用 **`<section className="space-y-3">`**，**不使用**带 `border` / `bg-card` / `shadow-sm` 的独立卡片包裹各段正文（避免与 Drawer 流式长文块不一致）。  
3. **区块小标题（Section 内 `h3`）**：`text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground`（与 Drawer 的 Overview / Details / Cast 标题一致；**`font-bold`**，与早期 InfoModal 使用的 `font-semibold` 区分）。  
4. **正文（Section 内 `p`）**：`text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap`（与 Drawer Overview 正文一致）。

### 2.2 弹层头部：对齐 Drawer `SheetHeader` 层级

1. **DialogHeader**：采用与 Drawer `SheetHeader` 同类的 **底边、背景、内边距与轻投影**，包括：`border-b border-border/70`、`bg-popover`、`px-6 pt-7 pb-5 sm:px-7`、`shadow-[0_6px_18px_-10px_color-mix(in_oklch,var(--foreground)_10%,transparent)]`，以及 `relative z-20 shrink-0 gap-0`。  
2. **DialogTitle**：覆盖 shadcn 默认较小标题，对齐 Drawer 主标题：**`text-2xl font-bold leading-tight tracking-tight text-foreground`**，并保留 **`pr-10`** 为右上角关闭钮留出安全区（与 Drawer 标题区 `pr-10` 同理）。  
3. **DialogDescription**：对齐 Drawer 副标题层级：**`mt-2 text-sm font-medium leading-snug text-muted-foreground`**（内容为中文占位说明，仍非 `infoCopy` 导出项，属壳层说明文案）。

### 2.3 正文滚动区内边距与段间距

1. **与 Drawer 正文列一致**：滚动区内层容器使用 **`gap-7`**、**`px-6 py-5 sm:px-7`**（与 `MovieDetailDrawerHud` 滚动正文 `gap-7 px-6 py-5 sm:px-7` 对齐），底部略留 **`pb-6`** 便于滚到底时仍有呼吸空间。

### 2.4 弹层尺寸：默认逻辑与「放大一档」决策

**默认（`dialog.tsx` 中 `DialogContent`，全站基线）**

| 维度 | 含义 |
|------|------|
| 宽度 | `w-[min(100vw-1.5rem,32rem)]`：最宽 32rem，小屏左右合计约 1.5rem 边距 |
| 外壳高度上限 | `max-h-[min(90dvh,42rem)]`：不超过视口 90% 高度与 42rem 的较小者 |

**InfoModal 内 ScrollArea（在壳内再限制可滚动区）**

| 维度 | 调整前（仅继承壳时的常见搭配） | 调整后（当前） |
|------|-------------------------------|----------------|
| 可滚动区高度上限 | `max-h-[min(70dvh,28rem)]` | **`max-h-[min(78dvh,34rem)]`** |

**InfoModal 对壳体的覆盖（仅本弹层）**

| 维度 | 默认值 | **放大一档后** |
|------|--------|----------------|
| 宽度上限 | 32rem | **36rem**（`w-[min(100vw-1.5rem,36rem)]`） |
| 外壳高度上限 | 42rem（与 90dvh 取 min） | **48rem**（`max-h-[min(90dvh,48rem)]`） |

**决策说明**

1. **不在 `dialog.tsx` 改全局默认**：仓库内当前仅 Info 使用 `DialogContent`，仍坚持在 **`InfoModal` 上合并 class** 放大，避免将来新增 Dialog 时被动继承过大尺寸。  
2. **壳与 ScrollArea 双层 cap**：外壳限制整体占屏；ScrollArea 再限制正文区最大高度，长文案在内部滚动，行为与调大前一致，仅数值放宽一档。

### 2.5 未纳入本报告范围的事项

- P9.5 `?theme=`、P9.6 文档同步等 **其他 Phase 9 子项** 不在 P9.4 交付内。  
- P9.3 Tooltip 年份等 **与 InfoModal 无关** 的条目不重复展开。

---

## 3. 实施操作清单（按类型）

### 3.1 代码

| 操作 | 说明 |
|------|------|
| 新建分支 `feature/p9-4-info-modal-drawer-align` | 用户要求先开分支再实施 P9.4 |
| 编辑 `frontend/src/hud/InfoModal.tsx` | Section typography、DialogHeader / Title / Description、正文区 `gap`/`padding`、DialogContent 与 ScrollArea 尺寸覆盖 |
| 不修改 `frontend/src/hud/infoCopy.ts` | 计划要求占位文案仍集中于此文件后续统一补全 |
| 不修改 `frontend/src/components/ui/dialog.tsx` | 保持通用 Dialog 基线；尺寸在 InfoModal 覆盖 |

### 3.2 验证

| 操作 | 说明 |
|------|------|
| `npm run build`（`frontend` 目录） | `tsc -b && vite build` 通过即视为类型与打包无回归 |

### 3.3 Git

| 操作 | 说明 |
|------|------|
| 提交信息示例 | `feat(hud): align InfoModal typography and header with Drawer (P9.4)`（样式对齐）；尺寸放大可在后续提交中合并叙述或单独小提交（视仓库历史而定） |

---

## 4. 涉及文件一览

| 文件 | 角色 |
|------|------|
| `frontend/src/hud/InfoModal.tsx` | P9.4 唯一逻辑与样式承载 |
| `frontend/src/components/Drawer.tsx` | **只读对照**，未为 P9.4 修改 |
| `frontend/src/hud/infoCopy.ts` | **未改** |
| `frontend/src/components/ui/dialog.tsx` | **未改**（默认 32rem / 42rem 仍为全局基线） |

---

## 5. 验收对照（计划 P9.4）

- [x] Section 标题与正文 typography 与 **当前 Drawer** 同源。  
- [x] `infoCopy` 占位内容未改。  
- [x] Info 弹层相对默认 Dialog **放大一档**（36rem 宽、48rem 壳高、ScrollArea 78dvh / 34rem）。  
- [x] 前端生产构建通过。

---

## 6. 后续可选（非 P9.4 必做）

- 若未来存在多个大尺寸 Dialog，可考虑在 `dialog.tsx` 增加 `size` variant 或抽常量，避免魔法数字分散。  
- 若需与 Drawer 宽度（如 `sm:max-w-lg` 32rem）完全数值一致，可再评估 Info 是否改为与抽屉同宽；当前产品决策为 **略宽于默认 Dialog（36rem）** 以提升长文阅读体验。
