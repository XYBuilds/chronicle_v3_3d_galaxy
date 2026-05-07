# Phase 20.2 — 语言词表 v1 固化与维度漂移探测（实施报告）

**范围：** 对照 [.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md](../../.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md) 中的 **P20.2**：冻结 **`original_language`** 与既有 **genre** 维度词汇表，在 **nightly / monthly** 管线中 **fail CI（脚本非零退出）** 探测 TMDB 新增语种码或未知流派标签；提供 **`workflow_dispatch`** 紧急跳过通道（写入日志与 monthly meta）；月度 **`monthly_refit_meta.json`** 并入漂移报告字段。

**明确不在本期：** 修改 UMAP / Procrustes / 阈值算法；修改 `galaxy_data.json` 公共契约字段；Tech Spec / Data Pipeline / README 全文同步 — **留待 Phase 20.6**。

**Git：** 开发与验收建议在独立分支上进行（例如 `phase/p20-2-dim-drift`）；合并说明可采用：`feat(P20.2): frozen lang vocab + dim drift gate for nightly/monthly`。

---

## 1. 最终决策（已定稿）

| 议题 | 决策 | 理由 |
|------|------|------|
| 流派维度 | **沿用** Phase 18.0 **`genre_palette.py`** 中 **`FROZEN_GENRE_ORDER_V1`** + **`GENRE_PALETTE_VERSION`**，不再复制第二套流派表 | 与既有 **`assert_all_genres_in_frozen_v1`** 语义一致；genre 侧已在 P18 收口 fail-loud。 |
| 语言维度 | **新增** **`language_palette.py`**，冻结 **`FROZEN_LANG_ORDER_V1`**（**103** 个归一化码，与 Phase 18 canonical **`data/output/cleaned.csv`** 上 **`collect_sorted_languages()`** 结果一致）及 **`LANG_PALETTE_VERSION = "v1"`** | nightly 的 **`one_hot_language_matrix_with_fallback`** 曾把未知 ISO **静默**映射到 **`__unknown__`**，导致 UMAP 语义漂移无告警；需与「当前嵌入词表」对齐的冻结集合。 |
| 统一入口 | **`dim_drift_detector.assert_no_dim_drift(df)`**：同时汇总 **unknown_genres**、**unknown_languages**，**一次抛出**（含两类列表），避免运维分批排查 | 计划要求聚合错误而非逐项 fail-fast。 |
| 失败语义 | **维度漂移 = 任务失败**：n **`DimDriftError`** → nightly **`return 1`**；monthly 写 **`monthly_refit_meta.json`**（**`status: aborted_dim_drift`**）后 **`return 1`** | 与「fail CI」决策一致；不靠外部告警系统先行拦截。 |
| 注入位置（nightly） | **`run_cleaning_pipeline`** 完成之后，**Supabase / dry-run 分支之前**，对 **`cleaned`** 调用 **`assert_no_dim_drift`** | 当日 raw 清洗后即可发现新语种/标签，不必等月度。 |
| 注入位置（monthly） | **`run_cleaning_pipeline_before_vote_threshold`** 得到 **`df_pre`** 之后，**`compute_year_to_vote_threshold` 之前** 调用 | 与计划「在重新计算 threshold 之前」一致；**`df_pre`** 已含 **genres** / **original_language**。 |
| monthly 元数据 | 成功与各类中止路径（锚点、export、validate）均在写入 **`monthly_refit_meta.json`** 时 **merge** **`genre_palette_version`、`lang_palette_version`、`unknown_genres`、`unknown_languages`、`dim_drift_force_skip`** | 运维可用 artifact 与 **`monthly_refit_kv`** 对照；与 P18.5b meta 并存。 |
| 紧急跳过 | 环境变量 **`DIM_DRIFT_FORCE_SKIP`**：值为 **`1` / `true` / `yes` / `on`**（大小写不敏感）视为真；Workflow 通过 **`workflow_dispatch`** 布尔输入 **`force_skip_dim_check`** 注入 | 计划要求临时 unblock；**schedule** 触发时不勾选输入 → 环境与表达式为假，**不跳过**。 |
| 词表再生 | 保留审计脚本 **`scripts/tools/freeze_language_vocab_v1.py`**：从指定 **`cleaned.csv`** 打印 **`repr(tuple(...))`**，人工回填 **`FROZEN_LANG_ORDER_V1`** 后 **bump `LANG_PALETTE_VERSION`** | 与计划「一次性脚本可保留作 audit」一致。 |
| 测试 | **`scripts/tests/test_dim_drift_detector.py`**（**unittest**）：合法表、未知 genre、未知 ISO、**force_skip** 有未知仍不抛、**`language_palette`** 辅助断言 | 仓库既有 Python 测试放在 **`scripts/tests/`**，与 **`test_genre_palette.py`** 同惯例。 |
| 文档 SSOT | **本期不写** Tech Spec / Data Pipeline / README | 归入 **P20.6** 统一改版。 |

