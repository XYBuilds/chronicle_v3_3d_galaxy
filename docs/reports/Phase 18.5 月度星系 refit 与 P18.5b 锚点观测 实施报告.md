# Phase 18.5 / P18.5b — 月度星系 refit、锚点软闸与 CI 落地（实施报告）

**范围：** 按计划 [.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md](../../.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md) 中 **P18.5**（每月 Kaggle raw → 重算动态门槛 → 全量 UMAP DensMAP → Procrustes 对齐 `galaxy_v1_reference` → 回写 Supabase `movies` / 清理已合并 `movies_pending` → 导出与校验）及 **P18.5b**（锚点**软闸**、**可 grep 结构化日志**、**`monthly_refit_meta.json` artifact**）。前端契约不变（仍消费静态 `galaxy_data.json.gz`；meta 中不强行塞运维专有字段）。

**状态：** 实现与 workflow 已合入 **`main`**（例如 PR **#141** `feature/p18-5b-monthly-anchor-observability`）。**GHA 在 `anchor_mode=soft` 下已跑通**端到端：下载四件套 zip → monthly refit → export → validate → artifact（含 `monthly_refit_meta.json`）。**Cloudflare Pages** 在 monthly/nightly workflow 中仍为注释占位，属 **P18.6**。

**运维指南：** [P18.5 月度星系 refit 操作指南](../guides/P18.5%20月度星系%20refit%20操作指南.md)；前置： [P18.4 指南](../guides/P18.4%20每日投票刷新与导出入口指南.md)、[Supabase 操作教程](../guides/Supabase%20操作教程.md)。

---

## 1. 与总计划的对齐

| 计划要求（P18.5 / P18.5b 摘要） | 本阶段落实 |
|--------------------------------|------------|
| 月度重算 `compute_year_to_vote_threshold`，切换 `threshold_versions` active | `_deactivate_all_thresholds` + **`upsert(..., on_conflict="version")`**（避免本地/GHA 同日复跑主键冲突） |
| 全量 `fit_transform` CPU DensMAP + Procrustes vs v1 | `fuse_modalities` → `_fit_umap_learn(..., densmap=True)` → `align_to_reference`；参数与 production 一致（`n_neighbors=300`、`min_dist=0.4`、`cosine`、`random_state=42`） |
| 合并 `movies_pending`、回写 `movies` | 按当月 `cleaned` 成员 upsert；已从 pending 合并的 id **DELETE** |
| 导出 `meta.version` 含 `monthly`、可追溯 `threshold_version` | 子进程 `export_from_supabase.py` + `validate_galaxy_json.py` |
| **P18.5b 软闸** | **`MONTHLY_ANCHOR_MODE`**：`soft`（CI 默认）/ `hard` / `skip`；**`MONTHLY_ANCHOR_SOFT_FAIL_MAX`**（默认 50）仅在 `soft` 下作为「极端失败」上界；`hard` 下仍用 `--anchor-rmse-abort`（默认 0.25）硬失败 |
| **P18.5b 强日志** | 前缀 **`monthly_refit_kv`** 单行键值（`anchor_mean_l2`、`n_anchors`、`raw_source`、`bundle_fingerprint` 等） |
| **P18.5b artifact** | 根目录 **`monthly_refit_meta.json`**；GHA **`upload-artifact`** 与三份导出物一并上传 |
| 四件套在 CI 可复现获取 | **`GALAXY_EMBED_BUNDLE_URL`**：Release/R2 等 **zip 直链**；workflow 内 **trim/去 CRLF** + `http(s)` 校验，避免 `curl: (3) Malformed input` |
| weekly 不默认 cron | 仅 **`workflow_dispatch`**（与 nightly 策略一致） |

**本阶段明确未纳入（后续或观测期）：** 将 **`threshold_versions` 写入挪到锚点闸之后**（当前仍在 UMAP 之前写入，失败时可能出现「active 已换、坐标未更新」的中间态，需运维知情）；**P18.6** Pages 接线；**P18.7** 全量 Tech Spec / Data Pipeline 大段同步。

