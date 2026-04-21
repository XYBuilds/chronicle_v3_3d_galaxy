# Phase 6M3 — requirements 拆分（CPU / GPU）实施报告

## 文档信息

| 项目          | 内容                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| 对应计划      | [`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) |
| 里程碑        | **M3（§8.3.4）** — 拆分 `requirements.cpu.txt` / `requirements.gpu.txt`，保留 Windows CPU 回退                                   |
| 主要 Git 分支 | `phase-6-m3-req-split`（相对 `main` 新开；合入后以主分支历史为准）                                                  |

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
