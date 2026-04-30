# Phase 13.1（P13.1）— 过渡曲线驱动器抽象 — 实施报告

> **范围**：仅 P13.1「基础设施」：抽出通用 `transitionDriver`，`scene.ts` 中 `applySelectionFrame` 改为统一读取已缓动的 `progress`；**不**引入 `uSelectionMode=2`、邻域 mask、轨道相机、Timeline snap、HUD 图例（留给 P13.2–P13.5）。  
> **主文件**：新建 `frontend/src/three/transitionDriver.ts`；修改 `frontend/src/three/scene.ts`。  
> **计划来源**：`.cursor/plans/phase_13_focus_experience_ab016b85.plan.md`（P13.1 条目）。  
> **Git（实施提交）**：分支 `feat/p13-1-transition-driver`，提交 `a7235c7`（message：`feat(p13.1): add transitionDriver and wire focus selection easing`）。

---

## 1. 目标与验收口径（计划对齐）

| 计划要求 | 本次处理 |
|----------|----------|
| 新建 `transitionDriver.ts`，接口含 `easeOutCubic`、`createTransitionDriver`、`progress` / `active` / `start` / `reverse` / `setImmediate` / `tick` | **已实现**，见 §3 |
| `applySelectionFrame` 内 `selecting` / `deselecting` 共用同一 `focusDriver`，`selected` 保持 `progress` 语义为 1、`idle` 为 0（不每帧 tick） | **已实现** |
| 进入 **700ms** / 退出 **450ms**，缓动仍为 **easeOutCubic**，与重构前 **1:1** | **已实现**：`SELECT_MS` / `DESELECT_MS` 未改；插值公式与旧版数学等价（见 §4） |
| 本子 phase **不改任何视觉行为** | **未改** shader、Leva 默认值、mask 逻辑；仅时间轴驱动从「手写 `animStartMs` + `t`」迁到 driver |

---

## 2. 最终决策汇总

1. **单一语义 `progress`（已 ease）**  
   `focusDriver.progress` 表示「focus 混合进度」：`selecting` 时与旧版 `easeOutCubic(t)` 一致，从 0→1；`deselecting` 时从 1→0，且 **`uFocusCameraBlend = progress`**，相机 lerp 权重为 **`1 - progress`**（与旧版 `camEased` / `1 - camEased` 分工一致）。

2. **`start()` 在调用当帧将 `progress` 置 0**  
   从 `selected` 换片再次 `beginSelect` 时，旧逻辑等价于 `t` 从 0 重算；若在 `start()` 与首次 `tick` 之间仍保留上一段 `progress === 1`，会出现一帧错误的 blend。故 **`start()` 内立即 `progress = 0`**，再启动 0→1 动画。

3. **`beginDeselect`：`setImmediate(1)` 后 `reverse(DESELECT_MS)`**  
   旧版在 `deselecting` 首帧恒有 `uFocusCameraBlend = 1 - easeOutCubic(0) = 1`。若在 **`selecting` 中途取消 focus**（`selectedMovieId` 置 `null` 仍允许），此时上一帧 blend 可能 < 1；与旧行为对齐需 **先 snap 到 `progress = 1`** 再执行 1→0 的 `reverse`。从 `selected` 退出时 `progress` 本就为 1，`setImmediate(1)` 为幂等。

4. **动画结束判定**  
   在 `tick(nowMs)` 之后，用 **`!focusDriver.active`** 判定本段动画结束（内部在 `u >= 1` 时将 `running` 置 `false` 并夹紧 `progress` 到端点）。等价于旧代码的 **`t >= 1`**，且避免对 `progress` 做浮点阈值比较。

5. **时钟**  
   `start` / `reverse` 仍用 **`performance.now()`** 记录段起点，与旧 `animStartMs = performance.now()` 一致；`tick` 入参为 rAF 传入的 **`nowMs`**，与旧 `(nowMs - animStartMs) / duration` 一致。

6. **`reverse` 的通用语义**  
   接口支持从 **当前 `progress`** 插值到 0（`fromP = progress`）。当前 `scene` 在 `beginDeselect` 前强制 `setImmediate(1)`，故生产路径上 **`deselecting` 恒为 1→0**；driver 仍保留「从任意进度拉回」能力，供后续 P13.3/P13.4 等挂接同一通道时复用。

7. **未纳入本报告代码的验收项**  
   计划中的「`console.log` 时间戳抽样比对」「`focusNonTargetActiveAlpha` 曲线」属手工回归；`uFocusCameraBlend` 与相机 lerp 仍与 P11.1 报告中的表一致，仅 **`t` 的来源** 改为 `focusDriver.progress` / `1 - focusDriver.progress`。

