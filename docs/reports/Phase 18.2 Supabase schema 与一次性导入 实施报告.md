# Phase 18.2 — Supabase schema、一次性导入与最终决策（实施报告）

**范围：** Supabase 作为电影宇宙数据的 **source of truth** 的第一步：schema、PostgREST 权限、本地一次性导入脚本、环境与文档。前端契约不变（仍消费静态 `galaxy_data.json.gz`）。

**状态：** 设计落地；云端 **59,014** 行导入与抽查已通过（见 §8）。

---

## 1. 与 Phase 18 总计划的对齐

依据仓库内计划 [.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md](../../.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md) 中 **P18.2** 条目：

| 计划要求 | 本阶段落实 |
|----------|------------|
| 表：`galaxy_v1_reference` / `movies` / `movies_pending` / `vote_snapshots` / `threshold_versions` | 已写入迁移 SQL，并在远程库执行 |
| 一次性导入：`cleaned.csv` + `umap_xy.npy`，z 与 `export_galaxy_json` 一致 | `scripts/supabase/initial_import.py` 使用 `decimal_year_with_jitter` |
| 批量 chunk、supabase-py | 默认 `chunk_size=1000` |
| 验收：59014 行；`galaxy_v1_reference` 与 `movies` 首次 x/y/z 一致 | 脚本内随机校验 + 用户 SQL 抽查 `mismatch = 0` |

**本阶段未做（按计划在后续 Phase）：** P18.3 Procrustes helper 与 reference 不可变 RLS 策略细化；P18.4 nightly 与 `threshold_versions` 种子数据；P18.5 monthly refit；Cloudflare / GHA 等。

---

## 2. 架构与产品决策（最终）

1. **单一真相源**  
   - 长期：Supabase 存权威电影行 + 坐标 + 候补向量。  
   - 当前前端仍不直连 DB，继续吃构建产物 **JSON.gz**（计划 D1 = A1）。

2. **密钥与调用路径**  
   - 批量导入与后续 cron 使用 **PostgREST + `service_role` JWT**（**Secret**，非 Publishable / anon）。  
   - `service_role` **绕过 RLS**，但仍需 **表级 `GRANT`**（见 §6 问题与修复）。

3. **v1 参考表语义**  
   - `galaxy_v1_reference`：首次导入时的 UMAP x,y 与 decimal-year **z** 的冻结副本，作为 **Procrustes 永久基准**（与计划 P18.2/P18.3 描述一致）。  
   - 首次导入刻意令 `movies.x/y/z` 与 `x_v1/y_v1/z_v1` **数值相同**，便于 diff 与审计。

4. **RLS**  
   - 仅对 `galaxy_v1_reference` **ENABLE ROW LEVEL SECURITY**；未对 `movies` 等默认开 RLS。  
   - 实际写入依赖 **`service_role` + GRANT**；更严的「禁止 UPDATE reference」留在 **P18.3** 显式策略或运维约定。

5. **列命名与 CSV 映射**  
   - CSV 列 `cast` → 库表 **`cast_list`**（避免 SQL 保留字 `cast`）。  
   - `poster_path` 存 TMDB 路径片段（与 `cleaned.csv` 一致）；导出 JSON 里的 `poster_url` 仍由导出脚本拼接。

6. **`movies_pending`**  
   - 元数据列与 `movies` 对齐（无当前 UMAP x/y；含 **z** 与三列 **BYTEA** 向量），供 P18.4 写入、P18.5 合并。

7. **`vote_snapshots`**  
   - `movie_id` **REFERENCES movies(id) ON DELETE CASCADE**；导入顺序：先 `movies`，再写快照（本阶段未写入快照数据）。

8. **`threshold_versions`**  
   - 结构就绪；**活跃行种子** 由 P18.4/P18.5 写入，本阶段不要求非空。

