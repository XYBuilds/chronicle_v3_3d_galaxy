# Phase 18.6 / P18.6b Cloudflare Pages 与 R2 实施报告

## 1. 报告范围

本报告汇总本次 P18.6（Cloudflare Pages 切换）与 P18.6b（R2 托管大文件）的**最终决策**与**最终操作**，作为后续运维与 Phase 18 收口的单一依据。

覆盖内容：

- 代码与工作流改造（仓库内）
- Cloudflare / GitHub 控制台操作（仓库外）
- 上线验收结果与遗留事项

---

## 2. 最终决策（冻结版）

### 2.1 发布链路决策

1. **生产发布主链路固定为 GitHub Actions Direct Upload 到 Cloudflare Pages**。  
   Pages 侧不再依赖 Cloudflare 自身 Git 构建作为主入口。

2. **Cloudflare Git 自动构建关闭/断开（Disconnect）**，避免与 CI 构建策略冲突。

3. `nightly_vote_refresh.yml` 与 `monthly_refit.yml` 继续保留 `Deploy to Cloudflare Pages` 步骤作为生产发布唯一入口。

### 2.2 大文件托管决策（P18.6b）

1. `galaxy_data.json.gz`、`galaxy_search_index.json.gz` 从 Pages 包内迁出，统一放 **Cloudflare R2**。
2. CI 导出后上传 R2，并生成 `galaxy_assets_manifest.json` 供前端运行时解析。
3. 上传成功后执行 prune，移除 `frontend/public/data` 下大文件，避免 Pages 单文件 25MiB 限制。

### 2.3 前端数据 URL 解析决策

最终优先级固定为：

1. `VITE_GALAXY_DATA_GZIP_URL` / `VITE_GALAXY_SEARCH_INDEX_GZIP_URL`
2. `?dataset=` 实验参数
3. `data/galaxy_assets_manifest.json`
4. 默认同源 gzip 路径

### 2.4 兼容与风险决策

1. `wrangler pages publish is deprecated`：记录为后续优化项，**不阻塞当前上线**。  
2. `Node.js 20 actions are deprecated`：记录为后续升级项，**不阻塞当前上线**，但需在下一版本处理。

---

## 3. 已完成操作（仓库内）

### 3.1 新增与修改文件

- 新增 `scripts/cron/upload_galaxy_r2.py`
  - 上传 R2（S3 兼容 API，boto3）
  - 生成 `frontend/public/data/galaxy_assets_manifest.json`
  - 支持 `R2_GALAXY_PRUNE_AFTER_UPLOAD=1` 后清理大文件
  - 增加 gzip size assert 与关键日志

- 修改 `.github/workflows/nightly_vote_refresh.yml`
  - 新增 `Upload galaxy gzip to R2 (P18.6b)` 步骤（在 build 前）

- 修改 `.github/workflows/monthly_refit.yml`
  - 新增 `Upload galaxy gzip to R2 (P18.6b)` 步骤（在 build 前）

- 新增 `frontend/src/lib/galaxyAssetUrls.ts`
  - manifest 拉取与解析
  - 数据 URL / 搜索索引 URL 运行时解析

- 新增 `frontend/src/lib/galaxyAssetUrls.test.ts`
  - manifest 解析单测

- 修改 `frontend/src/store/galaxyDataStore.ts`
  - 加载前先解析最终数据 URL

- 修改 `frontend/src/store/searchIndexStore.ts`
  - 加载前先解析最终索引 URL

- 修改 `frontend/src/utils/loadGalaxyData.ts`
  - 增加 `experimentDatasetGalaxyUrl()`，避免实验数据被 manifest 覆盖

- 修改 `frontend/src/vite-env.d.ts`
  - 声明 `VITE_GALAXY_DATA_GZIP_URL` / `VITE_GALAXY_SEARCH_INDEX_GZIP_URL`

- 修改 `requirements.cpu.txt`
  - 增加 `boto3>=1.34,<2`

- 修改 `frontend/vite.config.ts`
  - `base` 从固定子路径改为 `process.env.VITE_BASE_PATH ?? '/'`，适配 Pages 根路径部署

- 修改 `.env.example`
  - 增加 5 个 `R2_*` 变量模板

- 修改计划状态
  - `.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md` 中 `p186b-r2-galaxy-assets` 标记为 `completed`

### 3.2 校验与测试

已执行并通过：

- `python -m py_compile scripts/cron/upload_galaxy_r2.py`
- `npm run test -w frontend`
- `npm run build -w frontend`

---

## 4. 已完成操作（控制台 / Secrets）

### 4.1 Cloudflare R2

- 创建 R2 bucket
- 启用公网访问（`r2.dev`）
- 配置 CORS（至少 `https://the-movie-cosmos.pages.dev`，并可选本地 `http://127.0.0.1:4173`）

### 4.2 GitHub Actions Secrets（R2）

以下 5 项已配置：

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`

### 4.3 GitHub Actions Secrets（Pages）

以下 3 项用于 Pages 部署：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT_NAME`

过程中完成了鉴权与项目类型排障（403、Project not found），最终使用正确 Pages 项目与账号完成发布。

---

## 5. 上线过程关键问题与最终处理

### 5.1 Pages 25MiB 限制

- 现象：`galaxy_data.json.gz` 约 31MB，Cloudflare Git 构建路径被拒。
- 处理：改为 P18.6b 方案（R2 上传 + prune + manifest）。
- 结果：发布链路恢复。

### 5.2 Pages 鉴权/项目定位错误

- 现象：`403 Authentication error`、`Project not found (8000007)`。
- 处理：核对 `CLOUDFLARE_*` 三项、Token 权限与账号一致性、确认目标是 Pages 项目而非 Worker 项目。
- 结果：部署通过。

### 5.3 前端静态资源 MIME 报错

- 现象：`/chronicle_v3_3d_galaxy/assets/...` 返回 HTML 导致 MIME 报错。
- 处理：将 Vite `base` 改为默认 `/`（可环境变量覆盖）。
- 结果：`https://the-movie-cosmos.pages.dev/` 正常加载。

### 5.4 artifact “No files were found” 告警

- 原因：R2 上传后 prune 删除了本地大文件，artifact 仍尝试上传旧路径。
- 结论：当前为可接受 warning，不影响发布正确性。

---

## 6. 验收结论

本次 P18.6 / P18.6b 验收结论：**通过**。

验收要点：

1. 站点可正常访问：`https://the-movie-cosmos.pages.dev/`
2. R2 上传日志完整：`upload key`、`manifest`、`prune` 均出现
3. Pages 部署成功：`Deployment complete`
4. 前端资源加载恢复正常（无 MIME 错误）

---

## 7. 下一版本待办（非阻塞）

1. 处理 deprecation：
   - `wrangler pages publish` → 迁移到 `wrangler pages deploy` 路径
   - GitHub Actions Node 20 → Node 24 兼容升级
2. 优化 artifact 上传路径，改为保留 `galaxy_assets_manifest.json` 便于复盘。

---

## 8. 证据来源（会话记录）

- [P18.6b 代码与交付](c3af59d5-eb8e-44db-88cf-764ac151bb28)
- [P18.6 Pages 切换排障](0ae46ba5-2185-4f23-9568-382c53e3f73b)
- [P18.6b 上线与验收](c87f2eea-a0eb-4ff0-bfee-63ab3cb487e5)

