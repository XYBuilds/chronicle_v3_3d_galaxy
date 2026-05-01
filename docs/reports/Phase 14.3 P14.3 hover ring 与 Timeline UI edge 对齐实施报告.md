# Phase 14.3 — hover ring × Timeline UI edge 对齐实施报告（定稿）

本文档归档 Phase 14 子项 **P14.3** 的**最终决策**、**已落地操作**与**验收口径**，并与 **P14.2**（DOM 用 `--ui-edge-*`）区分画布叠层专用 token。  
关联计划：`.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md`（`p143-edge-align`：**completed**）。  
交叉引用：《TMDB 电影宇宙 Design Spec》**§3.5**（Close 控件与 UI edge）、**§3.4.4**（`?theme=` 与画布关系）；《视觉参数总表》**§7**、**§7a**。

---

## 1. 背景与范围

### 1.1 目标

在**不改动** 3D 渲染管线与数据契约的前提下：

- **HoverRing**（行星悬停 HTML 环）与 **Timeline**（年份轴 HUD）的**线宽与描边色**与 P14.2 引入的 **UI edge** 体系一致，肉眼上属于同一「细线家族」。
- 线宽统一来自 **`--ui-edge-stroke-width`**；布局数学（外环半径、Tooltip `sideOffset`）与视觉描边厚度一致，避免 JS 写死 `1` 与 CSS 变量漂移。

### 1.2 范围边界

| 纳入 P14.3 | 不纳入（刻意排除） |
| ---------- | ------------------ |
| `hoverRingLayout.ts`、`HoverRing.tsx`、`Timeline.tsx`、`index.css` 中与上述对齐直接相关的 token 与引用 | **CloseButton**、Drawer / SearchBar 等**叠在 DOM 壳层**上的控件（继续仅用 **`--ui-edge-color` / `--ui-edge-color-strong`**，随 `?theme=` / `.dark` 变化） |
| 画布专用 **`--ui-edge-canvas-*`** 的命名与落点 | Timeline **orientation / URL query**（**P14.7**）；Timeline **`aria-label` 与 `STRINGS` 完全收敛**（**P14.1 D7** 已记，可 **P14.8** 小修） |

---

## 2. 最终锁定决策

| 编号 | 决策项 | 最终方案 |
| ---- | ------ | -------- |
| **D1** | 线宽来源 | **单一 CSS 变量** **`--ui-edge-stroke-width`**（默认 **`1px`**）。JS 布局通过 **`readUiEdgeStrokeWidthPx()`** 解析 `document.documentElement` 上的该变量；非法或缺失时 **`console.warn`** 并回退 **`1`**；无 `document`（SSR）时回退 **`1`**。 |
| **D2** | 移除 `HOVER_RING_STROKE_PX` | 不再导出该常量，避免与 token **双源**；文档与总表以 **token + `readUiEdgeStrokeWidthPx`** 为 SSOT。 |
| **D3** | HoverRing 实现形态 | 使用 **`div` + `border`**（圆环），**非**计划草稿中的 SVG `stroke`；语义等价： **`borderWidth` / `borderColor`** 绑定 token。 |
| **D4** | Timeline 视觉绑定 | 主轴竖线、刻度年份字色、当前年指示横线及其 glow、当前年文字、可交互轨 **`focus-visible` ring** 均与 edge 体系对齐；线宽走 **`var(--ui-edge-stroke-width)`**，颜色区分为普通 / 强调两档。 |
| **D5** | 画布永远在黑底上 | **HoverRing** 与 **Timeline** 仅叠在 **黑色 WebGL 画布**上；在 **`?theme=light`** 下 HUD 壳层可为浅色，但环与时间轴**不得**改用浅色主题下的 **`--ui-edge-color`**（否则对比度错误）。 |
| **D6** | 画布专用 token | 在 **`:root`** 增加 **`--ui-edge-canvas-color`**、**`--ui-edge-canvas-color-strong`**，数值与 **`.dark`** 下 **`--ui-edge-color` / `--ui-edge-color-strong`** 一致（半透明白），且**不**被 `html[data-theme="light"]` 覆盖；环与时间轴**仅引用 canvas 变量**。 |
| **D7** | DOM 用 token 不变 | **`CloseButton`**、后续全屏等**非画布直叠**控件仍用 **`--ui-edge-color*`**，随主题切换。 |

---

## 3. 架构与 token 分工

