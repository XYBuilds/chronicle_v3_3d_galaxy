# Phase 40 P40 The Movie Today 退役实施报告

## 1. 最终结论

Phase 40 已完成，40.8 生产 Gate A–F 全部通过。

The Movie Today 已从主站产品、前端状态机、nightly/monthly 发布链、OG Worker、Cloudflare KV/R2 和旧 URL 协议中退役。当前生产契约为：

- `/` 在 galaxy 数据与搜索索引就绪后进入无选中的 galaxy idle；
- `/movie/:id` 继续承担电影 focus、Drawer、分享与 Daily Stargazing CTA 深链；
- `/today` 与 `/og/today.png` 的 GET/HEAD/query 变体返回真实 404，不重定向、不回退 SPA 或品牌图；
- 品牌 OG、电影动态 OG、电影详情页保持可用；
- nightly/monthly 只生产 galaxy/search assets，并以 snapshot v2 同步 `movie:*` 与 `meta:G`；
- KV `today`、R2 `galaxy/today.json`、R2 `ops/og-index/state-v1.json.gz` 已清理，且 production nightly 未重新生成或回写。

40.8 最终 production nightly 采用经人工批准的受约束 `workflow_dispatch` 验收。它证明了与 schedule 相同的端到端生产链；cron 能否按时自然唤起不由该 run 证明，而由 workflow 静态配置单独验收。

## 2. 交付与生产基线

### 2.1 Phase 40 合并记录

| TODO | PR / Commit | 结果 |
| --- | --- | --- |
| 40.1 契约基线 | 主站 PR #276 / `959307a0ecfa888d01eec78ccb3d6d5de650f8ab` | merged |
| 40.2 Home idle 与 Cover/WebGL 退役 | 主站 PR #277 / `dea3618e1016a671d3985e5466a221cb7669d4f6` | merged |
| 40.3 Today 生产链退役 | 主站 PR #278 / `a6a5866c25d106c5cbc9153908870881baba4125` | merged |
| 40.4 snapshot v2 与 KV 删除协议 | 主站 PR #279 / `cc282693a36eba3711adb4429cd5a39c8f61f507` | merged |
| 40.5 OG Worker | Worker PR #5 / `2e026dceba840d3778fa79e64eab3e1b75ad12c8` | merged |
| 40.5 主站对齐 | 主站 PR #280 / `0da71468dfe93a57a80fd9379a9b3139fc309846` | merged |
| 40.6 测试与文档 | 主站 PR #281 / `ec98ec8eed24b0b9947a42a5dc0e05c60da420d9` | merged |
| 40.7 本地集成 | 主站 PR #282 / `b7977ed3b874b1d54027c1f5de90429fcf5be9d3` | merged |
| 40.8 KV `null` 修复与验收口径 | 主站 PR #283 / merge `4328499cd47081370012e86a0b2106517c45c262` | merged |

PR #283 的源提交为 `606b13d190bed307ca45c60af965d2cdd37d96b2`。修复后，Cloudflare KV bulk/get 对请求 key 返回 JSON `null` 时按缺失值保留；未知 key（包括值为 `null`）与非法非字符串值仍 fail-closed。聚焦测试 36 项通过。

PR #283 的唯一 `Cloudflare Pages` check 为 advisory failure；仓库当时无 ruleset、`main` 未设置保护，该 PR 仍为 mergeable，并已以 merge commit 合并。此 check 不等于 40.8 production nightly，后者在合并后从准确 `main` SHA 独立执行并成功。

### 2.2 OG Worker 生产版本

- source commit：`2e026dceba840d3778fa79e64eab3e1b75ad12c8`
- active version：`365f299d-a3a7-4f8f-b556-ab4f2c20c711`
- deployment：`b1e88319-f914-48d0-bf57-3e74b4b903d6`
- rollback version：`ca12ae4b-a46a-4e7a-a6bc-1b0e07128efe`

## 3. Gate A–F 验收

### 3.1 Gate A：生产遗留基线 — PASS

只读基线确认退役前生产仍存在完整旧协议：

