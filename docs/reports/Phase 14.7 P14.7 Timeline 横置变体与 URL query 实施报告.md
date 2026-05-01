# Phase 14.7 — Timeline 横置变体与 URL query 实施报告（定稿）

本文档归档 Phase 14 子项 **P14.7** 的**最终决策**、**已落地操作**、**后续抛光迭代**与**验收口径**。不动 3D 渲染管线与数据契约；仅 HUD 层 React / CSS。

关联计划：`.cursor/plans/phase_14_hud_polish_ed74e27e.plan.md`（`p147-timeline-horizontal`）。  
交叉引用：《TMDB 电影宇宙 Design Spec》§3.1（Timeline orientation）；P14.3《hover ring × Timeline UI edge 对齐》— Timeline 继续使用 **`--ui-edge-canvas-*`** 与 **`--ui-edge-stroke-width`**。

---

## 1. 背景与范围

### 1.1 目标

- **纵置（默认）**：保持既有左侧年份轴交互与视觉（底部 = `z_min`，顶部 = `z_max`）。
- **横置（可选）**：底部居中主轴为**左右方向**，**左 = `z_min`，右 = `z_max`**；刻度在轴**下方**；与纵置共享 `yearTickList` 等逻辑与 P14.3 画布 edge token。
- **URL 切换**：通过查询参数 **`?timeline=vertical|horizontal`** 在首屏解析朝向；缺省或非法值 → **纵置**。
- **无障碍与文案**：外层轴描述、滑块 `aria-label` 走 **`STRINGS.timeline`**（`en.json` → `strings.ts`）。

### 1.2 范围边界

| 纳入 P14.7 | 不纳入 |
| ---------- | ------ |
| `Timeline.tsx` / `TimelineHud` 的 `orientation`；`useTimelineOrientationFromQuery`；`App.tsx` 接线；`Timeline.stories.tsx`；`en.json` / `strings.ts` 中 timeline 文案 | 修改 `meta.z_range`、银河相机数学、Zustand 中 `zCurrent` 语义 |
| 横纵视觉抛光：主轴长度感、thumb 字重、刻度与当前年重叠时的透明度策略 | i18n 框架；路由层同步 URL（无 React Router 场景下仅**初次**解析 query） |

---

## 2. 最终锁定决策

| 编号 | 决策项 | 最终方案 |
| ---- | ------ | -------- |
| **D1** | 默认朝向 | **`vertical`**；未传 `orientation` 或 URL 无合法参数时均为纵置。 |
| **D2** | URL 参数名与取值 | 参数名 **`timeline`**；允许 **`horizontal`**、**`vertical`**；其它 → 纵置。 |
| **D3** | Query 读取时机与实现 | 使用 **`useState` 惰性初始化**读取 `window.location.search`，避免在 **`useEffect` 内同步 `setState`** 触发 ESLint `react-hooks/set-state-in-effect`。SSR 安全：`typeof window === 'undefined'` → **`vertical`**。 |
| **D4** | 横轴几何映射 | 指针 **`clientX`** + 轨道 **`getBoundingClientRect().width`**：`zFromClientX`；thumb 位置用与纵轴相同的归一化分数 **`zToTrackLeftFraction`**（与 `zToTrackBottomFraction` 同式）。 |
| **D5** | 键盘 | 纵轴：**↑/→** 增大 Z，**↓/←** 减小 Z；横轴：**→/↑** 增大 Z，**←/↓** 减小 Z；**Home / End** 两端。 |
| **D6** | 画布 edge token | 横纵一律沿用 P14.3：**`--ui-edge-canvas-color`**、**`--ui-edge-canvas-color-strong`**、**`--ui-edge-stroke-width`**。 |
| **D7** | 文案 SSOT | **`timeline.axisDescription(minYear, maxYear, focusYear)`**、`timeline.sliderAriaLabel`**；键来自 **`frontend/src/lib/locales/en.json`**，经 **`frontend/src/lib/strings.ts`** 导出 **`STRINGS.timeline`**。 |
| **D8** | 刻度与 thumb 重叠 | 在主轴**归一化坐标**上计算 \(d = \|f_{\mathrm{tick}} - f_{\mathrm{thumb}}\|\)，**线性**映射透明度：**`opacity = min(1, d / R)`**，其中 **`R = TICK_LABEL_FADE_RADIUS_FRAC = 0.07`**（全轴长度 7% 内由重合过渡到完全可见）。**不使用** `transition-opacity`。 |
| **D9** | 极淡刻度与指针 | 当 **`opacity < 0.25`** 且可交互时，刻度容器 **`pointer-events: none`**，避免挡住主轴拖拽。 |
| **D10** | 当前年份字样 | Thumb 上的年份数字使用 **`font-semibold`**（横纵一致）。 |
| **D11** | 横轴容器宽度（截至本文档对应的源码） | 外层：`fixed` 底栏、`w-[50vw]`、`max-w-[calc(100vw-2rem)]`、`h-24`；纵轴轨道容器为 **`h-[80vh]`**（与横轴宽度数值不必像素相等，以产品迭代为准）。 |

---

## 3. 架构与数据流

