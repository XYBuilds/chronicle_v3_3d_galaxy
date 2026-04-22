# Chronicle v3 — TMDB 3D Galaxy

Monorepo：Python 数据管线（清洗 → 特征工程 → UMAP → `galaxy_data.json`）+ **Vite + React + Three.js** 前端。详细契约与算法见 [docs/project_docs/TMDB 电影宇宙 Tech Spec.md](docs/project_docs/TMDB%20电影宇宙%20Tech%20Spec.md)。

---

## 运行管线

### Windows（CPU / `umap-learn` 回退）

1. 创建并激活本地虚拟环境，例如 `python -m venv .venv`，再 `.\.venv\Scripts\activate`。
2. 安装依赖：`pip install -r requirements.txt`（其指向 `requirements.cpu.txt`）。
3. 跑通 Phase 1 清洗、或 Phase 1+2 至导出，例如：  
   `python scripts/run_pipeline.py --input data\raw\TMDB_all_movies.csv --through-phase-2`  
   全量 + GPU UMAP 不是此路径的默认主场景；`--umap-backend umap` 或 `--cpu` 可显式锁 CPU。

### WSL2 Ubuntu + GPU（cuML 主路径，首次环境）

1. **WSL 基础**（可重复执行、按需 sudo）：`bash scripts/env/bootstrap_wsl.sh`（git、build 工具、Python 等；详情见脚本内说明）。
2. **Conda 环境 `chronicle`（RAPIDS cuML）**：`bash scripts/env/install_chronicle_conda_env.sh`，或 `mamba env create -f scripts/env/rapids_env.yml` 后 `mamba activate chronicle`。
3. 可选：激活后若需少量 pip 补包，见仓库根目录 `requirements.gpu.txt` 注释，避免与 conda 中的 CUDA 栈冲突。
4. 在 **WSL 内克隆/放置**本仓库于 Linux 家目录（如 `~/chronicle_v3_3d_galaxy`），避免在 `/mnt/e/...` 上全量 I/O 成为瓶颈。原始 CSV 可用 `scripts/env/sync_raw_from_windows.sh` 等脚本拉取，产物回写 Windows 用 `scripts/env/sync_artifacts_to_windows.sh`。
5. 示例（全量 Phase 2 + cuML + DensMAP，与 Phase 6 规划一致）：  
   `python scripts/run_pipeline.py --through-phase-2 --umap-backend cuml --densmap --n-neighbors 100 --min-dist 0.4`

### 前端

在**仓库根目录**执行 `npm install` 与 `npm run dev`（见 [frontend/README.md](frontend/README.md)）。将管线产出的 `galaxy_data.json`（及可选 `.gz`）放在 `frontend/public/data/` 供 Vite 加载。
