# Phase 6M7 之后的数据处理流程

## 1. 目标与适用范围

本文用于承接 M7（子样本冒烟）之后的实际数据推进，目标是把流程从“已验证可跑”推进到“可交付全量产物并可复现”。

适用场景：
- 已具备 WSL Ubuntu + `chronicle` conda 环境；
- 已完成 M7 级别的子样本联调；
- 准备执行全量重训（M8）或在此之前做一次更稳妥的预跑。

---

## 2. 产物约定（做之前先确认）

核心输入：
- 原始数据：`data/raw/TMDB_all_movies.csv`
- （可选）子样本数据：`data/subsample/tmdb2025_random20.csv`

核心输出：
- 中间产物：`data/output/*.npy`（包含 `umap_xy.npy` 等）
- 前端数据：`frontend/public/data/galaxy_data.json` 与 `frontend/public/data/galaxy_data.json.gz`

---

## 3. 标准执行流程

### Step 0：切分支并做基线保护

建议在仓库根目录（Windows 侧）执行：

```powershell
git checkout -b phase-6-m8-full-retrain
git status
```

如果当前前端 JSON 是线上可用版本，先做备份：

```powershell
Copy-Item "frontend/public/data/galaxy_data.json" "frontend/public/data/galaxy_data.pre-m8.json"
Copy-Item "frontend/public/data/galaxy_data.json.gz" "frontend/public/data/galaxy_data.pre-m8.json.gz"
```

> 说明：备份文件是否提交由你决定；通常建议仅本地留存，避免仓库噪音。

---

### Step 1：进入 WSL 并确认环境健康

```bash
wsl -d Ubuntu
export PATH="$HOME/miniforge3/bin:$PATH"
mamba run -n chronicle python -V
mamba run -n chronicle python -c "import cuml, umap, sklearn; print('deps_ok')"
nvidia-smi
```

通过标准：
- `chronicle` 环境可用；
- `cuml` / `umap` / `sklearn` 均可导入；
- `nvidia-smi` 能看到 GPU。

---

### Step 2：先做一次“全参数预跑”（建议）

先用子样本验证你将要用于全量的参数组合（尤其是 `densmap` + `n_neighbors=100`）：

```bash
cd /mnt/e/projects/chronicle_v3_3d_galaxy
mamba run -n chronicle python scripts/run_pipeline.py \
  --input data/subsample/tmdb2025_random20.csv \
  --through-phase-2 \
  --umap-backend cuml \
  --densmap \
  --n-neighbors 100 \
  --min-dist 0.4

mamba run -n chronicle python scripts/validate_galaxy_json.py \
  --input frontend/public/data/galaxy_data.json
```

通过后再进入全量，能显著降低长任务失败成本。

---

### Step 3：执行 M8 全量重训

```bash
cd /mnt/e/projects/chronicle_v3_3d_galaxy
/usr/bin/time -f "elapsed_sec %e" \
mamba run -n chronicle python scripts/run_pipeline.py \
  --through-phase-2 \
  --umap-backend cuml \
  --densmap \
  --n-neighbors 100 \
  --min-dist 0.4
```

建议同时记录：
- 起止时间；
- `nvidia-smi` 显存占用峰值（可每 10~30s 观察一次）；
- 控制台中 UMAP backend 与 fallback 提示。

---

### Step 4：结果校验（必须）

#### 4.1 数据结构校验

```bash
mamba run -n chronicle python scripts/validate_galaxy_json.py \
  --input frontend/public/data/galaxy_data.json
```

#### 4.2 前端构建校验（Windows 侧）

```powershell
npm run build
```

#### 4.3 视觉抽检（Windows 侧）

```powershell
npm run dev
```

抽检要点：
- 页面能加载，控制台无 JSON 结构报错；
- 点云分布无明显“塌缩成单点/单线”异常；
- 随机点开电影详情，字段完整（title / overview / genres 等）。

---

### Step 5：回写与同步（如你在 WSL home 跑）

如果你不是在 `/mnt/e/...` 直接运行，而是在 `~/chronicle_v3_3d_galaxy` 跑训练，记得同步产物：

```bash
cd ~/chronicle_v3_3d_galaxy
bash scripts/env/sync_artifacts_to_windows.sh
```

同步后在 Windows 仓库再次执行一次：

```powershell
git status
```

确认只出现你预期的产物/脚本变更。

---

## 4. 异常分支处理（简版）

- `densmap + cuml` 提示不支持：当前实现会在必要时回退 `umap-learn`，可继续执行，但要在报告中注明“Phase 2.4 实际后端”。
- 小样本出现 non-finite：已存在 CPU fallback 逻辑；若全量仍触发，优先记录参数与日志，再决定是否降低 `n_neighbors` 或调整 `min_dist`。
- OOM：先减小 embedding batch（不要丢样本），其次再评估 UMAP 参数或分段处理策略。

---

## 5. 完成定义（DoD）

满足以下条件即可认为“后续数据处理”阶段完成，可进入报告与计划状态更新：
- 全量命令成功退出（非子样本）；
- `validate_galaxy_json.py` 通过；
- `npm run build` 通过，`npm run dev` 视觉抽检通过；
- 关键耗时/显存/参数已记录；
- 已确认哪些文件需要提交，哪些仅本地保留。

