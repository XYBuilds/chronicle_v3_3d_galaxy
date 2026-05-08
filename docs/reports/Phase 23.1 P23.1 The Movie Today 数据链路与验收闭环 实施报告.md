# Phase 23.1 · P23.1 The Movie Today 数据链路与验收闭环 — 实施报告

> 对应 [Phase 23 计划](../../.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md) 中 **P23.1**：  
> nightly/monthly 生成 `today.json`，R2/manifest 分发 `today_url`，客户端读取并在异常时降级到 Top-1000 fallback。  
> 本报告汇总本次交付的**最终决策**与**最终操作**，并记录验收状态与边界条件。  
> **会话证据**： [P23.1 验收闭环](0efb2503-3300-4009-af81-d8829d0d819a)  
> **报告日期**：2026-05-08。

---

## 1. 目标与最终决策

### 1.1 数据来源与契约

| 议题 | 最终决策 |
|---|---|
| today 数据文件 | 新增 `frontend/public/data/today.json`，与 `galaxy_data` 解耦缓存。 |
| today 契约 | `{ date, movie_id, selected_at, selection_strategy, min_vote_count }`。 |
| 选片策略 | `deterministic_by_utc_date`（UTC 日期 + SHA256 + 稳定排序池），保证同日确定性。 |
| 筛选阈值 | `min_vote_count` 默认 `0`，支持参数化扩展（CLI / ENV）。 |

### 1.2 服务端与分发策略

| 议题 | 最终决策 |
|---|---|
| 选片执行时机 | 在 nightly/monthly 的 `export + validate` 成功后生成 `today.json`。 |
| R2 上传 | `upload_galaxy_r2.py` 同步上传 `today.json`。 |
| manifest 扩展 | `galaxy_assets_manifest.json` 新增可选 `today_url`，并写入 `r2_object_keys.today`。 |
| today 缓存头 | `today.json` 使用短 TTL（`max-age=3600, must-revalidate`）。 |

### 1.3 客户端加载与容错

| 议题 | 最终决策 |
|---|---|
| 加载优先级 | `VITE_TODAY_JSON_URL` > manifest `today_url` > 本地 `/data/today.json`。 |
| 失败处理 | 任何 today 异常均不阻断应用，统一 fallback 到 vote_count Top-1000 随机一部。 |
| 判定触发 | 网络失败 / JSON shape 错误 / `movie_id` 不在 `movies[]` / `date` 陈旧（与 UTC 相差 > 1 天）。 |
| 状态暴露 | `galaxyDataStore` 新增 `todayMovieId`、`todayPayload`、`todayUsedFallback`。 |

### 1.4 验收口径（最终）

| 议题 | 最终决策 |
|---|---|
| 本地与分支验收 | 视为通过（脚本、测试、fallback 场景已闭环）。 |
| 生产域名验收 | 需在 `main` 触发 workflow 后再勾选（非 `main` run 不作为 production 证据）。 |
| 结论表达 | “功能通过，production manifest 以主分支 run 为准” 作为最终口径。 |

---

## 2. 最终操作清单（代码与流程）

## 2.1 代码改动（实现）

| 类型 | 路径 | 最终操作 |
|---|---|---|
| 新增脚本 | `scripts/cron/pick_movie_today.py` | 实现 UTC 确定性选片、契约写出、`--date-utc`、`--min-vote-count`。 |
| cron 包化 | `scripts/cron/__init__.py` | 允许 `from cron.pick_movie_today import ...`。 |
| nightly 集成 | `scripts/cron/nightly_vote_refresh.py` | `export+validate` 后调用 `write_today_json_after_galaxy_export`。 |
| monthly 集成 | `scripts/cron/monthly_refit.py` | 与 nightly 相同，在导出链路后写 `today.json`。 |
| R2 上传 | `scripts/cron/upload_galaxy_r2.py` | 上传 `today.json`，manifest 增加 `today_url`。 |
| manifest 解析 | `frontend/src/lib/galaxyAssetUrls.ts` | `GalaxyAssetsManifest.today_url?` + `resolveTodayJsonUrl()`。 |
| today 加载 | `frontend/src/data/loadToday.ts` | 契约解析、陈旧判定、fallback 策略。 |
| store 扩展 | `frontend/src/store/galaxyDataStore.ts` | readiness 阶段解析 today 并写入 today 状态字段。 |
| 类型与缓存 | `frontend/src/vite-env.d.ts`、`frontend/public/_headers` | 新增 `VITE_TODAY_JSON_URL`；`/data/today.json` 短 TTL。 |
| CI artifact | `.github/workflows/nightly_vote_refresh.yml`、`.github/workflows/monthly_refit.yml` | artifact 路径加入 `frontend/public/data/today.json`。 |
| 测试 | `frontend/src/data/loadToday.spec.ts`、`frontend/src/lib/galaxyAssetUrls.test.ts` | 覆盖正常与 fallback 场景。 |
| 验收文档 | `docs/guides/P23.1 The Movie Today 验收指南.md` | 标准化验收步骤、DoD 与勾选清单。 |

## 2.2 操作执行（验收期）

| 步骤 | 最终操作 |
|---|---|
| 自动化校验 | 执行 `python -m py_compile ...`、`vitest`（`loadToday.spec.ts` + `galaxyAssetUrls.test.ts`）。 |
| 选片一致性验证 | 执行多次 `pick_movie_today.py --date-utc` 校验同日一致、跨日变化。 |
| 契约验证 | 断言 `today.json` 字段完整、`movie_id` 存在于 `galaxy_data.movies[]`。 |
| fallback 验证 | 覆盖 A/B/C/D 四类失败场景并确认 `fallback random Top-1000` 日志。 |
| CI 日志核查 | 从 workflow 日志确认 `today.json` 生成、上传、artifact 路径包含。 |
| 线上差异定位 | 确认 production manifest 未含 `today_url` 的原因是 workflow 非 `main` 分支执行。 |

---

## 3. 验收结果与最终状态

## 3.1 已通过

- 本地代码与测试：通过。
- `today.json` 契约：通过。
- 同日确定性 / 跨日变化：通过。
- `--min-vote-count` 参数：通过。
- fallback 场景 A/B/C/D：通过。
- 分支 CI 链路（生成、上传、artifact）：通过。

## 3.2 未闭环（按环境）

- production 域名上的 `manifest.today_url`：**待主分支运行后复核**。  
  当前结论为“非 main run 不作为 production 产物证据”。

---

## 4. 风险与回滚口径

| 风险 | 影响 | 缓解/回滚 |
|---|---|---|
| production 与分支产物混淆 | 误判 `today_url` 缺失为代码 bug | 以 `main` workflow run 与其 `github_run_id` 对齐核验。 |
| today 读取失败 | 首屏 today 体验不稳定 | 客户端固定 fallback，不中断主流程。 |
| 高缓存导致陈旧 | 看到旧 today | short TTL + query version（`?v=`）降低陈旧窗口。 |

---

## 5. 最终结论

P23.1 的实现与分支验收已完成闭环：  
数据生产、R2 分发、manifest 扩展、客户端加载与 fallback 均按计划落地，且自动化与手动验收均已覆盖关键路径。

剩余唯一待勾项是 **production/main 环境复核 `today_url`**。  
当 `main` 分支触发同流程并在线上 manifest 看到 `today_url` 可访问后，可判定 **P23.1 全量验收通过**。

---

*文档结束。*