---

## 2. 最终操作（仓库内实际改动）

### 2.1 新增文件

| 文件 | 作用 |
|------|------|
| [scripts/feature_engineering/language_palette.py](../../scripts/feature_engineering/language_palette.py) | **`LANG_PALETTE_VERSION`**、**`FROZEN_LANG_ORDER_V1`**（103 项）、**`FROZEN_LANG_CODES_V1`**、**`collect_normalized_language_codes`**、**`assert_all_languages_in_frozen_v1`**。 |
| [scripts/feature_engineering/dim_drift_detector.py](../../scripts/feature_engineering/dim_drift_detector.py) | **`DimDriftError`**、**`assert_no_dim_drift`**（聚合 genre + language 未知列表；**`force_skip`** 时不抛）。 |
| [scripts/tools/freeze_language_vocab_v1.py](../../scripts/tools/freeze_language_vocab_v1.py) | 从 **`--input`**（默认 **`data/output/cleaned.csv`**）导出排序后的语言元组字符串，供更新冻结表。 |
| [scripts/tests/test_dim_drift_detector.py](../../scripts/tests/test_dim_drift_detector.py) | 单元测试（含可选 **`RUN_DIM_DRIFT_INTEGRATION`** 本地 smoke）。 |

### 2.2 修改文件

| 文件 | 变更摘要 |
|------|----------|
| [scripts/cron/nightly_vote_refresh.py](../../scripts/cron/nightly_vote_refresh.py) | 引入 **`assert_no_dim_drift` / `DimDriftError`**；**`_env_dim_drift_force_skip()`** 读 **`DIM_DRIFT_FORCE_SKIP`**；清洗完成后尝试漂移检查，失败则 **`return 1`**。 |
| [scripts/cron/monthly_refit.py](../../scripts/cron/monthly_refit.py) | 在 **`df_pre`** 之后调用 **`assert_no_dim_drift`**；失败写 **`monthly_refit_meta.json`**（**`aborted_dim_drift`**）；成功路径与各中止路径的 meta 均 **merge** 漂移报告字段。 |
| [.github/workflows/nightly_vote_refresh.yml](../../.github/workflows/nightly_vote_refresh.yml) | **`workflow_dispatch.inputs.force_skip_dim_check`**；Run step **`env.DIM_DRIFT_FORCE_SKIP`**：`workflow_dispatch` 且勾选时为真，否则假。 |
| [.github/workflows/monthly_refit.yml](../../.github/workflows/monthly_refit.yml) | 同上，并与既有 **`anchor_mode`** 输入并列。 |
| [.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md](../../.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md) | 计划内 **p202-dim-drift** todo 标为 **completed**（若主线已合并该提交）。 |

### 2.3 运行时契约（脚本）

- **必需列：** **`genres`**（与 **`genre_encoding.parse_genre_list`** 相同的逗号分隔单元格）、**`original_language`**。
- **日志前缀：** **`[dim_drift]`**，单行包含 **`genre_palette_version`、`lang_palette_version`、`unknown_*`、`force_skip`**。
- **monthly 失败专属：** **`status: aborted_dim_drift`**，并含 **`raw_source`**（raw 文件名 + sha256 前缀指纹）。

---

## 3. 验收与观测

### 3.1 本地 / CI 单测

```powershell
Set-Location <REPO_ROOT>
$env:PYTHONPATH = "scripts"
python -m unittest discover -s scripts/tests -p "test_dim_drift_detector.py" -v
```

可选：对全量 **`cleaned.csv`** 做一次 **`assert_no_dim_drift`**（列子集 **`genres`,`original_language`**），应与冻结 **103** 语种一致且 **unknown 为空**（以当前 canonical 导出为准）。

### 3.2 GitHub Actions（一次成功运行）

