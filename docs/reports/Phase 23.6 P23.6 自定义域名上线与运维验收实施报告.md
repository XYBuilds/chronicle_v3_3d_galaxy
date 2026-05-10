# Phase 23.6 · P23.6 自定义域名上线与运维验收 — 实施报告

> 对应 [Phase 23 计划](../../.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md) 中 **P23.6**：自定义域名 DNS + Cloudflare Pages 绑定 + TLS；R2 CORS 允许新 Origin；`og:*` / `twitter:image` 绝对 URL 使用生产主域；`*.pages.dev` 与主域关系（最终采用 **301 → apex**）；以及上线后运维清单验收。  
> 本报告汇总 **P23.6 全部最终决策**、**仓库内最终操作**、**控制台侧最终配置**与**已执行验收**，并记录 CI 中 Wrangler 与 Pages Functions 路径的踩坑与定稿方案。  
> **会话证据（运维、R2 CORS、301、Web Analytics）**： [P23.6 运维与 301 收尾](e13b47c0-f377-4beb-b3df-f040ee35400b)  
> **报告日期**：2026-05-10。

---

## 1. 目标与最终决策

### 1.1 生产 hostname 与 canonical

| 议题 | 最终决策 |
|------|----------|
| 生产 apex | **`https://themoviecosmos.com/`** 作为对外主入口与 **`og:url`** 的 canonical。 |
| `www` | **`https://www.themoviecosmos.com`** 与 apex 同绑在 Cloudflare Pages 项目；TLS **Active**；与 R2 CORS、文档示例一致纳入允许来源。 |
| Pages 默认域 | **`the-movie-cosmos.pages.dev`** 保留为部署目标 hostname，但对浏览器访问实施 **301 → `https://themoviecosmos.com`**（同 path + query），避免与主域重复收录。 |
| 分支预览 | **不重定向**：中间件 **仅**匹配 hostname **`the-movie-cosmos.pages.dev`**，不匹配 **`*.the-movie-cosmos.pages.dev`**，避免 PR 预览被误跳到生产站。 |

### 1.2 社交元信息与 OG 图

| 议题 | 最终决策 |
|------|----------|
| `og:url` / `og:image` / `twitter:image` | 全部使用 **`https://themoviecosmos.com`** 为 host 的**绝对 URL**（与计划「P23.5 占位 hostname → P23.6 换实际域」一致）。 |
| OG 卡片内 URL 行（Pillow） | `scripts/cron/render_og_today.py` 中 **`DEFAULT_FOOTER_URL = "themoviecosmos.com"`**；仍可用环境变量 **`OG_FOOTER_URL`** 覆盖。 |
| `og:title` / `og:description` 长度 | 维持当前英文短文案；第三方调试器（如 opengraph.xyz）可能给出「标题/描述偏短」的**建议级**提示，**不阻塞** P23.6 验收。 |

### 1.3 R2 CORS（数据面）

| 议题 | 最终决策 |
|------|----------|
| 配置位置 | **仅**在 Cloudflare R2 bucket **Settings → CORS policy** 维护；仓库内 **不**存一份「会被自动下发」的 CORS 文件。 |
| 必含 Origin | `https://themoviecosmos.com`、`https://www.themoviecosmos.com`（若已绑 www）、`https://the-movie-cosmos.pages.dev`（301 前后及备线拉数）；本地预览可保留 `http://127.0.0.1:4173`。 |
| Methods | **`GET`、`HEAD`**；Headers / ExposeHeaders / MaxAge 沿用与原先 `pages.dev` 配置兼容的一组即可。 |

**最终采用的 CORS JSON 形态（与运维对话定稿一致）：**

```json
[
  {
    "AllowedOrigins": [
      "https://themoviecosmos.com",
      "https://www.themoviecosmos.com",
      "https://the-movie-cosmos.pages.dev",
      "http://127.0.0.1:4173"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 86400
  }
]
```

若 Pages **未**绑定 `www`，可从 `AllowedOrigins` 中删除 `https://www.themoviecosmos.com` 一行。

### 1.4 `pages.dev` → 主域 301 的实现路径

