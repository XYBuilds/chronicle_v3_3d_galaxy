# Phase 34.4 / P34.4 OG Worker PNG 部署 实施报告

## 1. 任务目标

独立仓库 **`themoviecosmos-og-worker`** 在 `themoviecosmos.com` 同 zone 提供动态 OG PNG：

- `GET /og/movie/{id}.png?v={G}-{M}`
- `GET /og/today.png?v={G}-{M}`
- `GET /og/brand.png?v=og-brand-og-v1`

读取 P34.3 写入的 **OG_INDEX** KV；canonical URL 长缓存；KV miss 回品牌图。

对应计划：[`.cursor/plans/phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) · TODO `p34-worker-og-repo`（34.4）。

运维手册：[`docs/guides/P34.4 OG Worker PNG 部署说明.md`](../guides/P34.4%20OG%20Worker%20PNG%20%E9%83%A8%E7%BD%B2%E8%AF%B4%E6%98%8E.md)。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| 仓库 | 独立 Public repo：`XYBuilds/themoviecosmos-og-worker` |
| 渲染栈 | Satori **`/standalone`** + yoga/resvg **vendored wasm `?module`**（非 DOM canvas） |
| 字体 | 主仓 **Inter.ttf 为可变字体**，Satori/opentype 在 Workers 解析 `fvar` 失败；**暂用 Butler-Medium**  bundled TTF |
| 密钥 SSOT | 子仓 `.env`；`npm run deploy` = `use-env.ps1` + `sync-wrangler-from-env.ps1` + `wrangler deploy` |
| Deploy Token | `OG_INDEX_KV_API_TOKEN`（`the-movie-cosmos-og-index-kv-sync`）需 **Workers Scripts Edit** |
| HTML meta | **不在本任务**（34.5） |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| 子仓 Worker | 路由、KV、海报 w342、hash8 `v`、Satori 版式 port `render_og_today` |
| `vendors/{resvg,yoga}.wasm` | Wrangler `CompiledWasm` 规则 |
| `scripts/{use-env,sync-wrangler,deploy}.ps1` | `.env` → toml + Wrangler 鉴权 |
| GitHub | https://github.com/XYBuilds/themoviecosmos-og-worker |
| 主仓 | `docs/guides/P34.4 OG Worker PNG 部署说明.md` |

**生产验收（Operator，2026-05-22）**

| URL | 结果 |
| :--- | :--- |
| `/og/brand.png?v=og-brand-og-v1` | 200 PNG，`immutable` |
| `/og/today.png` | 302 → canonical `v` → 200 PNG |
| `/og/movie/301334.png` | 302 → canonical `v` → 200 PNG |

---

## 4. 验证

- 子仓：`npm test`（11）、`npm run typecheck`、`wrangler deploy --dry-run`
- 生产：`curl -sI` 于 `https://themoviecosmos.com/og/*`（路由绑定后）
- 浏览器：PNG 可见（Operator 确认）

---

## 5. 已知风险与后续

| 风险 / 跟进 | 说明 |
| :--- | :--- |
| 字体与 Pillow 版式差异 | 待加入**静态 Inter TTF 子集**后恢复正文 Inter |
| `/movie/*` 页面 meta | 仍走 Pages 静态 `index.html` → **34.5** |
| 分享 `og:image` URL | **34.6** 改 `index.html` / 分享链 |
| 平台抽样 | **34.8** X / Facebook / Telegram / Discord |

**建议下一任务**：**34.5** 同 Worker HTML `<head>` 注入（`/movie/*`、`/today`）。
