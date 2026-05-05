# Phase 18.4 — nightly vote refresh、Supabase 导出与 CI 落地（实施报告）

**范围：** 按计划 [.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md](../../.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md) 中 **P18.4**：Kaggle 日更 raw → **冻结** `threshold_versions` 动态门槛清洗 → Supabase **票数刷新** / **`movies_pending`** 增量向量 → 从 **`movies`** 重导 **`galaxy_data.json(.gz)`** 与搜索索引 → GitHub Actions 定时与产物 artifact。前端契约不变（仍消费静态 JSON.gz）。

**状态：** 代码与 workflow 已合入主线实践路径；本地与 GHA 多轮排障后 **nightly + export + validate + artifact** 可端到端跑通（见 §7、§8）。**Cloudflare Pages 自动部署**留 **P18.6**（workflow 内仍为注释占位）。

**运维指南（操作顺序）：** [P18.4 每日投票刷新与导出入口指南](../guides/P18.4%20每日投票刷新与导出入口指南.md)；Supabase 前置： [Supabase 操作教程](../guides/Supabase%20操作教程.md)。

---

## 1. 与总计划的对齐

| 计划要求（P18.4 摘要） | 本阶段落实 |
|------------------------|------------|
| 冻结门槛：每日读取 `threshold_versions.is_active`，不重算 | `run_cleaning_pipeline(..., frozen_year_thresholds=...)` + `seed_active_threshold_version.py` 播种 |
| 现有 id：UPDATE vote_count / vote_average / popularity | `movies` **upsert** 合并整行（保留 x,y,z） |
| 新过线：embedding + genre/lang → `movies_pending` BYTEA | CPU **MiniLM** + `rank_weighted_genre_matrix` + `one_hot_language_matrix_with_fallback`；PostgREST 友好 **`\\x` hex 字符串** 写入 BYTEA |
| 月初 `vote_snapshots` | UTC **每月 1 日** 批量 upsert |
| `export_from_supabase` + `build_galaxy_payload` | `export_galaxy_json` 拆出 **`build_galaxy_payload` / `write_galaxy_export_files`**；`meta.version`：`YYYY.MM.DD.daily.<seq>` |
| GHA：cron + dispatch，Secrets，可选 CF | `.github/workflows/nightly_vote_refresh.yml`；artifact 上传；CF 注释 |

**本阶段未做（后续 Phase）：** P18.5 月度全量 refit / 更新 active 门槛 / 合并 pending；P18.6 CF Pages 接线；P18.7 全量 spec 同步。

---

## 2. 架构与产品决策（最终）

1. **单一真相源与静态前端**  
   - 权威数据仍在 **Supabase `movies`**；前端不直连 DB，继续通过 **构建产物** `galaxy_data.json.gz` 分发（与 P18.2 D1 一致）。

2. **冻结门槛策略**  
   - **每日**只读 **`threshold_versions`** 中当前 **active** 行的 **`thresholds_json`**（逐年 `vote_count` 下限），与「当月/上月 refit 算出的门槛」解耦，避免日更数据导致老片在边缘反复进出宇宙。  
   - **更新 active 门槛**仅在 **P18.5** 月度任务中执行。

3. **「在库但当日未出现在 cleaned」」**  
   - **不删除** `movies` 行；仅统计 **`below_threshold_observed`**，供观察；是否剔除由 **P18.5 membership** 策略决定。

4. **Secrets 与密钥**  
   - GitHub Actions：**`SUPABASE_URL`**、**`SUPABASE_SERVICE_ROLE_KEY`**、**`KAGGLE_USERNAME`**、**`KAGGLE_KEY`**（Repository secrets，不入库）。  
   - 与 P18.2 一致：**批量写库使用 `service_role`**，不用 anon。

5. **CI 产物策略**  
   - 当前以 **`actions/upload-artifact`** 输出三文件为主；**不上线**自动 Pages 部署，避免与现有 GitHub Pages 灰度冲突（P18.6 统一切流时可接 `cloudflare/pages-action`）。

---

## 3. 代码与文件清单（最终形态）

