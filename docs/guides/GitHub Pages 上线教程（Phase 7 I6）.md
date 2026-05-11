# GitHub Pages 上线教程（Phase 7 I6）

本文是本项目的实操版上线手册，目标是把当前仓库部署到 GitHub Pages，并可稳定访问：

- 目标地址：`https://xybuilds.github.io/chronicle_v3_3d_galaxy/`
- 构建入口：`frontend`（Vite，npm workspace 子包）
- 部署方式：GitHub Actions（非 branch 直出）

---

## 1. 上线前提（先对齐）

先确认以下已在你的分支中：

- `frontend/vite.config.ts`：`base: '/chronicle_v3_3d_galaxy/'`
- `.github/workflows/deploy-pages.yml` 存在，且与仓库内实现一致（摘要）：
  - `on.push.branches: [main]`、`workflow_dispatch`
  - `actions/checkout@v4`、`actions/setup-node@v4`（Node **20**，**不要**对该 job 配置 `cache: npm`）
  - `npm i -g npm@10.8.3`
  - 删除根 `package-lock.json` 与 `node_modules`、`frontend/node_modules` 后执行 **`npm install --include=optional`**
  - **`npm run build -w frontend`**
  - `actions/upload-pages-artifact@v3`（`path: frontend/dist`）、`actions/deploy-pages@v4`
  - `permissions`：`contents: read`、`pages: write`、`id-token: write`
- `frontend/public/data/galaxy_data.json.gz` 存在并已纳入构建（会复制到 `frontend/dist/data/`）

本地构建（仓库根目录）：

```powershell
npm run build
```

通过后再进入上线步骤。

---

## 2. 为什么 CI 里要「删 lock + 重装」？

本仓库锁文件在**根目录** [`package-lock.json`](../../package-lock.json)（npm workspaces），开发机多为 **Windows**；GitHub Actions 使用 **Linux**。部分依赖（Vite / Rolldown、`lightningcss`、`@tailwindcss/oxide` 等）带有 **平台相关 optional 原生绑定**。

在 Linux 上对**已有** lockfile 仅执行 `npm ci` 时，可能触发 [npm/cli#4828](https://github.com/npm/cli/issues/4828) 一类行为：**optional 包未正确安装**，构建报错 `Cannot find native binding` / 缺 `*.linux-x64-gnu.node`。

**定稿做法**：在 **ubuntu-latest** runner 上删除根 `package-lock.json` 与两处 `node_modules`，执行 `npm install --include=optional`，再 `npm run build -w frontend`。  
**不把** runner 上新产生的 `package-lock.json` 提交回仓库；本地仍以你机器上的根 lockfile 为准。

详细说明见：`docs/reports/Phase 7.2 P7.2 I6 GitHub Pages 与 gzip 数据 实施报告.md` §3。

---

## 3. 第一次开启 GitHub Pages（一次性设置）

在 GitHub 网页端：

1. 打开仓库 `XYBuilds/chronicle_v3_3d_galaxy`（或你的 fork 对应路径）
2. `Settings` → `Pages`
3. `Build and deployment` → **Source** 选 **GitHub Actions**
4. 保存

说明：只需配置一次，之后由 workflow 自动部署。

---

## 4. 触发部署（标准流程）

1. 在功能分支完成改动，本地 `npm run build` 通过  
2. PR 合并到 **`main`**  
3. `push` 到 `main` 会自动触发 `.github/workflows/deploy-pages.yml`

手动补跑：

1. GitHub → `Actions` → `Deploy GitHub Pages`  
2. `Run workflow`，分支选 `main`

---

## 5. 验证是否部署成功

### 5.1 Actions

应看到两个 job 均成功：

- `build`：安装依赖并产出 `frontend/dist`
- `deploy`：发布到 `github-pages` 环境

### 5.2 浏览器

打开：`https://xybuilds.github.io/chronicle_v3_3d_galaxy/`

验收要点：

- 非空白、非 404；静态资源路径带 `/chronicle_v3_3d_galaxy/`
- 能加载 `…/data/galaxy_data.json.gz`（经 [`loadGalaxyGzip.ts`](../../frontend/src/data/loadGalaxyGzip.ts) 处理透明 gzip 与裸 gzip 两种情形）
- Timeline / Drawer / 三层交互正常

---

## 6. 常见问题排查

### 6.1 页面或静态资源 404

- `frontend/vite.config.ts` 的 `base` 是否为 `'/chronicle_v3_3d_galaxy/'`
- 仓库名与 `base` 路径是否一致
- artifact 是否来自 `frontend/dist`

### 6.2 页面能开但数据 `Failed to fetch`

1. `frontend/public/data/galaxy_data.json.gz` 是否在构建时进入 `dist/data/`  
2. 浏览器 Network 里该 URL 的 HTTP 状态  
3. 无痕窗口排除扩展拦截（控制台偶发 `message channel` 类报错多来自扩展）

### 6.3 Workflow：`Cannot find native binding` / 缺 `*.linux-x64-gnu.node`

- 确认 workflow 仍为 **删 lock + `npm install --include=optional`** 的定稿步骤，且 **未**对 `setup-node` 开启会固化坏树的 **`cache: npm`**
- 参考 [npm/cli#4828](https://github.com/npm/cli/issues/4828) 与实施报告 §3

### 6.4 `permissions` 报错

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

---

## 7. 发布节奏建议

1. 本地 `npm run build`  
2. 合并到 `main`  
3. Actions 全绿  
4. 打开 Pages URL 做一次肉眼验收  

---

## 8. 本项目约束提醒（当前阶段）

- Phase 7：线上 URL **仅自用验收**，不主动公开  
- 不补根 README / 对外 attribution（延至收尾阶段）

---

## 9. 相关文档

- 实施报告：`docs/reports/Phase 7.2 P7.2 I6 GitHub Pages 与 gzip 数据 实施报告.md`  
- Workspaces 与根锁文件：`docs/reports/Phase 3.7.2 根目录 npm workspaces 与 monorepo DX 实施报告.md`  
- 计划：`.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md`
