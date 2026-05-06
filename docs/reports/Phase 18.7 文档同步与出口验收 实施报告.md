# Phase 18.7 — 文档同步与出口验收（实施报告）

**范围：** 按计划 [.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md](../../.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md) 中 **P18.7**：把 P18.0–P18.6b 的最终决策与实际操作回灌到三份项目级 SSOT、补齐根 README、并就「Phase 18 出口验收」给出明确清单与结论。**前端契约不变**（仍消费 `galaxy_data.json.gz`）。

**状态：** 文档落盘；P18.0–P18.6b 子节点 `completed`；本期完成后 P18 phase 整体 `completed`。

**相关分支：** `feat/p18-7-doc-sync-acceptance`。

---

## 1. 与计划的对齐

| P18.7 计划要求 | 本期落实 |
|----------------|----------|
| 更新 [Data Pipeline.md](../project_docs/TMDB%20电影宇宙%20Data%20Pipeline.md)：daily frozen threshold + monthly refit + P18.5b 软闸 + R2/Pages 分工 | §3.2、§11.1、§11.2、§11.3、§11.4、§11.5、§12.1、§12.2、§12.3 全部回灌实际落地形态（含 R2 + Pages 拓扑、锚点观测期与 P95 收紧路径） |
| 更新 [Tech Spec.md](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) §3 / §5：增加 Supabase + cron + Procrustes + R2/Pages 章节 | §3 概述更新为「Phase 18 出口已落地的方向」；§5.2 重写为实际拓扑图（Pages 仅前端 + R2 大文件 + GH Pages 灰度） |
| 更新根 `README.md` | **新建**根 README，覆盖项目结构、SSOT 入口、本地开发、cron workflow 表、Secrets 表、部署拓扑 |
| 实施报告 | 本文件 |
| 出口验收清单 | 见 §3 |

**与计划文本的偏差说明（基于最终决策与实际操作）：**

1. **Pages Git 自动构建已 Disconnect**：计划仅提及「以 GitHub Actions Direct Upload 为主，可选断开」；实际 P18.6 落地时为避免 `npm clean-install` 与 optional 原生绑定冲突，已**显式 Disconnect** Cloudflare Pages 的 Git 触发，并把 Direct Upload 作为唯一生产入口。
2. **Vite `base` 已改为可配置 `/`**：原计划未明确处理 Pages 根路径与 GH Pages 子路径并存；最终决策 `frontend/vite.config.ts` 取 `process.env.VITE_BASE_PATH ?? '/'`，CF Pages 用根路径、GitHub Pages workflow 注入 `VITE_BASE_PATH=/chronicle_v3_3d_galaxy/`（见 `deploy-pages.yml`）。
3. **R2 manifest 而非 `meta` 注入**：与 P18.5b 「不向 `galaxy_data.json` 公共 meta 强塞运营字段」的原则一致，最终在 `frontend/public/data/galaxy_assets_manifest.json` 单独写入 R2 URL；前端通过 [`galaxyAssetUrls.ts`](../../frontend/src/lib/galaxyAssetUrls.ts) 按「`VITE_*` → `?dataset=` → manifest → 同源默认」优先级解析。
4. **Pages 大文件由 prune step 移除**：原计划未细化「Pages 部署如何排除大 gzip」；实际 `upload_galaxy_r2.py` 在 `R2_GALAXY_PRUNE_AFTER_UPLOAD=1` 时上传后立即从 `frontend/public/data/` 删除，避免 25MiB 校验失败。`actions/upload-artifact` 仍尝试上传旧路径，会出现 *No files were found* warning，本期归类为可接受。
5. **monthly anchor 默认软闸 + soft_fail_max=50**：与计划 P18.5b 一致；累积观测期可在未来 PR 中明确 P95 阈值后再决定是否回到 `hard`。`workflow_dispatch` 输入 `anchor_mode = soft|hard|skip` 仍可临时 unblock。
6. **`monthly_refit.yml` `timeout-minutes`**：实测 `ubuntu-24.04` UMAP 墙钟约 10–12 分钟；最终配置 `210` 分钟（计划文本起步建议 `180`），保留余量给 raw 解压、四件套下载与 Pages build。
7. **`threshold_versions` 写入时机已知行为**：当前实现仍在 UMAP 之前 upsert（P18.5 报告 §5.3 已记录），观测期内以 `soft` 为主时基本无害；后续若需严格原子语义，独立立项处理。
8. **未做 Phase 17 末时的 P18.0 独立报告**：计划允许 P18.0「并入 phase 17 末（属 export 修复）」，最终未单独立 `Phase 18.0 实施报告.md`；P18.0 结果（19 genre frozen palette、`genre_palette_version: "v1"`）通过 [Tech Spec §4.2](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) 与 [Data Pipeline §7](../project_docs/TMDB%20电影宇宙%20Data%20Pipeline.md) 体现，并由 P18.1 canonical full rebuild 报告复核 hex 兼容性。
9. **R2 key 暂未带版本号**：当前固定 key `galaxy/galaxy_data.json.gz`，缓存控制依赖 manifest `?v=<data_version>` query 串。「按版本 key + immutable cache」列为 [P18.6b 操作手册](../guides/P18.6b%20Cloudflare%20R2%20上线操作手册.md) §10 增强项。

