# Phase 7.2 · P7.2 I6 GitHub Pages 与 gzip 主数据 — 实施报告

> 对应 [Phase 7 plan（I2 + I5 + I6）](../../.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md) 中的 **P7.2（I6：GitHub Pages 上线 + 方案 B 压缩版直传）**：Vite 部署基路径、仅向 Git 提交主 gzip、浏览器端流式解压与加载体验、GitHub Actions 部署工作流；本阶段仍**不新增根 README**、**不写对外 attribution**，线上 URL **仅自用验收、不主动公开**（与 plan 及 TMDB 合规路径 2 一致）。

## 1. 做了什么事

| 项目 | 说明 |
|------|------|
| **Git 分支** | 在 `phase7/p7-2-gh-pages-gzip` 上实现并提交（示例提交：`2bfae4c`，消息含 `feat(i6): GitHub Pages base, gzip-only galaxy data, deploy workflow`）。合并到默认分支后 workflow 才会随 `push` 触发。 |
| **Vite `base`** | [`frontend/vite.config.ts`](../../frontend/vite.config.ts) 设置 `base: '/chronicle_v3_3d_galaxy/'`，与 GitHub 仓库名对齐，保证生产与 GH Pages 子路径下 JS/CSS 引用正确。 |
| **运行时数据路径** | 默认加载 URL 由 `import.meta.env.BASE_URL` 与相对路径拼接为 **`…/data/galaxy_data.json.gz`**（见 [`frontend/src/utils/loadGalaxyData.ts`](../../frontend/src/utils/loadGalaxyData.ts) 中 `GALAXY_DATA_DEFAULT_URL` / `galaxyDataDefaultUrl()`）。 |
| **方案 B 解压** | 新增 [`frontend/src/data/loadGalaxyGzip.ts`](../../frontend/src/data/loadGalaxyGzip.ts)：`fetch` → 可选 `Content-Length` 计量下载字节 → `DecompressionStream('gzip')` → `JSON.parse`；无 `DecompressionStream` 时抛出明确错误（Safari 16.4+ / Chrome 80+ / Firefox 113+）。TS 对 `pipeThrough(DecompressionStream)` 使用窄化断言以满足 `tsc`。 |
| **校验与类型** | [`loadGalaxyData.ts`](../../frontend/src/utils/loadGalaxyData.ts) 仍对根对象执行原有 `parseAndValidate`；[`galaxyPublicJson.typecheck.ts`](../../frontend/src/types/galaxyPublicJson.typecheck.ts) 改为依赖 [`galaxyMinimalFixture.ts`](../../frontend/src/types/galaxyMinimalFixture.ts)，避免编译期 `import` 多 MB 的 `public/*.json`。 |
| **Store / UI** | [`galaxyDataStore.ts`](../../frontend/src/store/galaxyDataStore.ts) 增加 `loadProgress`，在 `loadGalaxyData` 的 `onProgress` 中更新；[`Loading.tsx`](../../frontend/src/components/Loading.tsx) 展示「下载 / 解压 / 解析」三阶段标签、下载阶段条形进度与文案；[`App.tsx`](../../frontend/src/App.tsx) 错误态增加**重试**按钮，并说明本地管线生成 `.json`（被 ignore）与导出 `.gz` 的关系。 |
| **仓库内数据资产** | **仅保留** [`frontend/public/data/galaxy_data.json.gz`](../../frontend/public/data/galaxy_data.json.gz) 跟踪；从 Git 移除：`galaxy_data.json`、`galaxy_data.densmap384.json(.gz)`、`galaxy_data_gpu768_n100.json(.gz)`。 |
| **`.gitignore`** | 根目录与 [`frontend/.gitignore`](../../frontend/.gitignore)：`public/data` 下忽略 `*.json` 与 `*.json.gz`，**白名单** `!frontend/public/data/galaxy_data.json.gz`（及 frontend 目录内等价规则），便于本地保留未压缩 JSON 做校验而不误提交。 |
| **GitHub Actions** | 新增 [`.github/workflows/deploy-pages.yml`](../../.github/workflows/deploy-pages.yml)：`actions/checkout@v4` → `actions/setup-node@v4`（Node **20**，`npm` cache 指向 `frontend/package-lock.json`）→ `cd frontend && npm ci && npm run build` → `actions/upload-pages-artifact@v3`（`path: frontend/dist`）→ `deploy` job 使用 `actions/deploy-pages@v4`；触发条件为 **`push` 到 `main`** 与 **`workflow_dispatch`**；顶层 `permissions`：`contents: read`、`pages: write`、`id-token: write`。 |
| **Storybook** | [`frontend/.storybook/main.ts`](../../frontend/.storybook/main.ts) 通过 `viteFinal` + `mergeConfig` 将 **`base` 覆写为 `'/'`**，避免 Storybook 继承应用子路径导致资源 404。 |
| **管线 gzip** | Python 侧 [`scripts/export/export_galaxy_json.py`](../../scripts/export/export_galaxy_json.py) 已支持默认写出 `.json.gz`（`compresslevel=9`），本次**未改**导出脚本；本地开发可在 `frontend/public/data/` 生成被 ignore 的 `galaxy_data.json` 后由同一脚本或手工生成与线上同内容的 `.gz`。 |

