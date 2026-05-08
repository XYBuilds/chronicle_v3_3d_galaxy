# Phase 22.5（P22.5）— Drawer 关闭入口重构与 FocusExitButton — 实施报告

> **范围**：移除详情抽屉 **右上角 SheetClose（X）**；新增 **`FocusExitButton`**：与 Drawer **解耦**、随 **focus（`selectedMovieId !== null`）** 显示的视口级退出控件；**HUD 文案**经 **`hud.exitFocus`** 国际化；**ESC** 焦点栈行为不变。  
> **计划来源**：`.cursor/plans/phase_22_visual_interaction_polish_f88228c5.plan.md`（§ P22.5 drawer 退出按钮（屏幕底部 floating）— 实施过程中对 **锚点位置与样式** 有迭代定稿，见下文 §1）  
> **报告日期**：2026-05-08

---

## 1. 最终决策（定稿）

| 议题 | 决策 |
|------|------|
| Drawer 关闭入口 | **删除** `Drawer.tsx` 内 **`<SheetClose>` + 右上角 CloseButton**；**不接受**「点击空白关闭 Sheet」作为替代（与既有 **`disablePointerDismissal`** 一致）。 |
| 退出途径 | **ESC**（`App.tsx` capture：`selectedMovieId !== null` 时清空）**保持不变**；新增 **鼠标 / 触控可达**的 **`FocusExitButton`**。 |
| 与 Drawer 的关系 | 按钮 **不挂载在 Sheet 内**；仅依赖 **`useGalaxyInteractionStore.selectedMovieId`**。**只要有 focus（选中影片）即渲染**，与 Drawer 动画迟滞打开与否无关（计划原文「不一定要 drawer 已打开」）。 |
| 退出语义 | **`useGalaxyInteractionStore.setState({ selectedMovieId: null })`**，与 ESC 首段逻辑一致 → **`MovieDetailDrawer`** 随状态关闭、场景退出 focus。 |
| 锚点（相对星球） | **对齐思路参照 `FocusLReference`**：评分条以 **`top-1/2` + 左侧 `left-[max(0.75rem,calc(50vw-22rem))]`** 与屏幕中心星球并排；退出按钮以 **`left-1/2 -translate-x-1/2`** 置于 **视口水平中心**（星球投影下方）。**竖直位置**：**`top: min(calc(50% + 16rem), …)`**，第二项用 **`100dvh`、安全区 `env(safe-area-inset-bottom)`、下边距** 做 **clamp**，避免矮屏或刘海裁切。（计划初稿「屏幕底居中」在实施中修订为本锚点。） |
| `top` 偏移最终值 | **`16rem`**（相对竖直中心下移；由 **`10rem` / `11rem`** 迭代上调）。 |
| 层级 | **`z-[60]`**（高于 Timeline 等 **`z-30`～`z-40`** HUD；低于需压在抽屉之上的浮层时另行约定）。 |
| 可观测性 | 点击时 **`console.log('[FocusExitButton] exit focus', { selectedMovieId })`**，与项目「关键交互可追溯」习惯一致。 |
| **idle / active（样式）** | **idle**：**outline** — 透明底、无边模糊与阴影（**`bg-transparent` / `shadow-none` / `backdrop-blur-none`**）。**交互态**（**`hover` / `focus-visible` / `active`**）：保持原计划实心 HUD 观感 — **`bg-popover/90`、`shadow-lg`、`backdrop-blur-md`**；键盘 **`focus-visible:ring-2`**。**过渡**：含 **`color`** 在内的 **`transition` ~200ms**。 |
| **浅色 / 深色主题（idle 字色）** | **浅色（非 `.dark`）idle**：**`text-white`**（压在黑色 WebGL 画布上可读）。**深色（`.dark`）idle**：**`dark:text-foreground`**。交互态统一 **`text-popover-foreground`**，避免浅色主题下 **白底白字**。 |
| i18n | **`frontend/src/lib/locales/*.json`** 的 **`hud.exitFocus`**：**英文 `Exit focus`**、**简体中文 `退出聚焦`**；其余 **`ja` / `es` / `fr` / `ar` / `zh-Hant`** 为等价翻译，满足 **`locales.schema.spec.ts`** 与 **en** 键路径一致。 |
| `strings.ts` | **`raw.hud`** 直通 **`buildStrings`**，**无需**为 `exitFocus` 单独加函数包装（与既有 **`hud`** 字段一致）。 |
| Storybook | **`MovieDetailDrawerHud`** 的 **Toggle** story 仍靠外层按钮开关；**无** Drawer 内 X 后，交互关闭依赖 **`onOpenChange(false)`** 或 **`FocusExitButton`** 真机路径 — **与计划兼容**。 |
| **viewport-fit（可选后续）** | 当前 **`index.html`** 未强制 **`viewport-fit=cover`**；**`env(safe-area-inset-bottom)`** 在部分 iOS 刘海机上可能仍为 **0**。若实机底部仍贴 Home 条，可补 **`viewport-fit=cover`**（非 P22.5 必达项）。 |

---

## 2. 最终操作（代码与路径）

