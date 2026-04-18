# Phase 5.2.1 UMAP 参数调优 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.2.1**（frontmatter 项 **`p5-2-1-umap-tune`**）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — 相关 Issue：**DS1**（局部小星团过于聚合，建议通过 UMAP 调参改善）  
> **报告日期**: 2026-04-18  
> **实施分支**: `phase-5-2-1-umap-min-dist`（自 `main` 新开分支后开发与提交）

---

## 1. 摘要

Phase **5.2.1** 将 UMAP 的 **`min_dist`** 从原先的 **`0.1`** 提高到计划区间 **0.3–0.5** 内的 **`0.4`**，以增大嵌入空间中**簇内点间距**，缓解「局部小星团过于紧凑」的视觉与交互问题。实现上同时修改了 **`umap_projection.py`** 与 **`export_galaxy_json.py`** 的 **CLI 默认值**，保证 **`meta.umap_params.min_dist`** 与 **实际 `fit_transform` 所用超参**一致。随后在本机完成 **UMAP + 导出** 以及一次完整的 **`run_pipeline.py --through-phase-2`**（含重新嵌入），并更新 **`frontend/public/data/galaxy_data.json`**（及 **`.json.gz`**），**`validate_galaxy_json.py`** 校验通过。

---

## 2. 背景与目标（对照计划 5.2.1）

| 计划要求 | 实施要点 |
| --- | --- |
| 将 **`min_dist`** 增大至 **0.3–0.5** | 默认值统一设为 **`0.4`**（区间内折中，便于复现与文档化） |
| 重跑管线 | 先 **`umap_projection.py`**（及 **`export_galaxy_json.py`**）刷新坐标与前端 JSON；后执行 **`python scripts/run_pipeline.py --through-phase-2`** 全量重跑 Phase 1 + 2.1–2.5 |
| **`export_galaxy_json.py`** 与 UMAP 脚本 **meta 同步** | 两处 **`--min-dist`** 默认值均为 **`0.4`**；导出写入 **`meta.umap_params.min_dist`** |
| 可选 **`--w-genre`** | **未改**；计划列为可选，本次仅动 **`min_dist`**，避免与着色器 / Spec 中流派权重叙事纠缠 |

---

## 3. 变更文件与职责

| 路径 | 说明 |
| --- | --- |
| `scripts/feature_engineering/umap_projection.py` | **`--min-dist`** 默认 **`0.1` → `0.4`**；帮助文案注明 Phase 5.2.1 与 export meta 同步要求 |
| `scripts/export/export_galaxy_json.py` | **`--min-dist`** 默认 **`0.1` → `0.4`**；写入 **`meta.umap_params`** 与 UMAP 训练一致 |
| `frontend/public/data/galaxy_data.json` | 全量导出（约 **87 MB**），含新 **(x, y)** 与当日 **`meta.version`** |
| `frontend/public/data/galaxy_data.json.gz` | gzip 侧车产物（约 **30 MB**） |
| `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` | frontmatter：**`p5-2-1-umap-tune`** → **`completed`** |

**未纳入 Git 的本地产物**（由 `.gitignore` 排除，属预期行为）

- `data/output/cleaned.csv`、`text_embeddings.npy`、`genre_vectors.npy`、`language_vectors.npy`、`umap_xy.npy`、`umap_model.pkl` 等中间与模型文件；协作者需本地执行管线或从其他渠道同步这些文件。

---

## 4. 执行记录与校验数据

### 4.1 分支与提交策略

1. 在 **`main`** 上新建分支 **`phase-5-2-1-umap-min-dist`**。  
2. 首笔提交：脚本默认 **`min_dist=0.4`** + 当时导出的 **`galaxy_data.json` / `.gz`**（提交哈希以仓库为准，例如 **`c182200`**）。  
3. 用户请求全量管线后，再次运行 **`run_pipeline.py --through-phase-2`**，刷新嵌入与 UMAP；**本报告与计划 todo、最新 JSON 一并提交**。

### 4.2 全量管线命令（第二次）

在项目根目录、已激活 **`.venv`** 的前提下执行：

```text
python scripts/run_pipeline.py --through-phase-2
```

实际子进程包括（由 `run_pipeline.py` 串联）：

- **`text_embedding.py`** — **`--device cuda`**（默认），模型 **`paraphrase-multilingual-MiniLM-L12-v2`**，**59,014** 行  
- **`genre_encoding.py`**、**`language_encoding.py`**  
- **`umap_projection.py`**（无额外参数时使用新默认 **`min_dist=0.4`**）  
- **`export_galaxy_json.py`** — 默认 **`min_dist=0.4`** 写入 **meta**  
- **`validate_galaxy_json.py`** — 结构 / 条数校验  

**耗时量级**（本机一次实测）：全流程约 **5 分钟** 量级（CUDA 嵌入为主；UMAP 约 **3 分钟** 量级，随 CPU / 库版本波动）。

### 4.3 UMAP 日志摘录（`min_dist=0.4`，59,014 行）

与脚本标准输出一致的核心信息：

- **融合**：`text (59014, 384)`、`genre (59014, 19)`、`lang (59014, 103)`，拼接后 **`Combined shape: (59014, 506)`**  
- **输出范围**（示例）：**X** 约 **[-10.25, 26.18]**，**Y** 约 **[-13.62, 23.61]**（具体浮点随嵌入重算可能略有变化）  
- **写出**：**`umap_xy.npy`**（**float32**），**`umap_model.pkl`**（体积约 **280 MB** 量级）

### 4.4 导出与校验

- **`validate_galaxy_json.py`**：**`[Validate] OK — meta.count=59014, movies=59014`**  
- **`meta.umap_params`**（逻辑内容）：**`n_neighbors: 15`**，**`min_dist: 0.4`**，**`metric: cosine`**，**`random_state: 42`**  
- **`meta.version`**：按导出脚本为 **日期字符串**（例如 **`2026.04.18`**），与运行当日一致

---

## 5. 验收对照（计划原文）

| 验收项 | 结果 |
| --- | --- |
| 局部星团内部点间距增大 | **`min_dist`** 提高后 UMAP 拓扑按设计更「松散」；需在产品中 **肉眼对比调参前后截图**（计划要求）；本报告不替代视觉验收 |
| 宏观浏览时不同星团可辨识 | 同上，属 **体验 / 视觉** 验收 |
| **meta** 与实际 UMAP 一致 | **`min_dist=0.4`** 已在 **`meta.umap_params`** 与两脚本默认值对齐 |

---

## 6. 后续建议

1. **视觉回归**：在相同 **`zCurrent` / `zVisWindow`** 与相机参数下，对 **DS1** 做前后截图对比；若仍偏密，可在 **0.35–0.5** 内微调 **`min_dist`** 或再评估计划中的 **`--w-genre`**。  
2. **宇宙版本**：Tech Spec 约定更换 UMAP 超参应视为宇宙数据版本变更；若团队有独立 **data version** 字段习惯，可在后续提交中显式 bump。  
3. **CI / 协作者**：大文件 **`galaxy_data.json`** 已更新；**`data/output/`** 与 **`.pkl`** 未进库，新克隆仓库者需自行跑管线或从内部制品库获取特征与模型。  
4. **Phase 5.2.2**：768 维模型评估仍为 **pending**，可视 **5.2.1** 主观效果决定是否启动。

---

## 7. 参考链接（仓库内）

- 计划章节：**`.cursor/plans/phase_5_follow-up_plan_64727854.plan.md`** — **Phase 5.2.1** 小节  
- 技术规范：**`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`** — **2.1**（UMAP 超参写入 **meta**、`random_state=42` 等约定）
