# Phase 25.3 — active mesh retarget alpha（focus 内换星不闪不透明）实施报告

**范围**：`.cursor/plans/phase_25_core_experience_polish.plan.md` 子项 **P25.3**（修复 activeR 内换星时非目标 active mesh 短暂回到不透明；拆分「相机过渡进度」与「focus 下非目标 active 压暗进度」语义）。  
**分支**：`p25-3-active-mesh-retarget-alpha`  
**代表性提交**：`a21b8bb`（`fix(three): P25.3 split focus camera blend vs active dim blend`）  
**日期**：2026-05-12  
**状态**：代码已落地；本报告汇总**最终定稿**的产品与技术决策及工程操作。  
**说明**：Tech Spec / Design Spec /《视觉参数总表》/《星球状态机 spec》等仍大量引用 **P11.1** 时期「非目标 active alpha 与 `uFocusCameraBlend` 同源」的表述；**P25.7** 需将 active 压暗通道更新为 **`uFocusActiveDimBlend`** 与下表语义。本报告为实施留档与事实来源之一。

---

## 1. 目标（与计划对齐）

1. **现象**：在 **focus 内**（`selectionMode === 2` 邻域、`selected` 会话中）从一个 activeR 星球切换到另一颗时，`focusDriver.start()` 将 `progress` 从 **0** 重新动画到 **1**，`uFocusCameraBlend` 同步从 0 增长。`galaxyActive.vert.glsl` 中非目标透明度为 `mix(1.0, uFocusNonTargetActiveAlpha, blend)`，**blend=0 时等价于完全不透明**，邻域 active 出现一帧或多帧的「闪回不透明」再恢复半透明。
2. **目标**：**focus 内 retarget** 时非目标 active **始终保持压暗**，不回到 alpha≈1；**宏观 → focus** 首次进入时仍保留 **0→1 渐进压暗**（与 P11.1 产品预期一致）。
3. **计划验收**：宏观 → focus 背景 active 平滑变暗；focus 内换星背景 active 不闪回不透明；focus → macro 正常恢复。

---

## 2. 最终决策总表

| 主题 | 决策 |
|------|------|
| 根因认定 | **单一标量 `uFocusCameraBlend` 同时承担**（1）相机飞入/飞出 `lerp` 进度、（2）非目标 active 的 dim 插值系数；**focus 内换星**会重置 `focusDriver.progress`，导致（2）被错误地拉回 **0**。 |
| 语义拆分 | **`uFocusCameraBlend`**：仍表示与 **`focusDriver.progress`** 一致的**相机过渡进度**（及与相机同步的其它用途），**不再**写入 active 顶点着色器的 dim 公式。 |
| 新增 uniform | **`uFocusActiveDimBlend`**（`galaxyMeshes.ts` 共享 uniform 袋）：专供 **active** 顶点着色器中 `dimAlpha = mix(1.0, uFocusNonTargetActiveAlpha, dimBlend)`。 |
| `selecting` 阶段 dim 规则 | **`uFocusActiveDimBlend`**：若 **`selectingEnteredFromMacro === true`**（宏观 idle 首次进入 focus，且非 cover 保留轨道特例），则 **`= p`**（与首次进入的渐进 dim 一致）；若 **`false`**（**focus 内换星**，以及 **`preserveOrbitFromCover`** 导致的「非宏观首次进入」路径），则 **恒为 `1`**，避免 `p` 回到 0 时 dim 被冲掉。 |
| `deselecting` | **`uFocusCameraBlend`** 与 **`uFocusActiveDimBlend`** **均等于 `p`**（`beginDeselect` 前 `setImmediate(1)` + `reverse`，`p` 从 1→0），与 P13.1 退出 focus 时「压暗随进度解除」一致。 |
| `selected` / cover-today idle 分支 | 两者 uniform **均为 `1`**，与改前行为一致。 |
| `idle`（非 cover today） | 两者 **均为 `0`**。 |
| active 顶点着色器 | **仅声明并使用 `uFocusActiveDimBlend`** 计算 `dimAlpha`；**移除**对 `uFocusCameraBlend` 的声明与引用（避免未使用 uniform；dim 与相机进度解耦）。 |
| Focus 尺寸参考环 opacity | 由 **`uFocusCameraBlend * uAlpha`** 改为 **`max(uFocusCameraBlend, uFocusActiveDimBlend) * uAlpha`**，避免 focus 内换星时 **`p=0`** 导致环透明度被乘成 0、出现**二次淡入**的视觉抖动。 |
| 未采纳方案 | 在着色器内用「是否 retarget」的额外 uniform 分支判断：状态已在 **`scene.ts`** 的 `selectingEnteredFromMacro` 上可得，**新增单一 dim 标量**更清晰、易测。 |
| 计划看板 | `.cursor/plans/phase_25_core_experience_polish.plan.md` 中 **P25.3 todo** 已标为 **completed**（以仓库为准）。 |

