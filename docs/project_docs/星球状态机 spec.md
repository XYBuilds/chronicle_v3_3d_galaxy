# 星球状态机 spec（Phase 8.0 草案）

> 与 [Phase 8 计划](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md) 对齐；后续 P8.1–P8.5 实现与回写以本文件为单一事实源（SSOT），与 [`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md)（**性能与准入归档**，非功能 SSOT）、《视觉参数总表》、《Tech Spec》、《Design Spec》交叉引用。

## 1. 范围与命名

| 状态 | 含义（宏观 + 微观） | 本 Phase 是否实装 |
|------|---------------------|-------------------|
| **idle** | 时间轴当前条带外或弱可见；无 hover、无选中、无 focus | 生产：`galaxyIdle` `Icosahedron(1,0)`（`galaxyMeshes.ts`） |
| **active** | 片元在 `uZCurrent … uZCurrent+uZVisWindow` 清晰条带内，且非 focus；可参与拾取 | 生产：仅对 **`galaxyActive`** 拾取（`interaction.ts`） |
| **hover** | `hoveredMovieId` 命中；**不改变** mesh 尺度，仅 HUD（tooltip + HTML hover ring，**无 CSS transition**，即时显隐） | 已有 store 字段；P8.4 对齐 ring |
| **focus** | 选中飞入完成：相机对准目标片、Perlin 球独占；双 galaxy mesh 上该 `instanceId` **scale 归零** | 现有 planet + 相机动画；P8.3/P8.4 调整 |
| **select**（正式 · Phase 12+） | **`selectionIds` 非空** 且 **`viswindowDisabled`**：时间轴条带内的 **`inFocus`** 由 **selectionMask** 覆盖（见 §3.6）；与搜索人名 / genre 联动 | Phase 12 起实装 |

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
| **大小** | `sIdle` 见上；P8.4 mesh：`IcosahedronGeometry(1, 0)`；**Phase 17 起**：idle 材质 **`transparent: false`**、**`depthWrite: true`**、**`depthTest: true`**（opaque 深度路径，修复同类半透明排序遮挡） |
| **色彩** | **Phase 17 起**：`vote_average` 经 **P10.1** 得 **`L_star`** → **距离-L** 得 **`L_distance`**（Z 轴观测距离与 `uZCamDistance` 参考面，公式见《视觉参数总表》§2；**不**再用片元 alpha 表达远近）→ **Hunt** 色度衰减 **`C_new = C_base × clamp(L_distance / uLMax, 0, 1)^γ`**（`C_base` 即 `uChroma` 标量 × hue 的 a,b 分量；`γ` = `uHuntGamma`）；再 OKLab→sRGB。**旧 P10.2** `uDistanceFalloffK` / `uDistanceFalloffMode` **不再**参与 idle 颜色或 alpha（Phase 17 废弃） |
| **可交互性** | 不作为主拾取层（P8.4：Raycaster **仅** active mesh） |
| **进入/退出** | 随 `uZCurrent` / `aZ` 连续变化；无独立时间轴动画 |

### 3.2 active

| 维度 | 约定 |
|------|------|
| **z 范围** | `inFocus > 0` 的条带及其 ±W 过渡区（select 会话下由 mask 重写，见 **§3.6**） |
| **大小** | `sActive` 见上；mesh：`IcosahedronGeometry(1, 1)`，**`alphaTest: 0.01`**；**`transparent` / `depthWrite`** 运行时以 **§3.2.1** 双路径为准（`galaxyMeshes.ts` 构造初值为路径 **B**） |
| **色彩** | 与 idle 同源 hue/L/C；**Phase 17 起** active 顶点路径同样接入 **Hunt**（与 idle 共享 `uHuntGamma` / `uHuntApplyMask` 的 **active 位**）；当前 `galaxyActive.frag` 为 **vColor 直通**；Lambert + rim 为计划内增强（原 P8.5 范围，已改轨以源码为准） |
| **可交互性** | 主拾取；可选 `inFocus > 0.5` 门控 + 第二近邻容差（由 P8.2 结论定） |
| **进入/退出** | 连续，与 idle 互补叠加；**不得**在过渡区出现「双实心球」过曝（P8.5 硬验收） |

#### 3.2.1 active 材质双路径（Phase 16 → Phase 19）

**动机**：路径 **B**（透明、不写深度）下，条带或 mask 内大量 active 同帧 **alpha≈1** 时，透明排序会导致远处球体错误压在近处之上。**Phase 16** 先在 **`person` / `genre` select 单态**切入路径 **A**（opaque + `depthWrite`）。**Phase 19** 将路径 **A** 收敛为**全部宏观无 focus**：与 **`searchMode` 细分无关**，统一为 **`selectionPhase === 'idle'`** 且 **`selectedMovieId === null`**（含 idle / `movie` 联想未点片、Space dolly 推近等）；**唯一**路径 **B** 特例为 **focus 管线**（`selectionPhase ∈ { selecting, selected, deselecting }` **或** 已持有 **`selectedMovieId`**），以保留 **P11.1** 非目标 active **alpha**。仍在 **`scene.ts` RAF** 内切换 **`galaxyActive` ShaderMaterial**（**无**第二套 mesh）。

| 路径 | 条件 | `transparent` | `depthWrite` | `alphaTest` | 备注 |
|------|------|---------------|--------------|-------------|------|
| **A — opaque（宏观默认）** | **`selectionPhase === 'idle'`**（**`scene.ts` 闭包**，非 Zustand）且 **`selectedMovieId === null`**（store） | `false` | `true` | `0.01` | 条带 / mask 内 **`sActive > 0`** 片元写深度；宏观浏览与 **Phase 17** Space dolly 推近后遮挡正确 |
| **B — transparent（focus 特例）** | **`selectionPhase`** 为 **`selecting` / `selected` / `deselecting`** **或** **`selectedMovieId !== null`** | `true` | `false` | `0.01` | **P11.1** **`vFocusAlphaMult`**；压暗由 **`uFocusActiveDimBlend`**（与 **`uFocusNonTargetActiveAlpha`**）驱动，**`uFocusCameraBlend`** 主司相机插值（**Phase 25.3** 起二者在 focus 内换星时解耦） |

* **切换**：由 **`scene.ts`** 每帧用 **`selectionPhase`（闭包）× `selectedMovieId`（store）** 判定路径，仅在 **`transparent` / `depthWrite`** 与目标不一致时设置 **`material.needsUpdate = true`**（触发 shader 重编译；用户操作边界上频率极低）。切换**无**时间插值动画。  
* **与 P11.1 兼容**：路径 **A** 下宏观 active 片元 **alpha 恒为 1**（mask / 条带外 **`sActive = 0`** 已丢弃），与 opaque 深度写入无冲突；路径 **B** 下 focus 飞入/保持/飞出仍走 **§3.4.3**。

### 3.3 hover

| 维度 | 约定 |
|------|------|
| **z 范围** | 不改变 `inFocus`；与 active 命中一致 |
| **大小** | **不**改 mesh scale；HTML ring 半径 = 屏幕空间星球半径 + padding（与 tooltip 同源 `screenRadius`） |
| **色彩** | ring 样式在 HUD/CSS；数据色仍以 mesh 为准 |
| **双 mesh GPU** | 通用 **hover**（`hoveredMovieId`）**不**改 idle 顶点；**active** 顶点在 **movie / person / genre** 常规拾取下**不**因 hover 单独改 alpha。**Phase 17**：仅在 **focus 球形邻域**（**`uSelectionMode === 2`**，见 **§3.4.3**）对**被 hover 的邻域 active 实例**抬升 **`vFocusAlphaMult`**，且 **`hoveredMovieId === null`** 时 **`uHoveredInstanceId = -1`**，避免残留不透明。 |
| **可交互性** | 展示 tooltip；点击逻辑沿用现工程 |
| **进入/退出** | **即时**（无 transition），与 tooltip 一致 |

### 3.4 focus

| 维度 | 约定 |
|------|------|
| **z 范围** | 相机与目标 world 位置对齐；**Phase 13 起**：focus 会话中 **active** 可视/可拾取子集由 **`uSelectionMode = 2`** 球形邻域 mask 决定（见 **§3.4.5**），**不再**由 viswindow 条带单独承担「邻域探索」语义；时间轴读数与 **`zCurrent`** 对齐见 Tech Spec §1.4.1 |
| **大小** | 双 mesh 上该 instance **零尺度**；Perlin 球 **detail = 8**（P11.3；取代早期文档中的 detail 6） |
| **色彩** | Perlin **K 档**（≤8）噪声阈值分区 + **OKLab（L/C/hue）**；**Phase 11.4**：**`uPerlinL`** 与 **`vote_average`** 经 **P10.1** 与宏观一致；**主 genre** 优先 **`movie.genre_hue`**；**vote_count** 在 focus 态仍通过 **worldRadius** 影响球尺度；**小 vote 片 focus 后视觉偏小为 intended**（产品接受） |
| **可交互性** | 抽屉/详情；**邻域内 active** 可点击**切换 focus**（仍经 Phase 11.6 拾取分流与 Perlin 球优先级）；**退出 focus** 仅 **ESC**、档案抽屉关闭、搜索栏清除（**X**）——**不**再支持「点击画布空白」退出（与 Design Spec §4.6 一致） |
| **进入/退出** | 相机动画时长沿用现 `SELECT_MS` / `DESELECT_MS`（数值以《视觉参数总表》为准）；P8.4 起 `flyToFocus` 使用**物理距离常数** `FOCUS_CAM_DIST`；**Phase 13 起**进出 focus 的相机位姿与 **`uFocusCameraBlend`** 等通道由统一 **`transitionDriver`**（`focusDriver.progress`）驱动；**selected** 段为**轨道相机**（§3.4.6） |

#### 3.4.1 focus 视觉降级（Phase 11.2 · **idle 层**；**Phase 17 默认禁用**）

**范围**：仅 **`galaxyIdle.vert.glsl`（背景 idle 球）**。**active** 层的 chroma/L **不因本条改变**；非目标 **active** 的视觉弱化由 **§3.4.3（P11.1）** 的片元 **alpha** 与 **`uFocusCameraBlend`** 负责。

当 `uFocusedInstanceId >= 0` 且当前实例**不是**焦点实例时，在 idle 顶点着色器内对已有 **`L_base` / `C_base`** 做**乘子**混合（非焦点 idle「降饱和 / 可选压亮度」）；**焦点实例**在 idle 上 **`sIdle = 0`**（双 mesh 常规策略），本条主要针对**其余** idle。

- 令 `dimEligible = (uFocusedInstanceId >= 0) && !isFocused`，`dimMix = dimEligible ? 1.0 : 0.0`（mode=0 下；mode=1 见下节；shader 内对 `uFocusDimMode` 0/1 暂与 0 等价至 `selectionMask` 落地）。
- `L_base`：与 `galaxyIdle.vert.glsl` 中 **P10.1** 对 `voteNorm` 的压缩 + `pow` + `mix(uLMin, uLMax, ·)` 一致（**非**简单 `mix(voteNorm)`）；**Phase 17** 起 idle 主视觉的「远处变暗 / 降饱和」由 **§3.1** 的 **距离-L + Hunt** 承担。
- `C_base = uChroma`（球体色度标量，与 a,b 的 `cos/sin(hue)` 相乘）。
- **降级后（乘子，非绝对 L）**：
  - `L = mix(L_base, L_base * uFocusDimL, dimMix)`
  - `C = mix(C_base, C_base * uFocusDimChroma, dimMix)`
  - 再 `a = C*cos(hue)`，`b = C*sin(hue)`，OKLab→sRGB。

**定稿默认**（`galaxyMeshes.ts` / 实施报告）：**Phase 17 起** **`uFocusDimChroma = 1.0`**、**`uFocusDimL = 1.0`**——乘子等价于**关闭**本条路径，避免与 Hunt 双重压 C/L；Leva / `__galaxyColor` 仍可调。**Phase 11 历史默认**曾为 `uFocusDimChroma = 0.7`、`uFocusDimL = 1`；spec 标注 **Phase 17 起 Hunt 接管「非焦点背景相对变暗/降饱和」语义，P11.2 接口保留、默认乘子 = 1**。退出 focus（`uFocusedInstanceId === -1`）后无 `dimMix`。

#### 3.4.2 focus 暗化 vs selection 高亮（`uFocusDimMode` 双开关）

- **`uFocusDimMode = 0`**（本 Phase 默认）：凡处于 focus 会话、在 **idle** 层上且实例非焦点，即适用 §3.4.1 乘子降级（**active** 见 §3.4.3）。
- **`uFocusDimMode = 1`**（接口预留）：仅在 **`selectionMask == 0`**（或非选中）时对非焦点实例暗化；selected 高亮路径与 `selectionMask` 数据通道留给后续 Phase（搜索 / 多选）。**Phase 11 代码侧仅保证 uniform 存在；未接入 `selectionMask` 前，行为与 mode=0 等价（条件中占位为假）。**

#### 3.4.3 focus 飞入/保持/飞出：非目标 **active** 透明度与相机同步（Phase 11.1 · **已实装**；**Phase 25.3** 补充）

**范围**：仅 **`galaxyActive`** 片元 alpha；**idle** 不参与本条。**原计划**「近相机距离剔除 + NDC 外推」（`uFocusOcclusionRadius` / `uCameraWorldPos`）**未**按原计划实装；若仍需防 Perlin 与近邻 active 穿模，可另开任务叠加。

- **运行时 uniform**（与《视觉参数总表》§2、`scene.ts` / `galaxyActive.vert.glsl` 一致）：
  - **`uFocusCameraBlend ∈ [0,1]`**：与**相机**飞入/飞出动画**同一标量**——`selecting` 时等于 `easeOutCubic(t)`（与 `camera.position.lerpVectors(fromCam, toCam, ·)` 第三个参数一致）；`selected` 恒为 **1**；`deselecting` 为 **`1 - easeOutCubic(t)`**；`idle` 为 **0**。
  - **`uFocusActiveDimBlend ∈ [0,1]`**（**Phase 25.3**）：驱动顶点 **`dimAlpha = mix(1.0, uFocusNonTargetActiveAlpha, clamp(uFocusActiveDimBlend,0,1))`**，再经 hover 分支写入 **`vFocusAlphaMult`**。**宏观 idle → focus** 首次 **`selecting`**：与 **`uFocusCameraBlend`** 同为 **`p`**。**focus 内换星**（`selectingEnteredFromMacro === false`）：**`selecting` 全程 `uFocusActiveDimBlend = 1`**，仅相机 lerp 重跑，**避免**邻域 active 在换星过渡中短暂回到不透明。**`deselecting`**：与 **`uFocusCameraBlend`** 同步降为 **`1 - p`**。
  - **`uFocusTargetInstanceId`**：`selecting` / `selected` / `deselecting` 为当前操作对应的 **`pendingSelectInstanceIndex`**；`idle` 为 **-1**。用于在 **`uFocusedInstanceId === -1`** 的飞入阶段仍能识别「目标」实例，使目标 active **alpha 恒为 1**（飞入中仍不透明）。
  - **`uFocusNonTargetActiveAlpha`**：定稿默认 **0.08**（**Phase 13.6**：邻域 active 变密后由 **0.10** 下调；见《视觉参数总表》§2）。
  - **Phase 17 · focus 邻域 hover alpha**（与 **`uSelectionMode === 2`** 绑定，**不**作用于 person/genre **`uSelectionMode === 1`**）：`scene.ts` 将 **`hoveredMovieId`** 映射为 **`uHoveredInstanceId`**（无 hover 时为 **`-1`**）。当 **`gl_InstanceID === uHoveredInstanceId`** 且非主目标时，**`vFocusAlphaMult = max(dimAlpha, clamp(uFocusHoveredActiveAlpha, 0, 1))`**（默认 **`uFocusHoveredActiveAlpha = 0.4`**，可调 **`__galaxyColor.focusHoveredActiveAlpha`**），其中 **`dimAlpha`** 同上式由 **`uFocusActiveDimBlend`** 决定。**R 外**实例仍走 idle，**不**经本条。主 Perlin 焦点在双 mesh 上 **`sActive = 0`**，hover 命中焦点 id **不**额外「亮起」一颗 active 目标球。
- **焦点实例在 `selected` 后**仍在 vert 上 `sActive = 0`（双 mesh 隐藏），Perlin 为主视觉；本条主要压低**其余** slab 内 active，突出 focus。

#### 3.4.4 焦点近相机遮挡剔除（原计划 P11.1 · **未实装**）

**规格占位**（与 Phase 11 计划稿对齐，供未来如需启用时对照）：当 `uFocusedInstanceId >= 0` 且实例非焦点时，若实例 world 位置与相机距离 `< uFocusOcclusionRadius`（计划默认约 2.5 world），则 `sIdle/sActive → 0` 并走 NDC 外出口。**当前代码路径无此逻辑。**

#### 3.4.5 focus 态周边邻域 active（Phase 13 · **mask 语义**）

- **`uSelectionMode = 2`**（focus 邻域）：GPU 顶点路径上 **`inFocus` 与 `uSelectionMode = 1` 一致**——即按 **`uSelectionMask`** 纹理采样结果**覆盖**条带公式算出的 `inFocus`；**区别仅在 CPU 写 mask 的数据源**（本模式为**球形邻域 id 集合**，而非人名/genre 搜索的 `selectionIds`）。
- **邻域定义**：以**焦点影片**的 world 位置为球心、store **`focusNeighborRadius`**（世界单位）为半径 **R**，凡满足欧氏距离 **≤ R** 的影片 id 写入 mask（**含**焦点 id 与否以实现为准，拾取仍以 Perlin 球优先，见 §3.5.2）。
- **默认值**：`focusNeighborRadius` **5** world units（Leva **`__galaxy.focusNeighborRadius`** 可调；与《视觉参数总表》§6 一致）。
- **Phase 17 hover 读回**：邻域 mask 与 **§3.4.3** 的 **`uHoveredInstanceId` / `uFocusHoveredActiveAlpha`** 正交——mask 决定 **R 内**谁画 **active**；hover 仅在 **`uSelectionMode === 2`** 下微调 **active** 的 **`vFocusAlphaMult`**，**不**把 R 外 idle 升为 active。
- **退出 focus**：清空邻域 mask；**`uSelectionMode` 回到 `0`**（idle）或 **`1`**（若仍处于 person/genre **select** 会话且须在下一帧恢复 search mask，见下条 **D1**）；**`uHoveredInstanceId → -1`**。

#### 3.4.6 focus 态轨道相机（Phase 13 · **相机契约破例**）

- **`selectionPhase === 'selected'`** 且存在单片 focus 时：**`GALAXY_CAMERA_EULER` 恒定约束破例失效**；相机**位置** = **`pivot + offset(yaw, pitch)`**，其中 **pivot** 为焦点 world 位置，**offset** 由 store **`focusOrbit.{ yaw, pitch }`** 推导，**半径恒为 `FOCUS_PERLIN_CAMERA_STANDOFF`**（与 `camera.ts` 定稿一致；**不可**用滚轮改变该距离）。
- **朝向**：恒 **`lookAt(pivot)`**。
- **`selecting` / `deselecting`**：与抽屉/非目标 alpha 等一致，经 **`transitionDriver`** 同时对**世界坐标位置**（`lerpVectors`）与**四元数**（`slerp`）插值，自宏观机位过渡到轨道机位或反向。
- **`selectionPhase === 'idle'`**（无 focus）：恢复 **`GALAXY_CAMERA_EULER`**；**`focusOrbit.yaw` / `focusOrbit.pitch` 重置为 `0`**（**不含**径向 **`r`** 字段）。
- **滚轮**：整条 focus 相关相位（与单片 `selectedMovieId` 关联的 **`selecting` / `selected` / `deselecting`**）内滚轮 **noop**（不推进 `zCurrent`、不 dolly `camera.position.z`、不改变 standoff），以保证 Perlin 球屏幕尺寸严格映射 **`vote_count`**（见 Tech Spec §1.4.3）。**Phase 17**：含 **Space + 滚轮** 的 **dolly-to-cursor**（改 `zCamDistance`）在 focus 态同样 **noop**（与 P13.3 一致，保护 Perlin 距离恒定）。

### 3.5 Perlin 球 · 阶梯地形（Phase 11.3 起）

Perlin focus 球在片元侧按 **`vNoise`** 与 **`uThresh[0..K−2]`**（**K** = 本片展示 genre 数，≤8）形成 **K 档** `bandIdx`；顶点上将噪声区间改为 **至多 `uCutCount = max(0,K−1)` 段 `smoothstep`** 累加得到标量 **`level`**，再沿 **几何法线** 位移 **`level × uStepHeight`**（模型空间位移量；与 `mesh.scale.setScalar(worldRadius)` 相乘后为 world 高度）。各级阈值过渡带宽由 **`uStepSmoothness`** 控制（为 0 时可对照硬切）。

**尺度与包围球**：world 空间峰值半径约为 **`worldRadius × (1 + uCutCount × uStepHeight)`**。拾取与包围球 **`lastRadius`** 须按该上界放宽，避免阶梯最高点溢出射线/视锥判断。

**参数上限**：`uStepHeight` 由 Leva 与产品上限约束（须与 `near`、`FOCUS_PERLIN_CAMERA_STANDOFF` 相容）；具体数值定稿见《视觉参数总表》与 Phase 11 实施说明。

#### 3.5.1 Perlin 片元着色与光照（Phase 11.4 · **已实装**）

- **法线**：屏幕空间 **`cross(dFdx(vWorldPos), dFdy(vWorldPos))`** 与顶点输出的 **`vGeomNormalWorld`** 按 **`uFlatShadingMix`** 混合，再算 Lambert **`dot(N, uLightDir)`**。
- **底色**：每档 **`uHue[i]`** + 运行时 **`uPerlinL`** + **`uPerlinChroma`**，在 OKLab 平面用 **cos/sin(hue)** 配 **L**（与 idle/active 语义一致）；线性 RGB **clamp** 至 **[0,1]** 后再 **sRGB**，避免低 **L** / 高 **C** 出色域导致片元异常着色。**Phase 17**：在合成 `hueToOkSrgb(...)` 前可先令 **`C_new = uPerlinChroma × clamp(uPerlinL / uLMax, 0, 1)^γ`**（`γ` = **`uHuntGamma`**，与双 mesh 共享）；**仅当 `uHuntApplyMask` 的 Perlin 位（约定：bit 2，即 `mask & 4 != 0`）置位时**应用 Hunt；idle / active 分别为 **bit 0 / bit 1**，彼此独立可调。
- **vote→L**：**`vote_average`** 经与 **`galaxyIdle.vert.glsl`** 相同的 **P10.1** 映射写入 **`uPerlinL`**；入场系数快照来自 **`galaxy.idleMaterial.uniforms`**（与 `scene.ts` **`beginSelect`** 一致）。
- **hue**：**主 genre**（`movie.genres` 首个非空）若 JSON 含 **`movie.genre_hue`** 则该档直接用；其余档用 **`genreHueForGenreName`**。palette / `genre_hue` 的生成顺序以 [`TMDB 电影宇宙 Data Pipeline.md`](./TMDB%20电影宇宙%20Data%20Pipeline.md) 的 frozen palette 为准，前端不得自行重排。
- **光照定稿**：**`uLightDir = normalize(0.5, 0.5, -0.1)`**，**`uAmbient = 0.95`**，**`uDiffuse = 0.55`**，**`uFlatShadingMix = 0.8`**（详见《视觉参数总表》§4）。

**不透明化（P11.5 · 已实装）**：Perlin 材质现为 **`transparent: false`**、**`depthWrite: true`**、**`alphaTest: 0.01`**；`uAlpha` 在 `setOpacity()` 中按可见性走 **0/1 二态**，避免 focus 球在 bloom / 叠片场景出现透明边缘泄漏。

#### 3.5.2 focus 态拾取分流（Phase 11.6 · **已实装**）

- **优先级**：当 `selectedMovieId != null` 且 focus 球包围球（半径 `selectionPlanet.lastRadius`）沿射线命中距离 **早于** active 命中时，hover/click 视为焦点星交互。  
- **回落**：若未命中 focus 球，或 active 命中更近，则按既有 `pickClosestActiveMovieAlongRay` 路径处理，可切换到另一颗 active 星。  
- **语义**：focus 球 hover 继续写 `hoveredMovieId`（单一来源），tooltip 与 ring 逻辑不分叉；点击 focus 球保持当前 focus，不误切后景。

### 3.6 select（正式态 · Phase 12）

**语义**：前端 **`selectionIds: number[]`** 非空、`searchMode ∈ {'person','genre'}` 时即为 **select 会话**。该会话下，**宏观 active 可视集合完全由 `selectionIds` 决定**，**与时间轴 `viswindow` 解耦**：shader 内 `uSelectionMode == 1` 时 **`inFocus`** 由 **`uSelectionMask`** 重写，**不再读取** `uZCurrent / uZVisWindow` 推导的 `inFocus_band`。Timeline UI 与 store `zCurrent / zVisWindow` 的写入通路保持运转（保留状态以便随时退出 select 回到时间轴态），但**视觉无反馈**（用户拖时间轴不会改变 active 集合）。

**与 focus 的优先级**：**`focus > select > active / idle / hover`**。

- **focus 嵌套**：用户在 select 会话中点击 active 影片可同时进入 focus；focus 实例走 Perlin / 双 mesh 隐藏（`uFocusedInstanceId`），**mask 仅作用于非焦点实例**（与 §3.4.2 `uFocusDimMode` 联动）。**Phase 13（D1）**：当 **focus 与 person/genre select 并存**时，**focus 邻域 mask（`uSelectionMode = 2`）替换** search mask（`mode = 1`）对非焦点的可视/拾取语义；**退出 focus** 后若 **`selectedMovieId === null`** 且 **`searchMode ∈ { 'person','genre' }`**，在随后 RAF **自动恢复** `uSelectionMode = 1` 与 search mask。**ESC 取消 focus 时保留 select 上下文**（`searchMode` / `selectionIds` / 连线不清）；再次 ESC 才退出 select（与 Design Spec §4.6 焦点栈一致）。
- **搜电影名并点选**：直接走 `selectedMovieId` → focus，**不**进入 §3.6 select。

**selectionMask 数据流**：

- **GPU**：`uSelectionMask` = `DataTexture(RedFormat, UnsignedByte)`，宽 `movieCount`、高 1，每实例 **0/1**；`uSelectionMode` ∈ **`{0,1,2}`**：`0` = 关闭（与 Phase 8–11 行为一致，inFocus 由条带驱动），`1` = **search** mask 覆盖 inFocus（仅非焦点实例），`2` = **focus 邻域球** mask 覆盖 inFocus（§3.4.5；CPU 来源为 pivot+R 内 id 列表）。
- **CPU**：`selectionIds → idToIndex → DataTexture` 写入并 `needsUpdate=true`；清空 → mode=0 + 全零。

**人名连线**：`searchMode === 'person'` 且 `constellationEnabled` 时，`LineSegments` 按 **`release_date` 升序**连接 mask 内影片；`constellationEnabled` 默认 `true`，**产品 UI 不暴露**；调试通过 **`window.__galaxy.constellationEnabled`**（见《视觉参数总表》§4a）。`searchMode === 'genre'` 不画连线。

#### 3.6.1 ESC 焦点栈（Phase 12.8 · 实现收口）

与 [Design Spec §4.6](./TMDB%20电影宇宙%20Design%20Spec.md) 一致；`App.tsx` 在 **`window` `keydown` capture** 阶段自上而下处理，**命中一级即 `preventDefault` + `stopPropagation`**（避免与 Radix Sheet 重复闭合并保证顺序）。

| 级 | 条件 | 行为 |
|----|------|------|
| 1 | `document.activeElement` 为带 `data-galaxy-search-input` 的搜索框 | **仅 `blur()`**；不清 query、不收联想、不改 `searchMode` / `selectionIds` |
| 2–3 | `selectedMovieId !== null`（含 Sheet 已打开或飞入途中） | **`selectedMovieId → null`** 取消 focus；**若 `searchMode ∈ {'person','genre'}` 则保留 select**（mask / 连线 / `selectionIds` 不变） |
| 4 | `searchMode !== 'idle'` | 调用 **`clearSearch()`**（`selectionIds` 清空、mask 归零、连线隐藏、`searchMode → 'idle'`） |

**与 INFO Modal 不交叠**：焦点在 `#app-info-dialog` 内时不处理上表（交由 Radix Dialog 默认 Esc 关闭）。

**搜电影名**：仅走 `selectedMovieId`，`searchMode` 保持 `'idle'`，故第 4 级不触发；两次 Esc 行为以实现为准（先 blur → 再取消 focus）。

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
| 2026-04-28 | P11.2 定稿对齐：§3.4.1 仅 **idle** 乘子降 C/L；`uFocusDimChroma=0.7`、`uFocusDimL=1`；active 见 §3.4.3 |
| 2026-04-28 | Phase 11.1：§3.4.3 改为「非目标 active alpha + 相机同步」实装说明；§3.4.4 为原遮挡剔除占位（未实装） |
| 2026-04-29 | P11.4：§3.4 focus 表更新 Perlin detail / 色彩；§3.5 改为 **K 档**阈值与 **`lastRadius`** 公式；新增 **§3.5.1** Perlin 片元与光照定稿；指向《视觉参数总表》§4 与 [`Phase 11.4 … 实施报告.md`](../reports/Phase%2011.4%20P11.4%20Perlin%20法线重构%20vote→L%20genre%20色与光照定稿%20实施报告.md) |
| 2026-04-29 | P11.7 文档收口：§3.5 标注 **P11.5 不透明化已实装**；新增 **§3.5.2** focus 态拾取分流（P11.6）定稿描述 |
| 2026-04-29 | Phase 12 P12.0：**§1** 表格 **`select` 转正**；**§3.6** 重写为正式态（selectionMask、`viswindowDisabled`、与 focus 优先级、连线摘要） |
| 2026-04-29 | Phase 12 P12.0 收口：§3.6 明确 select 会话下 **active 集合完全由 `selectionIds` 决定、与 viswindow 完全解耦**；focus 嵌套 ESC 仅取消 focus 而保留 select；连线开关仅 **`window.__galaxy`**（产品 HUD 无入口） |
| 2026-05-02 | Phase 16 P16.0：新增 **§3.2.1 active 材质双路径**（select 单态 opaque + depthWrite；其余 transparent + P11.1）；§3.2 表格与 `galaxyMeshes` 初值对齐并引用 §3.2.1 |
| 2026-04-29 | Phase 12 P12.9：§3.6 连线开关表述与实现对齐（`window.__galaxy.constellationEnabled`）；性能归档指针见《Phase 8 基线》**`## P12 入口/出口`** |
| 2026-04-29 | Phase 12 P12.8：**§3.6.1** ESC 焦点栈实现表（`App.tsx` capture、`data-galaxy-search-input`、INFO Modal 排除） |
| 2026-04-30 | Phase 18 文档同步：`genre_hue` / palette 顺序改由 Data Pipeline SSOT 的 frozen palette 管理 |
| 2026-04-30 | **Phase 13 P13.0**：§3.4 表修订（邻域球、轨道相机、退出路径）；新增 **§3.4.5** 邻域 mask、**§3.4.6** 轨道相机；§3.6 **`uSelectionMode = 2`** 与 **focus×select（D1）** mask 替换语义 |
| 2026-05-01 | **Phase 13 P13.7**：文档与 Phase 8 基线收口；§3.4.3 **`uFocusNonTargetActiveAlpha`** 默认与代码对齐为 **0.08**（P13.6）；性能三线未重录时见 [`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) **`## P13 出口`** |
| 2026-05-02 | **Phase 16 P16.4**：[`Phase 8 基线`](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) 新增 **`## P16 出口`**（复跑 §P12 **B** 压力片段 `Drama` / Christopher Nolan + 手测回归清单）；与 §3.2.1 active 双路径验收交叉引用 |
| 2026-05-03 | **Phase 17 P17.0（spec）**：§3.1 idle 色彩链改为 **L_star → 距离-L → Hunt** + opaque/depthWrite；§3.2 active 加 Hunt；§3.4.1 P11.2 **默认 1.0/1.0** 与 Hunt 语义分工；§3.5.1 Perlin Hunt + **`uHuntApplyMask` bit2**；§3.4.6 focus 滚轮 noop 与 **Space / Ctrl** 滚轮契约对齐（见 P17.3 报告） |
| 2026-05-03 | **Phase 17 P17.3**：§3.4.6 **focus 滚轮 noop** 与 **`Space + wheel` dolly** 对齐（替换草案 Alt/Ctrl）；实施报告 [`Phase 17.3 P17.3 Space dolly 局部缩放与相机契约 实施报告.md`](../reports/Phase%2017.3%20P17.3%20Space%20dolly%20局部缩放与相机契约%20实施报告.md) |
| 2026-05-03 | **Phase 17 P17.4**：§3.3 补 GPU hover 与邻域 alpha 分工；§3.4.3 补 **`uHoveredInstanceId` / `uFocusHoveredActiveAlpha`**；§3.4.5 补与 hover uniform 关系；基线见 **`docs/benchmarks/Phase 8 基线 P8.0 性能与 P8.4 准入.md`** **`## P17 出口`** |
| 2026-05-03 | **Phase 19 P19**：§3.2.1 路径 **A** = **`selectionPhase === 'idle'` ∧ `selectedMovieId === null`**（宏观默认 opaque）；路径 **B** = focus 特例；演进说明 **Phase 16 → 19**（收敛 **`searchMode`** 矩阵口径） |
