# Phase 37.4 — 本地验证与 SSOT 对齐报告

## 结论

monthly 的维度阻断边界已由 fixture dry-run 覆盖：先记录 pre-threshold 观测，再以唯一 `thresholds_json` 过滤出 final membership；只有后者可以阻断。nightly fixture dry-run 只读取 active threshold，确认不会写 Supabase、插入 pending 或启动导出。

## 交付

- 新增 `scripts/tests/test_cron_fixture_dry_runs.py`：覆盖 monthly / nightly 的同型 fixture dry-run。
- 更新 Tech Spec、Data Pipeline 及 P18.4/P18.5 指南，明确只读 preflight、final-membership drift SSOT、阈值单一数据流与无写入 dry-run 操作。
- Phase 37 计划中的 37.4 已标记为 `complete`。

## 验证

```text
python -m pytest scripts/tests/test_cron_fixture_dry_runs.py scripts/tests/test_monthly_refit_membership.py scripts/tests/test_dim_drift_detector.py scripts/tests/test_check_supabase_health.py scripts/tests/test_language_palette_v2_bundle.py scripts/tests/test_audit_final_membership_languages.py
# 26 passed
```

未执行 Supabase 写入、UMAP、R2/KV 上传、Cloudflare 部署或生产 workflow dispatch；这些动作归 37.5 的人工验收范围。
