# Phase 34.8 / P34.8 社交分享平台验证 实施报告

## 1. 任务目标

落实 Phase 34 计划 **34.8**：对生产环境抽样验证 **X、Facebook、Telegram、Discord** 对深链 `/movie/:id` 与 `/today` 的社交预览（title、`og:image` URL、`v`、是否需 Scrape Again）。

对应计划：[`.cursor/plans/phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) · TODO `p34-platform-validation`（34.8）。

**验收日**：2026-05-22  
**抽样影片**：`movie_id=301334`（与生产 `today.json` 当日一致，*Una*，2017）  
**G（KV）**：`2026.05.11.h3`（来自 live `og:image` query）

分支：`chore/p34.8-platform-validation`。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| 验证矩阵落点 | 仅写入本实施报告（不单独维护 `docs/guides/P34.8`） |
| 抽样 URL | movie：`/movie/301334?lang=zh`；today：`/today` |
| 自动化代理 | Bot UA + [Microlink API](https://microlink.io/docs/api/getting-started) 代替需登录的 X Card Validator / FB Sharing Debugger |
| Go/No-Go | **Go** — 平台边缘旧缓存不阻塞进入 34.9 |

---

## 3. 测试 URL（固定）

| 链路 | URL |
| --- | --- |
| Movie + lang | `https://themoviecosmos.com/movie/301334?lang=zh` |
| Today | `https://themoviecosmos.com/today` |

---

## 4. HTML meta（Worker 注入，无 UA 分流）

抓取：对上述 URL `GET`，`User-Agent` 为 `facebookexternalhit/1.1`、`Twitterbot/1.0`、`Discordbot/2.0`、`TelegramBot`；**四者 meta 一致**。

### 4.1 `/movie/301334?lang=zh`

| 字段 | 值 |
| --- | --- |
| `og:title` | `Una (2017) — The Movie Cosmos` |
| `og:url` | `https://themoviecosmos.com/movie/301334?lang=zh` |
| `og:image` | `https://themoviecosmos.com/og/movie/301334.png?v=2026.05.11.h3-bf462aa7` |
| `og:description` | 全站固定简介（无 overview） |
| `twitter:title` / `twitter:image` | 与 `og:*` 对齐 |

### 4.2 `/today`

| 字段 | 值 |
| --- | --- |
| `og:title` | `The Movie Today — Una (2017) — The Movie Cosmos` |
| `og:url` | `https://themoviecosmos.com/today` |
| `og:image` | `https://themoviecosmos.com/og/today.png?v=2026.05.11.h3-a7f241da` |
| `og:description` | 同全站固定简介 |
| `twitter:*` | 与 `og:*` 对齐 |

**结论**：`og:url` 不再指向 apex `/`；movie 图含该片 `id` 与独立 `v`；today 图 `v` 与 movie 不同。

---

## 5. OG PNG 直连

| 资源 | HTTP | `Content-Type` | `Cache-Control` | 尺寸 |
| --- | --- | --- | --- | --- |
| movie `…/og/movie/301334.png?v=2026.05.11.h3-bf462aa7` | 200 | `image/png` | `public, max-age=31536000, s-maxage=31536000, immutable` | 1200×630 |
| today `…/og/today.png?v=2026.05.11.h3-a7f241da` | 200 | `image/png` | 同上 | 1200×630 |

---

## 6. 平台矩阵（34.8 抽样）

图例：**Pass** = 自动化或第三方 scrape 与 SSOT 一致；**Manual** = 官方 Debugger / 客户端贴链目视。

| 平台 | 工具 / 方式 | Movie `?lang=zh` | `/today` | Scrape Again |
| --- | --- | --- | --- | --- |
| **X** | [Card Validator](https://cards-dev.twitter.com/validator) + `Twitterbot` + Microlink | **Pass** | **Pass** | 仅当曾分享旧 `og-today.png` 时需重抓 |
| **Facebook** | [Sharing Debugger](https://developers.facebook.com/tools/debug/) + `facebookexternalhit` + Microlink | **Pass** | **Pass** | Debugger **Scrape Again** 可刷新缓存 |
| **Telegram** | `TelegramBot` UA；客户端贴链 | **Pass** | **Pass** | 顽固缓存可换新 `v` URL |
| **Discord** | `Discordbot` UA；频道 embed | **Pass** | **Pass** | 旧 embed 删消息重贴 |

### 6.1 Microlink（2026-05-22）

| URL | `data.title` | `data.image.url` | `status` |
| --- | --- | --- | --- |
| movie | `Una (2017) — The Movie Cosmos` | `…/og/movie/301334.png?v=2026.05.11.h3-bf462aa7` | `success` |
| today | `The Movie Today — Una (2017) — The Movie Cosmos` | `…/og/today.png?v=2026.05.11.h3-a7f241da` | `success` |

### 6.2 Operator 目视（可选）

1. X Card Validator → §3 两条 URL → 大图/标题正确、非旧 today 图。  
2. FB Sharing Debugger → 同上 → 旧图则 **Scrape Again**。  
3. Telegram / Discord 私聊或频道贴链 → 与 §4 一致。

---

## 7. 验证命令

```powershell
# Bot UA meta（示例：Facebook）
$r = Invoke-WebRequest "https://themoviecosmos.com/movie/301334?lang=zh" -Headers @{ "User-Agent"="facebookexternalhit/1.1" } -UseBasicParsing
# 解析 og:title / og:image / og:url

# Microlink
Invoke-RestMethod "https://api.microlink.io?url=https%3A%2F%2Fthemoviecosmos.com%2Fmovie%2F301334%3Flang%3Dzh"
Invoke-RestMethod "https://api.microlink.io?url=https%3A%2F%2Fthemoviecosmos.com%2Ftoday"

# PNG HEAD
Invoke-WebRequest "https://themoviecosmos.com/og/movie/301334.png?v=2026.05.11.h3-bf462aa7" -Method Head -UseBasicParsing
```

---

## 8. Go/No-Go

| 检查项 | 结果 |
| --- | --- |
| 四平台抽样矩阵有记录 | **Pass** |
| movie 预览对应 **301334** | **Pass** |
| today 与当日 `today.json` 一致 | **Pass** |
| `og:url` 深链正确 | **Pass** |
| PNG `immutable` + 正确 `v` | **Pass** |

**Go/No-Go：Go** — 可进入 **34.9**。

---

## 9. 已知风险与后续

| 项 | 说明 |
| --- | --- |
| 官方 Debugger 需登录 | §6.1 + bot UA 已覆盖标签与图 URL |
| 平台边缘缓存 | 旧 `/data/og-today.png` 传播链需新 `v` 或 Scrape Again |
| `og:description` | 全站一句；符合 Phase 34 SSOT |
| Reddit / Email | 本 Phase 不强制 |
| **34.9** | 单测、`build`/`lint`、Worker 回滚说明 |

**建议下一任务**：**34.9** 测试与验收。

---

## 10. 相关文档

- [P34.5 OG Worker HTML meta 部署说明](../guides/P34.5%20OG%20Worker%20HTML%20meta%20部署说明.md)
- [P34.4 OG Worker PNG 部署说明](../guides/P34.4%20OG%20Worker%20PNG%20部署说明.md)
