# Phase 6.0.8.1 M1 WSL 基础环境 bootstrap 实施报告

> **关联计划**: `.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md` — 里程碑 **M1（§8.3.1）**  
> **上游依据**: `docs/reports/Phase 6.0 项目回顾与下一阶段规划报告.md` §8「管线全链路 GPU 化」  
> **报告日期**: 2026-04-21  
> **范围**: WSL Ubuntu 侧**基础依赖与 Python 3.11 工具链**的幂等安装脚本、仓库 `.gitignore` 修正、Git 分支与提交记录；**不包含** M2 conda/RAPIDS、管线代码改造或 WSL 内实机跑通验证（后者由用户在目标机器执行脚本后确认）

---

## 1. 摘要

本次工作完成 Phase 6 §8 的 **M1**：在仓库中新增 **幂等** Shell 脚本 `scripts/env/bootstrap_wsl.sh`，用于在 **WSL2 Ubuntu** 上以 `sudo` 执行 `apt` 更新与基础包安装、安装 **Python 3.11**（默认源不可用时自动配置 **deadsnakes PPA**）、配置 **`python3.11 -m venv`** 相关包与 **pip**，并在默认模式下调用 **`nvidia-smi`** 确认 **GPU 在 WSL 内可见**。

同步修正根目录 `.gitignore`：原规则 `env/` 会匹配任意路径下的 `env` 目录，导致 `scripts/env/` 被误忽略；改为仅忽略仓库根目录的 **`/env/`**（常见本地 venv 目录名），使 `scripts/env/bootstrap_wsl.sh` 可被 Git 跟踪。

Git 工作流：在 **`main`** 上新建分支 **`phase6/m1-wsl-bootstrap`** 后提交变更；开发计划 YAML 中 **`m1-wsl-base`** 的 todo 状态已设为 **`completed`**。

---

## 2. 与计划 M1 的对照

| 计划要求（M1 / §8.3.1） | 实施结果 |
| --- | --- |
| `apt update` / `upgrade` | `apt-get update`；默认执行非交互 **`apt-get upgrade`**（`--force-confdef` / `--force-confold`）；支持 **`--skip-apt-upgrade`** 跳过全量升级以便快速重跑 |
| `git`、`build-essential`、`curl`、`ca-certificates` | **`apt-get install -y`** 一次性安装上述包，以及 **`software-properties-common`**（供 `add-apt-repository` 使用） |
| Python **3.11+**，必要时 **deadsnakes PPA**；**pip**、**venv** | 若已有可用 **`python3.11`** 则跳过安装；否则优先尝试默认源安装 **`python3.11` / `python3.11-venv` / `python3.11-dev`**；若无候选包则**幂等**检测 PPA 是否已存在，再 **`add-apt-repository -y ppa:deadsnakes/ppa`** 并安装。pip：优先 **`ensurepip`**，失败则 **`get-pip.py`**，最后 **`pip install --upgrade pip setuptools wheel`** |
| 确认 WSL 内 **`nvidia-smi`** 可见 GPU | 默认在脚本末尾执行 **`nvidia-smi`**；支持 **`--skip-nvidia-check`**（仅用于无 GPU 或驱动未就绪时的调试，脚本会打印明确警告语义） |
| 产出幂等脚本 **`scripts/env/bootstrap_wsl.sh`** | 已交付，路径与计划一致，仓库内 **`100755`** 可执行位 |

---

## 3. 执行操作清单（按时间顺序）

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 阅读 Phase 6 GPU 迁移 plan | 确认 M1 交付物与工程原则（sudo、幂等、不破坏 Windows 管线等） |
| 2 | **`git checkout -b phase6/m1-wsl-bootstrap`** | 自 **`origin/main`** 同步的 **`main`** 新建功能分支，满足「先开分支再改」的约定 |
| 3 | 新增 **`scripts/env/bootstrap_wsl.sh`** | Bash、`set -euo pipefail`；解析 **`--skip-apt-upgrade`** / **`--skip-nvidia-check`**；非 root 时提示使用 **`sudo bash …`** |
| 4 | 修改 **`.gitignore`** | **`env/`** → **`/env/`**，解除对 **`scripts/env/`** 的误匹配 |
| 5 | Git 提交（脚本 + gitignore） | 见 §7 提交哈希 |
| 6 | 更新 **`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`** | **`m1-wsl-base`**：`pending` → **`completed`** |
| 7 | Git 提交（plan 状态） | 见 §7 |
| 8 | 本报告 | 归档 M1 操作全貌与复现路径 |

---

## 4. 交付物说明（脚本行为摘要）

脚本入口与选项（与文件头注释一致）：

