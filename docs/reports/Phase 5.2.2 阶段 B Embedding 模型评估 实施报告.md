# Phase 5.2.2 阶段 B Embedding 模型评估 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.2.2**（frontmatter 项 **`p5-2-2-model-b`**，状态 **completed**）  
> **依据**: 计划中「768 维模型可能带来更好的语义分离，但需要完整重跑 embedding + UMAP；作为评估项记录」  
> **报告日期**: 2026-04-18  
> **实施分支**: `phase-5-2-2-embedding-model-eval`（自仓库主线新开分支后迭代提交）

---

## 1. 摘要

本阶段在**不改动线上管线默认模型**的前提下，新增独立脚本 **`scripts/feature_engineering/embedding_model_eval.py`**：对同一份清洗表 **`cleaned.csv`** 中的影片，按与 **`text_embedding.py`** 一致的拼接规则生成文本，分别用 **Model A（384d，`paraphrase-multilingual-MiniLM-L12-v2`）** 与 **Model B（768d，`paraphrase-multilingual-mpnet-base-v2`）** 计算 **L2 归一化**句向量，再基于 **TMDB 流派字段的第一项（primary genre）** 作为粗标签，输出三类 **流派对齐** 指标及 JSON 报告。  

已完成 **20 行子样本 smoke** 与 **全量 59014 行 CUDA 跑数**；全量数值结论见 **第 6 节** 与仓库内 **`docs/reports/Phase_5.2.2_embedding_model_eval_full.json`**。

---

## 2. 背景与目标（对照计划 5.2.2）

| 计划表述 | 本阶段落实 |
| --- | --- |
| 768 维模型语义分离需评估 | 用 **与 primary genre 的几何关系** 量化对比 A/B（非端到端 UMAP 可视化） |
| 完整重跑 embedding + UMAP 成本高 | **仅评估**：不修改 `text_embedding.py` 默认模型、不重跑 UMAP；是否切换 Model B 由产品/管线后续决策 |
| 作为评估项记录 | 产出 **可版本化 JSON** + 本 **实施报告**；计划 §5.2.2 与 todo **`p5-2-2-model-b`** 标记完成 |

---

## 3. 交付物清单

| 类型 | 路径 | 说明 |
| --- | --- | --- |
| 脚本 | `scripts/feature_engineering/embedding_model_eval.py` | CLI：`--input`、`--output-json`、`--device`、`--max-rows`、`--n-pairs`、`--knn-k`、`--silhouette-sample`、`--skip-model-b` 等 |
| 子样本结果 | `docs/reports/Phase_5.2.2_embedding_model_eval_subsample20.json` | `data/subsample/tmdb2025_random20.csv`，**smoke** |
| 全量结果 | `docs/reports/Phase_5.2.2_embedding_model_eval_full.json` | `data/output/cleaned.csv`，**59014** 行，CUDA |
| 计划同步 | `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` | §5.2.2「已交付」说明 + frontmatter **`p5-2-2-model-b`** → **completed** |
| 本报告 | `docs/reports/Phase 5.2.2 阶段 B Embedding 模型评估 实施报告.md` | 操作记录、指标定义、复现命令、结论 |

**Git 提交（与本阶段强相关，按时间顺序）**

- `feat(pipeline): Phase 5.2.2 embedding Model A vs B eval script and sample report` — 引入评估脚本、子样本 JSON、计划 todo/§5.2.2 初稿  
- `docs(reports): Phase 5.2.2 full embedding eval on cleaned.csv (CUDA)` — 入库全量 `Phase_5.2.2_embedding_model_eval_full.json`

---

## 4. 技术说明

### 4.1 文本与模型（与仓库约定一致）

- **输入文本**：复用 `text_embedding.build_embedding_text`（`Tagline` + `Overview` 或仅 `Overview`；**头部保留**、`max_chars` 默认 3000）。  
- **Model A**：`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`，**384** 维。  
- **Model B**：`sentence-transformers/paraphrase-multilingual-mpnet-base-v2`，**768** 维（见 `.cursor/rules/python-pipeline.mdc`）。  
- **归一化**：行向量 **L2 归一化**后再算 cosine（等价于点积）。

### 4.2 标签与过滤

- 仅保留 **`genres` 可解析出至少一个流派** 且 **`overview` 非空** 的行。  
- **Primary genre**：`genre_encoding.parse_genre_list` 后的 **第一个** 流派（与 TMDB API 顺序一致，与管线 rank-weighted genre 的「主标签」语义对齐）。  
- **`--max-rows > 0`**：按主流派 **分层封顶** 再随机截断，便于笔记本快速试验。

### 4.3 指标定义

1. **`separation_margin`**（越高越好）  
   - 随机 **同主流派** 样本对的平均 **cosine** 减去随机 **不同主流派** 样本对的平均 cosine。  
   - 直觉：同流派文本向量更「近」、跨流派更「远」，则 margin 更大。