9. **本地密钥管理**  
   - 根目录 **`.env`**（已 `.gitignore`）存 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。  
   - **`.env.example`** 仅占位符，**可提交**；`.gitignore` 中增加 **`!.env.example`**，避免被规则 `.env.*` 误忽略。  
   - 使用 **`python-dotenv`** 在 `initial_import.py` 启动时加载 `.env`；shell 已导出变量 **优先**于文件。

10. **Supabase 控制台选项（建项目时）**  
    - **Enable automatic RLS**：非必须；若开启，新建表默认 RLS，服务端仍可用 `service_role`。  
    - **Publishable vs Secret**：导入脚本只用 **Secret（service_role）**。

---

## 3. 工程与 Git 决策

- 在 **`feat/p18-2-supabase-schema-import`** 分支上实现与提交（与「先开分支再做 P18.2」约定一致）。  
- 依赖：`requirements.cpu.txt` 增加 **`supabase>=2.3,<3`**、**`python-dotenv>=1.0,<2`**。

---

## 4. 交付物清单（路径）

| 路径 | 说明 |
|------|------|
| `supabase/migrations/20260504120000_p18_2_schema.sql` | DDL + 索引 + 注释 + **`GRANT ... TO service_role`**（修复 PostgREST 42501） |
| `scripts/supabase/initial_import.py` | 读 `cleaned.csv` / `umap_xy.npy`、构建行、`INSERT`、**`count=exact` + 随机 id 坐标断言** |
| `.env.example` | 环境变量模板（Supabase、预留 Kaggle/CF） |
| `.gitignore` | `.env` 忽略；**`!.env.example`** 例外 |
| `requirements.cpu.txt` | `supabase`、`python-dotenv` |
| `docs/guides/Supabase 操作教程.md` | 操作指南（含 §4.1 `.env`、FAQ **42501**） |
| `docs/reports/Phase 18.2 Supabase schema 与一次性导入 实施报告.md` | **本文件**（P18.2 唯一实施报告） |

---

## 5. 操作步骤（按执行顺序）

### 5.1 远程：执行迁移

1. Supabase **SQL Editor** 打开 `supabase/migrations/20260504120000_p18_2_schema.sql`。  
2. **全文件执行**（含末尾 `GRANT`）。若曾执行过旧版无 `GRANT` 的脚本，**仅补执行**从 `GRANT USAGE ON SCHEMA public` 起的段落亦可。

