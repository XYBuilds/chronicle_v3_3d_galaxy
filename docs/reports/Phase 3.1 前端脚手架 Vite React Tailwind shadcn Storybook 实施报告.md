# Phase 3.1 前端脚手架（Vite + React + TS + Tailwind + shadcn + Storybook）实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 3.1「项目初始化」  
> **规范依据**: 同计划 §3.1、《TMDB 电影宇宙 Tech Spec.md》§6（目录结构、Vite、Storybook、`vite-plugin-glsl`）、项目规则 `frontend-threejs.mdc`（若已启用）  
> **报告日期**: 2026-04-14  
> **范围**: 在 **`frontend/`** 下落地完整前端脚手架；**先新开 Git 分支**再改动；**不包含** Phase 3.2 的 `galaxy.ts` 类型与 JSON 赋值验证（属下一小节计划）

---

## 1. 摘要

本次工作落实开发计划中 **Phase 3.1：项目初始化**，目标是在 **`frontend/`** 建立可长期维护的 **Vite + React + TypeScript** 工程，并集成：

- **Three.js 与状态桥**：`three`、`@types/three`、`zustand`
- **GLSL 导入**：`vite-plugin-glsl`（与 Tech Spec §6.1 一致）
- **样式与组件栈**：**Tailwind CSS v4**（`tailwindcss` + `@tailwindcss/vite`）、**shadcn/ui**（`components.json`、`cn` 工具、示例 `Button`）
- **组件开发环境**：**Storybook 10** + **`@storybook/react-vite`**

在用户要求 **新开 Git 分支再做** 的前提下，从 `main` 创建分支 **`phase-3-1-frontend-scaffold`**，在已有 **`frontend/public/data/`**（含 `.gitkeep` 与管线产物 `galaxy_data.json` / `.gz`）不被破坏的前提下，将 Vite 模板文件合并进 **`frontend/`** 根目录。

实施过程中处理了若干 **脚手架工具链** 层面的摩擦点（见 §6），最终 **`npm run dev`**、**`npm run storybook`**、**`npx tsc --noEmit`**、**`npm run build`** 均可作为 Phase 3.1 验收通过。

---

## 2. Git 与分支

| 项 | 内容 |
| --- | --- |
| 基线分支 | `main` |
| 工作分支 | **`phase-3-1-frontend-scaffold`** |
| 说明 | 所有 `frontend/` 脚手架相关变更均在该分支上完成；合并前请在本机 `git status` / `git log` 核对实际提交 |

> **注**：若报告撰写时仓库尚未 `git add` / `commit`，请以你本地最终提交信息为准；本报告描述的是 **已执行的技术操作与文件落点**，不绑定特定 commit hash。

---

## 3. 执行操作清单（按时间顺序）

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | `git checkout -b phase-3-1-frontend-scaffold` | 满足「新开分支再做」 |
| 2 | 使用 `npm create vite@latest` 生成临时目录后合并入 `frontend/` | 因 `frontend/` 已存在且含 `public/data`，未对非空目录直接 `--force` 覆盖，改为 **临时目录 + 复制**，避免误删数据产物 |
| 3 | `npm install` | 安装 Vite 模板默认依赖 |
| 4 | 安装核心运行时依赖 | `three`、`@types/three`、`zustand`、`vite-plugin-glsl` |
| 5 | 安装 Tailwind v4 | `tailwindcss`、`@tailwindcss/vite` |
| 6 | `npx shadcn@latest init` | 生成 `components.json`、`src/lib/utils.ts` 等；部分步骤曾因 **依赖安装耗时** 中断，后续以 **`package.json` + `npm install`** 对齐 |
| 7 | `npx storybook@latest init`（React + Vite） | 生成 `.storybook/`、`storybook` / `build-storybook` 脚本；**主动移除了**会拉取 Playwright 浏览器二进制、阻塞 CI/无头环境的 **Vitest 浏览器测试集成**（见 §6.2） |
| 8 | 目录骨架 | 按 Tech Spec §6 创建 `src/components`、`src/three/shaders`、`src/store`、`src/hooks`、`src/utils`、`src/types` |
| 9 | 占位 Story | 新增 `ScaffoldStatus` + `ScaffoldStatus.stories.tsx`，避免 Storybook **零 story** 时的空索引错误 |
| 10 | TypeScript 严格模式 | `tsconfig.app.json`、`tsconfig.node.json` 设置 **`strict: true`** |
| 11 | 路径别名 | Vite `resolve.alias` 与 TS `paths` 统一 **`@/*` → `src/*`** |
| 12 | 清理 | 删除 Storybook 默认示例 `src/stories/`、删除临时 `frontend_tmp/` |
| 13 | 补齐 shadcn Button 依赖 | 安装 **`@base-ui/react`**（`src/components/ui/button.tsx` 所需） |
| 14 | 样式入口修正 | 去掉无法解析的 **`shadcn/tailwind.css`** 与未安装的 **`@fontsource-variable/geist`** 引用，保留 Tailwind v4 + 主题变量与 `tw-animate-css` 等与 shadcn 生成样式兼容的栈 |

