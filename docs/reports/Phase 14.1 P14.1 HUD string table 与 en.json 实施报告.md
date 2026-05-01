# Phase 14.1 — HUD string table、全英语化与 `en.json` 实施报告（定稿）

本文档为 Phase 14 子项 **P14.1** 的**最终决策**、**已落地操作**与**验收口径**归档，供评审、回归与后续多语言扩展对齐。  
关联计划：`.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md`（`p141-strings`：**completed**）。  
产品规范：《TMDB 电影宇宙 Design Spec》**§2.2**（focus 图例与 `STRINGS` / `en.json`）、**§3**（HUD 文案 SSOT）、**§3.4.3**（`infoCopy` 与 `STRINGS.info`）、**§3.4.5**（英文主体与中文边界）。

---

## 1. 背景与范围

### 1.1 目标

在**不改动** 3D 渲染管线、`galaxy_data` / 搜索索引**数据契约**的前提下：

- 将 HUD / 壳层**产品 UI 字面量**统一为**英文**；
- 抽离为可维护的 **string table**，避免散落在各组件中的魔法字符串；
- **不引入** react-i18next 等 i18n **运行时**框架（与 Phase 14 决策 **D1** 一致）。

### 1.2 范围边界

| 纳入 P14.1                                                                                                                                                                          | 不纳入（刻意排除）                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 加载态、数据拉取错误串、全局错误页、搜索 HUD、INFO 面板、`infoCopy` 路径、Drawer 区块标题与 Details 标签、外链按钮文案、WebGL2 抛错、焦点参照（L 条 / vote 圆环 tier）等**产品 UI** | TMDB 导出中的**内容数据**（片名、简介、演职员姓名、`spoken_languages` 原文等）——保持数据源语言，不由本字典「翻译」 |
| `loadGalaxyGzip` 等面向用户的进度 / 错误文案                                                                                                                                        | 纯调试 `console.log`、代码注释、文档正文中的中文                                                                   |

---

## 2. 最终锁定决策

| 编号   | 决策项             | 最终方案                                                                                                                                                                                                                                                                        |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | UI 语言策略        | **单一英文界面**；字典作为未来多 locale（如 `zh-CN.json`）的**结构模板**，本阶段不接 i18n 框架。                                                                                                                                                                                |
| **D2** | SSOT 分层          | **键值与英文模板**存 **`frontend/src/lib/locales/en.json`**；**运行时聚合与插值**在 **`frontend/src/lib/strings.ts`** 导出 **`STRINGS`**；业务代码**只 import `STRINGS`**（与 Design Spec §3 一致）。                                                                           |
| **D3** | 插值格式           | 模板使用 **`{{key}}`**，由 `strings.ts` 内 **`interpolate()`** 替换；调用方将数值等转为 `string`（如 HTTP status）。                                                                                                                                                            |
| **D4** | `infoCopy.ts`      | **不再维护独立英文段落文件**：从 **`STRINGS.info`** 再导出各常量，保留 **`@/hud/infoCopy`** 导入路径，降低 `InfoModal` 等调用方改动面（相对原计划「整文件手写英语版」的**工程化折中**，效果等价：单一文案源仍为 `en.json`）。                                                   |
| **D5** | Drawer / 焦点 HUD  | 海报占位、Sheet 描述、章节标题、Details 字段、TMDB/IMDb 链接、vote 行模板、**FocusLReference** 评分行与 `aria-label`、**FocusSizeReferenceRings** 五档 **tier** 标签均进入 **`en.json`**，经 `STRINGS.drawer` / `STRINGS.focusLReference` / `STRINGS.focusVoteReference` 暴露。 |
| **D6** | 与 Phase 计划关系  | 对应计划条目 **P14.1**；与 **P14.0**（Design Spec §3 等已写明 SSOT）对齐后交付。                                                                                                                                                                                                |
| **D7** | Tooltip / Timeline | **MovieTooltip**：仅展示动态片名与 `genres[0]` 标签，**无**独立产品 UI 句柄，不要求走 `STRINGS`。**Timeline**：`en.json` 已预留 **`STRINGS.timeline.label`**；组件内 **`aria-label`** 仍有**内联英文**模板字符串（与 SSOT 未完全收敛，可列入 **P14.8** 小修或后续统一）。       |

