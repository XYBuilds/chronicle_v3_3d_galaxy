# Phase 34.5 / P34.5 OG Worker HTML meta 注入 实施报告

## 1. 任务目标

同 zone Worker **`themoviecosmos-og`** 对深链 HTML 注入 Open Graph / Twitter `<head>` meta（**无**爬虫 UA 分流）：

- `GET /movie/:id`（`Accept: text/html`）
- `GET /today` / `/today/`

浏览器仍加载 SPA；PNG 仍走 `/og/*`（34.4）。

对应计划：[`.cursor/plans/phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) · TODO `p34-worker-html-routes`（34.5）。

运维手册：[`docs/guides/P34.5 OG Worker HTML meta 部署说明.md`](../guides/P34.5%20OG%20Worker%20HTML%20meta%20%E9%83%A8%E7%BD%B2%E8%AF%B4%E6%98%8E.md)。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| Shell 来源 | `fetch(SITE_ORIGIN/index.html)`，由 Pages 提供模板，Worker 仅替换 meta |
| 路由绑定 | Dashboard 手动（API Token 无 Zone Workers Routes 权限时）；**保留** `og/*`，**新增** `movie/*`、`today*` |
| `/today` 路径 | 路由 `today*`；裸 `/today` 在 Pages 仍可能 308→`/`，验收用 `/today/` |
| `og:description` | 固定短句，不含影片 overview |
| KV miss / 非法 id | meta 退品牌图 `/og/brand.png`；`og:url` 仍保留请求路径 |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| 子仓 `src/html.ts` | 路径解析、title 格式化、`injectHtmlMeta`、`resolveMoviePageMeta` / `resolveTodayPageMeta` |
| 子仓 `src/index.ts` | HTML 分支先于 404；与 PNG 路由共存 |
| `test/html.spec.ts` | 11 项（注入、URL、路径） |
| `wrangler.toml` | `run_worker_first = true`；路由说明注释（Dashboard SSOT） |
| 主仓 | P34.5 部署指南；P34.4 指南交叉链接 |

**生产验收（Operator，2026-05-22）**

| URL | `og:url` | `og:image` |
| :--- | :--- | :--- |
| `/movie/301334` | `https://themoviecosmos.com/movie/301334` | `/og/movie/301334.png?v=2026.05.11.h3-bf462aa7` |
| `/today/` | `https://themoviecosmos.com/today` | `/og/today.png?v=2026.05.11.h3-a7f241da` |
| `/movie/301334?lang=zh` | 含 `?lang=zh` | （与无 query 同图 URL，`v` 不含 lang） |

---

## 4. 验证

- 子仓：`npm test`（22）、`npm run typecheck`、`npm run deploy`（Worker 版本 `dffdfef2-…`）
- 生产：`curl.exe` 抓取 meta（Dashboard 绑定 `movie/*`、`today*` 后）
- 计划 §34.2 检查清单：Worker HTML 注入项已勾选

---

## 5. 已知风险与后续

| 风险 / 跟进 | 说明 |
| :--- | :--- |
| Token 无法 API 写路由 | 需 Dashboard 或升级 Zone **Workers Routes Edit** |
| 裸 `/today` 308 | 分享链与 `_redirects` 在 **34.6** 可统一为 `/today/` |
| apex `/` 静态 meta | 仍指向旧 `og-today.png` → **34.6** |
| 平台 Debugger 重抓 | **34.8** X / Facebook / Telegram / Discord |

**建议下一任务**：**34.6** 主仓 `index.html`、`?lang=` 分享 URL、Vite cache-bust 移除。
