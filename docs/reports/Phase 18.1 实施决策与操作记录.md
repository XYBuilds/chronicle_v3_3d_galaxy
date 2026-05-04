# Phase 18.1 — 实施决策与操作记录

本文档汇总 **P18.1（canonical full rebuild + GHA core benchmark）** 在本次迭代中的**最终决策**与**已执行操作**，便于归档与后续 P18.2+ 引用。

**依据来源**

- 项目计划：`.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md`（P18.1 章节）。
- 会话与操作记录：[P18.1 session](16e25459-32d5-4d46-b03c-4fa0c2602154)（Cursor agent transcript `16e25459-32d5-4d46-b03c-4fa0c2602154.jsonl`）。
- 本地 canonical 验收日志：`data/runs/p18_1_full_rebuild_20260504_1617/benchmark_log.txt`（`data/runs/` 已 `.gitignore`，仅存本机）。
- GHA core benchmark 产物：Artifact run 对应解压目录 `data/runs/p18-1b-benchmark-25322797674/` 内 `benchmark_report.json`（runner 上路径为 `data/runs/p18_canonical_ci`）。

---

## 1. 范围与目标（相对 Phase 18 总计划）

| 子项 | 目标 | 状态 |
|------|------|------|
| **P18.1a** | 从 `data/raw/TMDB_all_movies.csv` 全链重跑到隔离目录；参数与 production meta 一致；`validate_galaxy_json` 通过；与当前 `frontend/public/data/galaxy_data.json` 对比摘要 | **已完成**（以 `…1617` run 为最终验收） |
| **P18.1b** | 用 canonical 矩阵在 **GitHub `ubuntu-24.04`** 上跑 fusion → DensMAP UMAP → Procrustes（+ 可选 export），得到墙钟与峰值内存，供 P18.5 timeout / monthly hosted 决策 | **已完成**（GHA Artifact `25322797674`） |
| **书面** | 计划原文另要求独立「Phase 18.1 实施报告」长文档 | **本文档即该次迭代的决策与操作归档**；若需与计划文件名逐字一致，可复制改名或再合并 |

**明确不在 P18.1 内结束的事项**

- 是否将 canonical 结果**覆盖**同步到 `data/output/` 与 `frontend/public/data/`：计划写的是验收后**人工决策**；会话中曾对 **`…1327`** 做过一次拷入前端/ `data/output/`，与后续 **`…1617`** 全链成功为不同时间点，**以业务上选定的那次 run 为准**。
- **P18.3** `align_to_reference`（按 id 子集 + `orthogonal_procrustes`）与当前 benchmark 内 **`scipy.spatial.procrustes` 全局相似对齐**是否逐行一致：**未在本次对齐实现上强制等同**；P18.5 落地时应复用 P18.3 helper 并视需要调整 benchmark。

---

## 2. 分支与仓库操作决策

| 决策 | 说明 |
|------|------|
| **独立分支** | 用户要求为 P18.1 **新开 git 分支**再改；会话中创建并长期使用的分支名为 **`p18.1-canonical-full-rebuild`**。 |
| **大文件不进 Git** | 将 **`data/runs/`** 加入 `.gitignore`，canonical 与 GHA 解压产物仅存本机/Artifact，避免误提交数百 MB 数据。 |
| **默认不写 `umap_model.pkl`** | 与 Phase 18「不依赖 UMAP pkl」方向一致：`umap_projection.py` 默认仅写 `umap_xy.npy`；需模型时显式 **`--save-model`**（`run_pipeline.py` 侧为 **`--save-umap-model`**；P18.1a 脚本为 **`--save-umap-model`**）。相关提交在会话中记为 **`db96d29`** 一带。 |

---

## 3. P18.1a — 脚本、修复与验收 run

### 3.1 交付脚本

- **`scripts/experiments/phase18_canonical_full_rebuild.py`**  
  - 串行：Phase 1 `run_pipeline.py --phase-1-only` → `text_embedding.py` → `genre_encoding.py` → `language_encoding.py` → **`umap_projection.py --backend umap --densmap`** → `export_galaxy_json.py` → `validate_galaxy_json.py`。  
  - **不覆盖** `data/output/`、`frontend/public/data/`（除非用户另行拷贝）。  
  - 输出目录：`data/runs/p18_1_full_rebuild_YYYYMMDD_HHMM/`（重名则 `_2` 递增）。  
  - 日志：`benchmark_log.txt`；收尾写 **`run_manifest.json`**（含与 production 对比等）。  
  - 可选：对 raw 全文件 SHA256；子进程 RSS 心跳需 **`pip install psutil`**（可选）。

