# Phase 28.1 — Donate / Ko-fi 支持入口（HUD）（最终实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 28（反馈、支持与社区）子项 **P28.1** |
| 计划来源 | [`.cursor/plans/phase_28_feedback_support_community.plan.md`](../../.cursor/plans/phase_28_feedback_support_community.plan.md) §「P28.1 Donate / Ko-fi」 |
| 日期 | 2026-05-18 |
| 状态 | **已落地**：主 HUD 右上工具条在 **Feedback 与 Info 之间** 提供 **Support** 外链（Ko-fi）；`VITE_KOFI_URL` 可覆盖；未设置 env 时使用仓库内 **默认 Ko-fi 页**；显式关闭语义下 **不渲染** 按钮。 |
| 报告性质 | **工作留档**：汇总本阶段**最终决策**与**已执行操作**。若与代码不一致，以仓库当前实现为准。 |

**产品叙述品牌**：正文叙述使用 **The Movie Cosmos**；浏览器标题等 UI 标识规范见仓库 `branding-name-convention.mdc`。

**范围说明**：本阶段实现 **Ko-fi（通用支持页）HUD 入口 + 环境变量与默认 URL + i18n 键**；**不**接入 Buy Me a Coffee；**不**包含 Phase 28 计划中 Tally（P28.2）、Discord 收口策略（P28.3）、全量文档 SSOT（P28.5）的正文扩写（后者在 P28.5 统一收口）。

---

## 1. 目标（与计划对齐）

1. 使用 **Ko-fi** 作为第三方支持/打赏页（计划中明确 **不再** 使用 Buy Me a Coffee / bmac）。
2. **主 HUD**：与 `FeedbackButton`、`InfoButton` **同层**、同工具条视觉语言；文案**克制**（短 label），不暗示 TMDB 或数据方背书。
3. **可配置**：通过 **`VITE_KOFI_URL`** 注入支持页 URL；不把私密 webhook 或凭据写入前端。
4. **默认页**：维护者在实施对话中提供 **`https://ko-fi.com/xybuilds`**；当 **`VITE_KOFI_URL` 未设置** 时，使用代码内 **`DEFAULT_KOFI_URL`**，保证开箱可见入口（与 P28.2 Tally「未设 env 用默认表单 id」策略一致）。
5. **外链安全**：新标签打开，`rel="noopener noreferrer"`。
6. **显式关闭**：与 Tally 语义对齐，`''` / `0` / `false`（trim 后）→ **不展示** Support 按钮，避免部署方需要「关入口」时只能改代码。

---