| 路径 | 作用 |
|------|------|
| `scripts/pipeline/cleaning.py` | `run_cleaning_pipeline_before_vote_threshold`、`compute_year_to_vote_threshold`、`apply_frozen_vote_threshold`、`run_cleaning_pipeline(..., frozen_year_thresholds=...)` |
| `scripts/export/export_galaxy_json.py` | `build_galaxy_payload`、`write_galaxy_export_files`；CLI `main` 复用 |
| `scripts/feature_engineering/language_encoding.py` | `one_hot_language_matrix_with_fallback`（未知 ISO → `__unknown__`） |
| `scripts/cron/seed_active_threshold_version.py` | 从 raw 算门槛前帧 → 写 **`threshold_versions`** 并激活 |
| `scripts/cron/nightly_vote_refresh.py` | Kaggle/本地 raw → 清洗 → upsert / pending / 月初快照 → 子进程 export + validate |
| `scripts/cron/export_from_supabase.py` | 分页（及并行分片）拉 `movies` → `build_galaxy_payload` → 写 `frontend/public/data/*` |
| `.github/workflows/nightly_vote_refresh.yml` | `cron: 0 20 * * *` UTC + `workflow_dispatch`；`timeout-minutes: 60` |
| `requirements.cpu.txt` | 增加 **`kaggle>=1.6,<2`** |
| `docs/guides/P18.4 每日投票刷新与导出入口指南.md` | 操作清单与排错 |
| `docs/guides/Supabase 操作教程.md` | §12 增加指向 P18.4 指南的链接 |

---

## 4. 关键实现细节

### 4.1 冻结门槛与年份扩展

- `thresholds_json` 的 key 经 **`int(k)`** 解析；对当前数据中年份区间用 **`_extend_threshold_series_to_year_range`** 做边界扩展，避免新片年份略超出 JSON 范围时 `map` 出 NaN。

### 4.2 `movies_pending` 与 PostgREST JSON

- Python **`bytes`** 不能直接作为 JSON 字段发给 PostgREST。  
- **最终决策：** 使用 **`_bytea_hex`**：`"\\x" + buf.hex()`，与 Postgres **BYTEA hex 文本**约定一致，由服务端解码为 BYTEA。

### 4.3 语言词表与 `__unknown__`

- 词表由当前 **`movies`** 的 `original_language` 经 **`normalize_language_code`** 聚合排序。  
- **问题：** 若全库无空语言，集合中可能不含 **`__unknown__`**，与 one-hot 槽位设计冲突。  
- **最终决策：** **`_build_lang_order_from_movies`** 内 **`found.add(UNKNOWN_LANG)`**，保证稳定 fallback 维。

### 4.4 Kaggle CLI 在 ubuntu-24.04 上的调用方式

- **现象：** `python -m kaggle` 报 **`No module named kaggle.__main__`**（与 pip 包版本有关）。  
- **最终决策：** **`_download_kaggle_to`** 多路回退：  
  1. `python -m kaggle.cli ...`  
  2. `shutil.which("kaggle")` 可执行文件  
  3. 最后尝试 `python -m kaggle ...`

### 4.5 导出性能（显著压缩墙钟）

- **问题：** `select("*")` + 大字段（`overview`、`TEXT[]` 等）导致 **每页 ~数十秒**，整 job 易顶 **`timeout-minutes: 60`**。  
- **最终决策：**  
  1. **列裁剪：** `_MOVIES_EXPORT_COLUMNS` + `MOVIES_EXPORT_SELECT`，去掉导出不需要的列（如 `title_normalized`、`z`、`last_*`）。  
  2. **并行分片：** 默认 **`--fetch-workers` = 4**（可用环境变量 **`GALAXY_EXPORT_FETCH_WORKERS`** 覆盖）；每线程独立 **`create_client`**，避免共享 HTTP 客户端线程安全问题。  
  3. **分页推进：** 使用 **`pos += len(batch)`**（而非固定 `page_size` 步进），避免末页不满时死循环或漏行。  
  4. **行数校验：** `count=exact` 与合并后 **`len(out) == total`** 断言。

实践上 GHA 一次成功 run 中，全表 **59,014** 行拉取墙钟可降至 **约十余秒量级**（随网络/项目配额波动），大幅降低与 nightly 前置步骤叠加后的超时风险。

### 4.6 与 PyPI `supabase` 包名的路径冲突

- `scripts/supabase/initial_import.py` 与 **`supabase`** 包同名目录并存时，`from supabase.initial_import import ...` **不可靠**。  
- **最终决策：** nightly 内 **内联 `_release_date_iso`**，避免从 `supabase.initial_import` 再导入。

---

## 5. GitHub Actions 与验收

### 5.1 Workflow 行为

- **触发：** 每日 UTC **20:00**；手动 **`workflow_dispatch`**。  
- **环境：** `ubuntu-24.04`；`OMP_NUM_THREADS` 等与 P18.1b 思路一致。  
- **`GALAXY_EXPORT_SEQ`：** 默认 **`github.run_number`**，写入 `meta.version` 的 daily 后缀。