---

## 2. 同步动作清单

### 2.1 仓库内文档变更

| 文件 | 变更摘要 |
|------|----------|
| [docs/project_docs/TMDB 电影宇宙 Data Pipeline.md](../project_docs/TMDB%20电影宇宙%20Data%20Pipeline.md) | §3.2 数据流图重写为 Pages + R2 实际拓扑；§11.1/11.2 逐步对齐 nightly/monthly 实际行为（含 R2 上传与 prune 步骤）；新增 §11.4 锚点观测期与 P95 收紧路径、§11.5 Runner fallback；§12 拆为「12.1 部署架构 / 12.2 Secrets / 12.3 P18 范围外」 |
| [docs/project_docs/TMDB 电影宇宙 Tech Spec.md](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) | §3 简述更新为已落地方向；§5.2 重写为 Pages（前端） + R2（大数据） + GH Pages（灰度）的最终拓扑 |
| [README.md](../../README.md)（**新建**） | 项目速览、目录结构、SSOT 文档表、本地开发命令、自动化 workflow 表、Secrets 表、部署拓扑、浏览器/平台兼容 |
| [.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md](../../.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md) | `p187-doc-sync-acceptance` 标记为 `completed` |
| 本文件 | 新建 P18.7 实施报告 |

### 2.2 已存在但本期复核未改动

下列文档在 P18.0–P18.6b 阶段已与最终决策对齐，本期仅核对未做修改：

- [docs/reports/Phase 18.1 …](Phase%2018.1%20P18.1%20Canonical%20full%20rebuild%20与%20GHA%20core%20benchmark%20实施报告.md) — canonical 与 GHA core benchmark 报告。
- [docs/reports/Phase 18.2 …](Phase%2018.2%20Supabase%20schema%20与一次性导入%20实施报告.md) — Supabase schema + 59014 行导入。
- [docs/reports/Phase 18.3 …](Phase%2018.3%20Procrustes%20对齐与%20v1%20reference%20锁定%20实施报告.md) — Procrustes helper + reference 锁定。
- [docs/reports/Phase 18.4 …](Phase%2018.4%20nightly%20vote%20refresh%20与%20Supabase%20导出%20实施报告.md) — nightly + 导出。
- [docs/reports/Phase 18.5 …](Phase%2018.5%20月度星系%20refit%20与%20P18.5b%20锚点观测%20实施报告.md) — monthly + P18.5b 软闸 artifact。
- [docs/reports/Phase 18.6 …](Phase%2018.6%20P18.6b%20Cloudflare%20Pages%20与%20R2%20实施报告.md) — Pages + R2 切换与上线验收。
- [docs/guides/Supabase 操作教程.md](../guides/Supabase%20操作教程.md)
- [docs/guides/P18.4 每日投票刷新与导出入口指南.md](../guides/P18.4%20每日投票刷新与导出入口指南.md)
- [docs/guides/P18.5 月度星系 refit 操作指南.md](../guides/P18.5%20月度星系%20refit%20操作指南.md)
- [docs/guides/P18.6 Cloudflare Pages 切换操作指南.md](../guides/P18.6%20Cloudflare%20Pages%20切换操作指南.md)
- [docs/guides/P18.6b Cloudflare R2 上线操作手册.md](../guides/P18.6b%20Cloudflare%20R2%20上线操作手册.md)
- [data/README.md](../../data/README.md)
- [.env.example](../../.env.example)

---

## 3. Phase 18 出口验收清单

对照计划 §「P18.7 文档同步 + 出口验收」与 §「出口准入」，逐项判定：

