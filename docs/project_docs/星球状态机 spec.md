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
| **大小** | 双 mesh 上该 instance **零尺度**；Perlin 球 **detail = 8**（P11.3；取代早期文档中的 detail 6） |
| **色彩** | Perlin **K 档**（≤8）噪声阈值分区 + **OKLab（L/C/hue）**；**Phase 11.4**：**`uPerlinL`** 与 **`vote_average`** 经 **P10.1** 与宏观一致；**主 genre** 优先 **`movie.genre_hue`**；**vote_count** 在 focus 态仍通过 **worldRadius** 影响球尺度；**小 vote 片 focus 后视觉偏小为 intended**（产品接受） |
| **可交互性** | 抽屉/详情；ESC 或 UI 取消选中 |
| **进入/退出** | 相机动画时长沿用现 `SELECT_MS` / `DESELECT_MS`（数值以《视觉参数总表》为准）；P8.4 起 `flyToFocus` 使用**物理距离常数** `FOCUS_CAM_DIST` |

#### 3.4.1 focus 视觉降级（Phase 11.2 · **idle 层**）

**范围**：仅 **`galaxyIdle.vert.glsl`（背景 idle 球）**。**active** 层的 chroma/L **不因本条改变**；非目标 **active** 的视觉弱化由 **§3.4.3（P11.1）** 的片元 **alpha** 与 **`uFocusCameraBlend`** 负责。

当 `uFocusedInstanceId >= 0` 且当前实例**不是**焦点实例时，在 idle 顶点着色器内对已有 **`L_base` / `C_base`** 做**乘子**混合（非焦点 idle「降饱和 / 可选压亮度」）；**焦点实例**在 idle 上 **`sIdle = 0`**（双 mesh 常规策略），本条主要针对**其余** idle。

- 令 `dimEligible = (uFocusedInstanceId >= 0) && !isFocused`，`dimMix = dimEligible ? 1.0 : 0.0`（mode=0 下；mode=1 见下节；shader 内对 `uFocusDimMode` 0/1 暂与 0 等价至 `selectionMask` 落地）。
- `L_base`：与 `galaxyIdle.vert.glsl` 中 **P10.1** 对 `voteNorm` 的压缩 + `pow` + `mix(uLMin, uLMax, ·)` 一致（**非**简单 `mix(voteNorm)`）。
- `C_base = uChroma`（球体色度标量，与 a,b 的 `cos/sin(hue)` 相乘）。
- **降级后（乘子，非绝对 L）**：
  - `L = mix(L_base, L_base * uFocusDimL, dimMix)`
  - `C = mix(C_base, C_base * uFocusDimChroma, dimMix)`
  - 再 `a = C*cos(hue)`，`b = C*sin(hue)`，OKLab→sRGB。

**定稿默认**（`galaxyMeshes.ts` / 实施报告）：`uFocusDimChroma = 0.7`（相对原 chroma 的倍率）、`uFocusDimL = 1`（相对 `L_base` 的倍率；为 **1** 时表示 focus 时仅靠饱和度弱化、**不压明度**）。退出 focus（`uFocusedInstanceId === -1`）后无 `dimMix`。

#### 3.4.2 focus 暗化 vs selection 高亮（`uFocusDimMode` 双开关）

- **`uFocusDimMode = 0`**（本 Phase 默认）：凡处于 focus 会话、在 **idle** 层上且实例非焦点，即适用 §3.4.1 乘子降级（**active** 见 §3.4.3）。
- **`uFocusDimMode = 1`**（接口预留）：仅在 **`selectionMask == 0`**（或非选中）时对非焦点实例暗化；selected 高亮路径与 `selectionMask` 数据通道留给后续 Phase（搜索 / 多选）。**Phase 11 代码侧仅保证 uniform 存在；未接入 `selectionMask` 前，行为与 mode=0 等价（条件中占位为假）。**

#### 3.4.3 focus 飞入/保持/飞出：非目标 **active** 透明度与相机同步（Phase 11.1 · **已实装**）

**范围**：仅 **`galaxyActive`** 片元 alpha；**idle** 不参与本条。**原计划**「近相机距离剔除 + NDC 外推」（`uFocusOcclusionRadius` / `uCameraWorldPos`）**未**按原计划实装；若仍需防 Perlin 与近邻 active 穿模，可另开任务叠加。