---

## 3. 架构说明（落地形态）

```
locales/en.json  ──import──►  strings.ts
       │                         │
       │                         ├── interpolate("{{x}}", …)
       │                         └── export const STRINGS = { … }
                                       │
                    App / Drawer / SearchBar / Loading / …
                                       │
                              import { STRINGS } from '@/lib/strings'
```

- **`en.json`**：便于 diff、审阅与将来复制为 `zh-CN.json` 等同级文件。  
- **`strings.ts`**：保证 TypeScript 侧**稳定 API**（函数型字段与 `as const` 推断），避免在 JSX 中散落插值逻辑。

---

## 4. 实施操作清单

### 4.1 核心文件

| 路径                               | 职责                                                       |
| ---------------------------------- | ---------------------------------------------------------- |
| `frontend/src/lib/locales/en.json` | 英文文案与 `{{placeholder}}` 模板（**可编辑 SSOT**）。     |
| `frontend/src/lib/strings.ts`      | 导入 `en.json`，组装 `STRINGS`（含插值函数）。             |
| `frontend/src/hud/infoCopy.ts`     | 从 `STRINGS.info` **再导出**，兼容既有 `INFO_*` 常量引用。 |

### 4.2 已接入 `STRINGS` 的源码模块（仓库现状）

以下路径为 `import { STRINGS } from '@/lib/strings'`（或经 `infoCopy`）的**生产路径**汇总：

| 领域            | 文件                                                                           |
| --------------- | ------------------------------------------------------------------------------ |
| 加载 UI         | `components/Loading.tsx`                                                       |
| 数据拉取        | `data/loadGalaxyGzip.ts`                                                       |
| 全局壳 / 错误页 | `App.tsx`                                                                      |
| 搜索 HUD        | `components/SearchBar.tsx`                                                     |
| INFO            | `hud/InfoModal.tsx`（部分）、`hud/InfoButton.tsx`、`hud/infoCopy.ts`           |
| 详情抽屉        | `components/Drawer.tsx`                                                        |
| 场景初始化      | `three/scene.ts`（WebGL2 不可用）                                              |
| 焦点参照        | `hud/FocusLReference.tsx`、`three/FocusSizeReferenceRings.ts`                  |
| Storybook 辅助  | `storybook/GalaxyThreeLayerLabLevaHost.tsx`（与 HUD 英语验收一致的 Leva 标签） |

**说明**：`components/ui/close-button.tsx` 使用 **`STRINGS.hud.close`** 为默认 **`aria-label`**，属 **P14.2** 关闭按钮 primitive，依赖 P14.1 已落地的 **`hud` 命名空间**。

### 4.3 `STRINGS` / `en.json` 顶层命名空间

与 `en.json` 根键一一对应（便于复制新 locale）：

| 键                   | 用途摘要                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `loading`            | 全屏加载标题与三阶段（Download / Decompress / Parse）                                          |
| `galaxyData`         | gzip 进度、解压/解析、网络与 HTTP 错误等（含插值）                                             |
| `error`              | 数据加载失败页标题、重试、本地开发说明（拆段以配合 `<code>` 穿插）                             |
| `searchBar`          | Tab 文案、禁用原因、三档 placeholder、`clear` 等                                               |
| `hud`                | 通用 HUD（INFO `sr-only`、关闭、`toggleFullscreen` / `focusSearch` 等**预留/后续快捷键**文案） |
| `timeline`           | 时间轴辅助文案（**字典已备**；与 `Timeline.tsx` 内联 `aria-label` 的完全对齐见 **§2 D7**）     |
| `info`               | INFO Modal 各区块标题与正文                                                                    |
| `scene`              | WebGL2 不可用时的用户可见错误                                                                  |
| `drawer`             | `fallbackTitle`、`posterAlt`、Sheet 描述、`sections`、`details`、`links`、`votesLine` 等       |
| `focusLReference`    | 评分行模板、`aria-label` 模板                                                                  |
| `focusVoteReference` | `tierLabels` 字符串数组（五档；与 `FOCUS_VOTE_REFERENCE_TIERS` 长度断言一致）                  |

