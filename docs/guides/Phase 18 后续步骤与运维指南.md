# Phase 18 后续步骤与运维指南

本文面向 **维护者 / 发布负责人**：说明在完成数据基础设施（Supabase + GitHub Actions + 静态导出）相关开发后，**接下来要做什么**、按什么顺序做、以及如何日常运维与排障。

---

## 1. 你可能处于哪种状态

根据仓库当前实现（见 `.github/workflows/` 与 `scripts/cron/`），Phase 18 典型状态如下：

| 环节 | 说明 |
|------|------|
| **已完成（代码层）** | Genre palette 冻结、Procrustes 对齐、Supabase 表与一次性导入、nightly vote 刷新、monthly 全量 refit 脚本与工作流、从 Supabase 导出 `galaxy_data.json(.gz)` 等 |
| **待你（或团队）在环境中完成** | 合并功能分支、配置/核对 GitHub Secrets、**首次**为 monthly job 准备 `data/output`  embedding  bundle（或 Actions 缓存）、按需打开 Cloudflare Pages 部署步骤、同步权威文档与做出口验收 |
| **长期运行** | Cron 成功/失败监控、Kaggle/Supabase 配额、若 hosted runner 扛不住 monthly 则启动「本地/季度 refit + 上传」降级方案 |

若你刚合并 **P18.5（monthly refit）** 相关分支，请从 **第 2 节「立刻要做的事」** 开始按顺序执行。

---

## 2. 立刻要做的事（建议顺序）

### 2.1 合并代码并保证 CI 可运行

1. 在 GitHub 上为功能分支开 **Pull Request**（例如 `phase/p18-5-monthly-refit` → `main`），自己或他人审查后合并。
2. 合并后确认 **默认分支** 上存在：
   - `scripts/cron/nightly_vote_refresh.py`
   - `scripts/cron/monthly_refit.py`
   - `scripts/cron/export_from_supabase.py`
   - `.github/workflows/nightly_vote_refresh.yml`
   - `.github/workflows/monthly_refit.yml`
3. 本地可选自检（不连真实 Supabase 时仅做语法/导入检查）：

   ```bash
   python -m py_compile scripts/cron/monthly_refit.py scripts/cron/export_from_supabase.py
   ```

### 2.2 配置 GitHub Actions Secrets（仓库 Settings → Secrets and variables → Actions）

下列密钥名需与 workflow 中引用一致（名称以你仓库内 workflow 为准）：

| Secret | 用途 |
|--------|------|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端密钥（**仅**在 GHA 使用，勿提交到仓库） |
| `KAGGLE_USERNAME` | Kaggle API（拉取 TMDB 日更数据集） |
| `KAGGLE_KEY` | Kaggle API Key |

