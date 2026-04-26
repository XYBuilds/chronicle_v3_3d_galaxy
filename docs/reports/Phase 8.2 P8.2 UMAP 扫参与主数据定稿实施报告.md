# Phase 8.2 · P8.2 UMAP 扫参与主数据定稿 — 实施报告

> 对应 [Phase 8 计划](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md) 中 **P8.2**（min_dist 扫参、实验产物、`?dataset=` 旁路加载）及计划外约定的 **主数据 UMAP 定稿**（`n_neighbors=300`、`min_dist=0.4` 全量替换 `galaxy_data.json.gz`）。  
> **工作分支（本报告撰写时）**：`p8.2-min-dist-sweep`。  
> **日期**：2026-04-27。

---

## 1. 目标回顾

| 计划项 | 完成情况 |
|--------|----------|
| 在全量 fused 特征上仅重跑 UMAP，对比 `min_dist ∈ {0.5, 0.7, 0.9}`；导出 **z ∈ [2020, 2026)**（公历 2020–2025）子集至 `frontend/public/data/experiments/` | **已完成**（三份 `galaxy_data.mindist05|07|09.json.gz`） |
| 前端 `?dataset=` 旁路加载实验 gzip，默认仍指向主 `galaxy_data.json.gz` | **已完成**（`loadGalaxyData.ts`） |
| 脚本/README 说明如何生成与切换 | **已完成**（`scripts/experiments/min_dist_sweep.py`、`frontend/public/data/experiments/README.md`） |
| 用户选定主数据 UMAP 超参后，全量重训坐标并替换主 gzip（计划写明在 P8.2 closure 外，本次一并执行） | **已完成**：**`n_neighbors=300`、`min_dist=0.4`**，见 §4 |
| Tech Spec 删除 gzip 体积**参考上限**表述 | **已完成**（§1.3 表格行移除；§4.4 改写为不设硬性上限），见 §5 |

---

## 2. 交付物清单（代码与脚本）

| 类型 | 路径 | 说明 |
|------|------|------|
| 扫参 / one-off 脚本 | [`scripts/experiments/min_dist_sweep.py`](../../scripts/experiments/min_dist_sweep.py) | 默认三档 `min_dist` 扫参（仍使用 CLI 默认 **`--n-neighbors 15`**，与 P8.2 原计划小邻域对比一致）；**`--one-off`** + `--one-off-min-dist` / `--one-off-n-neighbors` / `--one-off-tag` 单次导出至 experiments |
| 导出子集与 gzip-only | [`scripts/export/export_galaxy_json.py`](../../scripts/export/export_galaxy_json.py) | `--subset-z-min-inclusive` + `--subset-z-max-exclusive`；`--gzip-only`；子集时 `meta.subset_z_filter`、`meta.umap_fit_row_count`；子集导出时 `z_range` / `xy_range` 仅针对导出电影 |
| 前端加载 | [`frontend/src/utils/loadGalaxyData.ts`](../../frontend/src/utils/loadGalaxyData.ts) | `galaxyRuntimeUrlFromSearch`；`DATASET_PATHS`：`mindist05` / `mindist07` / `mindist09` / `n300md04` / `n500md04` |
| 测试 | [`frontend/src/utils/loadGalaxyData.test.ts`](../../frontend/src/utils/loadGalaxyData.test.ts) | 覆盖上述 `dataset` 路径解析 |
| 实验目录说明 | [`frontend/public/data/experiments/README.md`](../../frontend/public/data/experiments/README.md) | 生成命令与 `?dataset=` 用法；one-off 示例 |

---

## 3. 实验产物（experiments）

| 文件 | UMAP 参数（全量 59,014 行拟合后按 z 过滤） | 子集条数 |
|------|--------------------------------------------|----------|
| `galaxy_data.mindist05.json.gz` | `n_neighbors=15`, `min_dist=0.5` | 9227 |
| `galaxy_data.mindist07.json.gz` | `n_neighbors=15`, `min_dist=0.7` | 9227 |
| `galaxy_data.mindist09.json.gz` | `n_neighbors=15`, `min_dist=0.9` | 9227 |
| `galaxy_data.n300md04.json.gz` | `n_neighbors=300`, `min_dist=0.4` | 9227 |
| `galaxy_data.n500md04.json.gz` | `n_neighbors=500`, `min_dist=0.4` | 9227 |

