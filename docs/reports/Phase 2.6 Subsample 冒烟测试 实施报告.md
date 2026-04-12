# Phase 2.6 Subsample 冒烟测试 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 2.6（`p2-subsample-smoke`）  
> **规范依据**: `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` §4（JSON Schema / `movies[i]` 字段契约）、开发计划 Phase 2.6 Checkpoint（subsample 全流程、`meta.count`、逐条数值肉眼检查、§4.3 必有字段非 null）  
> **报告日期**: 2026-04-12  
> **范围**: 新建 Git 分支、`run_pipeline.py` 串联 Phase 1 与 Phase 2.1–2.5、JSON 校验脚本、计划约定的 subsample 文件名与数据文件、本地端到端验证与提交记录

---

## 1. 摘要

本次工作落实了开发计划中 **Phase 2.6：Subsample 冒烟测试**——在 **20 行** subsample 上跑通 **Phase 1（清洗）+ Phase 2（特征工程、UMAP、JSON 导出）**，并对产出 **`galaxy_data.json`** 做 **结构校验与逐条摘要打印**，确认与 **Tech Spec §4** 一致、无静默字段缺失。

在用户要求 **先新开 Git 分支再改代码** 的前提下，从 `main` 创建分支 **`phase-2-6-subsample-smoke`**，主要交付为：

1. **`scripts/run_pipeline.py`**：在原有 Phase 1 逻辑之上增加 **`--through-phase-2`**，按固定顺序 **子进程** 调用 `text_embedding.py` → `genre_encoding.py` → `language_encoding.py` → `umap_projection.py` → `export_galaxy_json.py`；导出时为 gzip 显式传入 **`--output-gzip`**，与 JSON 同主文件名（`galaxy_data.json` / `galaxy_data.json.gz`）。为对齐开发计划中的 **单条验收命令**，当 **`--input`** 解析为仓库内固定路径 **`data/subsample/tmdb2025_random20.csv`** 时，**自动启用** Phase 2 全流程，并自动设置 **`--expect-final-rows-min 1 --expect-final-rows-max 20`**（除非用户已自行传入行数断言参数）。若仅需清洗该文件、不跑 Phase 2，可使用 **`--phase-1-only`** 关闭自动行为。
2. **`scripts/validate_galaxy_json.py`**：加载 JSON，校验 **`meta`** 必备键、**`meta.count == len(movies)`**、每条 **`movies[i]`** 在 §4.3 中 **不得为 JSON `null`** 的字段（**`tagline`、`imdb_rating`、`imdb_votes`、`runtime`、`imdb_id`** 按规范允许为 `null`），并校验 **`x/y/z/size/emissive`** 有限、**`genre_color`** 为长度 3 的 **[0,1]** 浮点 RGB；**`--print-movies`** 按开发计划 Checkpoint 打印 **`{id}: {title} → x=… y=… z=… size=… emissive=… color=…`**。
3. **`data/subsample/tmdb2025_random20.csv`**：与既有 **`TMDB_all_movies_random20.csv`** **内容一致** 的副本，用于满足计划中写死的输入路径 **`data/subsample/tmdb2025_random20.csv`**（避免仅文档改名而命令找不到文件）。

实现已提交至分支 **`phase-2-6-subsample-smoke`**，提交哈希为 **`cf4616d`**（提交说明：`feat(pipeline): Phase 2.6 subsample smoke end-to-end in run_pipeline`）。

---

## 2. 执行操作清单

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 创建 Git 分支 | 分支名：`phase-2-6-subsample-smoke`（从 `main` 检出） |
| 2 | 扩展统一入口 | `scripts/run_pipeline.py`：`--through-phase-2`、`--galaxy-json`、`--skip-json-validate`、`--phase-1-only`；Phase 2.6 subsample 路径自动 Phase 2 + 行数断言；子进程环境 **`PYTHONUNBUFFERED=1`**，父进程关键输出 **`flush=True`** 以减轻与子进程 stdout 交错导致的日志顺序混乱 |
| 3 | 新增校验脚本 | `scripts/validate_galaxy_json.py`：§4.3 必填非 null 断言 + 可选 `--print-movies` |
| 4 | 新增 subsample 文件 | `data/subsample/tmdb2025_random20.csv`（与 `TMDB_all_movies_random20.csv` 同内容） |
| 5 | 本地端到端验证 | 使用 subsample 跑通清洗 → embedding → genre → lang → UMAP → export → validate；**`meta.count = 16`**（20 行中 4 行被动态 `vote_count` 阈值剔除） |
| 6 | Git 提交 | `cf4616d` |