以下结论来自用户导出的 **P18.4 Nightly vote refresh** 日志目录示例：**`logs/Github Workflow/logs_67884079927`**（分支 **`phase/p20-2-dim-drift`**，提交 **`e41acf5fbab2682c1bb6008bd9148f0249eb2cc5`**）；**以 Actions UI 上该 run 的 Success 为最终权威**。

| 验收项 | 结果 | 说明 |
|--------|------|------|
| 维度漂移检查执行 | 通过 | 日志出现 **`[dim_drift] genre=v1 lang=v1 unknown_genres=[] unknown_languages=[] force_skip=False`**。 |
| **`DIM_DRIFT_FORCE_SKIP`** | **`false`** | 与未勾选 **`force_skip_dim_check`** 的 dispatch / schedule 行为一致。 |
| nightly 主流程 | 通过 | Kaggle 下载 → 清洗 → Supabase → 导出 → 校验 → R2 → 前端 build → **Pages deploy** 完成。 |
| 已知非致命告警 | 已记录 | **R2 prune** 后 **`upload-artifact`** 可能找不到大 gzip/json 路径 — 与 P18.6b「只留 manifest」设计一致，见 P20.1 报告 §3。**Actions Node 20 deprecation** 总警告与业务无关，待官方升级 composite / 或 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`。 |

### 3.3 出现漂移时的运维路径（摘要）

1. **正规修复：** 用 **`freeze_language_vocab_v1.py`**（或全量 pipeline）确认新码 → 扩展 **`FROZEN_LANG_ORDER_V1`** → **bump `LANG_PALETTE_VERSION`** → 安排 **全量重嵌入 / 新 embedding bundle**（与 Data Pipeline 节奏一致）。流派侧同理扩展 **`FROZEN_GENRE_ORDER_V1`**（极少见，TMDB 官方新增流派时）。
2. **应急：** 在 **workflow_dispatch** 勾选 **`force_skip_dim_check`**，使 **`DIM_DRIFT_FORCE_SKIP`** 为真；月度运行须在 **`monthly_refit_meta.json`** 中看到 **`unknown_*`** 与 **`dim_drift_force_skip: true`**，便于事后审计。

---

## 4. 风险与回滚

| 风险 | 缓解 |
|------|------|
| 冻结表相对 **Kaggle 日更 raw** 漏掉稀有 ISO（首次冻结遗漏） | nightly **首轮红**：对照日志 **`unknown_languages`** 补码表；必要时一次性 **`force_skip`** 争取窗口。 |
| **`force_skip` 滥用** | 仅 workflow_dispatch；meta 持久化 **`dim_drift_force_skip`** 与 unknown 列表。 |
| 与 **embedding bundle** 语言维宽度不一致 | 月度原有 **`len(lang_order) == dl`** assert 仍在；P20.2 不负责改 npy 契约，仅阻断「清洗侧出现冻结集外标签」。 |

**回滚：** 还原 **`nightly_vote_refresh.py` / `monthly_refit.py`** 中漂移调用及相关 workflow 输入；删除 **`language_palette.py`、`dim_drift_detector.py`** 等新增模块（需同时清理 import）。不推荐在生产长期关闭检测。

---

## 5. 后续建议（非 P20.2 必做）

1. **P20.6**：在 Tech Spec / Data Pipeline / README 中增加「维度漂移探测（**`genre_palette_version` + `lang_palette_version` + `force_skip`）」章节，并与本文交叉引用。
2. **可选：** 在 nightly artifact 步骤之前上传导出品，或调整 R2 prune 顺序，避免 **`upload-artifact`** 空路径告警（属 P18.6b 运维体验优化，非 P20.2 范围）。

---

## 6. 小结

P20.2 的**最终决策**是：语言 one-hot 维度与流派标签必须以 **冻结 v1 词汇表**为界，通过 **`dim_drift_detector`** 在 **nightly（cleaned）** 与 **monthly（df_pre、threshold 重算前）** 统一拦截 **静默维度漂移**；失败 **fail CI**，应急通过 **`DIM_DRIFT_FORCE_SKIP`**；月度 **`monthly_refit_meta.json`** 全面携带 **`unknown_*`** 与版本字段。**最终操作**为上述新增 4 个文件与 4 个既有文件（两 cron + 两 workflow）的改动；文档正文同步归入 **Phase 20.6**。