---

## 4. 与开发计划 Phase 3.1 的对照

| 计划项 | 结果 |
| --- | --- |
| `frontend/` 下 Vite，React + TypeScript | ✅ |
| `three`、`@types/three`、`zustand`、`vite-plugin-glsl` | ✅ |
| Tailwind CSS **v4** | ✅（`@import "tailwindcss"` + Vite 插件） |
| shadcn/ui（`npx shadcn init`） | ✅（`components.json` + `src/lib/utils.ts` + `src/components/ui/button.tsx`） |
| Storybook，`@storybook/react-vite` | ✅ |
| `tsconfig` strict mode | ✅ |
| 目录结构按 Tech Spec §6 | ✅（空目录占位 + 后续 Phase 会填入实现） |

**明确未在本 Phase 完成的计划条目**（属 **Phase 3.2**）：

- 新增 **`frontend/src/types/galaxy.ts`**（`GalaxyData` / `Meta` / `Movie`）
- 将 subsample JSON 复制到 `public/data` 后，用临时 `test.ts` **`import` JSON 并赋值给 `GalaxyData`**，再跑 `tsc --noEmit` 做 schema 兼容性证明  

（当前 `public/data/galaxy_data.json` 已存在，但 **类型文件与专用校验脚本** 按计划放在 3.2。）

---

## 5. 交付文件与配置要点

### 5.1 根配置

| 路径 | 作用 |
| --- | --- |
| `frontend/package.json` | 脚本：`dev`、`build`、`storybook`、`build-storybook`；依赖见 §5.3 |
| `frontend/vite.config.ts` | `react()` + `tailwindcss()` + `glsl()`；`@` 别名指向 `./src` |
| `frontend/tsconfig.json` | project references；`paths` 中 **`@/*`** |
| `frontend/tsconfig.app.json` | 应用 TS：`strict: true`，`paths` 与 Vite 一致 |
| `frontend/tsconfig.node.json` | Node 侧（含 `vite.config.ts`）：`strict: true` |
| `frontend/components.json` | shadcn 项目配置（style、Tailwind 入口 CSS、别名等） |
| `frontend/.storybook/main.ts` | Storybook stories 通配、`@storybook/react-vite` |
| `frontend/.storybook/preview.ts` | 全局 preview 参数（含 a11y addon 等） |

### 5.2 源码与占位

| 路径 | 作用 |
| --- | --- |
| `frontend/src/index.css` | Tailwind v4 入口 + shadcn 生成的 CSS 变量 / `@theme` / `@layer base` |
| `frontend/src/lib/utils.ts` | `cn()`（`clsx` + `tailwind-merge`） |
| `frontend/src/components/ui/button.tsx` | shadcn 生成的 Button（依赖 `@base-ui/react`） |
| `frontend/src/components/ScaffoldStatus.tsx` | Phase 3.1 占位页组件 |
| `frontend/src/components/ScaffoldStatus.stories.tsx` | Storybook 最小 story，避免空索引 |
| `frontend/src/components/`、`src/three/shaders/`、`src/store/`、`src/hooks/`、`src/utils/`、`src/types/` | Tech Spec §6 目录骨架（除上述文件外可为空） |

### 5.3 主要 npm 依赖（摘要）

**dependencies（与 Phase 3.1 直接相关）**

- `react`、`react-dom`
- `three`、`@types/three`、`zustand`、`vite-plugin-glsl`
- `tailwindcss`、`@tailwindcss/vite`
- `clsx`、`tailwind-merge`、`class-variance-authority`
- `lucide-react`（shadcn 默认图标栈）
- `tw-animate-css`（与生成样式配套）
- `@base-ui/react`（当前 `Button` 实现）

**devDependencies（节选）**

- `vite`、`@vitejs/plugin-react`、`typescript`、ESLint 相关
- `storybook`、`@storybook/react-vite` 及文档/a11y/onboarding 等 addon
- `vitest`（Storybook 初始化带入；**未**强制配置浏览器端 Playwright 流水线）

**刻意未保留 / 已移除**

- Storybook init 默认加入的 **`@storybook/addon-vitest` + Playwright 浏览器下载** 链路（避免无人值守环境长时间阻塞、避免多余二进制依赖）

