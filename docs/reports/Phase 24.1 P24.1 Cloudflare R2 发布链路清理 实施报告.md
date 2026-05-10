# Phase 24.1 / P24.1 Cloudflare Pages / R2 发布链路清理 实施报告

## 1. 报告范围

本报告汇总 **P24.1**（Phase 24 子项）的**最终决策**与**仓库内已落地的最终操作**，对应计划：[`.cursor/plans/phase_24_launch_content_cleanup.plan.md`](../../.cursor/plans/phase_24_launch_content_cleanup.plan.md) 中「P24.1 Cloudflare / R2 发布链路清理」。

**不在本报告范围**：P24.2（README / Info 英文定稿）、P24.3（SSOT 文档同步）；Cloudflare / GitHub **控制台**上的手动配置（仅列为待办与验收）。  
**不变更**：UMAP、embedding、genre/lang 权重、主交互与视觉参数（与 Phase 24 总目标一致）。

**参考提交（实现 P24.1 的 merge commit）**：`5131294`（分支 `phase/p24-1-r2-pages-cleanup`）。

---

## 2. 背景与问题陈述（冻结）

合并到默认分支后，若触发 **Cloudflare Pages 与仓库直连的 Git 自动构建**，构建在 **「Validating asset output directory」** 阶段可能报错：仓库内的 `frontend/public/data/galaxy_data.json.gz` 体积超过 **Cloudflare Pages 单文件 25 MiB 硬上限**（日志示例约 31.2 MiB）。

根因归类为 **发布链路 / 仓库资产边界**：该路径未执行本仓库约定的 **`npm run build` + R2 上传 + prune + wrangler Direct Upload** 流程，而是直接校验仓库静态树导致失败。  
**对策**：大 gzip **不得作为 Git 跟踪的 Pages 静态资产**；生产固定 **GitHub Actions** 构建并 **`pages deploy dist`**，大数据走 **R2**，由小体积 **`galaxy_assets_manifest.json`** 指向公网 URL。

---

## 3. 最终决策（冻结版）

### 3.1 资产与 Git 边界

1. **`frontend/public/data/galaxy_data.json.gz`、`galaxy_search_index.json.gz` 不得纳入 Git 版本控制。**  
   本地管线或 CI 仍可生成它们；仅作为未跟踪/忽略文件存在，不进入 clone 的默认树。

2. **`frontend/public/data/galaxy_assets_manifest.json` 作为小文件保留在仓库中（可跟踪）**，用于：
   - **GitHub Pages**（`.github/workflows/deploy-pages.yml`）等「仅 `npm run build`、无先行 R2 步骤」的构建，仍能解析 **R2** 上的 gzip URL；
   - 干净 clone 后的开发/验证场景下的 **bootstrap**（运行时优先级仍以 [`frontend/src/lib/galaxyAssetUrls.ts`](../../frontend/src/lib/galaxyAssetUrls.ts) 为准）。

3. **仓库内 manifest 快照来源**：实施时与线上主域当时返回的 `GET /data/galaxy_assets_manifest.json` 对齐（含 `galaxy_data_gzip_url`、`galaxy_search_index_gzip_url`、`data_version`、`today_url` 等）。  
   **nightly / monthly** 成功执行 [`scripts/cron/upload_galaxy_r2.py`](../../scripts/cron/upload_galaxy_r2.py) 后仍会**覆盖** `frontend/public/data/galaxy_assets_manifest.json`；若需减少「提交快照与线上版本号」的漂移，可在后续运维或 P24.3 文档中约定同步节奏。

### 3.2 生产发布入口（与 P18.6b 一致，本项重申）

1. **生产发布主入口**：GitHub Actions 中的 **`cloudflare/wrangler-action@v3`**，`workingDirectory: frontend`，命令 **`pages deploy dist`**（见 [`nightly_vote_refresh.yml`](../../.github/workflows/nightly_vote_refresh.yml)、[`monthly_refit.yml`](../../.github/workflows/monthly_refit.yml)）。

2. **大数据**：`galaxy_data.json.gz`、`galaxy_search_index.json.gz`（及 cron 侧车）由 **R2** 托管；CI 在 **`upload_galaxy_r2.py`** 成功且 **`R2_GALAXY_PRUNE_AFTER_UPLOAD=1`** 时可从 `frontend/public/data/` **prune** 大文件，再执行 **`npm run build`**，避免 **dist** 混入超大静态文件。

3. **Cloudflare Pages「连接 Git 仓库自动构建」**：**不得作为生产发布入口**（应在控制台 **禁用或断开**，见 §5）。否则 merge 仍可能触发与 CI 不一致的校验路径。

### 3.3 构建产物守卫（dist 单文件 25 MiB）

1. 在 **`npm run build`**（`frontend/package.json`）末尾运行 **`node scripts/check-dist-max-file-size.mjs`**，递归扫描 **`frontend/dist`**，任一文件大于 **25 × 1024 × 1024** 字节则视为超标。

2. **策略**：
   - **`CI=true`**、**`GITHUB_ACTIONS=true`** 或 **`DIST_MAX_BYTES_ENFORCE=1`**：**失败退出**（阻断误发布）。
   - **本地**：若开发者仍在 `public/data` 放置未跟踪的大 JSON/gzip（Vite 会拷入 dist），脚本 **打印警告但默认退出 0**，避免阻塞日常管线调试；需要本地强校验时可设 **`DIST_MAX_BYTES_ENFORCE=1`**。

