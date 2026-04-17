# Phase 5.1.5 视距窗口模型（方案 1）实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.5**（frontmatter 项 **`p5-1-5-z-window`**）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — **Issue T4**（相机初始位置）、**D1**（宏观星星密度 / 为后续分层奠基）、**§10 方案 1**（宏观漫游视距窗口）  
> **报告日期**: 2026-04-17  
> **范围**: 在前端引入 **`zCurrent` / `zVisWindow` / `zCamDistance`** 三参数模型；改造 **`camera.ts`** 滚轮与 **`scene.ts`** 挂载与 RAF 同步；升级 **`galaxyCameraZBridge`** 的语义以向 Timeline 发布「时间轴焦点」而非裸 **`camera.position.z`**；实现 **Z 轴 clamp**（随 `zCurrent`）与 **XY clamp**（`xy_range` + padding）。  
> **不在范围**: **5.1.6** 三层粒子着色器（`uZCurrent` / `uZVisWindow` 等 uniform 尚未接入）、**5.1.7** Raycaster 窗口内拾取、**5.1.8** Tech/Design Spec 文档同步（可后续单独立项）。

---

## 1. 摘要

Phase **5.1.5** 落实评估报告中的 **方案 1 — 视距窗口模型**：用 **`zCurrent`** 表示用户在发行年轴上的「关注位置」，用 **`zVisWindow`** 表示可观测 Z 窗口宽度（世界坐标年），用 **`zCamDistance`** 表示相机沿 −Z 相对 **`zCurrent`** 的后退距离，使宏观模式下恒有：

\[
\text{camera.position.z} = z_{\text{Current}} - z_{\text{CamDistance}}
\]

滚轮在 **宏观空闲态（`selectionPhase === 'idle'`）** 下修改 **`zCurrent`**（并限制在 **`meta.z_range`** 排序后的 \([z_{\text{Lo}}, z_{\text{Hi}}]\) 内），相机 Z 由上述关系驱动；在 **选中星球特写等非 idle** 下，滚轮仍直接调节 **`camera.position.z`**，以保持与 Phase 4.5 相近的特写推拉体验。

**首屏 `zCurrent`** 按 follow-up 计划 **Rev 4** 与 **§5.1.5**：取 **`z_range` 中较早的一端 `zLo`**（约最早公映年），使用户从时间轴起点开始浏览，而非现代年份附近。

**`zVisWindow`** 当前写入 **Zustand**（默认 **1 年**），供 **5.1.6** 粒子分层与着色器分支使用；本阶段不在 GPU 侧消费。

**Git 分支**: 在独立分支上开发（如 **`phase-5.1.5-z-window-model`**），与 **5.1.4.7（H-G DPR）** 之后的 **`main`** 衔接。

| 项 | 内容 |
| --- | --- |
| **解决的计划条目** | T4（初始时间位置语义化）、D1 的前置数据面（窗口参数进 store）、方案 1 核心概念落地 |
| **主要交付** | store 三字段、`camera.ts` 双模式滚轮、`scene.ts` 初始化 + tick 同步 + XY clamp、`galaxyCameraZBridge` + Timeline 语义对齐 |
| **验证** | `frontend` 下 **`npm run build`**、**`npm run lint`** 通过 |

**Git 提交（代码主干，按时间顺序）**:

| SHA（短） | 说明 |
| --- | --- |
| **`06bfc8e`** | `feat(5.1.5): add zCurrent/zVisWindow/zCamDistance view model` — 初版：store、滚轮改 `zCurrent`、tick 同步 idle 相机 Z、bridge 注释与变量语义、XY 拖拽 clamp、`getWheelLocked` 等。 |
| **`299fddd`** | `fix(5.1.5): zCurrent starts at z_range min; macro vs detail wheel; XY clamp tick` — **Rev 4** 首屏修正；**`getMacroZWheel`** 替代「非 idle 完全禁用滚轮」；宏观滚轮同步写 **`camera.position.z`**；每帧 **`clampGalaxyCameraXY`**；非 idle 时 bridge 使用 **`camera.position.z + zCamDistance`** 推导显示值。 |

（若仓库中另有仅文档的后续提交，以 **`git log`** 为准；本表聚焦 **5.1.5 交互与场景逻辑** 的两步提交。）

---

## 2. 背景与目标

### 2.1 背景

- Phase 5.0 将「宏观浏览时信息过载」「时间轴与相机 Z 关系不直观」等归并到 **D1**、**T4** 及 **§10 方案 1**。  
- 方案 1 要求将「相机世界 Z」与「用户时间关注点」解耦：相机后退量可调，时间窗宽度 **`zVisWindow`** 为后续 **A/B 层粒子**（5.1.6）提供统一参数源。  
- 计划 **Rev 4** 明确：**`zCurrent` 初始值** 应从「现代年附近」改为 **`z_range` 起点（最早年）附近**，以符合「从时间原点开始漫游」的产品决策。

