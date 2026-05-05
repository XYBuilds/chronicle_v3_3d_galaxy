# Supabase 操作教程（本仓库 / Phase 18）

面向在本项目中使用 **Supabase** 作为电影宇宙数据 **source of truth** 的操作说明：从注册项目、执行 DDL、到运行 `scripts/supabase/initial_import.py` 一次性导入。官方文档入口：<https://supabase.com/docs>

---

## 1. 核心概念（读一遍即可）

| 概念 | 说明 |
|------|------|
| **Project** | 一个独立数据库 + Auth + Storage + Edge Functions；每个项目有唯一的 **Project URL** 与 **API Keys**。 |
| **PostgREST** | Supabase 通过 HTTP 把 Postgres 表暴露为 RESTful API（`GET/POST/PATCH/DELETE`）。 |
| **anon key** | 公开给浏览器/前端的 key，受 **RLS（Row Level Security）** 约束；**不要**用它做批量管理端导入。 |
| **service_role key** | 服务端密钥，**绕过 RLS**，权限等同数据库超级用户侧写能力。**禁止**写入前端代码、禁止提交 git、禁止发给不可信方。 |
| **RLS** | 在表上 `ENABLE ROW LEVEL SECURITY` 后，未配置 policy 时，普通角色对该表的访问会被限制；`service_role` 仍可按 API 写入（本仓库导入脚本依赖此行为）。 |

本仓库 P18.2 迁移中，`galaxy_v1_reference` 已启用 RLS；**一次性导入与后续 cron** 应使用 **`SUPABASE_SERVICE_ROLE_KEY`**。

---

## 2. 注册并创建项目

1. 打开 <https://supabase.com/> ，使用 GitHub / 邮箱注册。
2. **New project**：选择组织（Organization）、输入 **Database Password**（请用密码管理器保存，用于直连 Postgres 与 Dashboard 部分功能）。
3. 选择区域（Region）：尽量靠近你的 GitHub Actions / 用户主力区域（例如 `Southeast Asia (Singapore)`）。
4. 等待项目初始化（约 1–2 分钟），进入 **Project Settings → General** 可看到 **Reference ID**、**Project URL**。

---

## 3. 在 Dashboard 里要熟悉的菜单

| 菜单 | 用途 |
|------|------|
| **Table Editor** | 可视化浏览/编辑表数据（小数据量调试方便）。 |
| **SQL Editor** | 执行 DDL、一次性脚本、复杂查询；**执行本仓库迁移文件推荐位置**。 |
| **Database → Roles / Policies** | 查看 RLS、策略（P18.3 可能继续加固）。 |
| **Project Settings → API** | 复制 `Project URL`、`anon` public、`service_role` **secret**。 |
| **Project Settings → Database** | 连接串、连接池、重置密码等。 |
| **Reports / Logs** | 排查 API 错误、慢查询。 |

---

## 4. 获取 URL 与密钥（导入前必做）

1. 进入 **Project Settings**（齿轮）→ **API**。
2. 记录：
   - **Project URL**：形如 `https://xxxxxxxx.supabase.co`
   - **service_role** 下的 **secret**（点击 Reveal 后复制）

### 4.1 使用仓库根目录 `.env`（推荐本地）

- 复制模板：`Copy-Item .env.example .env`（macOS/Linux：`cp .env.example .env`），在 `.env` 里填入真实值。  
- **`.env` 已被 `.gitignore` 忽略**，勿把 `service_role` 提交到 git。`.env.example` 仅含占位符，可安全提交。  
- 运行 `python scripts/supabase/initial_import.py` 时，若存在根目录 `.env`，会通过 `python-dotenv` **自动加载**（已写入 `requirements.cpu.txt`）。已在 shell 里 `export` / `$env:...` 的变量**优先**于 `.env` 中的同名项。

本地运行导入脚本时（PowerShell 示例，**仅当前会话有效**）：

```powershell
$env:SUPABASE_URL = "https://xxxxxxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
```

GitHub Actions 里应使用 **Repository secrets**（例如 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`），在 workflow 的 `env:` 中引用，**不要**打印到日志。

---

## 5. 执行本仓库数据库结构（P18.2 DDL）

迁移文件路径：

`supabase/migrations/20260504120000_p18_2_schema.sql`

### 方式 A：Supabase SQL Editor（推荐给首次上手）

1. Dashboard → **SQL Editor** → **New query**。
2. 在本地用编辑器打开上述 `.sql` 文件，**全选复制**粘贴到 SQL Editor。
3. 点击 **Run**。应全部成功执行；若报「已存在」类错误，说明曾跑过同一段 DDL，需按第 9 节处理「重来」。

创建的表包括：

- `galaxy_v1_reference` — v1 冻结坐标（Procrustes 基准）
- `movies` — 当前宇宙主表
- `movies_pending` — 候补片 + BYTEA 向量（供 P18.4/18.5）
- `vote_snapshots` — 月度投票快照（外键依赖 `movies`）
- `threshold_versions` — 冻结动态阈值版本表（含「至多一行 `is_active=true`」的唯一索引）

### 方式 B：Supabase CLI（适合与 git 迁移长期同步）

1. 安装 CLI：<https://supabase.com/docs/guides/cli/getting-started>
2. 在项目根目录登录并关联远程项目：

```bash
supabase login
supabase link --project-ref <你的 Reference ID>
```

3. 将迁移推送到远程数据库（以官方文档为准，命令可能随 CLI 版本微调）：

```bash
supabase db push
```

> 若你尚未在本地配置 `supabase/config.toml` 等完整 CLI 工程，**优先用方式 A** 即可跑通 P18.2。

---

## 6. 安装 Python 依赖并校验数据（不写库）

仓库根目录：

```powershell
cd E:\projects\chronicle_v3_3d_galaxy
pip install -r requirements.cpu.txt
python scripts/supabase/initial_import.py --dry-run
```

预期：`cleaned.csv` 与 `umap_xy.npy` 均为 **59014** 行，脚本打印 z 范围并退出码 **0**。  
若缺少 `data/output/cleaned.csv`，需先按 `docs/project_docs/TMDB 电影宇宙 Data Pipeline.md` 跑通 Phase 1 输出。

---

## 7. 一次性导入到 Supabase（正式写入）

**前提：** 第 5 节 DDL 已成功；`movies` / `galaxy_v1_reference` 为空（首次导入）。

```powershell
$env:SUPABASE_URL = "https://xxxxxxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role_secret>"
python scripts/supabase/initial_import.py
```

脚本行为概要：

- 默认读取 `data/output/cleaned.csv`、`data/output/umap_xy.npy`
- 按 `export_galaxy_json` 相同规则计算 **z**（`decimal_year_with_jitter`）
- 分块 `INSERT`（默认每批 1000 行）：先 `galaxy_v1_reference`，再 `movies`
- 用 `count=exact` 校验行数，并对随机样本断言 **ref 与 movies 的 x/y/z 完全一致**

可选参数：

```text
--input <path\to\cleaned.csv>
--xy-input <path\to\umap_xy.npy>
--chunk-size 500
--expect-rows 59014
--verify-sample 20
```

更完整的阶段说明、决策与验收见：`docs/reports/Phase 18.2 Supabase schema 与一次性导入 实施报告.md`

---

## 8. 导入后在 SQL Editor 中验收

```sql
SELECT count(*) AS n_movies FROM movies;
SELECT count(*) AS n_ref FROM galaxy_v1_reference;

