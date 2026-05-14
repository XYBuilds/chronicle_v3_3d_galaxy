# Phase 27.1 — The Movie Today 分享与 OG 预览 cache-bust（实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 27（增长与轻量功能）子项 **P27.1**（含与 P23.5/P23.6 衔接的 **OG 构建期 cache-bust** 子线，下文记为 **P27.1a**） |
| 计划来源 | [`.cursor/plans/phase_27_growth_light_features.plan.md`](../../.cursor/plans/phase_27_growth_light_features.plan.md) 正文「P27.1 The Movie Today Share」及已写入该计划文件的 **P27.1a** 说明 |
| 日期 | 2026-05-14 |
| Git | 分支 **`p27-1-movie-today-share`**（提交以 `git log` 为准） |
| 状态 | **已落地**：构建期 **`og:image` / `twitter:image`** 追加 `?v=`；HUD 右上 **仅图标** 分享下拉（复制链接 + 指定社交平台 Web 入口 + 邮件）；**不**调用系统 `navigator.share`；全 bundle **HUD 文案键**与 **`en.json` SSOT** 对齐。 |
| 报告性质 | **工作留档**：汇总本阶段**最终产品/工程决策**与**已执行文件级操作**。若与计划 Markdown 或历史讨论不一致，**以本报告 §3 决策表 + 仓库当前代码为准**。 |

**范围说明**：本阶段**不**实现 Phase 27 其余条目（first-time onboarding、人名 person search 等）；**不**修改 nightly 管线 Python 侧 `render_og_today.py` 的 PNG 合成逻辑（仅消费其产物与 `today.json`）。Discord 长期邀请链接由运维通过 **`VITE_DISCORD_INVITE_URL`** 注入（与 Phase 28 计划一致的可选配置提前用于分享入口）。

---

## 1. 目标（与计划对齐）

1. **分享 The Movie Today**：在**不打扰主沉浸**的前提下，提供可发现的分享入口；分享内容包含**当前 UTC 日 pick** 的标题、上映年文案与**站点根 URL**（与 OG 落地页一致，便于社交平台抓取卡片）。
2. **规避系统级分享面板**：**不**使用 `navigator.share`（无法限制为「仅少数社交 App」）；改为**自绘下拉** + **各平台公开 Web 分享 URL**（新标签打开）+ **复制链接**。
3. **减轻链接预览长期缓存**：在静态 `index.html` 的 **`og:image` / `twitter:image`** 上增加**随 UTC 日历日变化**的 query（与 `today.json.date` 对齐），使爬虫侧 URL 在换日后发生变化（平台仍可能自有缓存，见 **§7**）。
4. **无障碍与 i18n**：图标无文字展示时，仍提供 **`aria-label` + `title`**（各 locale `hud.shareTheMovieTodayAria*`）；**`en.json`** 为结构 SSOT，**`strings.ts`** 对含 `{{title}}` / `{{releaseYear}}` 的模板提供插值函数。

---

