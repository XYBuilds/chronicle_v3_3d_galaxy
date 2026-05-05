# Phase 18.2 — Supabase Schema 与一次性导入 v1（最终实施报告）

**状态：** 已完成（含云端导入与抽查验收）  
**日期：** 2026-05-04  
**依据计划：** `.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md` §「P18.2 Supabase schema + 一次性导入 v1」

---

## 1. 摘要

本阶段将 **Supabase** 确立为电影宇宙数据的 **source of truth** 的第一步：在 Postgres 中落地与 Phase 18 总计划一致的 **五张表**，并通过 **`scripts/supabase/initial_import.py`** 将本地管线产物 **`data/output/cleaned.csv`**（59,014 行）与 **`data/output/umap_xy.npy`** 一次性写入 **`galaxy_v1_reference`**（永久 v1 坐标锚点）与 **`movies`**（当前主表；首次导入时 `x,y,z` 与 v1 完全一致）。

实施过程中发现并修复了 **PostgREST / `service_role` 表级 GRANT** 缺失导致的 `42501 permission denied`；补充了根目录 **`.env` / `.env.example`**、`python-dotenv` 自动加载，以及 **`docs/guides/Supabase 操作教程.md`** 供后续运维与协作者使用。

---

## 2. 目标与范围

### 2.1 目标（对齐 PRD / Phase 18 计划）

| 目标 | 说明 |
|------|------|
| Schema | `galaxy_v1_reference`、`movies`、`movies_pending`、`vote_snapshots`、`threshold_versions` |
| v1 冻结 | 将当前 UMAP `x,y` 与导出规则下的 **decimal-year + jitter `z`** 写入 `galaxy_v1_reference`，作为后续 **Procrustes** 对齐基准 |
| 主表 | `movies` 存全量元数据 + 当前坐标；首次与 v1 表数值一致 |
| 一次性导入 | 使用 **supabase-py**（REST），默认 **chunk_size=1000** |
| 验收 | 行数 = 59,014；`galaxy_v1_reference` 与 `movies` 的 `x/y/z` 完全一致 |

### 2.2 本阶段明确不在范围

- **P18.3**：`align_to_reference` 实现、对 `galaxy_v1_reference` 的 **UPDATE/DELETE 禁止** 的 RLS 策略细化（当前仅对该表 `ENABLE ROW LEVEL SECURITY`，依赖 **service_role + 流程约束**）。  
- **P18.4 / P18.5**：Kaggle 拉数、`threshold_versions` 种子与 active 行、nightly/monthly cron、`movies_pending` 写入逻辑。  
- **前端**：仍消费静态 `galaxy_data.json.gz`，**不**在本阶段接入 Supabase 客户端。

---

## 3. 最终决策汇总

### 3.1 数据模型

| 决策 | 内容 |
|------|------|
| 主键 | TMDB **`id`**（`BIGINT`），与仓库管线一致 |
| v1 参考表 | **`galaxy_v1_reference(movie_id, x_v1, y_v1, z_v1)`**，导入后视为逻辑不可变（物理约束见 P18.3） |
| `movies` 列 | 与计划一致：`cast` CSV 列映射为 DB 列名 **`cast_list`**（避免 SQL 保留字）；`poster_path` 存 TMDB 路径片段；`genres` 等为 **`TEXT[]`** |
| `movies_pending` | 与 `movies` 对齐的元数据 + **`text_embedding` / `genre_vector` / `lang_vector` BYTEA** + **`z`**（decimal year）+ `detected_at` |
| `vote_snapshots` | **`movie_id` → `movies(id)` ON DELETE CASCADE** |
| `threshold_versions` | **`version` TEXT PK**；**partial unique index**：至多一行 **`is_active = true`** |
| RLS | 仅 **`galaxy_v1_reference`** 执行 **`ENABLE ROW LEVEL SECURITY`**；其余表本阶段不设 RLS（由后续与业务暴露面决定） |

### 3.2 Z 轴与导出一致性