---

## 3. 与开发计划 / Tech Spec 的对照

| 计划 / 规范项 | 结果说明 |
| --- | --- |
| 计划：用 subsample 跑通 Phase 1 + Phase 2 全流程 | **`run_pipeline.py`** 在 **`--through-phase-2`**（或对 **`tmdb2025_random20.csv`** 自动开启）下顺序执行清洗与 Phase 2.1–2.5 |
| 计划 Checkpoint：`python scripts/run_pipeline.py --input data/subsample/tmdb2025_random20.csv` 全程无报错 | 已实现：该路径 **自动** `--through-phase-2` 与 **[1, 20]** 行数断言，无需额外手写 flag |
| 计划：`meta.count` ≤ 20（过滤后可能更少） | 实测 **`meta.count = 16`**，符合「≤ 20」 |
| 计划：用 `python -c` 或等价方式加载 JSON、逐条打印摘要 | 管线末尾自动调用 **`validate_galaxy_json.py --print-movies`**（也可用该脚本单独对任意 JSON 重跑） |
| 计划：§4.3 必有字段均非 null（允许字段除外） | 校验脚本对 **非可选键** 禁止 JSON `null`；**`tagline`、`imdb_rating`、`imdb_votes`、`runtime`、`imdb_id`** 允许 `null` |
| Tech Spec：`meta` 与 `movies[]` 顶层结构 | 校验脚本检查 **`meta` / `movies`** 存在及 **`meta`** 中 `version`、`generated_at`、`count`、`embedding_model`、`umap_params`、`genre_weight_ratio`、`genre_palette`、`feature_weights`、`z_range`、`xy_range` |
| Phase 2.4：UMAP 至少需要 3 个样本 | **`run_pipeline.py`** 在 **`--through-phase-2`** 前若 **`len(cleaned) < 3`** 则报错退出，避免 UMAP 无意义或失败 |

---

## 4. 实现要点（便于复核）

### 4.1 Phase 2 串联方式

- 使用 **`subprocess.run([sys.executable, 脚本绝对路径, ...], cwd=REPO_ROOT)`**，保证与命令行手动执行各子脚本行为一致，且 **工作目录** 为仓库根目录。
- 各子脚本仍通过自身内部的 **`_REPO_ROOT`** 解析默认中间产物路径（如 **`data/output/text_embeddings.npy`**），与 Phase 2.5 报告中的 **行序契约** 一致：**`cleaned.csv` 第 *i* 行** 与 **`umap_xy.npy` 第 *i* 行** 及前述 **`.npy`** 对齐；本阶段 **未引入** 对 CSV 的重排，仅串联既有脚本。

### 4.2 自动 Phase 2 的判定条件

- **`args.input.resolve()`** 与常量 **`(REPO_ROOT / "data/subsample/tmdb2025_random20.csv").resolve()`** 相等时触发（**`--phase-1-only`** 时 **不** 触发）。
- 自动行数断言仅在用户 **未同时设置** **`--expect-final-rows-min` / `--expect-final-rows-max`** 时写入 **[1, 20]**，避免覆盖用户自定义区间。

### 4.3 `validate_galaxy_json.py` 的设计边界

- **目的**：冒烟阶段 **结构与非 null 契约** + **有限性**；**不** 替代前端运行时业务校验（例如海报 URL 可访问性、字符串语义等）。
- **可选 null**：与 Tech Spec §4.3 表格一致；其余键若出现 **`null`** 则断言失败（防止导出回归写出非法 JSON）。

