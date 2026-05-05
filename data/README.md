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

## `data/raw/`（gitignored）

放置 Kaggle / 自备的 `TMDB_all_movies.csv`。

## `data/runs/`（gitignored）

时间戳目录：某次 P18 全量重建、benchmark 等快照；可按磁盘空间自行删除旧目录。

本机可生成 **月度 CI 用 embedding zip**（四文件，与 `GALAXY_EMBED_BUNDLE_URL` 契约一致）：

```powershell
Set-Location <REPO_ROOT>
.venv\Scripts\python.exe -c "from pathlib import Path; import zipfile; root=Path('data/output'); names=['cleaned.csv','text_embeddings.npy','genre_vectors.npy','language_vectors.npy']; out=Path('data/runs/monthly_refit_embedding_bundle.zip'); out.parent.mkdir(parents=True, exist_ok=True); zf=zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED); [zf.write(root/n, arcname=n) for n in names]; zf.close(); print(out, out.stat().st_size)"
```

生成物示例路径：`data/runs/monthly_refit_embedding_bundle.zip`（约 100MB+，勿提交）。

另有历史文件 `data/runs/p18_canonical_gha_bundle.zip`：内含 **5** 个文件（多 `umap_xy.npy`），与「仅四件套」的月度契约不同；上传 `GALAXY_EMBED_BUNDLE_URL` 时请优先使用 **`monthly_refit_embedding_bundle.zip`** 或按 P18.5 指南只打四文件。