子集 z 规则：**`2020.0 ≤ z < 2026.0`**（十进制年，上界开区间）。实验 gzip 体积约 **5 MB** 级，可按需是否纳入 Git（本报告不强制）。

---

## 4. 主数据定稿（全量替换）

经对比后定稿：**`n_neighbors=300`，`min_dist=0.4`**，`metric=cosine`，`random_state=42`，**不启用 DensMAP**。

| 步骤 | 命令（仓库根目录） |
|------|-------------------|
| 重算 UMAP | `python scripts/feature_engineering/umap_projection.py --backend umap --n-neighbors 300 --min-dist 0.4` |
| 全量导出 | `python scripts/export/export_galaxy_json.py --n-neighbors 300 --min-dist 0.4` |
| 校验 | `python scripts/validate_galaxy_json.py --input frontend/public/data/galaxy_data.json` |

**脚本默认值同步**（便于后续 `run_pipeline` / 无参重跑一致）：

- [`scripts/feature_engineering/umap_projection.py`](../../scripts/feature_engineering/umap_projection.py)：`--n-neighbors` 默认 **300**（`min_dist` 默认保持 **0.4**）。
- [`scripts/export/export_galaxy_json.py`](../../scripts/export/export_galaxy_json.py)：`--n-neighbors` 默认 **300**；导出 **`meta.version`** 使用 **`YYYY.MM.DD.h2`**（相对 P8.1 的 `h1` 区分本步 UMAP 契约）。
- [`scripts/run_pipeline.py`](../../scripts/run_pipeline.py)：`--n-neighbors` 默认 **300**。

**文档**：[《TMDB 数据特征工程与 3D 映射总表》](../project_docs/TMDB%20数据特征工程与%203D%20映射总表.md) 增加 **「UMAP 主数据定稿（Phase 8）」** 小节，写明上述超参与脚本默认一致。

**主 gzip**：已替换 [`frontend/public/data/galaxy_data.json.gz`](../../frontend/public/data/galaxy_data.json.gz)；`meta.count=59014`，`meta.umap_params` 与上表一致。本地一次导出曾出现 gzip **约 30 MB**（随 JSON 字段与压缩结果变化）；Tech Spec 已**移除** gzip 体积参考上限，避免与实产物冲突。

---

## 5. Tech Spec 文档调整（gzip 上限）

文件：[《TMDB 电影宇宙 Tech Spec》](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md)。

- **§1.3 性能参考基线表**：删除 **「坐标数据体积 | ≤ 15 MB（gzip 后）」** 整行（原含 gzip 参考上限）。
- **§4.4**：标题由「体积估算」改为 **「体积与加载说明」**；删除「8–15 MB」及「15 MB gzip 参考基线」等**数值上限**表述，明确 **不对 `galaxy_data.json.gz` 设体积硬性上限**；保留可选优化方向（拆分、裁剪 cast 等）。

---

## 6. 验收与回归（本仓库执行）

- **`npm test`（frontend）**：`loadGalaxyData` / `genreHue` 等用例通过。
- **`validate_galaxy_json.py`**：对导出的 `galaxy_data.json` 通过。
- **手工**：`npm run dev` 下默认无 `?dataset=` 应加载**新**主 gzip；带 `?dataset=mindist07` 等应加载对应实验文件（需本地已生成）。

---

## 7. 后续依赖（计划内衔接）

- **P8.3**：Perlin focus 球等应在**当前全量 xy** 上做最终视觉回归。  
- **P8.4+**：双 InstancedMesh 与拾取路径继续消费同一套 `meta.umap_params` 与坐标契约。

---

## 8. 参考链接

- Phase 8 总计划：[`.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md`](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md)  
- P8.1 实施报告：[Phase 8.1 P8.1 H-only 数据迁移与 Vitest 实施报告.md](./Phase%208.1%20P8.1%20H-only%20数据迁移与%20Vitest%20实施报告.md)
