# Phase 14.4 — 全屏按钮与 F 快捷键实施报告（定稿）

本文档归档 Phase 14 子项 **P14.4** 的**最终决策**、**已落地操作**与**验收口径**。  
关联计划：`.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md`（`p144-fullscreen`）。  
交叉引用：《TMDB 电影宇宙 Design Spec》键盘快捷键（**F** 切换全屏）、**`STRINGS.hud.toggleFullscreen`**（`frontend/src/lib/locales/en.json`）。

---

## 1. 背景与范围

### 1.1 目标

在**不改动** 3D 渲染管线与数据契约的前提下：

- 提供 **HUD 全屏入口**（图标按钮）与 **`F` 键盘快捷键**，行为一致。
- 全屏状态变化时 **图标在 Maximize / Minimize 间同步**；兼容 **Safari / WebKit** 前缀 API。
- **可编辑区域聚焦**（搜索框等）时 **`F` 不劫持**，避免无法输入字母 `f`。
- 全屏切换触发的 **`resize`** 由既有 **`scene.ts` ResizeObserver** 接管（计划验收项）。

### 1.2 范围边界

| 纳入 P14.4 | 不纳入（其他子项） |
| ---------- | ------------------ |
| `fullscreenApi.ts`、`FullscreenButton.tsx`、`App.tsx` 内 `F` 处理、Storybook | **Cmd/Ctrl+K** 聚焦搜索（**P14.5**）；Design Spec / 视觉总表全文同步（**P14.8**） |

---

## 2. 最终锁定决策

| 编号 | 决策项 | 最终方案 |
| ---- | ------ | -------- |
| **D1** | 文案 SSOT | **`STRINGS.hud.toggleFullscreen`**，对应 **`en.json`**：`"Toggle fullscreen (F)"`；**不在组件内**重复写死可复用提示语。 |
| **D2** | 全屏目标元素 |  **`document.documentElement`**（整页根节点）；进入全屏用 **`requestFullscreen` / `webkitRequestFullscreen`**；退出用 **`exitFullscreen` / `webkitExitFullscreen`**。 |
| **D3** | 能力检测 | **`document.fullscreenEnabled \|\| document.webkitFullscreenEnabled`**；二者皆为假时 **不渲染**全屏按钮（`FullscreenButton` 返回 **`null`**）。 |
| **D4** | 当前全屏元素读取 | **`document.fullscreenElement ?? document.webkitFullscreenElement`**（封装为 **`getGalaxyFullscreenElement()`**）。 |
| **D5** | 事件同步图标 | 同时监听 **`fullscreenchange`** 与 **`webkitfullscreenchange`**，在回调中刷新内部 boolean 状态。 |
| **D6** | `F` 快捷键生效条件 | 仅在 **`document.activeElement`** **不是** **`HTMLInputElement` / `HTMLTextAreaElement` / `contentEditable` 宿主** 时处理；且 **`isGalaxyFullscreenAvailable()`** 为真。 |
| **D7** | `F` 与 ESC | **`F`** 处理与 **ESC 焦点栈**分 Key 分支，**互不覆盖**；均在 **`window` `keydown` capture** 阶段注册。 |
| **D8** | 失败静默 | **`toggleGalaxyFullscreen()`** 可能因策略/手势失败：按钮与快捷键路径 **`catch` 后忽略**（不抛未处理 rejection）。 |
| **D9** | HUD 布局（相对 Info） | 初版计划为「Fullscreen 在 Info **左侧**」；**产品修订后**定为：**Fullscreen 最靠右**，**Info 在其左侧**（用户可见从左到右：**Info → Fullscreen**）。 |
| **D10** | 视觉组件形态 | 与 **InfoButton** 一致的 **`Button` secondary + icon**、**`fixed z-40`**、黑半透明壳样式；**未**强制复用 **CloseButton**（计划依赖表曾提及 Icon 风格，落地与 Info 对齐）。 |

---

## 3. 架构与数据流

```
fullscreenApi.ts
  ├── getGalaxyFullscreenElement()
  ├── isGalaxyFullscreenAvailable()
  └── toggleGalaxyFullscreen()

FullscreenButton
  ├── onClick → toggleGalaxyFullscreen()
  ├── fullscreenchange / webkitfullscreenchange → 图标状态
  └── aria-label ← STRINGS.hud.toggleFullscreen

App.tsx (keydown capture)
  └── key F/f → 若可编辑区未聚焦且 API 可用 → toggleGalaxyFullscreen()
```