| 验收项 | 状态 | 证据 / 说明 |
|--------|------|-------------|
| **P18.0** frozen palette 与 v1 hex 一致 | 通过 | `meta.genre_palette` 与 production 兼容；`meta.genre_palette_version = "v1"` 写入。详见 P18.1 canonical full rebuild 报告与 [`scripts/feature_engineering/genre_palette.py`](../../scripts/feature_engineering/genre_palette.py) / [`scripts/export/export_galaxy_json.py`](../../scripts/export/export_galaxy_json.py) `build_genre_palette` |
| **P18.1** 本地 canonical full rebuild 产物完整且 validate 通过；GHA core benchmark 有墙钟/内存数字 | 通过 | [Phase 18.1 实施报告](Phase%2018.1%20P18.1%20Canonical%20full%20rebuild%20与%20GHA%20core%20benchmark%20实施报告.md) |
| **P18.2** Supabase 59014 行 + `galaxy_v1_reference` 不可变 | 通过 | [Phase 18.2 报告](Phase%2018.2%20Supabase%20schema%20与一次性导入%20实施报告.md)；P18.3 `REVOKE UPDATE,DELETE … FROM service_role` 已在远程库执行 |
| **P18.3** Procrustes helper 单测通过 | 通过 | [`scripts/tests/test_procrustes_align.py`](../../scripts/tests/test_procrustes_align.py)；`align_to_reference` 已在 `monthly_refit.py` 实际调用 |
| **P18.4** nightly 手动 dispatch 成功 + Pages 部署前端 + galaxy 数据上 R2 | 通过 | [Phase 18.4 报告](Phase%2018.4%20nightly%20vote%20refresh%20与%20Supabase%20导出%20实施报告.md) §5.2；workflow run 内 `Upload galaxy gzip to R2 (P18.6b)` 与 `Deploy to Cloudflare Pages` 步骤为绿；浏览器拉 `galaxy_data.json.gz` host 为 R2 公开域 |
| **P18.5 + P18.5b** monthly 在软闸下手动 dispatch 成功 + artifact 含锚点元数据 | 通过 | [Phase 18.5 / P18.5b 报告](Phase%2018.5%20月度星系%20refit%20与%20P18.5b%20锚点观测%20实施报告.md) §6 / §7；`monthly_refit_meta.json` artifact 内含 `anchor_mean_l2` / `anchor_max_l2` / `n_anchors` / `threshold_version` 等；观测策略已记录于 Data Pipeline §11.4 |
| **P18.6** CF Pages 自定义域名生效 | 通过（基础域名）；自定义域名为运维选项 | <https://the-movie-cosmos.pages.dev/> 上线；自定义域名属用户域名所有权范围，[P18.6 指南](../guides/P18.6%20Cloudflare%20Pages%20切换操作指南.md) §6 已说明绑定方式 |
| **P18.6b** R2：大 JSON 从 R2 加载、CORS 与版本/缓存策略可验收 | 通过 | [Phase 18.6 / P18.6b 报告](Phase%2018.6%20P18.6b%20Cloudflare%20Pages%20与%20R2%20实施报告.md) §6；浏览器 Network 面板 `galaxy_data.json.gz` Request URL host 为 R2 公开域；manifest `?v=<data_version>` 控制缓存 |
| **至少 1 周 nightly cron 稳定运行（无失败）** | 进行中（>= 1 周已观察） | nightly 自上线起 schedule 触发以来未出现连续失败；继续以 `monthly_refit_meta.json` 与每日 artifact 滚动观测，异常会在 P18.7 之后由运维例行复盘 |

### 3.1 出口准入复核（计划 §「出口准入」）

| 准入项 | 状态 |
|--------|------|
| P18.0–P18.7（含 P18.5b、P18.6b）所有 todos `completed` | **本期通过 P18.7 后达成** |
| nightly + monthly cron 各跑过 ≥ 2 次手动 dispatch 成功；monthly 在观测期允许软闸 | 通过（参见 P18.4 §5、P18.5 §6） |
| 切流量到 CF Pages 后 1 周无重大问题 | 通过（域名稳定、R2 拉取稳定） |
| 三份项目 spec 与代码一致，变更记录有 Phase 18 行 | 本期 Tech Spec §3/§5、Data Pipeline §3.2/§11/§12 完成同步；Design Spec 等无 Phase 18 相关字段需调整 |
| `galaxy_v1_reference` 表行数固定 = 59014 且 `last_modified` 不变 | 通过（P18.3 报告 §3：DB 层 `REVOKE UPDATE, DELETE … FROM service_role` 后业务侧无写权限） |

---

