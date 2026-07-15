# Phase 37.2 Final Membership Drift 实施报告

- 状态：完成
- 分支：`feat/p37.2-final-membership-drift`

## 交付

- monthly 先从 `df_pre` 计算一次阈值 map，再以同一对象生成唯一 final membership。
- pre-threshold drift 只记录；最终 membership 的 drift 仍为阻断 gate。
- meta 同时写入 `pre_threshold_drift` 与 `membership_drift`，仅后者可导致 `aborted_dim_drift`。
- drift 报告新增未知语言的逐代码数量、行数及最小/最大计数，便于判断是否需要 palette 迁移。
- final membership 显式断言非空、TMDB `id` 唯一；后续 UMAP fit count 从该 membership 派生。

## 验证

```text
python -m pytest scripts/tests/test_dim_drift_detector.py
6 passed

python -m pytest scripts/tests/test_monthly_refit_membership.py
4 passed
```

未执行 Kaggle 下载、UMAP refit、Supabase 写入或部署。