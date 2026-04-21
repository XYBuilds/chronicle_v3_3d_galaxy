# Phase 6M7 — 子样本端到端冒烟（WSL + chronicle）实施报告

## 文档信息

| 项目 | 内容 |
| --- | --- |
| 对应计划 | [`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) |
| 里程碑 | **M7（§8.3.8）** — 子样本 Phase 2.6 全链路冒烟、`validate_galaxy_json`、环境与管线联调 |
| 计划 Todo | **`m7-smoke`** → **`completed`**（见该 plan 顶部 `todos`） |
| 开发分支 | **`phase-6-m7-smoke`** |
| Git 提交（参考） | **`e5fe216`** — `fix(M7): conda yml pytorch channel, sklearn pin; umap cuml+DensMAP/small-n handling` |
| 报告日期 | 2026-04-21 |

---

## 本次 M7 做了什么（摘要）

在 **WSL Ubuntu**、**`chronicle`** conda 环境下，以 **`data/subsample/tmdb2025_random20.csv`** 触发 **Phase 2.6 自动路径**（`run_pipeline.py` 自动 `--through-phase-2` + 行数断言），完成 **清洗 → 嵌入（CUDA）→ 特征 → UMAP → 导出 → `validate_galaxy_json.py`** 的端到端验证；并修正 **conda 环境规格**、**Miniforge 安装脚本**与 **`umap_projection.py`** 中与 **cuML / DensMAP / 极小样本** 相关的阻塞问题。

关联工作流说明见：**[`docs/workflows/Phase 6M7 后续数据处理流程.md`](../workflows/Phase%206M7%20后续数据处理流程.md)**。

---

## 交付清单

| 序号 | 交付项 | 说明 |
| --- | --- | --- |
| 1 | **`scripts/env/rapids_env.yml`** | 增加 **`pytorch`** channel；使用 **`pytorch::pytorch`** + **`pytorch::pytorch-cuda=12.4`**（`pytorch-cuda` 仅在 pytorch channel 完整提供，单独 `nvidia`/`conda-forge` 易出现 solve 失败）。增加 **`umap-learn`**。将 **`scikit-learn`** 约束为 **`>=1.4,<1.8`**，避免与 **cuML 25.x** 在 **`cuml.accel` / `BaseEstimator`** 上的 **1.8+ API** 不兼容。 |
| 2 | **`scripts/env/install_chronicle_conda_env.sh`** | Miniforge 安装包下载到 **`mktemp /tmp/miniforgeXXXXXX.sh`**（**必须以 `.sh` 结尾**），否则官方安装脚本会误判为 `source` 调用而退出。 |
| 3 | **`scripts/feature_engineering/umap_projection.py`** | （a）**延迟 `import umap`**（仅 **umap-learn** 路径），GPU-only 环境可不装 umap-learn 直至需要 CPU 路径。（b）**`--backend cuml` 且 `--densmap`**：RAPIDS **GPU UMAP 不支持 DensMAP**（与上游 `cuml/manifold/umap.pyx` 一致），**Phase 2.4 自动改用 umap-learn（CPU）**，并打印 **`[UMAP] effective fit backend -> umap`**；Phase 2.1 嵌入仍在 GPU。（c）**纯 cuML 拟合若出现非有限坐标**（子样本 **n≈16** 上可复现），**回退 umap-learn（CPU）** 并打印说明，避免管线硬失败。 |
| 4 | **冒烟命令（WSL）** | `mamba run -n chronicle python scripts/run_pipeline.py --input data/subsample/tmdb2025_random20.csv --umap-backend cuml --densmap`：**通过**；内置 **`validate_galaxy_json.py`**：**通过**（`meta.count` 与 movies 条数一致）。 |
| 5 | **前端构建（Windows）** | 仓库根目录执行 **`npm run build`**：**通过**（验证工具链与构建未被管线侧改动破坏）。 |
| 6 | **仓库数据策略** | 冒烟写入的 **`frontend/public/data/galaxy_data.json*`** 未作为「全量线上数据」提交进 Git（避免子样本覆盖大文件）；验收时可在本机保留 WSL 产物或通过 **`scripts/env/sync_artifacts_to_windows.sh`** 同步。 |

---

## 环境与执行要点（验收复现）

### WSL 发行版

若本机默认 WSL 为 **`docker-desktop`** 且无 `bash`，需显式使用 Ubuntu，例如：

```bash
wsl -d Ubuntu
```

### 推荐冒烟命令

在 **已创建并激活 `chronicle`** 的前提下（见 `install_chronicle_conda_env.sh` / `rapids_env.yml`），于 **仓库根**（可为 **`/mnt/e/projects/chronicle_v3_3d_galaxy`**）执行：

```bash
mamba run -n chronicle python scripts/run_pipeline.py \
  --input data/subsample/tmdb2025_random20.csv \
  --umap-backend cuml \
  --densmap
```

说明：**`--densmap`** 时 Phase 2.4 实际为 **umap-learn（CPU）**；若需 **纯 GPU UMAP**，在本阶段应 **省略 `--densmap`**（全量 **M8** 若强制 DensMAP + GPU，需单独评估 RAPIDS 版本能力或接受 CPU DensMAP）。

### GPU 显存 / 耗时基线

子样本规模小（清洗后约 **16** 行），**显存与耗时应以本机 `nvidia-smi` 与终端耗时为准**；本报告不写入固定数字，避免与驱动 / 机型绑定。

---

## 与计划原文（§8.3.8 / todo）的对应关系

| 计划要求 | M7 落实情况 |
| --- | --- |
| WSL `chronicle` 下子样本端到端 | 已跑通（见上文命令与校验）。 |
| 验证 **cuml UMAP 分支** | **`--umap-backend cuml`** 已覆盖；**`--densmap` 时 Phase 2.4 为 CPU DensMAP**（cuML 限制），**无 densmap 时** 走 cuML；**极小 n 下 cuML 非有限值时回退 CPU**，与「分支可用」一致。 |
| **`galaxy_data.json` + `validate_galaxy_json.py`** | 冒烟运行中 **校验通过**。 |
| 回写 Windows、`npm run dev` | **回写**：可用 **`sync_artifacts_to_windows.sh`**（按 M6）；**`npm run build`** 已在本机验证通过；**dev 加载**依赖是否将子样本 JSON 同步到 Windows 侧 `frontend/public/data/`，由验收时决定。 |
| 产出本实施报告 | 即本文件：**`docs/reports/Phase 6M7 子样本端到端冒烟 实施报告.md`**。 |

---

## 已知限制与后续（M8）

- **DensMAP on GPU**：当前 **cuML UMAP 不支持 DensMAP**；管线选择 **DensMAP 时走 umap-learn**，与 **M8 计划**中「`--umap-backend cuml --densmap`」字面组合需在产品/技术上再对齐（或接受 **UMAP 段 CPU**、或等 RAPIDS 支持后再收紧）。
- **全量 59K**：**M8** 另行执行；本报告仅覆盖 **M7 子样本冒烟** 范围。