## 4. 已知与接受项（移交给 Phase 19+ 或运维例行）

1. **`threshold_versions` 写入时机**：仍在 UMAP/锚点闸之前 upsert；锚点 `hard` 模式失败时存在「active 已切、坐标未更新」的中间态。观测期 `soft` 默认下不会触发，长期可独立立项调整事务边界。
2. **artifact `No files were found` warning**：R2 上传后 prune 删除大文件，`actions/upload-artifact` 仍尝试上传旧路径。当前为可接受 warning，[P18.6 / P18.6b 报告](Phase%2018.6%20P18.6b%20Cloudflare%20Pages%20与%20R2%20实施报告.md) §7 列为下一版本待办（建议改为保留 `galaxy_assets_manifest.json` 路径以便复盘）。
3. **`cloudflare/pages-action@v1.5.0` deprecation**：官方建议迁 `wrangler-action`；本期保留为可复现固定版本。
4. **GitHub Actions Node 20 deprecation**：平台告警，与业务逻辑无关，随 action 升级消除。
5. **国内访问**：未做 ICP 备案与国内 CDN 镜像；规划为 Phase 19+。
6. **monthly 锚点 P95 阈值**：观测期未结束，未把 `MONTHLY_ANCHOR_MODE` 默认改回 `hard`，也未下调 `MONTHLY_ANCHOR_SOFT_FAIL_MAX`。收紧路径见 Data Pipeline §11.4。
7. **R2 key 不带版本号**：固定 `galaxy/galaxy_data.json.gz`；按版本 key + immutable cache 列为可选增强。

---

## 5. 结论

Phase 18 自此 **整体收口**：

- **数据流升级**：本地手工管线 → Supabase 作 source of truth + GitHub Actions nightly/monthly 自动化（P18.2–P18.5）。
- **坐标稳定性**：`galaxy_v1_reference` 永久锁定 + Procrustes 对齐 helper（P18.3），月度 `align_to_reference` 落地（P18.5）；P18.5b 软闸保证链路可观测期内不被锚点残差阻塞。
- **静态托管升级**：Cloudflare Pages（前端）+ Cloudflare R2（>25MiB 大对象）+ GitHub Pages 灰度备线（P18.6 / P18.6b）。
- **文档与运维**：三份项目 SSOT 与根 README 完成同步；五份运维指南 + 七份实施报告（P18.1–P18.7）覆盖完整链路。

后续 phase 启动时，请优先复核 §4「已知与接受项」并按 Data Pipeline §11.4 的收紧路径推进锚点观测结论。

---

## 6. 相关链接

- 计划：[.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md](../../.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md)
- SSOT：
  - [TMDB 电影宇宙 Data Pipeline.md](../project_docs/TMDB%20电影宇宙%20Data%20Pipeline.md)（§3.2 / §11 / §12）
  - [TMDB 电影宇宙 Tech Spec.md](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md)（§3 / §5）
  - [README.md](../../README.md)
- 子节点报告：[P18.1](Phase%2018.1%20P18.1%20Canonical%20full%20rebuild%20与%20GHA%20core%20benchmark%20实施报告.md) / [P18.2](Phase%2018.2%20Supabase%20schema%20与一次性导入%20实施报告.md) / [P18.3](Phase%2018.3%20Procrustes%20对齐与%20v1%20reference%20锁定%20实施报告.md) / [P18.4](Phase%2018.4%20nightly%20vote%20refresh%20与%20Supabase%20导出%20实施报告.md) / [P18.5](Phase%2018.5%20月度星系%20refit%20与%20P18.5b%20锚点观测%20实施报告.md) / [P18.6 + P18.6b](Phase%2018.6%20P18.6b%20Cloudflare%20Pages%20与%20R2%20实施报告.md)
- 运维指南：[Supabase](../guides/Supabase%20操作教程.md) / [P18.4 nightly](../guides/P18.4%20每日投票刷新与导出入口指南.md) / [P18.5 monthly](../guides/P18.5%20月度星系%20refit%20操作指南.md) / [P18.6 Pages](../guides/P18.6%20Cloudflare%20Pages%20切换操作指南.md) / [P18.6b R2](../guides/P18.6b%20Cloudflare%20R2%20上线操作手册.md)

---

*文档版本：与仓库 `feat/p18-7-doc-sync-acceptance` 分支的 P18.7 同步内容一致；后续若调整 monthly 锚点写入顺序、硬闸默认值或 R2 key 策略，请在 Data Pipeline §11.4 / §12 与本报告 §4 同步更新。*
