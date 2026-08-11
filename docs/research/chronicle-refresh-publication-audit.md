# Chronicle 数据刷新与发布面审计

> 调研结论，证据截止于 2026-08-11 21:03（Asia/Shanghai）。本文件回答 [Issue #377](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/377)；只记录当前实现和生产观测，不提出工作流改造方案。

## 结论摘要

Chronicle 当前有两条生产调度链：nightly 每天一次，monthly 每月一次；两者也都允许人工触发。它们共享同一个 concurrency lock，但各自在一个 job 内串行执行：Supabase preflight → 数据计算/写库/导出 → OG Index KV → R2 数据（monthly 还处理 active emission profile）→ 前端构建 → Cloudflare Pages Direct Upload。源码和系统契约都明确不提供跨 Supabase、KV、R2、manifest 与 Pages 的全局事务；已完成的早期阶段不会因为后续阶段失败而自动回滚。[[S1]](#sources) [[S2]](#sources) [[S3]](#sources)

这不是理论边界，而是当前生产事实：2026-08-03 至 2026-08-10 的八次 scheduled nightly 都在前面的 Supabase、导出、OG KV、R2 和 artifact 阶段成功后，于前端 build 阶段失败，Pages deploy 被跳过。最新一次 run 已把 `2026.08.10.daily.139` 的约 38.5 MB galaxy gzip 和 21.5 MB search gzip写入 R2，并使 OG Index 完成一次 `meta:G` PUT；但线上 Pages manifest 仍指向 2026-08-02 的最后一次完整成功 run `30766145505`。[[R1]](#sources) [[R2]](#sources) [[P1]](#sources)

因此当前各发布面的真实关系是：

- Supabase 是计算态与导出的事实来源，不是浏览器运行时数据源。
- OG Index KV 是独立投影；它先于 R2/Pages 发布，允许在网站数据版本未推进时已经推进 `meta:G`。
- R2 immutable objects 可以先成功并成为未被 Pages manifest 引用的对象。
- Pages manifest 才决定网站当前读取哪一组 R2 galaxy/search 对象与哪一个 immutable emission profile。
- active emission pointer 只允许 monthly 推进；nightly 必须读取、校验并原样复用当前 profile。
- Cloudflare Pages 是唯一站点发布表面；仓库没有独立的 frontend deploy workflow，所以前端 shell 变更只有在 nightly/monthly 跑完整条链时才会被 Direct Upload。

未来无论采用什么更精简的模型，必须保留这些能力，而不是当前 workflow 的具体形状：source readiness、nightly 与 refit 的数据语义、可验证且带 provenance 的导出、OG 增量投影及恢复 checkpoint、immutable R2 发布与 manifest 指针、monthly-only profile 激活规则、可独立观察的 frontend build/Pages deploy、last-known-good 消费与分阶段恢复，以及受审计的人工排障入口。

## 1. 当前入口、节奏与所有权

### 1.1 生产调度

| 入口 | 触发与资源上限 | 当前责任 | 关键依赖 |
| --- | --- | --- | --- |
| `nightly_vote_refresh.yml` | `0 20 * * *` UTC；也可 `workflow_dispatch`；Ubuntu 24.04 单 job，90 分钟 timeout | 读取 frozen threshold；更新已有电影的票数/评分/热度；新过线电影进入 pending；导出 galaxy/search；同步 OG KV；上传 nightly R2 release 并复用 active profile；构建并部署 Pages | GitHub hosted runner、Kaggle、Supabase、Cloudflare KV、R2、Pages、Python/npm registries、Actions cache/secrets [[S1]](#sources) |
| `monthly_refit.yml` | `0 20 1 * *` UTC；也可 `workflow_dispatch`；Ubuntu 24.04 单 job，210 分钟 timeout | 重算 threshold；全量 UMAP + Procrustes；合并 pending；导出；生成 monthly emission candidate；同步 OG KV；发布 R2 release，并按月推进/冻结 active profile；构建并部署 Pages | nightly 的全部依赖，另加 embedding bundle（secret URL、Actions cache 或 repo copy） [[S2]](#sources) |

两条 schedule 在每月 1 日的同一分钟触发，使用 `galaxy-r2-pages-release` 且 `cancel-in-progress: false`，所以会串行而不是互相取消。2026-08-01 的 nightly 在 20:37–20:45 UTC 完成，monthly 随后在 20:53–21:15 UTC 运行，符合这个锁的实际效果。[[S1]](#sources) [[S2]](#sources) [[R3]](#sources) [[R4]](#sources)

### 1.2 人工入口

当前仓库只有四个 workflow 文件；其中所有四个都支持 `workflow_dispatch`，但用途不同：

1. Nightly 的人工触发仍是完整生产发布链，只额外允许 `force_skip_dim_check` 紧急放行。
2. Monthly 的人工触发仍是完整生产发布链，额外暴露 anchor mode、dimension-drift 放行、首次 profile bootstrap、同月 force activation 和必填审计理由。[[S2]](#sources)
3. `supabase_preflight.yml` 是 10 分钟上限的只读诊断，只检查 Supabase，不下载 Kaggle、不写库、不发布。已知生产证据是 2026-07-15 run `29428994176`，总墙钟约 1 分 57 秒，实际 preflight step 约 1 秒。[[S4]](#sources) [[R5]](#sources)
4. `phase18_refit_benchmark.yml` 是 180 分钟上限的人工 benchmark，可从 URL 或 Actions cache 取 canonical bundle，可选执行 export；它不接 Supabase/KV/R2/Pages，因此不是生产发布入口。唯一列出的 run `25322797674` 于 2026-05-04 成功，总墙钟约 13 分 10 秒，核心 benchmark 约 11 分 05 秒。[[S5]](#sources) [[R6]](#sources)

Python CLI 也保留本地 `--input-csv`、`--dry-run`、`--skip-export` 等排障能力；monthly 另可跳过 emission candidate 生成。这些是脚本能力，不是独立的 GitHub 发布 workflow。[[S6]](#sources) [[S7]](#sources)

## 2. 分阶段职责与失败语义

### 2.1 Supabase readiness 与数据计算

两条生产链都在昂贵的 Kaggle/UMAP 工作前执行 read-only preflight。preflight 校验配置、URL/DNS、TLS/PostgREST 连通性以及“恰好一个 active threshold”；任何失败以非零退出，使后续步骤全部跳过。前端不查询 Supabase，它只消费静态 manifest 与 R2 对象。[[S8]](#sources) [[S9]](#sources)

Nightly 使用 active `threshold_versions.thresholds_json` 作为冻结门槛，不重算阈值，也不从 `movies` 删除当日掉到门槛以下的记录。它分批 upsert 已有电影的 vote fields，将新片插入 `movies_pending`，写 monthly vote snapshots，然后调用 `export_from_supabase.py`。[[S6]](#sources)

Monthly 重新计算一份 threshold map，以它定义唯一 final membership，完成 UMAP/Procrustes 后先停用旧 active threshold、再 upsert 新 active threshold，随后批量 upsert `movies`、删除已合并的 pending，最后 export 并生成 emission candidate。[[S7]](#sources)

这些 Supabase 写操作没有被包在一个跨步骤事务中。脚本在 chunk 间或 export/profile generation 时失败，已经成功的 threshold、movie、pending 或 snapshot mutation 不会自动撤销；workflow 会停止在当前 step，KV/R2/Pages 不再执行。这里的恢复语义是“修复后重跑/显式恢复”，不是数据库事务回滚。[[S6]](#sources) [[S7]](#sources)

### 2.2 静态导出

`export_from_supabase.py` 分页读取 `movies`，默认使用两个并行 shard；并行读取失败时会记录错误并回退到单 worker 顺序重试。它生成 `galaxy_data.json`、两个 gzip 产物并执行 schema/count 校验。[[S10]](#sources)

导出版本由 workflow run number 参与构造：nightly 是 `YYYY.MM.DD.daily.<seq>`，monthly 是 `YYYY.MM.DD.monthly.<seq>`。这一版本同时进入 galaxy `meta.version`，并成为 OG `meta:G` 的当前 producer value 以及 R2 release identity 的一部分。[[S6]](#sources) [[S7]](#sources) [[S11]](#sources)

### 2.3 OG Index KV 与 R2 checkpoint

OG 同步不是 nightly/monthly Python 计算脚本的内部行为，而是 export 后的独立 workflow step。它从当前导出构造 v2 snapshot，与 R2 `ops/og-index/state-v2.json.gz` 的已提交 snapshot 做 diff，只写变化的 `movie:{id}`、删除离开 membership 的 movie key，读回校验后写/校验 `meta:G`，最后才提交新的 R2 checkpoint。默认 mutation guard 是最多 900 PUT 和 900 DELETE；超过、缺 checkpoint、snapshot 损坏、凭据缺失、KV API 失败或 read-back 不一致都会 fail closed。[[S11]](#sources) [[S12]](#sources)

失败可能发生在若干 KV mutation 已经完成之后；但 `meta:G` 与 checkpoint 都在 movie mutation 校验之后，checkpoint 最后提交。scheduled 路径不会静默改用 full sync，也不会自动迁移 v1。下一次重跑仍以旧 committed checkpoint 计算并重放所需差异。这个顺序限制了“宣布完成”的时点，但 Cloudflare KV 本身不提供跨 key 原子快照。[[S3]](#sources) [[S11]](#sources)

当前增量成本与数据改变量并不等价。2026-08-10 nightly 在 Supabase 更新了 1,790 部电影并新增 33 个 pending，但 OG 所投影的 title/date/genres/poster 没变化，所以同步摘要是 62,006 部电影全部 unchanged，仅一次 `meta:G` PUT。[[R1]](#sources)

### 2.4 R2 galaxy/search publication

`upload_galaxy_r2.py` 需要五项 R2 配置；任一缺失现在都是失败，不会安全 skip。每次运行会基于 `data_version + 两个完整 SHA-256` 生成 content release ID，把 galaxy/search gzip 上传到新的 immutable key，再在本地生成 Pages 要发布的 `galaxy_assets_manifest.json`。[[S13]](#sources)

中途中断不会改变已经在线的 Pages manifest，因此旧网站 release 仍可读；但已经成功上传的 immutable object 不会被回滚，可能成为未引用对象。脚本中的 `R2_GALAXY_PRUNE_AFTER_UPLOAD=1` 只删除 runner 工作区里的大文件以通过 Pages 25 MiB 限制，源码没有远端 release 删除或 retention 操作。[[S13]](#sources)

### 2.5 Active emission-profile publication

Monthly 计算通过验证的 candidate。R2 release step 先读取并验证当前 `active.json` 和对应 immutable profile，然后上传 candidate immutable profile、galaxy/search objects，完整组装本地 manifest/monthly audit，最后才在需要激活时写 remote `active.json`。同一 period 的普通重跑保持旧 pointer；只有显式 `force_profile_activation`、非空 reason 和 actor 才能替换同月 profile；普通激活也不能把 period 倒退。[[S2]](#sources) [[S13]](#sources) [[S14]](#sources)

Nightly 不生成、上传或激活 profile。它必须成功读取 `active.json`、下载 immutable profile 并验证两者 identity/provenance 一致，然后把同一个 profile pointer/URL 写入新 local manifest；缺 pointer、缺 immutable artifact 或字段不匹配都会阻止 R2 发布。[[S13]](#sources)

active pointer 是 monthly R2 step 内最后一个可失败的远端 mutation，但它仍然早于 frontend build 和 Pages deploy。因此“profile 已激活”与“新 Pages manifest 已部署”不是一个事务。兼容性由 immutable profile URL 与 last-known-good manifest 保证，而不是由全局 generation barrier 保证。[[S13]](#sources) [[S15]](#sources)

### 2.6 Frontend build 与 Cloudflare Pages

R2 成功后，workflow 准备 Pages assets，删除工作区中由 R2 托管的大文件；随后删除根与 frontend 的 `node_modules` 以及根 `package-lock.json`，执行一次新的 `npm install`，再运行 frontend build。build 本身包括 TypeScript、Vite、25 MiB 单文件检查和 SPA/manifest 结构检查。任一环节失败都会跳过 wrangler deploy。[[S1]](#sources) [[S2]](#sources) [[S16]](#sources) [[S17]](#sources)

成功时 `cloudflare/wrangler-action@v3` 在 `frontend` 工作目录执行 `pages deploy dist --project-name=... --branch=${github.ref_name}`，并通过 GitHub token 留下 deployment 记录。当前没有单独的 push-on-main 或 standalone Pages workflow；GitHub Pages workflow 已删除，所以生产 shell 与 manifest 只能通过 nightly/monthly 的末端步骤更新。[[S1]](#sources) [[S2]](#sources) [[S15]](#sources)

## 3. 阶段独立性矩阵

| 首个失败阶段 | 已可能成功的外部 mutation | 不会执行 | 可继续被消费者使用的 last-known-good |
| --- | --- | --- | --- |
| Supabase preflight | 无 | Kaggle、写库、export、KV、R2、build、Pages | 原 Supabase 数据、原 KV/checkpoint、原 Pages manifest |
| nightly/monthly compute 或 export | 部分/全部 Supabase mutation；monthly 可能已更新 threshold | KV、R2、build、Pages | 原 KV、原 Pages manifest/R2 release；Supabase 需按脚本幂等性/人工证据恢复 |
| OG KV sync | Supabase 与本地 export；可能有部分 KV movie mutation | R2 galaxy release、build、Pages | 原 committed checkpoint；`meta:G` 仅在 movie mutation 校验后推进 |
| R2 publication | Supabase、OG KV/checkpoint；可能有部分新的 immutable R2 objects | build、Pages | 原 Pages manifest；monthly 在 pointer 前失败时保留旧 active pointer |
| Frontend build | Supabase、OG KV/checkpoint、R2 release；monthly active pointer 也可能已推进 | Pages deploy | 原 Pages deployment 与其中的原 manifest |
| Pages deploy | 以上所有阶段及本地 dist | 无更晚步骤 | Cloudflare 保留上一次成功 deployment；本次失败需要显式重跑/修复 |

这张表是当前“独立成功”的准确含义：步骤在一个串行 job 中，前一步失败会阻断后一步，但后一步失败不会撤销前一步。消费者使用最近一次自己能够读取并验证的兼容产物。[[S3]](#sources) [[S15]](#sources)

## 4. 运行负担与成本驱动

本审计没有 Supabase/Cloudflare/Kaggle 的账单权限，因此不声称美元成本。下面是源码和 first-party run 可直接证明的资源负担。

| 成本面 | 可核验观测 | 含义 |
| --- | --- | --- |
| GitHub runner | 2026-08-02 nightly 成功 run 墙钟 388 秒；2026-08-01 monthly 成功 run 1,328 秒；2026-08-10 nightly 失败 run 445 秒。三者 timing API 的 Ubuntu `billable.total_ms` 均为 0，仓库为 public。[[R1]](#sources) [[R3]](#sources) [[R7]](#sources) | 以代表性成功速度估算，30 次 nightly + 1 次 monthly 约 3.6 runner 小时/月；这是负载估算，不是账单承诺。失败在链尾时仍消耗几乎完整 nightly 负载。 |
| Python dependency setup | 2026-08-10 nightly 的 setup-python 恢复约 2.886 GB pip cache，随后安装步骤约 88 秒。[[R1]](#sources) | 每次 run 都做依赖准备；缓存体积与下载/解包是显著的网络、时间与 Actions cache 占用。 |
| Nightly 数据处理 | 同一 run 下载 1,230,835 行 raw CSV，清洗到 62,092 行，读取 62,006 部当前电影，更新 1,790、插入 33 pending，最终导出 62,006 部。[[R1]](#sources) | “轻刷新”不重做 UMAP，但仍全量下载、清洗、读取和重导出。 |
| Monthly compute | 2026-08-01 run 的 monthly compute step 为 18 分 22 秒，整 job 22 分 08 秒；workflow 还依赖四文件 embedding bundle。[[R3]](#sources) [[S2]](#sources) | UMAP/Procrustes 与约 62k 行 Supabase upsert 是月度主成本；bundle URL/cache 是额外运维依赖。 |
| R2 storage/write | 2026-08-10 每次 release 写约 38.5 MB galaxy + 21.5 MB search，即约 60 MB immutable data；当前源码不删远端旧 release。[[R1]](#sources) [[S13]](#sources) | 若没有 bucket lifecycle 或仓库外人工清理，按日发布约增加 1.8 GB/月，另加 monthly release 与少量 profile/checkpoint。失败在 build/Pages 阶段也会留下该日对象。 |
| KV writes | 2026-08-10 实际是 1 PUT、0 DELETE；默认 guard 为 900 PUT/900 DELETE。[[R1]](#sources) [[S11]](#sources) | incremental diff 显著降低常态 mutation；membership/OG 字段大变时 quota guard 会 fail closed。 |
| Frontend install/build/deploy | 成功 nightly 中 fresh npm install + build 约 37 秒，Pages deploy 约 17 秒；成功 monthly 中分别约 47 秒与 18 秒。[[R3]](#sources) [[R4]](#sources) | 每次数据 refresh 都重新解析/安装前端依赖并重新发布 shell，数据 cadence 与 shell cadence 当前绑定。 |

## 5. 截止审计时的生产证据

### 5.1 最后一次成功 monthly

Scheduled monthly run [`30717948388`](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/30717948388) 于 2026-08-01 成功，所有阶段全绿。它发布数据版本 `2026.08.01.monthly.12`，生成并激活：

- `profile_id`: `rating-emission-2026-08-7ff02be43a29eb802378e645`
- `period`: `2026-08`
- `model_version`: `rating-midrank-cdf-lut-v1`
- `curve_sha256`: `a516f7fc10b21736298923633add65d1cddfd4a3c982df3822d063b6cafe830b`
- `source_movie_count`: `62006`

run 日志显示 immutable profile、两项 R2 data objects、`active.json`、frontend build 与 wrangler Pages deploy 依次成功。公开 [`active.json`](https://pub-f949433b3a004a35b0a5e38f8f508c57.r2.dev/galaxy/focus-emission-profiles/active.json) 在审计时返回 HTTP 200、`Cache-Control: no-cache, must-revalidate`，内容与该 run 一致，`Last-Modified` 为 2026-08-01 21:14:08 GMT。[[R3]](#sources) [[P2]](#sources)

### 5.2 最后一次完整成功 nightly / Pages deployment

Scheduled nightly run [`30766145505`](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/30766145505) 于 2026-08-02 全绿，发布 `2026.08.02.daily.131`，复用上面的 August profile，并创建 GitHub production deployment `5717531488`。deployment status 为 `success`，environment URL 为 [`https://8910991e.the-movie-cosmos.pages.dev`](https://8910991e.the-movie-cosmos.pages.dev)。[[R4]](#sources) [[D1]](#sources)

审计时线上 [`themoviecosmos.com/data/galaxy_assets_manifest.json`](https://themoviecosmos.com/data/galaxy_assets_manifest.json) 返回 HTTP 200，`Cache-Control: public, max-age=60, must-revalidate`，并明确声明 `data_version=2026.08.02.daily.131`、`github_run_id=30766145505` 和同一个 August profile。它证明当前网站仍消费这次 last-known-good Pages release。[[P1]](#sources)

### 5.3 最新 nightly 的部分成功

2026-08-03 至 2026-08-10 共八次 scheduled nightly 连续失败；所有八次的失败 step 都是 `Install and build frontend (R2-backed galaxy assets)`，它们之前的 Supabase、nightly refresh/export、OG KV、R2 publication 与 artifact step 均成功，Pages deploy 均 skipped。最新 run [`31429220714`](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/31429220714) 的确切 build 错误是找不到 `frontend/node_modules/vite/bin/vite.js`。[[R1]](#sources) [[R2]](#sources)

该最新 run 已产生：

- Supabase active threshold `p18_monthly_20260801_12`；导出 `2026.08.10.daily.139`、62,006 部电影。
- OG Index：62,006 unchanged movie projections、1 次 `meta:G` PUT、checkpoint step 成功。
- R2：新的 immutable galaxy/search objects，合计约 60.0 MB；生成的 local manifest 仍引用 August active profile。
- GitHub artifact：只保留 prune 后的小 manifest（artifact ID `9078605344`）。
- Cloudflare Pages：没有新 deployment，线上 manifest 未推进。

这组证据是当前 lean-model 讨论最重要的基线：一个 run 的 overall `failure` 不能被解释成“所有生产状态都没变”，也不能被解释成“网站已更新”；必须按 stage 判断。[[R1]](#sources) [[P1]](#sources)

## 6. 已发现的说明偏差与缺口

以下只是审计发现，不在本 ticket 修改：

1. Data Pipeline 的 Secrets 表仍写“R2 五个变量缺一即 safe skip、不阻塞”，但当前 `upload_galaxy_r2.py` 明确返回 1 并说明缺 provenance 的 mixed release 不安全。当前源码是实际行为。[[S9]](#sources) [[S13]](#sources)
2. Nightly workflow 的旧注释仍说 GitHub Pages workflow 保留作 gray release；而 current capability map、Tech Spec 与仓库文件集合都表明 GitHub Pages 已退役，Cloudflare Pages 是唯一站点发布表面。[[S1]](#sources) [[S15]](#sources)
3. `verify-spa-fallback-dist.mjs` 顶部注释仍提到已删除的 `deploy-pages.yml` 会创建 GitHub Pages `404.html`；实际断言只是 Cloudflare Pages dist 不应包含 `404.html`。[[S17]](#sources)
4. 仓库没有 standalone frontend/manifest publish workflow，也没有远端 R2 release retention step；这两个事实目前分散在源码行为中，没有一处 current 运维文档将它们作为显式边界列出。[[S1]](#sources) [[S2]](#sources) [[S13]](#sources)
5. 仓库 workflow 中没有专门的告警或通知 step。GitHub run/deployment 状态是可见证据，但是否另有仓库外监控不在本审计可证明范围内。

## 7. 未来精简模型必须保留的最小能力

下面是从当前产品/跨仓契约和真实失败行为抽出的能力清单，不规定未来用 cron、单个 workflow、多个 job、本地机器或其他实现：

1. **Source readiness gate**：在昂贵或有 mutation 的阶段前，能诊断 Kaggle/Supabase 配置、连通性和唯一 active threshold，并且不泄漏 secret。
2. **两种清晰的数据语义**：轻刷新必须沿用 frozen threshold、更新动态字段并收集 pending；refit 必须能重算 membership、坐标和 threshold，并处理 pending。
3. **确定且可验证的 export**：产生 schema/count 合法的 galaxy + search assets，带唯一 `data_version`、threshold/profile provenance 和可回溯 run evidence。
4. **OG projection contract**：继续生成 `movie:{id}` 与 `meta:G`，以增量 diff、quota guard、read-back verification 和 committed recovery checkpoint 防止静默漂移；失败不能伪装成成功。
5. **R2/manifest 分层**：大对象使用 content-addressed/immutable release，网站通过小型可更新 manifest 选择 release；失败时旧 manifest 必须继续可用。未引用对象的 retention/清理是必须显式决定的成本策略，而不是兼容性事务的一部分。
6. **Emission lifecycle**：profile 必须经过验证，ordinary monthly 每 period 最多推进一次，force 有 reason/actor 审计，nightly 只能校验并复用 active profile；网站与 Planet Export 能从同一 manifest provenance 验证它。
7. **可重复验证的 frontend artifact**：build 必须包含类型/生产构建、Pages 单文件限制、SPA/manifest 结构检查；build 与 Pages deploy 的成功/失败必须独立留证。
8. **Last-known-good 与分阶段恢复**：不能假设跨 Supabase/KV/R2/Pages 原子；操作员必须能知道哪一阶段已 mutation、哪一 consumer 仍在旧版本，以及从哪里安全重跑。
9. **人工控制面**：至少保留只读 preflight、无 mutation dry-run、完整生产 rerun，以及对危险 override（dimension skip、profile bootstrap/force 等）的显式审计。
10. **生产可观察性**：每个发布面都要留下 dated、可关联的 version/run/deployment 证据；overall workflow 结论不能替代 step-level 状态。

这十项是“不能丢的产品/运维能力”。当前 nightly/monthly 文件名、单 job 排列、每天重建前端、cache 策略和具体脚本划分都不是本调研判定的永久契约。

## Sources

### Repository source at audited commit `4ed45a5db75f1c108fec28359358683ba16c542e`

- <a id="S1">S1</a> — [Nightly workflow: cadence, lock, stages and Pages deploy](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/.github/workflows/nightly_vote_refresh.yml#L3-L132)
- <a id="S2">S2</a> — [Monthly workflow: inputs, bundle, stages, profile publication and Pages deploy](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/.github/workflows/monthly_refit.yml#L3-L237)
- <a id="S3">S3</a> — [Current contract index: lean release semantics](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/docs/system/contract-index.md#L41-L56)
- <a id="S4">S4</a> — [Manual Supabase preflight workflow](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/.github/workflows/supabase_preflight.yml#L1-L38)
- <a id="S5">S5</a> — [Manual core-refit benchmark workflow](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/.github/workflows/phase18_refit_benchmark.yml#L1-L121)
- <a id="S6">S6</a> — [Nightly CLI and Supabase/export behavior](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/scripts/cron/nightly_vote_refresh.py#L359-L495)
- <a id="S7">S7</a> — [Monthly CLI, threshold/refit/Supabase/export/profile behavior](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/scripts/cron/monthly_refit.py#L468-L932)
- <a id="S8">S8</a> — [Supabase read-only health preflight implementation](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/scripts/cron/check_supabase_health.py#L137-L321)
- <a id="S9">S9</a> — [Current Data Pipeline SSOT: automation](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/docs/project_docs/TMDB%20%E7%94%B5%E5%BD%B1%E5%AE%87%E5%AE%99%20Data%20Pipeline.md#L102-L161)
  and [deployment/secrets](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/docs/project_docs/TMDB%20%E7%94%B5%E5%BD%B1%E5%AE%87%E5%AE%99%20Data%20Pipeline.md#L663-L714)
- <a id="S10">S10</a> — [Supabase export parallel read and sequential fallback](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/scripts/cron/export_from_supabase.py#L145-L237)
- <a id="S11">S11</a> — [OG incremental plan, quota, mutation order and checkpoint commit](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/scripts/cron/sync_og_index_kv.py#L318-L455)
- <a id="S12">S12</a> — [Current OG Index / Worker contract](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/docs/system/og-index-worker-contract.md#L62-L87)
- <a id="S13">S13</a> — [R2 release implementation: required env, immutable assets, manifest/pointer ordering and rollback](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/scripts/cron/upload_galaxy_r2.py#L1-L11)
  and [main release sequence](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/scripts/cron/upload_galaxy_r2.py#L283-L557)
- <a id="S14">S14</a> — [Emission-profile activation/freeze/force rules](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/scripts/cron/emission_profile_release.py#L110-L159)
- <a id="S15">S15</a> — [Capability map: active and retired publication surfaces](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/docs/system/capability-map.md#L17-L43)
- <a id="S16">S16</a> — [Production build staging behavior](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/frontend/scripts/build-production.mjs#L1-L42)
- <a id="S17">S17</a> — [Pages dist size gate](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/frontend/scripts/check-dist-max-file-size.mjs#L1-L68)
  and [SPA/manifest dist verification](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/blob/4ed45a5db75f1c108fec28359358683ba16c542e/frontend/scripts/verify-spa-fallback-dist.mjs#L1-L59)

### First-party GitHub run and deployment evidence

- <a id="R1">R1</a> — [Latest audited nightly, run 31429220714 (2026-08-10)](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/31429220714), including successful Supabase/export/KV/R2 steps, sizes/versions, failed frontend build, and [timing API](https://api.github.com/repos/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/31429220714/timing)
- <a id="R2">R2</a> — [Nightly run history](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/workflows/nightly_vote_refresh.yml), showing eight consecutive scheduled failures from 2026-08-03 through 2026-08-10
- <a id="R3">R3</a> — [Successful scheduled monthly, run 30717948388](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/30717948388), and [timing API](https://api.github.com/repos/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/30717948388/timing)
- <a id="R4">R4</a> — [Last fully successful nightly, run 30766145505](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/30766145505), and [timing API](https://api.github.com/repos/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/30766145505/timing)
- <a id="R5">R5</a> — [Successful manual Supabase preflight, run 29428994176](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29428994176)
- <a id="R6">R6</a> — [Successful manual refit benchmark, run 25322797674](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/25322797674)
- <a id="R7">R7</a> — [Public repository metadata](https://api.github.com/repos/XYBuilds/chronicle_v3_3d_galaxy)
- <a id="D1">D1</a> — [Latest GitHub production deployment status](https://api.github.com/repos/XYBuilds/chronicle_v3_3d_galaxy/deployments/5717531488/statuses)

### Live first-party production observations

- <a id="P1">P1</a> — [Production galaxy assets manifest](https://themoviecosmos.com/data/galaxy_assets_manifest.json), fetched without cache on 2026-08-11 12:59:18 UTC
- <a id="P2">P2</a> — [Production active emission-profile pointer](https://pub-f949433b3a004a35b0a5e38f8f508c57.r2.dev/galaxy/focus-emission-profiles/active.json), fetched without cache on 2026-08-11 13:03:03 UTC