3. **设计动机**：GitHub Actions 在 **R2 prune 之后**的构建路径下 **dist 不含**超大 galaxy 文件；本地仓库若存在遗留大文件，警告提醒「勿将其当作可发布产物」。

---

## 4. 仓库内最终操作清单（已实现）

| 操作 | 说明 |
|------|------|
| Git 停止跟踪大 gzip | `git rm --cached`：`galaxy_data.json.gz`、`galaxy_search_index.json.gz` |
| 根目录 [`.gitignore`](../../.gitignore) | `frontend/public/data/*.json` + **`!frontend/public/data/galaxy_assets_manifest.json`**；`frontend/public/data/*.json.gz`；删除原先「强制跟踪两个 gzip」的否定规则 |
| [`frontend/.gitignore`](../../frontend/.gitignore) | 与根目录策略对齐（`public/data` 相对路径），避免前端子目录规则覆盖根目录例外 |
| 新增 [`frontend/public/data/galaxy_assets_manifest.json`](../../frontend/public/data/galaxy_assets_manifest.json) | 提交小 manifest，指向当前 R2 公网 URL（实施时与线上一致） |
| 新增 [`frontend/scripts/check-dist-max-file-size.mjs`](../../frontend/scripts/check-dist-max-file-size.mjs) | dist 体积守卫，逻辑见 §3.3 |
| 修改 [`frontend/package.json`](../../frontend/package.json) | `"build": "tsc -b && vite build && node scripts/check-dist-max-file-size.mjs"` |

未改动的既有约定（仍有效）：**nightly / monthly** 中的 R2 上传、prune、再构建、再 **`pages deploy`** 顺序；[`upload_galaxy_r2.py`](../../scripts/cron/upload_galaxy_r2.py) 写入 manifest 的行为。

---

## 5. 仓库外操作（待运维执行）

以下项 **无法仅靠 Git 完成**，需具备 Cloudflare 权限者在控制台操作：

1. **Cloudflare Pages**：对绑定的生产项目 **禁用或断开（Disconnect）与 Git 仓库的自动生产部署**，避免默认分支 push/merge 触发 **非 GHA** 的构建与静态目录校验。  
2. 保留或核对 **Direct Upload / API Token** 与 **R2 CORS**（含自定义域与 `pages.dev` 备线）是否与 [`docs/guides/P23.6 自定义域名上线后运维清单.md`](../guides/P23.6%20自定义域名上线后运维清单.md)、[`docs/guides/P18.6b Cloudflare R2 上线操作手册.md`](../guides/P18.6b%20Cloudflare%20R2%20上线操作手册.md) 一致。

建议在 **P24.3 SSOT 文档同步** 时把上述控制台状态写入运维清单或 README 部署拓扑章节。

---

## 6. 验收建议（P24.1 对应条）

| 验收项 | 建议操作 |
|--------|----------|
| 合并后不再出现「Git 路径」下的 25 MiB 静态校验失败 | 控制台关闭 Pages Git 自动构建后，merge **不应再触发**该类构建；若仍有，检查是否多项目/多环境重复连接仓库 |
| GHA 发布后 Pages app shell 更新 | `workflow_dispatch` 或定时 **nightly / monthly** 跑通；Cloudflare 仪表盘可见新部署 |
| 线上从 R2 加载 galaxy gzip | 浏览器 **Network**：`galaxy_data.json.gz` 请求 host 为 R2 公开域；**Console** 无 CORS 报错 |
| **clean checkout** 下 `frontend/dist` 无单文件 >25 MiB | CI job 中 **`npm run build`** 在 prune 后应通过 dist 守卫；**deploy-pages** 仅含小 manifest 时不应超标 |

---

## 7. 遗留与后续

1. **manifest 版本号**：仓库内快照的 `data_version` / `?v=` 会随 nightly 被线上覆盖；属于预期，必要时在发布流程或 P24.3 中固化「何时回写仓库 manifest」的运维约定。  
2. **P24.3**：将「生产主链路 = GHA Direct Upload + R2」「Pages Git 构建不作为入口」写入 Data Pipeline、README、运维清单等 SSOT。  
3. **本地 dist 警告**：若希望本地 **默认** 也与 CI 一样强失败，可在文档中约定始终设置 **`DIST_MAX_BYTES_ENFORCE=1`** 或将守卫改为仅 CI 警告（当前实现已是 CI 严格、本地警告）。

---

## 8. 相关索引

- 计划：[`.cursor/plans/phase_24_launch_content_cleanup.plan.md`](../../.cursor/plans/phase_24_launch_content_cleanup.plan.md)  
- 前置报告：[Phase 18.6 P18.6b Cloudflare Pages 与 R2 实施报告.md](./Phase%2018.6%20P18.6b%20Cloudflare%20Pages%20与%20R2%20实施报告.md)  
- 前端解析：[`frontend/src/lib/galaxyAssetUrls.ts`](../../frontend/src/lib/galaxyAssetUrls.ts)  
- R2 上传：[`scripts/cron/upload_galaxy_r2.py`](../../scripts/cron/upload_galaxy_r2.py)
