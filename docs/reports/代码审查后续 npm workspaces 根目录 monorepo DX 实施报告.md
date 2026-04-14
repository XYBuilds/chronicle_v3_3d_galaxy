# 代码审查后续：根目录 npm workspaces 与 monorepo DX — 实施报告

> **关联计划**: `.cursor/plans/code_review_follow-up_9d90ade4.plan.md` — **§2 根目录 `package.json` 与 monorepo DX**  
> **审查依据**: `docs/reports/Project_Status_and_Code_Review_Report.md`（建议采用 npm workspace，避免仅靠 `--prefix` 的「双根」代理）  
> **报告日期**: 2026-04-14  
> **范围**: 仓库根 **`package.json`**、**`package-lock.json`**（新增并作为唯一锁文件）、**`.gitignore`**、**`frontend/README.md`**；删除 **`frontend/package-lock.json`**。  
> **不在范围**: 计划 **§4 ESLint 历史告警**（`npm run lint` 仍可能因既有规则失败，见下文「已知问题」）。

---

## 1. 摘要

在用户要求 **先新开 Git 分支再实施** 的前提下，从当前基线创建分支 **`chore/npm-workspaces-dx`**，将仓库根目录的包管理从 **「根脚本 + `--prefix frontend` 转发」** 升级为 **npm 官方 workspaces 模型**：