| 操作 | 路径 | 说明 |
|------|------|------|
| 移除 Drawer 内关闭控件 | [`frontend/src/components/Drawer.tsx`](../../frontend/src/components/Drawer.tsx) | 删除 **`<SheetClose>`** 及对 **`CloseButton` / `SheetClose`** 的 import；**`SheetTitle`** 去掉原 **`pr-10`**（原为避让 X）。 |
| 新增焦点退出按钮 | [`frontend/src/hud/FocusExitButton.tsx`](../../frontend/src/hud/FocusExitButton.tsx) | **`FocusExitButton`**：`selectedMovieId === null` 时不渲染；固定定位 + **`top` min 表达式** + **`left-1/2 -translate-x-1/2`**；按钮 **idle / 交互态** 样式与 **浅色 idle 白字**见 §1。 |
| 挂载 | [`frontend/src/App.tsx`](../../frontend/src/App.tsx) | 在主场景 **`started`** 分支中，于 **`MovieDetailDrawer`** 旁（或与 Timeline 同级）渲染 **`<FocusExitButton />`**。 |
| 文案 | [`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) 等 **7 个 locale** | 各 **`hud.exitFocus`** 键值；与 **`frontend/src/lib/locales/locales.schema.spec.ts`** 校验一致。 |

**刻意未改动**

- **`MovieDetailDrawer`** 内 **`onOpenChange(false)` → `selectedMovieId: null`** 仍保留（程序化关闭契约）。  
- **Tech Spec / Design Spec**：按计划汇总至 **P22.9** 时批量同步（本子报告归档 **P22.5** 事实状态）。

---

## 3. Git 提交摘要（参考）

| Hash（简写） | 说明 |
|--------------|------|
| `8efaaed` | **feat(ui)**：删除 Drawer **SheetClose**；新增 **`FocusExitButton`**；全 locale **`hud.exitFocus`**；**`App.tsx`** 挂载。 |
| `7854766` | **refactor(ui)**：**FocusExitButton** 定位与样式增强（outline / 实心交互态、锚点与主题字色等 — 以 **`HEAD`** 文件为准）。 |

（若已合并或追加 commit，以目标分支 **`git log -- frontend/src/hud/FocusExitButton.tsx`** 为准。）

---

## 4. 验收记录

| 项 | 结果 |
|----|------|
| focus 进入 | **`selectedMovieId`** 非空时出现退出控件（与 Drawer 打开时序独立）。 |
| 点击按钮 | **`selectedMovieId` → `null`**；Drawer 关闭；相机回宏观（与 ESC 一致）。 |
| 无 focus | 按钮 **不渲染**。 |
| Drawer | **右上角无 X**。 |
| 键盘 | **`aria-label`** = **`t.hud.exitFocus`**；**`focus-visible`** 可见 **ring**；可与 **Tab** 聚焦配合 **Enter** 触发（与原生 **button** 行为一致）。 |
| i18n | **7** 语言 bundle **键路径一致**；**Vitest** **`locales.schema.spec`** 通过。 |
| 构建 | **`npm run test`**、**`npm run build`** 在实施节点 **通过**（若升级依赖请以 CI 为准）。 |

---

## 5. 与计划 P22.5 的对照

| 计划项 | 结果 |
|--------|------|
| 删除 Drawer **`<SheetClose>`** | **已完成**。 |
| **`FocusExitButton.tsx`** + **`App.tsx`** 挂载 | **已完成**。 |
| **`hud.exitFocus`**（**en/zh** 及全 locale） | **已完成**（实施扩展为 **全部 LOCALE_IDS** 以避免 schema 漂移）。 |
| 计划示例「**屏幕底部 `bottom-6`**」 | **修订为** §1「**星球下方锚点 + `16rem` + 安全区 clamp**」— **属实施迭代定稿**。 |
| ESC 不变 | **满足**。 |
| z-index 与 Timeline | **`60` > Timeline `30`**；与计划意图一致。 |

---

## 6. 风险与回滚

| 风险 | 缓解 |
|------|------|
| **`top` 偏移与真实星球屏幕位置偏差** | 相机纵横比 / 安全区变化下星球未必严格在 **`50vw`**；若验收不符，仅调 **`calc(50% + 16rem)`** 或引入与 **`FocusLReference`** 共享常量。 |
| 浅色 idle **白字**在非纯黑叠层场景对比不足 | 当前主画布仍以 **黑底**为主；若未来 HUD 叠亮色遮罩，需再评估 **idle** 字色。 |
| iOS **safe-area** 未生效 | 可选 **`viewport-fit=cover`**（见 §1）。 |

**回滚**：恢复 Drawer 内 **`SheetClose`**；移除 **`FocusExitButton`** 与 **`App.tsx`** 引用；删除各 locale **`hud.exitFocus`**（并同步 **schema** 测试期望）。

---

## 7. 出口状态

| 项 | 状态 |
|----|------|
| Drawer 右上关闭 | **已移除** |
| Focus 退出 — 指针可达 | **`FocusExitButton`** |
| 文案 SSOT | **`hud.exitFocus`**（**`en.json`** 等） |
| 样式定稿 | **idle outline + 交互实心**；浅色 idle **白字** |
| 位置定稿 | **水平居中星球投影下方，`+16rem` + 底部 clamp** |
| 本报告 | **P22.5 最终决策与操作** 归档 |
