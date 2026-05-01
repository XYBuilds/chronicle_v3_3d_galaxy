# Phase 14.1 — HUD string table、全英语化与 `en.json` 实施报告

本文档记录 Phase 14 子项 **P14.1** 的**最终决策**与**已落地操作**，便于评审与后续多语言扩展对齐。

---

## 1. 背景与范围

- **目标（与设计文档一致）**：在不动 3D 渲染管线与数据契约的前提下，将 HUD / 壳层用户可见文案统一为**英文**，并抽离为可维护的 **string table**；**不引入** react-i18next 等 i18n 运行时框架。
- **范围**：加载态、错误页、搜索栏、INFO 面板、`loadGalaxyGzip` / 场景初始化等与用户可见英文相关的路径；后续迭代将 Drawer、焦点态参照（L 条 / vote 圆环标签）一并纳入同一 SSOT。
- **明确不在 P14.1「翻译」范围内**：TMDB 导出字段中的影片标题、简介、演职员姓名、`spoken_languages` 等**内容数据**保持数据源原文；仅**产品 UI 字面量**走字典。

---

## 2. 锁定决策

| 编号 | 决策项 | 最终方案 |
|------|--------|----------|
| D1 | UI 语言策略 | **单一英文界面**；字典为未来 `en.json` / 多 locale 的种子，不在本阶段接 i18n 框架。 |
| D2 | SSOT 存放位置 | 英文文案主文件：**`frontend/src/lib/locales/en.json`**；运行时聚合：**`frontend/src/lib/strings.ts`** 导出 `STRINGS`。 |
| D3 | 插值格式 | 模板字符串使用 **`{{key}}`**，由 `strings.ts` 内 `interpolate()` 替换；调用处负责把数值转为 string（如 HTTP status）。 |
| D4 | `infoCopy.ts` | **不再手写英文段落**：从 `STRINGS.info` 再导出各常量，保留原有 `@/hud/infoCopy` 导入路径，减少组件改动面。 |
| D5 | Drawer / 参照 HUD | 章节标题、Details 字段标签、海报占位、vote 行、TMDB/IMDb 链接文案、焦点 **L 参考**与 **vote_count 圆环** tier 标签全部进入 **`en.json`**，与 `STRINGS.drawer` / `STRINGS.focusLReference` / `STRINGS.focusVoteReference` 对齐。 |
| D6 | Git 交付 | 开发在独立分支 **`phase14/p14.1-strings`** 上进行（与 Phase 计划一致）；合并策略由仓库流程决定。 |

---

## 3. 实施操作清单

### 3.1 新增 / 核心文件

| 路径 | 说明 |
|------|------|
| `frontend/src/lib/locales/en.json` | 英文文案 SSOT；嵌套结构与占位符模板。 |
| `frontend/src/lib/strings.ts` | `import en.json`，组装 `STRINGS`（含插值函数），对外 API 保持稳定。 |

### 3.2 已接入 `STRINGS` 的模块（按功能）

- **加载与数据**：`Loading.tsx`；`loadGalaxyGzip.ts`（下载进度文案、解压/解析、网络与 HTTP 错误等）。
- **全局壳**：`App.tsx`（错误页标题、重试、本地开发说明）。
- **搜索**：`SearchBar.tsx`（Tab、禁用原因、placeholder、清除按钮 `aria-label`）。
- **INFO**：`infoCopy.ts`（再导出）；`InfoModal.tsx`、`InfoButton.tsx`。
- **场景**：`three/scene.ts`（WebGL2 不可用时的抛错文案）。
- **Drawer**：`components/Drawer.tsx`（海报、Sheet 描述、章节与 Details 字段、外链文案等）。
- **焦点参照**：`hud/FocusLReference.tsx`（评分行 + `aria-label`）；`three/FocusSizeReferenceRings.ts`（五档 vote tier 标签；长度与 `FOCUS_VOTE_REFERENCE_TIERS` 断言一致）。
- **Storybook**：`storybook/GalaxyThreeLayerLabLevaHost.tsx`（Leva 面板「Macro · …」标签英文化，与 HUD 英语验收一致）。

### 3.3 计划文档状态

- `.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md` 中 **`p141-strings` todo** 已标为 **completed**（与仓库跟踪一致）。

---

## 4. `STRINGS` / `en.json` 命名空间概览

以下为运行时 `STRINGS` 顶层键（与 `en.json` 根键一致），便于后续复制出 `zh-CN.json` 等：

- `loading` — 全屏加载标题与三阶段标签  
- `galaxyData` — gzip 进度与请求/解析错误（含插值）  
- `error` — 数据加载失败页  
- `searchBar` — 搜索 HUD  
- `hud` — 通用 HUD（INFO、关闭等预留）  
- `timeline` — 时间轴辅助文案（预留）  
- `info` — INFO Modal 区块  
- `scene` — WebGL2 错误  
- `drawer` — 详情抽屉（含 `sections`、`details`、`links`）  
- `focusLReference` — OKLab L 色带参照（评分行 + 无障碍说明）  
- `focusVoteReference` — `tierLabels` 字符串数组（五档）  

---

## 5. 验收与回归

- **构建**：`frontend` 下 `npm run build`（`tsc -b` + `vite build`）通过。  
- **单元测试**：`npm run test`（Vitest）全通过。  
- **文案审计**：生产 UI 路径的中文字面量已替换为 `STRINGS` / `en.json`；代码注释、开发用 `console.log`、Storybook fixture 中模拟 TMDB 的语言名等可仍含非英文字符，与「仅 UI 英语化」策略一致。

---

## 6. 后续扩展（非本次交付）

- 增加 **`zh-CN.json` / `fr.json` / `ja.json`**：复制 `en.json` 结构翻译值；在 `strings.ts`（或后续 i18n 初始化）按当前 locale 选择表即可。  
- 若引入 **react-i18next** 等：可将 `en.json` 直接注册为 `en` 资源包，`{{key}}` 需改为库支持的 ICU / i18next 插值语法并做一次迁移。  
- **影片内容语言**：与 UI locale 独立；若需统一显示语言名，应在管线或映射表中处理，不属于本 HUD string table 职责。

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-01 | 初稿：汇总 P14.1 决策、文件清单、`en.json` 拆分与 Drawer / 焦点参照纳入 SSOT 的最终状态。 |
