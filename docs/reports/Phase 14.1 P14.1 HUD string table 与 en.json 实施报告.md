# Phase 14.1 — HUD 文案 SSOT、全英语化：最终决策与操作报告（定稿）

本文档汇总 Phase 14 子项 **P14.1**（string table + 全英语化）的**最终锁定决策**、**已执行操作**、**代码接入面**与**验收口径**，作为评审与回归的单一归档。  
**代码 SSOT**：`frontend/src/lib/locales/en.json` + `frontend/src/lib/strings.ts`（`STRINGS`）。

| 关联 | 路径或说明 |
|------|------------|
| Phase 14 计划 | `.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md`（`p141-strings`：**completed**） |
| 产品规范 | 《TMDB 电影宇宙 Design Spec》**§3**（HUD 文案 SSOT）、**§2.2**（focus 图例与 `STRINGS`）、**§3.4.3**（`infoCopy`）、**§3.4.5**（英文主体边界） |
| 仓库规则 | `.cursor/rules/project-overview.mdc`（Frontend HUD 英文文案一行） |

---

## 1. 执行摘要

- **目标**：在**不改动** 3D 渲染管线与 `galaxy_data` / 搜索索引**数据契约**的前提下，将**产品 HUD** 用户可见字面量统一为**英文**，并集中到可 diff、可扩展的 **string table**。  
- **手段**：**不接** react-i18next 等 i18n 框架；**`en.json`** 存键值与 `{{placeholder}}` 模板；**`strings.ts`** 装配 **`STRINGS`**（含插值函数）；业务代码 **`import { STRINGS } from '@/lib/strings'`**。  
- **`infoCopy`**：从 **`STRINGS.info`** 再导出，保留 `@/hud/infoCopy` 导入路径，避免双处维护。  
- **边界**：TMDB **内容数据**（片名、简介、演职员名等）不翻译；**`console.log` / 注释 / 项目文档** 中文允许；**Timeline** 部分 `aria-label` 仍为内联英文（与 `STRINGS.timeline` 未完全收敛，见 **§7**）。

---

## 2. 最终锁定决策总表

| 编号 | 决策项 | 最终方案 |
|------|--------|----------|
| **D1** | UI 语言 | **单一英文产品 HUD**；其它 locale 可日后复制 `en.json` 结构扩展。 |
| **D2** | SSOT 分层 | **键值与英文模板** → **`frontend/src/lib/locales/en.json`**；**运行时聚合与插值** → **`frontend/src/lib/strings.ts`** → **`STRINGS`**。业务代码**只**依赖 `STRINGS`（与 Design Spec §3 一致）。 |
| **D3** | i18n 框架 | **不引入**；避免 Phase 14 范围膨胀。 |
| **D4** | 插值格式 | 模板使用 **`{{key}}`**；`strings.ts` 内私有 **`interpolate(template, vars)`**；调用方将数值等转为 `string`。 |
| **D5** | `infoCopy.ts` | **不再维护独立英文段落**：从 **`STRINGS.info`** 再导出各 `INFO_*` 常量。 |
| **D6** | Drawer / 焦点 HUD | 海报 / Sheet 描述 / 章节 / Details 标签 / 外链 / 票数模板、**FocusLReference** 评分行与 `aria-label`、**FocusSizeReferenceRings** tier 标签均进入 **`en.json`**。 |
| **D7** | MovieTooltip | **不**走 `STRINGS`：仅动态片名 + `genres[0]`，无独立产品句柄。 |
| **D8** | Timeline 文案 | **`en.json`** 已预留 **`timeline.label`**；**`Timeline.tsx`** 主 `aria-label` 等仍为**内联英文**模板字符串——建议 **P14.8** 或后续小改收口到 `STRINGS`。 |

---

## 3. 架构与数据流

```
locales/en.json  ──import──►  strings.ts
       │                         │
       │                         ├── interpolate("{{x}}", …)
       │                         └── export const STRINGS = { … } as const
                                       │
                    App / Drawer / SearchBar / Loading / loadGalaxyGzip / …
                                       │
                              import { STRINGS } from '@/lib/strings'

hud/infoCopy.ts ──import STRINGS.info──► 再导出 INFO_*（兼容既有 import）
```

---

## 4. 核心文件与职责

| 路径 | 职责 |
|------|------|
| `frontend/src/lib/locales/en.json` | 英文键值与 `{{placeholder}}` 模板（**可编辑 SSOT**）。 |
| `frontend/src/lib/strings.ts` | 导入 `en.json`，导出 **`STRINGS`**（函数字段负责插值）。 |
| `frontend/src/hud/infoCopy.ts` | 从 **`STRINGS.info`** 再导出 **`INFO_*`**。 |

---

## 5. `STRINGS` / `en.json` 顶层命名空间

与 `en.json` 根键一致（便于复制 `zh-CN.json` 等镜像文件）：

