# `data/` 目录说明

本目录下的 **大文件与跑批快照默认不进 Git**（见仓库根目录 `.gitignore`）。协作时以本说明 + `docs/` 与 `.cursor/rules/data-protection.mdc` 为准。

## 当前项目「用哪份数据」

| 用途 | 路径 | 说明 |
|------|------|------|
| **全量管线默认输入** | `data/raw/TMDB_all_movies.csv` | 与 `scripts/run_pipeline.py` 的 `DEFAULT_INPUT` 一致；**勿**在对话里直接打开全文。 |
| **本地管线产出 / 月度 refit 四件套来源** | `data/output/` | `cleaned.csv` + `text_embeddings.npy` + `genre_vectors.npy` + `language_vectors.npy` 与脚本契约一致（行对齐）。`umap_*.pkl` / `umap_xy.npy` 等为本地 UMAP 产物，**不**进入月度 CI 的 zip 四件套。 |
| **前端运行时星系 JSON** | `frontend/public/data/galaxy_data.json(.gz)` | 由导出脚本写入；与 `data/output` 是不同产物。 |
| **子样本冒烟** | `data/subsample/TMDB_all_movies_random20.csv` | 20 行，与全量表同列；`run_pipeline.py` 对该路径自动启用 Phase 2.6 全流程（除非 `--phase-1-only`）。 |

## `data/subsample/`

仅保留 **`TMDB_all_movies_random20.csv`**（历史上曾有一份同内容的 `tmdb2025_random20.csv` 副本，已删除以免重复）。

## `data/output/`（gitignored）

全量清洗与特征工程在本机生成；体积大，各自环境自备。

## 全量重跑管线并换新四件套（与 P18.5 / `monthly_refit` 对齐）

月度 refit 与 `scripts/cron/monthly_refit.py` 使用 **DensMAP**、**`n_neighbors=300`**、**`min_dist=0.4`**、**`cosine`**、**`random_state=42`**（见该脚本与 `run_pipeline.py` 默认值）。全量本地重跑时必须显式打开 **`--densmap`**，否则与线上 UMAP 语义不一致。

**前置**：`data/raw/TMDB_all_movies.csv` 已就位；建议先备份或移走旧 `data/output/` 下大文件（尤其 `umap_model.pkl`），以免混淆。

**1. 全量 Phase 1 + 2（写入 `data/output/` + `frontend/public/data/galaxy_data.json`）**

有 NVIDIA GPU（推荐，嵌入走 GPU）：

```powershell
Set-Location <REPO_ROOT>
.\.venv\Scripts\python.exe scripts\run_pipeline.py --input data\raw\TMDB_all_movies.csv --through-phase-2 --densmap --embedding-device cuda
```

仅 CPU（UMAP 与嵌入都较慢，可加 `--cpu` 强制 UMAP 走 `umap-learn`）：

```powershell
.\.venv\Scripts\python.exe scripts\run_pipeline.py --input data\raw\TMDB_all_movies.csv --through-phase-2 --densmap --embedding-device cpu --cpu
```

跑完后应存在：`data/output/cleaned.csv`、`text_embeddings.npy`、`genre_vectors.npy`、`language_vectors.npy`（及 `umap_xy.npy` 等）。

**2. 打 zip 并校验行对齐（供 `GALAXY_EMBED_BUNDLE_URL`）**

```powershell
.\.venv\Scripts\python.exe scripts\tools\pack_monthly_embedding_bundle.py
```

默认输出：`data\runs\monthly_refit_embedding_bundle.zip`。自定义目录或输出路径见 `python scripts\tools\pack_monthly_embedding_bundle.py -h`。

**3. 上传**：将 zip 传到 Release / 对象存储等，更新 GitHub Secret **`GALAXY_EMBED_BUNDLE_URL`**。

**说明**：若月度仍报 **Procrustes 锚点 mean L2 过大**，除四件套外还需核对 **`galaxy_v1_reference`** 是否与当前宇宙同源（见 `docs/reports/Phase 18.3 ...` 与 P18.5 排错表）；必要时在确认风险后使用 `monthly_refit.py` 的 **`--skip-anchor-rmse-abort`** 做诊断（生产慎用）。

## `data/raw/`（gitignored）

放置 Kaggle / 自备的 `TMDB_all_movies.csv`。

## `data/runs/`（gitignored）

时间戳目录：某次 P18 全量重建、benchmark 等快照；可按磁盘空间自行删除旧目录。

打包四件套请优先使用（含形状断言）：

```powershell
.\.venv\Scripts\python.exe scripts\tools\pack_monthly_embedding_bundle.py
```

生成物示例路径：`data/runs/monthly_refit_embedding_bundle.zip`（约 100MB+，勿提交）。

另有历史文件 `data/runs/p18_canonical_gha_bundle.zip`：内含 **5** 个文件（多 `umap_xy.npy`），与「仅四件套」的月度契约不同；上传 `GALAXY_EMBED_BUNDLE_URL` 时请优先使用 **`monthly_refit_embedding_bundle.zip`** 或按 P18.5 指南只打四文件。