- `/today` 返回 200；
- `/og/today.png` 执行 legacy redirect；
- production manifest 含 `today_url`；
- KV `today` 与 `meta:G` 存在；
- R2 `galaxy/today.json`、`ops/og-index/state-v1.json.gz` 与两个保护对象存在；
- `ops/og-index/state-v2.json.gz` 尚不存在。

Gate A 没有执行 mutation。

### 3.2 Gate B：OG Worker 与退役路由 — PASS

部署 OG Worker 后，自动 Today prefix purge 因 token 权限不足返回 401。执行立即停止，没有扩大 purge；随后由人工完成两个 Today prefix 的缓存清理。

最终路由结果：

- `/today`、`/today?*`、`/og/today.png`、`/og/today.png?*` 的 GET/HEAD 均为真实 404；
- 响应无 `Location`，未回退 SPA、品牌 PNG 或电影 PNG；
- 品牌 OG、代表性电影动态 OG 与 `/movie/550` 正常。

### 3.3 Gate C：主站发布与 corrective deployment — PASS

第一次生产 Pages deployment：

- UUID：`0b5886cf-7ba7-448d-b16d-9cf526505448`
- URL：`https://0b5886cf.the-movie-cosmos.pages.dev/`

该 deployment 误用了 committed 旧 manifest，导致生产数据从 `2026.07.18.daily.113` 回退至 `2026.05.10.daily.30`。发现后立即撤回 PASS，并停止进入 Gate D。

经人工授权执行 corrective publish：保持 Phase 40 前端代码不变，只把 ignored dist manifest 替换为 nightly run `29659979691` 的 `2026.07.18.daily.113`，同时移除 `today_url` 与 `r2_object_keys.today`。

Corrective deployment：

- UUID：`45699113-5bb1-4d10-8640-7d36656244a5`
- URL：`https://45699113.the-movie-cosmos.pages.dev/`
- created：`2026-07-19T15:21:03.355778Z`
- source commit：`b7977ed3b874b1d54027c1f5de90429fcf5be9d3`

修复后，主域、deployment URL、manifest、Today 404、首页、电影详情和 OG smoke 全部通过。

### 3.4 Gate D：v1 → v2 迁移与 KV 清理 — PASS

首次 dry-run 使用过期本地数据时显示会误删 2,190 个 `movie:*` key，因此没有执行。随后从 production manifest/R2 获取并校验正确输入：

- source version：`2026.07.18.daily.113`
- 唯一正整数电影 ID：61,531
- galaxy gzip size：38,240,418 bytes

第一次真实 migration 已删除 KV `today`，但删除后的 Cloudflare read-back 为 `{"today": null}`。旧解析器把该响应误判为非法值，migration 按 fail-closed 停止：`meta:G` 未写、v2 checkpoint 未提交、v1 checkpoint 与 R2 Today 对象仍保留。

经单独人工授权恢复后，migration 于 `2026-07-19T15:49:01Z` 成功提交 v2 checkpoint：

- `schema_version: 2`
- source：`2026.07.18.daily.113`
- KV `today` 缺失；
- `meta:G` 正常；
- 61,531 个 `movie:*` 与 v2 hash keyset 完全一致。

KV `null` 解析缺陷随后由 PR #283 修复并进入 `main`。

### 3.5 Gate E：R2 白名单清理 — PASS

Wrangler 4.93.1 读取 R2 时返回 403。执行安全停止，没有删除对象、没有重试扩大范围，也没有擅自切换工具。

经人工批准，在 ignored `.venv` 中安装并保留声明依赖 `boto3 1.43.51` / `botocore 1.43.51`。Worker 于 `2026-07-19T16:13:23Z` 完成五对象白名单 preflight，只删除：

- `galaxy/today.json`
- `ops/og-index/state-v1.json.gz`

删除后两个 legacy 对象均为 404；`ops/og-index/state-v2.json.gz` 严格有效。保护对象 `galaxy/galaxy_data.json.gz`、`galaxy/galaxy_search_index.json.gz` 的 size/ETag 未变化，未删除任何其他对象。

