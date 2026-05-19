# Phase 30.8 / P30.8 路由分享测试与验收 实施报告

## 1. 任务目标

补充 Phase 30 深链路由、Drawer 分享、locale parity、data/base path 的自动化测试；执行 `test` / `build` 验收；将 URL→store 同步逻辑抽出为可单测模块。

对应计划：[`.cursor/plans/phase_30_routing_sharing.plan.md`](../../.cursor/plans/phase_30_routing_sharing.plan.md) · TODO `p30-tests-acceptance`（30.8）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **T1** | 将 `useRouteController` 内 URL→store 逻辑抽到 `routeControllerSync.ts`，便于 Node 环境 Vitest 覆盖 §5.8 T1–T3 / R4 |
| **T2** | `routeActions` / `shareLinks` / `_redirects` / `galaxyAssetUrls` 用增量 spec 覆盖 T6–T8、T7、P30.7 契约 |
| **T3** | 深链刷新手测仍须在 CF Pages / `wrangler pages dev`；`vite preview` 不作为 R1–R2 依据（继承 P29.6 W6） |
| **T4** | 全量 `npm run lint -w frontend` 仍有 Phase 30 前既有报错；本次改动文件 ESLint 通过 |

契约 SSOT：[`docs/project_docs/Phase 29 发布门槛与技术判定 spec.md`](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) **§5.8**、**§6.6**。

---

## 3. 实现摘要

| 产出物 | 说明 |
| :--- | :--- |
| `frontend/src/lib/routeControllerSync.ts` | `applyParsedRouteToStores`、`runInitialRouteBoot`、`normalizeUnknownRoute`（R1/R2/R4） |
| `frontend/src/lib/routeControllerSync.spec.ts` | §5.8 T1–T3、R1、R4 初始 boot |
| `frontend/src/lib/routeActions.spec.ts`（扩展） | T6 query 保留、T8 重复 push 防护、`replaceRoutePath` |
| `frontend/src/lib/shareLinks.spec.ts`（扩展） | T7 子路径分享 URL、email share |
| `frontend/src/lib/spaRedirects.spec.ts` | `public/_redirects` 契约（不 rewrite `/data` 等） |
| `frontend/src/lib/galaxyAssetUrls.basePath.spec.ts` | T7 `BASE_URL` 下 `resolveTodayJsonUrl` |
| `frontend/src/lib/shareLinks.ts` | `buildMovieSharePageUrl` 可选 `basePath` |
| `frontend/src/lib/useRouteController.ts` | 改为调用 `routeControllerSync`，行为不变 |

既有 `routes.spec.ts`、`locales.schema.spec.ts`、`loadToday.spec.ts` 等未改结构，全部通过。

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -w frontend` | **155/155** 通过 |
| locale + data 子集（plan 30.8 命令） | **37/37** 通过 |
| `npm run build -w frontend` | 通过；`verify-spa-fallback-dist.mjs` **ok** |
| 本次改动文件 `eslint` | 通过 |
| `npm run lint -w frontend`（全量） | **11 个既有错误**（`App.tsx`、`SearchBar.tsx` 等，非本 TODO 引入） |
| CF 生产深链刷新 R1–R8 | **未在本机执行**（文档/构建脚本兜底；建议合并后在 preview 抽测） |
| `vite preview` 深链刷新 | **未使用**（符合 spec §6.2） |

---

## 5. 风险与后续

| 风险 | 缓解 |
| :--- | :--- |
| 仅单测覆盖 store 同步，未 E2E 浏览器 | 30.8 前序 TODO 已手测路由/分享；合并后可在 CF preview 复验 T1–T8 |
| 全量 lint 红灯 | 与 30.8 无关；可另开 chore 修 `react-hooks/set-state-in-effect` 等 |
| 本地 `dist-max-bytes` 警告 | 大包在 `public/data/`；CI 生产用 R2，不影响路由测试逻辑 |

**Phase 30**：计划内 TODO **30.1–30.8 均已完成**。

---

## 6. 已知后续

- **Phase 31**：HUD polish / i18n（见 `phase_31_hud_polish_i18n.plan.md`）
- 可选：在 CF preview 执行 §5.8 T1–T8 + §6.6 R1–R8 手测清单并记入发布说明