- **运行时 uniform**（与《视觉参数总表》§2、`scene.ts` 一致）：
  - **`uFocusCameraBlend ∈ [0,1]`**：与选中相机动画**同一标量**——`selecting` 时等于 `easeOutCubic(t)`（与 `camera.position.lerpVectors(fromCam, toCam, ·)` 第三个参数一致）；`selected` 恒为 **1**；`deselecting` 为 **`1 - easeOutCubic(t)`**；`idle` 为 **0**。
  - **`uFocusTargetInstanceId`**：`selecting` / `selected` / `deselecting` 为当前操作对应的 **`pendingSelectInstanceIndex`**；`idle` 为 **-1**。用于在 **`uFocusedInstanceId === -1`** 的飞入阶段仍能识别「目标」实例，使目标 active **alpha 恒为 1**（飞入中仍不透明）。
  - **`uFocusNonTargetActiveAlpha`**：定稿默认 **0.1**；非目标 active 片元 `alpha = mix(1.0, uFocusNonTargetActiveAlpha, uFocusCameraBlend)`（在 vert 打包为 `vFocusAlphaMult` 传入片元）。
- **焦点实例在 `selected` 后**仍在 vert 上 `sActive = 0`（双 mesh 隐藏），Perlin 为主视觉；本条主要压低**其余** slab 内 active，突出 focus。

#### 3.4.4 焦点近相机遮挡剔除（原计划 P11.1 · **未实装**）

**规格占位**（与 Phase 11 计划稿对齐，供未来如需启用时对照）：当 `uFocusedInstanceId >= 0` 且实例非焦点时，若实例 world 位置与相机距离 `< uFocusOcclusionRadius`（计划默认约 2.5 world），则 `sIdle/sActive → 0` 并走 NDC 外出口。**当前代码路径无此逻辑。**

### 3.5 Perlin 球 · 阶梯地形（Phase 11.3 起）

Perlin focus 球在片元侧按 **`vNoise`** 与 **`uThresh[0..K−2]`**（**K** = 本片展示 genre 数，≤8）形成 **K 档** `bandIdx`；顶点上将噪声区间改为 **至多 `uCutCount = max(0,K−1)` 段 `smoothstep`** 累加得到标量 **`level`**，再沿 **几何法线** 位移 **`level × uStepHeight`**（模型空间位移量；与 `mesh.scale.setScalar(worldRadius)` 相乘后为 world 高度）。各级阈值过渡带宽由 **`uStepSmoothness`** 控制（为 0 时可对照硬切）。

**尺度与包围球**：world 空间峰值半径约为 **`worldRadius × (1 + uCutCount × uStepHeight)`**。拾取与包围球 **`lastRadius`** 须按该上界放宽，避免阶梯最高点溢出射线/视锥判断。

**参数上限**：`uStepHeight` 由 Leva 与产品上限约束（须与 `near`、`FOCUS_PERLIN_CAMERA_STANDOFF` 相容）；具体数值定稿见《视觉参数总表》与 Phase 11 实施说明。

#### 3.5.1 Perlin 片元着色与光照（Phase 11.4 · **已实装**）

- **法线**：屏幕空间 **`cross(dFdx(vWorldPos), dFdy(vWorldPos))`** 与顶点输出的 **`vGeomNormalWorld`** 按 **`uFlatShadingMix`** 混合，再算 Lambert **`dot(N, uLightDir)`**。
- **底色**：每档 **`uHue[i]`** + 运行时 **`uPerlinL`** + **`uPerlinChroma`**，在 OKLab 平面用 **cos/sin(hue)** 配 **L**（与 idle/active 语义一致）；线性 RGB **clamp** 至 **[0,1]** 后再 **sRGB**，避免低 **L** / 高 **C** 出色域导致片元异常着色。
- **vote→L**：**`vote_average`** 经与 **`galaxyIdle.vert.glsl`** 相同的 **P10.1** 映射写入 **`uPerlinL`**；入场系数快照来自 **`galaxy.idleMaterial.uniforms`**（与 `scene.ts` **`beginSelect`** 一致）。
- **hue**：**主 genre**（`movie.genres` 首个非空）若 JSON 含 **`movie.genre_hue`** 则该档直接用；其余档用 **`genreHueForGenreName`**（palette key 排序对齐 Python **`sorted(found)`**，**勿**用 `localeCompare` 排序）。
- **光照定稿**：**`uLightDir = normalize(0.5, 0.5, -0.1)`**，**`uAmbient = 0.95`**，**`uDiffuse = 0.55`**，**`uFlatShadingMix = 0.8`**（详见《视觉参数总表》§4）。