---

## 3. 工程操作（修改路径一览）

| 路径 | 操作摘要 |
|------|-----------|
| `frontend/src/three/galaxyMeshes.ts` | 在 `makeSharedUniforms` 中新增 **`uFocusActiveDimBlend`**（初值 `0`），注释标明 P25.3 语义。 |
| `frontend/src/three/shaders/galaxyActive.vert.glsl` | 新增 **`uniform float uFocusActiveDimBlend`**；`dimAlpha` 使用 **`clamp(uFocusActiveDimBlend, 0, 1)`**；删除 **`uFocusCameraBlend`** 在本文件中的声明与 dim 路径引用。 |
| `frontend/src/three/scene.ts` | 绑定 **`uFocusActiveDimBlend`**；在 **`applySelectionFrame`** 各分支与初始化处与 **`uFocusCameraBlend`** 按上节规则同步写入；**`ringOpacity`** 使用 **`max(两 blend) * uAlpha`**。 |
| `.cursor/plans/phase_25_core_experience_polish.plan.md` | P25.3 子任务状态更新为 **completed**（若后续另有改动，以仓库为准）。 |

---

## 4. 与 `selectingEnteredFromMacro` 的交互（定稿行为）

`selectingEnteredFromMacro` 在 `beginSelect` 中定义为：

`selectionPhase === 'idle' && !preserveOrbitFromCover`

| 场景 | `selectingEnteredFromMacro` | `uFocusCameraBlend`（`selecting`） | `uFocusActiveDimBlend`（`selecting`） |
|------|------------------------------|-------------------------------------|----------------------------------------|
| 宏观 `idle` → 首次 focus | `true` | `p`（0→1） | `p`（渐进压暗） |
| 已在 `selected` → 换星（focus 内 retarget） | `false` | `p`（相机仍飞） | **`1`（全程压暗）** |
| Cover → focus（`exitCoverPreserveOrbit`） | `false`（`preserveOrbitFromCover` 为真时） | `p` | **`1`**：该段无「从全亮再压暗」动画，**自首帧即满压暗**；与「禁止闪回不透明」一致，与「宏观渐进 dim」不同属可接受折中（邻域在 cover 语境下本非主叙事）。 |

---

## 5. 关键符号速查（以仓库当前代码为准）

| 符号 | 职责 |
|------|------|
| `uFocusCameraBlend` | 与 **`focusDriver.progress`** 对齐的相机（及相关）过渡标量；**active dim 不再读取**。 |
| `uFocusActiveDimBlend` | **仅**驱动非目标 active 的 **`mix(1, uFocusNonTargetActiveAlpha, ·)`**。 |
| `uFocusNonTargetActiveAlpha` | 仍为默认 **0.08**（P13.6）；本项未改该常数。 |

---

## 6. 验收与回归

| 项 | 结果 / 说明 |
|----|----------------|
| 单元测试 | 报告撰写时于 `frontend` 目录执行 **`npx vitest run`**：**12 files / 97 tests 通过**。 |
| 手工建议 | focus 邻域内连续点击多颗星球：背景 active **不应**整段闪为不透明；从宏观首次点入 focus：背景 active **应**随飞入逐渐压暗；退出 focus：背景随飞出恢复。 |
| Focus 尺寸参考环 | focus 内换星飞行中环 **应保持可见**，不应随 `p` 从 0 再淡入。 |

---

## 7. Git 与后续文档

| 项 | 说明 |
|----|------|
| 分支 | `p25-3-active-mesh-retarget-alpha` |
| 提交线索 | `a21b8bb` 及同分支上后续若有 amend，以 `git log` 为准。 |
| 待办（P25.7） | 更新 **Tech Spec**、**《视觉参数总表》**、**《星球状态机 spec》**、**Phase 11.1 实施报告** 等条文中「非目标 active alpha 仅绑定 `uFocusCameraBlend`」的描述，改为 **`uFocusActiveDimBlend`** + 上表状态机；避免 SSOT 与实现漂移。 |

---

## 8. 与 P11.1 的关系（一句话）

**P11.1** 将非目标 active 压暗与相机 blend **绑在同一标量**在首次宏观进入 focus 时正确；**P25.3** 在 **不改动 `transitionDriver` 数学**的前提下，为 **focus 内重复 `start()`** 补一条 **独立的 dim 标量**，消除语义耦合导致的闪回。
