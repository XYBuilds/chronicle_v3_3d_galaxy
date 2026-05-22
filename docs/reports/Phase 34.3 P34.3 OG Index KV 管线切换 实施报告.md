# Phase 34.3 / P34.3 OG Index KV 管线切换 实施报告

## 1. 任务目标

在 Phase 34 Worker 动态 OG 切换中，完成主仓 **KV 元数据索引**写入与 **静态 `og-today.png` 管线一刀切停用**：

- 构建 `og_index` → Cloudflare KV（`meta:G`、`today`、`movie:{id}`）
- nightly 日更 `meta:G` + `today`；monthly 全量刷新 `movie:*`
- 移除 `render_og_today_after_galaxy_export` 调用及 R2 / CI 对 `og-today.png` 的依赖

对应计划：[`.cursor/plans/phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) · TODO `p34-kv-index-pipeline`（34.3）。

运维手册：[`docs/guides/P34.3 OG Index KV 上线操作指南.md`](../guides/P34.3%20OG%20Index%20KV%20上线操作指南.md)。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| KV 键 SSOT | `meta:G`（字符串）、`today`（JSON）、`movie:{id}`（OG 四字段 JSON） |
| 同步范围 | nightly **`daily`**（2 键）；monthly **`full`**（~6 万 `movie:*` + 2 键） |
| API 写入 | Cloudflare REST **bulk PUT**；默认批大小 **1000**（上限 10000） |
| 鉴权 | **`OG_INDEX_KV_API_TOKEN`** 优先；未设则回退 **`CLOUDFLARE_API_TOKEN`**；缺 `CLOUDFLARE_ACCOUNT_ID` / `OG_INDEX_KV_NAMESPACE_ID` 时 **skip exit 0**（不阻断 R2 / Pages） |
| 静态 OG | **停用** nightly/monthly 调用 `render_og_today`；脚本保留供回滚 |
| Worker PNG | **不在本任务**；依赖 34.4 读同一 KV namespace |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `scripts/cron/og_index_kv.py` | 记录构建、`iter_og_index_entries`、分批 bulk PUT |
| `scripts/cron/sync_og_index_kv.py` | CLI + `sync_og_index_after_galaxy_export()` |
| `scripts/tests/test_og_index_kv.py` | 7 个单元测试 |
| `scripts/cron/nightly_vote_refresh.py` | export 后 `scope=daily` KV sync |
| `scripts/cron/monthly_refit.py` | export 后 `scope=full` KV sync |
| `scripts/cron/upload_galaxy_r2.py` | 移除 `og-today.png` 上传与 manifest `og_today_url` |
| `scripts/cron/render_og_today.py` | 标注 Phase 34.3 停用（保留文件） |
| `.github/workflows/{nightly,monthly}.yml` | artifact 去掉 `og-today.png`；nightly/monthly job 注入 KV env |
| `.env.example` | P34.3 KV 变量说明 |
| `docs/guides/P34.3 OG Index KV 上线操作指南.md` | Operator 上线清单 |
| Git | PR **#235** `chore/p34.3-kv-index-pipeline` → `main`；后续 `644f906` 补充 workflow `OG_INDEX_KV_API_TOKEN` |

**未实施（归属后续 TODO）**：Worker `/og/*`（34.4）、HTML meta 注入（34.5）、`index.html` / Vite 弃用 `og-today`（34.6）、`?lang=` 分享（34.6）。

---

## 4. KV 数据约定

| Key | 值 |
| :--- | :--- |
| `meta:G` | `galaxy_data.json` → `meta.version` |
| `today` | `{"date":"YYYY-MM-DD","movie_id":number}` |
| `movie:{id}` | `{"title","release_date","genres","poster_url"}` |

Worker（34.4）`v={G}-{M}` 与 PNG 渲染不在本报告范围；索引仅支撑查片元数据。

---

## 5. 管线变更（相对 34.2 基线）

| 环节 | 34.2（前） | 34.3（后） |
| :--- | :--- | :--- |
| export 后 | `write_today_json` → `render_og_today` | `write_today_json` → **`sync_og_index_kv`** |
| R2 | 上传 `og-today.png`，manifest `og_today_url` | **不再上传** |
| CI artifact | 含 `og-today.png` | **已移除** |
| Pages bundle | 仍可含历史 `og-today.png` 文件；meta 仍指向 `/data/og-today.png` 直至 34.6 | |

---

## 6. 验证

| 项 | 结果 |
| :--- | :--- |
| `python -m unittest tests.test_og_index_kv -v` | 7 passed |
| `python -m unittest discover tests` | 45 passed（含既有用例） |
| `sync_og_index_kv.py` 无 env | `skip` exit 0 |
| 用户验收 | **通过**（2026-05-22） |

**生产侧待 Operator 完成**（见 P34.3 指南）：创建 KV namespace、配置 `OG_INDEX_KV_NAMESPACE_ID` + `OG_INDEX_KV_API_TOKEN`、首次 `--scope full`、确认 nightly 日志 `keys_written=2`。

---

## 7. 风险与后续

| 风险 / 缺口 | 缓解 / 归属 |
| :--- | :--- |
| KV 未配置时 nightly 仅 WARN skip | 34.4 上线前必须完成指南 §5 全量 sync |
| Worker 未部署时社交预览仍用静态 meta | **34.4** PNG + **34.5** HTML 注入 |
| `movie:*` 仅 monthly 全量；日更片元变更延迟 | 可接受；TMDB 字段变更频率低；紧急可手动 `full` |
| bulk 限流 / 超时 | 分批 1000；失败重跑 `--scope full` |
| 平台缓存旧 `og-today` URL | **34.6** + **34.8** 抽样 |

**建议下一任务**：**34.4** 独立 Worker repo（JS 画布 `/og/movie|today|brand.png`），绑定同一 `OG_INDEX` KV。
