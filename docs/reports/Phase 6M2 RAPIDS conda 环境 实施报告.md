# Phase 6.0.8.2 — M2 RAPIDS conda 环境（完整实施报告）

## 文档信息

| 项目 | 内容 |
|------|------|
| 对应计划 | [`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) |
| 里程碑 | **M2（§8.3.3）** — RAPIDS / Miniforge(mamba) / conda env `chronicle` |
| 主要 Git 分支 | `phase-6-m2-rapids-env`（相对 `main` 新开；合入后以主分支历史为准） |
| 代表性提交 | `7b56077` — `feat(env): M2 RAPIDS chronicle conda env (rapids_env.yml + installer)` |

---

## 1. 背景与目标

Phase 6 将把整条 Python 数据管线迁移到 **WSL2 Ubuntu + RAPIDS cuML**（conda-first），以便在 GPU 上使用 **`cuml.manifold.UMAP`**（含后续 M4/M8 规划的 `densmap=True`、`n_neighbors=100` 等）。

**M2 的具体目标**（与 plan 中 `m2-rapids-env` todo 一致）：

1. **安装 Miniforge（内含 mamba）**，优先用 **mamba** 解析依赖。
2. **创建 conda 环境 `chronicle`**，等价于下列通道与包约束（plan 原文）：
   - `mamba create -n chronicle -c rapidsai -c conda-forge -c nvidia`
   - `cuml=25.*` `python=3.11` `cuda-version=12.5` `pytorch` `pytorch-cuda=12.*`
   - `sentence-transformers` `joblib` `tqdm` `pandas` `numpy` `scikit-learn`
3. **冒烟**：`python -c 'import cuml; from cuml.manifold import UMAP'`
4. **产出** `scripts/env/rapids_env.yml` 作为可版本化、可复现的 env 规格。
5. **若 conda 求解失败**：提供/记录 **pip wheels（cu12）** 回退思路（不替代主路径）。

**§8.3.2 CUDA Toolkit**：计划约定由 conda 的 **`cuda-version` 元包**覆盖 runtime 需求；全量安装 WSL `cuda-toolkit-*` 为可选，按需再补。

---

## 2. 本次操作完成了什么（工作项清单）

| 序号 | 工作项 | 状态 |
|------|--------|------|
| 1 | 新建 Git 分支 `phase-6-m2-rapids-env` 并在其上提交 M2 变更 | 完成 |
| 2 | 新增 **`scripts/env/rapids_env.yml`**：声明 `name: chronicle`、`channels`、`dependencies`（与 §1 对齐） | 完成 |
| 3 | 新增 **`scripts/env/install_chronicle_conda_env.sh`**：无 sudo、可重复执行；自动安装 Miniforge3（若尚无 mamba）；`mamba env create` / `update`；默认 cuml/UMAP 冒烟；失败时打印 pip 回退说明 | 完成 |
| 4 | 修改 **`scripts/env/bootstrap_wsl.sh`**：M1 结束日志中「下一步」改为指向 M2 安装脚本与 `rapids_env.yml` | 完成 |
| 5 | 在本仓库会话中 **未实际跑通** WSL 内 `mamba env create`（宿主侧 WSL/代理不可用）；**须在用户 WSL 中本机验证**（见 §5） | 记录为限制 |
| 6 | Plan 前端 matter 中 **M2 todo** 标为 **`completed`** | 完成 |

---

## 3. 交付文件说明

### 3.1 `scripts/env/rapids_env.yml`

- **作用**：单一事实来源（SSOT），描述 `chronicle` conda 环境的名称、通道顺序与依赖钉扎。
- **要点**：
  - `channels`: `rapidsai` → `conda-forge` → `nvidia`
  - `dependencies` 包含：`python=3.11`、`cuda-version=12.5`、`cuml=25.*`、`pytorch`、`pytorch-cuda=12.*`、`sentence-transformers`、`joblib`、`tqdm`、`pandas`、`numpy`、`scikit-learn`
- **手工创建环境**（不跑脚本时）：在仓库根目录执行  
  `mamba env create -f scripts/env/rapids_env.yml`

### 3.2 `scripts/env/install_chronicle_conda_env.sh`

- **作用**：M2 的「一键」入口：保证 `mamba` 可用 → 按 yml 创建或更新环境 → 可选冒烟。
- **行为摘要**：
  - 若 `PATH` 中已有 `mamba`，直接使用。
  - 否则若 **`~/miniforge3/bin/mamba`**（或 **`CHRONICLE_MINIFORGE_HOME`** 指向的前缀下的 `bin/mamba`）存在，则将其加入 `PATH`。
  - 否则：按 **`uname -m`** 下载 **Miniforge3**（`x86_64` / `aarch64`）并 **`-b -p`** 安装到 **`CHRONICLE_MINIFORGE_HOME`**，默认 **`$HOME/miniforge3`**。
  - **已存在 `chronicle` 环境**（通过 `mamba run -n chronicle true` 判断）：默认 **不覆盖**，打印提示：用 `--update` 或先 `mamba env remove -n chronicle -y`。
  - **`--update`**：`mamba env update -n chronicle -f rapids_env.yml --prune -y`，然后冒烟（除非 `--skip-smoke`）。
  - **新建成功后**：运行  
    `mamba run -n chronicle python -c "import cuml; from cuml.manifold import UMAP; print('cuml UMAP smoke OK')"`  
    成功即视为 M2 冒烟通过。
  - **`mamba env create` 失败**：输出错误信息后调用 **`print_pip_fallback_hint`**：给出示例 pip/venv 步骤、`cuml-cu12` 等思路，并指向 **RAPIDS 官方安装文档**（版本钉需以当时 Release Selector 为准）。

### 3.3 `scripts/env/bootstrap_wsl.sh`（增量修改）

- **变更**：M1 完成后最后一行指引由泛化描述改为明确命令：  
  `bash scripts/env/install_chronicle_conda_env.sh`（并注释说明使用 `scripts/env/rapids_env.yml`）。

---

## 4. 与计划验收标准的对应关系

| Plan / M2 要求 | 实现方式 |
|----------------|----------|
| Miniforge + mamba | 安装脚本拉取官方 Miniforge3 并将 `mamba` 置于 `PATH` |
| `chronicle` env + 指定 channels 与包 | `rapids_env.yml` + `mamba env create/update` |
| 冒烟 `import cuml` + `UMAP` | `install_chronicle_conda_env.sh` 默认 smoke（可 `--skip-smoke`） |
| `rapids_env.yml` 写入仓库 | 已提交 |
| conda 失败 → pip fallback | `create` 失败时打印提示；具体 pin 以官方文档为准 |

---

## 5. 推荐验证步骤（在用户 WSL2 Ubuntu 上）

以下应在 **克隆到 WSL 文件系统内的仓库**（例如 `~/chronicle_v3_3d_galaxy`）中执行，并已满足 **GPU 驱动 + WSL 内 `nvidia-smi`**（M1 可选脚本已覆盖的系统级准备）：

```bash
cd /path/to/chronicle_v3_3d_galaxy
git checkout phase-6-m2-rapids-env   # 或已合入后的 main
bash scripts/env/install_chronicle_conda_env.sh
```

**期望结果**：

- `mamba env create` 成功结束；
- 终端出现 **`cuml UMAP smoke OK`**；
- 之后可 `mamba activate chronicle` 进行 M3/M4 及后续管线工作。

**若求解失败**：按脚本输出的 pip 回退说明操作，或打开 [RAPIDS 安装文档](https://docs.rapids.ai/install/) 用 Release Selector 生成与当前 CUDA 驱动匹配的 pip/conda 组合，再酌情回写 `rapids_env.yml`（需另开变更与评审）。

---

## 6. 已知限制与后续里程碑

| 项目 | 说明 |
|------|------|
| 自动化环境内未跑通 mamba | 当前开发环境无法稳定启动 WSL bash，故 **未** 在本机完成 end-to-end 求解与 GPU 实测；以用户 WSL 验证为准。 |
| 与 PyTorch / CUDA 的联合求解 | 不同月份 rapidsai 与 conda-forge 索引可能微调可解集合；若长期失败，以官方 Release Selector 为准调整 `cuda-version` 或 `pytorch-cuda` 小版本。 |
| 下一里程碑 **M3** | 拆分 `requirements.cpu.txt` / `requirements.gpu.txt`（或等价方案），与 conda 规格互补，保留 Windows CPU 回退路径。 |

---

## 7. Plan 中 M2 todo 状态

在 [`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) 的前置 YAML 中，**`id: m2-rapids-env`** 的 **`status`** 已设置为 **`completed`**。

---

*本报告对应 Phase 6 GPU 迁移计划里程碑 M2；与 M1 报告（Phase 6.0.8.1）衔接。*