---

## 5. 验收与回归

### 5.1 构建与测试

- `cd frontend && npm run build`（`tsc -b` + `vite build`）通过。  
- `npm run test`（Vitest）通过（以当时 CI / 本地为准）。

### 5.2 文案审计（中文字符）

计划口径：

```bash
rg '[\u4e00-\u9fff]' frontend/src --glob '*.ts' --glob '*.tsx'
```

**期望**：生产 UI 路径无用户可见中文；**允许**命中：`console.log`、注释、测试、Storybook fixture 中模拟数据等。

### 5.3 主流程人工 spot-check

- **Loading**：三阶段英文与进度条文案。  
- **Error**：无数据 / 拉取失败页标题、Retry、本地开发提示中的路径片段。  
- **Search**：三 Tab、三档 placeholder、禁用态说明、清除按钮 **`aria-label`**。  
- **Drawer**：区块标题、Details 标签、外链、海报占位。  
- **INFO**：`InfoModal` 标题与占位正文。  
- **Focus**：L 参照与 vote 圆环 tier 英文。

---

## 6. 与 Phase 14 内计划条文的差异（记录）

| 计划原文（摘要）                   | 落地调整                                         | 原因                             |
| ---------------------------------- | ------------------------------------------------ | -------------------------------- |
| 全部字面量在 `strings.ts` 内联常量 | 英文词条迁至 **`en.json`**，由 `strings.ts` 装配 | 更易审阅、diff 与多语言镜像      |
| `infoCopy.ts` 直接重写英语版       | **`infoCopy` 再导出 `STRINGS.info`**             | 保持 import 面稳定，避免双处维护 |
| `MovieTooltip` 等列入审计列表      | Tooltip **无**独立产品句柄（仅数据字段）         | 与「仅 UI 英语化」边界一致       |

---

## 7. 后续扩展（非 P14.1 交付）

- 新增 **`locales/zh-CN.json`** 等：复制 `en.json` 结构翻译值；在加载层按 locale 选择 JSON 再装配 `STRINGS`（或未来接 i18n 库）。  
- 若引入 **react-i18next**：可将 `en.json` 注册为资源包；`{{key}}` 需评估与库插值语法的迁移成本。  
- **Timeline `aria-label`**：建议改为消费 **`STRINGS.timeline`**（或细分键），在 **P14.8 文档同步 / 小修** 中收口。

---

## 8. 修订记录

| 日期       | 说明                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-01 | 初稿：P14.1 决策、`en.json` 拆分、Drawer / 焦点参照纳入 SSOT。                                                                                                                                                                                          |
| 2026-05-01 | **定稿**：补充 D7（Timeline/MovieTooltip）、架构图式、全文件清单、验收命令、与计划差异表、后续收口项；与 Design Spec §3 / §3.4.3 / §3.4.5 交叉引用。                                                                                                    |
| 2026-05-01 | **文档同步**：Design Spec §2.2（focus 图例与 `STRINGS`）、§3 / §3.4.3 / §3.4.5 已写明 **`en.json` + `strings.ts`**；`.cursor/plans` 中 Phase 14 / 15 / 16 与 HUD 文案相关表述已对齐；`.cursor/rules/project-overview.mdc` 增补 Frontend HUD SSOT 一行。 |