---

## 3. 模块与接口（实现摘要）

**文件**：`frontend/src/three/transitionDriver.ts`

| 导出 | 作用 |
|------|------|
| `EasingFn` | `(t: number) => number`，`t` 为线性归一化时间 ∈[0,1] |
| `easeOutCubic` | 与原先 `scene.ts` 内实现等价：`clamp` 后 `1 - (1-t)³` |
| `createTransitionDriver()` | 闭包状态机：`progress`、`active`（即内部 `running`） |
| `start(durationMs, { easing?, onDone? })` | `progress←0`，`0→1`，`duration = max(1, durationMs)` |
| `reverse(durationMs, { easing?, onDone? })` | `fromP←progress`，`toP←0` |
| `setImmediate(0 \| 1)` | 停止动画，`progress` 快照到端点 |
| `tick(nowMs)` | 若 `running`，更新 `progress`；到达终点时清 `running` 并可选 `onDone()` |

**`scene.ts` 挂载点**

- `const focusDriver = createTransitionDriver()`（与 `selectionPhase` 同作用域）。
- `beginSelect`：`focusDriver.start(SELECT_MS)`，取代 `animStartMs`。
- `beginDeselect`：`focusDriver.setImmediate(1)` + `focusDriver.reverse(DESELECT_MS)`。
- `applySelectionFrame`：`selecting` / `deselecting` 首行 `focusDriver.tick(nowMs)`，再读 `progress` 写相机与 `uFocusCameraBlend`。

---

## 4. 与旧实现的数学等价表

设线性时间 `u = clamp((nowMs - startMs) / duration, 0, 1)`，默认 easing 为 `easeOutCubic`。

| 阶段 | 旧变量 | 新变量 | 相机 lerp 权重 | `uFocusCameraBlend` |
|------|--------|--------|----------------|---------------------|
| `selecting` | `camEased = easeOutCubic(u)` | `p = progress = easeOutCubic(u)` | `p` | `p` |
| `deselecting` | `camEased = easeOutCubic(u)`，`blend = 1 - camEased` | `p = progress = 1 - easeOutCubic(u)` | `1 - p = easeOutCubic(u)` | `p` |

常量未变：`SELECT_MS = 700`，`DESELECT_MS = 450`。

---

## 5. 状态机与 driver 状态（简述）

| `selectionPhase` | 是否 `tick` driver | `progress` 语义（典型） |
|------------------|--------------------|-------------------------|
| `idle` | 否 | 保持 0（由上次 `deselecting` 结束或初始态保证） |
| `selecting` | 是 | 0→1（easeOutCubic） |
| `selected` | 否 | 保持 1（最后一次 `selecting` 的 tick 已落端点） |
| `deselecting` | 是 | 1→0（easeOutCubic 映射为 `1 - ease(u)`） |

---

## 6. 执行操作清单（工程）

1. 新建 Git 分支：`feat/p13-1-transition-driver`。  
2. 新增 `frontend/src/three/transitionDriver.ts`。  
3. 修改 `frontend/src/three/scene.ts`：删除本地 `easeOutCubic` 与 `animStartMs`；接入 `focusDriver`。  
4. 本地验证：`npm run build`（`tsc -b && vite build`）、`npm run test`（Vitest）通过。  
5. 提交：`a7235c7`。  
6. 计划看板：`.cursor/plans/phase_13_focus_experience_ab016b85.plan.md` 中 `p131-transition-driver` 标记为 **completed**。

---

## 7. 后续依赖（供 P13.2+ 使用）

同一 `focusDriver`（或同类型驱动器）可被用于：

- P13.2 邻域 mask 淡入淡出（若需与 focus 进出同步）；  
- P13.3 轨道相机与欧拉角 **slerp** 的权重通道；  
- P13.4 Timeline `zCurrent` 与电影 `z` 的渐变；  
- P13.5 HUD 图例显隐。

本阶段 **未** 将上述系统接入 `onDone` 或额外订阅，仅完成 **单通道 progress** 抽象与 scene 内 focus 进出接线。

---

## 8. 参考路径

- 计划：`.cursor/plans/phase_13_focus_experience_ab016b85.plan.md`（「P13.1 过渡曲线驱动器抽象」节）  
- 实现：`frontend/src/three/transitionDriver.ts`，`frontend/src/three/scene.ts`（`applySelectionFrame` / `beginSelect` / `beginDeselect`）  
- 与 focus 混合相关的 shader 行为仍见：`docs/reports/Phase 11.1 P11.1 focus 态非目标 active 透明度与相机同步 实施报告.md`
