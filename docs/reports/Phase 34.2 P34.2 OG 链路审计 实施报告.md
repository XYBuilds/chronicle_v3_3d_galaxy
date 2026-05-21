# Phase 34.2 / P34.2 OG 链路审计 实施报告

## 1. 任务目标

审计现有 today OG 生成链路、HTML meta、cache-bust 与部署产物，为 34.3 策略决策与 34.4+ 强化提供事实基线。

对应计划：[`.cursor/plans/phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) · TODO `p34-og-current-audit`（34.2）。

---

## 2. 关键结论

| 路径 | 预览图 | title / description / og:url |
| :--- | :--- | :--- |
| `/today` | 当日 `og-today.png`（正确 pick 语义） | 品牌通用；**`og:url` 指向 apex `/` 而非 `/today`** |
| `/movie/:id` | **同为当日 Today 卡片**（非所分享电影） | 品牌通用文案 |

**管线**：`render_og_today.py` → nightly/monthly → R2 + Pages bundle；Vite 构建注入 `?v=<today.json.date>`；`_headers` PNG TTL 300s；CI 顺序为先 cron 再 `npm run build`。

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| 计划 §34.2 | 审计表、`/today` 与 `/movie/:id` 结论、每日更新资源清单、34.3+ 建议输入 |
| TODO `p34-og-current-audit` | **completed** |
| 分支 | `feat/p34.2-og-current-audit` |

**未实施（归属后续 TODO）**：meta 路由化、movie 共用品牌 OG 图、平台 scrape 验证、部署文档化（34.3–34.8）。

---

## 4. 验证

| 命令 | 结果 |
| :--- | :--- |
| `python scripts/cron/render_og_today.py --help` | 通过 |
| `npm run build -w frontend` | 通过；`og-today-image-cache-bust` v=2026-05-08；`spa-fallback-dist` ok |
| `today.json` ↔ `galaxy_data.json` | `movie_id=301334`（*Una*）存在 |

---

## 5. 风险与后续

- **Movie 深链**：分享 `/movie/:id` 时预览图可能显示当日另一部电影 → 34.3/34.5 需选定品牌静态 OG 或动态/有限集合方案。
- **GHP `deploy-pages.yml`**：push main 不跑 OG 渲染，灰度路径可能缺新 PNG。
- **manifest 日期**：仓库 `galaxy_assets_manifest.json`（2026-05-10）与 `today.json`（2026-05-08）不同步，仅影响 manifest URL，不影响 build meta。
