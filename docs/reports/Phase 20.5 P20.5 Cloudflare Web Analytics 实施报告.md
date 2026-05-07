# Phase 20.5 — Cloudflare Web Analytics 接入（实施报告）

**范围：** 对照 [.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md](../../.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md) 中的 **P20.5**：为前端增加 **Cloudflare Web Analytics**（cookie-free beacon）；token **不经源码硬编码**，通过构建期环境变量注入；满足「部署后可观测 PV / 地理 / Core Web Vitals」的起步监控诉求。

**明确不在本期：** Sentry、GA4、自建错误上报端点；修改数据契约或星系渲染逻辑；Phase 20 总文档收口 — **留待 P20.6**。

**会话来源：** 归档对话 transcript [CF Web Analytics 接入与会话](0869e33a-e29a-43e3-b8e6-92144b1fc82b)（实施、运维指南走读、`.env` / `.env.example` 同步、线上验收排查）。

**Git：** 独立分支 **`phase20/p20.5-cf-web-analytics`**（示例提交：**`077d2da`** — `feat(P20.5): inject Cloudflare Web Analytics via VITE_CF_BEACON_TOKEN`；运维文档 **`c4fa651`** — `docs(guides): add P20.5 Cloudflare Web Analytics ops runbook`）。具体哈希以当前 **`git log`** 为准。

---

## 1. 最终决策（已定稿）

| 议题 | 决策 | 理由 |
|------|------|------|
| 监控产品选型 | **Cloudflare Web Analytics**（官方 beacon） | Phase 20 计划已定：起步用 CF 侧轻量方案，不引入 Sentry。 |
| Token 承载方式 | **构建期注入**，不入库明文 token（推荐路径） | 降低误提交与历史泄露顾虑；与现有 **Vite + Actions** 模型一致。 |
| Vite 侧读取名 | 仅识别 **`VITE_CF_BEACON_TOKEN`**（trim 后非空才注入） | 与 Vite 惯例一致；注入逻辑见 **`frontend/vite.config.ts`** 中 **`cfWebAnalyticsPlugin()`**。 |
| GitHub Actions Secret 名 | **`CF_WEB_ANALYTICS_BEACON_TOKEN`** | 语义清晰；在构建 step 中 **映射为** **`VITE_CF_BEACON_TOKEN`**，与插件读取名对齐。 |
| 未配置 Secret | **不注入脚本**，构建 **仍成功** | 避免统计未就绪时阻断 nightly/monthly / Pages 流水线。 |
| 注入位置 | **`transformIndexHtml`**：在 **`</body>`** 前插入 **`beacon.min.js`** + **`data-cf-beacon`** JSON | 等同官方嵌入方式；JSON 内 **`&`** / **`"`** 做 HTML 属性转义。 |
| 页面 / 路由是否改动 | **不需要** 为统计重构 Pages 或 React 树 | 会话中已验证：线上无上报时根因是 **构建产物未含脚本**（环境变量未进入构建），而非 SPA 架构问题。 |
| 根目录 `.env.example` | 增加 **`# CF_WEB_ANALYTICS_BEACON_TOKEN=`** 占位（注释状态） | 与 GitHub Secret 命名对齐，便于运维检索；**不**把 HTML `<script>` 片段写入 `.env`。 |
| 运维文档 | 独立指南 [**`docs/guides/P20.5 Cloudflare Web Analytics 接入操作指南.md`**](../../guides/P20.5%20Cloudflare%20Web%20Analytics%20接入操作指南.md) | 控制台建站、Secret、workflow 列表、验收与 FAQ 单列成文，避免 README 重复堆砌。 |

### 1.1 易混点（会话中已澄清）

| 误区 | 说明 |
|------|------|
| 仓库根目录 `.env` 里写 **`CF_WEB_ANALYTICS_BEACON_TOKEN`** | **不会**自动变成 Vite 的 **`VITE_CF_BEACON_TOKEN`**。本地验证注入请使用：**`$env:VITE_CF_BEACON_TOKEN="…"; npm run build -w frontend`**，或在 **`frontend/.env.local`** 中配置 **`VITE_CF_BEACON_TOKEN`**（参见运维指南 §5）。 |
| 线上 **`view-source` 无 beacon** | 表示 **那次部署的构建**未传入 token；优先检查 Secret 与是否重新跑了 **带前端 build 的 workflow**，而非重构前端页面。 |
| DevTools 过滤 **`cloudflareinsights`** 无结果 | 可能是广告拦截、或未注入脚本；结合 **`view-source`** 判断是否真缺失脚本。 |

---

## 2. 最终操作（仓库内实际改动）

### 2.1 新增 / 修改文件（代码与 CI）

