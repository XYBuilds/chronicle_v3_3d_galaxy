# Phase 25.5 — Drawer cast 与全量 cast 导出 实施报告

**范围**：`.cursor/plans/phase_25_core_experience_polish.plan.md` 子项 **P25.5**（Drawer cast UI / 滚动承接）；并落实 **P25.4 结论**（主包默认全量 `cast[]`）及 **本地开发加载路径** 修正。  
**分支**：`feat/p25-5-drawer-cast-layout`（开发与提交均在此分支上串联完成）。  
**日期**：2026-05-12  
**状态**：**已完成**（Drawer cast 布局 + 导出默认全量 + 文档与报告对齐 + dev 优先本地 gzip）。  
**说明**：计划中的 **Drawer 宽度** 经产品决策 **保持原状**（不扩不缩策略）；**P25.6**（层级 / 动画 / Exit 文案）与 **P25.7**（大范围 SSOT 文档收口）不在本报告范围。

---

## 1. 目标（与计划对齐）

| 计划项 | 本阶段结果 |
|--------|------------|
| 移除 cast 序号 | **已实现** |
| 桌面多列、小屏降列 | **已实现**：`1` → `sm:2` → `lg:3` |
| 全量 cast、可滚动、不撑爆 drawer | **已实现**：cast 随 Sheet 主体滚动区滚动；数据侧默认全量写入 JSON |
| Drawer 宽度（大屏不过窄 / 小屏不过宽） | **未改**：维持既有 `data-[side=right]:sm:max-w-lg`（见 §3 决策） |

---

## 2. 最终决策

1. **承接 P25.4 量化结论**：主包 gzip 增量可接受（评估见 [`Phase 25.4 P25.4 全量 cast 主包影响评估 实施报告.md`](./Phase%2025.4%20P25.4%20全量%20cast%20主包影响评估%20实施报告.md)）；**生产导出默认写入全量 `cast[]`**（`--cast-max` 默认 `0`）。
2. **Drawer 宽度**：曾试验响应式 `max-w`（小屏 cap + 大屏加宽），**最终决定不改**，恢复与历史一致的 **`sm:max-w-lg`**，避免与 P25.6 或视觉验收范围纠缠。
3. **`npm run dev` 数据来源**：仓库内 `galaxy_assets_manifest.json` 指向 **R2 线上 gzip** 时，若仍走 manifest，会导致本地重新导出后浏览器**仍加载旧包**（表现为 cast 恒 ≤20）。**最终决定**：在 **`import.meta.env.DEV`** 下，**跳过 manifest** 对主包与搜索索引 URL 的覆盖，**优先使用 Vite 提供的 `public/data` 下本地 gzip**；显式需要测线上包时，使用 **`VITE_GALAXY_DATA_GZIP_URL`**（或 `?dataset=` 实验包路径）覆盖。

---

## 3. 最终操作（工程变更摘要）

### 3.1 前端 — Drawer cast（`MovieDetailDrawerHud`）

- **文件**：[`frontend/src/components/Drawer.tsx`](../../frontend/src/components/Drawer.tsx)
- **内容**：
  - 去掉 cast 行首序号。
  - 使用 **`<ul className="list-none">` / `<li>`**，语义化列表。
  - 响应式栅格：**`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`**，`gap-x-4 gap-y-2`；长名 **`break-words`**（替代 `truncate`）。
- **提交**：`1d216d2`（初版含 Sheet 宽度试验）、`e6eb05a`（**撤销** Sheet 宽度试验，仅保留 cast 布局）。

### 3.2 前端 — 开发环境数据 URL

- **文件**：[`frontend/src/lib/galaxyAssetUrls.ts`](../../frontend/src/lib/galaxyAssetUrls.ts)
- **内容**：在 **`resolveGalaxyDataGzipUrl`** 与 **`resolveSearchIndexGzipUrl`** 中，于 `VITE_*` 与 `?dataset=` 处理之后、`fetchManifestOnce` 之前，若 **`import.meta.env.DEV`** 为真，则 **直接返回** 传入的默认相对路径（即本地 **`/data/*.json.gz`**），避免 dev 误用 R2 旧包。
- **提交**：`d960370`

### 3.3 导出管线 — 默认全量 cast

- **文件**：[`scripts/export/export_galaxy_json.py`](../../scripts/export/export_galaxy_json.py)
- **内容**：
  - CLI **`--cast-max`** 默认由 **`20` → `0`**（`≤0` 表示不截断）。
  - **`_movie_row` / `build_galaxy_payload`** 的 `cast_max` 默认与 CLI 一致为 **`0`**。
  - `export_from_supabase.py` 等调用 `build_galaxy_payload` 且未传 `cast_max` 的路径，**自动获得全量 cast**。
