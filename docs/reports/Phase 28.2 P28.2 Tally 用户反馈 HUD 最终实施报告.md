# Phase 28.2 — Tally 用户反馈（HUD 入口）（最终实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 28（反馈、支持与社区）子项 **P28.2** |
| 计划来源 | [`.cursor/plans/phase_28_feedback_support_community.plan.md`](../../.cursor/plans/phase_28_feedback_support_community.plan.md) §「P28.2 Tally 用户反馈」 |
| 日期 | 2026-05-13 |
| 状态 | **已落地**：主 HUD 右上工具条提供 **Tally 弹层反馈**；表单标识可构建期配置；与 WebGL 主线程无阻塞式耦合（异步脚本 + `loadEmbeds`）。 |
| 报告性质 | **工作留档**：汇总本阶段**最终决策**与**已执行操作**。若与代码不一致，以仓库当前实现为准。 |

**产品叙述品牌**：正文叙述使用 **The Movie Cosmos**；浏览器标题等 UI 标识规范见仓库 `branding-name-convention.mdc`。

**范围说明**：本阶段实现 **HUD 内反馈入口 + 前端配置与 i18n 键**；**不**包含 Phase 28 计划中 Donate（P28.1）、Discord（P28.3）、全量文档 SSOT（P28.5）及 Info 正文内「Tally 数据流向」长说明（可在 P28.5 与 Info 区块一并收口）。

---

## 1. 目标（与计划对齐）

1. 使用 **Tally** 作为第三方表单，收集功能建议、问题与主观体验等反馈。
2. 交互形态：**弹层 modal**（非整页跳转），降低对 **Three.js / WebGL** 主线程的干扰；脚本按需加载。
3. **可配置**：生产可通过环境变量切换表单 key，**不把** webhook 或私密凭据写入仓库。
4. 未配置或显式关闭时：**不渲染**反馈按钮，避免「空壳入口」。
5. 计划中的「外链 / iframe / CSP」权衡：当前选型为 **官方 `embed.js` + `data-tally-*` 按钮**，由 Tally 托管弹层；仓库内 **无** 自建 CSP 例外清单变更（若宿主平台另有 CSP，由部署环境单独评估）。

---

