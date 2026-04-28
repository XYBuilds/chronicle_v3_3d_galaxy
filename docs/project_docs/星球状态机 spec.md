# 星球状态机 spec（Phase 8.0 草案）

> 与 [Phase 8 计划](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md) 对齐；后续 P8.1–P8.5 实现与回写以本文件为单一事实源（SSOT），与 [`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md)（**性能与准入归档**，非功能 SSOT）、《视觉参数总表》、《Tech Spec》、《Design Spec》交叉引用。

## 1. 范围与命名

| 状态 | 含义（宏观 + 微观） | 本 Phase 是否实装 |
|------|---------------------|-------------------|
| **idle** | 时间轴当前条带外或弱可见；无 hover、无选中、无 focus | 生产：`galaxyIdle` `Icosahedron(1,0)`（`galaxyMeshes.ts`） |
| **active** | 片元在 `uZCurrent … uZCurrent+uZVisWindow` 清晰条带内，且非 focus；可参与拾取 | 生产：仅对 **`galaxyActive`** 拾取（`interaction.ts`） |
| **hover** | `hoveredMovieId` 命中；**不改变** mesh 尺度，仅 HUD（tooltip + HTML hover ring，**无 CSS transition**，即时显隐） | 已有 store 字段；P8.4 对齐 ring |
| **focus** | 选中飞入完成：相机对准目标片、Perlin 球独占；双 galaxy mesh 上该 `instanceId` **scale 归零** | 现有 planet + 相机动画；P8.3/P8.4 调整 |
| **select**（延后） | 多选 / 关联高亮等；本 Phase **仅占位**；搜索与 select 产品方案未来统一规划 | Phase 9 候选 |

## 2. 共享数学：Z 条带与 smoothstep 过渡

- 清晰条带（与现 `point.vert` 一致）：`zLo = uZCurrent`，`zHi = uZCurrent + uZVisWindow`。
- **过渡宽度**：`W = uZVisWindow × 0.2`（由 TS 写入 uniform `uTransitionWidth` 或等价名）。
- **inFocus**（标量 0…1，用于 idle/active **互补** scale）：

```text
inFocus = smoothstep(zLo - W, zLo, aZ) × (1 - smoothstep(zHi, zHi + W, aZ))
```

- **idle / active 尺度（P8.4 双 mesh，无 focus 时）**  
  - `sIdle = (1 - inFocus) × uIdleScale × aSize`  
  - `sActive = inFocus × uActiveScale × aSize`  
  - 具体 `uIdleScale` / `uActiveScale` 初值在 [`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) 及《视觉参数总表》中维护。

- **focus 覆盖**：当 `uFocusedInstanceId >= 0` 且 `gl_InstanceID == uFocusedInstanceId` 时，**强制** `sIdle = 0`、`sActive = 0`；该电影仅由 Perlin `IcosahedronGeometry(1, 6)` 呈现。

## 3. 各态参数表（视觉与交互）

### 3.1 idle

| 维度 | 约定 |
|------|------|
| **z 范围** | 全 `aZ`；视觉上条带外更小更淡（由 `inFocus` 低驱动 `sIdle`） |
| **大小** | `sIdle` 见上；P8.4 mesh：`IcosahedronGeometry(1, 0)`，材质 `transparent: true`、`depthWrite: false` |
| **色彩** | P8.1 后 hue + uniform `uLMin/uLMax/uChroma`（OKLab→sRGB）；本 spec 不绑死 L/C 数值 |
| **可交互性** | 不作为主拾取层（P8.4：Raycaster **仅** active mesh） |
| **进入/退出** | 随 `uZCurrent` / `aZ` 连续变化；无独立时间轴动画 |

### 3.2 active

| 维度 | 约定 |
|------|------|
| **z 范围** | `inFocus > 0` 的条带及其 ±W 过渡区 |
| **大小** | `sActive` 见上；mesh：`IcosahedronGeometry(1, 1)`，`alphaTest: 0.01`、`depthWrite: true` |
| **色彩** | 与 idle 同源 hue/L/C；当前 `galaxyActive.frag` 为 **vColor 直通**；Lambert + rim 为计划内增强（原 P8.5 范围，已改轨以源码为准） |
| **可交互性** | 主拾取；可选 `inFocus > 0.5` 门控 + 第二近邻容差（由 P8.2 结论定） |
| **进入/退出** | 连续，与 idle 互补叠加；**不得**在过渡区出现「双实心球」过曝（P8.5 硬验收） |

### 3.3 hover

| 维度 | 约定 |
|------|------|
| **z 范围** | 不改变 `inFocus`；与 active 命中一致 |
| **大小** | **不**改 mesh scale；HTML ring 半径 = 屏幕空间星球半径 + padding（与 tooltip 同源 `screenRadius`） |
| **色彩** | ring 样式在 HUD/CSS；数据色仍以 mesh 为准 |
| **可交互性** | 展示 tooltip；点击逻辑沿用现工程 |
| **进入/退出** | **即时**（无 transition），与 tooltip 一致 |

### 3.4 focus

| 维度 | 约定 |
|------|------|
| **z 范围** | 相机与目标 world 位置对齐；宏观条带仍由 store 驱动 |
| **大小** | 双 mesh 上该 instance **零尺度**；Perlin 球 **detail = 6**（P8.3） |
| **色彩** | Perlin 四阈值分区 + hue/L/C；**vote_count 在 focus 态保留视觉权重**；**小 vote 片 focus 后视觉偏小为 intended**（产品接受） |
| **可交互性** | 抽屉/详情；ESC 或 UI 取消选中 |
| **进入/退出** | 相机动画时长沿用现 `SELECT_MS` / `DESELECT_MS`（数值以《视觉参数总表》为准）；P8.4 起 `flyToFocus` 使用**物理距离常数** `FOCUS_CAM_DIST` |

