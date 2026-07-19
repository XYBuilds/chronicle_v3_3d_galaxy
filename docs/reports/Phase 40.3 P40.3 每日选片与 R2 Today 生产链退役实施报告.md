# Phase 40.3 / P40.3 每日选片与 R2 Today 生产链退役实施报告

## 交付范围

本 TODO 从主站数据流水线中删除 The Movie Today 的生产、渲染、workflow artifact、R2 上传与 assets manifest 协议。Galaxy/search export、校验、OG Index movie 增量同步和 Pages 发布顺序保持不变；snapshot v2 与 KV `today` 删除属于 40.4，不在本 TODO 提前实现。

## 生产链退役

Nightly 与 monthly 任务在 galaxy export 和校验完成后，不再导入或调用每日选片逻辑。两个 workflow 的发布 artifact 只保留：

- `galaxy_data.json`
- `galaxy_data.json.gz`
- `galaxy_search_index.json.gz`

删除以下专属入口及测试：

- `scripts/cron/pick_movie_today.py`
- `scripts/cron/render_og_today.py`
- `scripts/tests/test_render_og_today.py`

`upload_galaxy_r2.py` 现在只上传 galaxy/search gzip 对象。新生成的 `galaxy_assets_manifest.json` 不包含 `today_url` 或 `r2_object_keys.today`；即使发布目录中存在旧 `today.json`，上传与 manifest 生成也会忽略它。

## 40.3 → 40.4 v1 过渡桥

40.3 停止本地 `today.json` 后，既有 OG Index movie sync 仍使用 snapshot v1。为避免 scheduled sync 在 40.4 迁移前破坏 control 契约，本 TODO 采用最小过渡数据流：

1. 从 committed v1 snapshot 读取并严格校验既有 `today_value`。
2. 仅从当前 `galaxy_data.json` 投影 movie records 与 `meta:G`。
3. 将原 v1 Today control 原样带入当前 v1 candidate，因此正常 incremental 不产生 Today PUT。
4. 显式 bootstrap/full recovery 只允许从严格远端审计结果恢复同一 v1 control。

该桥不读取或写入本地 `today.json`，不新增选片，不删除 KV `today`，也不引入 `schema_version: 2`、`projection_version: og-index-v2` 或 v2 object key。旧 control 缺失、格式非法或引用不在当前 movie 集合中的 id 时保持 fail-closed；一次性删除与 v2 checkpoint 提交由 40.4 完成。

## 非 Today 不变量

- Nightly/monthly 继续执行 galaxy export 与 `validate_galaxy_json.py`。
- Workflow 中独立 OG Index incremental sync 仍先于 R2 upload，scheduled run 不获得 bootstrap/full recovery 权限。
- R2 upload 继续发布 galaxy/search assets，并保留版本化 URL、cache-control、可选 `github_run_id` 和 prune 行为。
- 生产代码无 `pick_movie_today`、`render_og_today` 或旧 `load_galaxy_and_today` 调用方。
- 本 TODO 未运行 monthly UMAP、未触发 workflow、未访问或修改 Cloudflare R2/KV/Pages 生产状态。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| OG/workflow/R2 聚焦 pytest | 74 passed，22 subtests passed |
| `python -m pytest -q scripts/tests` | 123 passed，24 subtests passed |
| 修改脚本 `python -m compileall -q` | 通过 |
| 受影响文件诊断 | 未发现阻塞错误 |
| `git diff --check` | 通过 |

聚焦测试覆盖 workflow 无 Today 接线、遗留 `today.json` 不被上传、manifest 无 Today 字段、incremental 复用 committed v1 control 且不需要本地 Today 文件，以及既有 OG movie diff、配额、读回验证和 snapshot fail-closed 行为。