### 2.2 目标（对照计划 5.1.5）

| 目标 | 结果 |
| --- | --- |
| Zustand 中增加 **`zCurrent` / `zVisWindow` / `zCamDistance`** | **已完成** |
| **`camera.ts`** 滚轮从「直接改 `camera.position.z`」改为（宏观下）改 **`zCurrent`**，相机由 **`zCurrent - zCamDistance`** 驱动 | **已完成**（宏观）；特写下保留直接改 Z |
| **`galaxyCameraZBridge`** 同步「**`zCurrent` 语义**」供 Timeline | **已完成**（API 名仍为历史名 `setGalaxyCameraZ`，参数语义为时间轴焦点） |
| **`zCurrent`** 限制在 **`z_range`**；XY 限制在 **`xy_range` + padding** | **已完成** |

---

## 3. 概念与参数约定

### 3.1 符号

| 符号 | 含义 |
| --- | --- |
| **`zCurrent`** | 用户当前关注的发行年（世界 Z，与 `galaxy_data.json` 中影片 **`z`** 同轴，可为小数年） |
| **`zVisWindow`** | 可观测 Z 窗口宽度（年）；计划初值 **1**；区间 **`[zCurrent, zCurrent + zVisWindow]`** 供 5.1.6 使用 |
| **`zCamDistance`** | 相机相对 **`zCurrent`** 沿 −Z 的后退量；实现中取 **`max(2, zSpan * 0.045 + 1.2)`**，随数据集 **`z_range` 跨度**微调，避免过近或过远 |
| **`zLo` / `zHi`** | **`meta.z_range`** 两端取 **`min`/`max`** 后的有序边界 |

### 3.2 相机与状态关系（宏观 idle）

- **`camera.position.set(cx, cy, zCurrent - zCamDistance)`**（挂载与每帧 idle 同步一致）  
- **`GALAXY_CAMERA_EULER`** 不变；无额外 tilt/yaw 补偿常量。

### 3.3 与选中飞入（Phase 4.5）的共存

- **飞入 / 选中 / 取消选中** 仍通过 **`camera.position`** 动画驱动；**`zCurrent`** 在宏观浏览阶段为真源，**非 idle** 时不再每帧用 **`zCurrent - zCamDistance`** 覆盖 **`camera.position.z`**，避免打断飞入与特写机位。

---

## 4. 实现说明（按模块）

### 4.1 `frontend/src/store/galaxyInteractionStore.ts`

- 在 **`GalaxyInteractionState`** 中新增：  
  - **`zCurrent: number`**  
  - **`zVisWindow: number`**  
  - **`zCamDistance: number`**  
- **`create(...)`** 默认值：`zCurrent: 0`、`zVisWindow: 1`、`zCamDistance: 2`（仅占位；**`mountGalaxyScene`** 会根据 **`meta`** 立即 **`setState`** 覆盖）。

### 4.2 `frontend/src/three/scene.ts` — `mountGalaxyScene`

1. 计算 **`zLo`/`zHi`/`zSpan`**，以及 **`zCamDistance`**、**`zVisWindow = 1`**。  
2. **`zCurrent = zLo`**（Rev 4 / 计划 **§5.1.5**）。  
3. **`useGalaxyInteractionStore.setState({ zCurrent, zVisWindow, zCamDistance })`**。  
4. 相机初始：**`camera.position.set(cx, cy, zCurrent - zCamDistance)`**，**`setGalaxyCameraZ(zCurrent)`**。  
5. **`macroZWheel = () => selectionPhase === 'idle'`**，传入 **`attachGalaxyCameraControls`** 的 **`getMacroZWheel`**。  
6. **RAF `tick`**（在 **`applySelectionFrame`** 之后）：  
   - 若 **`idle`**：**`camera.position.z = zCurrent - zCamDistance`**（与 store 单源对齐）。  
   - **`clampGalaxyCameraXY(camera, meta.xy_range, 0.08)`**：全相位统一限制 XY，满足「camera clamp」中的 XY 部分。  
   - **Bridge**：**`idle`** 时 **`bridgeZ = zCurrent`**；否则 **`bridgeZ = camera.position.z + zCamDistance`**，使 Timeline 在飞入/特写时仍反映「等效时间轴读数」，而非卡在宏观 **`zCurrent`** 不动。

