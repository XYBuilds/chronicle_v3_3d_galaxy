# Phase 38.4 — Nightly/Monthly OG Index KV 独立发布步骤报告

## 结论

Nightly 与 monthly 的计算和发布职责已经拆开。两个 Python 计算入口只负责 Supabase、export、validate 与 `today.json`；OG Index KV 改由 workflow 中独立且共用的 incremental CLI 步骤发布。

Scheduled workflow 固定使用 `--scope incremental`。只有手动 `workflow_dispatch` 且显式启用 `bootstrap_og_index` 时才追加 `--bootstrap-remote-audit`。同步失败会阻止后续常规 R2 upload/prune，不再把缺少 snapshot 或发布凭据当作成功部署。

## 交付

- 从 `scripts/cron/nightly_vote_refresh.py` 与 `scripts/cron/monthly_refit.py` 移除 KV import、调用和静默跳过警告。
- 移除 `scripts/cron/sync_og_index_kv.py` 的 Phase 34 daily/full legacy facade；CLI 保留受显式授权保护的 full disaster recovery。
- 在 `.github/workflows/nightly_vote_refresh.yml` 与 `.github/workflows/monthly_refit.yml` 增加独立 `Sync OG index KV incrementally` 步骤，并限制发布凭据作用域。
- 增加手动 bootstrap 输入，锁定 schedule 不会自动 audit、full sync 或 fallback。
- 更新 workflow contract 与 CLI 失败语义测试；Phase 38 canonical Plan 中 38.4 已标记为 `complete`。

## 验证

```text
python -m pytest scripts/tests/test_og_pipeline_phase34.py scripts/tests/test_sync_og_index_kv.py scripts/tests/test_og_index_snapshot_r2.py scripts/tests/test_og_index_state.py scripts/tests/test_og_index_kv.py
# 66 passed in 0.15s

git diff --check
# passed
```

未执行真实 KV/R2 mutation、Cloudflare 部署、monthly UMAP 或全量数据重建。生产 bootstrap 与 scheduled nightly 验收保留到 38.6 人工 Gate。