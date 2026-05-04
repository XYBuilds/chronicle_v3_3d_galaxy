# Phase 18.1（P18.1）— Canonical full rebuild 与 GHA core benchmark — 实施报告

> **日期**：2026-05-04  
> **范围**：**P18.1a** 本地 canonical 全链（隔离 `data/runs/`）与 **P18.1b** GitHub Actions `ubuntu-24.04` 上 core refit benchmark（fusion → DensMAP UMAP → Procrustes；可选 export）；**不含** P18.2 Supabase、P18.3 正式 `align_to_reference` helper、P18.4/5 cron 实现。  
> **计划来源**：`.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md` §「P18.1 Canonical full rebuild + GHA core benchmark」  
> **Git 分支**：`p18.1-canonical-full-rebuild`  
> **材料来源**：会话记录 [P18.1 session](16e25459-32d5-4d46-b03c-4fa0c2602154)（Cursor agent transcript `16e25459-32d5-4d46-b03c-4fa0c2602154.jsonl`）；本地 canonical 日志 `data/runs/p18_1_full_rebuild_20260504_1617/benchmark_log.txt`；GHA Artifact 解压目录 `data/runs/p18-1b-benchmark-25322797674/benchmark_report.json`（runner 上工作路径为 `data/runs/p18_canonical_ci`）。

---

## 1. 里程碑目标与状态

| 子项 | 目标 | 状态 |
|------|------|------|
| **P18.1a** | 从 `data/raw/TMDB_all_movies.csv` 全链重跑到隔离目录；参数与 production `meta` 一致；`validate_galaxy_json` 通过；与当前 `frontend/public/data/galaxy_data.json` 对比摘要 | **已完成**（以 `p18_1_full_rebuild_20260504_1617` 为最终验收 run） |
| **P18.1b** | 用 canonical 五文件在 **GitHub-hosted `ubuntu-24.04`** 上跑 core 路径，得到墙钟与峰值内存，供 P18.5 `timeout-minutes` / monthly hosted / local fallback 决策 | **已完成**（Artifact 目录 `p18-1b-benchmark-25322797674`） |
| **书面归档** | 计划要求独立 Phase 18.1 实施报告 | **本文档**（文件名与 `docs/reports/` 下其他 Phase「`Phase X.Y PX.Y … 实施报告.md`」风格对齐；与计划原文文件名略有前缀差异，见 §5） |

**明确未在 P18.1 内强制收口的事项**

- 是否将某次 canonical **覆盖**同步到 `data/output/` 与 `frontend/public/data/`：计划为验收后**人工决策**。会话中曾对 **`p18_1_full_rebuild_20260504_1327`** 做过拷入 `frontend/public/data` 与 `data/output/`；后续 **`…1617`** 为另一条全链成功时间线，**以业务选定的 run 为准**，避免混用。  
- **P18.3** 计划中的 `align_to_reference`（按 id 子集 + `scipy.linalg.orthogonal_procrustes`）与当前 **P18.1b** 脚本内 **`scipy.spatial.procrustes` 全局相似对齐**：**未强制逐行等同**；P18.5 落地后宜复用 P18.3 helper 并视需要收敛 benchmark 实现。

---

## 2. 分支与仓库操作

| 决策 | 说明 |
|------|------|
| **独立分支** | 按用户要求在 P18.1 **新开分支**实施；分支名 **`p18.1-canonical-full-rebuild`**。 |
| **`data/runs/` 不进版本库** | `.gitignore` 增加 `data/runs/`，避免 canonical 与 GHA 解压产物（数百 MB 级）误提交。 |
| **默认不写 `umap_model.pkl`** | 与 Phase 18「不依赖 UMAP pkl」一致：`scripts/feature_engineering/umap_projection.py` 默认只写 `umap_xy.npy`；需模型时显式 **`--save-model`**；`scripts/run_pipeline.py` 为 **`--save-umap-model`**；`phase18_canonical_full_rebuild.py` 为 **`--save-umap-model`**。会话中相关整合提交记为 **`db96d29`** 一带。 |
| **初始 P18.1a 编排脚本** | 首版引入 `scripts/experiments/phase18_canonical_full_rebuild.py` 的提交在会话中记为 **`92db2dd`**。 |

