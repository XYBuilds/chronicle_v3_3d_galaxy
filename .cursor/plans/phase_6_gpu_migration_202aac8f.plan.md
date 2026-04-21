---
name: phase 6 gpu migration
overview: 将整条 Python 数据管线（Phase 1 清洗 → 2.1 embedding → 2.2/2.3 one-hot → 2.4 融合+UMAP → 2.5 JSON 导出）从 Windows `.venv` 全链路迁移到 WSL2 Ubuntu + RAPIDS cuML（conda-first），使 `cuml.manifold.UMAP(n_neighbors=100, densmap=True)` 可行，解锁 Issue I1 的根治重训，并为未来重训提供可复用基础设施。
todos:
  - id: m1-wsl-base
    content: "M1 (§8.3.1): WSL Ubuntu 基础环境 bootstrap — apt update/upgrade、git、build-essential、curl、ca-certificates、python3.11+ (或 deadsnakes PPA)、pip、venv；确认 `nvidia-smi` 在 WSL 内可见 GPU。产出幂等脚本 `scripts/env/bootstrap_wsl.sh`。"
    status: completed
  - id: m2-rapids-env
    content: "M2 (§8.3.3): 安装 Miniforge (mamba) → 创建 conda env `chronicle`，`mamba create -n chronicle -c rapidsai -c conda-forge -c nvidia cuml=25.* python=3.11 cuda-version=12.5 pytorch pytorch-cuda=12.* sentence-transformers joblib tqdm pandas numpy scikit-learn`；冒烟 `python -c 'import cuml; from cuml.manifold import UMAP'`。写 `scripts/env/rapids_env.yml`。若失败 fallback pip wheels 分支。（§8.3.2 CUDA toolkit 因 conda cuda-version 元包包含 runtime，退化为可选，按需补 `cuda-toolkit-wsl-ubuntu`。）"
    status: completed
  - id: m3-req-split
    content: "M3 (§8.3.4): 拆分依赖 — 保留 `requirements.txt` 作为 Windows CPU 回退（重命名为 `requirements.cpu.txt` 或保持原名 + 注释）；新增 `requirements.gpu.txt` 作为 conda env 的 pip 补集（若 mamba 已覆盖则仅注释指向 `scripts/env/rapids_env.yml`）。Windows `.venv` 运行 Phase 1 + CPU UMAP 必须仍通过。"
    status: completed
  - id: m4-umap-backend
    content: "M4 (§8.3.5): 重构 `scripts/feature_engineering/umap_projection.py` — 新增 `--backend {umap,cuml}`（默认按 `CUDA_VISIBLE_DEVICES` 自动选）、`--densmap`、`--n-neighbors`；cuml 分支用 `cuml.manifold.UMAP(output_type='numpy', densmap=args.densmap, n_neighbors=nn, ...)`；输出保持 `(n, 2) float32`；`umap_model.pkl` 对 cuml 走 `joblib.dump(reducer)` 或跳过（cuml estimator 可 pickle，但 transform 路径差异在报告里注明）。单元级 CLI smoke：`python umap_projection.py --backend cuml --densmap --n-neighbors 50` 在子样本上跑通。"
    status: pending
  - id: m5-pipeline-export
    content: "M5 (§8.3.6 + meta 同步): (a) `scripts/run_pipeline.py:41-55` `run_phase2_through_export()` 增加 `backend/densmap/n_neighbors` 透传；CLI 加 `--umap-backend`、`--densmap`、`--n-neighbors`、`--cpu`（强制 umap-learn 回退）；(b) `scripts/export/export_galaxy_json.py:179-187, :350-355` CLI 加 `--densmap`，`meta.umap_params` 写入 `densmap: bool`；(c) 同步前端 `galaxy_data.json` schema 类型（如有 `frontend/src/data/types.ts`）；(d) `scripts/validate_galaxy_json.py` 兼容新字段。"
    status: pending
  - id: m6-code-layout
    content: "M6 (§8.3.7): 代码/数据 WSL 布局 — `git clone` 到 `~/chronicle_v3_3d_galaxy`（而非 `/mnt/e/` 直挂，避免 ext4/ntfs IO 差）；`data/raw/TMDB_all_movies.csv` 从 Windows 侧 rsync 到 WSL 目录（或建软链 `data/raw -> /mnt/e/...`，由 agent 评估后选一）；产物回写策略：`scripts/env/sync_artifacts_to_windows.sh` 把 `data/output/*.npy`、`frontend/public/data/galaxy_data.json(.gz)` rsync 回 `/mnt/e/projects/chronicle_v3_3d_galaxy/...`；CRLF / 权限 / `.gitignore` 冲突在此统一处理。"
    status: pending
  - id: m7-smoke
    content: "M7 (§8.3.8): 子样本端到端冒烟 — 在 WSL `chronicle` env 里 `python scripts/run_pipeline.py --input data/subsample/tmdb2025_random20.csv`（Phase 2.6 auto path），验证 cuml UMAP 分支走通，产物 `galaxy_data.json` 经 `validate_galaxy_json.py` 通过；回写到 Windows `/mnt/e/.../frontend/public/data/`，`npm run dev` 加载无错。记录 GPU 显存/耗时基线。产出 `Phase 6M7 ... 实施报告.md`。"
    status: pending
  - id: m8-full-retrain
    content: "M8 (§8.3.9): 全量 59K 重训（I1 的实际发动） — `python scripts/run_pipeline.py --through-phase-2 --umap-backend cuml --densmap --n-neighbors 100 --min-dist 0.4`；备份旧产物 `cp data/output/umap_xy.npy data/output/umap_xy.umap-learn.npy`；记录耗时、GPU 显存峰值、`xy_range` 变化；回写到 Windows 侧并在前端肉眼复测（I1 子任务的接力点）。产出 `Phase 6M8 ... 实施报告.md` + I1 复测记录（I1 完整修复属另一 plan）。"
    status: pending
  - id: m9-docs
    content: "M9 (§8.3.10 + I6 联动): 文档同步 — (a) Tech Spec §2 数据管线章节追加 'Backend: umap-learn (CPU, Windows) / cuML (GPU, WSL)' 分支；(b) 根 README 的 '运行管线' 小节加 WSL 路径（首次运行 `scripts/env/bootstrap_wsl.sh` → `mamba activate chronicle` → `python scripts/run_pipeline.py ...`）；(c) `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` 更新 `meta.umap_params.densmap` schema；(d) 归档本 §8 的总结到 `docs/reports/Phase 6M9 GPU 迁移 §8 总结报告.md`，为 Phase 6.0 I1–I6 的下一份 plan 提供交接面。"
    status: pending
