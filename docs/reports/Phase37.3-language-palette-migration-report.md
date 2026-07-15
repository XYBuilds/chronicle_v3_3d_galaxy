# Phase 37.3 — Language Palette Migration Report

## 结论

最新 Kaggle 快照的最终 membership 仍包含未知语言 `rm`（TMDB ID `59088`）。其余 55 个未知语言代码仅存在于阈值过滤前的长尾语料，因此不进入生产向量空间。

因此将语言 palette 从冻结的 v1 以追加方式迁移为 v2：保留既有列顺序，仅新增 `rm`，最终语言向量宽度为 104。

## 重建产物

隔离重建目录：`data/runs/p37_3_language_palette_v2/`

- `cleaned.csv`：61,460 行
- `text_embeddings.npy`：`(61460, 384)`
- `genre_vectors.npy`：`(61460, 19)`
- `language_vectors.npy`：`(61460, 104)`
- `monthly_refit_embedding_bundle.zip`：114.9 MiB，SHA-256 前缀 `f3f92354be79590e`

打包校验确认四件套行数一致、所有矩阵均为有限数值且逐行 L2 范数为 1；未修改文本和 genre 向量维度或 feature fusion 参数。

## 验证

```text
python -m pytest scripts/tests/test_audit_final_membership_languages.py scripts/tests/test_dim_drift_detector.py scripts/tests/test_monthly_refit_membership.py scripts/tests/test_language_palette_v2_bundle.py
# 16 passed

python scripts/tools/pack_monthly_embedding_bundle.py --cache-dir "data\\runs\\p37_3_language_palette_v2" --out "data\\runs\\p37_3_language_palette_v2\\monthly_refit_embedding_bundle.zip"
# active_lang=v2:104；四件套契约通过
```

未执行 UMAP、Supabase 写入、R2 上传、部署或生产 workflow dispatch。