| 决策 | 内容 |
|------|------|
| Z 计算 | 与 **`scripts/export/export_galaxy_json.py`** 相同：调用 **`decimal_year_with_jitter(release_date, movie_id)`**（含 YYYY-01-01 确定性 jitter） |
| 首次对齐 | **`movies.x/y/z` = `x_v1/y_v1/z_v1`**，保证与导出宇宙一致 |

### 3.3 API 与密钥

| 决策 | 内容 |
|------|------|
| 导入所用 Key | **Secret（`service_role`）**，**不是** publishable / `anon` key |
| 客户端 | **supabase-py** + PostgREST；环境变量 **`SUPABASE_URL`**、**`SUPABASE_SERVICE_ROLE_KEY`** |
| 本地配置 | 根目录 **`.env`**（已 **`.gitignore`**）；模板 **`.env.example`** 可提交 |
| 自动加载 | **`python-dotenv`**：`initial_import.py` 若发现根目录 `.env` 则 **`load_dotenv`**；**已存在的环境变量优先** |

### 3.4 PostgREST 权限（重要）

| 决策 | 内容 |
|------|------|
| 问题 | 部分 Supabase 新项目或关闭「自动暴露新表」等设置后，**`service_role` 对自建表无默认 GRANT**，导致 **`42501 permission denied`** |
| 解决 | 在迁移文件末尾增加 **`GRANT USAGE ON SCHEMA public TO service_role`** 及对五张表的 **`SELECT, INSERT, UPDATE, DELETE`** |
| 与 RLS 关系 | **GRANT 与 RLS 独立**：`service_role` **绕过 RLS**，但仍需 **表级 GRANT** 才能通过 PostgREST 写入 |

### 3.5 Git 与工程习惯

| 决策 | 内容 |
|------|------|
| 分支 | 开发在 **`feat/p18-2-supabase-schema-import`**（相对 `main` 新开分支） |
| 依赖 | **`requirements.cpu.txt`**：`supabase>=2.3,<3`、`python-dotenv>=1.0,<2` |
| `.gitignore` | 保留 **`.env` / `.env.*`** 忽略规则，并增加 **`!.env.example`**，避免误忽略模板 |

### 3.6 Supabase 控制台选项（项目创建时）

| 项 | 建议（非强制） |
|----|----------------|
| **Enable automatic RLS** | 可选：勾选有利于「新表默认收紧」；本仓库脚本依赖 **service_role**，不受 RLS 阻挡写入，但需 **GRANT**（见上） |
| **Automatically expose new tables** | 官方提示可关、手动授权；与本阶段 **显式 GRANT** 策略一致 |

---

## 4. 交付物清单（仓库路径）

| 路径 | 说明 |
|------|------|
| `supabase/migrations/20260504120000_p18_2_schema.sql` | DDL + 索引 + 注释 + **`service_role` GRANT** |
| `scripts/supabase/initial_import.py` | 一次性导入；**`--dry-run`**；**`.env` 自动加载**；导入后 **head count** + **随机 id 坐标断言** |
| `requirements.cpu.txt` | `supabase`、`python-dotenv` |
| `.env.example` | 占位模板（Supabase、预留 Kaggle / Cloudflare） |
| `.gitignore` | 允许提交 `.env.example` |
| `docs/guides/Supabase 操作教程.md` | 操作手册：概念、Dashboard、迁移、`.env`、FAQ（含 **42501**） |
| `docs/reports/Phase 18.2 Supabase schema 与一次性导入 实施报告.md` | **本文档**（最终收口） |

---

## 5. 操作记录（推荐顺序）

以下顺序与实际操作一致，可作为复现清单。

1. **Git**  
   - `git checkout main` → `git checkout -b feat/p18-2-supabase-schema-import`（或合并已完成的 feature 分支）。

2. **Supabase 建项目**  
   - 记录 **Project URL**、**service_role secret**。

3. **应用 DDL**  
   - Dashboard → **SQL Editor** → 粘贴并执行 **`supabase/migrations/20260504120000_p18_2_schema.sql`** 全文（含末尾 **GRANT**）。  
   - 若曾执行过旧版迁移（无 GRANT），可**仅补执行**文件末尾 **`GRANT` 段**。