isProject: false
---

# Phase 6.0 §8 — 管线全链路 GPU 化（WSL Ubuntu）

> 依据 [docs/reports/Phase 6.0 项目回顾与下一阶段规划报告.md](docs/reports/Phase%206.0%20%E9%A1%B9%E7%9B%AE%E5%9B%9E%E9%A1%BE%E4%B8%8E%E4%B8%8B%E4%B8%80%E9%98%B6%E6%AE%B5%E8%A7%84%E5%88%92%E6%8A%A5%E5%91%8A.md) §8 "Phase 6.0 基础设施升级 · 管线全链路 GPU 化"。本 plan 为 Phase 6.0 的 enabler，独立于 I1–I6 的 feature plan（后者另行出计划）。

## 决策（本轮澄清）

- **迁移范围**：全链路（Phase 1 + 2.1 + 2.2/2.3 + 2.4 + 2.5）。Windows `.venv` 仍保留，但不再是主路径。
- **RAPIDS 安装方式**：**conda/mamba 优先**（rapidsai channel），失败 fallback pip wheels（`cuml-cu12`）。新建 conda env 名 `chronicle`。
- **代码/数据位置**：默认 clone 到 **WSL home `~/chronicle_v3_3d_galaxy`**；产物通过 rsync/cp 回写到 Windows 侧 `/mnt/e/projects/chronicle_v3_3d_galaxy/frontend/public/data/` 与 `data/output/`。
- **CPU 回退保留**：Windows 侧 `.venv` + `umap-learn` backend 作为 fallback；`requirements.txt` 拆分为 `.cpu.txt` / `.gpu.txt`，Windows 兼容性不破坏。