## 2. 构建与静态检查

| 检查 | 结果（实施时） |
|------|----------------|
| `cd frontend && npm run build`（`tsc -b` + `vite build`） | 通过 |
| `cd frontend && npm run lint` | 通过 |

## 3. 仍需你（维护者）在 GitHub 上完成的一次性步骤

以下属于 plan 中 **④** 的仓库设置，agent 无法在远端代点：

1. **Settings → Pages**：**Source** 选 **GitHub Actions**（非 Branch 直出 `dist`）。  
2. 将本分支 **merge 到 `main`** 并推送，或手动 **Run workflow**，观察 **Actions** 中 Pages 部署是否成功。  
3. 自用验收 URL（与 plan 一致，**请勿在未补齐 attribution 的收尾阶段前对外传播**）：`https://xybuilds.github.io/chronicle_v3_3d_galaxy/`。

## 4. 本地开发注意

应用带 `base` 时，开发服务器入口应为 **`http://127.0.0.1:<port>/chronicle_v3_3d_galaxy/`**（端口以 [`frontend/vite.config.ts`](../../frontend/vite.config.ts) 中 `server.port` 为准，当前为 **4173**），否则根路径可能无法正确加载入口与数据。全量冒烟可用 `npm run preview` 在同一子路径下验证。

## 5. 未纳入本次的范围（按 plan 边界）

- **P7.4 / P7.5**：INFO 按键 UI、Phase 7 收尾汇总。  
- **对外文案**：根 README、TMDB attribution、INFO 正文等仍延至后续「对外收尾」阶段。  
- **历史大文件 Git 瘦身**：若需从**整个 Git 历史**中剔除曾跟踪的 90MB 级 JSON，需单独评估 `git filter-repo` 等改写历史方案（plan 风险表已提及），本次仅做**当前树**上的移除与 ignore。

## 6. 验收对照（计划 P7.2 技术条目）

- [x] ① Vite `base: '/chronicle_v3_3d_galaxy/'`，构建通过。  
- [x] ② 仓库仅保留主 `galaxy_data.json.gz`；ignore 规则覆盖未压缩与多余 gzip；前端 `fetch + DecompressionStream` + 进度 UI + 错误重试与浏览器不支持提示。  
- [x] ③ `deploy-pages.yml` 与计划中的 Action 链、触发器、权限一致（Node 20）。  
- [ ] ④ GitHub Pages **Source = Actions** + 首次线上加载与交互 — **依赖你在远端完成配置与推送后的实机验收**。  
- [x] ⑤ 未新增根 README、未写对外 attribution 文案。

## 7. 相关链接

- Plan：[`.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md`](../../.cursor/plans/phase_7_i2_i5_i6_05eeb9b1.plan.md)  
- 后续依赖 P7.2 的条目：**P7.4**（INFO 按键，依赖线上可访问）、**P7.5**（阶段收尾）。
