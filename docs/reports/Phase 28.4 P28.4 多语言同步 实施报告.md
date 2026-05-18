# Phase 28.4 — 多语言同步（Ko-fi / Tally / Discord 相关 HUD）（实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 28（反馈、支持与社区）子项 **P28.4** |
| 计划来源 | [`.cursor/plans/phase_28_feedback_support_community.plan.md`](../../.cursor/plans/phase_28_feedback_support_community.plan.md) §「P28.4 多语言同步」 |
| 日期 | 2026-05-18 |
| 状态 | **已验收（无新增 locale  diff）**：相关 HUD 文案在 **`en.json` 为结构 SSOT** 的前提下已与全部 bundle 同构；`locales.schema.spec.ts` 全绿。 |
| 报告性质 | **工作留档**：汇总本阶段**最终决策**与**已执行操作**。若与代码不一致，以仓库当前实现为准。 |

**产品叙述品牌**：正文叙述使用 **The Movie Cosmos**；UI 标识类文案规范见仓库 `branding-name-convention.mdc`。

**范围说明**：本项仅覆盖 **Phase 28 相关 HUD 字符串** 的多语言对齐与结构校验；**不包含** P28.5 的 PRD / Design Spec / Tech Spec / README 文档 SSOT 同步（计划中由 P28.5 收口）。

---

## 1. 目标（与计划对齐）

1. 以 [`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) 为 **结构与英文 SSOT**。
2. 在 P28.1（Ko-fi 支持）、P28.2（Tally 反馈）、P27 已存在的 Discord 分享入口等 **英文定稿** 后，确保其余 bundle（`zh`、`zh-Hant`、`ja`、`es`、`fr`、`ar`）与 `en.json` **叶子键路径一致、数组长度一致**。
3. 不破坏插值占位符与 HTML / 富文本片段规则（仓库 `sync-doc`）。
4. 运行并通过 [`frontend/src/lib/locales/locales.schema.spec.ts`](../../frontend/src/lib/locales/locales.schema.spec.ts)。

---

## 2. 最终决策总表

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **不重复造键** | Phase 28 实施过程中，**支持 / 反馈 / Discord（分享菜单）** 所需键已在 P28.1、P28.2、P27.x 落地时写入 `en.json` 并完成各 bundle 翻译；P28.4 **不再新增**键名，只做 **存量核对 + 自动化校验**。 |
| D2 | **SSOT 仍为 `en.json`** | 所有非英文 bundle 必须与 `en.json` **同构**；新增或删键时仍以 `en.json` 为先（与仓库 `sync-doc` 一致）。 |
| D3 | **Discord 相关文案范围** | 计划修订后 Discord 主入口在 **Tally thank you page**；应用内与 Discord 相关的 **已存在** 本地化项为 HUD「The Movie Today」分享菜单的 **`hud.shareTheMovieTodayAriaDiscord`**（Phase 27 路径），纳入 P28.4 **同构检查**，不要求新增「Discord 独立区块」文案。 |
| D4 | **Info 面板与 Tally 长说明** | 计划 P28.2 曾建议 Info 或反馈旁 **一两句** Tally 数据流向说明；当前 **`info.sections` 未增加**专门段落，故 P28.4 **无**对应新增 locale 键；若后续在 P28.5 或产品决策中写入 `en.json`，须再按 `sync-doc` 全 bundle 同步。 |
| D5 | **RTL** | 计划验收提及 `ar` RTL；本项未改布局代码，依赖既有 HUD 与工具条布局；P28.4 结论为 **字符串层无缺口**，未单独做 RTL 视觉回归（可作为后续手工抽检项）。 |
| D6 | **Git 工作流** | P28.4 执行时在仓库中 **新建分支** `phase28/p284-i18n-sync` 用于承载计划文件状态更新（见 §4）；**未**要求必须提交 commit（由维护者按需合并）。 |

---

## 3. 涉及键与代码引用（验收清单）

| 能力 | Locale 键 | 前端引用（摘要） |
| --- | --- | --- |
| Ko-fi / 支持入口 | `hud.openSupport` | [`frontend/src/hud/SupportButton.tsx`](../../frontend/src/hud/SupportButton.tsx) — `aria-label` / `title` / 可见文案 |
| Tally 反馈入口 | `hud.openFeedback` | [`frontend/src/hud/FeedbackButton.tsx`](../../frontend/src/hud/FeedbackButton.tsx) |
| Discord（今日分享） | `hud.shareTheMovieTodayAriaDiscord` | 分享下拉相关组件（与 P27「The Movie Today」一致） |

上述键在 **`en.json` 与 `zh.json`、`zh-Hant.json`、`ja.json`、`es.json`、`fr.json`、`ar.json`** 中均已存在且语义为各语言本地化版本（非英文文件内为翻译或等价表述）。

---

## 4. 已执行操作（本次实施）

| 操作 | 说明 |
| --- | --- |
| **新建 Git 分支** | `git checkout -b phase28/p284-i18n-sync`（从当时 `main` 分出）。 |
| **静态核对** | 对 `openSupport`、`openFeedback`、`shareTheMovieTodayAriaDiscord` 等关键词在各 locale 目录下检索，确认无缺失键。 |
| **自动化校验** | 在 `frontend` 目录执行：`npx vitest run src/lib/locales/locales.schema.spec.ts` — **12 项测试全部通过**（各 bundle 与 `en.json` 叶子路径一致，`focusVoteReference.tierLabels` 数组长度一致）。 |
| **计划跟踪更新** | 将 [`.cursor/plans/phase_28_feedback_support_community.plan.md`](../../.cursor/plans/phase_28_feedback_support_community.plan.md) 中 todo **`p284-i18n-sync`** 的 `status` 从 `pending` 改为 **`completed`**。 |
| **locale JSON 内容** | **本次未修改**任何 `frontend/src/lib/locales/*.json` 正文（前置任务已完成同步）。 |

---

## 5. 结论与后续建议

- **结论**：P28.4 验收标准（全 bundle 与 `en.json` 同构 + `locales.schema.spec.ts` 通过）**已满足**；本次为 **确认型收口**，无额外翻译 diff。
- **建议**：若在 P28.5 或后续迭代中为 Info 或 HUD 增加 **Tally / Ko-fi 数据与隐私** 长文案，先在 `en.json` 定稿并补全键，再一次性同步其余 bundle 并复跑同一 Vitest 文件。

---

## 6. 参考文档与关联报告

| 文档 | 用途 |
| --- | --- |
| [`.cursor/rules/sync-doc.mdc`](../../.cursor/rules/sync-doc.mdc) | locale 与 Markdown 同步边界、SSOT 规则 |
| [`docs/reports/Phase 28.2 P28.2 Tally 用户反馈 HUD 最终实施报告.md`](./Phase%2028.2%20P28.2%20Tally%20用户反馈%20HUD%20最终实施报告.md) | Tally HUD 与 `openFeedback` 落地说明 |
| [`docs/reports/Phase 28.3 P28.3 Discord 与 Tally Thank You Page 集成 实施报告.md`](./Phase%2028.3%20P28.3%20Discord%20与%20Tally%20Thank%20You%20Page%20集成%20实施报告.md) | Discord 入口策略（Tally 感谢页） |
