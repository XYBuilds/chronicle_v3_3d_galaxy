# Phase 13.4（P13.4）— Timeline snap 到 movie.z — 实施报告

> **范围**：仅 P13.4。进入 focus 时 store `zCurrent` 与相机飞入共用 **`focusDriver.progress`**（已 ease）；退出 focus 时 **不**回退 `zCurrent`（stay at movie.z）；HUD 侧 **Timeline** 仍读 `galaxyCameraZ` 桥，桥接值简化为恒等于 `zCurrent`。  
> **主文件**：`frontend/src/three/scene.ts`。  
> **计划来源**：`.cursor/plans/phase_13_focus_experience_ab016b85.plan.md`（P13.4 节、D2 决策）。  
> **Git**：分支 `phase/p13-4-timeline-snap`；实施提交 **`402077a`**（message：`feat(focus): P13.4 Timeline zCurrent snap sync with focus driver`）。

---

## 1. 目标与验收口径（计划对齐）

| 计划要求 | 本次处理 |
|----------|----------|
| `beginSelect` 快照「前一宏观读数」，**不**在入口处瞬时写死 `zCurrent`；由 driver 驱动渐变 | **已实现**：`focusZAnimStart` / `focusZAnimTarget`，见 §3 |
| `selecting`：`zCurrent` 从快照线性插值到 `movie.z`，权重 **同源** `focusDriver.progress`（与相机飞入同曲线） | **已实现**：`zNext = start + (target - start) * p` |
| `deselecting`：**不再**动画或回退 `zCurrent`（起点终点均为 movie.z → 工程上等价于不写 store） | **已实现**：`applySelectionFrame` 的 `deselecting` 分支无 `zCurrent` 写入 |
| `bridgeZ` 单分支：`bridgeZ ≡ zCurrent`，去掉 `selectionPhase === 'idle' ? … : camera…` | **已实现**：`setGalaxyCameraZ(st.zCurrent)` |
| `Timeline.tsx`：仍读桥接 `cameraZ`，代码 **无需**为 P13.4 修改 | **未改**该文件 |

---

## 2. 最终决策汇总

1. **D2（计划已锁定）：Timeline 与 focus 进入为「渐变」而非瞬跳**  
   与 P13.0 决策表一致：与相机飞入共用 **`focusDriver.progress`**（含 **easeOutCubic**），时长与 **`SELECT_MS`（700ms）** 一致。

2. **插值空间：线性 lerp on eased progress**  
   `zCurrent` 使用 **`focusZAnimStart + (focusZAnimTarget - focusZAnimStart) * p`**，其中 **`p = focusDriver.progress`**。  
   说明：`progress` 本身已是 eased 标量，故 z 轴随 **同一 eased 曲线** 变化，与相机位置 lerp 的「感受节奏」对齐；**不对年份再做二次 ease**（计划示例写法即为 `lerp(..., focusDriver.progress)`）。

3. **退出 focus 后「留在 movie.z」**  
   `deselecting` 全程 **不** `setState({ zCurrent })`。进入 focus 结束时已将 `zCurrent` 钳到 **`focusZAnimTarget === movie.z`**，退出后宏观滚轮与 idle 相机更新均从该值延续（计划：后续滚轮从该片年份起继续穿梭）。

4. **focus 内换星**  
   每次 `beginSelect` 重新读取 **`useGalaxyInteractionStore.getState().zCurrent`** 作为 **`focusZAnimStart`**，目标为 **新片 `movie.z`**。若上一段已是前一片的年份，则动画从前一片 z 渐变到新片 z。

5. **桥接 HUD：`setGalaxyCameraZ(st.zCurrent)`**  
   废除「非 idle 时用 `camera.position.z + zCamDistance`」推导读数。轨道相机下相机 Z 不再等价于「宏观时间轴焦点」，以 **`zCurrent` 为单一真相来源** 可避免 Timeline 与真实叙事年份脱节。

6. **端点精度**  
   `selecting` 结束（`!focusDriver.active`）时额外 **`setState({ zCurrent: focusZAnimTarget })`**，避免浮点 lerp 末帧与 `movie.z` 微小偏差。

7. **可观测性（项目准则）**  
   `beginSelect` 内 **`console.log('[FocusZ] selecting', { zStart, zTarget, movieId })`**，便于对照相机日志做抽样验收。

8. **人工验收**  
   动画与多阶段交互仍以 **手测** 为主（见 §6）；本阶段 **未**新增 Vitest/E2E 用例。

---

## 3. 实现摘要（`scene.ts`）

**闭包状态（与 `selectionPhase` 同作用域）**