| 文件 | 变更摘要 |
|------|----------|
| [frontend/vite.config.ts](../../frontend/vite.config.ts) | 新增 **`cfWebAnalyticsPlugin()`**：读取 **`process.env.VITE_CF_BEACON_TOKEN`**，非空则注入 **`https://static.cloudflareinsights.com/beacon.min.js`**。 |
| [.github/workflows/nightly_vote_refresh.yml](../../.github/workflows/nightly_vote_refresh.yml) | **`Install and build frontend`** step 增加 **`env.VITE_CF_BEACON_TOKEN: ${{ secrets.CF_WEB_ANALYTICS_BEACON_TOKEN }}`**。 |
| [.github/workflows/monthly_refit.yml](../../.github/workflows/monthly_refit.yml) | 同上。 |
| [.github/workflows/deploy-pages.yml](../../.github/workflows/deploy-pages.yml) | **`Build`** step 同上（GitHub Pages 灰度线可选启用统计）。 |
| [.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md](../../.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md) | **p205-cf-analytics** todo 标记为 **completed**（计划收口用）。 |

### 2.2 文档与示例环境变量

| 文件 | 变更摘要 |
|------|----------|
| [docs/guides/P20.5 Cloudflare Web Analytics 接入操作指南.md](../../guides/P20.5%20Cloudflare%20Web%20Analytics%20接入操作指南.md) | **新建**：Dashboard 取 token、GitHub Secret、三部 workflow、验收、本地可选配置、FAQ。 |
| [.env.example](../../.env.example) | 增加 **`# --- Cloudflare Web Analytics (P20.5) ---`** 与 **`# CF_WEB_ANALYTICS_BEACON_TOKEN=`**。 |

### 2.3 仓库外操作（运维）

1. Cloudflare **Web Analytics** 中为实际站点 hostname 创建站点，复制 **beacon token**。  
2. GitHub **Actions** 仓库 Secret：**`CF_WEB_ANALYTICS_BEACON_TOKEN`** ← token。  
3. 触发任意会执行 **`npm run build -w frontend`** 且部署到目标环境的 workflow（以 **`the-movie-cosmos.pages.dev`** 为例时，对应 nightly/monthly 等已接入的 Pages 部署链路）。

---

## 3. 验收与观测

### 3.1 本地构建（实施时已验证）

| 条件 | 预期 **`frontend/dist/index.html`** |
|------|-------------------------------------|
| 未设置 **`VITE_CF_BEACON_TOKEN`** | **无** **`cloudflareinsights.com`** 脚本 |
| 设置 **`VITE_CF_BEACON_TOKEN`** 后 **`npm run build -w frontend`** | **有** **`beacon.min.js`** 与 **`data-cf-beacon`**（属性内 JSON 经 HTML 转义） |

### 3.2 线上（会话 transcript 中已对照）

| 步骤 | 预期 |
|------|------|
| **`view-source:`** 目标站点首页 | 注入后与 **`beacon.min.js`**、**`data-cf-beacon`** 一致则说明 **构建期注入成功** |
| DevTools **Network** | **`beacon.min.js`** 约 **200**；**`rum`** 类上报约 **204**（以当前 CF 行为为准） |
| Cloudflare Web Analytics 面板 | 数据可能有 **数分钟～24 小时** 延迟 |

### 3.3 计划清单对照（P20.5 条目）

- [x] 官方 beacon 脚本接入（cookie-free）  
- [x] token 经 **`VITE_CF_BEACON_TOKEN`** 构建注入（推荐路径）  
- [x] CI：`CF_WEB_ANALYTICS_BEACON_TOKEN` → **`VITE_CF_BEACON_TOKEN`**  
- [x] 未配置时不注入、构建不失败  
- [x] 运维指南归档 **`docs/guides/`**  

---

## 4. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 |
|------|------|-------------|
| 广告拦截 / 隐私扩展屏蔽 beacon | 统计偏低 | 接受；不影响主站功能（计划已列为低风险）。 |
| **`.env` 误粘贴 HTML `<script>`** | 无效配置、易泄露格式混乱 | 仅用 **`KEY=VALUE`**；会话中已改为标准 env 行；勿将整段嵌入代码粘进 env 文件。 |
| Token 曾出现在聊天 / 截图 | 公开 HTML 亦可见 token | 若担心泄露面，可在 CF 控制台轮换 token 并更新 Secret。 |
| 回滚代码 | 移除统计 | Revert P20.5 相关提交；或删除 Secret 后重建部署（产物不再含脚本）。 |

---

## 5. 后续衔接

- **P20.6**：在 **Tech Spec / Data Pipeline / README** 中同步 Web Analytics 与 Secret 命名（若 README 表格尚未引用运维指南，可加一行链到 [**P20.5 接入操作指南**](../../guides/P20.5%20Cloudflare%20Web%20Analytics%20接入操作指南.md)）。  
- **可选**：在 `.env.example` 注释中补充一行说明——本地 **`vite build`** 需 **`VITE_CF_BEACON_TOKEN`**（与 Secret 名 **`CF_WEB_ANALYTICS_BEACON_TOKEN`** 区分），减少「根目录 `.env` 已填但仍未注入」的困惑。

---

## 6. 参考资料

- Phase 20 计划：[`.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md`](../../.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md)（**P20.5 Cloudflare Web Analytics** 小节）  
- 运维指南：[**`docs/guides/P20.5 Cloudflare Web Analytics 接入操作指南.md`**](../../guides/P20.5%20Cloudflare%20Web%20Analytics%20接入操作指南.md)  
- Cloudflare 文档：[Web Analytics](https://developers.cloudflare.com/web-analytics/)（产品行为以官网为准）
