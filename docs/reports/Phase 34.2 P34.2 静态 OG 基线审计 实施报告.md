# Phase 34.2 / P34.2 静态 OG 基线审计 实施报告

## 1. 任务目标

在 Phase 34 Worker 动态 OG 切换前，对现有静态社交预览链路做 **只读基线审计**：`render_og_today`、nightly/R2 发布、`index.html` meta、Vite cache-bust、Pages `_headers`；输出爬虫视角下 `/` vs `/today` vs `/movie/:id` 的 meta 差异，以及日更资源 → KV + Worker `v` 的对照表，供 34.3+ 实施。

对应计划：[`.cursor/plans/phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) · TODO `p34-og-baseline-audit`（34.2）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| 审计范围 | **只读**；不修改 nightly 管线或前端 meta |
| 实施报告 | 用户验收后写入本文件（非审计过程中） |
| 核心缺陷确认 | `/movie/:id` 分享链接与 **全站共用** `og-today.png` + apex `og:url` → 预览与影片错位 |
| cache-bust | HTML 使用 `?v=YYYY-MM-DD`（`today.json.date`）；**非** per-movie / 非 `G-M` |
| Go/No-Go | **Go** — 可进入 34.3（KV 索引）与 Worker 准备 |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `.cursor/plans/phase_34_social_preview_distribution.plan.md` | 新增 §34.2 基线审计实施（管线表、爬虫矩阵、KV 映射、34.3 检查清单）；`p34-og-baseline-audit` → `completed` |
| 分支 | `chore/p34.2-og-baseline-audit` |

**未实施（归属后续 TODO）**：KV bulk、Worker `/og/*`、HTML meta 注入、移除 `render_og_today`、`?lang=` 分享。

---

## 4. 管线基线（当前 SSOT）

| 环节 | 路径 / 行为 |
| :--- | :--- |
| 选片 | `pick_movie_today.py` → `frontend/public/data/today.json`（`date`, `movie_id`, …） |
| 画图 | `render_og_today.py` → `frontend/public/data/og-today.png`（1200×630；原子写入；海报失败保留旧 PNG） |
| 调用 | `nightly_vote_refresh.py` / `monthly_refit.py`：`write_today_json` → `render_og_today_after_galaxy_export`（失败 WARN） |
| R2 | `upload_galaxy_r2.py`：上传 `galaxy/og-today.png`，`max-age=300`；manifest `og_today_url` 带 `?v={date}` |
| Pages | `_maybe_prune` **保留** `og-today.png` 于 bundle |
| 入仓 | `.gitignore` 忽略 PNG；CI artifact 仍含 `og-today.png` |
| 构建 | `ogTodayImageCacheBustPlugin`：`index.html` 内 image URL → `?v={today.json.date}` |

**渲染消费的 galaxy 字段**：`title`, `genres`, `release_date`, `poster_url`（导出 `w780`，见 `export_galaxy_json.py` `POSTER_BASE`）。

**本地抽样**：`today.json` → `date=2026-05-08`, `movie_id=301334`；`npm run build -w frontend` 日志 `[og-today-image-cache-bust] v=2026-05-08`。

---

## 5. 爬虫视角（切换前）

Pages SPA 各路径回 **同一份** `index.html` head；**无** 按路径 / UA 注入。

| URL | `og:title` | `og:url` | `og:image` | 一致性 |
| :--- | :--- | :--- | :--- | :--- |
| `/` | The Movie Cosmos | `https://themoviecosmos.com/` | `.../og-today.png?v={date}` | 与 today 卡一致 |
| `/today` | 同上 | **同上（apex `/`）** | 同上 today 图 | SPA 正确；**`og:url` 应为 `/today`** |
| `/movie/:id` | 同上 | **同上** | **today 另一部片** | **严重错位**（Phase 34 主因） |

Drawer 已分享 `/movie/:id`（`buildMovieSharePageUrl`），但 head meta 仍为全站 today。

---

## 6. 资源 → Phase 34 映射

| 现状 | 更新节奏 | 34.3+ 目标 |
| :--- | :--- | :--- |
| `meta.version` | export | KV `meta:G` |
| `today.json` | nightly | KV `today` |
| `movies[]` OG 字段 | export | KV `movie:{id}` |
| `og-today.png` + manifest `og_today_url` | nightly | **移除** → Worker `/og/today.png`、`/og/movie/{id}.png`，`v={G}-{M}` |
| HTML `?v=YYYY-MM-DD` | 每次 build | 由 Worker URL 承担；评估移除 Vite 插件（34.6） |
| `render_og_today` 调用 | nightly + monthly | **删除**（34.3） |

---

## 7. 验证

| 项 | 结果 |
| :--- | :--- |
| 代码与配置只读审计 | `render_og_today.py`, `upload_galaxy_r2.py`, `index.html`, `vite.config.ts`, `_headers`, workflows |
| `npm run build -w frontend` | 通过；dist `og:image` 含 `?v=2026-05-08` |
| 计划 §34.2 检查清单 | 已写入计划文件 §E |

---

## 8. 风险与后续

| 风险 / 缺口 | 缓解 / 归属 |
| :--- | :--- |
| `/movie` 预览错位 | 34.5 HTML 注入 + 34.4 Worker PNG |
| 平台缓存旧 `og-today` URL | 新 `v=G-M` + immutable；34.8 抽样 |
| KV / Worker 未建 | **34.3**、**34.4** |
| `?lang=` 未进分享 URL | **34.6** |

**建议下一任务**：34.3（`og_index` → KV + 移除 `render_og_today` 调用）。
