# Phase 13.3（P13.3）— focus 态轨道相机（破例）— 实施报告

> **范围**：P13.3 及实施过程中为体验收口追加的「orbit 下禁平移」「换星保留视角」「换星过渡为纯平移」等与轨道相机强相关的最终行为。  
> **主文件**：`frontend/src/three/camera.ts`、`frontend/src/three/scene.ts`；`frontend/src/store/galaxyInteractionStore.ts`（`focusOrbit`）；`frontend/src/three/interaction.ts`（空白点击行为注释/对齐）。  
> **计划来源**：`.cursor/plans/phase_13_focus_experience_ab016b85.plan.md`（§P13.3、P13.0 决策 D4 等）。  
> **依赖**：P13.1 `transitionDriver`（`applySelectionFrame` 与 `focusDriver.progress` 通道）；P13.2 邻域 mask / `uSelectionMode = 2`（与轨道正交，本报告不展开 mask 细节）。

---

## 1. 目标与计划对齐

| 计划要求 | 最终处理 |
|----------|----------|
| focus 态（`selectionPhase === 'selected'`）破例：不再维持恒为 `GALAXY_CAMERA_EULER` 的「仅平移」宏观相机，改为**绕 pivot 的轨道相机**；半径恒为 `FOCUS_PERLIN_CAMERA_STANDOFF` | **已实现**：每帧用 `focusOrbit.{yaw,pitch}` + 球坐标公式写 `camera.position`，`lookAt(pivot)` |
| 滚轮在 focus 下 **noop**（D4：保证 Perlin 球屏上尺寸与 `vote_count` 严格对应，不允许 dolly 改距离） | **已实现**：`getCameraMode() === 'orbit'` 时 `wheel` 仅 `preventDefault` 后 return，不写 `zCurrent`、不增改 `camera.position.z` |
| 退出 focus：`deselecting` 内位置 lerp 与**四元数 slerp** 共用 `focusDriver.progress`，回到 `restCam` + `GALAXY_CAMERA_EULER` 对应朝向 | **已实现**：`beginDeselect` 快照 `deselectFromQuat`；`deselecting` 中 `slerpQuaternions` + 结束帧 `setState({ focusOrbit: {0,0} })` |
| 删除「点空白退出 focus」 | **行为对齐**：`picked === null` 且已有 `selectedMovieId` 时不写 `null`；代码侧以注释标明 P13.3 语义（原逻辑已满足） |
| 控制器扩展：`getCameraMode` / `getOrbitPivot` | **已实现**：`scene` 在 `attachGalaxyCameraControls` 中注入 |

---

## 2. 最终决策汇总（含体验迭代）

### 2.1 与 spec 一致的红线

1. **轨道半径**  
   仅由 `FOCUS_PERLIN_CAMERA_STANDOFF`（当前为 1 world unit）决定；**无** `focusOrbit.r` 字段（计划 D4）。

2. **store 中的 `focusOrbit`**  
   仅存 `{ yaw, pitch }`；`idle` 完全退出后归零（在 `deselecting` 结束写入 store）。

3. **`macro` vs `orbit`**  
   `selectionPhase === 'selected'` → `getCameraMode` 返回 `'orbit'`；其余阶段（含 `selecting` / `deselecting`）为 `'macro'` 语义用于控制器分支（orbit 阶段输入锁定时拖拽仍由 `getInputLocked` 拦住）。

### 2.2 focus 态禁用相机的 X / Y / Z 平移（遗留修补）

**问题**：早期实现仅在「orbit 且 `getOrbitPivot()` 非空」时更新轨道并 `return`；pivot 异常时会**落入 truck/pedestal**，破坏「星球在屏上的位置与尺度」约束。

**决策**：只要 `getCameraMode() === 'orbit'`，拖拽分支**一律不得**执行 truck/pedestal（无 pivot 时仅不写 yaw/pitch，仍 `return`）。滚轮已在 orbit 分支提前返回。

### 2.3 XY clamp 与 orbit

**决策**：仅在 **`selectionPhase === 'idle'`** 时对宏观相机执行 `clampGalaxyCameraXY` + 写 `camera.position.z = zCurrent - zCamDistance`。  
`selected` 下轨道位置完全由 `scene` 内公式驱动，避免 clamp 把 orbit 轨迹扯变形。

### 2.4 focus 内切换焦点星球：保留 orbit 角 + 换星过渡形态

1. **保留 `yaw` / `pitch`**  
   - 从 **`idle` 首次进入 focus**：`setState({ focusOrbit: {0,0}, ... })`。  
   - **已在 focus 内换星**：只更新 `focusNeighborIds`，**不覆盖** `focusOrbit`。