### 3.2 Windows 子进程编码与恢复路径（关键修复）

| 问题 | 根因 | 处理 |
|------|------|------|
| 日志停在 validate 启动行、`run_manifest.json` 未写出 | 中文 Windows 下 `subprocess` 管道默认 **GBK** 解码，而 `validate_galaxy_json.py` 输出 **UTF-8** → 父进程 **`UnicodeDecodeError`** | `Popen(..., encoding="utf-8", errors="replace")` + 子进程环境 **`PYTHONIOENCODING=utf-8`** |
| 已耗时长 UMAP 后失败 | 同上 | 增加 **`--resume-after-export RUN_DIR`**：在已有导出与 `cleaned.csv` 前提下**仅** validate + 对比 production + 写 manifest |

会话中记录的相关提交示例：**`2f57aa9`**（编码与 resume）。

### 3.3 中间 run 与最终验收 run

| Run 目录 | 说明 |
|----------|------|
| `p18_1_full_rebuild_20260504_1327` | 曾用于排查「validate 后未收尾」；经 **resume** 与拷贝到 `frontend/public/data`、`data/output/` 等操作（见 transcript）。 |
| `p18_1_full_rebuild_20260504_1604` / `…1606` 等 | 全链重跑过程中的中间目录/排障记录。 |
| **`p18_1_full_rebuild_20260504_1617`** | **最终一次自洽全链成功**：`[Validate] OK`、manifest、`DONE` 齐全，作为 **P18.1a canonical 与 P18.1b 输入包** 的事实来源。 |

### 3.4 `…1617` 验收摘要（摘自 `benchmark_log.txt`）

- **行数**：清洗后 **59,014**；`meta.count == len(movies) == 59014`。  
- **模型与 UMAP**：`paraphrase-multilingual-MiniLM-L12-v2`（384d）；`densmap=true`，`n_neighbors=300`，`min_dist=0.4`，`metric=cosine`，`random_state=42`；`genre_weight_ratio=1/φ`；text/genre/lang 权重均为 **1.0**。  
- **与 production JSON 对比**（同路径 `frontend/public/data/galaxy_data.json`）：`umap_params_match: true`；id 全集一致；`z_range` 一致；Procrustes 残差范数 **p50≈0.000957 / p95≈0.002925 / p99≈0.003907 / max≈0.01107**；`procrustes_disparity≈0.12446`。  
- **全链墙钟**：约 **15.1 min**（含本机 embedding/UMAP/export/validate；以日志为准）。  
- **导出体积（该次）**：`galaxy_data.json` ≈ 91.35 MB；`.json.gz` ≈ 30.98 MB；`galaxy_search_index.json.gz` ≈ 15.40 MB。

---

## 4. P18.1b — 代码、打包与 GitHub Actions

### 4.1 仓库内新增/依赖

| 项 | 说明 |
|----|------|
| **`scripts/experiments/phase18_core_refit_benchmark.py`** | 读 canonical 五文件 → fusion → `_fit_umap_learn`（DensMAP）→ `scipy.spatial.procrustes` 对齐 → 写 `umap_xy_p18_core_benchmark.npy` 与 `benchmark_report.json`；可选 `--with-export`。 |
| **`.github/workflows/phase18_refit_benchmark.yml`** | `workflow_dispatch`；`ubuntu-24.04`；`timeout-minutes: 180`；线程环境变量与计划一致；`bundle_url` 下载 zip **或** 依赖 cache key **`p18-canonical-artifacts-v1`**。 |
| **`scripts/experiments/p18_pack_canonical_bundle_for_gha.py`** | 将五文件打成**根目录平铺**的 zip，供 `curl` + `unzip` 使用。 |
| **`requirements.cpu.txt`** | 增加 **`psutil`**（RSS 心跳采样）。 |

### 4.2 GHA 侧输入准备（操作决策）