---

## 2. 最终决策（产品 / 工程）

1. **优先跑通链路，再收紧对齐质量**  
   - GHA 使用 **Kaggle 日更 raw**，四件套 zip 往往来自 **本机固定快照**；两者不可能字节级恒等，全量 refit 后 **锚点 mean L2 常显著大于 0.25**。  
   - **决策：** 观测期采用 **`soft`**：超过 0.25 **WARN 并继续**；仅当 mean 超过 **50**（可配）或非有限数时 **fail**。数周积累 **`monthly_refit_kv` / meta** 后再决定是否恢复 **`hard`** 或调整 `0.25`。

2. **`galaxy_v1_reference` 不随月度更新**  
   - 仍为 **P18.3 冻结锚点**；月度只 **读** reference，写 **`movies`**。若未来要「换宇宙」，走 **owner 控制台受控重置 + `initial_import`**，不在本报告展开。

3. **CI 四件套来源终态：URL zip（方案 D）**  
   - **决策：** 长期自动跑以 **`GALAXY_EMBED_BUNDLE_URL`** 为主，避免仅靠 Actions Cache LRU 导致随机 **CACHE MISS**。  
   - 本机定期 **`run_pipeline.py --through-phase-2 --densmap`** 对齐 UMAP 语义，再用 **`pack_monthly_embedding_bundle.py`** 打 zip 上传 Release/对象存储并更新 Secret。

4. **语言词表与 embedding bundle 必须同源**  
   - **决策：** 月度脚本使用 **`collect_sorted_languages(cache_clean["original_language"])`** 与 Phase 2 写 **`language_vectors.npy`** 的规则一致；**`assert len(lang_order) == dl`**，避免 103/104 维错位。  
   - **`movies_pending`** BYTEA 与 bundle 维度不一致时 **整片重编码**（与 nightly 词表差异解耦）。

5. **`scripts/supabase` 与 PyPI `supabase` 包名冲突**  
   - **决策：** 不写 `from supabase.initial_import import ...`；用 **`importlib`** 按路径加载 **`scripts/supabase/initial_import.py`** 中的 **`_row_to_reference_and_movie`**；**`from supabase import create_client`** 仍指向官方客户端。

6. **`movies_pending` 少量未并入当月 `cleaned`**  
   - **决策（本次）：** 例如约 **19** 条 pending 未出现在当月 membership 时 **`merged_pending_count=0`**，视为**可接受**，不阻塞主线；是否与门槛/数据一致由后续按需核对。

7. **残差观测与 nightly 解耦**  
   - **决策：** **`anchor_mean_l2` / `anchor_max_l2`** 仅由 **`monthly_refit.py`** 输出；**nightly** 不重跑 UMAP/Procrustes，**无**同类字段。

---

## 3. 最终操作（运维侧已执行或推荐顺序）

以下汇总实践中已走通的路径（与对话及 GHA 日志一致），供复现与交接。

1. **本机全量 Phase 2 产出四件套**（与月度 UMAP 语义一致，**必须 `--densmap`**）  
   ```powershell
   Set-Location <REPO_ROOT>
   .\.venv\Scripts\python.exe scripts\run_pipeline.py --input data\raw\TMDB_all_movies.csv --through-phase-2 --densmap --embedding-device cuda
   ```

2. **打包 zip（四文件扁平根，契约见操作指南）**  
   ```powershell
   .\.venv\Scripts\python.exe scripts\tools\pack_monthly_embedding_bundle.py
   ```  
   默认输出：`data\runs\monthly_refit_embedding_bundle.zip`（**勿提交 git**）。

3. **上传 zip** 至可匿名 `curl` 的地址（如 GitHub Release 资产），在仓库 **Settings → Secrets → Actions** 配置 **`GALAXY_EMBED_BUNDLE_URL`**：单行 `https://...`，无引号、无尾随换行。