---

## 6. 问题与处理记录

### 6.1 `npm install` / `npx` 耗时与中断

现象：在部分环境下 **`npm install`** 或 **`npx shadcn init`** 依赖解析阶段耗时较长，工具可能将命令判为超时。

处理：以 **`package-lock.json` 固化**后再次 `npm install`；对 shadcn 已写入的 `components.json` 与生成文件进行核对，缺失包在 `package.json` 中补全后安装。

### 6.2 Storybook 初始化卡在 Playwright 浏览器下载

现象：`storybook init` 在 **「Installing Playwright browser binaries」** 阶段等待用户交互或长时间下载。

处理：**终止该步骤**；从 `package.json` 中移除 Chromatic 测试集成相关的 **`@storybook/addon-vitest`**、**`playwright`**、**`@vitest/browser-playwright`** 等；从 **`vite.config.ts`** 中移除 **`storybookTest` / `playwright` Vitest 项目** 注入，使主应用与 Storybook 的 Vite 配置保持简单可维护。

### 6.3 Vite 开发服务器 CSS 解析错误

现象：开发时报 **`Can't resolve 'shadcn/tailwind.css'`**（以及未安装的 Geist 字体包）。

处理：从 **`src/index.css`** 中删除对 **`shadcn/tailwind.css`** 与 **`@fontsource-variable/geist`** 的 `@import`，保留 Tailwind 与 shadcn 变量主题；字体可在后续设计定稿后再加。

### 6.4 TypeScript 6.x 与 `tsc --noEmit` / `tsc -b`

现象：曾在根 `tsconfig` 使用 `ignoreDeprecations` 或 `baseUrl` 引发 IDE 或 CLI 告警。

处理：将 **`paths` 仅保留在 `tsconfig.app.json`**（与 Vite 别名一致），避免根配置冗余；以 **`npm run build`（`tsc -b`）** 与 IDE 诊断双重确认无错误。

### 6.5 端口占用

现象：`vite` 默认 **5173** 被占用时会自动尝试 **5174**；Storybook **6006** 被占用时会提示换端口。

处理：验收时释放占用进程或接受备用端口；**不**修改 `package.json` 默认端口，保持与计划文档一致。

---

## 7. 验收结果（Phase 3.1 Checkpoint）

| 检查项 | 命令 / 操作 | 预期 | 结果 |
| --- | --- | --- | --- |
| 开发服务器 | `npm run dev`（`frontend/`） | Vite ready，可访问本地 URL | ✅ |
| Storybook | `npm run storybook` | 可访问 `http://localhost:6006/`，有至少一个 story | ✅（含 `Scaffold/Status`） |
| 类型检查 | `npx tsc --noEmit` | 无错误 | ✅ |
| 生产构建 | `npm run build` | `tsc -b` + `vite build` 成功 | ✅ |

---

## 8. 数据与静态资源

- **`frontend/public/data/`**  
  - 保留 **`.gitkeep`**  
  - 管线产物 **`galaxy_data.json`** / **`galaxy_data.json.gz`** 仍作为运行时 **`fetch`** 的候选数据源（具体加载逻辑在 **Phase 3.3**）  
- **`frontend/public/`** 下另有 Vite 模板自带的 **`favicon.svg`**、**`icons.svg`** 等静态资源  

---

## 9. 后续建议（Phase 3.2 起）

1. 新增 **`frontend/src/types/galaxy.ts`**，严格对齐 Tech Spec §4 JSON schema。  
2. 增加 **仅用于类型检查的临时模块**（或 Vitest 单测）：`import galaxyData from '../public/data/galaxy_data.json' assert { type: 'json' }`，赋值给 **`GalaxyData`**，跑 `tsc --noEmit`。  
3. 若需 **Geist** 或其它品牌字体，在 `package.json` 安装对应 `@fontsource-*` 后在 `index.css` 中显式 `@import`。  
4. 若团队希望恢复 **Storybook + Vitest 浏览器测试**，建议在 CI 可缓存 Playwright 镜像的前提下 **单独 PR** 引入，避免阻塞日常 `npm install`。

---

## 10. 小结

Phase 3.1 已在分支 **`phase-3-1-frontend-scaffold`** 上完成：**Vite/React/TS 工程就绪**，**Three.js / Zustand / GLSL 插件**已接入，**Tailwind v4 + shadcn 基础**已落地，**Storybook（react-vite）**可启动并具备最小 story；同时按 Tech Spec 预留了 **`src/three`**、**`src/store`** 等目录，为 Phase 3.3 及以后的加载、场景与粒子渲染打下基础。