- **提交**：`8f36b22`

### 3.4 文档与计划

| 路径 | 说明 |
|------|------|
| [`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) | §4.3 `cast` 表意、§4.4 体积说明与「可选 `--cast-max N`」对齐 |
| [`docs/project_docs/TMDB 电影宇宙 Data Pipeline.md`](../project_docs/TMDB%20电影宇宙%20Data%20Pipeline.md) | Phase 2.5 一条中写明默认全量 `cast` 与 CLI 语义 |
| [`.cursor/plans/phase_25_core_experience_polish.plan.md`](../../.cursor/plans/phase_25_core_experience_polish.plan.md) | P25.5 todo **completed**；修正过时「`cast_full[:20]`」表述 |
| [`docs/reports/Phase 25.4 P25.4 全量 cast 主包影响评估 实施报告.md`](./Phase%2025.4%20P25.4%20全量%20cast%20主包影响评估%20实施报告.md) | 与「默认 0 / 全量」现状对齐（方法表、§6 建议、§7 清单） |

- **提交**：`8f36b22`（Tech Spec / Data Pipeline / phase plan）、`25f4649`（P25.4 报告对齐）

### 3.5 本地导出复跑（验证全量 cast 体积）

在已更新本地的 **`data/output/cleaned.csv`** 与 **`umap_xy.npy`** 前提下执行：

```bash
python scripts/export/export_galaxy_json.py
```

**一次实测输出（与 P25.4 全量 cast 表一致）**：

| 指标 | 数值 |
|------|------|
| `meta.count` / 导出影片数 | **59 341** |
| `galaxy_data.json`（紧凑 UTF-8） | **≈ 99.95 MB** |
| `galaxy_data.json.gz`（level 9） | **≈ 35.00 MB** |
| 人名搜索索引规模（日志） | **unique normalized keys ≈ 615 408**（全量 cast 后人名索引变大属预期） |

产物路径：`frontend/public/data/galaxy_data.json`、`galaxy_data.json.gz`、`galaxy_search_index.json.gz`。

---

## 4. 验收对照（P25.5 计划原文）

| 验收项 | 结果 |
|--------|------|
| cast 长列表可读、可滚动 | **通过**（主体滚动 + 多列 + `break-words`） |
| 无序号后视觉简洁 | **通过** |
| 小屏 drawer 不显著过宽 | **未单独调宽**（按决策维持 `max-w-lg`；与「小屏过宽」张力留待后续若再开需求） |
| 全量 cast 主包可发布 | **通过**（默认导出 + P25.4 已量化） |
| 本地 dev 使用新导出包 | **通过**（§3.2 dev 跳过 manifest） |

---

## 5. 未纳入本阶段（指向后续子项）

- **P25.6**：Drawer **z-index**、滑入/滑出动画、`Exit focus` 文案定稿等。
- **P25.7**：大范围 SSOT 文档与其它 locale 的系统性同步（本阶段已对 **Tech Spec / Data Pipeline / P25.4 报告** 做 cast 契约**必要**补丁）。

---

## 6. Git 提交索引（本阶段相关）

| 提交 | 说明 |
|------|------|
| `1d216d2` | Drawer：cast 三列栅格 + 去序号（初版含 Sheet 宽度试验） |
| `e6eb05a` | Drawer：**恢复** `SheetContent` 宽度为 `sm:max-w-lg` |
| `8f36b22` | 导出默认全量 cast + Tech Spec / Data Pipeline / phase plan |
| `25f4649` | P25.4 实施报告与默认全量表述对齐 |
| `d960370` | dev 跳过 manifest，本地 gzip 优先 |

---

## 7. 运维与开发者提示

1. **重新导出后**：若需线上用户看到新主包，仍须走既有 **CI / R2 / manifest** 发布链路；本报告不展开 Phase 24 部署细节。
2. **在 dev 中强制测 CDN 包**：设置 **`VITE_GALAXY_DATA_GZIP_URL`**（及可选 **`VITE_GALAXY_SEARCH_INDEX_GZIP_URL`**）为绝对 URL。
3. **缩包对比试验**：`python scripts/export/export_galaxy_json.py --cast-max 20` 仍可复现 cap-20 产物，与 [`scripts/analysis/evaluate_full_cast_impact.py`](../../scripts/analysis/evaluate_full_cast_impact.py) 一致。

---

*本报告为 Phase 25.5 交付与决策记录；与代码、导出脚本及上述文档应以 Git 当前状态为准。*
