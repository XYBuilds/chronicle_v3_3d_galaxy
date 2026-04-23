# Phase 6.4 · P6.4 I1 最终重训 — 实施报告

> 对应 Plan A **P6.4**：在 I3 / I4 修复定稿后，用 **768d 多语 mpnet** 文本嵌入 + **DensMAP** + **`n_neighbors=100`** + **`min_dist=0.4`**（UMAP 走 `umap-learn` CPU，因 DensMAP 与 cuML 不兼容）对主数据集做一次 **完整 Phase 1 → 2.1–2.5** 重训，更新 `frontend/public/data/galaxy_data.json`（+ gzip），并令 `meta` 与重训参数一致。

## 1. 实现摘要

| 项目 | 说明 |
|------|------|
| **文本嵌入** | `sentence-transformers/paraphrase-multilingual-mpnet-base-v2`，输出 `(n, 768)` 的 L2 归一化 `text_embeddings.npy`（Phase 2.1）。 |
| **UMAP** | `--umap-backend umap --cpu`（或等价地强制 umap-learn），`--densmap --n-neighbors 100 --min-dist 0.4 --umap-metric cosine --umap-random-state 42`；融合向量维度 890 = 768 + 19 + 103（经各模态 `1/√d` 与权重缩放）。 |
| **导出** | `export_galaxy_json.py` 写入主数据路径；`meta.version` 按导出日 UTC 日期；`meta.umap_params` 与本次 UMAP/导出参数一致。 |
| **`run_pipeline.py` 增强** | 增加 `--model-id` / `--text-model` 别名，透传到 `text_embedding.py`；对 `export_galaxy_json` 传 `--embedding-model`（从模型 id 去掉 `sentence-transformers/` 前缀，与历史 `meta.embedding_model` 命名风格一致）。 |
| **校验** | `--through-phase-2` 结束后自动执行 `scripts/validate_galaxy_json.py`。 |

## 2. 备份与归档

| 路径 | 说明 |
|------|------|
| `data/output/umap_xy.npy` → `umap_xy.densmap384.npy` | 重训前旧 UMAP 坐标注释备份（`data/output/` 通常不入库）。 |
| `galaxy_data.json` / `.json.gz` → `galaxy_data.densmap384.json`（+ `.gz`） | 重训前主数据副本文档，便于 A/B 对比；体积与主数据同级，**未**纳入 git。 |

## 3. 实际执行环境

- 计划文档中建议在 **WSL** 的 `chronicle` 环境跑；本机若 **WSL 不可用**，可在 **Windows** 上用同一 `run_pipeline` 参数执行。
- 本机 **无可用 CUDA** 时：`--embedding-device cpu`（或 `auto` 回落到 CPU）完成 mpnet 编码；UMAP 本身为 CPU DensMAP。

**示例命令**（与计划一致，可按环境替换 embedding device）：

```bash
python scripts/run_pipeline.py --through-phase-2 \
  --text-model sentence-transformers/paraphrase-multilingual-mpnet-base-v2 \
  --umap-backend umap --densmap --n-neighbors 100 --min-dist 0.4 \
  --cpu --embedding-device cpu
```

## 4. 本次产出元数据（验收快照）

| 字段 | 值（示例，以仓库内 `galaxy_data.json` 为准） |
|------|-----------------------------------------------|
| `meta.embedding_model` | `paraphrase-multilingual-mpnet-base-v2` |
| `meta.umap_params` | `n_neighbors: 100`, `min_dist: 0.4`, `metric: cosine`, `random_state: 42`, `densmap: true` |
| `meta.count` / `movies.length` | 与清洗后行数一致（如 59,014） |
| `meta.version` | 导出日 `YYYY.MM.DD`（UTC 日期，见文件内 `generated_at`） |

## 5. 验收

- [x] 完整管线无报错，`validate_galaxy_json.py` 通过。  
- [x] 前端主数据 `galaxy_data.json` / `galaxy_data.json.gz` 已回写。  
- [x] `meta` 中 embedding 与 UMAP 参数与真实重训一致。  
- [ ] 后续 **P6.5**：在最终坐标上再跑 I3 / I4 回归与 Plan B 交接（见仓库内 `.cursor/plans/phase_6_i1_i3_i4_adfb5e1b.plan.md`）。  

## 6. 相关

- 计划内 **P6.4** 条目：`.cursor/plans/phase_6_i1_i3_i4_adfb5e1b.plan.md`（YAML `p6-4-i1-final-retrain` 已标 **completed**）。  
- 代码入口：`scripts/run_pipeline.py`；分阶段脚本：`feature_engineering/text_embedding.py`, `umap_projection.py`, `export/export_galaxy_json.py`。