```
index.css :root
  ├── --ui-edge-stroke-width          ← 全局线宽（环 / Timeline / CloseButton 边框宽度语义）
  ├── --ui-edge-color / -strong       ← DOM 壳（:root 浅色边；.dark 浅色边）
  └── --ui-edge-canvas-color / -strong ← 仅黑底画布（固定「暗色 HUD 边线」观感）

hoverRingLayout.readUiEdgeStrokeWidthPx()  ──►  读 --ui-edge-stroke-width
HoverRing / Timeline 颜色类属性           ──►  var(--ui-edge-canvas-color*)
CloseButton / …                           ──►  var(--ui-edge-color*)
```

**调参约定**：改「画布上细线家族」→ 调 **`--ui-edge-canvas-*`** 与（若需）**`--ui-edge-stroke-width`**；改「抽屉 / 搜索栏关闭钮」→ 调 **`--ui-edge-color*`**（及 `.dark` / `data-theme` 下已有覆盖）。

---

## 4. 实施操作清单

### 4.1 变更文件（源码）

| 路径 | 职责 |
| ---- | ---- |
| `frontend/src/index.css` | **`:root`**：`--ui-edge-canvas-color` / `--ui-edge-canvas-color-strong`；注释标明 P14.2 DOM edge 与画布 edge 分工。 |
| `frontend/src/hud/hoverRingLayout.ts` | 新增 **`readUiEdgeStrokeWidthPx()`**；**`hoverRingOuterRadiusPx`** / **`hoverTooltipSideOffsetPx`** 使用解析值；删除 **`HOVER_RING_STROKE_PX`**。 |
| `frontend/src/hud/HoverRing.tsx` | **`borderWidth: 'var(--ui-edge-stroke-width)'`**，**`borderColor: 'var(--ui-edge-canvas-color)'`**（画布锁定）。 |
| `frontend/src/components/Timeline.tsx` | 主轴、刻度、thumb、glow、当前年字色、**`focus-visible` ring** 使用 **`--ui-edge-canvas-color*`** 与 **`--ui-edge-stroke-width`**。 |

### 4.2 Git 交付（参考）

| 说明 | 值 |
| ---- | -- |
| 分支（实施时） | `phase14/p14-3-edge-align` |
| 提交 1 | **`feat(hud): P14.3 align HoverRing and Timeline with UI edge tokens`** — token 对齐 + `readUiEdgeStrokeWidthPx` + Timeline 全量接变量 |
| 提交 2 | **`fix(hud): lock hover ring and timeline edges to canvas (dark) tokens`** — 引入 **`--ui-edge-canvas-*`** 并切换环 / Timeline 引用 |

（具体 SHA 以仓库 `git log` 为准。）

---

## 5. 验收与回归

### 5.1 构建

- `cd frontend && npm run build`（`tsc -b` + `vite build`）通过。

### 5.2 视觉

1. **同屏**：悬停某球出现 **HoverRing** 与 **Timeline** idle 状态并列时，主线与环的**线宽**一致（默认 1px），**色相家族**一致（半透明白系）。  
2. **`?theme=light`**：抽屉 / 搜索栏等 DOM 细线随浅色主题变化；**环 + Timeline** 仍为 **黑底上的浅色细线**，与画布对比度正确。  
3. **`?theme=dark` 或默认**：DOM 与画布细线若同为白系，可接近一致，属预期。

### 5.3 布局

- **MovieTooltip** 等与 **`hoverTooltipSideOffsetPx`** 相关的竖向偏移，在修改 **`--ui-edge-stroke-width`**（例如改为 `2px`）后仍与环外沿一致（依赖 **`readUiEdgeStrokeWidthPx()`**）。

---

## 6. 与后续子项关系

| 子项 | 关系 |
| ---- | ---- |
| **P14.8** | 可将本报告链接写入 Phase 14 总回归清单；若需「一键调参」文档图，可在总表中维护 **§7a** 与实现同步。 |
| **P14.7** | Timeline **横置**复用同一套 **canvas + stroke** token 即可，无需重复决策。 |

---

## 7. 文档同步记录（与本报告一并交付）

| 文档 | 更新要点 |
| ---- | -------- |
| `docs/project_docs/视觉参数总表.md` | **§7** 去掉已删除常量 **`HOVER_RING_STROKE_PX`**，改为 **`readUiEdgeStrokeWidthPx` / `--ui-edge-stroke-width`**；**§7a** 拆分 **DOM `--ui-edge-*`** 与 **画布 `--ui-edge-canvas-*`**。 |
| `docs/project_docs/TMDB 电影宇宙 Design Spec.md` | **§3.5** 视觉条：区分 **CloseButton**（主题跟 **`--ui-edge-*`**）与 **HoverRing / Timeline**（**`--ui-edge-canvas-*`**）。 |
| `.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md` | **`p143-edge-align`** 标为 **completed**；正文 **§P14.3** 与实现一致（`div` border、canvas token、验收口径）。 |

---

*报告结束。*
