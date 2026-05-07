# Phase 20.1 — wrangler-action 与 Node 24 CI 升级（实施报告）

**范围：** 对照 [.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md](../../.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md) 中的 **P20.1**：将 Cloudflare Pages 直传从已归档的 **`cloudflare/pages-action`** 迁移到声明式 **`cloudflare/wrangler-action@v3`**；将参与前端构建的 **`actions/setup-node`** 运行时从 **Node 20** 提升到 **Node 24**；审计其它 GitHub Actions 版本并按计划保持不动；评估并移除已不再需要的 **`npm i -g npm@10.8.3`**。

**明确不在本期：** 数据契约、UMAP/Procrustes、前端业务代码；Tech Spec / Data Pipeline / README / 运维指南中仍写 `pages-action` 或 Node 20 的段落 — **留待 Phase 20.6 文档同步**统一改版。

**Git：** 建议在独立分支（例如 `phase/p20.1-wrangler-node24`）上开发与合并；主线合并提交信息可采用：`ci(P20.1): wrangler-action@v3 Pages deploy, Node 24, drop global npm pin`。

---

## 1. 最终决策（已定稿）

| 议题 | 决策 | 理由 |
|------|------|------|
| Pages 直传实现方式 | 使用 **`cloudflare/wrangler-action@v3`** + **`command: pages deploy …`** | `pages-action` 已归档；`wrangler pages publish` 路径 deprecated；与 Phase 20 计划及 Cloudflare 官方 README 示例一致。 |
| `pages deploy` 参数 | **`frontend/dist`** + **`--project-name=${{ secrets.CLOUDFLARE_PAGES_PROJECT_NAME }}`** + **`--branch=${{ github.ref_name }}`** | 与原先 Direct Upload 目录一致；`--branch` 用于预览/分支别名语义（`workflow_dispatch` / `push` 与默认分支 schedule 均能获得合理 ref 名）。 |
| Wrangler / Node 版本（构建） | **`node-version: "24"`**（`setup-node@v4`） | Node 20 LTS 维护周期结束（计划锚定 2026-04-30）；Node 24 为当前 LTS 方向。 |
| 全局 npm 升级步骤 | **删除** `npm i -g npm@10.8.3` | Node 24 自带 npm 10+（实测 CI 上可为 npm 11.x）；简化流水线；Linux optional 原生依赖问题仍由「删 lock + `npm install --include=optional`」承接。 |
| `wrangler-action` 是否显式 `wranglerVersion` | **不显式传入**（交由 action 默认/自适应安装逻辑） | 计划 YAML 片段未要求 pin；action 在必要时自行安装兼容 wrangler（实测会先尝试 `npx`，再 fallback 安装）。 |
| 其它 actions | **`actions/checkout@v4`、`setup-python@v5`、`cache@v4`、`upload-artifact@v4`、`deploy-pages@v4` 等不改版本** | 与 Phase 20.1 计划「审计后不动」一致。 |
| `phase18_refit_benchmark.yml` | **不改** | 该 workflow 仅 Python 管线，无 Node / Pages 部署步骤。 |
| 文档与 SSOT | **本期不写** | 计划将 Tech Spec / Data Pipeline / README / 指南同步归入 **P20.6**。 |

---

## 2. 最终操作（仓库内实际改动）

### 2.1 修改的文件

| 文件 | 变更摘要 |
|------|----------|
| [.github/workflows/nightly_vote_refresh.yml](../../.github/workflows/nightly_vote_refresh.yml) | `setup-node` → Node **24**；移除全局 npm pin；`Deploy to Cloudflare Pages` 改为 **`cloudflare/wrangler-action@v3`** + `pages deploy …`。 |
| [.github/workflows/monthly_refit.yml](../../.github/workflows/monthly_refit.yml) | 同上（与 nightly 末尾 Pages 部署段对齐）。 |
| [.github/workflows/deploy-pages.yml](../../.github/workflows/deploy-pages.yml) | GitHub Pages 灰度流水线：`setup-node` → Node **24**；移除全局 npm pin；保留 optional 依赖 workaround 与 `npm run build -w frontend`。 |

### 2.2 部署步骤等价替换（语义）

**替换前（示意）：** `cloudflare/pages-action@v1.5.0`，`directory: frontend/dist`，`wranglerVersion: "3"`。

**替换后（实际 YAML）：**

```yaml
- name: Deploy to Cloudflare Pages
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: pages deploy frontend/dist --project-name=${{ secrets.CLOUDFLARE_PAGES_PROJECT_NAME }} --branch=${{ github.ref_name }}
    gitHubToken: ${{ github.token }}
```

Secrets 名称与 P18.6 既有配置保持一致：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_PAGES_PROJECT_NAME`。

---

## 3. 验收与观测（基于一次成功运行）

以下结论来自对本仓库一次 **P18.4 Nightly vote refresh** 运行日志的核对（用户导出目录示例：`logs/Github Workflow/logs_67881703612`）；**以 GitHub Actions UI 上该 run 的 Success 为最终权威**。

| 验收项 | 结果 | 说明 |
|--------|------|------|
| `wrangler-action@v3` 被解析执行 | 通过 | 日志出现 `Download action repository 'cloudflare/wrangler-action@v3'` 与 `Run cloudflare/wrangler-action@v3`。 |
| `pages deploy` 成功 | 通过 | 日志含 **Deployment complete** / **Wrangler Action completed**；未依赖已废弃的 `wrangler pages publish` 文案。 |
| Node 24 用于前端构建 | 通过 | `setup-node` 报告 `node: v24.x`，`npm` 主版本 ≥ 10。 |
| 工作流整体成功 | 通过 | 未见 **`##[error]`**；部署段正常结束。 |
| 已知非致命告警 | 已记录 | （1）R2 prune 后 `upload-artifact` 可能找不到大文件路径 → **`if-no-files-found: warn`**，预期行为，见 P18.7 报告说明。（2）GitHub 可能对仍基于 Node 20 **运行时**的 composite actions 打出 deprecation 总警告；与 **应用构建使用 Node 24** 属不同层面，需后续跟进出新 major / 或 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 等官方指引。（3）`pages deploy` 可能提示 git **uncommitted changes**，可加 `--commit-dirty=true` 静音 — **未列入 P20.1 必做**。 |

---

## 4. 后续建议（非 P20.1 必做）

1. **P20.6**：把 Data Pipeline / Tech Spec / README / `docs/guides/*` 中仍写 `pages-action@…`、Node 20、全局 npm pin 的段落，统一改为本文 §2 的最终形态。
2. **可选降噪**：在 `pages deploy` 命令末尾追加 `--commit-dirty=true`，消除 CI 工作区脏状态警告。
3. **可选**：当 Cloudflare / GitHub 发布推荐组合时，为 `wrangler-action` 显式 `wranglerVersion: "4"` 并回归一次 Pages Direct Upload（本期按计划未强制 pin）。

---

## 5. 小结

P20.1 的**最终决策**是：生产 cron 两条链路（nightly / monthly）与 GitHub Pages 灰度构建统一升级到 **Node 24**，Pages 发布统一走 **`cloudflare/wrangler-action@v3` + `wrangler pages deploy`**，并移除冗余的全局 npm 升级步骤。**最终操作**仅限上述三个 workflow 文件；文档 SSOT 更新归入 **P20.6**。