## 2. 最终决策总表

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **分享入口位置** | 置于 **HUD 右上工具条**（与 Feedback / Info / Language / Fullscreen 同一条 `fixed` 容器），在 **`todayMovie` 已解析**后渲染（与 `App.tsx` 中 `todayMovie` 派生一致）。 |
| D2 | **不使用 Web Share API** | 不调用 `navigator.share`；避免各 OS 不可控的「全应用分享表」。 |
| D3 | **下拉形态** | **横向 `role="menu"` + `aria-orientation="horizontal"`**；每项为 `size-9` 级点击目标；**仅图标**，文案进 **`aria-label` / `title`**。 |
| D4 | **平台与顺序（最终）** | **链接 → X → Reddit → Discord → Facebook → Mail → Telegram**。 |
| D5 | **显式排除的平台** | **不**提供 **WhatsApp**、**小红书**、**LinkedIn** 入口（小红书无稳定公开 Web「一键发帖」URL；WhatsApp / LinkedIn 按产品决策移除）。 |
| D6 | **Lucide 用于通用图标** | **主按钮**：`Share2`；**复制链接**：`Link2`；**邮件**：`Mail`。 |
| D7 | **品牌图标实现策略** | **X / Facebook / Telegram / Discord**：`sharePlatformIcons.tsx` 内 **单色填充 `path`**（社区常见矢量形态，**非**各平台官方 Brand Kit 下载件）。**Reddit**：采用 **Famicons** 官方 npm 包中的 **`logo-reddit.svg`** 路径（MIT），与 [shadcn.io — Famicons Logo Reddit](https://www.shadcn.io/icon/famicons-logo-reddit) 同源展示资产；**不**为单图标引入 `famicons` npm 依赖，**内联 SVG** 嵌入仓库。 |
| D8 | **Discord URL 策略** | 读取 **`import.meta.env.VITE_DISCORD_INVITE_URL`**（`https?://` 合法则使用）；否则回退 **`https://discord.com/`**（占位，避免死链形态由产品后续替换）。 |
| D9 | **Reddit 提交 URL** | `https://www.reddit.com/submit?url=<encode(站点根)>&title=<encode(分享标题)>`。 |
| D10 | **X / Facebook / Telegram** | 分别为 Twitter intent、Facebook sharer、`t.me/share/url` + `url` + `text` 参数组合（`text`/`body` 与 `todayMovie` 文案一致）。 |
| D11 | **邮件** | `mailto:?subject=` + `body=`（UTF-8 百分号编码），`body` 含说明段落与站点根 URL。 |
| D12 | **复制链接反馈** | `navigator.clipboard.writeText(站点根)` 成功后在视口上方短时 **`role="status"`** 提示 **`shareTheMovieTodayLinkCopied`**。 |
| D13 | **OG cache-bust（P27.1a）** | 在 **Vite `transformIndexHtml`** 阶段，将 `index.html` 中 **`https://themoviecosmos.com/data/og-today.png`** 全部替换为 **`...png?v=<YYYY-MM-DD>`**；`v` 来源优先级：**`process.env.VITE_OG_TODAY_V`**（合法日期）→ **`frontend/public/data/today.json` 的 `date`** → **UTC 当天**（无 `today.json` 时的本地/CI 构建回退）。 |
| D14 | **源码 `index.html` 不写 `?v=`** | 生产域名与无 query 的基 URL 仍写在 `frontend/index.html`；**`?v=` 仅构建产物**出现，避免手改两处日期。 |
| D15 | **`vite.config.ts` 单例 `dirname`** | `dirname` **仅声明一次**于文件顶部，供 OG 插件与 `defineConfig` 共用，避免 `tsc` 重复声明错误。 |
| D16 | **多语言** | 所有 **`frontend/src/lib/locales/*.json`** 与 **`en.json`** 叶子键路径一致；`npm run test -w frontend -- src/lib/locales/locales.schema.spec.ts` 作为结构校验门禁。 |

---

## 3. 工程操作（修改路径一览）

| 路径 | 操作摘要 |
| --- | --- |
| [`frontend/vite.config.ts`](../../frontend/vite.config.ts) | 新增 **`ogTodayImageCacheBustPlugin`**（`readOgTodayCacheBustDate` + `transformIndexHtml` `replaceAll`）；`dirname` 顶置；插件链插入顺序与现有 `butlerPublicFontsBasePlugin` / `cfWebAnalyticsPlugin` 共存。 |
| [`frontend/index.html`](../../frontend/index.html) | 注释说明构建期注入 `?v=`；**不**手写 query。 |
| [`frontend/src/App.tsx`](../../frontend/src/App.tsx) | 右上工具条在 **`todayMovie`** 存在时挂载 **`ShareMovieTodayButton`**；传入 **`title`** 与 **`release_date` 截取四位年`**（缺省为 `—`）。 |
| [`frontend/src/hud/ShareMovieTodayButton.tsx`](../../frontend/src/hud/ShareMovieTodayButton.tsx) | 新建：主钮、下拉、`socialUrls` 组装、外链 `target=_blank` + `rel=noopener noreferrer`、复制链接与 toast、**`discordCommunityHref`**。 |
| [`frontend/src/hud/sharePlatformIcons.tsx`](../../frontend/src/hud/sharePlatformIcons.tsx) | 新建：品牌 SVG 组件（**Reddit = Famicons `logo-reddit.svg`**，MIT）；移除历史 WhatsApp 组件与自定义邮件/链条 SVG（链条与邮件改 Lucide）。 |
| [`frontend/src/lib/strings.ts`](../../frontend/src/lib/strings.ts) | `hud` 段：`shareTheMovieTodayTitle` / `shareTheMovieTodayText` 插值函数；其余 `hud.*` 仍透传自 JSON。 |
| [`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) 及 **`zh` / `zh-Hant` / `ja` / `es` / `fr` / `ar`** | 新增/迭代 **`hud.shareTheMovieToday*`** 与 **`hud.shareTheMovieTodayAria*`** 键；删除已废弃键（如 WhatsApp、小红书、LinkedIn 相关）；保持与 **`en.json`** 结构同构。 |
| [`frontend/src/vite-env.d.ts`](../../frontend/src/vite-env.d.ts) | 声明 **`VITE_DISCORD_INVITE_URL`**（可选）。 |
| [`.cursor/plans/phase_27_growth_light_features.plan.md`](../../.cursor/plans/phase_27_growth_light_features.plan.md) | 已写入 **P27.1a** 与分享相关落地说明（若后续计划表与代码分歧，以代码与 **§2** 为准）。 |
| `frontend/tmp-arcticons-snippets.txt`（已删除） | 仓库卫生：移除误提交的临时片段文件，避免与正式图标资产混淆。 |