-- 随机对比 ref 与 movies（应 0 行差异）
SELECT COUNT(*) AS mismatch
FROM movies m
JOIN galaxy_v1_reference r ON r.movie_id = m.id
WHERE m.x <> r.x_v1 OR m.y <> r.y_v1 OR m.z <> r.z_v1;
```

再抽查字段：

```sql
SELECT id, title, vote_count, release_date, x, y, z
FROM movies
ORDER BY random()
LIMIT 10;
```

---

## 9. 需要「清空重来」时

仅在你确认要删除云端已有主数据时执行。**会删光主表数据**：

```sql
TRUNCATE vote_snapshots, movies, galaxy_v1_reference RESTART IDENTITY CASCADE;
```

然后重新执行第 7 节导入。  
若还需清空候补与阈值（按需）：

```sql
TRUNCATE movies_pending, threshold_versions RESTART IDENTITY CASCADE;
```

---

## 10. 安全与合规清单

- [ ] `service_role` 仅出现在服务器、本地终端环境变量或 GitHub **Encrypted secrets** 中。  
- [ ] 任何 PR、截图、录屏中**打码** service_role。  
- [ ] 前端若将来直连 Supabase，**只**使用 `anon` + 严格 RLS；本仓库当前阶段前端仍吃静态 `galaxy_data.json.gz`，可暂不暴露 DB 给浏览器。  
- [ ] 定期在 **Project Settings → Database** 关注备份与密码轮换策略（以 Supabase 计划为准）。

---

## 11. 常见问题（FAQ）

**Q: 导入报错 duplicate key / already exists**  
A: 表中已有主键冲突。先第 9 节 `TRUNCATE` 相关表再导，或改用新空项目。

**Q: 只有 anon key，导入失败**  
A: `initial_import.py` 需要 **service_role** 写入；anon 在 RLS 下通常无法批量插入 `galaxy_v1_reference`。

**Q: 免费档 / 500MB 会爆吗**  
A: Phase 18 计划在 `phase_18_data_infrastructure_9ccb7a3f.plan.md` 中已提示：主表 + 未来 pending 的 BYTEA 可能接近上限；若告警需压缩策略（例如向量迁到 Storage）。当前仅 `movies` + `galaxy_v1_reference` 约数万行文本与数值，一般远小于 500MB。

**Q: 导入报错 `permission denied for table ...`（SQLSTATE `42501`）**  
A: PostgREST 使用的角色 `service_role` 缺少对该表的 **GRANT**（与 RLS 无关）。在 **SQL Editor** 执行迁移文件末尾的 `GRANT ... TO service_role` 段（见 `supabase/migrations/20260504120000_p18_2_schema.sql` 底部），或按报错里的 `hint` 对相应表执行 `GRANT SELECT, INSERT, ... TO service_role;`，然后重新运行 `initial_import.py`。首次导入若在第一 batch 失败，表里一般仍为空，可直接重跑。

**Q: 与官方「Supabase + Next.js」教程关系**  
A: 官方偏全栈 Auth/Realtime；本仓库当前是 **Python 批处理 + REST**，只需 **API URL + service_role** 即可。

---

## 12. 相关仓库路径速查

| 路径 | 用途 |
|------|------|
| `supabase/migrations/20260504120000_p18_2_schema.sql` | P18.2 DDL |
| `.env.example` | 密钥占位模板；复制为根目录 `.env` 后本地使用 |
| `scripts/supabase/initial_import.py` | 一次性导入脚本 |
| `docs/reports/Phase 18.2 Supabase schema 与一次性导入 实施报告.md` | P18.2 决策、操作、问题与验收（唯一报告） |
| `.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md` | Phase 18 总计划（P18.4 cron 等后续） |

---

## 13. 官方链接（备查）

- 总文档：<https://supabase.com/docs>  
- REST：<https://supabase.com/docs/guides/api>  
- RLS：<https://supabase.com/docs/guides/auth/row-level-security>  
- Python 客户端：<https://supabase.com/docs/reference/python/introduction>  
- CLI：<https://supabase.com/docs/guides/cli>
