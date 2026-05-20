# Phase 31.3 / P31.3 Drawer poster 失败与重试 UI 实施报告

## 1. 任务目标

为 `DrawerPoster` 的 `empty`、`failed`、`retrying` 提供可区分 UI 与文案；失败态提供可聚焦 Retry 按钮（cache-bust 重载）；迁移 `drawer.poster.*` locale 并同步 `strings.ts`；补充 Storybook 验收 story。

对应计划：[`.cursor/plans/phase_31_hud_polish_i18n.plan.md`](../../.cursor/plans/phase_31_hud_polish_i18n.plan.md) · TODO `p31-poster-retry-ui`（31.3）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| 文案命名空间 | 一次性将 `drawer.posterPlaceholder` 迁移为嵌套 `drawer.poster.*`（6 键），全 8 个 locale 同构 |
| empty vs failed | `empty` 仅文案面板；`failed` 面板 + Retry（`buttonVariants` secondary） |
| loading / retrying | 沿用 31.2 `Spinner`；`aria-label` 区分 `poster.loading` / `poster.retrying` |
| i18n 范围 | 31.3 已落地全 bundle 结构同步（31.5 仍可做 search placeholder 等其余键） |
| 验收辅助 | Storybook 新增 `BadPoster`（坏 URL）；既有 `NoPoster`（空 URL） |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `DrawerPosterStatusPanel` | 空/失败态消息区；失败态可插 Retry 按钮 |
| `handleRetry` | 接线 UI；递增 `reloadToken` + load generation |
| `drawer.poster.*` | `placeholder`、`loading`、`empty`、`failed`、`retry`、`retrying` |
| `strings.ts` | `poster: raw.drawer.poster`（移除 `posterPlaceholder`） |
| `Drawer.stories.tsx` | `BadPoster` story |
| 分支 | `feat/p31.3-poster-retry-ui` |

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/lib/locales/locales.schema.spec.ts` | 12/12 通过 |
| `npm run build -w frontend` | 通过 |
| Storybook / 手测（用户确认） | **通过** |

---

## 5. 风险与后续

- **31.4**：搜索 placeholder 文案（未改 `searchBar.*`）。
- **31.5**：本任务已迁移 `drawer.poster.*`；31.5 重点为其余 Phase 31 文案与 `strings.ts` 复核。
- **31.6–31.7**：RTL/键盘全量验证与 `DrawerPoster` 组件测试可补。
- `drawer.poster.placeholder` 已入 bundle，当前 UI 未引用（保留兼容/后续用途）。
