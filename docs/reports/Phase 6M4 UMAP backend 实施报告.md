# Phase 6M4 — `umap_projection.py` UMAP backend（umap-learn / cuML）实施报告

## 文档信息

| 项目          | 内容                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| 对应计划      | [`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) |
| 里程碑        | **M4（§8.3.5）** — `scripts/feature_engineering/umap_projection.py` 增加 `--backend`、`--densmap` 与 cuML 分支 |
| 主要 Git 分支 | **`phase-6-m4-umap-backend`**（相对 `main` 新开；合入后以主分支历史为准）                                            |

---

## 本次操作概要（做了什么）

1. **CLI**：新增 **`--backend {auto,umap,cuml}`**（默认 **`auto`**）、**`--densmap`**（`store_true`）。保留原有 **`--n-neighbors`** 等参数；**`auto`** 在 **`CUDA_VISIBLE_DEVICES` 非空屏蔽**、存在 **至少一块可见 CUDA 设备** 且 **`cuml` 可导入** 时选 **`cuml`**，否则选 **`umap-learn`**。
2. **`umap` 分支**：在原有 `umap.UMAP(...)` 上增加 **`densmap=`**，与 **`cuml`** 侧语义对齐。
3. **`cuml` 分支**：**`from cuml.manifold import UMAP`**，`fit_transform` 前将融合特征转为 **`float32` C 连续**；构造参数含 **`output_type='numpy'`**、**`densmap`**、与 CPU 侧一致的 **`n_neighbors` / `min_dist` / `metric` / `random_state`**。若当前 **`cuml`** 版本不接受 **`verbose`**，则自动去掉该参数再构造（兼容不同 RAPIDS 小版本）。
4. **产物**：**`umap_xy.npy`** 仍为 **`(n, 2) float32`**；**`umap_model.pkl`** 仍用 **`joblib.dump(reducer, ...)`**。cuML 估计器可序列化，但**与 `umap-learn` 的 `transform()` 行为/输入类型未必一致** — 若日后只做同分布增量推理，应在目标环境中用对应 backend 加载模型。
5. **验证**：在 **Windows CPU** 上于本地生成 **20 行**合成 **`text_embeddings.npy` / `genre_vectors.npy` / `language_vectors.npy`**（路径 `data/output/_m4_smoke/`，目录已被 **`data/output/`** 忽略规则覆盖），执行  
   **`python scripts/feature_engineering/umap_projection.py ... --backend umap --densmap --n-neighbors 50`** 与 **`--backend auto`** 通过；**`--backend cuml`** 在本机未安装 cuML 时**按预期**报错退出。  
   **WSL `chronicle` 环境下** **`python ... --backend cuml --densmap --n-neighbors 50`** 需在用户机器上复验（本仓库 agent 环境 **WSL 不可用**，未在此执行 GPU 冒烟）。

---

## 1. 背景与目标

按计划 §8.3.5：在保留 Windows **`umap-learn`** 回退的前提下，为 **RAPIDS cuML** 提供 **`cuml.manifold.UMAP`** 路径，并支持后续 M8 所需的 **`densmap`** 与 **`n_neighbors`**（如 100）等大参配置。

---

## 2. 涉及文件

| 文件 | 变更 |
| ---- | ---- |
| `scripts/feature_engineering/umap_projection.py` | backend 解析、cuML 分支、**`--densmap`**、**`auto`** 默认逻辑、GPU/cuML 前置检查（显式 **`cuml`** 时） |

---

## 3. 使用说明（摘录）

```text
--backend {auto,umap,cuml}   # 默认 auto
--densmap                    # 启用 DensMAP
--n-neighbors N              # 仍自动 cap 到 n_samples-1
```

**WSL GPU 子样本冒烟（需在已安装 chronicle conda 的机器上执行）：**

```bash
python scripts/feature_engineering/umap_projection.py \
  --backend cuml --densmap --n-neighbors 50
```

（需已存在默认或显式传入的三路 **`.npy`** 特征。）

---

## 4. 计划项同步

对应计划文件中 **`m4-umap-backend`** 已标为 **completed**（见该 plan 的 `todos` 列表）。