```
URL ?timeline=
       │
       ▼
useTimelineOrientationFromQuery()  ──►  'vertical' | 'horizontal'（仅首帧解析）
       │
       ▼
App.tsx  <Timeline orientation={…} />
       │
       ▼
Timeline  ──►  meta.z_range + galaxyCameraZ bridge + zCurrent 写回
       │
       ▼
TimelineHud( orientation, zRange, cameraZ, onZCurrentChange )
```

- **状态**：宏观年份 **`zCurrent`** 仍在 **`galaxyInteractionStore`** + **`galaxyCameraZBridge`**；P14.7 **不新增** store 字段。
- **Storybook**：**`TimelineHud`** 可脱离银河数据；**`Timeline`** 依赖 store。

---

## 4. 实施操作清单（源码）

| 路径 | 职责 |
| ---- | ---- |
| `frontend/src/components/Timeline.tsx` | **`TimelineHud`**：`orientation`；横/纵两套布局；`zFromClientX` / 指针与键盘；**`tickLabelOpacityNearThumb`**；thumb **`font-semibold`**。**`Timeline`**：接收 `orientation` 并传入 `TimelineHud`。 |
| `frontend/src/hooks/useTimelineOrientationFromQuery.ts` | 解析 **`timeline`** query；DEV 下 **`console.log`** 参数与解析结果（状态可见性）。 |
| `frontend/src/App.tsx` | `useTimelineOrientationFromQuery()` → **`<Timeline orientation={…} />`**。 |
| `frontend/src/lib/locales/en.json` | **`timeline.axisDescription`**（`{{minYear}}` 等）、**`timeline.sliderAriaLabel`**。 |
| `frontend/src/lib/strings.ts` | **`STRINGS.timeline.axisDescription(...)`** 插值导出。 |
| `frontend/src/components/Timeline.stories.tsx` | **`Default`**（显式 `vertical`）、**`Horizontal`**、**`Interactive`**、**`InteractiveHorizontal`** 等。 |

---

## 5. 迭代与抛光（提交级摘要）

以下顺序反映仓库内 **Timeline 相关**提交的演进（具体 SHA 以 `git log` 为准）：

| 主题 | 内容 |
| ---- | ---- |
| 核心功能 | `orientation` + **`?timeline=`** 钩子 + **`STRINGS.timeline`** + Storybook 横纵 story。 |
| 横轴宽度 / 对齐感 | 由较窄上限 **`min(92vw, 36rem)`** 调整为与「主轴占视口比例」对齐的思路（曾用 **`80vw`**，后续提交调整为 **`50vw`** + `max-w-[calc(100vw-2rem)]`）。 |
| Thumb 与刻度 | 当前年 **`font-semibold`**；刻度在 thumb 附近 **线性透明度**；曾移除 **`transition-opacity`**；fade 由 smoothstep 改为**纯线性** **`min(1, d/R)`**。 |

---

## 6. Git 交付（参考）

| 说明 | 示例（以仓库为准） |
| ---- | ------------------ |
| 功能提交 | **`feat(hud): P14.7 Timeline horizontal orientation + ?timeline= query`** |
| 抛光提交 | **`polish(timeline): wider horizontal rail ...`**；**`refactor(timeline): linear tick fade ...`**；**`remove tick label opacity transition`**；**`adjust horizontal rail width ...`** 等 |

分支实施时常用名：**`feature/p14-7-timeline-horizontal`**（可与 `git branch -a` 核对）。

---

## 7. 验收口径

1. **默认无 query**：Timeline 为**纵置**，行为与 P14.7 前一致（除共用 `STRINGS` / 刻度 fade / thumb 字重等全局微调）。
2. **`?timeline=horizontal`**：底部横轴可拖拽 / 点击轨道 / 点刻度；左旧右新；当前年指示与纵置语义一致。
3. **`?timeline=vertical`**：显式纵置。
4. **非法值**：等价于默认纵置。
5. **Storybook**：**Timeline / Horizontal**、**InteractiveHorizontal** 可独立验收；无银河数据时 **`TimelineHud`** 即可。
6. **构建**：`frontend` 下 **`tsc`** / **`npm run build`** 通过。
7. **无障碍**：滑块具备合理 **`aria-*`**；外层 **`aria-label`** 为英文模板句。

---

## 8. 与后续文档 / 子项关系

| 子项 | 关系 |
| ---- | ---- |
| **P14.8** | 可将本报告纳入 Phase 14 总回归；Design Spec §3.1 若需与实现逐字对齐，以本文 **§2** 为准同步。 |
| **P14.3** | Timeline 线色与线宽仍遵守 **canvas edge** 分工，横置不新增 token。 |

---

## 9. 已知说明

- **URL 与朝向**：当前仅在组件挂载时用 **`useState` 初始化函数**读取一次 query；**不**监听 `popstate` / `hashchange`。用户手动改地址栏后需刷新页面才会更新朝向（与计划初稿一致，无 SPA 路由）。
- **源码注释**：若出现「竖轴 `h-[50vh]`」等字样，以 **`Timeline.tsx` 内实际 class**（纵轴 **`h-[80vh]`**）为准，避免文档与注释漂移。

---

*报告结束。*