---

## 4. 实施操作清单

### 4.1 新增文件

| 路径 | 职责 |
| ---- | ---- |
| `frontend/src/hud/fullscreenApi.ts` | 标准与 WebKit 全屏 API 封装；单一出口供按钮与快捷键复用。 |
| `frontend/src/hud/FullscreenButton.tsx` | HUD 全屏按钮：`Maximize` / `Minimize`（`lucide-react`）；不支持 API 时不挂载。 |
| `frontend/src/hud/FullscreenButton.stories.tsx` | Storybook：**`HUD/FullscreenButton`**；仅当预览环境声明全屏能力时可见按钮。 |

### 4.2 修改文件

| 路径 | 职责 |
| ---- | ---- |
| `frontend/src/App.tsx` | 引入 **`FullscreenButton`**；同一 **`useEffect`** 内先于 ESC 分支处理 **`F`**；主界面 HUD 中 **`InfoButton`** 在 **`FullscreenButton`** 之前（DOM 顺序与从左到右布局一致）。 |

### 4.3 布局类名（定稿）

| 组件 | Tailwind 定位 |
| ---- | --------------- |
| **InfoButton** | `right-[3.75rem] top-3 sm:right-16 sm:top-4`（较靠左一粒） |
| **FullscreenButton** | `right-3 top-3 sm:right-4 sm:top-4`（屏幕最右缘一粒） |

两粒均为 **`size-10`**，间距与 Phase 14.4 初版「Fullscreen 在 `3.75rem` / Info 在 `right-3`」几何对调后保持一致。

### 4.4 Git 交付（参考）

| 说明 | 值 |
| ---- | -- |
| 分支（实施时） | `phase/p14.4-fullscreen` |
| 提交（示例） | **`feat(hud): P14.4 FullscreenButton + F shortcut (WebKit fullscreen API)`** |

布局互换可在后续提交中完成；以仓库 **`git log`** 为准。

---

## 5. 无障碍与键盘

- **`aria-label`**：单一来源 **`STRINGS.hud.toggleFullscreen`**（含 **`(F)`** 提示）。
- **`aria-pressed`**：随全屏与否切换，便于读屏识别状态。
- **图标**：**`aria-hidden`**，语义交给 **`aria-label`**。

---

## 6. 验收与回归

### 6.1 构建

- `cd frontend && npm run build`（`tsc -b` + `vite build`）通过。

### 6.2 功能

1. **点击全屏按钮**：进入 / 退出全屏；图标在 **Maximize** 与 **Minimize** 间切换。  
2. **按 `f` 或 `F`**：触发全屏切换（实现为 `e.key === 'f' \|\| e.key === 'F'`）。  
3. **搜索框聚焦**：按 **`F`** 应 **输入字母 `f`**，**不**触发全屏。  
4. **无全屏 API**：按钮不出现；**`F`** 不 **`preventDefault`**（早期返回）。  
5. **全屏后画布**：依赖既有 **`ResizeObserver`**，视口变化后 WebGL 尺寸正确（与计划 §P14.4 一致）。

### 6.3 Storybook

- 打开 **`HUD/FullscreenButton`**；在支持全屏的浏览器预览中可看到与 App 同风格的按钮。

---

## 7. 与后续子项关系

| 子项 | 关系 |
| ---- | ---- |
| **P14.5** | **Cmd/Ctrl+K** 与 **`F`** 可共用同一 `keydown` 监听块扩展；**不**与本节冲突。 |
| **P14.8** | 将 Design Spec「键盘快捷键」、Phase 14 总回归清单与本报告链接对齐；**`rg` 中文审计**时排除已定稿的文档与注释策略即可。 |

---

## 8. 已知限制与说明

- **iframe / Storybook**：部分环境下 **`fullscreenEnabled`** 为 false，故事可能为空 —— **属预期**，注释见 **`FullscreenButton.stories.tsx`**。  
- **浏览器快捷键冲突**：全屏由应用 capture 处理；若浏览器或扩展占用 **`F`**，以实际环境为准。

---

*报告结束。*