- **用法**：在 WSL 内进入仓库根目录后执行 **`sudo bash scripts/env/bootstrap_wsl.sh`**
- **`--skip-apt-upgrade`**：只做 **`apt-get update`** 与安装步骤，跳过 **`apt-get upgrade`**
- **`--skip-nvidia-check`**：不强制 **`nvidia-smi`**（脚本仍会完成 apt / Python 安装）

主要函数阶段（便于审阅与二次扩展）：

| 阶段 | 职责 |
| --- | --- |
| **`require_root`** | 要求 root（**`EUID`**），否则打印示例命令并退出 |
| **`detect_wsl`** | 读取 **`/proc/version`** 是否含 **`microsoft`**；非 WSL 仅警告，不中断 |
| **`apt_update` / `apt_upgrade_optional`** | 更新索引；可选全系统升级 |
| **`install_base_packages`** | 基础构建与网络工具链 |
| **`ensure_python311`** | 3.11 与 venv/dev 头文件；deadsnakes 分支幂等 |
| **`ensure_pip_for_py311`** | pip 引导与版本升级 |
| **`check_nvidia_smi`** | GPU 可见性门禁（可跳过） |

脚本结尾提示下一步为 **M2**（conda **`chronicle`** 环境与 **`scripts/env/rapids_env.yml`**，该文件在 M2 交付，本里程碑不包含）。

---

## 5. 验证步骤（建议在 WSL 实机执行）

以下步骤用于在目标 Ubuntu WSL 实例上**复验** M1；在仅 Windows、未配置 WSL GPU 驱动的环境中，可能需在 **`--skip-nvidia-check`** 下先验证 apt/Python 部分。

1. 将包含本提交的仓库置于 WSL 文件系统（推荐后续 M6 所述的 **`~/chronicle_v3_3d_galaxy`**；当前也可从 **`/mnt/e/...`** 试跑，仅 IO 可能较慢）。
2. 确保 Windows 侧已安装支持 **WSL GPU** 的 NVIDIA 驱动（官方文档所述「WSL 专用」分支）。
3. 在 WSL 中执行：

```bash
cd /path/to/chronicle_v3_3d_galaxy
sudo bash scripts/env/bootstrap_wsl.sh
```

4. 预期：无错误退出；末尾 **`nvidia-smi`** 输出 GPU 表；**`python3.11 -V`** 与 **`python3.11 -m pip --version`** 可用。

可选快速重跑（已装包机器）：

```bash
sudo bash scripts/env/bootstrap_wsl.sh --skip-apt-upgrade
```

---

## 6. 变更文件一览

| 路径 | 变更类型 | 说明 |
| --- | --- | --- |
| `scripts/env/bootstrap_wsl.sh` | 新增 | M1 幂等 bootstrap 脚本（可执行位 **755**） |
| `.gitignore` | 修改 | `env/` → **`/env/`**，避免忽略 **`scripts/env/`** |
| `.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md` | 修改 | **`m1-wsl-base`** 状态 **`completed`** |
| `docs/reports/Phase 6.0.8.1 M1 WSL 基础环境 bootstrap 实施报告.md` | 新增 | 本报告 |

---

## 7. Git 分支与提交（便于追溯）

| 项 | 值 |
| --- | --- |
| 分支名 | **`phase6/m1-wsl-bootstrap`** |
| 相关提交（示例） | **`ef34931`** — `feat(env): add idempotent WSL bootstrap script for Phase 6 M1`（脚本 + `.gitignore`）；**`36615a5`** — `chore(plan): mark Phase 6 M1 (WSL bootstrap) completed`（plan todo） |

*注：若读者在合并后使用 **`main`**，请以 **`git log -- scripts/env/bootstrap_wsl.sh`** 在本地为准。*

---

## 8. 限制与后续工作

| 项 | 说明 |
| --- | --- |
| Windows 侧未执行脚本 | M1 脚本设计在 **WSL Ubuntu** 运行；开发机在纯 Windows 下可能无法 **`bash -n`** 或实跑（取决于是否安装 WSL/bash） |
| M2 及以后 | **Miniforge/mamba**、**`chronicle`** conda 环境、**`rapids_env.yml`**、**cuML** 冒烟、管线 **`--backend cuml`** 等均在后续里程碑 |
| 计划 todo | **`m1-wsl-base`** 在 **`phase_6_gpu_migration_202aac8f.plan.md`** 中已为 **`completed`**；其余 **M2–M9** 仍为 **`pending`** |

---

## 9. 参考资料

- `.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`
- `docs/reports/Phase 6.0 项目回顾与下一阶段规划报告.md` §8
- `scripts/env/bootstrap_wsl.sh`（源码即文档）