| 议题 | 最终决策 |
|------|----------|
| 实现载体 | **Cloudflare Pages Functions**：`frontend/functions/_middleware.js`，`onRequest` 内对 **`the-movie-cosmos.pages.dev`** 返回 **`Response.redirect(..., 301)`**。 |
| 弃用方案 | 曾尝试在 GHA 中设 **`CF_PAGES_FUNCTIONS_DIR=frontend/functions`** + 仓库根执行 `pages deploy frontend/dist`；在所用 Wrangler / 行为下**未稳定生效**，**不作为定稿**。 |
| **定稿 CI 行为** | **`cloudflare/wrangler-action@v3`**：`workingDirectory: frontend`，`command: pages deploy dist ...`，使 Wrangler 在 **`frontend/`** 下解析默认的 **`./functions`** 与 **`./dist`**，与官方「`dist` 与 `functions` 同级」布局一致，**无需依赖环境变量**。 |
| 适用范围 | **`nightly_vote_refresh.yml`** 与 **`monthly_refit.yml`** 中带 **`Deploy to Cloudflare Pages`** 的步骤均已对齐上述定稿。 |
| 与 `push main` 的关系 | **`deploy-pages.yml`** 仅部署 **GitHub Pages**，**不包含** `wrangler pages deploy`；**生产 Cloudflare** 更新依赖 **nightly / monthly**（或手动 **Run workflow**）。 |

### 1.5 Web Analytics（P20.5 / P23.6 §4）

| 议题 | 最终决策 |
|------|----------|
| §4 验收看哪里 | **Analytics → Web Analytics** 中按 **site** 查看 PV / Core Web Vitals 等 **RUM** 报表；**不**以 **Workers & Pages → 项目 → Metrics → Functions** 曲线作为「Web Analytics 是否有数」的依据。 |
| 与 Pages 内「Web analytics disabled」 | Pages 项目 Metrics 页内嵌开关与 **HTML 注入 `beacon.min.js`（`VITE_CF_BEACON_TOKEN`）** 为**不同集成路径**；Network 已见 **`beacon.min.js` 200** 即客户端 RUM 注入成功。 |
| 主域是否进同一 site | 导出报表中 **`themoviecosmos.com/`** 已出现 CWV 样本（与 **`the-movie-cosmos.pages.dev/`** 行对比），结论：**主域流量已进入以 pages.dev 命名的 Web Analytics site**，**无需**仅为 §4 再强制加 hostname，除非长期出现「主域全 0 且报错」再按 P20.5 排查。 |

---

## 2. 仓库内最终变更（文件级）

| 路径 | 作用 |
|------|------|
| `frontend/index.html` | `og:url`、`og:image`、`twitter:image` 指向 **`https://themoviecosmos.com`**；注释标明 P23.6。 |
| `README.md` | 线上站点列表：主域 + `www` + Pages 默认域（301 说明）；§6 部署拓扑补充 R2 CORS 要点、301 与 CI `workingDirectory` 说明；链到 P23.6 运维清单。 |
| `scripts/cron/render_og_today.py` | `DEFAULT_FOOTER_URL` 与生产 apex 一致。 |
| `docs/guides/P23.6 自定义域名上线后运维清单.md` | 上线后按章节验收的运维 SSOT；含 §3 对 **`workingDirectory: frontend` + `pages deploy dist`** 的说明。 |
| `frontend/functions/_middleware.js` | 仅生产 **`the-movie-cosmos.pages.dev`** → **`https://themoviecosmos.com`** 301，保留 path + query。 |
| `.github/workflows/nightly_vote_refresh.yml` | **`Deploy to Cloudflare Pages`**：`workingDirectory: frontend`，`command: pages deploy dist ...`。 |
| `.github/workflows/monthly_refit.yml` | 同上。 |
| `.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md` | **`p236-custom-domain`** todo 标为 **completed**（与计划文件维护策略一致）。 |

**未改（按计划 P23.6 原文）**

- `frontend/public/_headers`：计划写明 P23.6 **不需改**；OG 短 TTL 仍以 P23.5 为准。  
- 历史 Phase 报告 / 旧指南正文：计划写明 **历史归档不动**；本报告为 P23.6 独立归档。

---

## 3. Cloudflare 控制台与运维侧最终操作