4. **本地数据**  
   - 确认 **`data/output/cleaned.csv`**、**`data/output/umap_xy.npy`** 存在且均为 **59,014** 行。

5. **Python 环境**  
   - `pip install -r requirements.cpu.txt`

6. **密钥**  
   - `Copy-Item .env.example .env`，填写 **`SUPABASE_URL`**、**`SUPABASE_SERVICE_ROLE_KEY`**（**secret / service_role**）。

7. **校验**  
   - `python scripts/supabase/initial_import.py --dry-run`

8. **导入**  
   - 表为空时：`python scripts/supabase/initial_import.py`  
   - 若需重来：`TRUNCATE vote_snapshots, movies, galaxy_v1_reference RESTART IDENTITY CASCADE;` 后再导。

9. **云端验收 SQL**（本次已执行并通过）

```sql
SELECT count(*) AS n_movies FROM movies;
SELECT count(*) AS n_ref FROM galaxy_v1_reference;

SELECT COUNT(*) AS mismatch
FROM movies m
JOIN galaxy_v1_reference r ON r.movie_id = m.id
WHERE m.x <> r.x_v1 OR m.y <> r.y_v1 OR m.z <> r.z_v1;

SELECT id, title, vote_count, release_date, x, y, z
FROM movies
ORDER BY random()
LIMIT 10;
```

**本次验收结果：**

- `n_movies` / `n_ref` 均为 **59,014**（与 `cleaned.csv` 一致）。  
- **`mismatch = 0`**（`movies` 与 `galaxy_v1_reference` 坐标完全一致）。  
- 随机 10 条字段与坐标 **目测 / 逻辑正确**。

---

## 6. 问题与处理记录

| 现象 | 原因 | 处理 |
|------|------|------|
| `APIError` **`42501`** `permission denied for table galaxy_v1_reference` | **`service_role` 缺少表级 GRANT**（与 RLS 无关） | 迁移文件追加 **`GRANT ... TO service_role`**；在 SQL Editor 执行后 **重新运行导入** |
| 首次批量失败 | 失败发生在 **`galaxy_v1_reference` 第一批**，通常 **未写入任何行**，可直接补 GRANT 后全量重导 | 若已有部分行，需 **TRUNCATE** 后重导，避免主键重复 |

---

## 7. 与 Phase 18 计划验收项的对照

| 计划验收项 | 结果 |
|------------|------|
| Supabase 表行数 = 59,014（与 `cleaned.csv` 一致） | **通过** |
| 抽查记录字段完整性 | **通过**（含随机 `SELECT`） |
| `galaxy_v1_reference` 与导入时刻 `movies.x/y/z` 数值完全一致 | **通过**（`mismatch = 0` + 脚本内随机断言逻辑） |

---

## 8. 后续工作（不在 P18.2 内）

| 后续 | 说明 |
|------|------|
| **P18.3** | `scripts/feature_engineering/procrustes_align.py`；**禁止**对 `galaxy_v1_reference` 的误更新（RLS 或脚本 assert） |
| **P18.4** | nightly：Kaggle、frozen `threshold_versions`、UPDATE votes、`movies_pending`、重导 JSON |
| **P18.5** | monthly：阈值重算、全量 refit、Procrustes、回写 `movies` |
| **`threshold_versions`** | 当前表结构已就绪；**种子数据**待 P18.4/P18.5 管线写入 |
| **CI** | GitHub Actions 使用 **Repository secrets** 注入与本地 `.env` 相同变量名，**禁止** echo 密钥 |

---

## 9. 参考链接

- Phase 18 总计划：`.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md`  
- Supabase 操作教程：`docs/guides/Supabase 操作教程.md`  
- Supabase 官方文档：<https://supabase.com/docs>  
- Z 轴规则实现：`scripts/export/export_galaxy_json.py`（`decimal_year_with_jitter`）

---

## 10. 修订历史

| 日期 | 说明 |
|------|------|
| 2026-05-04 | 初版短报告（交付物与命令清单） |
| 2026-05-04 | **最终版**：合并决策、操作步骤、GRANT 修复、`.env`/教程、云端验收结果与后续项 |
