# Phase 0 CUDA PyTorch 环境 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 0（环境补全）  
> **规范依据**: `requirements.txt` 内 PyTorch 安装说明；`.cursor/rules/python-pipeline.mdc`（CUDA 轮子索引）  
> **报告日期**: 2026-04-12  
> **范围**: 本次会话内对虚拟环境 PyTorch / CUDA 的检查、计划要求的 Checkpoint 验证、开发计划 todo 状态更新（不涉及 Phase 1 及以后代码交付）

---

## 1. 摘要

本次工作对应开发计划中的 **Phase 0 — 环境补全**：确认项目根目录下 **`.venv`** 已使用 **带 CUDA 的 PyTorch 官方轮子**（非 PyPI 默认 CPU 构建），并在本机执行计划规定的 **GPU 可用性 Checkpoint**。验证结果为 **`torch.cuda.is_available()` 为 `True`**，且能正确读取 **GPU 设备名称**，满足计划中「若为 `False` 则阻塞，不得进入 Phase 2」的前置条件。

当前仓库内 **无需** 再执行「卸载 CPU 版 torch → 自 CUDA 索引重装」的步骤；若在其他机器从零搭建环境，可按本文 §6 复现安装命令。

同时在 `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` 中将 todo **`p0-cuda-torch`** 标记为 **`completed`**。

---

## 2. 执行操作清单

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 阅读开发计划 | 确认 Phase 0 目标：CUDA 版 PyTorch、Checkpoint 命令与通过标准 |
| 2 | 阅读仓库规则 | `project-overview.mdc`、`data-protection.mdc`、`python-pipeline.mdc`（CUDA 索引 `cu128` 约定） |
| 3 | 核对 `requirements.txt` | 确认 `torch` 版本范围及注释中的 CUDA 安装示例索引 |
| 4 | 终端探测（PowerShell） | 首次使用 `cd /d … &&` 语法失败（非 cmd）；改为 `Set-Location` + 分号链式执行后成功 |
| 5 | 检查已安装 torch | `import torch`：版本 **`2.11.0+cu128`**，`torch.cuda.is_available()` 已为 **`True`** |
| 6 | 执行计划 Checkpoint | 与计划原文一致的 `print(torch.cuda.is_available(), torch.cuda.get_device_name(0))` |
| 7 | 更新开发计划 todo | `p0-cuda-torch`：`pending` → **`completed`** |

---

## 3. 与开发计划的对照

开发计划 Phase 0 原文要点与本次结果对比如下。

| 计划要求 | 本次结果 |
| --- | --- |
| 卸载 CPU 版 torch，安装 CUDA 版（`pip install torch --index-url https://download.pytorch.org/whl/cu…`） | 本机 `.venv` **已是** `+cu128` 构建，**未**执行卸载重装，避免无意义变更 |
| Checkpoint：`.venv/Scripts/python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"` → 须输出 `True` 与显卡型号 | 输出为 **`True NVIDIA GeForce RTX 3070`**，**通过** |
| 若为 `False` 则阻塞，不得进入 Phase 2 | **不适用**（已通过） |

---

## 4. 验证命令与输出（可复现）

在项目根目录 `e:\projects\chronicle_v3_3d_galaxy` 下执行（Windows，虚拟环境已激活或直接使用解释器路径均可；以下为**直接调用 venv 内 Python** 的写法，与计划等价）：

```powershell
Set-Location e:\projects\chronicle_v3_3d_galaxy
.\.venv\Scripts\python.exe -c "import torch; print(torch.version.__version__); print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

**本次会话中实际观测到的输出（节选含义）**：

- 版本行：`2.11.0+cu128`
- Checkpoint 行：`True NVIDIA GeForce RTX 3070`

计划中的最小 Checkpoint（不含版本号）为：

```powershell
.\.venv\Scripts\python.exe -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

---

## 5. 环境与版本信息（会话当时）

| 项 | 值 |
| --- | --- |
| 操作系统 | Windows（`win32`，PowerShell） |
| Python 虚拟环境 | 项目根目录 `.venv` |
| PyTorch | `2.11.0+cu128`（CUDA 12.8 官方轮子族） |
| `torch.cuda.is_available()` | `True` |
| GPU 名称 | `NVIDIA GeForce RTX 3070` |

*注：换机或驱动/CUDA 运行时变更后，应以当时机器上的上述命令输出为准。*

---

## 6. 新环境从零安装 CUDA PyTorch（参考）

若在新克隆的仓库或新机器上，`pip install -r requirements.txt` 得到的是 **CPU** 构建（常见表现为无 `+cu128` 后缀且 `cuda.is_available()` 为 `False`），可按仓库注释与 `python-pipeline.mdc` 建议，在已激活的 `.venv` 中执行（版本以 [PyTorch 官网](https://pytorch.org/get-started/locally/) 当前推荐为准；以下为与仓库文档一致的 **cu128** 示例）：

```powershell
python -m pip uninstall torch torchvision torchaudio -y
python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

安装后务必再次运行 §4 的 Checkpoint。

---

## 7. 计划与文档变更

| 路径 | 变更 |
| --- | --- |
| `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` | frontmatter 中 `p0-cuda-torch` 的 `status` 更新为 **`completed`** |
| `docs/reports/Phase 0 CUDA PyTorch 环境 实施报告.md` | **本报告**（新增） |

---

## 8. 结论与后续

- **Phase 0 目标已达成**：CUDA 版 PyTorch 可用，Checkpoint 通过，开发计划对应 todo 已关闭。
- **建议下一步**：按计划进入 **Phase 1**（Python 数据清洗管线统一编排等），Phase 2 的 GPU 编码依赖本阶段结论。
