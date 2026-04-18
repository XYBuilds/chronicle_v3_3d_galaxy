# Phase 5.3.1 — Timeline 拖动跳转与 `zCurrent` 写入实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — Phase 5.3「交互增强」— **5.3.1 Timeline 拖动跳转**  
> **计划 Todo ID**: `p5-3-1-timeline-drag`（YAML frontmatter 中已标记为 **`completed`**）  
> **关联评估 Issue**: H2（时间轴应可拖动控制）  
> **报告日期**: 2026-04-18  
> **实施分支**: `phase-5-3-1-timeline-drag`  
> **提交**: `f1f7388` — `feat(timeline): Phase 5.3.1 drag and click to set zCurrent`  
> **依赖前置**: Phase 5.1.5 视距窗口模型（`zCurrent` / `zVisWindow` / `zCamDistance`）、`galaxyCameraZBridge`、每帧 `scene.ts` 对宏观相机 Z 与 bridge 的同步  

---

## 1. 本次目标

依据 Phase 5 后续计划中 **5.3.1** 条目与验收描述，在 Phase 4.4 已交付的**被动时间轴**基础上，完成：

1. **可交互**：用户可通过**拖动轨道**或**点击刻度**改变宏观时间焦点，并写入 **`useGalaxyInteractionStore` 的 `zCurrent`**（与滚轮宏观模式一致）。  
2. **与 5.1.5 衔接**：不引入第二套时间状态；仍以 store 中的 `zCurrent` 为权威，`scene.ts` 在 `selectionPhase === 'idle'` 时继续用 `zCurrent - zCamDistance` 驱动相机与 shader 的 `uZCurrent`。  
3. **指针策略**：计划原文为「移除 `pointer-events-none`」；实现为**外层 HUD 容器保持 `pointer-events-none`**，仅在**轨道与刻度**上使用 **`pointer-events-auto`**，避免左侧竖条整块遮挡画布点击/拖拽。  
4. **无障碍与键盘**：交互模式下轨道具备 **vertical slider** 语义与 **Home / End / 方向键** 微调。  
5. **Storybook**：补充可本地验证的 **Interactive** story（无 WebGL）。  
6. **Git**：在用户要求下于**独立分支**完成并提交。

---

## 2. Git 与执行摘要

| 项 | 内容 |
| --- | --- |
| 分支 | `git checkout -b phase-5-3-1-timeline-drag` |
| 变更文件 | `frontend/src/components/Timeline.tsx`、`frontend/src/components/Timeline.stories.tsx` |
| 提交 | `f1f7388` |

---

## 3. 代码改动说明

### 3.1 `Timeline.tsx`

**新增工具函数 `zFromClientY`**

- 根据轨道元素的 `getBoundingClientRect()`，将指针 **Y** 映射为小数年份 **Z**。  
- 约定与 Phase 4.4 一致：**轨道底部 = `zMin`、顶部 = `zMax`**（与 `zToTrackBottomFraction` 的几何一致）。

**`TimelineHudProps`**

- 新增可选回调 **`onZCurrentChange?: (z: number) => void`**。  
- **未传入**时：行为与 Phase 4.4 一致，轨道不抢指针（适用于仅展示的 Storybook 场景）。  
- **传入**时：轨道区域增加 `pointer-events-auto`、`touch-none`、抓取光标；实现 **`pointerdown` / `pointermove` / `pointerup`（及 cancel、lost capture）**，并在 `pointerdown` 时 **`setPointerCapture`**，保证拖出元素外仍能连续采样。

**刻度行**

- 在交互模式下为每行刻度增加 **`pointer-events-auto`**，**`pointerdown` + `stopPropagation`** 后调用 **`onZCurrentChange(y)`**，实现「点击刻度 → 跳到该整数年」。

**键盘**

- **`ArrowUp` / `ArrowRight`**：向 `zMax` 方向步进。  
- **`ArrowDown` / `ArrowLeft`**：向 `zMin` 方向步进。  
- **`Home` / `End`**：分别跳到 `zMin` / `zMax`。  
- 步长为 **`max(1, round((zMax - zMin) / 200))`**，大跨度数据集上仍保持可感知的跳转粒度。

