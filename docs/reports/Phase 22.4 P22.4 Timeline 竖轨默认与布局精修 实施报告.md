# Phase 22.4（P22.4）— Timeline 竖轨默认、横竖双形态与布局精修 — 实施报告

> **范围**：HUD **Timeline** 以 **horizontal** 成熟样式为基线升级 **vertical** 左轨；**产品默认**改为 **vertical**；保留 **`?timeline=`** 切换与 **Storybook** 回归；在验收迭代中修正刻度与主轨的几何关系，并定稿 **刻度在轨右侧**、**当前年在拇指横杠右侧**。  
> **计划来源**：`.cursor/plans/phase_22_visual_interaction_polish_f88228c5.plan.md`（§ P22.4 Timeline vertical 默认 + 保留 horizontal 切换）  
> **实施分支**：`p22-4-timeline-vertical-default`  
> **报告日期**：2026-05-08

---

## 1. 最终决策（定稿）

| 议题 | 决策 |
|------|------|
| 产品默认朝向 | **无 query / 非法 query** 时 Timeline 为 **`vertical`**（左轨）。与 Phase 14.7 时期「默认横置」相反，本阶段以计划 P22.4 为准收口。 |
| URL 切换 | 保留 **`?timeline=horizontal`**、**`?timeline=vertical`**；二者显式有效；**非法值**回退到与缺省一致 → **`vertical`**。 |
| 底层算法 | **`zToTrackBottomFraction` / `zToTrackLeftFraction`、`zFromClientY` / `zFromClientX`** 与刻度生成逻辑 **不改**；仅改 DOM 布局、样式与 query 默认解析。 |
| 竖轨容器 | **`fixed left-3 top-[8vh] z-30 h-[80vh] w-12 sm:left-5`**，**`overflow-visible`**，轨道区 **`w-full flex-1`**，与计划中的左轨 + 80vh 窄宽一致。 |
| 视觉与横版对齐 | 主轨与拇指使用同一套 **`--ui-edge-stroke-width` / `--ui-edge-canvas-color*`**；滑块 **focus ring** 与横版一致（**`--ui-edge-canvas-color-strong`**）；拇指条 **发光 box-shadow** 与横版同款。 |
| 刻度年份相对主轨 | **最终**：刻度文字（1880、1900 等）置于 **竖线右侧**半区：**`left-1/2 right-0` + `justify-start pl-3`**，保证与中线 **正间距**，避免与线重叠。 |
| 当前年展示 | **竖轨拇指**：**横杠几何中心对齐竖线**（**`-ml-2.5`** 配合 **`w-5`** 与 **`left-1/2`** 行内布局），**`labelYear`** 文案在 **横杠右侧**（**`flex-row` + `gap-1.5`**）。 |
| 横轨刻度间距 | 横版刻度与主线垂直间距由 **`mt-1` → `mt-2`**（验收中「加大一档」的落点）。 |
| 横轨拇指年份 | **最终**：横轨拇指 **仅保留竖条**，**不**在拇指旁重复绘制年份（与竖轨「当前年在横杠右侧」分工一致；**`aria-valuenow` / 轴 `aria-label`** 仍提供读屏年份）。 |
| 键盘与 a11y | **ArrowUp / ArrowDown**（竖轨）、**Home / End** 等行为 **不变**；**`aria-valuenow` / `aria-orientation` / `STRINGS.timeline`** 路径不变。 |
| Storybook | **`Default`** = **vertical**；新增 **`Horizontal`** 专测底部横条；**`Interactive`** 固定 **`orientation="horizontal"`** 保留横条拖拽回归；**`InteractiveVertical`** 测竖轨拖拽；**`CameraAtMinZ` / `CameraAtMaxZ` / `WideZSpan`** 显式 **`vertical`**。 |
| App 接线 | **`App.tsx`** 仍仅 **`useTimelineOrientationFromQuery()` → `<Timeline orientation={…} />`**，**无需**为 P22.4 单独改文件。 |
| 文档 SSOT | **Tech Spec / Design Spec** 中若仍写「默认横置」「缺省 horizontal」等，与现实现不一致处 **划归 Phase 22.9（P22.9）** 批量修订；**本子任务不**在 `docs/project_docs/` 内做全文同步（与 P22.2 / P22.3 子报告策略一致）。 |

---

## 2. 最终操作（代码与路径）

| 操作 | 路径 | 说明 |
|------|------|------|
| Query 默认 vertical | [`frontend/src/hooks/useTimelineOrientationFromQuery.ts`](../../frontend/src/hooks/useTimelineOrientationFromQuery.ts) | **`timeline`** 缺省 / 非法时返回 **`vertical`**；**`horizontal` \| `vertical`** 原样返回。注释更新为 P14.7 / P22.4。 |
| `TimelineHud` / `Timeline` 默认 `vertical` | [`frontend/src/components/Timeline.tsx`](../../frontend/src/components/Timeline.tsx) | **`orientation = 'vertical'`**；**`TimelineHudProps`** 注释更新。 |
| 竖轨 UI 与拇指 | 同上 | 左轨容器、主轨竖线、刻度行、拇指 **横杠 + 右侧年份**；**`-ml-2.5`** 使横杠中心落在 **`left-1/2`** 锚点；刻度区 **`left-1/2 right-0 justify-start pl-3`**。 |
| 横轨刻度 / 拇指 | 同上 | 刻度 **`mt-2`**；拇指仅 **竖条**（无旁路年份 span）。 |
| Storybook | [`frontend/src/components/Timeline.stories.tsx`](../../frontend/src/components/Timeline.stories.tsx) | **`Default`** vertical、**`Horizontal`**、**`Interactive`** 显式 horizontal、**`InteractiveVertical`**、其余 story 显式 **`vertical`**；移除与 **Default** 重复的 **`Vertical`** story。 |

