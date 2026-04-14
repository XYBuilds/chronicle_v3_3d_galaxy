# 代码审查后续：ESLint 历史告警（`react-refresh/only-export-components`）— 实施报告

> **关联计划**: `.cursor/plans/code_review_follow-up_9d90ade4.plan.md` — **§4 ESLint 历史告警（审查 3.5）**  
> **审查依据**: `docs/reports/Project_Status_and_Code_Review_Report.md`（建议在进入 Phase 4 前使 `npm run lint` 零告警或通过可解释的窄范围例外处理）  
> **报告日期**: 2026-04-14  
> **范围**: `frontend/` 下 ESLint 扁平配置所覆盖的 **`*.ts` / `*.tsx`**；本次仅涉及 **UI Button** 模块的文件拆分。  
> **不在范围**: 计划 **§3 相机漫游边界**、**§5 Genre 色板** 等其它条目。

---

## 1. 摘要

在用户要求 **先新开 Git 分支再实施** 的前提下，从基线创建分支 **`chore/eslint-cleanup-3.5`**，针对根目录 **`npm run lint`**（转发至 **`frontend`** workspace）暴露的 **唯一一条** ESLint 错误进行修复：

- **规则**: `react-refresh/only-export-components`（来自 `eslint-plugin-react-refresh` 的 Vite 预设，见 `frontend/eslint.config.js`）。
- **根因**: `frontend/src/components/ui/button.tsx` 在同一文件中既导出 React 组件 **`Button`**，又导出 **`buttonVariants`**（`class-variance-authority` 的 `cva` 结果）。Fast Refresh 约定「单文件仅导出组件」时，该混导出会报错。
- **处理**: 按计划建议 **拆分文件** — 将 **`buttonVariants`** 定义移至新模块 **`button-variants.ts`**，`button.tsx` **仅导出组件 `Button`**，并从 `./button-variants` 引入变体函数供内部使用。
- **验证**: 在仓库根执行 **`npm run lint`**、**`npm run build`** 均通过。

**Git 提交**: **`8887158`** — `fix(frontend): split buttonVariants for react-refresh ESLint rule`

---

## 2. 背景与目标

### 2.1 背景

- 前端使用 ESLint 9 扁平配置（`eslint.config.js`），其中包含 **`reactRefresh.configs.vite`**，用于保证 Vite + React 下的 Fast Refresh 可预期工作。
- `react-refresh/only-export-components` 会警告：若某 `*.tsx` 文件导出非组件符号（如工具函数、常量、`cva` 工厂等），可能导致 HMR 行为不符合预期。

### 2.2 目标（对照 follow-up 计划 §4）

| 目标 | 结果 |
| --- | --- |
| **`npm run lint`（根或 frontend）零告警**，或仅可解释的窄范围 disable | **已达成零错误**；未使用文件级 `eslint-disable` |
| 对 `react-refresh/only-export-components` 优先采用 **拆文件** 或 **非组件模块例外** | 采用 **拆文件**（`button-variants.ts`） |

---

## 3. 实施前 Lint 输出（基线）

在修复前，于仓库根执行：

```bash
npm run lint
```

典型输出（节选）：

```text
frontend\src\components\ui\button.tsx
  58:18  error  Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components  react-refresh/only-export-components

✖ 1 problem (1 error, 0 warnings)
```

即：**1 个 error，0 个 warning**；问题集中在 **`button.tsx` 第 58 行** 的联合导出。

---

## 4. Git 与分支

| 项 | 内容 |
| --- | --- |
| 工作分支 | **`chore/eslint-cleanup-3.5`** |
| 功能提交 | **`8887158`** — `fix(frontend): split buttonVariants for react-refresh ESLint rule` |

> **合并说明**: 若该分支已合并入 `main`，请在目标分支上用 **`git log`** 核对 **`8887158`** 或对应 merge commit。

---

## 5. 变更清单（按文件）

### 5.1 新增 `frontend/src/components/ui/button-variants.ts`

- 从原 **`button.tsx`** 移入 **`cva(...)`** 的完整配置（`variant` / `size` / `defaultVariants` 等），并 **`export const buttonVariants`**。
- 该文件 **不导出 React 组件**，因此不受 `react-refresh/only-export-components` 约束。

### 5.2 修改 `frontend/src/components/ui/button.tsx`

- 删除文件内联的 **`buttonVariants`** `cva` 定义。
- 增加 **`import { buttonVariants } from "./button-variants"`**。
- **`class-variance-authority`** 的导入改为仅保留类型侧需要的 **`type VariantProps`**（若未来仅需从 `buttonVariants` 推断类型，可继续从 `button-variants` 侧扩展导出类型别名，本次未新增额外类型导出）。
- **导出面**：仅 **`export { Button }`**；**不再**从 `button.tsx` 再导出 `buttonVariants`，避免同一文件再次出现「组件 + 非组件」混导出而复现告警。

### 5.3 未修改 `frontend/eslint.config.js`

- 未通过放宽全局规则或大面积 `eslint-disable` 掩盖问题；配置保持与审查建议一致。

---

## 6. 对后续开发的约定

- 若业务或 Storybook 中需要将 **`buttonVariants`** 用于「非 `Button` 组件、但需要同款样式」的场景（例如 `asChild` 链式、自定义 `Slot`、链接伪装按钮等），请 **直接从** `@/components/ui/button-variants` **导入 `buttonVariants`**，而不是从 **`button.tsx`** 二次导出。
- 本次仓库内 **无其它文件** 曾从 `button.tsx` 导入 `buttonVariants`，因此 **无需批量修改 import**。

---

## 7. 验证步骤（可复现）

在仓库根目录：

```bash
git checkout chore/eslint-cleanup-3.5
npm install
npm run lint
npm run build
```

**预期**: `eslint .` 无输出且 exit code **0**；`tsc -b && vite build` 成功完成。

---

## 8. 与主计划的关系

- 本项对应 **代码审查后续计划 §4**，关闭「ESLint 历史告警」中已实际阻塞 **`npm run lint`** 的路径，便于将 **lint** 作为后续 Phase 4 及 CI 的常规门禁。
- 计划中 **§3 相机边界**、**§5 Genre 色板 backlog** 等仍为独立工作项，不在本报告范围内。

---

## 9. 参考路径速查

| 路径 | 说明 |
| --- | --- |
| `.cursor/plans/code_review_follow-up_9d90ade4.plan.md` | follow-up 计划原文（§4） |
| `docs/reports/Project_Status_and_Code_Review_Report.md` | 项目状态与代码审查报告 |
| `frontend/eslint.config.js` | ESLint 扁平配置（含 `react-refresh` Vite 预设） |
| `frontend/src/components/ui/button.tsx` | 仅导出 `Button` 组件 |
| `frontend/src/components/ui/button-variants.ts` | 导出 `buttonVariants`（`cva`） |