| 根键 | 用途摘要 |
|------|----------|
| `loading` | 全屏加载标题与三阶段（Download / Decompress / Parse） |
| `galaxyData` | 下载进度、解压/解析、gzip 不支持、网络/HTTP/JSON 错误等（多数字段为插值函数） |
| `error` | 数据加载失败标题、Retry、本地开发说明（拆段以配合 `<code>` 路径片段） |
| `searchBar` | Tab、索引不可用说明、三档 placeholder、`clear` 等 |
| `hud` | INFO / 关闭 / 全屏与搜索快捷键等 **aria** 与 sr-only 文案（部分能力在 P14.4 / P14.5 落地） |
| `timeline` | 预留 **`label`**（与组件内联 `aria-label` 的完全对齐见 **§2 D8**） |
| `info` | Info Modal 各区块标题与占位正文 |
| `scene` | WebGL2 不可用时的用户可见错误 |
| `drawer` | `fallbackTitle`、`posterAlt`、Sheet 描述、`sections`、`details`、`links`、`votesLine` 等 |
| `focusLReference` | 评分行、`aria-label` 模板 |
| `focusVoteReference` | **`tierLabels`** 字符串数组（与 `FOCUS_VOTE_REFERENCE_TIERS` 长度一致，源码中带断言） |

---

## 6. 生产代码接入清单（`STRINGS` 引用面）

以下模块存在 **`import { STRINGS } from '@/lib/strings'`**（截至本报告定稿的仓库状态）：

| 领域 | 文件 |
|------|------|
| 加载 UI | `frontend/src/components/Loading.tsx` |
| 数据拉取 | `frontend/src/data/loadGalaxyGzip.ts` |
| 全局壳 / 错误页 | `frontend/src/App.tsx` |
| 搜索 HUD | `frontend/src/components/SearchBar.tsx` |
| INFO | `frontend/src/hud/InfoModal.tsx`、`frontend/src/hud/InfoButton.tsx` |
| `infoCopy` 桥 | `frontend/src/hud/infoCopy.ts` |
| 详情抽屉 | `frontend/src/components/Drawer.tsx` |
| 场景初始化 | `frontend/src/three/scene.ts` |
| 焦点参照 | `frontend/src/hud/FocusLReference.tsx`、`frontend/src/three/FocusSizeReferenceRings.ts` |
| Close 控件（P14.2） | `frontend/src/components/ui/close-button.tsx`（默认 **`aria-label`** → **`STRINGS.hud.close`**） |

**说明**：**`CloseButton`** 属 **P14.2**，依赖 P14.1 已落地的 **`hud`** 命名空间；本清单仅反映当前依赖关系。

---

## 7. 已知未收口与后续建议

| 项 | 说明 | 建议阶段 |
|----|------|----------|
| **Timeline `aria-label`** | 组件内仍为内联英文（见 `Timeline.tsx`） | **P14.8** 文档/小修或独立 chore：改为消费 `STRINGS.timeline.*` |

---

## 8. 验收与回归

### 8.1 构建

```bash
cd frontend && npm run build
```

### 8.2 中文字符审计（生产 UI）

```bash
rg '[\u4e00-\u9fff]' frontend/src --glob '*.ts' --glob '*.tsx'
```

**期望**：用户可见字面量不在生产路径以中文呈现；**允许**：`console.log`、注释、测试、Storybook mock 等。

### 8.3 主流程 spot-check

Loading → Error（含 Retry 与本地提示）→ Search（三 Tab / placeholder / 禁用说明）→ Drawer（区块与 Details）→ INFO → Focus（L 条与 vote 圆环 tier）。

---

## 9. 与计划条文的差异（工程记录）

| 计划/直觉表述 | 落地调整 | 原因 |
|---------------|----------|------|
| 文案散落在 `strings.ts` 常量 | 迁至 **`en.json`**，由 `strings.ts` 装配 | 易审阅、易做第二 locale |
| `infoCopy` 整文件手写英文化 | **`STRINGS.info` 再导出** | 单一文案源、稳定 import 面 |
| Storybook Leva 等走 `STRINGS` | **未**在 `GalaxyThreeLayerLabLevaHost.tsx` 接入 `STRINGS` | 该文件为 dev 调参英文标签，与产品 HUD SSOT 解耦 |

---

## 10. 与 P14.2 / P14.3 的边界（避免混淆）

| Phase | 内容 | 与 P14.1 关系 |
|-------|------|----------------|
| **P14.2** | `CloseButton`、`--ui-edge-*`（DOM 壳层细线） | 消费 **`STRINGS.hud.close`** |
| **P14.3** | Hover ring、Timeline 与 UI edge **视觉对齐**；黑底画布上环与时间轴使用 **`--ui-edge-canvas-*`**（固定浅描边），与 **`?theme=light`** 下 DOM 的 **`--ui-edge-*`** 区分 | **非** P14.1 文案范围；见《视觉参数总表》**§7 / §7a** |

---

## 11. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-05-01 | 初稿 / 定稿循环：决策、`en.json` 拆分、Drawer / 焦点参照纳入 SSOT。 |
| 2026-05-01 | **定稿归档**：合并「最终决策 + 操作」单报告；接入清单与 `rg` 命令对齐当前仓库；修正 **Leva Storybook 未使用 `STRINGS`** 的表述；补充 **D8**、**§10** 与 **P14.2/P14.3** 边界。 |
| 2026-05-01 | **文档联动**：Design Spec §3 增加本报告指针；视觉参数总表 **§7 / §7a** 同步 hover 环布局与 **canvas** token；Phase 14 计划中 **P14.3** 标为 completed。 |
