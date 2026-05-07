# Phase 20.3 — LoadFailurePage 加载失败页抽离（实施报告）

**范围：** 对照 [.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md](../../.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md) 中的 **P20.3**：将 [`frontend/src/App.tsx`](../../frontend/src/App.tsx) 中 **`galaxy-error`** 相的内联 UI 抽离为独立组件 **`LoadFailurePage`**；与 [`Loading`](../../frontend/src/components/Loading.tsx) 视觉统一；提供错误详情折叠区、**Retry** 与 **Reload page** 双操作；补充 **Storybook** 四类 fixture；HUD 英文文案仍经 **`frontend/src/lib/locales/en.json`** → **`STRINGS`**。

**明确不在本期：** 修改 `galaxyDataStore` / `loadGalaxyData` 行为或契约；搜索索引失败仍 **`skipped`** 不进失败页（与计划一致）；Tech Spec / Data Pipeline / README — **留待 Phase 20.6**。

**Git：** 独立分支 **`p20.3-load-failure-page`**；合并提交示例：**`c40bf8e`** — `feat(frontend): P20.3 LoadFailurePage with Storybook fixtures`。

---

## 1. 最终决策（已定稿）

| 议题 | 决策 | 理由 |
|------|------|------|
| 组件边界 | **`LoadFailurePage`** 仅接收 **`errorMessage: string \| null`** 与 **`onRetry: () => void`**；由 **`App`** 注入 **`() => void fetchGalaxyData()`** | 与计划接口一致；不耦合 Zustand，便于 Storybook 与单测隔离。 |
| 视觉基线 | 与 **`Loading`** 同款全屏 overlay：**`fixed inset-0 z-50`**、**`bg-background/80 backdrop-blur-sm`**、**`text-foreground`** | 计划要求「与 Loading 视觉统一」；区别于旧版 **`min-h-screen`** 无 blur 的朴素居中块。 |
| 主标题与操作 | 主标题 **`STRINGS.error.title`**；主按钮 **Retry**（primary）；次按钮 **Reload page**（`window.location.reload()`，边框次要样式） | 计划：Retry 为主、整页刷新作硬兜底；store 逻辑不变时 Retry 仍走同一 `fetchGalaxyData`。 |
| 错误正文呈现 | **默认收起**：原始 **`errorMessage`** 仅在用户点击「展开」后显示；**`localDevHint*`** 与两段 **`<code>`** 路径说明放在展开区 **底部** | 计划：避免大段堆栈劝退；开发提示不抢占首屏。 |
| 折叠实现与 a11y | 使用 **`useState` + `button`** 切换；**`aria-expanded`**、**`aria-controls`** 指向详情 **`id`**（**`useId()`** 生成）；详情容器 **`role="region"`** + **`aria-label`**（来自 **`en.json`**） | 计划验收：折叠区具备 **`aria-expanded`**；键盘可聚焦 Retry（原生 **`<button>`** + **`focus-visible:ring`**）。 |
| 读屏与 live region | 根容器 **`role="alert"`** + **`aria-live="assertive"`** | 加载失败为关键错误态，便于辅助技术在进入该屏时感知。 |
| 空 **`errorMessage`** | 展开后若 **`trim()`** 为空，显示 **`STRINGS.error.noErrorText`** | 防御性；避免空白 **`pre`**。 |
| 文案 SSOT | 新增键全部写入 **`en.json`** 的 **`error`** 节点；**`strings.ts`** 继续 **`error: en.error`** 透传，无需改 **`strings.ts` 结构** | 与项目 HUD 英文 SSOT 规则一致。 |
| Storybook 四类 fixture | **`NetworkFailure`**（`requestFailed` 合成）、**`GzipFailure`**（代表性解压失败长句 fixture）、**`JsonParseFailure`**（`jsonParseFailed`）、**`LongStackTrace`**（多行 + **`max-h-[40vh]`** 滚动验证） | 计划：覆盖网络 / gzip / parse / 长栈四类展示；**`GzipFailure`** 文案为 Story 专用示例，不必与浏览器 **`DecompressionStream`** 抛出的逐字串完全一致。 |
| 单测范围 | **不修改** [`loadGalaxyData.test.ts`](../../frontend/src/utils/loadGalaxyData.test.ts) | 计划明确：store 与加载管线行为未变。 |

---

## 2. 最终操作（仓库内实际改动）

### 2.1 新增文件