### 4.3 `frontend/src/three/camera.ts` — `attachGalaxyCameraControls`

- **`sortedPair2` + `clampCameraXY`**：拖拽后 XY clamp（padding 默认 **0.08 × 轴跨度**）。  
- 导出 **`clampGalaxyCameraXY`**：供 **`scene.ts` tick** 与拖拽共用同一套边界逻辑。  
- **`GalaxyCameraControlOptions`** 新增 **`getMacroZWheel?: () => boolean`**（缺省视为 **`true`**，保持向后兼容）。  
- **`onWheel`**：  
  - **`getInputLocked()`** 为真时仍不响应（飞入动画等）。  
  - **`getMacroZWheel()`** 为真：**`zCurrent`** 增加 **`dz`** 后 clamp 到 **`[zLo, zHi]`**，**`setState`**，并 **立即** **`camera.position.z = next - zCamDistance`**（减少一帧延迟感）。  
  - 否则：**`camera.position.z += dz`**（特写推拉）。

### 4.4 `frontend/src/lib/galaxyCameraZBridge.ts`

- 内部存储变量语义为 **「时间轴焦点 / 与 zCurrent 对齐的 HUD 值」**（注释已写明 Phase 5.1.5）。  
- 仍导出 **`setGalaxyCameraZ` / `getGalaxyCameraZ` / `subscribeGalaxyCameraZ`**，避免全量重命名调用方；**Timeline** 通过 **`useSyncExternalStore`** 订阅的即为上述语义值。

### 4.5 `frontend/src/components/Timeline.tsx`

- **`TimelineHud`** 的 **`cameraZ`**  props 注释已标明：宏观下为 **`zCurrent`** 语义（与 **`getGalaxyCameraZ()`** 一致）；非 idle 时为 bridge 推导值。

---

## 5. 验收对照（计划 §5.1.5）

| 验收项 | 实施情况 |
| --- | --- |
| 首屏从 **最早年（`zLo`）** 附近启动 | **`zCurrent = zLo`**，相机 **`zCurrent - zCamDistance`** |
| 滚轮向 +Z 方向改变 **`zCurrent`**，相机跟随 | **idle** 下滚轮更新 **`zCurrent`** 并写 **`camera.position.z`**；tick 再次对齐 |
| Timeline 显示 **`zCurrent`**（宏观） | **idle** 下 **`setGalaxyCameraZ(zCurrent)`** |
| **`zCurrent`** 限制在 **`z_range`** | **`THREE.MathUtils.clamp(..., zLo, zHi)`** |
| XY 限制在 **`xy_range` + padding** | 拖拽与 **每帧 `clampGalaxyCameraXY`** |

**说明**: 计划中「窗口内约 1 年范围的星球以真实大小显示」依赖 **5.1.6** 着色器与 **`uZVisWindow`** 等；**5.1.5** 仅完成 **参数进 store + 相机/滚轮/HUD 语义**，粒子视觉分层不在本报告范围。

---

## 6. 验证与命令

在 **`frontend`** 目录执行：

```bash
npm run build
npm run lint
```

本次迭代中上述命令 **均已通过**（TypeScript 工程构建 + ESLint）。

---

## 7. 已知限制与后续工作

| 项 | 说明 |
| --- | --- |
| **`zVisWindow` 未驱动渲染** | 已写入 store；**5.1.6** 在 **`point.vert`/`point.frag`** 与 **`galaxy.ts`** 中接入 uniform 后生效 |
| **Raycaster 仍全局** | **5.1.7** 将拾取限制到窗口内层 |
| **Spec 文档** | **5.1.8** 更新 Tech/Design Spec 中 §1.4 / 交互与分层章节 |
| **API 命名** | **`setGalaxyCameraZ`** 仍为历史名；若未来大重构可改为 **`setGalaxyZCurrent`** 并统一调用方 |

---

## 8. 参考路径索引

| 路径 | 角色 |
| --- | --- |
| `frontend/src/store/galaxyInteractionStore.ts` | **`zCurrent` / `zVisWindow` / `zCamDistance`** |
| `frontend/src/three/camera.ts` | 滚轮双模式、XY clamp、**`clampGalaxyCameraXY` 导出** |
| `frontend/src/three/scene.ts` | 挂载初始化、idle 同步 Z、tick XY clamp、bridge 分支 |
| `frontend/src/lib/galaxyCameraZBridge.ts` | React 与 Three 之间的 Z Hud 外发 |
| `frontend/src/components/Timeline.tsx` | 读取 bridge 显示年代指示 |

---

*本报告由 Phase 5.1.5 实施过程整理，若与仓库后续提交不一致，以当前分支 **`git show`** 为准。*