**P18.6（Cloudflare）** 若已启用工作流末尾部署，还需要（见第 4 节）：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_PROJECT_NAME`

缺任一 Secret 时，对应 step 会失败；请在合并运行前补全。

### 2.3 确认 Supabase 侧数据前提

- `threshold_versions` 中至少有一条 **`is_active = true`** 的记录（daily 夜间任务依赖「冻结阈值」）。若从未写入，可在具备原始 CSV 的机器上运行：

  ```bash
  python scripts/cron/seed_active_threshold_version.py --input <path-to-raw-tmdb.csv>
  ```

  （脚本路径与参数以仓库内实现为准。）

- `galaxy_v1_reference` 行数与策略符合 Phase 18 验收（与 v1 坐标锁定一致）；monthly refit 的 Procrustes 对齐依赖该表。

### 2.4 首次验证 workflow（强烈建议用手动触发）

在 GitHub → **Actions** 中：

1. **P18.4 Nightly vote refresh** → **Run workflow**（`workflow_dispatch`）
   - 观察是否在合理时间内完成；
   - 确认 artifact 或日志中出现导出产物路径（如 `frontend/public/data/galaxy_data.json.gz`）。
2. **P18.5 Monthly galaxy refit** → **Run workflow**
   - **首次极易失败**：若 runner 上不存在 `data/output/` 下四条 embedding 产物，脚本会按设计 **快速失败** 并提示缓存缺失。

因此：**在第一次跑通 monthly 之前，必须先完成第 3 节「Monthly embedding bundle」准备。**

---

## 3. Monthly 专用：准备 `data/output` embedding bundle（必做）

Monthly job 的设计前提是：全量电影的 **文本 / 流派 / 语言** 向量与本地管线 **`cleaned.csv` 行对齐**，并以仓库路径：

- `data/output/cleaned.csv`
- `data/output/text_embeddings.npy`
- `data/output/genre_vectors.npy`
- `data/output/language_vectors.npy`

在 **同一台已跑通完整特征工程 + 与当前生产参数一致** 的环境生成（见项目 Tech Spec / Data Pipeline 中 UMAP 与模型配置）。

### 3.1 在本地或自有机上生成

1. 使用与线上一致的 raw 或清洗流程，产出 `data/output/cleaned.csv` 与三份 `.npy`（行数与顺序必须一致）。
2. 将上述 **四个文件** 复制到可访问的位置，用于下一步「灌进 CI」。

### 3.2 让 GitHub Actions 能拿到这些文件（推荐：Cache）

`monthly_refit.yml` 使用 `actions/cache` 恢复 `data/output/` 下四文件。**第一次**没有任何 cache 时，需要 **人工种入** 一次，常见做法包括：

- 在自有机上跑完生成四文件后，用 **可写 cache 的辅助 workflow**、**Release 资源** 或 **受控的 artifact 上传** 将四文件放到 runner 可见位置（具体方式以你团队规范为准；核心原则是：**某次** 成功 run 要把四文件放在 `data/output/` 下从而被 cache 保存）。

- 或者：在 **自托管 runner**、或 **带大存储的固定机器** 上先跑通一次 `monthly_refit.py`，确认逻辑正确，再决定如何将 `data/output` 同步到 GHA 环境。

**原则**：只要某次 job 在 `data/output/` 下四文件齐全且通过 verify 步骤，后续同 key 的 cache restore 即可复用，避免每月全量重算 5 万+ 条 embedding。

### 3.3 何时需要更新这个 bundle

- 若 **embedding 模型**、**清洗规则** 或 **特征维度** 发生不兼容变更，应 **重新生成** 四文件并 **使 cache 失效或 bump cache key**（在 workflow 中调整 `key` / `v1` 版本后缀）。
- 仅 **新增** 电影、且 nightly 已把新片向量化进 `movies_pending` 时，**不需要** 为「新 id」整表重算 cache；monthly 脚本会从 pending BYTEA 或现场 MiniLM 编码补全（以 `scripts/cron/monthly_refit.py` 实现为准）。

---

## 4. P18.6：Cloudflare Pages 切换（下一开发阶段）

当 **nightly / monthly 在 GHA 上稳定跑通** 且你准备把静态站从 GitHub Pages 迁到 Cloudflare Pages 时：

1. 在 Cloudflare 创建 **Pages 项目**，连接本仓库；构建命令与输出目录以 Phase 18 计划为准，例如：
   - 构建：`cd frontend && npm ci && npm run build`
   - 输出：`frontend/dist`
2. 在仓库 **Secrets** 中配置 Cloudflare 相关变量（见 2.2 节表）。
3. 在以下 workflow 中 **取消注释** 部署步骤（若当前仍为注释状态）：
   - `nightly_vote_refresh.yml`
   - `monthly_refit.yml`
4. **灰度建议**：保留 GitHub Pages 作备线 1～2 周，观察 Cloudflare 流量与错误率后再切 DNS/主入口。

详细产品级步骤也可对照 `docs/workflows/` 下历史 GitHub Pages 教程，但 **构建产物目录** 以 Vite 的 `frontend/dist` 为准。

---

## 5. P18.7：文档同步与出口验收

当 P18.6 切流稳定后，应完成（与计划一致）：

- 更新 `docs/project_docs/TMDB 电影宇宙 Data Pipeline.md`：daily 冻结阈值、monthly refit、GHA、可选本地 fallback。
- 更新 `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` 中 Supabase / cron / Procrustes 相关章节。
- 更新根目录 `README.md` 中「数据与部署」类说明。
- 在 `docs/reports/` 增加或更新 **Phase 18.x 实施报告**，并照计划中的 **出口验收清单** 逐项打勾。

---

## 6. 日常节奏速查（上线后）

| 任务 | 周期 | 行为摘要 |
|------|------|----------|
| Nightly | 每日（UTC 20:00，见 workflow） | Kaggle 拉取 → 按 **当前 active** `threshold_versions` 清洗 → 更新 Supabase 票数 / pending → 导出静态 JSON |
| Monthly | 每月 1 日（UTC 20:00，见 workflow） | 重算动态阈值并切换 active → 全量 UMAP refit + Procrustes → 更新 `movies` / 清 pending → 导出（`meta` 中带 `threshold_version` 等） |

**注意**：daily **不会**更新阈值表；阈值版本只在 monthly 中切换。这与「避免每日阈值微漂移」的产品决策一致。

---

## 7. 故障排查速查

| 现象 | 可能原因 | 建议 |
|------|----------|------|
| Monthly 一开始就报缺 `data/output/*.npy` 或 `cleaned.csv` | Cache 未命中且仓库未随附四文件 | 按 **第 3 节** 准备 bundle 并重跑 |
| `no active threshold_versions row` | 未 seed 活跃阈值 | 运行 `seed_active_threshold_version.py` 或手动插入 |
| Kaggle 下载失败 | API、网络、数据集变更 | 检查 Secrets；必要时改用 `--input-csv` 本地调试 monthly 脚本 |
| Monthly 在 Procrustes 锚点校验处 abort | 参考坐标与 v1 锚点严重不一致（数据或顺序错误） | 检查 `galaxy_v1_reference`、cache 与 `cleaned` 行对齐；必要时调低误判阈值仅用于诊断（生产需谨慎） |
| UMAP 超时或 OOM | `ubuntu-24.04` 资源不足 | 参考 Phase 18 计划中的 **runner fallback**：改为季度在本机 full refit，再上传坐标与 JSON；或调高 `timeout-minutes`（治标不治本） |
| 导出 `meta.version` 不符合预期 | `export_from_supabase.py` 分支与参数 | Monthly 应使用 `--version-branch monthly` 与 `--threshold-version`（或由 monthly 脚本子进程传入） |

---

## 8. 相关路径索引（仓库内）

| 主题 | 路径 |
|------|------|
| 夜间 vote 刷新 | `scripts/cron/nightly_vote_refresh.py`，`.github/workflows/nightly_vote_refresh.yml` |
| 月度 refit | `scripts/cron/monthly_refit.py`，`.github/workflows/monthly_refit.yml` |
| 从 Supabase 导出前端 JSON | `scripts/cron/export_from_supabase.py` |
| 阈值种子 | `scripts/cron/seed_active_threshold_version.py` |
| Procrustes | `scripts/feature_engineering/procrustes_align.py` |
| Phase 18 总计划（细节与风险） | `.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md` |
| 权威数据流说明（待 P18.7 同步） | `docs/project_docs/TMDB 电影宇宙 Data Pipeline.md` |

---

## 9. 小结：你「接下来」的最低动作列表

1. **合并** Phase 18 相关 PR，保证 `main` 含 nightly + monthly workflow 与脚本。  
2. **配置** `SUPABASE_*`、`KAGGLE_*`（及后续 CF）Secrets。  
3. **准备** `data/output` 四件套并让 **至少一次** monthly 流程在 GHA 上能读到它们（cache 或等价手段）。  
4. **手动 dispatch** nightly → monthly，确认绿。  
5. 推进 **P18.6** Pages 与 **P18.7** 文档验收。  
6. 若 monthly 在 hosted runner 上不可持续，按计划在 **本机季度 full refit** 并走上传/轻量部署路径，同时保留 daily 自动化。

按上述顺序执行，即可把「开发完成」推进到「线上可持续运行」。
