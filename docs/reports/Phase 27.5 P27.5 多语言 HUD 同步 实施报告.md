# Phase 27.5 — 多语言 HUD 文案同步（实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 27（增长与轻量功能）子项 **P27.5** |
| 计划来源 | [`.cursor/plans/phase_27_growth_light_features.plan.md`](../../.cursor/plans/phase_27_growth_light_features.plan.md) 正文「P27.5 多语言同步」与 todos 中 **`p275-i18n-sync`** |
| 日期 | **2026-05-18** |
| Git | 工作分支 **`phase/p27-5-i18n-sync`**（从 `main` 检出新建；**未**要求本报告撰写时代为提交） |
| 状态 | **验收完成**：各 locale 与 **`en.json`** 结构同构；**未**对 `frontend/src/lib/locales/*.json` 做内容重写（仓库内已满足 P27.5 目标）。 |
| 报告性质 | **工作留档**：记录本阶段**最终决策**、**已执行操作**与**验收证据**。若与历史会话或计划表表述不一致，**以本报告 §2～§4 + 仓库当前文件为准**。 |

**范围说明（与计划对齐）**：P27.5 聚焦 **HUD 运行时文案**（`frontend/src/lib/locales/*.json`，经 [`frontend/src/lib/strings.ts`](../../frontend/src/lib/strings.ts) 导出 **`STRINGS`**）。**根目录 README** 的中英配对（`README.md` / `README.en.md`）属于仓库 **Markdown 多语言策略**，由 **P27.6** 与产品文档收口统筹；**不在**本次 P27.5 强制改写范围内（本次亦**未**触发「同步 README」类用户指令）。

---

## 1. 目标（计划原文要点）

1. 以 **`frontend/src/lib/locales/en.json`** 定稿内容为 **SSOT**（结构与英文基准）。
2. 将 **`zh`**、**`zh-Hant`**、**`ja`**、**`es`**、**`fr`**、**`ar`** 等 bundle 与 `en.json` **键路径与数组长度**对齐，并完成**可本地化叶子**的翻译（保留插值占位与 HTML/组件标签不被破坏）。
3. 若有 schema / 单测，保持通过。

**计划验收口径**：所有 locale **键完整**；UI **不出现**英文 placeholder 或缺 key fallback；**RTL / Arabic** 无**明显**布局破坏（后者以既有 HUD 与 `ar` bundle 为准，本次未改 UI 布局代码）。

---

## 2. 最终决策总表

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **先验收、后改写** | 执行 P27.5 时**优先**运行结构与自动化校验，并对近期功能相关键做**人工抽查**；**仅**在发现缺口时再改 JSON，避免对已对齐内容做无效 diff。 |
| D2 | **本次不对 locale JSON 提交任何改写** | **`locales.schema.spec.ts` 全通过**；与 `en` 完全相同的字符串叶子**数量极少**且无「长英文未译」拷贝；抽查 **The Movie Today 分享**、**person search**、**Info 引导段落** 等已为各语言自然表述 → **判定 P27.5 已在前期迭代中完成**，本阶段**零文件**修改 `*.json`。 |
| D3 | **`en.json` 继续作为唯一结构 SSOT** | 与仓库规则 [`.cursor/rules/sync-doc.mdc`](../../.cursor/rules/sync-doc.mdc) 一致：非 `en` bundle **不得**单独增删键；本次验收确认 **六** 个非英文 bundle 与 `en` **叶子键路径集合一致**。 |
| D4 | **Vitest 须在 `frontend` 工作目录调用** | 在仓库根目录直接 `npx vitest …` 可能未解析到本地 `vitest` 二进制；**门禁命令**统一为：在 **`frontend`** 下 **`npm run test -- src/lib/locales/locales.schema.spec.ts`**。 |
| D5 | **计划表状态与仓库事实对齐** | [`.cursor/plans/phase_27_growth_light_features.plan.md`](../../.cursor/plans/phase_27_growth_light_features.plan.md) 中 **`p275-i18n-sync`** 标记为 **`completed`**，表示 P27.5 **验收闭环**已完成（与「是否产生 JSON diff」解耦）。 |
| D6 | **`strings.ts` 本次无需变更** | 未引入新键形或导出形状变更；类型与运行时仍以现有 `STRINGS` 为准。 |