### 3.6 Gate F：production nightly 与最终生产审计 — PASS

#### 验收口径

原“必须等待自然 schedule”口径经人工批准改为：允许受约束的 `workflow_dispatch` 提供等价端到端生产链证据，但必须满足：

- 从远端默认分支 `main` 触发；
- 记录并核对准确 `head_sha`；
- `force_skip_dim_check=false`；
- 实际执行与 schedule 相同的导出、OG index v2 sync、R2 上传、前端构建与 Pages production deployment；
- cron 自然唤起能力不由手动 run 证明，改为静态验收 workflow cron。

本次只触发一次，没有重跑 monthly workflow，也没有再次手动重跑 nightly。

#### GitHub Actions 证据

| 字段 | 值 |
| --- | --- |
| workflow | `P18.4 Nightly vote refresh` |
| run ID / run number / attempt | `29695857526` / `114` / `1` |
| URL | `https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29695857526` |
| event / ref | `workflow_dispatch` / `main` |
| head SHA | `4328499cd47081370012e86a0b2106517c45c262` |
| input | `force_skip_dim_check=false`；job 环境记录 `DIM_DRIFT_FORCE_SKIP: false` |
| run started / completed | `2026-07-19T16:56:52Z` / `2026-07-19T17:03:42Z` |
| conclusion | `success` |
| job | `refresh`，job ID `88216377987` |
| job started / completed | `2026-07-19T16:56:55Z` / `2026-07-19T17:03:41Z` |
| job URL | `https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29695857526/job/88216377987` |

12 个生产步骤全部成功：

| # | 步骤 | UTC 时间 |
| --- | --- | --- |
| 1 | Set up job | `16:56:56`–`16:56:57` |
| 2 | checkout | `16:56:57`–`16:56:59` |
| 3 | setup Python | `16:56:59`–`16:57:19` |
| 4 | Install Python dependencies | `16:57:19`–`16:58:45` |
| 5 | Supabase read-only preflight | `16:58:45`–`16:58:47` |
| 6 | Run nightly vote refresh | `16:58:47`–`17:02:23` |
| 7 | Sync OG index KV incrementally | `17:02:23`–`17:02:30` |
| 8 | Upload galaxy gzip to R2 | `17:02:30`–`17:02:39` |
| 9 | upload artifact | `17:02:39`–`17:02:39` |
| 10 | setup Node | `17:02:39`–`17:02:40` |
| 11 | Install and build frontend | `17:02:40`–`17:03:17` |
| 12 | Deploy to Cloudflare Pages | `17:03:17`–`17:03:40` |

run 产物版本为 `2026.07.19.daily.114`，电影数为 61,531。OG sync summary 为 61,531 unchanged、`meta_put=1`、`movie_put=0`、`movie_delete=0`、`today_delete=0`。日志无 `today.json` 生成/上传，也无 state-v1 snapshot 回写。

GitHub production deployment：

- deployment ID：`5512651456`
- ref/SHA：`main@4328499cd47081370012e86a0b2106517c45c262`
- created/status：`2026-07-19T17:03:39Z` / `success`
- status time：`2026-07-19T17:03:40Z`
- Pages URL：`https://50209400.the-movie-cosmos.pages.dev/`

#### cron 静态验收

- nightly：`0 20 * * *`
- monthly：`0 20 1 * *`
- 两个 workflow 均只调用 v2 incremental sync 与 galaxy/search upload，不含 Today 生成、上传或 state-v1 回写配置。

monthly 未被触发；其自然 cron 只做静态验收，不需要等待下一次月度 schedule。

## 4. 最终生产状态

### 4.1 Manifest、KV 与 R2

production manifest `https://themoviecosmos.com/data/galaxy_assets_manifest.json` 已前进至：

- `data_version/source = 2026.07.19.daily.114`
- 无 `today_url`
- `r2_object_keys` 无 `today`
- `galaxy_data_gzip_url` 与 `galaxy_search_index_gzip_url` 均指向 `2026.07.19.daily.114`

最终只读审计：

