# Phase 1.1–1.4 数据清洗管线 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 1.1–1.4（`p1-pipeline-orchestrator` 已标记为 `completed`）  
> **规范依据**: `docs/project_docs/TMDB 数据处理规则.md`（预处理 §1、强制剔除 §2、动态阈值 §2）  
> **报告日期**: 2026-04-12  
> **范围**: 统一管线入口、去重与强制过滤、动态票仓阈值、清洗产物输出；数据源与 subsample 文件名迁移；相关规则与计划同步（不含 Phase 2 特征工程及以后）

---

## 1. 摘要

本次工作在仓库中实现了开发计划 **Phase 1.1–1.4**：以 **`scripts/run_pipeline.py`** 为单一入口，从原始 TMDB 合并表 CSV 顺序执行 **主键/外部键去重**、**强制剔除规则**（含 `overview` 的 title / `original_title` 回退）、以及 **`vote_count` 年度动态基线阈值**（参数与归档脚本 `filter_dynamic_baseline_vote_count.py` 一致），最终写出中间产物 **`data/output/cleaned.csv`**（列数与原始表一致，当前为 **28** 列）。

同时将默认数据源从历史上的 `tmdb2025.csv` 约定更新为 **`data/raw/TMDB_all_movies.csv`**，子样本文件重命名为 **`data/subsample/TMDB_all_movies_random20.csv`**，并更新 **`.cursor/rules/data-protection.mdc`** 中的路径说明，避免后续协作仍引用旧文件名。

Git 侧在独立分支上完成开发与提交，并已合并进主分支（见 §2、§7）。

---

## 2. 执行操作清单

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 新建 Git 分支 | `feature/phase1-cleaning-pipeline-tmdb-all-movies`（开发与提交用） |
| 2 | 新增管线包 | `scripts/pipeline/`（`__init__.py`、`cleaning.py`） |
| 3 | 新增统一入口 | `scripts/run_pipeline.py`（`argparse`，默认读 raw、写 `cleaned.csv`） |
| 4 | Subsample 文件重命名 | `data/subsample/tmdb2025_random20.csv` → `TMDB_all_movies_random20.csv`（Git 记录为 rename） |
| 5 | Cursor 规则更新 | `.cursor/rules/data-protection.mdc`：raw / subsample 路径与体量说明 |
| 6 | 开发计划 Todo | `tmdb_galaxy_dev_plan_5ad6bea5.plan.md` 中 `p1-pipeline-orchestrator` → `status: completed` |
| 7 | 合并与后续提交 | 代表性实现提交：`6b6a05a`；合并 PR 记录：`1ac85e0`；计划勾选更新示例：`3a851ad`（以仓库 `git log` 为准） |

---

## 3. 与数据处理规则 / 开发计划的对照

| 要求项 | 实现说明 |
| --- | --- |
| **Phase 1.1** 单一编排入口 | `python scripts/run_pipeline.py`，支持 `--input` / `--output` 及动态阈值相关 CLI；`--help` 可正常打印 |
| **Phase 1.2** 主键去重 | 按 `id` 去重；排序后保留 `vote_count` 较高的一条（同 id 理论上极少） |
| **Phase 1.2** `imdb_id` 去重 | 对非空且非 null-like 的 `imdb_id` 去重；空 `imdb_id` 行使用按行唯一键，**不互相合并**；保留 `vote_count` 更高的一条 |
| **Phase 1.3** `genres` | 空 / null-like 剔除 |
| **Phase 1.3** `vote_count` / `vote_average` | 0 或 null-like 剔除（与归档 filter 脚本语义一致） |
| **Phase 1.3** `release_date` | null-like 剔除 |
| **Phase 1.3** `overview` | 空则先用 `title`；若 `original_title` 与 `title` 不同且非空，则拼接为 `title + " " + original_title`；仍空则剔除 |
| **Phase 1.3** 动态阈值 | `quantile=0.95`，`alpha=0.15`，`abs_min=1`，`rolling_window=6`；按年映射阈值；无法解析年份或低于阈值的行剔除（与归档逻辑一致） |
| **Phase 1.3** 日志与汇总 | 每步打印 `[Filter:{name}] Dropped: … -> Remaining: …`；末尾打印汇总表 |
| **Phase 1.3** 全量行数预期 | 对**默认全量输入** `data/raw/TMDB_all_movies.csv` 自动断言最终行数在 **55,000–65,000**（与 Dataset Report 量级一致；若数据策略变更可用 `--expect-final-rows-min` / `--expect-final-rows-max` 覆盖） |
| **Phase 1.4** 输出路径 | 默认 `data/output/cleaned.csv`；`write` 前创建父目录 |
| **Phase 1.4** 质量断言 | 清洗后对 `genres`、`vote_count`、`vote_average`、`release_date`、`overview` 做 null-like / 数值非零校验；可用 `--skip-quality-assert` 跳过（仅建议调试） |

---

## 4. 交付文件与接口

### 4.1 仓库内代码路径