2. **飞入终点 `toCam`**  
   使用**当前 store** 的 `yaw`/`pitch` 调 `setFocusOrbitCameraPosition(toCam, movie, yaw, pitch)`，使目标机位与「保留的视角」一致。

3. **换星过渡动画：保持朝向的平移，不做四元数球面插值**  
   - 首版曾用 `slerpQuaternions(selectingStartQuat, selectingEndQuat, p)`，易呈现「绕一圈」的观感。  
   - **终局决策**：focus → focus 的 `selecting` 阶段，**每帧仅** `lerpVectors(fromCam, toCam, p)`，**四元数恒为 `selectingStartQuat`（飞入前瞬间的相机）**；飞入**结束帧**再写入 `selectingEndQuat`（在 `toCam` 上 `lookAt` 新 pivot，与保留 yaw/pitch 一致），再进入 `selected`。  
   - 从 **idle 宏观** 首次飞入：仍用 `GALAXY_CAMERA_EULER` 与既有产品一致。

4. **辅助 API（`camera.ts`）**  
   - `setFocusOrbitCameraPosition`：统一球坐标算机位；`setFocusCameraPosition` 等价于 `yaw=0,pitch=0`。  
   - `applyFocusOrbitLookAt`：`selected` 每帧对当前 pivot `lookAt`。

---

## 3. 实现摘要（按文件）

| 文件 | 内容 |
|------|------|
| `galaxyInteractionStore.ts` | 增加 `focusOrbit: { yaw, pitch }`，默认 `{0,0}`。 |
| `camera.ts` | `ORBIT_YAW_SPEED` / `ORBIT_PITCH_SPEED`；`getCameraMode` / `getOrbitPivot`；orbit 下 pointer 只改 store、禁止 truck；orbit 下 wheel noop；上表球坐标与 `lookAt` 工具函数。 |
| `scene.ts` | `getCameraMode` / `getOrbitPivot` 注入；`applySelectionFrame` 中 `selected` 写轨道机位；`deselecting` 位置+四元数插值；`beginSelect` 中换星与 `toCam`、quat 快照；`selecting` 分「宏观首入」与「换星平移」；`tick` 中仅 `idle` clamp。 |
| `interaction.ts` | 空白点击不取消 focus 的 P13.3 注释。 |

---

## 4. 状态机与输入（简表）

| `selectionPhase` | 轨道机位 | 主朝向 | 左键拖拽（canvas） | 滚轮（canvas） |
|------------------|----------|--------|--------------------|----------------|
| `idle` | 宏观 `zCurrent - zCamDistance` + truck | `GALAXY_CAMERA_EULER` | truck/pedestal | 更新 `zCurrent`（macro 模式） |
| `selecting` | lerp 至 `toCam` | 首入 euler；换星则平移中固定 `selectingStartQuat` | 通常 `inputLocked` | 锁定时无；非锁需看实现 |
| `selected` | 每帧球坐标 + `lookAt` | 由 `lookAt` 决定 | 只改 `focusOrbit` | noop（D4） |
| `deselecting` | lerp 回 `restCam` | slerp 至宏观 euler 对应 quat | 锁 | 锁 |

---

## 5. 验收建议（人工）

- **轨道**：focus 下拖拽，pivot 大致在景框内，机位与 pivot 距离恒为 `FOCUS_PERLIN_CAMERA_STANDOFF` 尺度感。  
- **滚轮**：focus 下不推进时间轴/不 dolly（与 P13.4 若以后打通需单独立项）。  
- **平移禁令**：focus 下拖拽不应出现整片星云平移。  
- **换星**：侧向轨道后点邻星，飞入应接近**直线平移**、结束帧对齐新星，无大圈旋转感。  
- **退出**：退出后恢复宏观朝向与位置；`focusOrbit` 归零。  
- **空白**：点空白不丢 focus；ESC/抽屉/搜索 X（P13.6 若已接）仍可达。

---

## 6. 未纳入本报告条目的说明

- **P13.4** Timeline `zCurrent` 与 `bridgeZ` 与 driver 的联动、**P13.5** 图例 HUD、**P13.6** 搜索 X 与默认 alpha 扫参、**P13.7** 文档与 Phase 8 出口 fps：属其他子 phase，不在 P13.3 实施报告正案内展开。  
- **性能**：60K 邻域与每帧轨道为轻量；若需数字，在 P13.7 出口或 Phase 8 基线文档中补测。

---

## 7. 变更记录

| 日期 / 版本 | 说明 |
|-------------|------|
| 2026-04-30 | 首版：P13.3 轨道实现 + 禁平移修补 + 换星保留角 + 换星纯平移过渡定稿。 |

（若后续将本套变更单独合并，可在此表追加 **Git 分支名 / 合并提交 hash**。）