4. **确认 Secrets**：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`KAGGLE_USERNAME`、`KAGGLE_KEY`（与 P18.4 相同）。

5. **Actions →「P18.5 Monthly galaxy refit」→ Run workflow**  
   - **`anchor_mode`**：首次验收与日常 schedule 回退均为 **`soft`**（与 Kaggle/raw 和 zip 快照差异共存）。  
   - 严格对齐验收时再选 **`hard`**；排障临时 **`skip`**（生产慎用）。

6. **验收**  
   - 日志搜索 **`monthly_refit_kv`**、**`resolved anchor_mode=`**；**`soft`** 下若 mean > 0.25 会出现 **`WARN anchor soft-band`**，job 仍应 **success**。  
   - 下载 artifact：**`monthly_refit_meta.json`** + 三份导出物；核对 **`meta.version`**（`…monthly…`）与 **`meta.threshold_version`**。

---

## 4. 代码与文件清单（最终形态）

| 路径 | 作用 |
|------|------|
| `scripts/cron/monthly_refit.py` | 月度主流程：raw、门槛、`cleaned`、拼矩阵、UMAP、Procrustes、**锚点闸**、Supabase upsert、pending 清理、export/validate、**`monthly_refit_meta.json`** |
| `scripts/cron/export_from_supabase.py` | 从 `movies` 导出；`--version-branch monthly`、`--threshold-version` |
| `scripts/feature_engineering/procrustes_align.py` | `align_to_reference`（锚点不足 2 则结构性失败） |
| `scripts/tools/pack_monthly_embedding_bundle.py` | 从 `data/output` 打四件套 zip，**行数与 384 维断言** |
| `.github/workflows/monthly_refit.yml` | `cron: 0 20 1 * *` UTC + `workflow_dispatch`（**`anchor_mode`**）；cache restore → **可选 zip 下载** → verify → refit → artifact；**`timeout-minutes: 180`**；线程类 env 与 benchmark/nightly 对齐 |
| `.gitignore` | 忽略 **`monthly_refit_meta.json`**（本地运行产物） |
| `docs/guides/P18.5 月度星系 refit 操作指南.md` | 操作顺序、Secrets、软/硬/skip、排错、artifact |
| `data/README.md` | 数据目录说明、全量重跑与 zip 契约、与 `p18_canonical_gha_bundle.zip`（五文件）区别 |

---

## 5. 关键实现细节

### 5.1 锚点闸逻辑（摘要）

- **`hard`**：`mean_anchor_l2 > --anchor-rmse-abort` → 退出码 1，不写后续库步骤（此前 GHA 失败路径）。  
- **`soft`**：同上区间 **WARN**；仅 `mean > soft_fail_max` 或非有限 → 失败。  
- **`skip`**：不因锚点残差失败（`--skip-anchor-rmse-abort` 等价）。

### 5.2 观测字段与指纹

- **`monthly_refit_kv`**：`anchor_mean_l2`、`anchor_max_l2`、`n_anchors`、`n_fit`、`cleaned_rows`、`cache_bundle_rows`、`membership_count`、`threshold_version`、`raw_source`（文件名 + raw 内容 sha256 前缀）、`bundle_fingerprint`（四文件 size + mtime_ns 摘要）、`anchor_mode`、`anchor_rmse_abort`、`anchor_soft_fail_max`；成功前后补充 **`below_threshold_count`**、`db_movie_count`、`pending_count`、`merged_pending_count` 等。

### 5.3 `threshold_versions` 写入时机（已知行为）

- 当前在 **UMAP / 锚点闸之前** upsert。若锚点闸在 **`hard`** 下失败，可能出现 **active 版本字符串已更新** 而 **`movies` 坐标未随本次 refit 更新** 的中间态；观测期以 **`soft`** 为主时可降低触发频率。后续若需严格原子语义，可单独立项调整顺序或事务边界。

---

## 6. GHA 实测摘要（代表性一次成功 run）

