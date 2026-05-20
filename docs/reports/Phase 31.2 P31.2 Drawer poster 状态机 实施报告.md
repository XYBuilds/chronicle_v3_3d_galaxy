# Phase 31.2 / P31.2 Drawer poster 状态机 实施报告

## 1. 任务目标

在 `DrawerPoster` 中实现 `empty` / `loading` / `loaded` / `failed` / `retrying` 海报加载状态机；切换电影时稳定重置；`onLoad` / `onError` 忽略过期请求；慢网显示非阻塞 loading（`Spinner`）。Retry 按钮与区分文案留给 31.3 / 31.5。

对应计划：[`.cursor/plans/phase_31_hud_polish_i18n.plan.md`](../../.cursor/plans/phase_31_hud_polish_i18n.plan.md) · TODO `p31-poster-state-machine`（31.2）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| 电影切换重置 | 保留父级 `key={\`${movie.id}\|${movie.poster_url}\`}` remount；**不用** `useEffect` 同步 `posterUrl`（避免 `react-hooks/set-state-in-effect`） |
| 竞态防护 | `<img data-load-gen={loadGeneration}>` + `loadGenerationRef`；回调比对 generation |
| Retry cache-bust | `poster_retry={reloadToken}` query；`handleRetry()` 已实现，**31.3 接按钮** |
| 文案 | `empty` / `failed` 暂共用 `drawer.posterPlaceholder`；31.3 再拆 `drawer.poster.*` |
| 范围 | 仅改 `frontend/src/components/Drawer.tsx`；未动 locale、分享、路由 |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `PosterLoadState` | `'empty' \| 'loading' \| 'loaded' \| 'failed' \| 'retrying'` |
| `posterSrcWithReloadToken` | retry 时追加 `poster_retry` query |
| Loading UI | `Spinner` overlay，`pointer-events-none`，`aria-busy` |
| 可测属性 | 根节点 `data-poster-state={state}` |
| 分支 | `feat/p31.2-poster-state-machine` |

**未实施（后续 TODO）**：retry 按钮 UI、空/失败/重试区分文案、locale 同步、组件测试（31.3–31.7）。

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npx eslint frontend/src/components/Drawer.tsx` | 通过 |
| `npm run build -w frontend` | 通过 |
| 手测（用户确认） | **通过** |

---

## 5. 风险与后续

- **31.3**：将 `handleRetry` 接到可聚焦 `<button>`，并区分 `empty` / `failed` / `retrying` 文案。
- **31.5**：若迁移 `drawer.posterPlaceholder` → `drawer.poster.*`，须全 bundle 同构 + `strings.ts`。
- 缓存命中时 `onLoad` 可能极快，loading 闪烁属预期；必要时 31.3 可加最小展示时长（非本任务范围）。