---

## 4. 运行时与环境变量

| 变量 | 作用域 | 含义 |
| --- | --- | --- |
| **`VITE_OG_TODAY_V`** | **构建期**（CI / 本地 `vite build`） | 可选；`YYYY-MM-DD` 时**覆盖**从 `today.json` 读取的 `?v=`（用于可复现构建或应急对齐）。 |
| **`VITE_DISCORD_INVITE_URL`** | **构建期 + 运行时**（Vite 注入 `import.meta.env`） | 可选；合法 `http(s)` 时作为 Discord 图标外链目标；缺省为 `https://discord.com/`。 |

**说明**：nightly / monthly 工作流在写出 **`today.json`** 与 **`og-today.png`** 之后执行 **`npm run build -w frontend`** 时，**`?v=` 与 `today.json.date` 自然对齐**（与 R2 manifest 中 `og_today_url` 的日期 query 语义一致，但 **HTML 内 `og:image` 的 query 由 Vite 插件写入**，不必与 manifest 字符串逐字相同）。

---

## 5. 验收建议（本阶段）

1. **构建日志**：`npm run build -w frontend` 出现 **`[og-today-image-cache-bust] og:image cache bust v=YYYY-MM-DD`**，且与当次构建可读到的 **`today.json.date`**（或 `VITE_OG_TODAY_V`）一致。
2. **产物 HTML**：`frontend/dist/index.html` 中 **`og-today.png?v=`** 与 **`twitter:image`** 同步带参。
3. **HUD**：`todayMovie` 存在时右上出现分享钮；展开后顺序为 **§2 D4**；复制链接成功出现 toast；各外链新标签打开且 **`noopener noreferrer`**。
4. **i18n**：`npm run test -w frontend -- src/lib/locales/locales.schema.spec.ts` 通过。
5. **社交平台**：卡片刷新依赖平台爬虫策略；**`?v=` 仅提高「换日换 URL」概率**，不保证即时更新（与 **§7** 一致）。

---

## 6. 已知限制与后续可选工作

1. **链接预览缓存**：即使 PNG 响应头为短 TTL，**微信 / Facebook / X 等仍可能长期缓存**某次抓取结果；需使用各平台 **Sharing Debugger / Card Validator** 等工具手动触发重抓。
2. **品牌合规**：当前 X / Facebook 等为 **工程用单色矢量**，若需严格对齐各平台 **Brand Guidelines**，应替换为官方许可素材并保留使用条款记录。
3. **Phase 27 余量**：**P27.2 onboarding**、**P27.3 person search**、**P27.5/P27.6 文档与 locale 大同步** 不在本报告范围；本分支可独立合并或随 Phase 27 总 PR 汇总。

---

## 7. 参考链接（外部）

- Famicons（MIT）及 Reddit logo SVG 来源：`https://github.com/familyjs/famicons`（npm `famicons` **`dist/svg/logo-reddit.svg`**）。
- shadcn.io 上的 Famicons Logo Reddit 展示页：`https://www.shadcn.io/icon/famicons-logo-reddit`（与上文 SVG **同源展示**，非独立另一套图形）。

---

## 8. 修订历史

| 日期 | 修订 |
| --- | --- |
| 2026-05-14 | 首版：汇总 P27.1 分享 HUD、P27.1a OG `?v=` 构建注入、平台顺序终局、Lucide/Famicons/内联 SVG 策略与环境变量。 |