**外层容器**

- 仍为 **`pointer-events-none`**；**内层轨道**在交互时 **`pointer-events-auto`**，满足「可拖区域可点」且不扩大整块 HUD 的命中盒到全宽叠层。

**`Timeline` 组件**

- 使用 **`useCallback`** 定义 **`onZCurrentChange`**（依赖 **`zRange`**，且在回调内再次校验长度），将 **`zCurrent`** 写入 **`useGalaxyInteractionStore`**，并 **`clamp` 到 `meta.z_range`**。  
- 同步调用 **`setGalaxyCameraZ(clamped)`**，使 **`useSyncExternalStore`** 订阅的 HUD 读数在下一帧 `scene` tick 之前即可更新，减少指示器滞后感。  
- **`useCallback` 置于任何早期 `return` 之前**，符合 React Hooks 规则。

### 3.2 `Timeline.stories.tsx`

- 新增 **`Interactive`** story：本地 **`useState`** 保存 `cameraZ`，传入 **`onZCurrentChange`**，用于在无星系场景下验证拖动与刻度点击。

### 3.3 未修改但需知晓的协同模块

| 模块 | 作用 |
| --- | --- |
| `frontend/src/three/scene.ts` | `idle` 下每帧 `camera.position.z = st.zCurrent - st.zCamDistance`，并更新 `uZCurrent`、**`setGalaxyCameraZ`** |
| `frontend/src/three/camera.ts` | 宏观滚轮仍写入 **`zCurrent`**，与 Timeline 写入同一字段 |
| `frontend/src/store/galaxyInteractionStore.ts` | 单一真相源 **`zCurrent`** |

---

## 4. 验收对照（计划 5.3.1）

| 计划要求 | 结果 |
| --- | --- |
| 移除（至少对拖拽区域）`pointer-events-none` | 轨道与刻度 **`pointer-events-auto`**；外层保持 none 以免挡画布 |
| 拖动 thumb 或点击刻度 → 写入 `zCurrent` | **拖动轨道**连续写 `zCurrent`；**点击刻度**写整数年 |
| 相机跟随 `zCurrent` 变化平滑移动 | **沿用** `scene` 每帧跟随 store；**拖动**为连续采样，视觉上平滑；**未**在 `scene` 内增加对 `zCurrent` 的插值缓动（避免与选片动画、滚轮手感耦合；若后续需要「大跳缓动」可单独立项） |

---

## 5. 验证建议

1. **应用内**：加载星系后，**拖动**左侧时间轴轨道，观察相机沿 Z 漫游与粒子 B 层窗口是否随年代变化。  
2. **与滚轮混用**：滚轮与 Timeline 交替操作，确认 **`zCurrent`** 一致、无反向两套状态。  
3. **选片态**：选中影片进入飞入/特写时，`scene` 在非 `idle` 下不按宏观 `zCurrent` 覆盖相机 Z；Timeline 仍可改 store，解选后相机与新区间对齐（与既有宏观/选中分工一致）。  
4. **Storybook**：打开 **Timeline → Interactive**，拖动与点击刻度，确认本地游标更新。  
5. **构建与 Lint**：`npm run build`、`npm run lint`（实施时均已通过）。

---

## 6. 后续可选改进（不在 5.3.1 范围内）

- 仅在 **idle** 且 **大跨度离散跳转**（例如只点击刻度）时对展示用 Z 做短时 **lerp**，与连续拖动、滚轮去抖策略分开配置。  
- 在 **选中/飞入** 期间禁用 Timeline 写入或弹出轻提示，避免用户误解「拖动无效」。

---

## 7. 文档与计划同步

- 本报告路径：`docs/reports/Phase 5.3.1 Timeline 拖动跳转与 zCurrent 写入 实施报告.md`  
- 计划文件 `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` 中 **`p5-3-1-timeline-drag`** 的 **`status`** 已更新为 **`completed`**。