| 文件 | 作用 |
|------|------|
| [frontend/src/components/LoadFailurePage.tsx](../../frontend/src/components/LoadFailurePage.tsx) | 全屏失败页：标题、详情 disclosure、Retry / Reload、**`role="alert"`**。 |
| [frontend/src/components/LoadFailurePage.stories.tsx](../../frontend/src/components/LoadFailurePage.stories.tsx) | Storybook：**`LoadFailurePage`** 下四个 story；decorator 提供 **`min-h-[520px]`** 宿主以便预览 fixed overlay。 |

### 2.2 修改文件

| 文件 | 变更摘要 |
|------|----------|
| [frontend/src/App.tsx](../../frontend/src/App.tsx) | **`galaxy-error`** 分支由约 20 行内联 JSX 替换为 **`<LoadFailurePage errorMessage={errorMessage} onRetry={() => void fetchGalaxyData()} />`**；增加 **`LoadFailurePage`** import。 |
| [frontend/src/lib/locales/en.json](../../frontend/src/lib/locales/en.json) | **`error`** 节点新增：**`reloadPage`**、**`showErrorDetails`**、**`hideErrorDetails`**、**`detailsRegionLabel`**、**`noErrorText`**；保留既有 **`title` / `retry` / `localDevHint*`**。 |

### 2.3 `en.json` 新增键（摘录）

| 键 | 用途 |
|----|------|
| `reloadPage` | Reload page 按钮文案 |
| `showErrorDetails` / `hideErrorDetails` | 折叠 toggler 文案 |
| `detailsRegionLabel` | 展开区 **`aria-label`** |
| `noErrorText` | **`errorMessage`** 为空或仅空白时的占位 |

---

## 3. 验收与观测

### 3.1 本地构建与测试（实施时已执行）

在 **`frontend/`** 目录：

```powershell
npm run build
npm test -- --run
npm run build-storybook
```

**结果：** **`tsc -b` + `vite build`** 通过；**Vitest** 全量通过；**Storybook static** 构建成功（产物中含 **`LoadFailurePage.stories-*.js`** chunk）。

### 3.2 手工冒烟（建议合并前后各做一次）

| 场景 | 操作 | 预期 |
|------|------|------|
| 网络失败 | 将 **`VITE_GALAXY_DATA_GZIP_URL`** 指向不可达域名后刷新 | 进入 **`LoadFailurePage`**；默认不展开；展开可见 **`requestFailed`** 风格文案；Retry / Reload 可用。 |
| 非 gzip / 解析失败 | 将 URL 指向非 gzip 或返回 HTML | 错误文案与 **`loadGalaxyGzip`** 抛错一致；UI 行为同上。 |
| Storybook | **`npm run storybook`** → **LoadFailurePage** | 四个 story 渲染正常；**`LongStackTrace`** 在展开后 **`pre`** 内可滚动。 |
| 键盘 | Tab 至 Retry，**Enter** 触发 | 再次调用 **`onRetry`**（App 内即 **`fetchGalaxyData`**）。 |

### 3.3 计划清单对照（P20.3 条目）

- [x] **`LoadFailurePage`** 抽离，**`App.tsx`** 仅保留一行组合调用  
- [x] 与 **`Loading`** 同款 **backdrop / overlay** 语义  
- [x] 主标题 **`STRINGS.error.title`**；详情默认折叠；**`aria-expanded`**  
- [x] **Retry** + **Reload page**  
- [x] **`localDevHint*`** 保留在展开区底部  
- [x] Storybook **4** 个 fixture  
- [x] **`loadGalaxyData.test.ts`** 未改  

---

## 4. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 |
|------|------|-------------|
| **`aria-live="assertive"`** 在部分读屏上过于频繁 | 低 | 若后续 UX 评审有噪声，可降为 **`polite`** 或缩小 live region 范围（仅对 toggler 旁短摘要 live）。 |
| 用户不习惯「先点展开才看到错误」 | 低 | 产品可在 P21+ 评估「首行摘要 + 折叠全文」；当前严格按计划默认收起。 |
| 回滚代码 | 中 | **`git revert c40bf8e`**（或等价提交），或 **`App.tsx`** 恢复内联块并删除两新文件（不推荐长期保留双路径）。 |

---

## 5. 后续衔接

- **Phase 20.6**：在 Tech Spec / Design 相关小节中可补一句「星系数据加载失败统一由 **`LoadFailurePage`** 呈现」；非本期强制。  
- **`.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md`** 中 **`p203-load-failure`** todo：主线合并本提交后，可将 **`status`** 更新为 **`completed`**。

---

*文档生成依据：Phase 20 计划 P20.3 节、分支 **`p20.3-load-failure-page`** 提交 **`c40bf8e`** 及当前仓库源码。*