以下数值来自已保存的 workflow 日志（**`soft`**、`GALAXY_EMBED_BUNDLE_URL` 生效、Kaggle raw 与 zip 行数对齐场景），用于与后续月份对比基线：

| 项 | 典型结果（示意） |
|----|------------------|
| `cleaned` / membership | 与 zip **`cleaned.csv` 行数一致**（例如约 **59 341**） |
| UMAP `fit_transform` 墙钟 | 约 **10–12 分钟**（`ubuntu-24.04` public runner） |
| **`anchor_mean_l2`** | 可 **> 0.25**（例如约 **3.x**），**`soft`** 下 **WARN 后继续** |
| **`anchor_max_l2`** | 可能到 **两位数**；未超 `soft_fail_max` 则仍绿 |
| 导出 | **`validate_galaxy_json` OK**；artifact 含 **`monthly_refit_meta.json`** |

具体数值以每次 run 的 **`monthly_refit_kv`** 与 artifact 为准。

---

## 7. 验收清单（本阶段自评）

| 项 | 状态 |
|-----|------|
| `monthly_refit.yml` 存在且可 `workflow_dispatch` | 已满足 |
| Secrets 齐备 + **`GALAXY_EMBED_BUNDLE_URL`** zip 契约 | 已满足（需持续维护 zip 与 URL） |
| **`soft`** 下全流程绿（export + validate + artifact） | 已满足（至少一次代表性成功；计划原文「≥2 次」可按需在下一自然月再跑一次留档） |
| **`monthly_refit_meta.json`** 与日志 KV 一致 | 已满足 |
| 极端 / 结构性失败路径仍 fail（如四件套缺失、`n_anchors` 不足、validate 失败） | 由现有 assert/脚本逻辑覆盖 |

---

## 8. 已知与接受项

- **`galaxy_v1_reference` 与当前全量几何** 可能存在 **代差**，Procrustes 后 mean L2 不一定压到 0.25 以下；观测期内以 **meta + 视觉** 为主，不强制当月硬闸。  
- **约 19 条 `movies_pending`** 未出现在当月 `cleaned` 成员集时 **不会** 被本次合并（`merged_pending_count=0`）；**本次决策：不阻塞主线**，后续按需排查。  
- **Node 20 deprecation warning**（`actions/*@v4`）：平台提示，与本次业务逻辑无关，后续可随 action 升级消除。

---

## 9. 与相邻 Phase 的衔接

| Phase | 内容 |
|-------|------|
| **P18.4** | 每日冻结门槛 + 票数 + pending；**不写** `threshold_versions` active、**不重算** UMAP |
| **P18.6** | 在 **nightly** 与 **monthly** workflow 末尾启用 **Cloudflare Pages**（`cloudflare/pages-action`）+ `CLOUDFLARE_*`；部署 **不依赖** 锚点硬阈值通过（与 P18.5b 一致） |
| **P18.7** | Tech Spec / Data Pipeline / README 与 Phase 18 出口清单全文同步；可另起 **P18.5 实施报告** 交叉链接本文 |

---

## 10. 相关链接

- 计划：[.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md](../../.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md)（P18.5、P18.5b、P18.6 小节）  
- 操作指南：[P18.5 月度星系 refit 操作指南](../guides/P18.5%20月度星系%20refit%20操作指南.md)  
- 前置报告：[Phase 18.4 nightly vote refresh 与 Supabase 导出 实施报告](./Phase%2018.4%20nightly%20vote%20refresh%20与%20Supabase%20导出%20实施报告.md)、[Phase 18.3 Procrustes 对齐与 v1 reference 锁定 实施报告](./Phase%2018.3%20Procrustes%20对齐与%20v1%20reference%20锁定%20实施报告.md)

---

**文档版本：** 与仓库 **`main`** 上 P18.5 / P18.5b 实现一致；后续若调整锚点写入顺序、硬闸默认值或 CF 部署，请更新本报告 §5.3 / §6 / §9 并 bump 本段说明日期。