| 步骤 | 操作 | 状态（会话内） |
|------|------|----------------|
| Pages 自定义域 | `themoviecosmos.com`、`www.themoviecosmos.com` 绑定同一 Pages 项目，**Active + SSL enabled** | 已确认（截图） |
| R2 CORS | 将 §1.3 JSON 写入 bucket CORS；保证主域 / www / `pages.dev` / 本地预览 | 已按用户提供的策略更新 |
| 生产冒烟 | 主域 **Loading → Cover → focus** 手点一遍 | **通过** |
| OG 直链 | `curl.exe -I https://themoviecosmos.com/data/og-today.png` | **200**、`image/png`；会话中响应头为 `Cache-Control: public, max-age=14400, must-revalidate`（与边缘/构建版本有关，以线上为准） |
| OG 元数据 | opengraph.xyz 抓取 `https://themoviecosmos.com/` | 预览正常 |
| `pages.dev` 301 | `curl.exe -I https://the-movie-cosmos.pages.dev/` | **301**，`Location: https://themoviecosmos.com/` |
| 301 保留路径 | `curl.exe -I "https://the-movie-cosmos.pages.dev/some/path?x=1"` | **301**，`Location: https://themoviecosmos.com/some/path?x=1` |
| Web Analytics | 以 **Web Analytics** 产品报表为准核对主域样本；PDF 导出中 CWV 表 **`themoviecosmos.com/`** 有样本、**`the-movie-cosmos.pages.dev/`** 为 0 | 与「主域 + 301」策略一致 |

---

## 4. 验收结论（出口对照）

对照计划 **P23.6 验收** 条目：

| 计划验收项 | 结论 |
|------------|------|
| `https://<custom-domain>` 加载 **200**、TLS 有效 | **通过**（`themoviecosmos.com` / `www`） |
| 主域经 manifest 拉 `galaxy_data.json.gz` **CORS 通过** | **通过**（以更新 R2 CORS 后、Console 无 CORS 红字为准） |
| `og:image` 使用新域名、调试器通过 | **通过**（opengraph.xyz + `curl -I`） |
| `*.pages.dev` 备线或 301 | **定稿为 301 → apex**；中间件 + CI `workingDirectory` 已落地 |
| README 部署拓扑反映新域名 | **已完成** |

---

## 5. 风险与回滚

| 风险 | 缓解 / 回滚 |
|------|-------------|
| R2 CORS 漏配新 Origin | 主域星系数据拉取失败；按 §1.3 全量核对 `AllowedOrigins`。 |
| 误把分支预览 hostname 纳入 301 | 当前中间件 **精确匹配** `the-movie-cosmos.pages.dev`；若将来改规则，需保留预览豁免。 |
| 仅 `push main` 未跑 nightly | 生产 Cloudflare **不**更新；需 **nightly/monthly** 或手动 **Run workflow** 执行 **`pages deploy`**。 |
| 去掉 `workingDirectory: frontend` | **301 中间件可能不再被打包**，`pages.dev` 回到 **200**；回滚时恢复定稿 workflow 片段。 |
| 控制台 **再**配置一条与中间件**重复**的 Bulk Redirect | 可能双重跳转或难以排错；**一般保留一种实现即可**。 |

---

## 6. 后续工作（计划内）

- **P23.7**：按 Phase 23 计划同步 **Tech Spec / Data Pipeline / Design Spec / README** 中部署拓扑与 P23 全链路叙述，并归档总实施报告（本文件 **不替代** P23.7 对 SSOT 文档的批量修订）。

---

## 7. 相关索引

| 文档 | 路径 |
|------|------|
| Phase 23 总计划 | [`.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md`](../../.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md) |
| P23.6 运维清单 | [`docs/guides/P23.6 自定义域名上线后运维清单.md`](../guides/P23.6%20自定义域名上线后运维清单.md) |
| R2 CORS 手册 | [`docs/guides/P18.6b Cloudflare R2 上线操作手册.md`](../guides/P18.6b%20Cloudflare%20R2%20上线操作手册.md) |
| Web Analytics | [`docs/guides/P20.5 Cloudflare Web Analytics 接入操作指南.md`](../guides/P20.5%20Cloudflare%20Web%20Analytics%20接入操作指南.md) |
| OG  nightly | [`docs/guides/P23.5 OG image 验收指南.md`](../guides/P23.5%20OG%20image%20验收指南.md) |
