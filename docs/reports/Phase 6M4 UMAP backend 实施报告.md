# Phase 6M4 — UMAP backend（umap-learn / cuML）实施报告

## 文档信息

| 项目 | 内容 |
| --- | --- |
| 对应计划 | [`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) |
| 里程碑 | **M4（§8.3.5）** — 重构 `umap_projection.py`：backend 切换、`densmap`、cuML 分支 |
| 计划 Todo | **`m4-umap-backend`** → **`completed`**（见该 plan 顶部 `todos`） |
| 开发分支 | **`phase-6-m4-umap-backend`** |
| Git 提交（参考） | **`d6e2698`** — `feat(phase6-m4): UMAP backend switch (umap-learn / cuML) and densmap` |
| 报告日期 | 2026-04-21 |

---

## 本次 M4 做了什么（摘要）

在 **`scripts/feature_engineering/umap_projection.py`** 中实现 **CPU（umap-learn）与 GPU（RAPIDS cuML）双路径**，满足 Phase 6 §8 后续 **`densmap=True`、`n_neighbors` 较大（如 100）** 的训练需求；**默认不改变**未显式指定时的既有 CPU 行为逻辑（见下文 **`auto`** 规则）。

---

## 交付清单

| 序号 | 交付项 | 说明 |
| --- | --- | --- |
| 1 | **CLI：`--backend {auto,umap,cuml}`** | 默认 **`auto`**：在 **`CUDA_VISIBLE_DEVICES` 未置空**、存在 **可见 CUDA 设备**（通过 CuPy 设备数判断）且 **`import cuml` 成功** 时选用 **`cuml`**，否则 **`umap`**。显式 **`cuml`** 时若未安装 cuML 或无 GPU，**报错退出**并提示环境要求。 |
| 2 | **CLI：`--densmap`** | 布尔开关；**umap-learn** 与 **cuML** 两侧均传入 **`densmap`**，语义对齐。 |
| 3 | **既有 `--n-neighbors`** | 保持原逻辑：内部仍用 **`_umap_n_neighbors`** 将邻居数 **cap 到 `n_samples - 1`**。 |
| 4 | **cuML 分支实现** | `from cuml.manifold import UMAP`；融合矩阵 **`float32`、C 连续** 后 **`fit_transform`**；**`output_type='numpy'`**；超参 **`n_components/min_dist/metric/random_state/densmap/n_neighbors`** 与 CPU 路径一致。若某版本 **`verbose`** 构造失败则 **去掉 `verbose` 重试**（兼容小版本差异）。 |
| 5 | **产物契约** | **`umap_xy.npy`**：**`(n, 2) float32`** 不变；**`umap_model.pkl`**：**`joblib.dump(reducer)`**；cuML 估计器可 pickle，**与 umap-learn 的 `transform()` 行为不一定一致**，增量推理需在目标 backend 下验证。 |
| 6 | **冒烟验证（Windows CPU）** | 使用本地合成 **20 行**三路特征（目录 **`data/output/_m4_smoke/`**，受 **`data/output/` gitignore** 覆盖）：**`--backend umap --densmap --n-neighbors 50`**、**`--backend auto`** 通过；**`--backend cuml`** 在无 cuML 环境下 **按预期失败**。 |
| 7 | **文档与本报告** | 本文件：**`docs/reports/Phase 6M4 UMAP backend 实施报告.md`**。 |
| 8 | **Plan 同步** | **`phase_6_gpu_migration_202aac8f.plan.md`** 中 **`m4-umap-backend`** 状态为 **`completed`**。 |

---

## 与计划原文（§8.3.5 / todo）的对应关系

计划要求 | M4 落实情况
--- | ---
`--backend {umap,cuml}` + 默认按环境自动选 | 使用 **`auto` / `umap` / `cuml`** 三值；**`auto`** 按 **GPU 可见性 + cuML 可导入** 选择（见上表）。
`--densmap`、`--n-neighbors` | 已增加 **`--densmap`**；**`--n-neighbors`** 为既有参数，与 cap 逻辑保留。
cuml：`output_type='numpy'`，`densmap`，`n_neighbors=nn` 等 | 已实现（见代码）。
输出 `(n, 2) float32` | 保持不变。
`umap_model.pkl`：joblib 与 pickle 说明 | 仍 **`joblib.dump`**；报告中注明 **transform 路径差异**。
子样本 CLI：`--backend cuml --densmap --n-neighbors 50` | **在已安装 chronicle + GPU 的 WSL 上**由用户复验；本机 agent 仅完成 **CPU 路径**冒烟。

---

## 使用示例

```bash
# 默认自动选择（无 GPU / 无 cuML 时通常为 umap-learn）
python scripts/feature_engineering/umap_projection.py

# 强制 CPU umap-learn
python scripts/feature_engineering/umap_projection.py --backend umap

# WSL chronicle + GPU：显式 cuML + DensMAP（需已生成默认或指定的三路 .npy）
python scripts/feature_engineering/umap_projection.py --backend cuml --densmap --n-neighbors 50
```

---

## 后续里程碑（未在本次 M4 范围）

- **M5**：`run_pipeline.py`、`export_galaxy_json.py` 等对 **`backend` / `densmap` / `n_neighbors`** 的透传与 **`meta.umap_params`** 扩展。
- **M7+**：端到端 WSL GPU 冒烟与全量重训。
