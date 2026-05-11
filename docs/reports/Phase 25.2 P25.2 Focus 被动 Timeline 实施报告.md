# Phase 25.2 — Focus 下 Timeline 可见但不可操作 实施报告

**范围**：`.cursor/plans/phase_25_core_experience_polish.plan.md` 子项 **P25.2**（Focus 下 timeline 保持渲染与读数，但禁止指针/键盘写入宏观 `zCurrent`）。  
**分支**：`phase/p25-2-focus-passive-timeline`  
**日期**：2026-05-11  
**状态**：代码已落地；本报告汇总**最终定稿**的产品与技术决策及工程操作。  
**说明**：Tech Spec / Design Spec 等 SSOT 文档的同步留在 **Phase 25.7**；本报告不替代上述文档，仅作实施留档。

---

## 1. 目标（与计划对齐）

1. **Focus 时仍显示全局时间轴 HUD**：刻度、当前年标记、`galaxyCameraZBridge` 上的读数与宏观时间轴语义一致，用户可对照当前聚焦影片的年份语境。
2. **Focus 时禁止通过 Timeline 改变宏观轴**：拖动轨道、点击刻度跳年、键盘 Home/End/方向键等**不得**再写入 `zCurrent` 或 `setGalaxyCameraZ`（与计划「禁用 pointer/keyboard slider 写入」一致）。
3. **退出 Focus 后立即恢复可操作**：`selectedMovieId` 清空后，Timeline 重新获得 `onZCurrentChange`，交互与 Phase 5.3.1 既有行为一致。
4. **无障碍**：Focus 下不把该控件暴露为可操作 `slider`（计划要求）。

---

## 2. 最终决策总表

| 主题 | 决策 |
|------|------|
| **Focus 判定信号** | 以 **`useGalaxyInteractionStore` 的 `selectedMovieId !== null`** 作为「影片 Focus」的唯一 HUD 侧开关（与 Drawer、FocusExitButton、场景 `filmFocus` 等既有约定一致）。**不**新增独立 `isTimelineDisabled` 之类标志，避免双源状态。 |
| **实现策略** | **不改造 `TimelineHud` 的 DOM 结构**；在应用层 `Timeline` 中，Focus 时向 `TimelineHud` **省略 `onZCurrentChange`**，复用组件内已有「被动 / Storybook 预览」分支（`interactive = Boolean(onZCurrentChange)`）。 |
| **读数来源** | 仍使用 **`useSyncExternalStore(subscribeGalaxyCameraZ, getGalaxyCameraZ, …)`** 作为 `cameraZ`；Focus 期间由 Three 场景侧继续维护 bridge 与 focus 进入动画等既有逻辑（参见 `scene.ts` 中 P13.4 相关注释），Timeline 仅**展示**，不写回 store。 |
| **文案与 i18n** | 被动模式下外层仍使用既有 **`str.timeline.axisDescription(…)`** 作为 `aria-label`；**未**新增 locale 键，无需跑全量 `locales.schema` 因本项而扩展 bundle。 |
| **计划看板** | `.cursor/plans/phase_25_core_experience_polish.plan.md` 中 **P25.2 todo** 已标为 **completed**。 |

---

## 3. 被动模式下 `TimelineHud` 行为（代码契约，无需再决）

当 **`onZCurrentChange` 未传入**时（本项在 Focus 下刻意为之）：

| 行为 | 说明 |
|------|------|
| `interactive` | `false` |
| 外层 `role` | `'img'`（非 `'presentation'` + 内层 slider） |
| 内层轨道 | **无** `role="slider"`、**无** `tabIndex`、**无** `aria-valuemin/max/now`、**无** 键盘步进处理 |
| 指针 | `pointer-events` 不提升到可拖区域；`onTrackPointerDown` 等首行即因无回调而 return |
| 刻度标签点击 | 不绑定跳年逻辑 |
| 视觉 | 刻度、拇指位置、`labelYear` 仍随 `cameraZ` 更新 |

上述行为全部来自既有 `TimelineHud` 实现；P25.2 **仅**在 `Timeline` 接线处切换是否传入回调。

---

## 4. 工程操作（修改路径一览）

| 路径 | 操作摘要 |
|------|-----------|
| `frontend/src/components/Timeline.tsx` | 订阅 `selectedMovieId`，定义 `filmFocus = selectedMovieId !== null`；渲染 `TimelineHud` 时使用 `onZCurrentChange={filmFocus ? undefined : onZCurrentChange}`。 |
| `.cursor/plans/phase_25_core_experience_polish.plan.md` | P25.2 子任务状态更新为 **completed**。 |

**刻意未改动的范围**

- `TimelineHud` 组件本体、Storybook、`galaxyCameraZBridge`、`scene.ts` 内 focus 与 `zCurrent` 动画逻辑：**未**为 P25.2 做结构性重写，以降低回归面。

---

## 5. 验收与回归

| 项 | 结果 / 说明 |
|----|----------------|
| 计划验收项 | Focus 下拖/点/键盘不改变 `zCurrent`；退出 focus 后恢复；**不**将禁用态误标为可操作 slider → 由被动分支满足。 |
| 类型检查 | `frontend` 目录执行 **`npx tsc --noEmit`**：**通过**。 |
| 单元测试 | **`npx vitest run src/components`**：**通过**（报告撰写时 1 file / 12 tests）。 |

**手工建议（短清单）**

1. 宏观态：拖动 Timeline，确认 `zCurrent` 与画面宏观 Z 联动正常。  
2. 进入 Focus（选中影片）：确认 Timeline 仍显示且拇指年份与当前 focus 语境一致；尝试拖/点/键盘，确认宏观轴不跟随。  
3. 退出 Focus：确认 Timeline 再次可拖且无障碍恢复为 slider 语义。

---

## 6. Git 提交线索（便于审计）

| 说明 | 值 |
|------|-----|
| 分支 | `phase/p25-2-focus-passive-timeline` |
| 代表性提交 | `b18a6b0` — `feat(timeline): passive HUD while film focus (P25.2)` |

若分支已合并，以主线上 **`git log --oneline -- frontend/src/components/Timeline.tsx`** 为准追溯。

---

## 7. 后续建议

1. **P25.7**：在 Tech Spec / Design Spec 中明确「Focus 下 Timeline 为只读展示、不写 `zCurrent`」及与 `selectedMovieId` 的耦合说明，避免读者误以为 focus 仍可拖时间轴。  
2. 若未来引入「非影片但仍需锁轴」的第三种模式，再评估是否抽出显式 `mode: 'interactive' | 'passive'` prop，以免 `undefined` 回调与「未接线」在类型上难以区分；**当前阶段**以计划为准保持最小改动。
