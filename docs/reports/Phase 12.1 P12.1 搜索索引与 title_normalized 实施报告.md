# Phase 12.1 · P12.1 搜索索引与 `title_normalized` — 实施报告

> 对应 [Phase 12 计划](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md) 中 **P12.1**（`p121-data-search-index`）：主包增加 **`title_normalized`**、**`meta.has_search_index`**；新建 **`galaxy_search_index.json.gz`**（`people` / `genres`）；TypeScript 类型与运行时校验；**Vitest** schema；**不**在本步接入 App / SearchBar（留待 P12.2+）。  
> **SSOT**：[`TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) §4.3 / §4.5。  
> **日期**：2026-04-29。

---

## 1. 目标与最终决策

| 议题 | 决策 |
|------|------|
| `title_normalized` 语义 | 与 Tech Spec 一致：**NFKD → ASCII（`errors="ignore"`）→ `casefold()`**。对 **`title`** 与 **`original_title`** 分别规范化后：若 `original` 为空或与 `title` 规范化结果相同，则字段仅为 title 段；否则 **`"{norm_title} {norm_original}"`**（空格拼接），便于电影名子串检索覆盖两列。 |
| `meta.has_search_index` | 当前导出脚本**始终**写 **`true`**（与「本管线产物必带搜索侧字段」一致）。旧包无该字段时前端仍按可选字段向后兼容（见 `loadGalaxyData`）。 |
| `meta.version` | 相对 P8.2 定稿使用的 **`.h2`** 做 **minor 后缀 bump**：新导出为 **`YYYY.MM.DD.h3`**，用于区分含搜索字段的数据代际。 |
| 索引产出方式 | **`export_galaxy_json.py` 在写完主 gzip 后**直接调用 `build_search_index_dict` + `write_search_index_gzip`，默认与 `galaxy_data.json.gz` **同目录**写入 **`galaxy_search_index.json.gz`**；**另**提供独立 CLI **`export_search_index.py`**，便于「仅有主包、需补索引」时单独运行。 |
| `run_pipeline.py` | **未改**：Phase 2 末尾仍只调 `export_galaxy_json.py`；因其内部已写搜索索引，**无需**再挂第二个子进程。 |
| 无 cast/crew 的极端导出 | `build_search_index_dict` 内 **`assert` 至少存在一条 `people` 记录**；若业务上存在「全员空 credits」子集，导出会失败（与「搜索索引必须有可检索人名」契约一致）。 |
| 前端 Vitest 文件命名 | 仓库 Vitest 仅 `include: ['src/**/*.test.ts']`，故采用 **`loadSearchIndex.test.ts`**（而非 plan 文案中的 `.spec.ts`）。 |
| 全量 `galaxy_data.json.gz` 是否在仓库内重导并提交 | **不作为 P12.1 必做**；本地有 `cleaned.csv` + `umap_xy.npy` 时再跑 `export_galaxy_json.py` 即可一次得到主包 + 搜索索引（见 §6）。 |

---

## 2. 交付物清单

| 类型 | 路径 | 说明 |
|------|------|------|
| 主导出 | [`scripts/export/export_galaxy_json.py`](../../scripts/export/export_galaxy_json.py) | `_title_normalized_field`；`_movie_row` 写 `title_normalized`；`meta.has_search_index`、`version` **`.h3`**；导出循环后断言 `title_normalized` 非空；主 gzip 后写 `galaxy_search_index.json.gz` |
| 索引导出 | [`scripts/export/export_search_index.py`](../../scripts/export/export_search_index.py) | `normalize_for_search`（与主包共用语义）、`build_search_index_dict`、`write_search_index_gzip`；CLI `--galaxy-input` / `--output-gzip`；管线内打印人数、人均 `movie_ids`、各 genre `count`、gzip 体积 |
| 校验脚本 | [`scripts/validate_galaxy_json.py`](../../scripts/validate_galaxy_json.py) | 当 `meta.has_search_index === true` 时要求每条电影含非空 **`title_normalized`** |
| Galaxy 类型 | [`frontend/src/types/galaxy.ts`](../../frontend/src/types/galaxy.ts) | `Meta.has_search_index?`、`Movie.title_normalized?` |
| 搜索索引类型 | [`frontend/src/types/searchIndex.ts`](../../frontend/src/types/searchIndex.ts) | `SearchIndex`、`PersonEntry`、`GenreEntry`、`RoleMask` |
| 索引校验 | [`frontend/src/data/validateSearchIndex.ts`](../../frontend/src/data/validateSearchIndex.ts) | `parseAndValidateSearchIndex(raw, genrePaletteKeys)`；`role_mask ∈ [0,63]`；genre **`count >= 1`** 且 **`count === movie_ids.length`**；可选与 `meta.genre_palette` **key 集合一致** |
| 索引加载 | [`frontend/src/data/loadSearchIndex.ts`](../../frontend/src/data/loadSearchIndex.ts) | 复用 `fetchGunzippedJson`；默认 URL `data/galaxy_search_index.json.gz`；加载后 `console.log` 人数/流派数/近似 JSON 体积 |
| Galaxy 加载 | [`frontend/src/utils/loadGalaxyData.ts`](../../frontend/src/utils/loadGalaxyData.ts) | `meta.has_search_index` 类型；`has_search_index === true` 时强制 **`title_normalized`** 非空字符串 |
| 测试 | [`frontend/src/data/loadSearchIndex.test.ts`](../../frontend/src/data/loadSearchIndex.test.ts) | 索引 schema + `parseGalaxyJsonPayload` 与 `has_search_index` / `title_normalized` 联动 |
| 计划状态 | [`.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md`](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md) | `p121-data-search-index` 标为 **completed** |

---

## 3. 数据契约（实现与 Tech Spec 对齐要点）

### 3.1 `galaxy_data` 增量

- **`movies[].title_normalized`**：`string`，非空（在本管线 `has_search_index: true` 前提下）。
- **`meta.has_search_index`**：`true` 时，部署侧**应**提供 **`galaxy_search_index.json.gz`**（§4.5）；`version` 与 **`meta.version`** 字符串对齐（由同一次导出写入保证）。

### 3.2 `galaxy_search_index`

- **`people[normalized_key]`**：`full`（展示名，取该 key 下原始字符串 **Counter 最高频**）、`role_mask`（位或）、`movie_ids`（去重，排序仅便于 diff，语义无序）。
- **`role_mask` 位表**（与 Tech Spec §4.5.1 一致）：cast=1，director=2，director_of_photography=4，writers=8，producers=16，music_composer=32；合并后 **`0 ≤ role_mask ≤ 63`**。
- **`genres[name]`**：`count` = 含该流派（**任一顺位**）的影片数；`movie_ids` = 对应影片 TMDB `id` 去重列表；实现上 **`count === len(movie_ids)`**。
- **`genres` 的 key 集合**：与导出时的 **`meta.genre_palette` key 集合完全一致**，写入顺序为 **palette / `genre_order` 插入序**。

---

## 4. 验收与命令（本步已执行）

- **`npm test`**（根目录）：Vitest 全绿（含新增 `loadSearchIndex.test.ts`）。
- **`npm run build -w frontend`**：`tsc -b` 与 `vite build` 通过。
- **Python 冒烟**：对 `build_search_index_dict` 最小单条 `movies` 调用，确认 `people` / `genres` 形状与断言通过。

---

## 5. 运维说明：何时跑管线

| 场景 | 建议 |
|------|------|
| 仅开发 P12.2 / P12.3 代码（fixture、单测） | **不必**立刻重导全量数据。 |
| 本地要在真实 60K 上验搜索 / HUD | 在已有 **`data/output/cleaned.csv`** 与 **`data/output/umap_xy.npy`** 的前提下，执行 **`python scripts/export/export_galaxy_json.py`**（及与 UMAP 一致的 CLI 参数），一次得到 **`galaxy_data.json.gz` + `galaxy_search_index.json.gz`**。 |
| 需重算嵌入 / UMAP | 再跑 **`scripts/run_pipeline.py --through-phase-2`**（或等价子步骤）；**不必**为 P12.1 单独改 pipeline 入口。 |
| 仅有主包、缺索引 | **`python scripts/export/export_search_index.py --galaxy-input <path/to/galaxy_data.json.gz>`**。 |

---

## 6. 已知边界与后续 Phase

- **P12.1 未做**：`App.tsx` 挂载 SearchBar、`galaxyInteractionStore` 搜索字段、联想算法 UI 等（P12.2–P12.3）。
- **旧数据包**：无 `has_search_index` / 无 `title_normalized` 时，加载器不强制 `title_normalized`；搜索 UI 应在 **`has_search_index !== true`** 时 disabled（Design Spec §4.8，实现归属后续 Phase）。
- **根目录 `npm run pipeline-export`**：当前 monorepo **`package.json` 无此脚本**；导出仍以 Python 入口为准（见 §5）。

---

## 7. 变更文件速查（便于 Code Review）

```
scripts/export/export_galaxy_json.py      # title_normalized、meta、索引 gzip
scripts/export/export_search_index.py     # 新建
scripts/validate_galaxy_json.py           # has_search_index → title_normalized
frontend/src/types/galaxy.ts
frontend/src/types/searchIndex.ts         # 新建
frontend/src/data/validateSearchIndex.ts  # 新建
frontend/src/data/loadSearchIndex.ts      # 新建
frontend/src/data/loadSearchIndex.test.ts # 新建
frontend/src/utils/loadGalaxyData.ts
.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md  # p121 completed
```
