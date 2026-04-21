# Phase 6M5 — 管线透传与 `meta.umap_params` 同步（实施报告）

**关联计划：** [phase_6_gpu_migration_202aac8f.plan.md](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) — 里程碑 **M5（§8.3.6 + meta 同步）**  
**状态：** Plan 中 `m5-pipeline-export` 已标为 **completed**  
**日期：** 2026-04-21  

---

## 1. 本次 M5 要解决什么

在 M4 已为 `umap_projection.py` 增加 `umap-learn` / `cuML` 后端与 `--densmap`、`--n-neighbors` 等 CLI 的前提下，M5 把 **统一入口** `run_pipeline.py` 与 **导出/校验/前端类型** 对齐，使得：

- 一条 `run_pipeline.py --through-phase-2 ...` 命令即可把 UMAP 超参 **原样** 传给 Phase 2.4（UMAP）与 Phase 2.5（JSON 导出），避免「算完 UMAP 但 `meta` 里仍是旧默认」的不一致。
- `galaxy_data.json` 的 `meta.umap_params` 能如实记录是否启用 **DensMAP**（`densmap`），便于 WSL/cuML 重训与文档化。

---

## 2. 对照 Plan 的完成项

| Plan 子项 | 内容 | 结果 |
|-----------|------|------ |
| (a) | `run_phase2_through_export()` 透传 `backend` / `densmap` / `n_neighbors` 等；CLI 含 `--umap-backend`、`--densmap`、`--n-neighbors`、`--cpu` | 已实现；并额外透传 `min_dist`、`metric`、`random_state` 与 M4/M8 用法一致 |
| (b) | `export_galaxy_json.py` 增加 `--densmap`，`meta.umap_params` 写入 `densmap: bool` | 已实现；导出时 **始终** 写入布尔值 `true` / `false` |
| (c) | 前端 `galaxy_data.json` 契约类型 | 在 `frontend/src/types/galaxy.ts` 的 `UmapParams` 增加可选字段 `densmap?: boolean`（旧 JSON 无该键仍可类型兼容） |
| (d) | `validate_galaxy_json.py` 兼容新字段 | 已加强：校验 `umap_params` 四类必填键；若存在 `densmap` 则须为布尔 |

---

## 3. 行为说明（代码层）

### 3.1 `scripts/run_pipeline.py`

- **`run_phase2_through_export()`**（Phase 2.1 → 2.5）现在根据参数拼装：
  - **`umap_projection.py`**：`--backend`、`--n-neighbors`、`--min-dist`、`--metric`、`--random-state`，若开启 densmap 则追加 `--densmap`。
  - **`export_galaxy_json.py`**：同上超参 + 条件 `--densmap`，保证与 UMAP 步骤一致。
- **`--cpu`**：仅作用于 Phase 2.4 UMAP，强制向 `umap_projection.py` 传入 `--backend umap`（忽略 `--umap-backend` 与 GPU 自动选择），用于 Windows / 无 cuML 时的 **CPU umap-learn 回退**。
- **新增/暴露的 CLI 一览**（均需配合 `--through-phase-2` 才有意义）：  
  `--umap-backend` · `--densmap` · `--n-neighbors` · `--min-dist` · `--umap-metric` · `--umap-random-state` · `--cpu`

### 3.2 `scripts/export/export_galaxy_json.py`

- 新增 **`--densmap`**（`store_true`）。
- `meta.umap_params` 结构在原有 `n_neighbors`、`min_dist`、`metric`、`random_state` 基础上增加 **`"densmap": <bool>`**。

### 3.3 `scripts/validate_galaxy_json.py`

- 对 **`meta.umap_params`** 做结构校验：必填键完整、非 null；若含 **`densmap`**，必须为 **布尔**（兼容不含 `densmap` 的历史文件）。

### 3.4 `frontend/src/types/galaxy.ts`

- **`UmapParams`** 增加 **`densmap?: boolean`**：新管线导出会带该字段；仓库内旧 `galaxy_data.json` 可不包含。

---

## 4. 涉及文件清单

| 文件 | 变更性质 |
|------|----------|
| `scripts/run_pipeline.py` | 透传逻辑 + CLI |
| `scripts/export/export_galaxy_json.py` | CLI + `meta.umap_params.densmap` |
| `scripts/validate_galaxy_json.py` | `umap_params` 校验 |
| `frontend/src/types/galaxy.ts` | `UmapParams` 扩展 |
| `.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md` | M5 todo → **completed** |

---

## 5. 使用示例

```bash
# WSL / GPU：cuML + DensMAP + 大邻域（与后续 M8 方向一致）
python scripts/run_pipeline.py --through-phase-2 --umap-backend cuml --densmap --n-neighbors 100 --min-dist 0.4

# 强制 CPU UMAP（umap-learn）
python scripts/run_pipeline.py --through-phase-2 --cpu
```

单独重导出（已有 `cleaned.csv` + `umap_xy.npy`）时，需手动保证与 UMAP 命令一致，例如：

```bash
python scripts/export/export_galaxy_json.py --densmap --n-neighbors 100 --min-dist 0.4
```

---

## 6. 验证记录（实施时）

- `python scripts/validate_galaxy_json.py --input frontend/public/data/galaxy_data.json` — 通过（当时仓库内全量 JSON **尚无** `densmap` 字段，属预期）。
- `npm run build`（前端）— 通过。

---

## 7. 后续（非 M5 范围）

- 全量重导出后，`galaxy_data.json` 将包含 `densmap`；**M9** 可在 Tech Spec 中正式描述该字段。
- **M7** 子样本端到端冒烟将实际验证 `run_pipeline` + cuML 分支与校验器闭环。
