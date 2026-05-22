# Phase 34.6 / P34.6 分享 `?lang=` 与 apex OG meta 实施报告

## 1. 任务目标

主仓前端与静态 HTML 完成 Phase 34 社交预览切换的最后一环：

- Drawer 影片分享 URL **显式**附带 `?lang=`（来自 `localeStore`，仅影响 SPA / intent 文案，**不**进入 OG PNG `v`）。
- `index.html` 弃用 `/data/og-today.png`；apex `/` 静态 meta 的 `og:image` 指向 Worker 品牌图。
- 移除 Vite `ogTodayImageCacheBustPlugin`（`v` 由 Worker URL 承担）。

对应计划：[`.cursor/plans/phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) · TODO `p34-frontend-share-lang`（34.6）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| `lang` 来源 | `useLocaleStore((s) => s.locale)`；分享时 `params.set('lang', lang)` 覆盖 URL 中已有 `lang` |
| 其它 query | 保留 `location.search` 中非 `lang` 参数（如 `theme`） |
| apex `og:image` | `https://themoviecosmos.com/og/brand.png?v=og-brand-og-v1`（与 Worker `LAYOUT_VERSION=og-v1` 一致） |
| `/movie/*`、`/today` | 仍由 34.5 Worker HTML 注入覆盖 meta；本任务只改静态 shell 与分享链接 |
| `ogTodayImageCacheBustPlugin` | **移除**（不再读 `today.json.date` / `VITE_OG_TODAY_V`） |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `frontend/src/lib/shareLinks.ts` | `buildMovieSharePageUrl(movieId, lang, loc?, options?)` |
| `frontend/src/components/DrawerMovieShare.tsx` | `locale` + `useMemo(..., [movieId, locale])` |
| `frontend/index.html` | brand OG URL；描述与 Worker `SHORT_OG_DESCRIPTION` 对齐 |
| `frontend/vite.config.ts` | 删除 `ogTodayImageCacheBustPlugin` 及相关 `fs` 读取 |
| `frontend/public/_headers` | 删除 `/data/og-today.png` 规则 |
| `frontend/src/lib/shareLinks.spec.ts` | 新增/更新 `lang` 与 base path 用例 |

分支：`feat/p34.6-frontend-share-lang`。

---

## 4. 验证

```text
cd frontend && npx vitest run src/lib/shareLinks.spec.ts
→ 5 passed

npm run lint -w frontend
→ OK

npm run build -w frontend
→ OK；dist/index.html 含 og/brand.png?v=og-brand-og-v1，无 og-today 引用
```

计划 §34.2 检查清单：Pages meta / Vite cache-bust 两项已勾选。

---

## 5. 已知风险与后续

| 风险 / 跟进 | 说明 |
| :--- | :--- |
| 部署后 apex `/` 预览 | Facebook Debugger 可能对 apex 重抓；深链 `/movie`、`/today` 已由 Worker 注入 |
| README / Tech Spec 仍述 `og-today` | **34.7** 合规与文档扫尾，或 34.9 验收时同步 |
| 平台抽样 | **34.8** X / Facebook / Telegram / Discord |

**建议下一任务**：**34.7** TMDB 站点 attribution。
