# Phase 30.7 / P30.7 静态部署 SPA rewrite 实施报告

## 1. 任务目标

落地 Phase 29 spec §6.5 静态托管 SPA fallback：**Cloudflare Pages** 显式 `_redirects`；**GitHub Pages 备线** build 后 `404.html`；构建期校验 `dist` 契约；并修复验收中发现的 **`/movie/:id` 深链 focus 被 scene dispose 清空** 问题。

对应计划：[`.cursor/plans/phase_30_routing_sharing.plan.md`](../../.cursor/plans/phase_30_routing_sharing.plan.md) · TODO `p30-static-rewrite`（30.7）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| CF `_redirects` | `frontend/public/_redirects` → `dist/_redirects`；仅 `/movie/*`、`/today` → `/index.html` **200**；依赖 D8「实体文件优先」，不写 `/data/*` 等排除行 |
| GHP `404.html` | **仅** `deploy-pages.yml` 在 build 后 `cp index.html 404.html`；**不**写入默认 `npm run build`，避免 CF dist 出现顶层 `404.html` 改变隐式 SPA 行为 |
| 构建断言 | `frontend/scripts/verify-spa-fallback-dist.mjs` 挂入 `build`；断言 `_redirects` 内容且无 `dist/404.html` |
| 深链 focus 修复 | `interaction.ts` dispose **不再** 清空 `selectedMovieId`（Strict Mode / scene 重挂时保留 route 写入的选中态） |
| Vercel | 未加 `vercel.json`（当前未启用，spec §6.5 C 作模板保留） |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `frontend/public/_redirects` | CF Pages 显式 SPA fallback 契约 |
| `frontend/scripts/verify-spa-fallback-dist.mjs` | post-build 校验 `_redirects`、无 `404.html`、`fonts/`、`assets/`、`data/today.json` 抽样 |
| `frontend/package.json` | `build` 链增加 verify 步骤 |
| `.github/workflows/deploy-pages.yml` | GHP artifact 增加 `404.html` 步骤 |
| `frontend/src/three/interaction.ts` | dispose 仅清 hover，不清 `selectedMovieId` / `focusNeighborIds` |

分支：`chore/p30.7-static-spa-rewrite`。

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run build -w frontend` | **通过**；`[spa-fallback-dist] ok` |
| `dist/_redirects` | 含 `/movie/*`、`/today` 两条 200 规则 |
| 默认 build 产物 | **无** `dist/404.html`（CF 路径） |
| 深链 dev 验收 | 用户 **通过**（`/movie/:id` 可进入 focus、Drawer、Perlin；修复 interaction dispose 后） |
| CDN R1–R8 矩阵 | **未在 PR 前手测生产**；留 **30.8**（wrangler / 生产刷新） |

---

## 5. 风险与后续

| 风险 | 分流 |
| :--- | :--- |
| `vite preview` 不能验深链刷新 | **30.8** 用 CF / `wrangler pages dev` |
| 子路径 `VITE_BASE_PATH` 时 `_redirects` 须带前缀 | 当前 CI 均为 `base: '/'`；未来注入 base 时须同步生成规则 |
| 生产 R1–R7 未在本任务手测 | **30.8** §6.6 + §5.8 |

**建议下一任务**：30.8 路由 / 分享 / locale / CDN 刷新验收与测试补全。
