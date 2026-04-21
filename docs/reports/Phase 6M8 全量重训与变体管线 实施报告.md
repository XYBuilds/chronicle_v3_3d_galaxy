# Phase 6M8 — 全量重训与 768d 变体管线 实施报告

## 文档信息

| 项目 | 内容 |
| --- | --- |
| 对应计划 | [`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) |
| 里程碑 | **M8（§8.3.9）** — 全量约 59K 行重训、产物备份与前端数据更新；并落实 **768d / n_neighbors=100 / 无 DensMAP / cuML UMAP** 的**另存变体**与 WSL 代理联调 |
| 计划 Todo | **`m8-full-retrain`** → **`completed`**（见该 plan 顶部 `todos`） |
| 开发分支 | **`phase-6-m8-full-retrain`** |
| Git 提交（参考） | **`1cdcc32`** — M8 全量脚本与 `galaxy_data.json` 刷新；**`f7966a0`** — `text_embedding --model-id`、WSL Clash 代理雏形；**`75111ae`** — 默认路由网关代理、`resume` 与变体脚本；**`ba971e2`** — `galaxy_data_gpu768_n100.json(.gz)` |
| 报告日期 | 2026-04-21 |

---

## 本次 M8 做了什么（摘要）

1. **计划内全量重训（DensMAP + `--n-neighbors 100`）**  
   在 WSL `chronicle` 环境对 **`data/raw/TMDB_all_movies.csv`** 清洗结果 **59,014 行** 跑通 **Phase 2.1–2.5**；Phase 2.1 使用管线默认 **`paraphrase-multilingual-MiniLM-L12-v2`（384d）**、**CUDA**。  
   Phase 2.4 在 **`--umap-backend cuml` 且 `--densmap`** 时，按既有实现 **RAPIDS cuML GPU UMAP 不支持 DensMAP**，**自动回退为 `umap-learn`（CPU）** 完成拟合；**`meta.umap_params.densmap`** 与导出仍为 **true**（与 Phase 2.4 实际算法路径一致已在代码注释中说明）。  
   备份：`data/output/umap_xy.npy` → **`data/output/umap_xy.umap-learn.npy`**（按计划命名保留「重训前」坐标快照）。  
   主前端数据：**`frontend/public/data/galaxy_data.json`**（及 `.gz`）已更新并通过 **`scripts/validate_galaxy_json.py`**。

2. **可复现脚本**  
   - **`scripts/env/run_m8_full_retrain_wsl.sh`**：`run_pipeline.py --through-phase-2 --umap-backend cuml --densmap --n-neighbors 100 --min-dist 0.4`；启动前 **`source scripts/env/wsl_proxy_clash.sh`**（便于 Hugging Face 下载）。  
   - **`scripts/env/run_variant_gpu768_n100_cuml.sh`**：**768d mpnet**、**n_neighbors=100**、**无 DensMAP**、**cuML GPU UMAP**；产物目录 **`data/output/variant_gpu768_n100/`**，另存 **`frontend/public/data/galaxy_data_gpu768_n100.json(.gz)`**；若已存在 **`text_embeddings.npy`** 则**跳过嵌入**避免重复拉模。  
   - **`scripts/env/resume_variant_gpu768_from_embeddings.sh`**：在 **`text_embeddings.npy`** 已就绪时，从 **genre / language / UMAP / export** 续跑。

3. **WSL 与 Clash 代理**  
   新增并迭代 **`scripts/env/wsl_proxy_clash.sh`**：在 WSL2 内自动设置 **`http_proxy`/`https_proxy`**，优先使用 **`ip route` 默认网关**（如 `172.20.x.1`）访问 Windows 上 Clash **Mixed 端口**（默认 **7897**）；**勿用** `resolv.conf` 中 **`10.255.255.254`** 仅作 DNS 的地址直连代理端口（会 **Connection refused**）。需 Clash **Allow LAN**。

4. **管线能力扩展**  
   **`scripts/feature_engineering/text_embedding.py`** 增加 **`--model-id`**，按 **`SentenceTransformer.get_sentence_embedding_dimension()`** 校验输出维度，以支持 **mpnet 768d** 全量嵌入。

---

## 交付清单（与仓库路径）

| 序号 | 交付项 | 说明 |
| --- | --- | --- |
| 1 | **`scripts/env/run_m8_full_retrain_wsl.sh`** | M8 计划命令封装；含 WSL 代理 `source`。 |
| 2 | **`scripts/env/run_variant_gpu768_n100_cuml.sh`** | 768d + n100 + 无 DensMAP + cuML；另存 JSON；可跳过已有嵌入。 |
| 3 | **`scripts/env/resume_variant_gpu768_from_embeddings.sh`** | 断点续跑（自 genre 起）。 |
| 4 | **`scripts/env/wsl_proxy_clash.sh`** | WSL → Windows Clash；`CHRONICLE_WIN_HOST` / `CHRONICLE_CLASH_PORT` / `CHRONICLE_WSL_PROXY` 可覆盖。 |
| 5 | **`scripts/feature_engineering/text_embedding.py`** | **`--model-id`**（默认仍为 MiniLM）。 |
| 6 | **`scripts/feature_engineering/umap_projection.py`** | **`--text-input`** 帮助文案改为 **(n, d_text)**。 |
| 7 | **`frontend/public/data/galaxy_data.json(.gz)`** | 全量 **384d + DensMAP（UMAP 实际 CPU umap-learn）** 导出后的主数据（提交见 **`1cdcc32`** 等）。 |
| 8 | **`frontend/public/data/galaxy_data_gpu768_n100.json(.gz)`** | **768d mpnet + cuML UMAP + n100、无 DensMAP** 变体（**`ba971e2`**）。 |
| 9 | **`data/output/variant_gpu768_n100/*`** | 变体 **npy**（`text_embeddings.npy`、`genre_vectors.npy`、`language_vectors.npy`、`umap_xy.npy`、`umap_model.pkl` 等）；体积大，**默认不强制提交 Git**，与主 **`data/output`** 策略一致。 |

---

## 指标与范围（便于对照）

| 项目 | 主路径（`galaxy_data.json`） | 变体（`galaxy_data_gpu768_n100.json`） |
| --- | --- | --- |
| 嵌入模型 | MiniLM **384d** | mpnet **768d** |
| Phase 2.4 UMAP | **`umap-learn`（CPU）**（因 cuml+DensMAP 不支持而回退） | **cuML（GPU）** |
| DensMAP | **是**（拟合在 CPU umap-learn） | **否** |
| `n_neighbors` | **100** | **100** |
| `min_dist` | **0.4** | **0.4** |
| 融合维度（示意） | 384+19+103 → 506 | 768+19+103 → **890** |
| UMAP 坐标范围（日志） | X ≈ [-15.05, 27.09]，Y ≈ [-17.08, 20.06] | X ≈ [-15.81, 15.74]，Y ≈ [-15.95, 16.74] |

*说明：主路径与变体在 **嵌入维度、UMAP 后端、是否 DensMAP** 上**未做单一变量控制**，下节「测试结论」为**肉眼与工程判断**，非严格 A/B。*

---

## 测试结论（验收主观项）

| 结论项 | 说明 |
| --- | --- |
| **DensMAP 效果** | **显著**：在同类语义嵌入前提下，开启 DensMAP（即便当前全量路径在 cuml+DensMAP 组合下回退到 **CPU umap-learn** 实现 DensMAP），整体投影在**密度结构、簇间留白与拥挤区域的可读性**上，相对 **未开 DensMAP 的 cuML 变体** 更容易形成「疏密分明」的观感动机；适合作为后续 I1 肉眼评估与调参的基线之一。 |
| **`n_neighbors`（如 100）效果** | **不明显 / 尚难下结论**：当前对比中 **同时混入了嵌入模型（384 vs 768）、UMAP 实现路径（CPU+DensMAP vs GPU 无 DensMAP）** 等变量，**未固定其它条件单独扫 `n_neighbors`**，因此 **无法将布局差异归因于邻居数**；若需结论，建议后续在 **固定 backend、固定 densmap、固定维度** 下做 **n_neighbors 网格** 并配合定量指标（如 trustworthiness、KL、或业务侧拾取/检索任务）。 |

---

## 已知限制与后续建议

1. **「cuml + DensMAP」**：上游 cuML GPU UMAP **不支持 DensMAP**；若坚持 **GPU 上 DensMAP**，需跟踪 RAPIDS 版本能力或接受 **CPU Phase 2.4**（当前代码策略）。  
2. **主数据仍为 384d MiniLM**：若要以 **768d** 作为**唯一**线上主 JSON，需在 **`run_pipeline.py`** 中透传 **`--model-id`** 或约定环境变量，并安排一次**全链路重训与前端 meta 对齐**。  
3. **WSL 代理**：若网关或 Clash 端口变更，使用 **`CHRONICLE_WIN_HOST`** / **`CHRONICLE_CLASH_PORT`**；公司网络策略变化时复查 **Allow LAN**。

---

## 复现命令（摘录）

**M8 主路径（计划原文）：**（WSL 已 `conda activate chronicle` 且已 `source` 代理脚本或依赖 `run_m8` 脚本内 `source`）

```bash
bash scripts/env/run_m8_full_retrain_wsl.sh
```

**768d 变体（另存）：**

```bash
bash scripts/env/run_variant_gpu768_n100_cuml.sh
```

**仅续跑（已有 `variant_gpu768_n100/text_embeddings.npy`）：**

```bash
bash scripts/env/resume_variant_gpu768_from_embeddings.sh
```

---

*本报告对应 Phase 6 §8 计划中 **M8** 实施与变体交付；**I1 完整视觉复测与定稿**仍属独立任务 / plan 接力点。*
