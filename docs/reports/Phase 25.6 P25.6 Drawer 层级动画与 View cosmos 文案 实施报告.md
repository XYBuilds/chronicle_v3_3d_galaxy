# Phase 25.6 — Drawer 层级、动画与「View cosmos」文案 实施报告

**范围**：`.cursor/plans/phase_25_core_experience_polish.plan.md` 子项 **P25.6**（Drawer z-index、右侧滑入/滑出动画、退出 focus 文案；不含 P25.7 大范围 SSOT 文档收口）。  
**分支**：`phase/p25-6-drawer-layer-motion-copy`（开发与串联提交均在此分支完成）。  
**日期**：2026-05-12  
**状态**：**已完成**（层级与 Info 对话框关系已定稿；Drawer 动效为**仅位移**；`hud.exitFocus` 全 bundle 以 **View cosmos** 语义对齐）。

---

## 1. 目标（与计划对齐）

| 计划项 | 本阶段结果 |
|--------|------------|
| Drawer 高于常规 HUD（hover ring、tooltip、timeline、focus HUD 等） | **已实现**：Sheet 内容 `z-[110]`，高于既有 `z-[90]`～`z-[100]` 层 |
| 与 Info 模态框的层级关系 | **已实现**：全局 `Dialog` 提升至 `z-[120]` / `z-[121]`，About 始终压在 Drawer 之上 |
| 右侧抽屉：向左滑入、向右退出 | **已实现**：`translate-x-full` ↔ `0`；时长 **300ms** 打开 / **450ms** 关闭 |
| 退出 focus 英文文案定稿 | **已定稿**：`en.json` → **View cosmos**（曾短暂采用 Back to cosmos，见 §2） |
| 淡入淡出与位移是否并存 | **最终决策**：**禁用透明度过渡**，仅保留 **transform** 位移动画（见 §2） |

---

## 2. 最终决策

1. **z-index 阶梯（主场景 HUD，不含 Cover）**  
   - 改造前：`SheetContent` 继承 `sheet.tsx` 默认 **`z-50`**，低于 **`HoverRing` / `SearchBar`（`z-[90]`）**、**`MovieTooltip`（`z-[100]`）**、**`FocusExitButton`（`z-[60]`）** 等，Drawer 会被压住。  
   - 改造后：**Drawer `z-[110]`**，明确高于上述元素；**Timeline / `FocusLReference`** 仍为 `z-30`～`z-[35]`，无需改动。

2. **Drawer 与 Info 对话框**  
   - **Info（`#app-info-dialog`）必须始终盖在 Drawer 上**：用户可在详情抽屉打开时阅读 About，且 ESC 焦点栈仍以对话框为先（见 `App.tsx` 中对 `#app-info-dialog` 的处理）。  
   - 因此将 **`DialogBackdrop`** 设为 **`z-[120]`**，**`DialogContent`（Popup）** 设为 **`z-[121]`**，高于 Drawer 的 **`110`**。

3. **滑入/滑出幅度**  
   - 不使用 `sheet.tsx` 默认的 **`translate-x-[2.5rem]`** 微位移；在 **`MovieDetailDrawerHud`** 的 `SheetContent` 上覆盖为 **`translate-x-full`**，从视口右缘外整幅进出，方向符合「右侧抽屉」直觉。

4. **动效：仅位移，不淡入淡出**  
   - `sheet.tsx` 对 Popup 带有 **`data-starting-style:opacity-0` / `data-ending-style:opacity-0`**。  
   - **最终决定**：在 Drawer 的 `SheetContent` 上使用 **`transition-transform`**（不再过渡 `opacity`），并用 **`data-starting-style:opacity-100` / `data-ending-style:opacity-100`** 覆盖默认淡出，保证进出场**全程不透明**，只看见**横向滑动**。

5. **缓动与时长**  
   - 沿用既有常量 **`SHEET_OPEN_EASE`**（`cubic-bezier(0.215, 0.61, 0.355, 1)`，easeOutCubic，与 Phase 4.3 注释一致）。  
   - **打开 300ms**；**关闭 450ms**（`data-ending-style:duration-[450ms]`），与改造前节奏一致。

6. **`hud.exitFocus` 英文定稿**  
   - 计划候选含 *Back to cosmos* / *Return to cosmos* / *View cosmos*。  
   - **先落地** `Back to cosmos`（提交 `efb21fd`），经产品反馈后 **改为 `View cosmos`**（提交 `2ee84bb`），并同步翻译其余 locale（见 §3.3）。

---

## 3. 最终操作（工程变更摘要）

