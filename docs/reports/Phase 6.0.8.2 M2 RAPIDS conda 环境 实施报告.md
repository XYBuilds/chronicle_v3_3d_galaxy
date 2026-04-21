# Phase 6.0.8.2 — M2 RAPIDS conda 环境 实施报告

## 目标

按计划 [`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) **M2（§8.3.3）**：以 **conda/mamba 优先** 建立名为 `chronicle` 的环境，包含 cuML（RAPIDS 25.x）、PyTorch（CUDA 12.x）、sentence-transformers 及管线常用库；提供 **幂等安装入口** 与 **`rapids_env.yml` 规格文件**；官方 solve 失败时文档化 **pip wheels 回退**。

## Git 分支

- 工作分支：`phase-6-m2-rapids-env`（相对 `main` 新开）。

## 交付物

| 路径 | 说明 |
|------|------|
| `scripts/env/rapids_env.yml` | Conda 环境定义：`channels` = rapidsai / conda-forge / nvidia；`python=3.11`、`cuda-version=12.5`、`cuml=25.*`、`pytorch`、`pytorch-cuda=12.*`、`sentence-transformers`、`joblib`、`tqdm`、`pandas`、`numpy`、`scikit-learn`。 |
| `scripts/env/install_chronicle_conda_env.sh` | 在未检测到 `mamba` 时安装 **Miniforge3** 至 `$HOME/miniforge3`（可通过将来扩展 `CONDA_ENV_PREFIX` 覆盖前缀）；执行 `mamba env create -f scripts/env/rapids_env.yml`；成功后默认冒烟：`python -c "import cuml; from cuml.manifold import UMAP"`。支持 `--update`（`mamba env update --prune`）、`--skip-smoke`。若 create 失败，脚本提示 **pip 回退** 并指向 RAPIDS 官方安装文档。 |
| `scripts/env/bootstrap_wsl.sh` | 仅更新 M1 结束时的 “Next” 一行，指向上述安装脚本。 |

## 本环境内验证情况

当前开发机通过 `wsl` 调用失败（无法启动 WSL bash / 本机代理与 WSL 集成问题），**未能在本仓库执行中实际跑通 mamba solve 与 cuml 冒烟**。请你方在 **WSL2 Ubuntu** 上从仓库根目录执行：

```bash
bash scripts/env/install_chronicle_conda_env.sh
```

预期：环境创建成功后终端打印 `cuml UMAP smoke OK`。

若 solver 报错，可按脚本末尾提示改用 [RAPIDS Release Selector](https://docs.rapids.ai/install/) 推荐的 **pip cu12** 组合，或微调 `cuda-version`/PyTorch CUDA 小版本以满足 rapidsai 与 pytorch 的联合约束。

## 后续里程碑衔接

- **M3**：拆分 `requirements.cpu.txt` / `requirements.gpu.txt`（或等价命名），与本 conda 规格对齐。
- **M4**：`umap_projection.py` 增加 `--backend cuml` 等。

---

*文档对应 Phase 6 plan 里程碑 M2。*
