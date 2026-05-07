# Phase 21.2 · P21.2 HUD 国际化（i18n）与 LanguageSwitch — 实施报告

> 对应 [Phase 21 计划](../../.cursor/plans/phase_21_search_and_i18n_8ab4cd27.plan.md) 中 **P21.2**（`p212-i18n-locale-store`）：将 HUD 文案从模块级静态英文升级为 **按 locale 切换**；提供 **语言开关**、**URL / localStorage / 浏览器语言** 初始化；**不引入** react-i18next，沿用 **JSON + `buildStrings` + Zustand** 的自管模式（与项目约束一致）。  
> **说明**：计划在起草时为「EN + 中文起步」；落地过程中按产品需求扩展为 **多语言**，详见 §1。  
> **报告日期**：2026-05-08。

---

## 1. 目标与最终决策

| 议题 | 最终决策 |
|------|----------|
| i18n 范围 | **仅 HUD / DOM 文案**（loading、错误页、SearchBar、抽屉、Timeline、Info、Scene 报错字符串等）。**不翻译** TMDB 影片标题、overview、人名、genre 名等数据库字段。 |
| 外部 i18n 库 | **不引入** react-i18next；维持 **`frontend/src/lib/strings.ts`** 为中心的 **`buildStrings(localeId)` + 模板插值**（`{{key}}`）。 |
| 文案 SSOT | 各语言 **`frontend/src/lib/locales/*.json`**，结构与 **`en.json`** 对齐；**`LOCALE_IDS`** 驱动的 **`STRINGS_BY_LOCALE`** 由 **`LOCALE_IDS.map((id) => buildStrings(id))`** 生成，避免漏注册语言。 |
| 支持语言（locale id） | **`en`**（默认）、**`zh`**（简体中文）、**`zh-Hant`**（繁体中文）、**`ja`**、**`es`**、**`fr`**、**`ar`**。URL / `localStorage` 使用同一套 **locale token**（含 **`zh-Hant`** 连字符）。 |
| 语言菜单展示名 | **母语标签（endonym）**，与当前界面语言无关：`LOCALE_NATIVE_LABELS`（如 **简体中文 / 繁體中文 / Français / العربية**）。 |
| 简体中文 vs 繁体 | **`zh`** 对应 **`zh.json`**，菜单标签 **简体中文**；**`zh-Hant`** 对应 **`zh-Hant.json`**，菜单标签 **繁體中文**。`<html lang>`：**`zh` → zh-Hans**，**`zh-Hant` → zh-Hant**（`localeToHtmlLang`）。 |
| 初始化优先级 | **`?lang=`**（合法 token）→ **`localStorage['tmc.locale']`** → **`navigator.language`** 启发式（如 `zh-TW`/`zh-HK`/`zh-MO`/`zh-Hant` → `zh-Hant`；其余 `zh*` → `zh`；`ja`/`es`/`fr`/`ar` 前缀匹配）→ **`DEFAULT_LOCALE`（en）**。校验统一走 **`isLocaleId()`**。 |
| 持久化与 URL | **`setLocale`** 写入 **localStorage**，并用 **`history.replaceState`** 同步 **`?lang=`**，便于分享书签后语言一致。 |
| **RTL（阿拉伯语）** | **`locale === 'ar'`** 时 **`document.documentElement.dir = 'rtl'`**，否则 **`ltr`**；首帧由 **`syncHtmlLangDir(resolveInitialLocale())`** 与每次 **`setLocale`** 同步。 |
| LanguageSwitch UI | **Lucide [`Languages`](https://lucide.dev/icons/languages)** 图标按钮 + **下拉菜单**（`role="menu"` / `menuitemradio`）；右上顺序 **Info → Lang → Fullscreen**，外层 **`pointer-events-none`** + 子控件 **`pointer-events-auto`**。 |
| RTL 下菜单勾选位置 | 全局 RTL 时 flex 会镜像；对下拉 **`<ul>`** 设置 **`dir="ltr"`**（并 **`text-left`**），保证 **✓ 始终在选项右侧**，与各语言一致。 |
| 非 React 路径读文案 | **`getStrings()`**（读当前 store 快照）：用于 **`loadGalaxyGzip`**、**`scene` WebGL2 报错**、**`drawerDetailsLayout`**、**Three.js** 等。 |
| React 组件 | **`useStrings()`**；Storybook / 向后兼容保留 **`STRINGS`** = **`STRINGS_BY_LOCALE.en`**（静态英文）。 |
| **`infoCopy.ts`** | **删除**；**`InfoModal`** 直接使用 **`useStrings().info.*`**。 |
| Focus Size 参考环（vote tier 文案） | **`FocusSizeReferenceRings`** 创建时按当前 locale 生成 Sprite；**订阅 `useLocaleStore`**，**locale 变更时**重绘 **CanvasTexture**（**`getStrings().focusVoteReference.tierLabels`**）；阿拉伯语绘制标签时 **`ctx.direction = 'rtl'`**。**`dispose`** 先取消订阅再释放几何/纹理。 |
| schema 校验 | **`frontend/src/lib/locales/locales.schema.spec.ts`**：各 locale JSON 与 **`en.json`** 的 **leaf key paths** 一致；**`focusVoteReference.tierLabels`** 长度一致。 |

---

## 2. 交付物清单（路径）

| 类型 | 路径 | 说明 |
|------|------|------|
| 英文 HUD SSOT | [`frontend/src/lib/locales/en.json`](../../frontend/src/lib/locales/en.json) | 基准结构 |
| 简体 / 繁体 / 多语言包 | [`frontend/src/lib/locales/zh.json`](../../frontend/src/lib/locales/zh.json)、[`zh-Hant.json`](../../frontend/src/lib/locales/zh-Hant.json)、[`ja.json`](../../frontend/src/lib/locales/ja.json)、[`es.json`](../../frontend/src/lib/locales/es.json)、[`fr.json`](../../frontend/src/lib/locales/fr.json)、[`ar.json`](../../frontend/src/lib/locales/ar.json) | 与 `en.json` 同构 |
| Locale 注册表 | [`frontend/src/lib/locales/index.ts`](../../frontend/src/lib/locales/index.ts) | **`LOCALES`、`LOCALE_IDS`、`LOCALE_NATIVE_LABELS`、`isLocaleId`、`localeToHtmlLang`** |
| Zustand + DOM 语言/方向 | [`frontend/src/store/localeStore.ts`](../../frontend/src/store/localeStore.ts) | **`resolveInitialLocale`、`setLocale`、`syncHtmlLangDir`** |
| Query 同步 | [`frontend/src/hooks/useLocaleFromQuery.ts`](../../frontend/src/hooks/useLocaleFromQuery.ts) | 挂载时若 **`?lang=`** 合法则 **`setLocale`** |
| 字符串构建与 hooks | [`frontend/src/lib/strings.ts`](../../frontend/src/lib/strings.ts) | **`buildStrings`、`useStrings`、`getStrings`、`STRINGS`** |
| 语言开关 HUD | [`frontend/src/hud/LanguageSwitch.tsx`](../../frontend/src/hud/LanguageSwitch.tsx) | 下拉 + endonym + **`dir="ltr"`** 菜单 |
| App 集成 | [`frontend/src/App.tsx`](../../frontend/src/App.tsx) | **`useLocaleFromQuery`**；右上按钮组 **Info / Lang / Fullscreen** |
| Info 弹窗 | [`frontend/src/hud/InfoModal.tsx`](../../frontend/src/hud/InfoModal.tsx) | 移除 **`infoCopy`**，全 **`useStrings`** |
| 尺寸参考环 | [`frontend/src/three/FocusSizeReferenceRings.ts`](../../frontend/src/three/FocusSizeReferenceRings.ts) | **`createLabelCanvasTexture`**、locale **订阅**与 **刷新标签** |
| 单测 | [`frontend/src/lib/locales/locales.schema.spec.ts`](../../frontend/src/lib/locales/locales.schema.spec.ts) | JSON 结构对齐 |

**调用迁移范围（摘录）**：**SearchBar**、**Timeline**、**Loading**、**LoadFailurePage**、**Drawer**、**CloseButton**、**InfoButton**、**FullscreenButton**、**FocusLReference**、**App**；非 React：**loadGalaxyGzip**、**scene**、**drawerDetailsLayout** 等（见仓库 **`git log`** / grep **`useStrings` / `getStrings`**）。

---

## 3. 行为说明

### 3.1 URL 参数示例

| 界面语言 | 示例 query |
|----------|------------|
| English | `?lang=en` |
| 简体中文 | `?lang=zh` |
| 繁體中文 | `?lang=zh-Hant` |
| 日本語 | `?lang=ja` |
| Español | `?lang=es` |
| Français | `?lang=fr` |
| العربية | `?lang=ar` |

非法或未知 token 不会写入 store（初始化仍以 storage / navigator / 默认为准）。

### 3.2 与 P21.1（搜索 v2）的关系

- **P21.1**：管线 + 前端的 **`normalizeForSearch` v2**、**`meta.search_normalize_version`**（搜索语义）。  
- **P21.2**：**HUD 显示语言**（与搜索归一化独立）。二者可在仓库中并行交付。

### 3.3 已知边界

- **控制台调试日志**：仍以英文前缀为主（项目惯例）；**用户可见 HUD** 走 **`useStrings` / `getStrings`**。  
- **ESLint**：部分既有规则（如 **FullscreenButton** 内 effect setState）与本阶段无关时未一并重构。

---

## 4. 验收建议（手工）

1. **顺序与布局**：加载后主界面右上为 **信息 → 语言 → 全屏**；语言为 **图标 + 下拉**。  
2. **切换与持久化**：任选语言 → 刷新 → **文案与 `?lang=` / localStorage** 一致。  
3. **简体 / 繁体**：分别选 **简体中文 / 繁體中文**，HUD 用词符合预期；**`<html lang>`** 为 **`zh-Hans` / `zh-Hant`**。  
4. **阿拉伯语**：HUD 为阿语时页面 **RTL**；**语言下拉内 ✓ 仍在右侧**（菜单 **`dir="ltr"`**）。  
5. **Focus 尺寸环**：切换语言后，vote tier 标签（如「1000 票 / 1000 votes」）**随之更新**，无需重进场景。

---

## 5. 分支与提交说明（参考）

实现与迭代主要在分支 **`phase/p21.2-i18n-locale-store`**（或后续合并分支）上提交；具体 commit 消息与顺序以 **`git log`** 为准。若需归档「计划中的 P21.2 原文」与「最终扩展为多语言」的差异，以本报告 **§1** 为准。

---

## 6. 后续（计划内其他子项）

Phase 21 计划中 **P21.3～P21.7**（Genre 多选、SearchBar idle/active、浅色 tab、电影联想去 cap、SSOT 文档同步）属 **独立子任务**；本报告 **仅覆盖 P21.2** 交付与决策。