### 3.1 前端 — Drawer（`MovieDetailDrawerHud`）

- **文件**：[`frontend/src/components/Drawer.tsx`](../../frontend/src/components/Drawer.tsx)  
- **`SheetContent` 追加/覆盖的 class 要点**：  
  - `z-[110]`  
  - `data-[side=right]:data-starting-style:translate-x-full`  
  - `data-[side=right]:data-ending-style:translate-x-full`  
  - `data-starting-style:opacity-100 data-ending-style:opacity-100`  
  - `transition-transform duration-[300ms] ease-[var(--sheet-ease)] data-ending-style:duration-[450ms]`  
- **`sheet.tsx` 未改**：其它潜在 Sheet 用法仍保留默认 `z-50` 与 2.5rem/opacity 行为；仅电影详情 Drawer 通过传入 `className` 覆盖。

### 3.2 前端 — 全局 Dialog（Info 模态）

- **文件**：[`frontend/src/components/ui/dialog.tsx`](../../frontend/src/components/ui/dialog.tsx)  
- **变更**：`DialogBackdrop` **`z-50` → `z-[120]`**；`DialogPrimitive.Popup` **`z-[51]` → `z-[121]`**。  
- **说明**：当前仓库内 Info 为主要 `Dialog` 消费者；若未来新增模态需介于 HUD 与 Drawer 之间，应再单独评审 z 阶梯。

### 3.3 前端 — i18n（`hud.exitFocus`）

- **文件**：[`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) 等 **全部 bundle**（`zh` / `zh-Hant` / `ja` / `es` / `fr` / `ar`）  
- **SSOT 键结构**：未增删键，仅改叶子字符串；与 `locales.schema.spec.ts` 一致。  
- **英文最终值**：`View cosmos`  
- **其它语言**（与英文语义对齐的本地化示例）：简繁「查看宇宙」、ja「コスモスを見る」、es「Ver el cosmos」、fr「Voir le cosmos」、ar「عرض الكون」。

### 3.4 计划文件

- **文件**： [`.cursor/plans/phase_25_core_experience_polish.plan.md`](../../.cursor/plans/phase_25_core_experience_polish.plan.md)  
- **操作**：将 **P25.6** todo 标为 **completed**（与当时提交一并完成）。

### 3.5 Git 提交（按时间顺序）

| 提交 | 说明 |
|------|------|
| `efb21fd` | **feat(P25.6)**：Drawer `z-[110]` + `translate-x-full` 滑入滑出；Dialog 提层；`exitFocus` 首版 **Back to cosmos** + 各语言翻译 |
| `2ee84bb` | **chore(i18n)**：`exitFocus` 改为 **View cosmos** 及对应翻译 |
| `76d8a48` | **fix(Drawer)**：仅 **transform** 过渡 + **opacity 恒为 1**，去掉淡入淡出 |

---

## 4. 验收对照（计划 P25.6）

| 验收项 | 结果 |
|--------|------|
| Drawer 打开时不被其它常规 HUD 压住 | **通过**（`110` 高于 `90`/`100` 等） |
| 进入/退出方向符合右侧抽屉直觉 | **通过**（自右向左入、向右出） |
| 按钮动作语义清晰 | **通过**（「View cosmos」表示回到宏观星系视图） |
| Info 打开时仍高于 Drawer | **通过**（`120` / `121`） |

---

## 5. 未纳入本报告的范围

- **P25.7**：Tech Spec / Design Spec / 视觉参数总表 / Data Pipeline 等与代码的最终书面同步，见计划 **P25.7** 单独收口。  
- **Drawer 宽度与 cast 栅格**：属 **P25.4 / P25.5**，见 [`Phase 25.5 P25.5 Drawer cast 与全量 cast 导出 实施报告.md`](./Phase%2025.5%20P25.5%20Drawer%20cast%20与全量%20cast%20导出%20实施报告.md)。

---

## 6. 参考：改造前后部分 z-index 对照（主场景）

| 区域 / 组件 | 约 z-index |
|-------------|------------|
| Timeline / FocusLReference | `30` / `35` |
| 右上角 Info / 语言 / 全屏 | `40` |
| FocusExitButton | `60` |
| HoverRing、SearchBar | `90` |
| MovieTooltip | `100` |
| **Movie detail Drawer（P25.6）** | **`110`** |
| **Dialog 遮罩 / 内容（P25.6）** | **`120` / `121`** |

（Cover 流程另有 `z-[25]`～`30` 遮罩与品牌层；**`MovieDetailDrawer` 仅在非 cover 时挂载**，与 P25.6 无冲突。）