---

## 3. P18.1a — 脚本、修复与验收

### 3.1 交付脚本行为

- **路径**：`scripts/experiments/phase18_canonical_full_rebuild.py`  
- **串行阶段**：Phase 1 `run_pipeline.py --phase-1-only` → `text_embedding.py` → `genre_encoding.py` → `language_encoding.py` → **`umap_projection.py --backend umap --densmap`** → `export_galaxy_json.py` → `validate_galaxy_json.py`。  
- **写盘策略**：**不覆盖** `data/output/`、`frontend/public/data/`（除非维护者另行拷贝）。  
- **输出目录**：`data/runs/p18_1_full_rebuild_YYYYMMDD_HHMM/`（同名已存在则 `_2`、`_3`… 递增）。  
- **日志与清单**：`benchmark_log.txt`；收尾 **`run_manifest.json`**（含与 production 对比、`artifact_sizes_mb` 等）。  
- **可选**：raw 全文件 SHA256（可用 flag 跳过以省时间）；子进程 RSS 心跳需本机 **`pip install psutil`**（未安装则仅打磁盘剩余）。

### 3.2 Windows 子进程 UTF-8 与 `--resume-after-export`

| 现象 | 根因 | 处理 |
|------|------|------|
| 日志停在启动 `validate_galaxy_json.py` 之后、`run_manifest.json` 未写出 | 中文 Windows 下 `subprocess` 管道默认 **GBK** 解码，校验脚本输出 **UTF-8** → 父进程 **`UnicodeDecodeError`** | `Popen(..., encoding="utf-8", errors="replace")`；子进程环境 **`PYTHONIOENCODING=utf-8`** |
| UMAP 已完成后仍想收尾 manifest | 同上 | **`--resume-after-export RUN_DIR`**：在已有 `galaxy_data.json` / `.gz` / `galaxy_search_index.json.gz` 与 `cleaned.csv` 时，仅执行 validate + 对比 production + 写 manifest |

相关修复提交在会话中记为 **`2f57aa9`**。

### 3.3 Run 目录角色（排障与最终）

| Run 目录 | 说明 |
|----------|------|
| `p18_1_full_rebuild_20260504_1327` | 用于暴露 validate 管道编码问题；经 **`--resume-after-export`** 与向 `frontend/public/data`、`data/output/` 拷贝等操作（详见 transcript）。 |
| `p18_1_full_rebuild_20260504_1604` / `…1606` 等 | 全链重跑过程中的中间/排障目录。 |
| **`p18_1_full_rebuild_20260504_1617`** | **最终自洽全链成功**：`[Validate] OK`、`DONE`、`run_manifest.json` 齐全；作为 **canonical 事实源** 与 **P18.1b 输入 zip** 的来源。 |

### 3.4 最终验收 run（`…1617`，摘自 `benchmark_log.txt`）

