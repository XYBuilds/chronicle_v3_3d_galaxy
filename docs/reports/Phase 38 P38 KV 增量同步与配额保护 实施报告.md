# Phase 38 — P38 KV 增量同步与配额保护实施报告

## 结论

Phase 38.1–38.5 已完成，38.6 作为生产 Gate 的证据已满足验收。一次性 bootstrap、其后的真实 scheduled 验证、R2/Pages 发布与生产 smoke 均已完成；最终成功的 scheduled run 证明 nightly 按增量协议运行，未执行 61k 电影键全量覆盖。

本报告只记录已验证的运行摘要与只读状态，不包含 today 完整 payload、电影 hash 列表、bucket、token 或其他 secret。未经新授权，未执行额外 `workflow_dispatch` 或 rerun。

## 生产 Gate 范围与协议

- 38.6 验证 Phase 38.1–38.5 的上线边界：canonical projection/hash diff、KV/R2 适配器、独立 workflow 发布步骤、聚焦测试和运维文档。
- 提交顺序固定为：`diff → mutation gate → PUT/DELETE → GET read-back → committed snapshot`。
- 仅 GET 的 stale propagation 可作有限重试；PUT/DELETE 永不重放。任何一步失败均不推进 checkpoint，并阻断后续常规 R2/Pages 发布。

## 运行证据

### 首次授权 bootstrap：run 29523421915

- URL：<https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29523421915>
- 远端审计 61,531 个 movie keys；movie PUT=0、DELETE=0，仅涉及控制键。
- 紧随 mutation 的 read-back 读到 Workers KV 旧缓存，运行按 fail-closed 安全失败。
- 未提交 committed snapshot；后续 R2/Pages 被阻断。

### read-back 修复：PR #262

- 修复实现有限的 GET-only retry：延迟 1/2/4/8/16/32 秒，最多 7 次、累计最多 63 秒。
- PUT/DELETE 不重放；重试耗尽仍 fail closed，checkpoint 不可达。
- 测试结果：`72 passed, 22 subtests passed`；主 Agent 回归：`72 passed`。
- 实现 commit：`8a0b1a3`；merge commit：`1cff7505fbc5cb1aa17613e5e2f549bd33fb93e4`。

### 第二次且最后一次授权 bootstrap：run 29525922471

- URL：<https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29525922471>
- 由 `workflow_dispatch` 触发，head 为 `1cff7505fbc5cb1aa17613e5e2f549bd33fb93e4`。
- 61,531 个 movie keys 一致；movie PUT=0、DELETE=0，仅控制键变更；read-back 在有限重试内收敛。
- committed snapshot、常规 R2 upload/prune 和 Pages 均成功；公开 OG、today、data smoke 正常。
- 此手动 dispatch 只完成一次性 bootstrap，不替代其后的真实 scheduled nightly 验收。

### 首次后续 scheduled：run 29533138047

- URL：<https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29533138047>
- export、validate、diff 均成功；约 1 个 control PUT、0 DELETE，mutation gate 通过。
- PUT 成功后，唯一一键 bulk GET read-back 收到 HTTP 429；snapshot 未提交，后续 R2/Pages 被阻断；未自动重跑，movie keys 未改动。
- 已证实的直接事实仅为 bulk GET 的 HTTP 429。旧客户端未保留 response body、Cloudflare code 或 `Retry-After`，因此不能将该次 429 子类型认定为 code 10048。
- 解释分级：Cloudflare 免费层每日 100,000 reads，且两次 bootstrap 各约消耗 61,533 次审计读取，故当日读取额度耗尽是高概率解释；普通 1,200 requests/5min 瞬时限流较不可能，但不能绝对排除。上述为基于额度和运行量的推断，不是已证实根因。

### 最终真实 scheduled：run 29612057099

- URL：<https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29612057099>
- `event=schedule`、`attempt=1`、`conclusion=success`、head SHA=`b7d11caa308f1b768eaccc91f16612448410c5b7`。
- 增量 summary：`current=61531, previous=61531, movie_put=0, delete=0, unchanged=61531, control_put=2, total_put=2, read=2, read_back=2, bootstrap=false, audit_read=0, mismatch=0`。
- 增量同步、常规 R2 upload、frontend build、Pages deploy 均为成功状态。

## committed snapshot 只读核验

最终 checkpoint 的已核验元数据如下：

```text
schema_version=1
projection_version=og-index-v1
source_data_version=2026.07.17.daily.112
committed_at=2026-07-17T20:45:56.906235+00:00
movie_count=61531
movie_hash_count=61531
today_date=2026-07-17
today_movie_id=127560
meta_matches_source=true
```

## 最终生产 smoke

- `/data/today.json`：HTTP 200；date=`2026-07-17`、movie_id=`127560`。
- `/og/movie/127560.png` 与 `/og/today.png`：均返回预期的版本化 HTTP 302；跟随后的图片请求为 HTTP 200。
- `/movie/127560?gate=p38-6-29612057099`：页面有效，标题为 `The Railway Man (2013)`；电影 HTML 与 OG meta 可读。

## 配额结论、剩余增强与交付判断

- 最终真实 scheduled 的 `movie_put=0`、`delete=0`，证明该 nightly 没有 61k 电影键全量覆盖。此结论不等同于已查阅 Cloudflare dashboard；本 Gate 未以 dashboard 观测作为证据。
- 非阻塞后续增强（不属于本 TODO 已实现内容）：脱敏保留 Cloudflare error code/message/`Retry-After`；区分 stale、transient、quota exhausted；仅对瞬时 GET 限流按 `Retry-After` 作有限重试；为 bootstrap 增加 read budget。
- Gate 结论：38.6 满足验收条件。canonical Plan 已标记为 `complete`，可以执行标准交付。