## 2. 最终决策总表

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **平台** | **仅 Ko-fi**；仓库内不出现 bmac / Buy Me a Coffee 作为主支持链路。 |
| D2 | **入口位置** | 主界面右上固定工具条（`--z-hud-top-tools`）；组内顺序为 **Feedback → Support → Info → …**（Support 夹在 Feedback 与 Info 之间）。 |
| D3 | **控件形态** | **图标 + 文案**（Lucide `Coffee` + `STRINGS.hud.openSupport`），高度与 Feedback 对齐（`h-10 min-h-10`、`text-[0.8rem]`、`whitespace-nowrap`），共用 **`hudTopToolButtonChrome(styleMode)`**。 |
| D4 | **实现载体** | 使用 **`<a href>`**（`buttonVariants({ variant: 'secondary', size: 'sm' })` + 与 Feedback 一致的覆盖 class），而非 `Button` + `window.open`，以保留中键打开、复制链接、辅助技术对链接的常规预期。 |
| D5 | **URL 来源** | **`getKofiSupportUrl()`**（[`frontend/src/lib/kofiSupport.ts`](../../frontend/src/lib/kofiSupport.ts)）：`import.meta.env.VITE_KOFI_URL` **未定义** → 使用常量 **`DEFAULT_KOFI_URL = 'https://ko-fi.com/xybuilds'`**；已定义则 trim 后校验 **`http:` / `https:`** 的 `URL`，失败则 `console.warn` 并返回 `null`（隐藏按钮）。 |
| D6 | **关闭语义** | 当 env **已设置**且值为 **`''` / `0` / `false`**（字符串 trim 后）→ **不展示**按钮（与 `getTallyFeedbackFormId()` 的显式关闭语义一致）。 |
| D7 | **i18n** | 新增 **`hud.openSupport`**；以 [`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) 为结构 SSOT，**en / zh / zh-Hant / ja / es / fr / ar** 全 bundle **同构**；与 P28.2 的 `hud.openFeedback` 一并由 `locales.schema.spec.ts` 校验。 |
| D8 | **英文 label** | 使用简短 **「Support」**（各语言本地化等价，不展开为长营销句）。 |
| D9 | **Git 工作流** | 开发使用分支 **`phase/p28-1-kofi-support`**（实施时新建）；合并策略由维护者决定，本报告不绑定具体 PR。 |

---

## 3. 配置与模块职责（SSOT）

### 3.1 环境变量

| 变量 | 作用 |
| --- | --- |
| `VITE_KOFI_URL` | **未设置**：使用代码内默认 `https://ko-fi.com/xybuilds`。**已设置**且为非空合法 URL：使用该地址。**已设置**且为 `''` / `0` / `false`：隐藏 Support 按钮。**非法 URL**：隐藏并 `console.warn`。 |

声明位置：[`frontend/src/vite-env.d.ts`](../../frontend/src/vite-env.d.ts)。

**部署提示**：Vite 从 **`frontend/`** 目录加载 `loadEnv`（见 [`frontend/vite.config.ts`](../../frontend/vite.config.ts)）；本地覆盖请在 **`frontend/.env`**（或各托管面板的环境变量）中设置 `VITE_KOFI_URL`。

### 3.2 默认 URL 常量

定义于 [`frontend/src/lib/kofiSupport.ts`](../../frontend/src/lib/kofiSupport.ts) 的 **`DEFAULT_KOFI_URL`**。若维护者更换默认 Ko-fi 主页，修改该常量即可；生产环境仍推荐用 **`VITE_KOFI_URL`** 覆盖以便不换发版调链。

### 3.3 前端模块职责

| 符号 | 职责 |
| --- | --- |
| `normalizeSupportUrl(input)` | 模块内：trim + `URL` 解析 + 协议白名单（`http`/`https`）。 |
| `getKofiSupportUrl()` | 对外：解析 env、默认、关闭语义；返回 `string \| null`。 |
| `SupportButton` | HUD：无 URL 时 `return null`；有 URL 时渲染 `<a target="_blank" rel="noopener noreferrer">`。 |

---

## 4. 工程操作（修改路径一览）

| 路径 | 操作摘要 |
| --- | --- |
| [`frontend/src/lib/kofiSupport.ts`](../../frontend/src/lib/kofiSupport.ts) | **新建**：`DEFAULT_KOFI_URL`、`normalizeSupportUrl`、`getKofiSupportUrl`。 |
| [`frontend/src/hud/SupportButton.tsx`](../../frontend/src/hud/SupportButton.tsx) | **新建**：Ko-fi/支持页外链按钮；`Coffee` 图标；`hudTopToolButtonChrome`；`buttonVariants`。 |
| [`frontend/src/App.tsx`](../../frontend/src/App.tsx) | 在 **Feedback 与 Info 之间** 挂载 `<SupportButton />`。 |
| [`frontend/src/vite-env.d.ts`](../../frontend/src/vite-env.d.ts) | 增加 **`VITE_KOFI_URL`** 类型与注释（含默认与关闭语义说明）。 |
| [`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) 等 **全部 7 个 bundle** | 增加 **`hud.openSupport`**（与各语言文案）。 |

---

## 5. 验证与回归

| 项 | 命令 / 说明 |
| --- | --- |
| Locale 同构 | `npx vitest run frontend/src/lib/locales/locales.schema.spec.ts` |
| 类型检查 | 在 `frontend/` 下执行 `npx tsc -b` |

---

## 6. 已知边界与后续（非 P28.1 必做）

1. **P28.5 / Tech Spec**：环境变量表与「支持入口维护责任」建议在 SSOT 技术规格中补一行（与计划 §P28.5 一致）；本报告不替代 Tech Spec。
2. **根 README / Info Modal**：计划在 P28.1 中为**可选**补充同链或一句说明；当前实现以 **HUD 为主入口**，README/Info 是否在 P28.5 落字由维护者取舍。
3. **广告拦截 / 第三方可用性**：若用户浏览器拦截 Ko-fi 域名，链接行为由浏览器与扩展决定，应用侧仅提供标准 `<a>` 导航。

---

## 7. 验收对照（P28.1 计划节选）

| 计划要点 | 实施结论 |
| --- | --- |
| 配置有效 Ko-fi URL 时可打开 Ko-fi 页 | **满足**：默认即有效 URL；env 覆盖同理。 |
| 未配置时与产品决策一致且不破坏布局 | **满足**：未设置 env 时 **显示**默认入口（产品决策：与维护者提供的默认页一致）；显式 `0`/`false`/空串 **隐藏**，不占位。 |
| 外链 `target="_blank"` + `rel="noopener noreferrer"` | **满足**：见 `SupportButton`。 |
| 与 attribution / 非官方关系不冲突；层级不压过核心操作 | **满足**：短 label、工具条次要 `secondary` 样式；无 TMDB 背书文案。 |
| 不使用 Buy Me a Coffee | **满足**：代码与配置键均为 Ko-fi 链路。 |

---

*本报告由实施阶段整理；修订时请同步更新「日期 / 状态」行并保留计划链接。*