**不透明化（P11.5 · 已实装）**：Perlin 材质现为 **`transparent: false`**、**`depthWrite: true`**、**`alphaTest: 0.01`**；`uAlpha` 在 `setOpacity()` 中按可见性走 **0/1 二态**，避免 focus 球在 bloom / 叠片场景出现透明边缘泄漏。

#### 3.5.2 focus 态拾取分流（Phase 11.6 · **已实装**）

- **优先级**：当 `selectedMovieId != null` 且 focus 球包围球（半径 `selectionPlanet.lastRadius`）沿射线命中距离 **早于** active 命中时，hover/click 视为焦点星交互。  
- **回落**：若未命中 focus 球，或 active 命中更近，则按既有 `pickClosestActiveMovieAlongRay` 路径处理，可切换到另一颗 active 星。  
- **语义**：focus 球 hover 继续写 `hoveredMovieId`（单一来源），tooltip 与 ring 逻辑不分叉；点击 focus 球保持当前 focus，不误切后景。

### 3.6 select（正式态 · Phase 12）

**语义**：前端 **`selectionIds: number[]`**（TMDB `movie.id` 列表）**非空**，且处于 **人名 / genre 搜索**导致的 **`viswindowDisabled`** 会话时，即视为 **select** 会话。此时时间轴「条带」仍在后台更新 **`zCurrent` / `zVisWindow`**，但 **galaxy shader** 侧用 **`uSelectionMask`（R8 `DataTexture`，长度 = `movies.length`）** 与 **`uSelectionMode`** 将 mask 内实例强制为 **宏观 active 可视集合**，**实质等价**于条带内 **`inFocus`** 由 mask 重写（详见 Tech Spec §4 配套索引与 uniform 约定；实现见 `galaxyMeshes.ts` / `selectionMask.ts`）。

**与 focus 的优先级**：**`focus > select > active / idle / hover`**。

- 当 **`uFocusedInstanceId >= 0`**（正在 focus 某一影片）时：**焦点实例**仍走 Perlin / 双 mesh 隐藏逻辑，**不被 mask 剥夺焦点**；mask 仅作用于**非焦点**实例的明暗 / dim 策略（与 §3.4.2 **`uFocusDimMode`**、Phase 12 计划「focus 与 mask 重叠」一致）。
- **搜电影名并点选**：仅触发既有 **`selectedMovieId`** → focus，**不**进入 §3.6 select（`selectionIds` 保持空或未使用）。

**`viswindowDisabled`（派生）**：**`searchMode === 'person'` 或 `searchMode === 'genre'`** 时为真（与 Zustand store 一致）。语义：条带驱动的 **`inFocus`** 在视觉上被 selection 覆盖，用户仍可拖动时间轴，但**所见「活跃集合」由选中的人名 / genre 决定**。

**selectionMask 数据流（摘要）**：

- GPU：**`uSelectionMask`**：`DataTexture(RedFormat, UnsignedByte)`，宽 **`movieCount`**、高 **1**，每实例 **0..1**；**`uSelectionMode`**：`0` = 关闭（与 Phase 8–11 行为一致），**`1`** = mask 覆盖 **`inFocus`**（仅非焦点实例），等。
- CPU：`selectionIds` → `idToIndex` → 写入纹理 → **`needsUpdate`**；清空则 mode=`0`、全零。

**与人名连线**：**`searchMode === 'person'`** 且 **`constellationEnabled`** 时，`LineSegments` 按 **`release_date` 升序**连接 mask 内影片（详见 Phase 12 `constellation.ts`）；**genre 模式不画连线**。

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
