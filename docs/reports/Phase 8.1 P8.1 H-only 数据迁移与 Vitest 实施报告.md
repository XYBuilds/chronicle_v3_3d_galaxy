# Phase 8.1 · P8.1 H-only 数据迁移与 Vitest — 实施报告

> 对应 [Phase 8 计划](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md) 中 **P8.1**（`p81-h-only-migration`）：导出侧双字段 **`genre_color` + `genre_hue`**、`meta.has_genre_hue`；宏观 **Points** 顶点改走 **hue attribute**（不再从 `genre_color` 反解 hue）；Perlin **选中球**按流派 **hue + 定稿 L/C** 生成 RGB；**Vitest** 第一批（schema / ring 容差 / OKLab CPU 金值）；Storybook fixture 与全量 gzip 说明。  
> **分支**：`phase-8-p8-1-h-only-migration`（相对 `main` 的 P8.1 工作线）。  
> **日期**：2026-04-27。

---

## 1. 目标回顾

| 计划项 | 完成情况 |
|--------|----------|
| `export_galaxy_json.py`：每条电影 `genre_hue`（rad ∈ [0, 2π)）、`meta.has_genre_hue`、`meta.version` 小版本 bump | **已完成**（见 §2、§3） |
| 类型与 `loadGalaxyData`：当 `has_genre_hue` 时校验 `genre_hue` | **已完成** |
| `galaxy.ts` + `point.vert.glsl`：`hue` buffer；shader 内 `a/b = uChroma * cos/sin(hue)` | **已完成** |
| `planet.ts`：按 sorted `genre_palette` 下标解析 hue，`pipelineRingSrgb01` 写 `uColor0..3` | **已完成** |
| Vitest：schema、round-trip 容差、point.vert OKLab 路径 CPU 金值 | **已完成** |
| 全量 `galaxy_data.json.gz` 在仓库内重导并提交 | **未作为本步必做**（可与 P8.2 定稿 `min_dist` 后合并验收，见 §6） |

---

## 2. 交付物清单

| 类型 | 路径 | 说明 |
|------|------|------|
| 导出脚本 | [`scripts/export/export_galaxy_json.py`](../../scripts/export/export_galaxy_json.py) | `build_genre_palette` 增加 `genre_hue` 映射；`_movie_row` 写 `genre_hue`；`meta.has_genre_hue`、`version` 使用 `YYYY.MM.DD.h1`；启动时打印各流派 hue(°) 与 hex；断言 `genre_hue ∈ [0, 2π)` |
| 类型 | [`frontend/src/types/galaxy.ts`](../../frontend/src/types/galaxy.ts) | `Meta.has_genre_hue?`、`Movie.genre_hue?` |
| 加载与校验 | [`frontend/src/utils/loadGalaxyData.ts`](../../frontend/src/utils/loadGalaxyData.ts) | `has_genre_hue === true` 时要求每条 `genre_hue` 有限且 ∈ [0, 2π)；导出 **`parseGalaxyJsonPayload`** 供测试复用 |
| Hue 工具 | [`frontend/src/utils/genreHue.ts`](../../frontend/src/utils/genreHue.ts) | `hueFromGenreColor`、`pipelineRingSrgb01`、`pointColorFromHueVote`、`genreHueForGenreName` 等 |
| 宏观 Points | [`frontend/src/three/galaxy.ts`](../../frontend/src/three/galaxy.ts) | `hue` `Float32Array`；`genre_hue ?? hueFromGenreColor(genre_color)`；日志输出 hue min/max |
| 顶点着色器 | [`frontend/src/three/shaders/point.vert.glsl`](../../frontend/src/three/shaders/point.vert.glsl) | `attribute float hue`；去掉从 `color` 反解 OKLab hue 的块；保留 `oklab_to_linear_srgb` 与 `srgb_to_linear`（用于输出） |
| Perlin 星球 | [`frontend/src/three/planet.ts`](../../frontend/src/three/planet.ts) | `resolveGenreHue` + `pipelineRingSrgb01`；缺 `genre_hue` 时用 `hueFromGenreColor` 作 fallback |
| 测试 | [`frontend/src/utils/loadGalaxyData.test.ts`](../../frontend/src/utils/loadGalaxyData.test.ts)、[`frontend/src/utils/genreHue.test.ts`](../../frontend/src/utils/genreHue.test.ts) | 共 5 条用例 |
| Vitest 配置 | [`frontend/vitest.config.ts`](../../frontend/vitest.config.ts) | `environment: node`，`@` → `src` |
| 根 / 前端脚本 | [`package.json`](../../package.json)、[`frontend/package.json`](../../frontend/package.json) | 根目录 `npm test` → `frontend` `vitest run` |
| 最小 fixture | [`frontend/src/types/galaxyMinimalFixture.ts`](../../frontend/src/types/galaxyMinimalFixture.ts) | `has_genre_hue: true`、`genre_hue: 0` |
| Storybook fixture | [`frontend/src/storybook/fixtures/subsampleMovies.ts`](../../frontend/src/storybook/fixtures/subsampleMovies.ts) | `SUBSAMPLE_GENRE_PALETTE`、`primaryGenreHueFields`：主类型 **genre_hue + genre_color** 与 `pipelineRingSrgb01` 对齐，避免 Points / Perlin 色差 |
| Plan 状态 | [`.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md`](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md) | `p81-h-only-migration` 标为 **completed** |

