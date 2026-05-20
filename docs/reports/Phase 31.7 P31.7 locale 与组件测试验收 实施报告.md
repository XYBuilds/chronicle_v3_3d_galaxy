# Phase 31.7 — locale parity 与组件测试验收（实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 31（HUD 小体验与 i18n）子项 **P31.7** |
| 计划来源 | [`.cursor/plans/phase_31_hud_polish_i18n.plan.md`](../../.cursor/plans/phase_31_hud_polish_i18n.plan.md) **`p31-tests-acceptance`** |
| 日期 | **2026-05-20** |
| Git | 工作分支 **`feat/p31.7-tests-acceptance`** |
| 状态 | **已验收**（用户 **APPROVED**） |

---

## 1. 目标

为 Phase 31 Drawer 海报状态机与 SearchBar placeholder 补充可回归的单元测试，并执行 locale parity、全量 test、build 验收；不改搜索算法、路由或数据导出。

---

## 2. 关键决策

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | 纯函数抽取，避免引入 RTL 组件测试 | 与仓库惯例一致（`vitest` + `node` 环境）；`drawerPoster.ts`、`searchBarPlaceholder.ts` 供 Drawer/SearchBar 与测试共用。 |
| D2 | 保留既有 `locales.schema.spec.ts` 作为结构 SSOT 门禁 | 另增 `strings.drawerPoster.spec.ts` 断言 `buildStrings` 导出与全 locale `drawer.poster` 叶键。 |
| D3 | Genre tab 不测可见 placeholder | 该 tab 使用 chip UI + `genreMultiEmptyHint`；helper 对 `genre` 仍解析为 `placeholderPerson`（与重构前一致，值未绑定到可见 input）。 |

---

## 3. 实现摘要

| 文件 | 变更 |
| --- | --- |
| `frontend/src/components/drawerPoster.ts` | 新建：初始状态、retry URL、load generation、是否渲染 img |
| `frontend/src/components/drawerPoster.test.ts` | 10 项单元测试 |
| `frontend/src/components/searchBarPlaceholder.ts` | 新建：movie/person/disabled placeholder 选择 |
| `frontend/src/components/searchBarPlaceholder.test.ts` | 4 项 + Phase 31 英文文案断言 |
| `frontend/src/lib/strings.drawerPoster.spec.ts` | 全 `LOCALE_IDS` `drawer.poster` 导出校验 |
| `frontend/src/components/Drawer.tsx` | 接入 `drawerPoster` helpers |
| `frontend/src/components/SearchBar.tsx` | 接入 `getSearchBarTextPlaceholder` |
| `.cursor/plans/phase_31_hud_polish_i18n.plan.md` | `p31-tests-acceptance` → **completed**；Phase 31 全部 TODO 完成 |

**未改**：locale JSON 文案内容（31.5 已同步）、搜索算法、路由/分享。

---

## 4. 验收

| 项 | 结果 |
| --- | --- |
| `npm run test -w frontend -- src/lib/locales/locales.schema.spec.ts` 等 5 文件 | **38 passed** |
| `npm run test -w frontend` | **181 passed**（28 文件） |
| `npm run build -w frontend` | **通过**（`tsc` + `vite`；dist 大文件告警为既有 CI 行为） |
| `npm run lint -w frontend` | **未通过** — 11 个全仓既有 `react-hooks/set-state-in-effect` 等；非本任务引入 |
| 手测矩阵 | 用户 **APPROVED**（未在本报告展开逐项记录） |

---

## 5. 风险与后续

- 全仓 `eslint` 仍失败；若 Phase 35 设 lint 门禁，需单独清理 unrelated 规则违规。
- `DrawerPoster` 未做 DOM 级集成测试；状态机行为由纯函数 + P31.2–31.6 手测/a11y 测试覆盖；若需 E2E 可纳入 Phase 35。
- Phase 31 计划项已全部 **completed**；可进入 Phase 32（SDR 可读性/动效）或按需开 Phase 31 收尾 PR 回顾。