- **推荐**：本地执行打包脚本，将 **`p18_canonical_gha_bundle.zip`**（或等价命名）上传到 **GitHub Release** 资产，workflow 的 **`bundle_url`** 填 **直链**。  
- **原因**：bundle 压缩后仍约 **100MB+**，不适合 gist；首次若 **`bundle_url` 为空** 且无已存在同名 **Actions cache**，verify 会失败。

### 4.3 GHA 实测结果（Artifact：`p18-1b-benchmark-25322797674`）

摘自 `benchmark_report.json`（UTC `2026-05-04T13:50:57Z` 生成；runner `Linux-6.17.0-1010-azure`，**4 vCPU**，**~15.61 GiB** 标称内存）：

| 指标 | 值 |
|------|-----|
| `fusion` | **0.064 s** |
| `umap_fit_transform` | **660.412 s**（约 **11.0 min**） |
| `procrustes_align` | **0.006 s** |
| `total_wall` | **661.428 s**（约 **11.02 min**） |
| `rss_peak_mb_sampled` | **~7664.5 MB**（约 **7.5 GiB**） |

**相对 Phase 18 计划中的粗判**

- 计划：GHA core **&lt; 60 min** 且峰值 **&lt; 10 GiB** → monthly hosted 较稳。  
- 本次：**~11 min**、峰值 **~7.5 GiB** → **支持**在 `ubuntu-24.04` 上为 P18.5 配置 **monthly** 类 job 保留较充足 headroom（仍应在 P18.5 workflow 中保留 `timeout-minutes` 与 OOM 监控）。

**说明**：未在本次 GHA run 中开启 `--with-export`；若需「含导出+校验」总成本，应另跑一轮 `with_export: true` 并单独记录。

---

## 5. 与计划条目的对齐情况

| 计划要求 | 本次状态 |
|----------|----------|
| 本地 canonical 参数与 production meta 一致 | **已满足**（`…1617` + `umap_params_match`） |
| `validate` 与 `meta.count == len(movies)` | **已满足** |
| GHA `ubuntu-24.04` core benchmark 墙钟/内存 | **已满足**（见 §4.3） |
| 计划中的「`docs/reports/Phase 18.1 Canonical full rebuild 与 GHA core benchmark 实施报告.md`」固定文件名 | **未逐字使用该文件名**；以本文 **`Phase 18.1 实施决策与操作记录.md`** 作为本轮归档，可按需复制或改名 |
| `.cursor/plans` 内 todo `p181-cpu-refit-benchmark` 标为 `completed` | **需人工在 plan  frontmatter 更新**（若流程上要求与文档同步） |

---

## 6. 建议的后续动作（非 P18.1 必闭合项）

1. **P18.5**：将 `timeout-minutes`、并发/线程 env 与本次 GHA 数字写进 monthly workflow 注释或 Data Pipeline 文档。  
2. **P18.3**：实现 `align_to_reference` 后，评估是否将 **`phase18_core_refit_benchmark.py`** 的对齐段切换为同一实现，以便与 Supabase monthly 路径一致。  
3. **产品**：若要以 **`…1617`** 为线上基准，显式决定是否再同步 `frontend/public/data/*.json.gz` 与 `data/output/*`（避免与早期 **`…1327`** 拷贝状态混淆）。

---

## 7. 关键文件路径速查

| 路径 | 用途 |
|------|------|
| `scripts/experiments/phase18_canonical_full_rebuild.py` | P18.1a 编排 |
| `scripts/experiments/phase18_core_refit_benchmark.py` | P18.1b 核心计时 |
| `scripts/experiments/p18_pack_canonical_bundle_for_gha.py` | 打 GHA zip |
| `.github/workflows/phase18_refit_benchmark.yml` | GHA workflow |
| `data/runs/p18_1_full_rebuild_20260504_1617/` | 推荐作为 canonical SSOT（本机，未进 git） |
| `data/runs/p18-1b-benchmark-25322797674/benchmark_report.json` | GHA 一次实测归档（本机解压） |

---

## 8. 修订历史

| 日期 | 说明 |
|------|------|
| 2026-05-04 | 初版：根据 transcript `16e25459-32d5-4d46-b03c-4fa0c2602154` 与 `…1617` / GHA Artifact `25322797674` 材料整理。 |