| 对象 | 结果 |
| --- | --- |
| KV `meta:G` | `2026.07.19.daily.114` |
| KV `today` | 缺失 |
| KV `movie:*` | 61,531 个，与 v2 hash keyset 完全一致 |
| R2 `ops/og-index/state-v2.json.gz` | 存在；schema 2；source `2026.07.19.daily.114`；无 Today 字段 |
| R2 `ops/og-index/state-v1.json.gz` | 缺失 |
| R2 `galaxy/today.json` | 缺失 |
| R2 `galaxy/galaxy_data.json.gz` | 存在，受保护 |
| R2 `galaxy/galaxy_search_index.json.gz` | 存在，受保护 |

严格 KV/R2 审计前，两次只读辅助命令分别因缺少 `scripts` 模块路径、Python 默认 User-Agent 访问公开 manifest 返回 403 而在触达 KV/R2 前停止。第三次白名单审计成功；有限后台进程已完成，没有遗留 watcher。

### 4.2 路由、OG 与 Pages

主域最终验收：

- `/today`、带 query 的 `/today`、`/og/today.png`、带 query 的 `/og/today.png`：GET/HEAD 共八项均为真实 404，无 `Location`；
- `/`、`/movie/550`、`/movie/670292`：200；
- 未版本化品牌/电影 OG：按设计 canonical 302；
- 版本化品牌 OG、`/og/movie/550.png`、`/og/movie/670292.png`：200；
- Pages deployment URL 的 `/`、`/movie/550` 与 manifest 正常。

首页保持 galaxy idle，普通电影 focus/Drawer、品牌 OG 与电影动态 OG 无回归。

## 5. Daily Stargazing 回归

只读验证真实发布包：

`T:\themoviecosmos-daily-stargazing\output\publications\2026-07-06\670292-the-creator`

结果：

- publication manifest 状态为 `ready`；
- `copy/xiaohongshu.md` 的电影 CTA 为 `https://themoviecosmos.com/movie/670292`；
- `/movie/670292` 与对应电影动态 OG 正常；
- Daily 仓库没有因 Phase 40 修改产品代码。

存在一个不阻塞 Phase 40 的既有偏差：manifest 声明 `copy/xiaohongshu-humanized.md`，但实际目录只有 `copy/xiaohongshu.md`。该偏差不影响 `/movie/:id` CTA 契约，本 Phase 未修改 Daily 仓库。

## 6. 生产 mutation 总账

| Gate | 已授权并实际执行的 mutation |
| --- | --- |
| B | 一次 OG Worker deploy；人工清理两个 Today prefix cache |
| C | 两次 Pages production deployment；第一次发生数据回退，第二次 corrective |
| D | 第一次删除 KV `today` 后因 `null` read-back fail-closed；新授权下恢复并提交 v2 checkpoint |
| E | 白名单删除 `galaxy/today.json` 与 `ops/og-index/state-v1.json.gz` |
| F | 一次从 `main@4328499cd47081370012e86a0b2106517c45c262` 触发的受约束 production `workflow_dispatch`，完成导出、KV/R2 更新与 Pages 部署 |

明确未执行：

- 未触发 monthly workflow；
- 未删除两个 galaxy/search 保护对象；
- 未 purge everything；
- 未执行 quota override；
- 未在 Gate F 后再次手动重跑 workflow；
- 未扩大 R2 删除白名单。

## 7. 验收结论

Phase 40 的产品、数据、存储、路由、OG 与生产调度契约已经收敛到单一状态：主站只保留 galaxy idle 与具体电影深链，不再承担 The Movie Today。

Gate C 的错误数据回退、Gate D 的部分 mutation 与 KV `null` 缺陷、Gate E 的 Wrangler 403 均已按 fail-closed 边界停止、取得独立授权后纠正，并在最终生产审计中闭环。Gate F 从准确 `main` SHA 完成同链路生产运行，版本前进到 `2026.07.19.daily.114`，退役对象未被重新生成。

因此，canonical Plan 的 `p40-production-gate` 可标记为 `complete`，Phase 40 结束。