---

## 3. 数据契约（摘要）

- **`genre_hue`**：`float`，弧度，与 GPU 中 `cos(hue)` / `sin(hue)` 一致；由流派在 **sorted 词表** 中的下标 `i` 与流派总数 `N` 决定：`H_i = 2π · i / N`（与 Python 导出一致）。
- **`genre_color`**：保留，仍为归一化 sRGB，由管线固定 **OKLCH L/C** 的流派环生成；HUD **swatch** 语义仍以 **`meta.genre_palette` hex** 为主（本步未改 Tooltip/Drawer 的纯文本流派展示）。
- **`meta.has_genre_hue`**：为 `true` 时，加载器要求每条电影均含合法 **`genre_hue`**。
- **`meta.version`**：P8.1 导出使用 **`YYYY.MM.DD.h1`** 后缀，与仅日期的旧版区分。

---

## 4. 验收记录（本仓库执行）

- **`npm test`**：2 个测试文件、5 条用例通过（`genreHue` + `loadGalaxyData`）。
- **`npm run build`**：`tsc -b` 与 `vite build` 通过；Vite 对单 chunk >500 kB 的提示为**体积建议**，非失败。
- **Storybook**：在 **不依赖全量 gzip** 的前提下，使用 fixture（`subsampleMovies` + `GalaxyThreeLayerLab` 等）完成人工视觉验收，**通过**。

---

## 5. 技术说明（与后续 Phases 的边界）

- **P8.1** 仅改 **Points** 管线的 **attribute 与色彩重组**；计划中的 **双 InstancedMesh（P8.4）** 将再迁 shader，与 **P8.1 数据契约** 分步验收。
- **UMAP `min_dist`（P8.2）** 变更的是 **xy 嵌入** 与 `umap_xy.npy`；**仅**重跑 `export_galaxy_json.py` 而不换 npy **不会**改变画面上的 x/y。全量数据可在 **P8.2 定参后** 再导，避免重复全量跑。

---

## 6. 未纳入本步的项（不阻塞 P8.1 代码合入）

1. **仓库内提交**新的全量 **`frontend/public/data/galaxy_data.json.gz`**：需在具备 `data/output/cleaned.csv` 与对应 **`umap_xy.npy`** 的环境执行 `python scripts/export/export_galaxy_json.py`；可在 **P8.2 胜出 `min_dist` 并重算 UMAP** 后一并替换。  
2. **Tech Spec / Design Spec / 视觉参数总表** 的正文回写：按 Phase 8 计划节奏，多在 **各 P 用户定稿后** 同步；本报告为 **P8.1 实施留档**。  
3. **`@vitest/ui`**：未加；当前仅 CLI `vitest run`。

---

## 7. 后续依赖

- **P8.2**：`min_dist` 扫参、实验 `.gz` 与 `?dataset` 旁路；主 `galaxy_data` 与 **meta.version** 再次 bump 时，应已包含 P8.1 字段并与新 xy 一致。  
- **P8.3+**：Perlin 球、双 mesh 等消费 **同一套 hue 语义**（`genreHue` / shader helper 的延续）。

---

## 8. 相关提交（`phase-8-p8-1-h-only-migration`）

- 以分支上最新提交为准（例：**`d920b38`** 附近）：`feat(p8.1): genre_hue pipeline + point shader hue attribute + Vitest`，含 `subsampleMovies` 的 `primaryGenreHueFields` 与 plan **p81** 状态更新。若你本地未包含该报告文件，将本报告 **另起提交** 即可。