| 项 | 值 |
|----|-----|
| 清洗后行数 | **59,014** |
| `validate` | `meta.count=59014`，`movies=59014` |
| 文本嵌入 | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`，**384d** |
| UMAP `meta` | `densmap=true`，`n_neighbors=300`，`min_dist=0.4`，`metric=cosine`，`random_state=42` |
| 特征权重 | `text/genre/lang` 均为 **1.0**；`genre_weight_ratio=1/φ` |
| 与 `frontend/public/data/galaxy_data.json` 对比 | `umap_params_match: true`；`id` 交集 **59014**，`id_only_prod` / `id_only_new` 均为 **0**；`z_range` 与 production **一致** |
| Procrustes（相对 production xy） | `procrustes_disparity≈0.12446`；残差范数 **p50≈0.000957 / p95≈0.002925 / p99≈0.003907 / max≈0.01107** |
| 全链墙钟 | 约 **15.1 min**（含本机 embedding、UMAP、导出与校验） |
| 导出体积（该次） | `galaxy_data.json` ≈ **91.35 MB**；`galaxy_data.json.gz` ≈ **30.98 MB**；`galaxy_search_index.json.gz` ≈ **15.40 MB** |

---

## 4. P18.1b — 代码、打包、Workflow 与 GHA 实测

### 4.1 仓库变更摘要

| 路径 | 说明 |
|------|------|
| `scripts/experiments/phase18_core_refit_benchmark.py` | 读 canonical 五文件 → `fuse_modalities` → `_fit_umap_learn`（DensMAP）→ `scipy.spatial.procrustes` 对齐 → `umap_xy_p18_core_benchmark.npy`、`benchmark_report.json`、`benchmark_core_log.txt`；可选 **`--with-export`**。 |
| `.github/workflows/phase18_refit_benchmark.yml` | `workflow_dispatch`；`runs-on: ubuntu-24.04`；`timeout-minutes: 180`；环境变量 `PYTHONUNBUFFERED`、`OMP_NUM_THREADS=4`、`NUMBA_NUM_THREADS=4`、`OPENBLAS_NUM_THREADS=1`、`MKL_NUM_THREADS=1`；`bundle_url` 下载 zip **或** `actions/cache@v4` restore key **`p18-canonical-artifacts-v1`**。 |
| `scripts/experiments/p18_pack_canonical_bundle_for_gha.py` | 将 `cleaned.csv`、`text_embeddings.npy`、`genre_vectors.npy`、`language_vectors.npy`、`umap_xy.npy` 打成**根目录平铺** zip，供 GHA `curl` + `unzip`。 |
| `requirements.cpu.txt` | 增加 **`psutil`**（进程 RSS 采样）。 |

### 4.2 GHA 输入准备（操作约定）

- **推荐**：本地执行打包脚本，默认输出 **`data/runs/p18_canonical_gha_bundle.zip`**（会话中实测压缩包约 **108.74 MB**，未压缩五文件合计约 **173.11 MB**），上传到 **GitHub Release** 资产，在 workflow 的 **`bundle_url`** 中填写 **HTTPS 直链**。  
- **原因**：体积超过一般 gist 上限；**`bundle_url` 留空**且仓库侧尚无 key **`p18-canonical-artifacts-v1`** 的 Actions cache 时，verify 步骤会失败。

### 4.3 GHA 一次实测（Artifact：`p18-1b-benchmark-25322797674`）

**Runner 与报告元数据**（摘自 `benchmark_report.json`）

| 项 | 值 |
|----|-----|
| `schema` | `p18_1b_benchmark_report_v1` |
| `created_at_utc` | `2026-05-04T13:50:57.291392+00:00` |
| `runner.platform` | `Linux-6.17.0-1010-azure-x86_64-with-glibc2.39` |
| `runner.python` | `3.11.15` |
| `runner.cpu_count` | **4** |
| `runner.mem_total_gb` | **15.61** |
| `rss_heartbeat_seconds` | **30** |
| 仓库 `git`（runner 检出） | `HEAD` = **`4e06cda87da0ce7c3879ae43fa88187efcfa3efd`**（以当次 CI 为准） |

**墙钟（`timings_s`）**

| 阶段 | 秒 |
|------|-----|
| `fusion` | **0.064** |
| `umap_fit_transform` | **660.412**（约 **11.0 min**） |
| `procrustes_align` | **0.0062** |
| `total_wall` | **661.428**（约 **11.02 min**） |

**内存与融合形状**

| 项 | 值 |
|----|-----|
| `rss_peak_mb_sampled` | **7664.5**（约 **7.5 GiB**） |
| `fusion_shape` | **`[59014, 506]`** |

**相对参考 `umap_xy` 的误差指标**（同次 `benchmark_report.json`；对齐实现见 §1「未强制等同 P18.3」）

| 指标 | `physical_vs_ref_pre_align`（L2，ref vs 原始 UMAP） | `physical_vs_ref_post_align`（L2，ref vs aligned） |
|------|------------------------------------------------------|------------------------------------------------------|
| p50 | **2.2754** | **2.2487** |
| p95 | **9.0800** | **8.6785** |
| p99 | **19.4158** | **18.9160** |
| max | **26.5585** | **25.8719** |

| 指标 | `shape_procrustes_pre_align` | `shape_procrustes_post_align` |
|------|------------------------------|-------------------------------|
| `procrustes_disparity` | **0.14199010864478212** | **0.1419901085218604** |
| 归一化残差 p50 / p95 / p99 / max | **0.000775 / 0.002992 / 0.006522 / 0.008921** | **同量级**（浮点末位差异） |

**与 Phase 18 计划粗判对照**

- 计划：GHA core **&lt; 60 min** 且峰值 RSS **&lt; 10 GiB** → monthly hosted 较稳。  
- 本次：**~11 min**、峰值 **~7.5 GiB** → 为 P18.5 在 **`ubuntu-24.04`** 上保留 **较大余量**；仍应在正式 cron workflow 中配置 **`timeout-minutes`** 与 OOM/失败告警。

**本次未开启**：`--with-export` / workflow `with_export: true`，故 **`export` / `validate` 的 `exit_codes` 为 `null`**；若需「含导出 + 校验」总成本，应另跑一轮并单独归档。

---

## 5. 计划条目对照

| 计划要求 | 落点 / 状态 |
|----------|-------------|
| 本地 canonical 参数与 production `meta` 一致 | §3.4，`umap_params_match` |
| `validate` 与 `meta.count == len(movies)` | §3.4 |
| GHA `ubuntu-24.04` core benchmark 墙钟与内存 | §4.3 |
| 计划文档所列长文件名「`Phase 18.1 Canonical full rebuild 与 GHA core benchmark 实施报告.md`」 | 本文件为 **`Phase 18.1 P18.1 Canonical full rebuild 与 GHA core benchmark 实施报告.md`**（增加 **`P18.1`** 前缀与同目录其它 Phase 报告一致）；内容覆盖计划对该报告的要求 |
| `.cursor/plans` 内 todo `p181-cpu-refit-benchmark` → `completed` | **需维护者在 plan frontmatter 手动更新**（与仓库流程同步） |

---

## 6. 后续建议（非本里程碑必做）

1. **P18.5**：将本次 GHA 墙钟/内存写入 monthly workflow 注释或 `docs/project_docs/TMDB 电影宇宙 Data Pipeline.md` 等 SSOT。  
2. **P18.3**：落地 `align_to_reference` 后，评估 **`phase18_core_refit_benchmark.py`** 是否改为调用同一实现。  
3. **产品数据路径**：若以 **`…1617`** 为唯一基准，显式决定是否再次同步 `frontend/public/data/*.json.gz` 与 `data/output/*`，避免与 **`…1327`** 历史拷贝混淆。

---

## 7. 关键路径索引

| 路径 | 用途 |
|------|------|
| `scripts/experiments/phase18_canonical_full_rebuild.py` | P18.1a 编排 |
| `scripts/experiments/phase18_core_refit_benchmark.py` | P18.1b 计时与报告 |
| `scripts/experiments/p18_pack_canonical_bundle_for_gha.py` | 打 GHA zip |
| `.github/workflows/phase18_refit_benchmark.yml` | GHA workflow |
| `data/runs/p18_1_full_rebuild_20260504_1617/` | 推荐 canonical SSOT（本机，gitignore） |
| `data/runs/p18-1b-benchmark-25322797674/` | 一次 GHA 结果解压归档（本机） |

---

## 8. 修订历史

| 日期 | 说明 |
|------|------|
| 2026-05-04 | 初版：`Phase 18.1 实施决策与操作记录.md`，据 transcript 与 `…1617`、GHA Artifact `25322797674` 整理。 |
| 2026-05-04 | 版式对齐 `docs/reports` 既有「Phase … 实施报告」结构；合并 GHA `benchmark_report.json` 中物理/形状细分指标；重命名为本文件名；删除旧文件名以避免重复。 |

---

*本报告为 P18.1 里程碑登记；实现细节与可复现命令仍以仓库脚本及 `.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md` 为 SSOT。*