## 2. 最终决策总表

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **入口位置** | 主界面右上固定工具条（`--z-hud-top-tools`）；在组内顺序为 **Feedback → Info → 语言 → 全屏**（反馈在**最左**，紧邻 Info）。 |
| D2 | **控件形态** | **图标 + 文案**（Lucide `MessageSquareText` + `STRINGS.hud.openFeedback`），高度与相邻 `size-10` 图标钮对齐（`h-10` + `size="sm"`），`whitespace-nowrap`。 |
| D3 | **视觉与代码复用** | 与 Info / 语言 / 全屏共用 **HUD 玻璃边**样式，抽至 [`frontend/src/hud/hudTopToolButtonChrome.ts`](../../frontend/src/hud/hudTopToolButtonChrome.ts) 的 `hudTopToolButtonChrome(styleMode)`，避免四处复制 Tailwind。 |
| D4 | **表单标识来源** | `data-tally-open` 对应值来自 **`getTallyFeedbackFormId()`**：默认常量 **`pbRpey`**；可被 **`VITE_TALLY_FEEDBACK_FORM_ID`** 覆盖；`''` / `0` / `false`（trim 后语义）→ **不展示**按钮。 |
| D5 | **脚本加载策略** | 运行时向 `document.body` **单次**注入 `https://tally.so/widgets/embed.js`（幂等；已有 `Tally` 或已加载则短路）。 |
| D6 | **SPA 绑定** | React 挂载后调用 **`window.Tally?.loadEmbeds?.()`**（`refreshTallyEmbeds`），确保后插入的带 `data-tally-open` 的按钮能被 Tally 扫描绑定。 |
| D7 | **Tally 展示参数（当前定稿）** | `data-tally-layout="modal"`、`data-tally-width="640"`、`data-tally-emoji-text="💭"`、`data-tally-emoji-animation="head-shake"`、`data-tally-auto-close="3000"`。 |
| D8 | **i18n** | 新增 **`hud.openFeedback`**，以 [`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) 为结构 SSOT，与其余 bundle **同构**；校验依赖 `locales.schema.spec.ts`。 |
| D9 | **Button 语义** | 使用设计系统 `Button` 的 **`variant="secondary"`** + 玻璃覆盖 class，与同组钮一致；`aria-label` / `title` 与可见文案一致。 |

---

## 3. 配置与数据属性（SSOT）

### 3.1 环境变量

| 变量 | 作用 |
| --- | --- |
| `VITE_TALLY_FEEDBACK_FORM_ID` | 非空：作为 `data-tally-open`；**未设置**：使用代码内默认 `pbRpey`；**空串 / `0` / `false`**：隐藏反馈按钮。 |

声明位置：[`frontend/src/vite-env.d.ts`](../../frontend/src/vite-env.d.ts)。

### 3.2 默认表单 key

定义于 [`frontend/src/lib/tallyFeedback.ts`](../../frontend/src/lib/tallyFeedback.ts) 常量 **`DEFAULT_FORM_ID`**（当前为 **`pbRpey`**）。更换表单时优先改环境变量或该常量（二选一策略：**生产推荐 env**）。

### 3.3 前端模块职责

| 符号 | 职责 |
| --- | --- |
| `getTallyFeedbackFormId()` | 解析 env / 默认 / 关闭语义。 |
| `ensureTallyEmbedScript()` | 注入 `embed.js`、处理已存在 script 与 `onload` / `onerror`。 |
| `refreshTallyEmbeds()` | 封装 `Tally.loadEmbeds()`。 |

---

## 4. 工程操作（修改路径一览）

| 路径 | 操作摘要 |
| --- | --- |
| [`frontend/src/lib/tallyFeedback.ts`](../../frontend/src/lib/tallyFeedback.ts) | **新建**：默认 form id、env 解析、`ensureTallyEmbedScript`、`refreshTallyEmbeds`；`Window.Tally` 类型扩充。 |
| [`frontend/src/hud/FeedbackButton.tsx`](../../frontend/src/hud/FeedbackButton.tsx) | **新建**：挂载 effect、Tally `data-*`、图标+文案、`hudTopToolButtonChrome`。 |
| [`frontend/src/hud/hudTopToolButtonChrome.ts`](../../frontend/src/hud/hudTopToolButtonChrome.ts) | **新建**：抽取右上 HUD 钮共用玻璃/outline class；导出 `HudButtonStyleMode`。 |
| [`frontend/src/hud/InfoButton.tsx`](../../frontend/src/hud/InfoButton.tsx) | 使用 `hudTopToolButtonChrome`，删除重复 class 块。 |
| [`frontend/src/hud/FullscreenButton.tsx`](../../frontend/src/hud/FullscreenButton.tsx) | 同上。 |
| [`frontend/src/hud/LanguageSwitch.tsx`](../../frontend/src/hud/LanguageSwitch.tsx) | 同上；保留菜单 **`open`** 态额外 ring 逻辑。 |
| [`frontend/src/App.tsx`](../../frontend/src/App.tsx) | 引入 `FeedbackButton`；工具条顺序 **Feedback 最左**。 |
| [`frontend/src/vite-env.d.ts`](../../frontend/src/vite-env.d.ts) | 增加 `VITE_TALLY_FEEDBACK_FORM_ID`。 |
| [`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) 等 **全部 bundle** | 增加 **`hud.openFeedback`**（与各语言文案）。 |

**Git**：建议在分支 **`feat/p28-2-tally-feedback-hud`**（或已合并等价历史）上查阅首次提交；后续迭代（如 `head-shake`、`auto-close`）以 `git log` 为准。

---

## 5. 验证与回归

| 项 | 命令 / 说明 |
| --- | --- |
| Locale 同构 | `npx vitest run frontend/src/lib/locales/locales.schema.spec.ts` |
| 类型检查 | `npx tsc -b`（在 `frontend/` 目录） |

---

## 6. 已知边界与后续（非 P28.2 必做）

1. **隐私短说明**：计划建议在 Info 或反馈旁说明数据由 Tally 处理、勿提交密码；当前 **未**写入 Info Modal 正文，留给 **P28.5** 与 PRD / Design Spec 同步时一并落字。
2. **CSP / 广告拦截**：若部署环境对 `tally.so` 脚本或 iframe 限制过严，弹层可能无法打开；需在对应托管平台单独放行或降级为纯外链（未实现）。
3. **P28.4**：若后续调整 `hud.openFeedback` 英文定稿，需按仓库 `sync-doc` 规则同步其余 locale。

---

## 7. 验收对照（P28.2 计划节选）

| 计划要点 | 实施结论 |
| --- | --- |
| 表单可配置、无 webhook 进仓 | **满足**：仅 `VITE_TALLY_FEEDBACK_FORM_ID` + 默认 id。 |
| 不阻塞 WebGL 主线程 | **满足**：异步加载脚本；无同步阻塞拾取/渲染循环。 |
| 生产可切换表单而不改业务逻辑 | **满足**：仅 env / 默认常量变更。 |
| 未配置时合理降级 | **满足**：显式关闭值 → 不渲染按钮；未设 env → 默认表单。 |

---

*本报告由实施阶段整理；修订时请同步更新「日期 / 状态」行并保留计划链接。*
