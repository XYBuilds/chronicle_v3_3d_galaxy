# Phase 29.6 / P29.6 静态部署 rewrite 预检 实施报告

## 1. 任务目标

预检静态托管下 Phase 30 深链（`/movie/:id`、`/today`）刷新是否会 404；确认 SPA fallback 与 `/data/*`、assets、fonts 不冲突；明确 `import.meta.env.BASE_URL` 与 path routing 边界；输出 Phase 30.7 可直接落地的配置方案。

对应计划：[`.cursor/plans/phase_29_release_gates_technical_decision.plan.md`](../../.cursor/plans/phase_29_release_gates_technical_decision.plan.md) · TODO `p29-static-rewrite`（29.6）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **W1** | **生产主域（Cloudflare Pages）** 在无顶层 `404.html` 时已启用**隐式 SPA**；`/movie/*` 刷新**已**返回 `index.html`（200） |
| **W2** | Phase 30.7 **仍**在 `frontend/public/_redirects` 增加显式 `/movie/*`、`/today` → `index.html` **200**，作为契约与备线对齐文档 |
| **W3** | **GitHub Pages 备线**当前**无** SPA fallback；30.7 **须** build 后 `cp index.html 404.html` |
| **W4** | 静态文件（`/data/*`、`/assets/*`、`/fonts/*`、favicon 等）依赖平台「**实体文件优先**」；**禁止**写 catch-all 覆盖这些前缀（D8） |
| **W5** | `BASE_URL` 仅影响 **pathname 前缀** 与资源 URL；数据 fetch 已用 `withBase()`，与深链**无冲突** |
| **W6** | `vite preview` **不能**验收深链刷新（R1–R2）；须 CF 生产/预览或 `wrangler pages dev` |
| **W7** | `_middleware.js` **仅** pages.dev→apex 301；**不**承担 SPA fallback |

契约 SSOT：[`docs/project_docs/Phase 29 发布门槛与技术判定 spec.md`](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) **§6**。

---

## 3. 现状预检摘要

| 锚点 | 现状 | Phase 30 影响 |
| :--- | :--- | :--- |
| `vercel.json` / `_redirects` | **无** | 30.7 新增 `_redirects`（CF）；可选未来 `vercel.json` |
| `dist/` 产物 | 含 `index.html`、`_headers`、`data/`、`fonts/`、`assets/`；**无** `404.html` | 触发 CF 隐式 SPA |
| `deploy-pages.yml` | GHP build，无 `VITE_BASE_PATH` | 须补 `404.html` 步骤 |
| `nightly_vote_refresh.yml` | `wrangler pages deploy dist` | `_redirects` 随 `public/` 进入 `dist` |
| `galaxyAssetUrls.ts` / `loadGalaxyData.ts` | `import.meta.env.BASE_URL` + `data/…` | T7 子路径时 parser 须对齐前缀 |
| `_headers` | `/fonts/*` Content-Type；`/data/*` 短 TTL | 与 rewrite **正交**；保留 |

---

## 4. 实现摘要

本 TODO **无运行时代码与部署配置变更**（符合 Phase 29 范围）。

| 产出物 | 说明 |
| :--- | :--- |
| **Phase 29 spec §6** | 扩充平台行为表、D8 原则、BASE_URL 分析、30.7 推荐 `_redirects` / GHP `404.html` / Vercel 模板、R1–R8 CDN 验收矩阵 |
| **本报告** | 决策 W1–W7 与预检结论 |

---

## 5. 验证

| 检查 | 结果 |
| :--- | :--- |
| 仓库内配置文件扫描 | **无** `vercel.json`、`_redirects`、顶层 `404.html` |
| 本地 `npm run build -w frontend` 后 `dist/` 列表 | **有** `index.html`、`data/`、`fonts/`、`assets/`、`_headers` |
| CF Pages SPA 文档与 dist 无 `404.html` 交叉 | **一致** → 隐式 SPA（W1） |
| 与 Phase 30 plan 30.7 要求 | **一致**（§6.5 给出可执行片段） |
| 与 §5 路由契约 T7 | **一致**（BASE_URL pathname 前缀） |
| 生产 URL 手测 R1–R7 | **未执行**（文档预检；建议 30.8 在 preview/生产执行） |

---

## 6. 风险与 Phase 30 前置

| 风险 | 缓解 |
| :--- | :--- |
| 团队误以为「无 `_redirects` = 生产必 404」 | W1：CF 隐式 SPA 已覆盖主域；W2 显式规则作 SSOT |
| GHP 备线深链刷新 404 | W3：30.7 `404.html` |
| 缺失字体路径被 HTML 响应 | 实体 `/fonts/*` 优先；`butlerPublicFontsBasePlugin` 修正子路径 CSS |
| `vite preview` 误报 | W6：30.8 用 CF / wrangler |
| 子路径 `VITE_BASE_PATH` | §6.4 + T7；rewrite 规则带前缀 |

**Phase 30 可开工条件**：§5 契约 + §6 方案 **已满足**（30.7 实施 rewrite 文件）。

---

## 7. 已知后续

- **29.7**：Gate report 汇总（含 Phase 30 前置是否满足）
- **Phase 30.7**：落地 `_redirects` + GHP `404.html`
- **Phase 30.8**：§6.6 R1–R8 + §5.8 T1–T8
