# Phase 31.6 — Drawer 海报与搜索 a11y / RTL（实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 31（HUD 小体验与 i18n）子项 **P31.6** |
| 计划来源 | [`.cursor/plans/phase_31_hud_polish_i18n.plan.md`](../../.cursor/plans/phase_31_hud_polish_i18n.plan.md) **`p31-accessibility-rtl`** |
| 日期 | **2026-05-20** |
| Git | 工作分支 **`fix/p31.6-accessibility-rtl`** |
| 状态 | **已验收**（用户 **APPROVED**） |

---

## 1. 目标

验证并补强 P31.2–31.5 引入的 Drawer 海报状态机与 SearchBar placeholder 在**键盘**、**读屏**与 **RTL（`ar`）** 下可用，且不破坏既有 Sheet 焦点行为。

---

## 2. 关键决策

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | 海报状态读屏用 **`aria-live="polite"`** 单点播报 | 抽取 `getDrawerPosterStatusMessage`；`loaded` 时不重复播报（由 `img` alt 承担）。 |
| D2 | 加载中图片对 AT **隐藏** | `isDrawerPosterImageAriaHidden`：非 `loaded` 时 `aria-hidden` + 空 `alt`，避免未加载完就朗读海报 alt。 |
| D3 | Spinner **仅视觉** | 遮罩 `pointer-events-none` + `aria-hidden`；不抢 Tab 焦点；容器保留 `aria-busy`。 |
| D4 | SearchBar **`aria-label`** 与 placeholder 同源 | 不新增 locale 键；读屏不单独依赖 placeholder。 |
| D5 | RTL 用逻辑属性 | `text-start`、`border-s`、`ps-*`、`pe-*`、`end-*`、`slide-in-from-start-2`。 |
| D6 | Sheet **`modal={false}`** 未改 | 焦点管理保持 Phase 4.3 / 30 既有行为。 |

---

## 3. 实现摘要

| 文件 | 变更 |
| --- | --- |
| `frontend/src/components/drawerPosterA11y.ts` | 新建：状态 → 读屏文案、图片是否应对 AT 隐藏 |
| `frontend/src/components/drawerPosterA11y.test.ts` | 6 项单元测试 |
| `frontend/src/components/Drawer.tsx` | 接入 live region；Spinner 装饰化；RTL 逻辑类 |
| `frontend/src/components/SearchBar.tsx` | `aria-label`；`pe-9` / `end-1` |
| `.cursor/plans/phase_31_hud_polish_i18n.plan.md` | `p31-accessibility-rtl` → **completed** |

**未改**：locale JSON、`strings.ts`、路由/分享、搜索算法。

---

## 4. 验收

| 项 | 结果 |
| --- | --- |
| `npm run test -- src/components/drawerPosterA11y.test.ts` | **6 passed** |
| `tsc -b`（frontend） | **通过** |
| 全仓 `eslint` | 既有 unrelated 报错（非本任务引入） |
| 手测 | 用户 **APPROVED** |

---

## 5. 风险与后续

- **31.7** 仍待：locale parity 全量跑、`DrawerPoster` 组件级测试、lint/build 门禁。
- 海报失败态可见 `<p>` 与 `aria-live` 在部分读屏上可能重复播报一次；若反馈噪音可再收敛为仅 live region。