## 迁移流程图

```mermaid
flowchart TD
    Start[Windows pipeline: .venv + umap-learn CPU] --> M1[M1 WSL base env]
    M1 --> M2[M2 conda env chronicle with cuML + torch + ST]
    M2 --> M3[M3 requirements split cpu/gpu]
    M3 --> M4[M4 umap_projection.py backend switch]
    M4 --> M5[M5 run_pipeline.py + export_galaxy_json.py meta sync]
    M5 --> M6[M6 code/data layout in WSL home]
    M6 --> M7[M7 smoke test: subsample end-to-end on GPU]
    M7 --> M8[M8 full retrain 59K densmap n_neighbors=100]
    M8 --> M9[M9 docs: Tech Spec + README]
    M8 -->|triggers| I1[I1 visual recheck - separate plan]
```

## 关键文件与改动要点

- `scripts/feature_engineering/umap_projection.py` — 新增 `--backend {umap,cuml}`；cuml 分支支持 `--densmap` 与 `--n-neighbors=100`；输出 `(n, 2) float32` 保持不变
- `scripts/run_pipeline.py:41-55` `run_phase2_through_export()` — 透传 backend/densmap/n_neighbors；`--cpu` 强制回退到 `umap-learn`
- `scripts/export/export_galaxy_json.py:179-187` + `:350-355` — CLI 增加 `--densmap`；`meta.umap_params` 写入 `densmap` 布尔字段（前端 `galaxy_data.json` schema 同步扩展）
- `requirements.txt` → 拆 `requirements.cpu.txt`（Windows 现状）+ `requirements.gpu.txt`（注释指向 conda env）或 `environment.gpu.yml`
- 新增 `scripts/env/rapids_env.yml`（conda env 规格）+ `scripts/env/bootstrap_wsl.sh`（幂等安装脚本）
- `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` §2 管线章节 — 追加 GPU/WSL 分支；前端 `meta.umap_params.densmap` 在 [frontend/src/data/types.ts](frontend/src/data/types.ts) 同步（读前端类型若有）

## 工程原则（延续报告 §8.4）

- **agent 自治优先**；每次 sudo / 交互式输入前先请示用户
- **每个 M* 完成后单独产出一篇 `docs/reports/Phase 6Mn ... 实施报告.md`**（n 为里程碑序号，如 Phase 6M1、Phase 6M2）
- **不破坏现有 Windows 管线**：M3 完成前 Windows `.venv` 必须仍能运行 Phase 1 + CPU UMAP
- **数值结果差异**：cuML DensMAP 与 `umap-learn` 会有差异，旧 `umap_xy.npy` 备份为 `umap_xy.umap-learn.npy`，随报告留存

## 里程碑

- **M6.0.8.A — WSL GPU 管线就绪**：M1–M7 完成（子样本端到端在 WSL GPU 上跑通）
- **M6.0.8.B — I1 发动条件具备**：M8 全量重训完成，产物 `galaxy_data.json` 加载到前端
- **M6.0.8.C — 对外化基础**：M9 文档同步

## 风险与对策（延续报告 §8.5）

- **conda 解析/下载慢或失败** → fallback 到 pip wheels（`cuml-cu12`），保留 `scripts/env/bootstrap_wsl.sh` 里的 B 分支入口
- **WSL GPU 显存不足**（59K × ~800d + densmap）→ 先 M7 子样本实测占用；若超限，评估 `init='random' → 'spectral'` 切换 / PCA 前处理 / float32 强制
- **cuML 与 PyTorch CUDA ABI 冲突** → conda 一次性解析 `cuda-version` 元包，env 锁定
- **I3 / I4 若在 M8 重训后仍指向深度/拾取更大改造** → 不在本 §8 plan 内处理，按报告 §10.3 上升为 Phase 6.1 设计