### 5.2 成功 run 的可观测信号（摘要）

以下为一轮 **基本成功** 时的典型证据链（具体 run id 以 Actions 为准）：

1. **`Run nightly vote refresh` 日志**  
   - 出现 **active threshold** 版本号与 **frozen** 清洗最后一步名。  
   - **`vote_updates`** / **`below_threshold_observed`** / **`new_pending_candidates`** 统计行。  
   - **`[P18.4 nightly] completed at ...`**。

2. **导出阶段**  
   - **`[P18.4 export] total movies rows=59,014`**（或与当前库一致的总行数）。  
   - 并行模式下可见 **shard wall** 秒级统计。  
   - 写出 **`galaxy_data.json`**、**`.gz`**、**`galaxy_search_index.json.gz`**。

3. **校验**  
   - **`[Validate] OK — meta.count=59014, movies=59014`**（或与当前 `meta.count` 一致）。

4. **Artifact**  
   - **`upload-artifact`** 成功，zip 内含上述三文件。

### 5.3 仍为运维选项的配置

- **`timeout-minutes: 60`**：若未来 Kaggle 解压变慢、pending 批量变大或 Supabase 限流，仍可 **上调至 120–180**（与计划 P18.1b 余量思路一致）。  
- **`--fetch-workers 1`**：若并行触发限流/5xx，可退回串行（CLI 或 env）。

---

## 6. 本地验收路径（与 transcript 一致）

以下顺序已在实际环境中跑通，可作为回归清单：

1. **播种冻结门槛**（一次性，需 raw + Supabase）：  
   `python scripts/cron/seed_active_threshold_version.py --input data/raw/TMDB_all_movies.csv`  
   （可先 `--dry-run`。）

2. **nightly 冒烟（不写库）**：  
   `python scripts/cron/nightly_vote_refresh.py --input-csv data/subsample/TMDB_all_movies_random20.csv --dry-run`

3. **仅导出**：  
   `python scripts/cron/export_from_supabase.py`

4. **校验**：  
   `python scripts/validate_galaxy_json.py --input frontend/public/data/galaxy_data.json`

5. **GHA**：仓库 **Settings → Secrets → Actions** 配齐四类 Secret 后 **`Run workflow`**，检查 §5.2。

---

## 7. 已知问题与后续工作

| 项 | 说明 |
|----|------|
| **P18.5** | 月度重算门槛、合并 `movies_pending`、UMAP + Procrustes、回写坐标。 |
| **P18.6** | workflow 末尾接 **Cloudflare Pages**（或 R2 + Pages）；当前 artifact 不自动上站。 |
| **PostgREST / 网关限流** | 并行 `fetch_workers>1` 时若遇 429/5xx，可降低 worker 或加退避（未实现）。 |
| **更激进 payload 裁剪** | 若仍需减体积：DB 侧 RPC 截断 `overview` / cast 列表等（需迁移与产品同意）。 |

---

## 8. 结论

- **产品决策：** 日更保持 **冻结门槛** + **仅刷新票数与 popularity** + **新片进 pending**；**不改** `threshold_versions` active 行；**不删** 因当日门槛掉线的在库影片。  
- **工程决策：** Kaggle **多路 CLI**；pending **BYTEA → `\\x` hex 文本**；语言词表 **强制含 `__unknown__`**；导出 **列裁剪 + 并行分片 + 正确 range 步进**。  
- **验收结论：** 本地 **seed → dry-run → export → validate** 与 GHA **dispatch 成功 + artifact** 可共同作为 **P18.4 收口**依据；**自动上站**待 **P18.6**。

---

## 9. 参考会话与日志索引（内部）

实施与排障过程摘要来自以下 Cursor 父会话 transcript（仅作溯源，不包含子 agent id）：

- [P18.4 指南与 CI 排障](2034dc28-337c-4a8b-ad2a-2a5b381bf34b)（`2034dc28-337c-4a8b-ad2a-2a5b381bf34b`）：seed、dry-run、export、validate、Kaggle `__main__`、语言词表、BYTEA 序列化修复。  
- [导出性能与 GHA 成功判读](7cfa998c-785c-468a-ad45-55def12280e2)（`7cfa998c-785c-468a-ad45-55def12280e2`）：`select("*)` 瓶颈、`timeout-minutes` 讨论、列裁剪与并行拉取、run **67502006808** 级成功形态。

（若仓库内另存 `logs/Github Workflow/logs_*`，可与上述 run id 交叉对照。）

---

*文档版本：与仓库 P18.4 实现一致；后续变更请同步本报告 §3–§5 或改为「变更记录」小节。*