---

## 3. 已执行操作（按时间顺序）

| 步骤 | 操作 | 结果 |
| --- | --- | --- |
| 1 | **`git checkout -b phase/p27-5-i18n-sync`** | 在 **`main`** 上新建并切换工作分支，满足「先开分支再做事」的协作约定。 |
| 2 | 在 **`frontend`** 目录执行 **`npm run test -- src/lib/locales/locales.schema.spec.ts`** | **12** 项测试 **全部通过**（`vitest` **v4.1.4**）。 |
| 3 | **人工抽查** `grep` / 阅读 `shareTheMovieToday*`、`personSearchNameAriaLabel`、`info.intro` 等片段 | **zh / zh-Hant / ja / es / fr / ar** 均为目标语言表述，**非**英文占位。 |
| 4 | **脚本扫描**（`node` 一次性脚本）：统计各 bundle 与 `en` **字符串叶子值完全相同**的条数，并统计 **长度 &gt; 40** 且仍与 `en` 相同的条数 | **zh**：5 / 113 字符串叶子相同，长相同 **0**；**zh-Hant**：5，0；**ja**：7，0；**es**：10，0；**fr**：13，0；**ar**：7，0。相同项主要为品牌名、产品名、平台名等**预期可一致**片段。 |
| 5 | 更新 **Phase 27 计划** 中 **P27.5** todo **`status`** 为 **`completed`** | 与验收结论一致，便于 phase 看板阅读。 |

**明确未执行的操作**：

- **未**修改 `frontend/src/lib/locales/{zh,zh-Hant,ja,es,fr,ar,en}.json` 内容。
- **未**修改 `frontend/src/lib/strings.ts`。
- **未**新增或调整 RTL 专用样式文件（无新文案导致的布局回归需求）。

---

## 4. 验收证据摘要

| 验收项 | 证据 |
| --- | --- |
| 所有 locale **键路径**与 `en.json` 一致 | `locales.schema.spec.ts` 中 **`%s matches en.json leaf key paths`** 对六 bundle 全部通过。 |
| **`focusVoteReference.tierLabels` 数组长度** | 同文件 **`tier count matches en`** 用例通过。 |
| 无大块「英文未译」残留 | 脚本：**长（&gt;40）与 en 完全相同** 的字符串叶子 **= 0**（各 bundle）。 |
| 社交平台/分享相关 HUD 文案 | 抽查 **`hud.shareTheMovieToday*`**、**`hud.shareTheMovieTodayAria*`** 等多语言已落地。 |
| Person search 无障碍/文案 | 抽查 **`hud.personSearchNameAriaLabel`** 已本地化。 |

---

## 5. 后续建议（非本报告强制范围）

1. **P27.6**：按计划在 **PRD / Design Spec / Tech Spec / README** 等 SSOT 文档中写明 **locale 同步策略**、**Web Share 或复制链接**等产品叙述（若与代码不一致，以代码与 Tech Spec 定稿为准）。
2. 日后若 **`en.json`** 增删键：须 **同 PR** 内同步 **全部** bundle，并再次执行 **`npm run test -- src/lib/locales/locales.schema.spec.ts`**。
3. 若需 **README 中英对齐**，在用户明确触发「同步 / sync / i18n」类指令后，按 **`sync-doc.mdc`** 执行 **`README.md` ↔ `README.en.md`**，与 HUD JSON 流程分离，避免混用范围。

---

## 6. 参考路径

| 路径 | 用途 |
| --- | --- |
| [`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) | HUD 英文 SSOT |
| [`frontend/src/lib/locales/locales.schema.spec.ts`](../../frontend/src/lib/locales/locales.schema.spec.ts) | 键路径与 tier 数组 parity 单测 |
| [`frontend/src/lib/strings.ts`](../../frontend/src/lib/strings.ts) | 运行时 `STRINGS` 导出 |
| [`.cursor/rules/sync-doc.mdc`](../../.cursor/rules/sync-doc.mdc) | Markdown 与 locale 编辑边界、多语言同步触发词 |

---

*本报告由 P27.5 执行与验收过程整理而成，便于审计与 onboarding。*
