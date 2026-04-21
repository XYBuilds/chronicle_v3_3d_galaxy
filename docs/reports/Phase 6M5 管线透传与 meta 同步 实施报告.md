# Phase 6M5 — 管线透传与 `meta.umap_params` 同步（实施报告）

**分支：** `phase-6-m5-pipeline-export`  
**日期：** 2026-04-21  
**范围：** Phase 6 GPU 迁移 plan — M5（§8.3.6）

## 目标

- 统一入口 `run_pipeline.py` 将 UMAP 相关参数透传到 `umap_projection.py` 与 `export_galaxy_json.py`。
- 导出 JSON 的 `meta.umap_params` 增加 `densmap` 布尔字段；校验器与前端类型同步。

## 改动摘要

1. **`scripts/run_pipeline.py`**
   - `run_phase2_through_export()` 增加参数：`umap_backend`、`densmap`、`n_neighbors`、`min_dist`、`metric`、`random_state`、`force_umap_cpu`（由 `--cpu` 映射）。
   - 新增 CLI：`--umap-backend`、`--densmap`、`--n-neighbors`、`--min-dist`、`--umap-metric`、`--umap-random-state`、`--cpu`（强制 Phase 2.4 使用 `umap-learn`，向 `umap_projection` 传 `--backend umap`）。

2. **`scripts/export/export_galaxy_json.py`**
   - CLI：`--densmap`（`store_true`）。
   - `meta.umap_params` 始终包含 `"densmap": true|false`。

3. **`frontend/src/types/galaxy.ts`**
   - `UmapParams` 增加可选 `densmap?: boolean`（兼容仓库内尚未重导出的旧 `galaxy_data.json`）。

4. **`scripts/validate_galaxy_json.py`**
   - 校验 `meta.umap_params` 必备键 `n_neighbors` / `min_dist` / `metric` / `random_state`；若存在 `densmap` 则须为 `bool`。

## 验证

- `python scripts/validate_galaxy_json.py --input frontend/public/data/galaxy_data.json` — 通过（旧 JSON 无 `densmap`）。
- `npm run build` — 通过。

## 后续

- M7/M8 重训后，`frontend/public/data/galaxy_data.json` 将自然带上 `densmap`；M9 可同步 Tech Spec 文档。