**实施过程中的纠偏（已合入最终代码，供审计）**

| 现象 | 处理 |
|------|------|
| 全宽 **`left-0 right-0` + `justify-end`** 导致刻度压 **50%** 竖线、出现「负间距」重叠 | 改为 **仅以左或右半区** 承载刻度，并用 **`pr` / `pl`** 与中线留白；最终定稿为 **右半区 + `pl-3`**。 |
| 拇指年份位置 | 先移除再恢复；最终为 **横杠右侧**，且横杠 **对中竖线**。 |

---

## 3. Git 提交摘要（按时间顺序）

| Hash（简写） | 说明 |
|--------------|------|
| `6858519` | **feat(timeline)**：P22.4 主干 — query 与组件默认 **vertical**；竖轨布局与横版 token/交互对齐；Storybook 调整。 |
| `f37b598` | **polish(timeline)**：横轨刻度 **`mt-2`**；一度移除拇指旁年份（为后续纠偏铺垫）。 |
| `0902326` | **fix(timeline)**：竖轨刻度 **左半区** 避线；拇指 **横杠 + 右侧 `labelYear`**。 |
| `04e262a` | **polish(timeline)**：竖轨刻度改至 **中线右侧**（`left-1/2 right-0` + `pl-3`），与产品「文字在右侧」一致。 |

（若已合并入 `main`，以目标分支上 **`git log -- frontend/src/components/Timeline.tsx`** 为准。）

---

## 4. 验收记录

| 项 | 结果 |
|----|------|
| 单元测试 | **`frontend`** 下 **`npm test -- --run`**（Vitest）：实施过程中 **81 / 81 通过**（最后一次跑测记录）。 |
| 生产构建 | **`npm run build`**（**`tsc -b` + `vite build`**）通过。 |
| 默认竖轨 | 无 **`timeline`** query 进入应用 → **左侧**时间轴；**`?timeline=horizontal`** → **底部**横条。 |
| 刻度与主轨 | 竖轨 **1880 / 1900** 等与竖线 **不重叠**，间隔由 **`pl-3`** 与半区划分保证。 |
| 当前年 | 竖轨拇指 **横杠右侧** 可见 **`labelYear`**；读屏仍依赖 **`aria-valuenow`** 等。 |
| Storybook | **Timeline** 类目下 **Default / Horizontal / Interactive / InteractiveVertical** 等可目视回归。 |

---

## 5. 与计划 P22.4 的对照

| 计划项 | 结果 |
|--------|------|
| 以 horizontal 为基线升级 vertical 布局与指针映射 | **已完成**（竖轨仍 **`zFromClientY`**，未改算法函数）。 |
| 默认 **vertical**（无 query） | **已完成**（hook + 组件默认）。 |
| 保留 **horizontal** 与 **`?timeline=`** | **已完成**。 |
| **ESC / 方向键 / Home / End** | **未改逻辑**，与计划一致。 |
| Storybook vertical 默认态 + horizontal 回归 | **已完成**（见 §2）。 |
| Tech Spec / Design Spec 等文档同步 | **未在本子任务做** → **P22.9**。 |

---

## 6. 风险与回滚

| 风险 | 缓解 |
|------|------|
| 用户习惯旧「默认横置」 | 文档与封面说明在 **P22.9** 更新；临时可用 **`?timeline=horizontal`**。 |
| 窄轨 **`w-12`** 与长年份、右侧刻度 | **`overflow-visible`**；若极端语言或字号需再调 **`pl-3` / `w-12`**，属视觉 dial-in。 |
| 刻度点击热区仅为半宽 | 可接受；主区域仍为 **整条竖轨拖拽**。 |

**回滚**：将 **`useTimelineOrientationFromQuery`** 缺省改回 **`horizontal`**；**`Timeline` / `TimelineHud`** 默认改回 **`horizontal`**；**Storybook Default** 与 query 解析对齐回退；竖轨布局可整段 revert 上述 commit 链。

---

## 7. 附录 — `?timeline=` 行为表（定稿）

| URL | 解析结果 |
|-----|----------|
| （无参数） | **`vertical`** |
| `?timeline=vertical` | **`vertical`** |
| `?timeline=horizontal` | **`horizontal`** |
| `?timeline=foo` 等非法值 | **`vertical`** |

---

## 8. 参考链接

- 计划：[`phase_22_visual_interaction_polish_f88228c5.plan.md`](../../.cursor/plans/phase_22_visual_interaction_polish_f88228c5.plan.md)  
- Phase 14.7 横纵变体历史报告：[`Phase 14.7 P14.7 Timeline 横置变体与 URL query 实施报告.md`](Phase%2014.7%20P14.7%20Timeline%20横置变体与%20URL%20query%20实施报告.md)（默认策略以 **P22.4 本报告** 为准）