#### 3.4.1 focus 视觉降级（Phase 11）

当 `uFocusedInstanceId >= 0` 且当前实例**不是**焦点实例时，idle/active 片元在现有 OKLab 色彩路径上叠加一次「降饱和 / 压亮度」混合；**焦点实例**（`gl_InstanceID == uFocusedInstanceId`）**不**参与降级，仍走原本的 `L_base`、`C_base`（与 idle/active vert 中由 `voteNorm` 与 `uLMin`/`uLMax`/`uChroma` 决定的基准一致）。

- 令 `dimEligible = (uFocusedInstanceId >= 0) && !isFocused`，`dimMix = dimEligible ? 1.0 : 0.0`（mode=0 下；mode=1 见下节）。
- `L_base = mix(uLMin, uLMax, clamp(voteNorm, 0, 1))`（若 Phase 10 已对 `L_base` 做 rating / 层级修正，以届时 vert 最终式为准）。
- `C_base = uChroma`。
- **降级后**：`L = mix(L_base, uFocusDimL, dimMix)`，`C = mix(C_base, C_base * uFocusDimChroma, dimMix)`，再写入 hue→OKLab→sRGB。

定稿默认（实现见 Phase 11.2 / Leva）：`uFocusDimChroma ≈ 0.3`（饱和度倍率）、`uFocusDimL ≈ 0.4`（目标 L）。退出 focus（`uFocusedInstanceId === -1`）后全场恢复无 `dimMix`。

#### 3.4.2 focus 暗化 vs selection 高亮（`uFocusDimMode` 双开关）

- **`uFocusDimMode = 0`**（本 Phase 默认）：凡处于 focus 会话且实例非焦点，即适用 §3.4.1 视觉降级。
- **`uFocusDimMode = 1`**（接口预留）：仅在 **`selectionMask == 0`**（或非选中）时对非焦点实例暗化；selected 高亮路径与 `selectionMask` 数据通道留给后续 Phase（搜索 / 多选）。**Phase 11 代码侧仅保证 uniform 存在；未接入 `selectionMask` 前，行为与 mode=0 等价（条件中占位为假）。**

#### 3.4.3 焦点近相机遮挡剔除（Phase 11.1）

当 **`uFocusedInstanceId >= 0`** 时启用：相机在 focus 态贴近 Perlin 球（`FOCUS_PERLIN_CAMERA_STANDOFF` 等量纲），若某 idle/active 实例的 **world 位置**与 **相机 world 位置**距离小于 **`uFocusOcclusionRadius`**（默认约 **2.5** world units，定稿见《视觉参数总表》），且该实例**不是**焦点实例，则该片元视为遮挡层：缩放因子置零并走既有「NDC 外」出口，避免与 Perlin 穿模及 bloom 伪影。**无 focus**（`uFocusedInstanceId === -1`）时不应用此剔除。

### 3.5 Perlin 球 · 阶梯地形（Phase 11.3 起）

Perlin focus 球在片元侧保留 **四阈值分区** 的语义；顶点上将噪声区间改为 **多级 smoothstep 累加** 得到标量 `level`，再沿 **几何法线** 位移 `level * uStepHeight`（模型空间位移量；与 `mesh.scale.setScalar(worldRadius)` 相乘后为 world 高度）。各级阈值过渡带宽由 **`uStepSmoothness`** 控制（为 0 时可对照硬切）。

**尺度与包围球**：同一顶点最多叠加约 **三档** 平滑阶跃（相对 `uThresh1…uThresh3`）；在默认实现下 world 空间峰值半径约为 **`worldRadius × (1 + 3 × uStepHeight)`**（`uStepHeight` 为与 vert 一致的标量）。拾取与包围球 **`lastRadius`** 须按该上界放宽，避免阶梯最高点溢出射线/视锥判断。

**参数上限**：`uStepHeight` 由 Leva 与产品上限约束（须与 `near`、`FOCUS_PERLIN_CAMERA_STANDOFF` 相容）；具体数值定稿见《视觉参数总表》与 Phase 11 实施说明。

### 3.6 select（延后）

- 仅列需求占位：多选集合、bloom 分层、搜索联动；**不实装**到本 Phase。搜索与 **select** 产品方案将**未来**统一设计与计划（本仓库不维护独立搜索 spec 文件）。与 §3.4.2 `uFocusDimMode = 1` 联动时再更新本节。

## 4. 渲染与能力约定

- **WebGL2**：启动时 `console.assert(renderer.capabilities.isWebGL2)`，失败抛错并提示升级浏览器（与 Phase 7.2 红线一致）；**不**维护 WebGL1 / 自定义 `aInstanceId` attribute fallback。
- **实例索引**：focus 判定使用 `gl_InstanceID == uFocusedInstanceId`；`uFocusedInstanceId === -1` 表示无 focus。
- **Draw 顺序（建议）**：`galaxyIdle` renderOrder 0 → `galaxyActive` renderOrder 1 → 后处理 Bloom → Perlin（focus 时 `visible=true`，renderOrder 2）。

## 5. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-04-27 | Phase 8.0 初稿：四态 + select 延后、W 公式、双 mesh 互补、WebGL2、focus 意图声明 |
| 2026-04-27 | 文档同步：idle/active 对齐 P8.4；active 片元说明；移除独立搜索/select 草案引用，改由未来统一规划 |
| 2026-04-28 | Phase 11.0：§3.4 focus 视觉降级 / `uFocusDimMode` / 近相机遮挡剔除；§3.5 Perlin 阶梯地形与包围球约束；原 §3.5 select 顺延为 §3.6 |