### 4.4 日志顺序

- 子进程统一设置 **`PYTHONUNBUFFERED=1`**；父进程对关键 **`print`** 使用 **`flush=True`**，减少「清洗日志出现在 embedding 之后」这类 **控制台缓冲** 造成的阅读困扰（多进程环境下仍可能有轻微交错，属终端聚合行为）。

---

## 5. 交付文件与 CLI

### 5.1 新增 / 显著修改的路径

| 路径 | 作用 |
| --- | --- |
| `scripts/run_pipeline.py` | Phase 1 入口；可选 Phase 2 串联；Phase 2.6 subsample 自动策略 |
| `scripts/validate_galaxy_json.py` | JSON Schema 冒烟校验 + 逐条摘要打印 |
| `data/subsample/tmdb2025_random20.csv` | 与计划路径一致的 20 行 subsample（内容与 `TMDB_all_movies_random20.csv` 相同） |

### 5.2 常用命令

| 场景 | 命令 |
| --- | --- |
| **开发计划 Phase 2.6 单条验收** | `python scripts/run_pipeline.py --input data/subsample/tmdb2025_random20.csv` |
| 任意输入跑完全部 Phase 2（需自行保证清洗后行数 ≥ 3，且建议对大表加行数断言） | `python scripts/run_pipeline.py --input <raw.csv> --through-phase-2` |
| 指定 JSON 输出路径 | 增加 `--galaxy-json <path/to/galaxy_data.json>`（gzip 为 **`<stem>.json.gz`**，与本次实现一致） |
| 仅清洗、不跑 Phase 2（包括对 `tmdb2025_random20.csv`） | `--phase-1-only` |
| 跳过校验脚本（调试导出用） | `--skip-json-validate` |
| 单独校验已生成的 JSON | `python scripts/validate_galaxy_json.py --input frontend/public/data/galaxy_data.json --print-movies` |

### 5.3 本次冒烟产物位置（默认）

| 类型 | 路径 |
| --- | --- |
| 清洗结果 | `data/output/cleaned.csv` |
| 中间特征 | `data/output/text_embeddings.npy`、`genre_vectors.npy`、`language_vectors.npy` |
| UMAP | `data/output/umap_xy.npy`、`data/output/umap_model.pkl` |
| 前端静态数据 | `frontend/public/data/galaxy_data.json`、`frontend/public/data/galaxy_data.json.gz`（大文件通常仍由 `.gitignore` 忽略，是否提交取决于仓库策略） |

---

## 6. 实测数据摘要（Subsample）

| 指标 | 数值 |
| --- | --- |
| 输入行数 | 20 |
| 清洗后行数 | 16（动态 **`vote_count`** 基线剔除 4 行，占比 20%） |
| **`meta.count`** | 16 |
| UMAP 输出形状 | `(16, 2)` |
| 设备（本机一次运行观测） | Embedding 阶段为 **CUDA**（`text_embedding.py` 默认 `device=auto`） |

---

## 7. 后续建议（非本次必须）

- **全量跑数**：对 **`data/raw/TMDB_all_movies.csv`** 使用 **`--through-phase-2`** 前，应依赖默认的 **[55000, 65000]** 清洗行数断言或显式传入 **`--expect-final-rows-min/max`**，避免误用 subsample 的自动 **[1, 20]**。
- **CI**：可在 CI 中对 subsample 跑 **`run_pipeline.py`**（若 GPU 不可用，需为 embedding 增加 **`--device cpu`** 的串联参数化，当前 **`run_pipeline.py`** 未向子脚本透传 device，全量/无 GPU 环境可再迭代）。
- **合并主线**：在 `main` 上执行 **`git merge phase-2-6-subsample-smoke`**（或 PR）后，可将开发计划 frontmatter 中 **`p2-subsample-smoke`** 标为 completed。

---

## 8. 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-04-12 | 初稿：记录 Phase 2.6 分支、提交、文件变更、验收命令与实测结果 |