- 根 **`package.json`** 声明 **`"workspaces": ["frontend"]"`**，与 npm 文档中的 [workspaces](https://docs.npmjs.com/cli/using-npm/workspaces) 一致，减少工具链（ESLint、TypeScript 路径、IDE）对「究竟哪个是安装根」的歧义。
- 根级脚本改为 **`npm run <script> -w frontend`**，等价于在 **`frontend`** 工作区内执行对应 **`package.json` scripts**。
- **依赖与锁文件**：在仓库根执行 **`npm install`**，生成并纳入版本管理的 **单一 `package-lock.json`**；移除 **`frontend/package-lock.json`**，避免双锁文件与 workspaces 行为不一致。
- **`.gitignore`**：使用通配 **`node_modules/`**，忽略任意深度下的 `node_modules`（含根目录 hoist 后的依赖目录）。
- **`frontend/README.md`**：补充「在仓库根 **`npm install` / `npm run dev`**」的说明，与根代理脚本及 workspaces 流程对齐。

**Git 提交**: **`46a5973`** — `chore: adopt npm workspaces for frontend DX`（工作区与锁文件）；本 Markdown 在同分支以独立 **`docs:`** 提交纳入仓库（见 **`git log -- docs/reports/代码审查后续 npm workspaces 根目录 monorepo DX 实施报告.md`**）。

---

## 2. 背景与目标

### 2.1 背景

- 此前根目录已通过 **`package.json`** 提供 **`npm run dev`** 等命令，实现方式为 **`npm run <script> --prefix frontend`**（见 `docs/reports/Phase 3.4 Three.js 场景与自定义相机控制器 实施报告.md` 等历史记录）。
- 代码审查结论指出：在单仓库场景下虽可用，但更稳妥的做法是使用 **npm workspaces**，让 **`frontend/`** 成为正式 workspace 包，而不是仅靠 CLI 前缀模拟 monorepo。

### 2.2 目标（对照 follow-up 计划 §2）

| 目标 | 结果 |
| --- | --- |
| 根 **`package.json`** 增加 **`workspaces: ["frontend"]`** | 已落实 |
| 在根执行 **`npm install`** 安装依赖 | 已验证 |
| 根脚本改为 workspace 调用（**`-w frontend`** 或等价 **`--workspace`**） | 已使用 **`-w frontend`** |
| 与 **`frontend/README.md`** 说明一致，必要时更新 README | 已增加「仓库根安装 / 开发」小节 |

---

## 3. Git 与分支

| 项 | 内容 |
| --- | --- |
| 工作分支 | **`chore/npm-workspaces-dx`** |
| 工作区变更提交 | **`46a5973`** — `chore: adopt npm workspaces for frontend DX` |

> **合并说明**: 若该分支已合并入 `main`，请以 `git log` 在目标分支上核对 **`46a5973`** 及其 **merge commit**。本报告文件的 **`docs:`** 提交可通过 **`git log --`** 上述路径查询。

---

## 4. 变更清单（按文件）

### 4.1 `package.json`（仓库根）

- 新增 **`"workspaces": ["frontend"]"`**（**`private: true`** 保持不变，符合 workspaces 常见约束）。
- 脚本从 **`npm run <script> --prefix frontend`** 改为 **`npm run <script> -w frontend`**，涉及：`dev`、`build`、`lint`、`preview`、`storybook`、`build-storybook`。

当前根配置如下（便于审阅与 diff 对照）：

```json
{
  "name": "chronicle-v3-3d-galaxy",
  "private": true,
  "workspaces": ["frontend"],
  "scripts": {
    "dev": "npm run dev -w frontend",
    "build": "npm run build -w frontend",
    "lint": "npm run lint -w frontend",
    "preview": "npm run preview -w frontend",
    "storybook": "npm run storybook -w frontend",
    "build-storybook": "npm run build-storybook -w frontend"
  }
}
```

### 4.2 锁文件策略

| 文件 | 操作 | 说明 |
| --- | --- | --- |
| **`package-lock.json`**（根） | **新增并跟踪** | **`lockfileVersion: 3`**，顶层 **`packages[""]`** 含 **`workspaces`**；与 **`frontend`** 包条目一并锁定依赖树 |
| **`frontend/package-lock.json`** | **删除** | workspaces 下应以 **根锁文件** 为唯一事实来源，避免 CI / 协作者误在 **`frontend/`** 单独 **`npm install`** 产生漂移 |

### 4.3 `.gitignore`

- 在「Frontend」小节将仅 **`frontend/node_modules/`** 扩展为全仓库 **`node_modules/`**，覆盖根目录 **`node_modules`**（npm hoist 常见布局）。

### 4.4 `frontend/README.md`

- 在默认 Vite 模板正文之前增加 **「TMDB Galaxy frontend（npm workspace）」** 小节：说明在 **仓库根** 执行 **`npm install`**、**`npm run dev`**，并简要说明仍可在 **`frontend/`** 内执行 **`npm run <script>`**（在已完成根安装的前提下）。

---

## 5. 开发者操作指南

### 5.1 克隆后首次安装

在 **仓库根目录** 执行：

```bash
npm install
```

无需再单独进入 **`frontend/`** 安装依赖（除非个人习惯在子包目录操作；锁文件仍以根为准）。

### 5.2 常用命令（根目录）

| 命令 | 作用 |
| --- | --- |
| **`npm run dev`** | 启动 Vite 开发服务器（**`frontend`** workspace 的 **`dev`**） |
| **`npm run build`** | **`tsc -b && vite build`** 生产构建 |
| **`npm run lint`** | 在 **`frontend`** 上执行 ESLint |
| **`npm run preview`** | 预览生产构建 |
| **`npm run storybook`** / **`npm run build-storybook`** | Storybook 开发与静态导出 |

### 5.3 与历史文档的关系

部分历史实施报告（例如全量管线联调报告）仍写有 **`npm run build --prefix frontend`**。在 workspaces 落地后，**在仓库根** 的推荐写法为 **`npm run build`**（或显式 **`npm run build -w frontend`**）；语义与旧 **`--prefix`** 代理一致，仅安装与锁文件模型更规范。

---

## 6. 验证记录

以下命令均在 **仓库根** **`E:\projects\chronicle_v3_3d_galaxy`** 执行（环境：Windows，npm workspaces）。

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| 安装 | **`npm install`** | 成功；依赖树解析无漏洞告警（当时 **`npm audit`** 报告 **0 vulnerabilities**） |
| 生产构建 | **`npm run build`** | 成功；Vite 产出 **`frontend/dist/`**（chunk 体积告警为 Vite 默认提示，非本任务回归） |
| 静态检查 | **`npm run lint`** | **失败**（既有 **`react-refresh/only-export-components`**，见 §7） |

---

## 7. 已知问题与后续工作

1. **ESLint（计划 §4，非本次范围）**  
   **`npm run lint`** 仍报错，例如 **`frontend/src/components/ui/button.tsx`** 触发的 **`react-refresh/only-export-components`**。需在 **「ESLint 清理」** 任务中拆分导出或收窄规则，与 workspaces 无关。

2. **CI / 部署**  
   若流水线此前在 **`frontend/`** 目录单独 **`npm ci`**，应改为在 **仓库根** 使用 **`npm ci`**（需存在根 **`package-lock.json`**），并令构建命令仍指向 workspace（例如根 **`npm run build`** 或 **`npm run build -w frontend`**）。本仓库当前未发现 **`.github/workflows`**；若后续增加 Vercel 等，**Install Command** 建议为根目录 **`npm ci`**。

3. **历史报告中的 `--prefix` 描述**  
   未批量改写旧报告，以免与历史提交叙事冲突；新流程以 **本报告** 与 **`frontend/README.md`** 为准。

---

## 8. 结论

本次变更完成 **代码审查 follow-up 计划 §2**：根目录正式采用 **npm workspaces（`frontend` 单包）**，统一锁文件与安装根，改善 monorepo 向的 **DX** 与工具链一致性。**生产构建**在根目录 **`npm run build`** 下已通过；**Lint 清零**留待计划 **§4** 专项处理。
