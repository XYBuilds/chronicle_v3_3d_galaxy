# Phase 37 · Production Pipeline Health Recovery Report

**最终验收日期：** 2026-07-17  
**人工验收：** 通过  
**最终判定：** GO

## 结论

Phase 37 的恢复条件全部满足。Supabase 只读 preflight、final-membership drift 边界、language palette v2、canonical embedding bundle、monthly/nightly、R2、KV、Cloudflare Pages 和线上数据均已验证。真实 `schedule` 触发的 nightly run [29612057099](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29612057099) 完整成功，生产 manifest 明确指向该 run；浏览器无缓存拉取并解压出的数据版本、数量与 Action 日志一致。

## 故障与恢复时间线

| 日期 | 事件 | 处理结果 |
| --- | --- | --- |
| 2026-06-11 起 | nightly 无法通过既有 Supabase endpoint 建立连接，自动票数刷新停止。 | 恢复既有 Supabase 项目，不迁移数据库；增加脱敏只读 preflight。 |
| 2026-07-15 | Supabase 项目恢复为 Healthy，preflight run [29428994176](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29428994176) 读取到唯一 active threshold。 | HTTP 200，年份 1874–2026，日志未泄漏 URL 或 service-role secret。 |
| 2026-07-15 | final membership 仍包含语言 `rm`；其余 55 个未知语言代码只存在于阈值外长尾。 | palette 从 v1 追加迁移到 v2，language width 从 103 变为 104，并重建 canonical bundle。 |
| 2026-07-15 | 首次 monthly run [29439523289](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29439523289) 已完成数据写入与 R2 上传，但前端构建因 `MovieTooltip.tsx` 未使用的 `useEffect` import 失败。 | 修复通过 PR [#255](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/pull/255) 合入，随后 monthly 重跑全绿。 |
| 2026-07-15 | monthly run [29441529543](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29441529543) 与手动 nightly run [29443556489](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29443556489) 成功。 | 37.5 人工验收通过；37.6 继续等待真实 scheduled run。 |
| 2026-07-15 | 首个 scheduled run [29449592532](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29449592532) 在数据导出校验完成后收到 Cloudflare KV HTTP 429。 | 错误原文为 `your account has reached the free usage limit for this operation for today`；37.6 保持 pending，不把配额失败误判为恢复完成。 |
| 2026-07-17 | KV 链路已切换为快照驱动的增量同步；下一次 scheduled run [29612057099](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29612057099) 全绿。 | 完成无缓存线上数据核验和网站 smoke，37.6 判定 GO。 |

## 根因与边界修正

1. **Supabase 可用性：** 既有项目不可用导致 endpoint 解析/连接失败。处理方式是恢复原项目并在昂贵下载前加入只读 preflight，而不是创建新数据库。
2. **维度漂移边界：** monthly 原先在 pre-threshold 语料上执行阻断，长尾语言会被错误放大。现在 pre-threshold 只观测，只有 final membership 可以阻断；threshold 计算、membership 和持久化共享同一份 map。
3. **真实 palette 变化：** `rm` 确实进入 final membership，因此迁移到 `lang=v2` 并重建四件套；没有使用 `force_skip_dim_check` 绕过。
4. **scheduled KV 配额：** 2026-07-15 的 run 在写入 2 个 OG 控制键时收到免费日配额已耗尽的 HTTP 429；数据刷新与导出本身已完成。后续 KV 链路切换为快照驱动的增量同步，稳定电影集合不再重复写入 movie keys。

## Secrets 人工操作

- 人工恢复既有 Supabase 项目，并在 GitHub Actions Secrets 中校对 `SUPABASE_URL` 与 `SUPABASE_SERVICE_ROLE_KEY`；具体值未写入仓库、报告或 Action 日志。
- R2、KV 与 Cloudflare Pages 凭据继续由 GitHub Secrets 注入。验收只记录脱敏状态和聚合结果，不记录 token、key 或完整 Supabase hostname。

## Canonical bundle 与本地验证

- Release：`p37-3-language-palette-v2`。
- final membership：61,460。
- 矩阵：text `(61460, 384)`、genre `(61460, 19)`、language `(61460, 104)`；均为有限数值且逐行 L2 范数为 1。
- `GALAXY_EMBED_BUNDLE_URL` 已指向 v2 Release asset；旧 `p18-monthly-v1` 作为回滚历史保留。
- monthly 的 UMAP 融合宽度为 507；anchor mean L2 为 3.53299，高于 soft observation 线但低于 50 的失败阈值，按既定 soft mode 继续。
- 聚焦验证：
  - `python -m pytest scripts/tests/test_dim_drift_detector.py scripts/tests/test_monthly_refit_membership.py`：10 passed。
  - `python -m pytest scripts/tests/test_audit_final_membership_languages.py scripts/tests/test_dim_drift_detector.py scripts/tests/test_monthly_refit_membership.py scripts/tests/test_language_palette_v2_bundle.py`：16 passed。
  - `python -m pytest scripts/tests/test_cron_fixture_dry_runs.py scripts/tests/test_monthly_refit_membership.py scripts/tests/test_dim_drift_detector.py scripts/tests/test_check_supabase_health.py scripts/tests/test_language_palette_v2_bundle.py scripts/tests/test_audit_final_membership_languages.py`：26 passed。
  - `npm run build -w frontend`：通过。

## 生产运行验证

| 工作流 | 触发方式 | Run | 结果 | 关键证据 |
| --- | --- | --- | --- | --- |
| monthly refit | manual | [29441529543](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29441529543) | success | `force_skip_dim_check=false`；104 维 language、Supabase upsert、R2、Cloudflare Pages 成功。 |
| nightly vote refresh | manual | [29443556489](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29443556489) | success | active threshold、票数更新、pending、R2、KV、build、deploy 成功。 |
| nightly vote refresh | schedule | [29449592532](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29449592532) | failure | preflight、refresh、导出和 `meta.count=61531` 校验成功；旧 KV 写入路径因免费日配额返回 HTTP 429，后续发布步骤未执行。 |
| nightly vote refresh | schedule | [29612057099](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29612057099) | success | preflight、refresh、增量 KV、R2、build、Cloudflare deploy 全部成功。 |

### Scheduled run 29612057099

- 事件：`schedule`；commit：`b7d11caa308f1b768eaccc91f16612448410c5b7`。
- 时间：2026-07-17 20:40:25Z–20:47:16Z，总计 6 分 51 秒；Kaggle 下载约 315 MB，未见异常耗时或下载量漂移。
- Preflight：HTTP 200，active threshold 数量 1，年份 1874–2026。
- 清洗：raw `(1222158, 30)`，frozen-threshold membership `(61487, 30)`；`unknown_genres=[]`、`unknown_languages=[]`、`force_skip=False`。
- 数据更新：已加载 61,531 部电影；pending IDs 26；`vote_updates=1000`、`below_threshold_observed=70`、`new_pending_candidates=12`，新增 12 条 embedding 维度为 text 384 / genre 19 / language 104。
- 导出：61,531 行，`meta.count=61531`，版本 `2026.07.17.daily.112`。一个 Supabase shard 遇到一次可重试的 statement timeout，2 秒后恢复并完成，不影响最终计数。
- KV：`current=61531`、`previous=61531`、`unchanged=61531`、`movie_put=0`、`control_put=2`、`mismatch=0`。
- R2：galaxy gzip 38,239,840 bytes；search index gzip 21,389,576 bytes；manifest 写入成功。
- Cloudflare Pages：GitHub deployment `5495497137` 状态为 `success`；[deployment URL](https://dd86f87b.the-movie-cosmos.pages.dev)。

## 线上版本与缓存排除

在浏览器中给 manifest 和 R2 URL 都附加独立 cache-busting 参数，并使用 `cache: no-store`：

- `https://themoviecosmos.com/data/galaxy_assets_manifest.json` 返回 HTTP 200、`cf-cache-status: DYNAMIC`、`cache-control: public, max-age=60, must-revalidate`。
- manifest 的 `github_run_id` 为 `29612057099`，`data_version` 为 `2026.07.17.daily.112`，`exported_at` 为 `2026-07-17T20:46:14.811237+00:00`。
- manifest 指向带 `v=2026.07.17.daily.112` 的 R2 gzip URL。无缓存请求返回 HTTP 200、38,239,840 bytes，`Last-Modified` 为 2026-07-17 20:46:10 GMT。
- 浏览器解压后 `meta.version=2026.07.17.daily.112`、`meta.count=61531`、`movies.length=61531`；首尾 TMDB ID 为 2 / 1725116。

manifest 中的 run ID、版本、时间、gzip 字节数和解压后计数均与 scheduled Action 日志一致，因此排除浏览器或 CDN 旧 gzip 命中的可能。

## 浏览器 smoke

- `https://themoviecosmos.com` 首屏加载完成，页面标题为 `the movie cosmos`，当日电影为 *The Railway Man*；Enter 进入 `/movie/127560`。
- 星系画布已挂载：WebGL context 可用、未丢失，drawing buffer 为 1458×1899。
- 搜索 `The Creator` 返回 `The Creator (2023) Science Fiction`，点击后进入 `/movie/670292`，详情标题为 `The Creator`。
- 在复测窗口内记录的 `console.error`、页面 `error`、未处理 Promise rejection 和失败 fetch 均为 0；未观察到新增 console/network error。

## 最终验收

- [x] Supabase preflight 可诊断且不泄漏 secret。
- [x] final-membership drift、threshold SSOT 与 palette/bundle 契约成立。
- [x] monthly 与 manual nightly 在 `force_skip_dim_check=false` 下成功。
- [x] 下一次真实 scheduled nightly 完整成功。
- [x] R2、增量 KV、Cloudflare Pages 与线上 manifest/gzip 一致。
- [x] 首屏、星系、当日电影、搜索和详情正常，无旧数据缓存证据。

**Go/No-Go：GO。Phase 37 完成。**