亦可使用 [Supabase CLI](https://supabase.com/docs/guides/cli)：`supabase db push`（需项目已 `supabase link`）。

**注意：** `vote_snapshots.movie_id` 外键引用 `movies(id)`。首次导入顺序必须是：先 `galaxy_v1_reference` + `movies`（由脚本完成），再使用其他流程写入快照。

### 5.2 本地：数据与依赖

1. 确认存在 **`data/output/cleaned.csv`**、**`data/output/umap_xy.npy`**（本仓库验收为 **59,014** 行）。  
2. `pip install -r requirements.cpu.txt`  
3. 复制 **`.env.example` → `.env`**，填入 **`SUPABASE_URL`** 与 **`SUPABASE_SERVICE_ROLE_KEY`（Secret）**。

### 5.3 校验与导入

```bash
python scripts/supabase/initial_import.py --dry-run
python scripts/supabase/initial_import.py
```

（Windows PowerShell 同样适用。）脚本会打印从 `.env` 加载路径（若存在 `.env`）。插入顺序：`galaxy_v1_reference` → `movies`；默认每批 **1000** 行。

**重复导入前**需在 SQL 中清空相关表，例如：

```sql
TRUNCATE vote_snapshots, movies, galaxy_v1_reference RESTART IDENTITY CASCADE;
```

（`movies_pending`、`threshold_versions` 按需保留或一并 `TRUNCATE`。）

### 5.4 远程：SQL 验收

```sql
SELECT count(*) AS n_movies FROM movies;
SELECT count(*) AS n_ref FROM galaxy_v1_reference;

SELECT COUNT(*) AS mismatch
FROM movies m
JOIN galaxy_v1_reference r ON r.movie_id = m.id
WHERE m.x <> r.x_v1 OR m.y <> r.y_v1 OR m.z <> r.z_v1;
-- 期望：mismatch = 0

SELECT id, title, vote_count, release_date, x, y, z
FROM movies
ORDER BY random()
LIMIT 10;
```

**本环境记录：** `mismatch = 0`；随机 10 条字段与坐标合理。

---

## 6. 本机验证记录（dry-run）

- `python scripts/supabase/initial_import.py --dry-run`：`shape=(59014, 28)`，`umap_xy.shape=(59014, 2)`，成功构建 59,014 条 `galaxy_v1_reference` 与 `movies` 载荷；`z` 范围 `[1874.9370, 2026.6473]`（与 `decimal_year_with_jitter` 一致）。

---

## 7. 问题与修复（42501）

**现象：**  
`postgrest.exceptions.APIError: permission denied for table galaxy_v1_reference`（SQLSTATE **42501**），hint 建议 `GRANT ... TO service_role`。

**原因：**  
PostgREST 使用 **`service_role`** 角色访问表时，除 RLS 外仍需 **PostgreSQL 表级权限**。部分新项目或关闭「自动暴露新表」等设置后，**不会**自动给 `service_role` 赋权。

**最终修复：**  
在迁移文件末尾增加对 **`public`** 下五张表的 **`GRANT SELECT, INSERT, UPDATE, DELETE ... TO service_role`**，以及 **`GRANT USAGE ON SCHEMA public TO service_role`**。执行后重新运行 `initial_import.py` 即可。

---

## 8. 脚本与数据规则（摘要）

- **Z 轴：** `scripts/export/export_galaxy_json.py` 中的 **`decimal_year_with_jitter(release_date, movie_id)`**，与导出 JSON 规则一致。  
- **类型：** `vote_count` 等数值与 `release_date` → `DATE`；多值字段 → **`TEXT[]`**；pending 向量 → **`BYTEA`**（float32 原始字节，由后续 P18.4 写入）。  
- **断言：** `--expect-rows` 默认 **59014**；全量 `assert_all_genres_in_frozen_v1` 与行数 / `umap_xy` 维度断言。

---

## 9. 验收结论（P18.2 收口）

| 项 | 结果 |
|----|------|
| `movies` 行数 | 59,014 |
| `galaxy_v1_reference` 行数 | 59,014 |
| `mismatch`（坐标不一致行数） | **0** |
| 随机抽样 | 通过 |
| `threshold_versions` / `movies_pending` 业务数据 | 本阶段不要求；表结构已就绪 |

**云端验收清单**

- [x] `SELECT count(*) FROM movies` = 59014  
- [x] `SELECT count(*) FROM galaxy_v1_reference` = 59014  
- [x] `mismatch` 查询为 0；随机抽查通过  
- [x] 字段与坐标与 `cleaned.csv` / UMAP 一致（抽查）

**结论：** P18.2 **目标达成**，可进入 **P18.3**（Procrustes helper + reference 不可变强化）及后续 cron/导出链路。

---

## 10. 后续建议（非阻塞）

1. **合并分支**：将 `feat/p18-2-supabase-schema-import` 合入默认分支前走 PR 审查。  
2. **CI**：GitHub Actions 使用 **Repository secrets** 注入 Supabase 变量，日志中禁止回显 key。  
3. **P18.3**：为 `galaxy_v1_reference` 增加显式 **禁止 UPDATE/DELETE** 的 RLS policy（或等价约束），与计划「v1 不可变」一致。  
4. **备份**：按 Supabase 套餐定期确认备份与恢复演练。

---

## 11. 参考链接

- 操作教程：[docs/guides/Supabase 操作教程.md](../guides/Supabase%20操作教程.md)  
- Phase 18 总计划：[.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md](../../.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md)  
- Supabase 文档：<https://supabase.com/docs>

---

*报告类型：Phase 实施收口（决策 + 操作 + 问题 + 验收）。P18.2 仅此一份报告，避免重复维护。*
