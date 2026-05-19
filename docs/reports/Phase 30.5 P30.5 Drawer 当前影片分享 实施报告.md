# Phase 30.5 / P30.5 Drawer 当前影片分享 实施报告

## 1. 任务目标

将 HUD 顶栏 **Today-only** 分享（站点根路径 `/`）迁移为 **Drawer 顶栏** 的当前影片分享；复制与各平台 intent 均指向 `/movie/:id` 深链（保留 `lang` / `theme` / `timeline` 等 query）。

对应计划：[`.cursor/plans/phase_30_routing_sharing.plan.md`](../../.cursor/plans/phase_30_routing_sharing.plan.md) · TODO `p30-drawer-share`（30.5）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| 分享 URL | `buildMovieSharePageUrl(id)` → `origin` + `buildMoviePath(id, location.search)` |
| 逻辑抽取 | `frontend/src/lib/shareLinks.ts`（URL、平台 intent、`movieReleaseYearFromIso`） |
| UI 位置 | Drawer `SheetHeader` 内，与类型/TMDB/IMDb 行 **同级** `mt-4 flex flex-wrap items-center gap-2` |
| HUD | 删除 `ShareMovieTodayButton.tsx`，`App.tsx` 顶栏不再渲染 |
| Email | 移除 |
| Discord | 改为 **复制链接**（与链式图标同 handler），不再打开社区 invite |
| 文案 | 新增 `drawer.sections.share` / `drawer.share.*`（全 locale 同构）；标题为当前影片语义，非 “The Movie Today” |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `frontend/src/lib/shareLinks.ts` | `buildMovieSharePageUrl`、`buildSocialShareUrls`、`movieReleaseYearFromIso` |
| `frontend/src/lib/shareLinks.spec.ts` | 深链 URL 与平台编码单测（2 项） |
| `frontend/src/components/DrawerMovieShare.tsx` | 顶栏图标行：复制、X、Reddit、Discord(复制)、Facebook、Telegram |
| `frontend/src/components/Drawer.tsx` | 顶栏挂载 `DrawerMovieShare` |
| `frontend/src/lib/locales/*.json` + `strings.ts` | `drawer.share` 键与插值 helper |
| 删除 | `frontend/src/hud/ShareMovieTodayButton.tsx` |

分支：`feat/p30.5-drawer-share`。

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/lib/shareLinks.spec.ts src/lib/locales/locales.schema.spec.ts` | **14/14 passed** |
| `npm run build -w frontend` | **通过** |
| `eslint`（Drawer / DrawerMovieShare / shareLinks） | **通过** |
| 人工验收 | 用户 **通过**：顶栏分享行、无 Share 标题、无 Email、Discord 复制链接 |

---

## 5. 风险与后续

| 风险 | 分流 |
| :--- | :--- |
| `drawer.share.ariaDiscord` 等文案仍带旧「社区」语义 | **30.6** 全语言润色与 `aria*` 对齐 |
| `drawer.sections.share` 键未在 UI 展示 | 可保留供 a11y/后续；30.6 可评估是否删除未用键 |
| 链式图标与 Discord 均复制链接（重复 affordance） | 产品可接受；若需合并可后续只保留其一 |
| 深链刷新 / rewrite / 全量验收 | **30.7–30.8** |

**建议下一任务**：30.6 Drawer 分享 i18n 同步，或 30.7 静态 SPA rewrite。