| 路径 | 职责 |
| --- | --- |
| `scripts/run_pipeline.py` | CLI 入口：`--input`、`--output`、`--quantile`、`--alpha`、`--abs-min`、`--rolling-window`、`--skip-quality-assert`、可选 `--expect-final-rows-min` / `--expect-final-rows-max` |
| `scripts/pipeline/cleaning.py` | 去重、各步 filter、overview 回退、`apply_dynamic_vote_threshold`、`assert_cleaned_quality`、`print_summary_table` |
| `scripts/pipeline/__init__.py` | 包标识 |

运行方式（需在项目根目录或自行指定路径；依赖仓库 `.venv` 已安装 `pandas` / `numpy`）：

```bash
.\.venv\Scripts\python.exe scripts\run_pipeline.py
.\.venv\Scripts\python.exe scripts\run_pipeline.py --help
.\.venv\Scripts\python.exe scripts\run_pipeline.py --input data\subsample\TMDB_all_movies_random20.csv --output data\output\cleaned_subsample.csv
```

### 4.2 本地产物路径（默认不进入 Git）

| 产物 | 说明 |
| --- | --- |
| `data/output/cleaned.csv` | Phase 1 默认清洗结果；**`data/output/` 在 `.gitignore` 中** |
| 自定义 `--output` | 例如子样本冒烟时的 `cleaned_subsample_smoke.csv` 等 |

---

## 5. 数据路径与命名变更

| 类型 | 旧约定（文档/计划中常见） | 当前仓库约定 |
| --- | --- | --- |
| 全量原始 CSV | `data/raw/tmdb2025.csv` | `data/raw/TMDB_all_movies.csv` |
| 20 行子样本 | `data/subsample/tmdb2025_random20.csv` | `data/subsample/TMDB_all_movies_random20.csv` |

**说明**: `data/raw/` 仍被 `.gitignore` 忽略；子样本文件 **被跟踪**，便于 CI 与文档引用 schema。

---

## 6. 验证与观测数据

以下为当时在本机全量与子样本上跑通管线后的典型数字（全量以 `TMDB_all_movies.csv` 为准，行数随上游数据变化可能略有不同）。

### 6.1 全量 `TMDB_all_movies.csv` → `cleaned.csv`

| 阶段 | 行数（约） | 备注 |
| --- | ---: | --- |
| 读入 | 1,179,720 | 28 列 |
| `id` 去重后 | 1,179,720 | 无重复 id |
| `imdb_id` 去重后 | 1,179,720 | 无重复 imdb |
| 经各强制过滤 + 动态阈值后 | **59,014** | 落在计划断言区间 55k–65k 内 |
| 输出文件大小（约） | **~59 MB** | 与行数、字段宽度相关 |

各 filter 的剔除行数与比例以终端实际打印为准；动态阈值步在全量上剔除比例较高属预期（长尾低票样本）。

### 6.2 子样本 `TMDB_all_movies_random20.csv`

| 阶段 | 行数 |
| --- | ---: |
| 读入 | 20 |
| 去重后 | 20 |
| 强制过滤后 | 20 |
| 动态阈值后 | **16**（示例：剔除 4 行） |

### 6.3 Phase 1.4 抽查命令（计划 Checkpoint）

```bash
.\.venv\Scripts\python.exe -c "import pandas as pd; df=pd.read_csv('data/output/cleaned.csv'); print(df.shape); print(df[['id','vote_count','vote_average','release_date','genres']].describe(include='all'))"
```

预期：`shape` 为 `(约 59000+, 28)`；`vote_count` / `vote_average` 最小值大于 0；各列无大面积缺失（`describe` 与数据分布随版本略有差异属正常）。

---

## 7. Git 与协作说明

- **实现提交（示例）**: `6b6a05a` — `Add Phase 1 cleaning pipeline and TMDB CSV paths`  
- **合并**: 通过 Pull Request 合入主分支的记录为 `1ac85e0`（`Merge pull request #2 from XYBuilds/feature/phase1-cleaning-pipeline-tmdb-all-movies`）  
- 当前开发可在 **`main`** 上继续拉取；若需复现历史分支，仍可使用 `feature/phase1-cleaning-pipeline-tmdb-all-movies` 指向该提交系列。

---

## 8. 后续工作衔接

- **Phase 2** 各脚本（文本 Embedding、Genre 编码、Language 编码、UMAP、JSON 导出）应以 **`data/output/cleaned.csv`** 为输入（或与 `run_pipeline.py` 输出路径对齐），并在 `run_pipeline.py` 中逐步挂载步骤（若计划要求单一编排器贯穿全链路）。  
- **Phase 2.6** subsample 冒烟：建议统一使用  
  `--input data/subsample/TMDB_all_movies_random20.csv`。

---

## 9. 附录：归档参考代码位置

旧版独立 filter 与动态阈值参考实现仍保留在：

`scripts/_archive/`（Phase 1.0 已归档，管线逻辑以 `scripts/pipeline/cleaning.py` 为准）。
