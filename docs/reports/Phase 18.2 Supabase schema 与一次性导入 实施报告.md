# Phase 18.2 — Supabase schema 与一次性导入 v1（简版索引）

**完整版（最终决策、操作顺序、42501 修复、验收收口）见：**  
[Phase 18.2 P18.2 最终决策与操作 实施报告.md](./Phase%2018.2%20P18.2%20最终决策与操作%20实施报告.md)

---

## 目标

- 在 Supabase 中建立 P18 计划中的核心表：`galaxy_v1_reference`、`movies`、`movies_pending`、`vote_snapshots`、`threshold_versions`。
- 提供一次性导入脚本：从 `data/output/cleaned.csv` + `data/output/umap_xy.npy` 写入 v1 参考坐标与当前 `movies` 行（首次 `x,y,z` 与 `galaxy_v1_reference` 完全一致）。

## 交付物

| 路径 | 说明 |
|------|------|
| `supabase/migrations/20260504120000_p18_2_schema.sql` | DDL：五张表、索引、注释；`galaxy_v1_reference` 启用 RLS（仅 `service_role` 等绕过策略时可写）。 |
| `scripts/supabase/initial_import.py` | 批量 INSERT（默认 chunk 1000）；`--dry-run` 校验行数与 z 范围；导入后按随机样本断言 `ref` 与 `movies` 坐标一致。 |
| `requirements.cpu.txt` | 增加 `supabase>=2.3,<3`。 |

## 迁移应用方式

1. 在 Supabase Dashboard → **SQL Editor** 中粘贴并执行 `supabase/migrations/20260504120000_p18_2_schema.sql`；或  
2. 使用 [Supabase CLI](https://supabase.com/docs/guides/cli)：`supabase db push`（需项目已 `supabase link`）。

**注意：** `vote_snapshots.movie_id` 外键引用 `movies(id)`。首次导入顺序必须是：先 `galaxy_v1_reference` + `movies`（由脚本完成），再使用其他流程写入快照。

## 一次性导入

环境变量（使用 **service_role** key，勿提交到 git）：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

命令：

```bash
# 仅校验（本仓库已验证：59014 行，z 与 export 规则一致）
python scripts/supabase/initial_import.py --dry-run

# 写入云端（迁移已执行且表为空）
python scripts/supabase/initial_import.py
```

默认断言行数为 **59014**（可用 `--expect-rows` 覆盖）。重复导入前需在 SQL 中清空相关表，例如：

```sql
TRUNCATE vote_snapshots, movies, galaxy_v1_reference RESTART IDENTITY CASCADE;
```

（`movies_pending`、`threshold_versions` 按需保留或一并 TRUNCATE。）

## 本机验证记录

- `python scripts/supabase/initial_import.py --dry-run`：`shape=(59014, 28)`，`umap_xy.shape=(59014, 2)`，成功构建 59,014 条 `galaxy_v1_reference` 与 `movies` 载荷；`z` 范围 `[1874.9370, 2026.6473]`（与 `decimal_year_with_jitter` 一致）。

## 云端验收清单（需你方在 Supabase 上执行导入后勾选）

- [ ] `SELECT count(*) FROM movies` = 59014  
- [ ] `SELECT count(*) FROM galaxy_v1_reference` = 59014  
- [ ] 随机抽查 10 条：`movies.x/y/z` 与 `galaxy_v1_reference.x_v1/y_v1/z_v1` 完全一致（脚本导入后已做随机断言）  
- [ ] 字段完整性：海报路径、数组类字段、vote 字段与 `cleaned.csv` 一致  

## 后续（P18.3+）

- `galaxy_v1_reference` 的「不可变」 enforcement：在 P18.3 中通过 RLS 禁止 `UPDATE`/`DELETE`（或使用仅 `service_role` 可写的策略）；当前迁移已 **ENABLE ROW LEVEL SECURITY**，未对 `anon`/`authenticated` 开放 DML，默认依赖 **仅服务端用 service key** 访问。