| 符号 | 含义 |
|------|------|
| `focusZAnimStart` | 本次 `beginSelect` 触发时快照的 `zCurrent` |
| `focusZAnimTarget` | 本次选中电影的 **`movie.z`**（decimal year） |

**`beginSelect`**

- 在 `focusDriver.start(SELECT_MS)` 与 `selectionPhase = 'selecting'` 之前：  
  `zSnap = getState().zCurrent` → `focusZAnimStart = zSnap`，`focusZAnimTarget = movie.z`，并打 `[FocusZ]` 日志。  
- **不**在此处把 `zCurrent` 直接设为 `movie.z`（首帧由 `selecting` 内 `p≈0` 保证起点一致）。

**`applySelectionFrame` — `selecting`**

- `focusDriver.tick(nowMs)` 后取 **`p = focusDriver.progress`**。  
- `useGalaxyInteractionStore.setState({ zCurrent: focusZAnimStart + (focusZAnimTarget - focusZAnimStart) * p })`。  
- 过渡结束：`setState({ zCurrent: focusZAnimTarget })`（与其它 selected 收尾逻辑同块）。

**`applySelectionFrame` — `deselecting`**

- **无** `zCurrent` 更新。

**rAF `tick`（文件后部）**

- 注释标明 P13.4 语义：`bridgeZ` 恒为 **`st.zCurrent`**。  
- 调用 **`setGalaxyCameraZ(st.zCurrent)`**（在 `applySelectionFrame` 之后读取 store，故含当帧 selecting 写入）。

---

## 4. 与 P13.1 驱动器的关系

- **单一进度源**：`createTransitionDriver()` 返回的 **`focusDriver`** 同时驱动相机飞入与 **`zCurrent`** 渐变，满足计划「避免 Timeline 与相机不同步导致 Z 跳变」。  
- **`deselecting`**：`progress` 仍驱动相机回宏观与四元数 slerp；**z 轴不参与**该段插值。

---

## 5. 执行操作清单（工程）

1. 新建 Git 分支：`phase/p13-4-timeline-snap`（实施前自 `main` / 工作分支检出）。  
2. 修改 `frontend/src/three/scene.ts`：引入 `focusZAnimStart` / `focusZAnimTarget`、`beginSelect` 快照、`selecting` 内写 `zCurrent`、`bridgeZ` 简化。  
3. 本地验证：`npm run build`（`tsc -b && vite build`）通过。  
4. 提交：`402077a`。  
5. （可选）合并后主分支若另有提交，以 **`402077a`** 仍为 P13.4 功能变更的 **基准提交** 做追溯。

---

## 6. 人工验收步骤与通过标准

**建议步骤**

1. 启动 `npm run dev`，将 Timeline 拖到与目标片 **年份相差较大** 的位置，再点击该片进入 focus：指针应在 **约 700ms** 内 **平滑** 移至该片年份，并与飞入 **体感同步**。  
2. focus 内点击邻域另一部 **不同年份** 的片：指针应从前一片年份 **渐变** 到新片年份。  
3. 使用 ESC / Drawer 关闭 / 搜索 X（与产品设计一致的退出路径）退出 focus：指针应 **留在该片年份**，**不回退**到进入 focus 前的 Timeline 位置。  
4. 退出后使用滚轮调节时间：应从 **当前保留年份** 起连续变化，无异常跳变。

**通过标准（与计划 P13.4 验收一致）**

| 项 | 标准 |
|----|------|
| 进入 focus | Timeline 在 focus 进入动画时长内平滑对齐 **`movie.z`**，与相机过渡同源进度 |
| 退出 focus | **`zCurrent`** / 指针 **不回退** |
| 退出后宏观 | 滚轮等行为从 **停留的年份** 继续，无逻辑断裂 |
| focus 内换星 | **`zCurrent`** 随第二次进入动画渐变到新 **`movie.z`** |

---

## 7. 参考路径

- 计划：`.cursor/plans/phase_13_focus_experience_ab016b85.plan.md`（「P13.4 Timeline snap 到 movie.z」、D2）  
- 驱动器：`frontend/src/three/transitionDriver.ts`  
- 实现：`frontend/src/three/scene.ts`（`focusZAnim*`、`beginSelect`、`applySelectionFrame` 之 `selecting`、`tick` 内 `setGalaxyCameraZ`）  
- HUD：`frontend/src/components/Timeline.tsx`（`useSyncExternalStore(subscribeGalaxyCameraZ, …)`）  
- 桥：`frontend/src/lib/galaxyCameraZBridge.ts`  

---

## 8. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-04-30 | 初稿：P13.4 实施决策、代码要点、Git 提交 `402077a`、人工验收清单 |
