# Phase 30.6 / P30.6 Drawer 分享 i18n 同步 实施报告

## 1. 任务目标

在 P30.5 已落地 `drawer.share.*` 结构的前提下，完成 Drawer 影片分享相关 **全 locale 同构**、`strings.ts` 导出对齐，并清理已废弃的 HUD「The Movie Today」分享文案；修正分享控件与 `aria*` 键的绑定。

对应计划：[`.cursor/plans/phase_30_routing_sharing.plan.md`](../../.cursor/plans/phase_30_routing_sharing.plan.md) · TODO `p30-i18n-share`（30.6）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| 结构 SSOT | `frontend/src/lib/locales/en.json`；8 个 bundle 叶子键与数组长度与 `en` 一致 |
| 废弃键 | 删除全部 `hud.shareTheMovieToday*`（`ShareMovieTodayButton` 已移除，无运行时引用） |
| `strings.ts` | `hud` 改为 `raw.hud`；保留 `drawer.share.title` / `text` 插值 helper |
| Discord | 恢复 **社区链接**（`discordCommunityHref` + `ariaDiscord`），不再误用 `ariaCopyLink` |
| Email | 恢复 **mailto** 入口（`buildEmailShareUrl` + `ariaEmail`），与 P27 HUD 平台集一致 |
| `drawer.sections.share` | 保留于 locale（供后续区块标题/a11y）；当前顶栏图标行仍用 `drawer.share.label` 作组 `aria-label` |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `frontend/src/lib/locales/*.json`（×8） | 移除 11 个 `hud.shareTheMovieToday*` 键；`drawer.share.*` 与 `drawer.sections.share` 保持同构 |
| `frontend/src/lib/strings.ts` | 去掉 `shareTheMovieTodayTitle` / `Text` 包装；`drawer.share` 插值不变 |
| `frontend/src/lib/shareLinks.ts` | 新增 `discordCommunityHref`、`buildEmailShareUrl` |
| `frontend/src/components/DrawerMovieShare.tsx` | 平台顺序：复制 → X → Reddit → Discord → Facebook → Mail → Telegram；各 `aria*` 与行为一致 |

分支：`feat/p30.6-i18n-share`。

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/lib/locales/locales.schema.spec.ts` | **12/12 passed** |
| `npm run test -w frontend -- src/lib/shareLinks.spec.ts` | **2/2 passed** |
| 变更文件 `eslint` | **通过**（全仓 lint 仍有 unrelated 历史项） |
| 人工验收 | 用户 **通过** |

---

## 5. 风险与后续

| 风险 | 分流 |
| :--- | :--- |
| `drawer.sections.share` 未在 Drawer 正文区展示标题 | 可选在 30.8 或 Phase 31 HUD 抛光时补可见「Share」小标题 |
| 深链刷新 / SPA rewrite | **30.7** |
| 路由、分享、locale 全量验收 | **30.8** |

**建议下一任务**：30.7 静态部署 `_redirects` 与 GHP `404.html`。
