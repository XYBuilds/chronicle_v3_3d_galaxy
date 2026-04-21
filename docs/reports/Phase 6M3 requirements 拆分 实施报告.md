# Phase 6M3 — requirements 拆分（CPU / GPU）实施报告

## 文档信息

| 项目          | 内容                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| 对应计划      | [`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) |
| 里程碑        | **M3（§8.3.4）** — 拆分 `requirements.cpu.txt` / `requirements.gpu.txt`，保留 Windows CPU 回退                                   |
| 主要 Git 分支 | `phase-6-m3-req-split`（相对 `main` 新开；合入后以主分支历史为准）                                                  |

---

## 本次操作概要（做了什么）

本次 M3 在仓库根目录将 **单一 `requirements.txt`** 拆成 **CPU 钉扎文件 + GPU 说明文件**，并保持 **`pip install -r requirements.txt` 与迁移前安装同一套 pip 依赖**，以满足计划要求：Windows `.venv` 仍能跑 Phase 1 + CPU UMAP；WSL 仍以 conda `chronicle` 环境为主（见 M2 的 `rapids_env.yml`）。

| 序号 | 操作 |
| ---- | ---- |
| 1 | 新增 **`requirements.cpu.txt`**：承接原 `requirements.txt` 内全部包钉扎与注释（`pandas` / `numpy` / `sentence-transformers` / `torch` / `umap-learn` / `scikit-learn` / `joblib` / `tqdm` 等）。 |
| 2 | 将 **`requirements.txt`** 改为薄封装：说明默认用途 + **`-r requirements.cpu.txt`**，避免各处文档仍写 `requirements.txt` 时出现两套不一致的钉扎。 |
| 3 | 新增 **`requirements.gpu.txt`**：说明 GPU 路径以 **`scripts/env/rapids_env.yml`**（及 `install_chronicle_conda_env.sh`）为准；conda 已覆盖主要依赖，故该文件**无默认 pip 包行**，仅在日后需要 pip-only 补丁时按需追加。 |
| 4 | 更新 **`.cursor/rules/python-pipeline.mdc`**「Dependencies」：指明钉扎落在 `requirements.cpu.txt`，并引用 conda 与 `requirements.gpu.txt`。 |
| 5 | 在 **`scripts/env/rapids_env.yml`** 头部注释中增加与 **`requirements.gpu.txt`** 的交叉说明（激活环境后慎用额外 pip，避免与 RAPIDS 栈冲突）。 |
| 6 | 在计划文件中将 **`m3-req-split`** 的 todo 标为 **`completed`**（见下文 §4）。 |

**未改动**：管线 Python 源码（`scripts/feature_engineering/` 等）；M4 才涉及 `umap_projection.py` 的 backend 开关。

---

## 1. 背景与目标

按计划 §8.3.4：在 **M2 已提供 `scripts/env/rapids_env.yml`** 的前提下，将原先单一的 `requirements.txt` 拆成：

1. **Windows `.venv` / CPU 管线**：继续使用与历史一致的 pip 约束（`umap-learn` 等），`pip install -r requirements.txt` 行为不变。
2. **WSL `chronicle` conda 环境**：以 **conda 为主**；`requirements.gpu.txt` 仅承载 **pip 补集**（当前 mamba 已覆盖主要包，故文件以说明为主、无默认包行）。

---

## 2. 本次交付

| 文件 | 作用 |
| ---- | ---- |
| `requirements.cpu.txt` | 原 `requirements.txt` 中的钉扎与注释原样迁入，作为 **CPU 侧 canonical pins** |
| `requirements.txt` | 薄封装：`#` 说明 + `-r requirements.cpu.txt`，保证既有文档与习惯中的 `pip install -r requirements.txt` 仍解析到同一依赖集 |
| `requirements.gpu.txt` | 指向 `rapids_env.yml` / `install_chronicle_conda_env.sh`；预留按需追加 pip-only 行 |
| `.cursor/rules/python-pipeline.mdc` | Dependencies 小节改为指向 `requirements.cpu.txt` + conda/gpu 文件 |
| `scripts/env/rapids_env.yml` | 头部注释增加 M3 与 `requirements.gpu.txt` 的交叉说明 |

---

## 3. 验收与推荐自测

| 检查项 | 说明 |
| ------ | ---- |
| Windows CPU 路径 | 在新 `.venv` 中执行 `pip install -r requirements.txt`，应安装与此前一致的包集合（含 `umap-learn`） |
| 解析一致性 | `requirements.txt` 通过 include 引用 `requirements.cpu.txt`，无重复钉扎 |

**本机（Windows）可选命令**：

```powershell
python -m venv .venv-test-m3
.\.venv-test-m3\Scripts\Activate.ps1
pip install -r requirements.txt
```

期望：安装成功且无 ImportError（可按需对 `pandas`/`numpy` 做快速 `import` 检查）。测试用 venv 可事后删除。

---

## 4. Plan 中 M3 todo 状态

在 [`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) 的前置 YAML 中，**`id: m3-req-split`** 的 **`status`** 已设置为 **`completed`**。

---

## 5. 下一里程碑

**M4**：`scripts/feature_engineering/umap_projection.py` 增加 `--backend {umap,cuml}` 等（见计划 `m4-umap-backend`）。

---

*本报告对应 Phase 6 GPU 迁移计划里程碑 M3；与 Phase 6M2 报告衔接。*