2. **`knn_purity_mean`**（越高越好）  
   - 对每个样本，在 embedding 空间用 **cosine** 做 **kNN**（默认 **k=30**，排除自身）；邻居中与该样本 **primary genre 相同** 的比例，对全体取平均。

3. **`silhouette_cosine`**  
   - `sklearn.metrics.silhouette_score(..., metric="cosine")`；全量时若行数大于 **`--silhouette-sample`（默认 8000）** 则先随机子采样再算。  
   - 粗标签仅为 **单一流派首项**，且文本语义多维，**出现负值并不罕见**，宜与 margin / kNN 联合解读。

### 4.4 运行环境与 CUDA 说明（Windows）

- 仓库 **`.venv`** 内为 **`torch …+cu128`** 时，`torch.cuda.is_available()` 为 **True**，`--device cuda` 可用。  
- 若系统默认 **`python`** 指向 **CPU 版** PyTorch（本机曾出现 `Python314` 全局环境无 CUDA），需显式使用：

```powershell
.venv\Scripts\python.exe scripts/feature_engineering/embedding_model_eval.py --input data/output/cleaned.csv --device cuda --output-json docs/reports/Phase_5.2.2_embedding_model_eval_full.json
```

---

## 5. 执行过程摘要

1. **新开 Git 分支** `phase-5-2-2-embedding-model-eval`，在分支上开发。  
2. **实现** `embedding_model_eval.py`：修复 `numpy` 随机选两标签时的标量转换问题；移除未使用依赖/参数。  
3. **Smoke**：`tmdb2025_random20.csv` + `--max-rows 20`，验证双模型与 JSON 写出。  
4. **全量**：`cleaned.csv`（**59014** 行，**19** 个主流派），**RTX 3070 / CUDA**，双模型各约 **923** 个 batch（batch 64），总 wall-clock 约 **5.8 分钟**（含指标计算）。

---

## 6. 全量结果（`Phase_5.2.2_embedding_model_eval_full.json`）

| 指标 | Model A（384d MiniLM） | Model B（768d mpnet） |
| --- | ---: | ---: |
| `separation_margin` | 0.0533 | **0.0561** |
| `intra_cosine_mean` | 0.2620 | 0.3126 |
| `inter_cosine_mean` | 0.2087 | 0.2565 |
| `knn_purity_mean`（k=30） | 0.2835 | **0.3045** |
| `silhouette_cosine` | **-0.0434** | -0.0468 |

**解读（简要）**

- **Model B** 在 **margin** 与 **kNN purity** 上略优于 **Model A**，与「768d 语义更丰富、与同主标签邻居更一致」的直觉一致。  
- **Silhouette** 二者均为负且 B 略低：在 **仅用 primary genre** 作聚类标签** 时，文本 embedding 空间未必呈凸可分簇；该指标更多作 **横向对比参考**，不宜单独作为上线判据。

---

## 7. 结论与后续建议

1. **本阶段目标已达成**：可重复脚本 + 子样本与全量 **JSON 证据链** + 计划 todo **completed**。  
2. **是否切换生产管线至 Model B**：需权衡 **显存/耗时/磁盘**（768d 向量与中间产物更大）及 **全量重跑 Phase 2 + UMAP + export** 与前端数据发布流程；若决定切换，应同步修改 **`text_embedding.py`**（及 `export_galaxy_json.py` 等处若硬编码模型名）、并按 `python-pipeline.mdc` 重跑管线。  
3. **可选增强**（非本阶段范围）：多标签流派指标、与 **融合后向量** 的一致性评估、固定随机种子下的置信区间等。

---

## 8. 验收对照

| 计划验收意图 | 结果 |
| --- | --- |
| 记录 768d 相对 384d 的语义/流派对齐差异 | 已用全量 JSON + 本报告记录 |
| 可选、不强制改管线 | 未改默认 `text_embedding.py` / 未重跑 UMAP |

---

## 9. 参考命令速查

```powershell
# 全量 + CUDA + 写入 docs/reports（推荐 .venv 解释器）
.venv\Scripts\python.exe scripts/feature_engineering/embedding_model_eval.py --input data/output/cleaned.csv --device cuda --output-json docs/reports/Phase_5.2.2_embedding_model_eval_full.json

# 仅 Model A smoke
.venv\Scripts\python.exe scripts/feature_engineering/embedding_model_eval.py --input data/subsample/tmdb2025_random20.csv --max-rows 20 --device cpu --skip-model-b --output-json docs/reports/Phase_5.2.2_embedding_model_eval_subsample20_A_only.json
```

---

*本报告由 Phase 5.2.2 实施过程整理，与仓库内 JSON 及脚本保持一致；若复现实验，请以当前 `embedding_model_eval.py` 与依赖版本为准。*
