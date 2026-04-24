# GitHub Pages 上线教程（Phase 7 I6）

本文是本项目的实操版上线手册，目标是把当前仓库部署到 GitHub Pages，并可稳定访问：

- 目标地址：`https://xybuilds.github.io/chronicle_v3_3d_galaxy/`
- 构建入口：`frontend`（Vite）
- 部署方式：GitHub Actions（非 branch 直出）

---

## 1. 上线前提（先对齐）

先确认以下文件已在你的分支中：

- `frontend/vite.config.ts` 中有：
  - `base: '/chronicle_v3_3d_galaxy/'`
- `.github/workflows/deploy-pages.yml` 存在，且包含：
  - `on.push.branches: [main]`
  - `workflow_dispatch`
  - `actions/setup-node@v4`（Node 20）
  - `cd frontend && npm ci && npm run build`
  - `actions/upload-pages-artifact@v3`（`path: frontend/dist`）
  - `actions/deploy-pages@v4`
  - `permissions.pages: write` + `permissions.id-token: write`
- `frontend/public/data/galaxy_data.json.gz` 存在（约 31MB）

本地先做一次构建检查（仓库根目录）：

```powershell
npm run build
```

通过后再进入上线步骤。

---

## 2. 第一次开启 GitHub Pages（一次性设置）

在 GitHub 网页端操作：

1. 打开仓库 `XYBuilds/chronicle_v3_3d_galaxy`
2. 进入 `Settings` → `Pages`
3. 在 `Build and deployment` 中将 `Source` 设为 `GitHub Actions`
4. 保存

说明：这一步只需做一次，后续由 workflow 自动部署。

---

## 3. 触发部署（标准流程）

建议流程：

1. 在功能分支完成改动并通过本地构建
2. 发起 PR 并合并到 `main`
3. 合并后 `push` 到 `main` 会自动触发 `.github/workflows/deploy-pages.yml`

也可手动触发（用于补跑）：

1. GitHub → `Actions`
2. 选择 `Deploy GitHub Pages`
3. 点击 `Run workflow`，选择 `main`

---

## 4. 验证是否部署成功

### 4.1 看 Actions

`Deploy GitHub Pages` 应出现两个 job：

- `build`：安装依赖并构建 `frontend/dist`
- `deploy`：发布 artifact 到 `github-pages` 环境

两个 job 都是绿色即为部署成功。

### 4.2 看 URL

打开：

- `https://xybuilds.github.io/chronicle_v3_3d_galaxy/`

验收点：

- 页面可加载，不是空白/404
- 能成功加载银河数据（`galaxy_data.json.gz`）
- Timeline / Drawer / 三层渲染交互正常

---

## 5. 常见问题排查

### 问题 A：页面 404 或静态资源 404

优先检查：

- `frontend/vite.config.ts` 的 `base` 是否是 `'/chronicle_v3_3d_galaxy/'`
- 仓库名是否仍是 `chronicle_v3_3d_galaxy`
- 是否确实部署的是 `frontend/dist`

---

### 问题 B：页面打开但报 `Failed to fetch`（数据加载失败）

按顺序检查：

1. `frontend/public/data/galaxy_data.json.gz` 是否存在并被打进 `dist/data/`
2. 浏览器 Network 中 `.../data/galaxy_data.json.gz` 请求状态
3. 是否命中已修复场景：HTTP 透明 gzip（见 `frontend/src/data/loadGalaxyGzip.ts`）

补充：控制台的 `message channel closed` 常见于浏览器扩展注入脚本，建议用无痕窗口复测。

---

### 问题 C：Workflow 权限报错（Pages / id-token）

检查 `.github/workflows/deploy-pages.yml` 顶层：

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

---

## 6. 发布节奏建议

建议每次上线都走以下最小闭环：

1. 本地 `npm run build`
2. PR 合并到 `main`
3. 等 Actions 绿灯
4. 打开 Pages URL 做一次肉眼验收

这样可以把“能构建”和“线上可用”两个问题分开，排障更快。

---

## 7. 本项目约束提醒（当前阶段）

- 当前 Phase 7 约束：只做自用验收，不主动公开 URL
- 暂不补对外文案（README / attribution 等）
- 对外收尾内容留到后续独立阶段统一处理

---

## 8. 相关文档

- 实施报告：`docs/reports/Phase 7.2 P7.2 I6 GitHub Pages 与 gzip 数据 实施报告.md`
- 计划文件：`.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md`
