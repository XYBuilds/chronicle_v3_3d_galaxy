---
name: phase 17 visual system upgrade
overview: Phase 17 升级整体色彩与交互系统：上线 Hunt 效应（C 随 L 衰减 ~ C_base × (L/L_base)^γ）覆盖 idle / active / Perlin 三层 OKLab 色彩公式，禁用 P11.2 focus 态 idle 降 C/L 路径作为对照；调小 P10.2 距离衰减 K 默认值（远处 L 衰减回调）；新增 Alt/Ctrl + 滚轮 = dolly-to-cursor 双模式（默认沿 Z 穿梭维持），zCamDistance 由 wheel 写入实现"以光标为中心"的物理推近，zCurrent 不变。
todos:
  - id: p170-spec
    content: P17.0 spec 升级（无代码）：状态机 / 视觉参数总表 / Tech Spec / Design Spec 同步 Hunt 全层 + P11.2 默认禁用 + zCamDistance 运行时可调 + 滚轮双模式
    status: pending
  - id: p171-hunt
    content: P17.1 Hunt 效应全层接入 + P11.2 默认值禁用：oklab.glsl 增 applyHuntChroma；galaxyMeshes.ts 加 uHuntGamma / uHuntApplyMask + uFocusDim默认 1.0；idle / active vert + perlin.frag 接入；__galaxyColor 拓展
    status: pending
  - id: p172-distance-falloff
    content: P17.2 P10.2 距离衰减 K 扫参回调：uDistanceFalloffK 默认从 0.0001 → 0.00005；P17.4 扫参后写回最终默认值
    status: pending
  - id: p173-dolly-zoom
    content: P17.3 Alt/Ctrl + 滚轮 dolly-to-cursor：camera.ts onWheel 加 altLike 分支；dollyToCursor helper（unproject 两次保持光标 NDC）；zCamDistance clamp [2, 300]；focus 态 noop（控 macro 分支拦截）
    status: pending
  - id: p174-doc-sync
    content: P17.4 文档同步 + 回归 + 出口 fps：三份 spec / Phase 8 基线 P17 出口 / 实施报告；扫参收口（γ / mask / K / dolly speed 默认值）；mac/win/chrome/safari 手测 dolly
    status: pending
isProject: false
---

# Phase 17 — 视觉系统升级

> 接 Phase 13/14/15/16 体验与 HUD 抛光后的状态。本 Phase **首次**让 `zCamDistance` 成为运行时变量（之前是 Phase 5.1.5 起的常量），并把 OKLab 色彩公式从「L 来自 vote_average，C 是常量」升级为「Hunt 效应：C 随 L 衰减」。属于 shader 与相机契约级改动，是 Phase 13 后的二档风险。

## 范围

- 子节点：P17.0 → P17.4
- 数据契约：**不变**
- 渲染管线：idle / active vert + perlin.frag 公式扩 Hunt；新增共享 uniform `uHuntGamma`、`uHuntApplyMask`（位标志，便于关闭单层调试）
- 相机契约：`zCamDistance` 从「常量 30」改为「运行时变量，由 Alt+wheel / dev tool 写入；默认值仍 30」；store 已有该字段，无需扩
- 涉及文件（预计）：
  - [frontend/src/three/galaxyMeshes.ts](frontend/src/three/galaxyMeshes.ts)（新增 uniforms + 默认值；P11.2 默认值改为关闭）
  - [frontend/src/three/shaders/oklab.glsl](frontend/src/three/shaders/oklab.glsl)（新增 `applyHuntChroma(L, L_ref, C_base, gamma) -> C_new` helper）
  - [frontend/src/three/shaders/galaxyIdle.vert.glsl](frontend/src/three/shaders/galaxyIdle.vert.glsl)（接入 Hunt；P11.2 dim 路径默认无效化）
  - [frontend/src/three/shaders/galaxyActive.vert.glsl](frontend/src/three/shaders/galaxyActive.vert.glsl)（接入 Hunt）
  - [frontend/src/three/shaders/perlin.frag.glsl](frontend/src/three/shaders/perlin.frag.glsl)（接入 Hunt — `uPerlinChroma → C_new`）
  - [frontend/src/three/planet.ts](frontend/src/three/planet.ts)（focus 入场快照 `uHuntGamma`）
  - [frontend/src/three/camera.ts](frontend/src/three/camera.ts)（onWheel 分支：Alt/Ctrl 触发 dolly-to-cursor；R_MIN/R_MAX 安全区 clamp）
  - [frontend/src/three/scene.ts](frontend/src/three/scene.ts)（`__galaxyColor.huntGamma` / `__galaxyColor.huntApplyMask` debug；`__galaxyInteraction.zCamDistance` 仍可手写）
  - [docs/project_docs/星球状态机 spec.md](docs/project_docs/星球状态机%20spec.md) §3.1 / §3.2 / §3.4.1 / §3.5
  - [docs/project_docs/视觉参数总表.md](docs/project_docs/视觉参数总表.md) §1（zCamDistance 改为运行时） / §2（Hunt uniforms）/ §4（Perlin Hunt）
  - [docs/project_docs/TMDB 电影宇宙 Tech Spec.md](docs/project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) §1.4.1 / §1.4.3
  - [docs/project_docs/TMDB 电影宇宙 Design Spec.md](docs/project_docs/TMDB%20电影宇宙%20Design%20Spec.md) §1（色彩） / §2.1（滚轮双模式）

## 决策表（已锁定）

| #   | 决策项                      | 选定方案                                                                                                                      | 备注                                                                                                            |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| D1  | Hunt 应用范围               | **全层 idle + active + Perlin**                                                                                               | 三层共享 `uHuntGamma`；perlin.frag 内对 K 档共享 hue + 同一 L → 同一 C_new                                      |
| D2  | Hunt 公式形式               | `C_new = C_base × clamp(L_actual / L_ref, 0, 1)^γ`                                                                            | `L_ref` = `uLMax`（满分电影 L 端点，与现状参考一致）；`C_base` = 现 `uChroma`；γ 默认 `1.0` 起步，Leva 扫参后定 |
| D3  | P11.2 idle 降 C/L 处置      | **禁用**（默认 `uFocusDimChroma=1.0` / `uFocusDimL=1.0`）                                                                     | 不删 uniform；通过默认值生效。Leva 仍可调；Phase 11.2 spec 标注「Phase 17 起 Hunt 接管语义，默认值保留乘子=1」  |
| D4  | P10.2 距离衰减 K 默认值     | **0.00005**（当前 0.0001 的一半，初值；Leva 扫参后定）                                                                        | 用户原话「远处星星 L 衰减得太快，需要回调一点」；扫参后写回 `galaxyMeshes.ts`                                   |
| D5  | Alt + 滚轮放大机制          | **Dolly-to-cursor**：改 `zCamDistance`（推近 / 拉远），同时偏移 camera.x/y 让光标 NDC 命中世界点不变；fov 不变；zCurrent 不变 | 触摸板 pinch（`e.ctrlKey=true`，无键盘修饰）也走该分支；mac Cmd 不触发                                          |
| D6  | dolly 安全区                | `zCamDistance ∈ [2, 300]`                                                                                                     | MIN=2 避免相机进入 zCurrent 平面（`near=0.05` 还有余量）；MAX=300 避免 far culling 大量 active                  |
| D7  | dolly 影响 viswindow 视觉吗 | **不影响**：viswindow 视觉仍由 zCurrent / zVisWindow 驱动；dolly 只改物理距离与可视范围（屏幕投影 size 自然变化）             | Timeline 指针位置不动                                                                                           |

## 执行顺序

```mermaid
flowchart TD
    P170["P17.0 spec 升级（无代码）"]
    P171["P17.1 Hunt 效应全层接入 + P11.2 默认值禁用"]
    P172["P17.2 P10.2 距离衰减 K 扫参回调"]
    P173["P17.3 Alt/Ctrl + 滚轮 dolly-to-cursor"]
    P174["P17.4 文档同步 + 回归 + 出口 fps"]

    P170 --> P171
    P170 --> P172
    P170 --> P173
    P171 --> P174
    P172 --> P174
    P173 --> P174
```

依赖说明：
- **P17.0** 先行：把 D1–D7 写入三份 spec
- **P17.1 / P17.2 / P17.3** 互相独立，可并行；建议 P17.1 先做（核心视觉变化），P17.2 / P17.3 跟进
- **P17.4** 收尾：扫参定 K / γ / dolly 速度默认值

---

## P17.0 spec 升级（无代码）

### 状态机 spec §3.1 / §3.2 / §3.4.1 / §3.5

- §3.1 idle 色彩条目：从「`uChroma` 标量」改为「`uChroma`（C_base）+ Hunt 衰减 `C_new = C_base × (L/L_max)^γ`，γ 由 `uHuntGamma` 控制，默认 1.0」
- §3.2 active 色彩条目：同步加 Hunt 说明
- §3.4.1 focus 视觉降级：保留 P11.2 uniform 接口，**默认值改为 chroma=1.0 / L=1.0**（不压制），把"非焦点降饱和"语义交给 Hunt（Phase 17 起 idle 内 L 已经压低 → C 也跟着压低）
- §3.5.1 Perlin 片元：在 `hueToOkSrgb(uHue[i], uPerlinL, uPerlinChroma)` 之前先计算 `C_new = uPerlinChroma × (uPerlinL/uLMax)^γ`，再传入；**仅当 `uHuntApplyMask` 第 2 位置位时**生效（与 idle/active 第 0/1 位独立）
- 变更记录：Phase 17 行

### 视觉参数总表 §1 / §2 / §4

- §1：把「`zCamDistance = 30`（常量）」改为「**`zCamDistance` 默认 30 / 运行时可调**（Alt/Ctrl + wheel dolly-to-cursor）；安全区 `[2, 300]`」；新增「Wheel 双模式」节
- §2：双 mesh 共享 uniform 列表加 **`uHuntGamma`（默认 1.0）/`uHuntApplyMask`（默认 `0b111` = 7）**；P11.2 默认值改为 1.0 / 1.0；P10.2 `uDistanceFalloffK` 默认值改为 0.00005
- §4：Perlin 表加 Hunt 行（与 §3.5.1 一致）
- §8 Dev 调试桥：`__galaxyColor.huntGamma` / `__galaxyColor.huntApplyMask`；`__galaxyInteraction.zCamDistance` 已存在；新增 `__galaxyInteraction.dollyZoomSpeed`

### Tech Spec §1.4.1 / §1.4.3

- §1.4.1 表格 `zCamDistance` 行：注释改为「**Phase 17 起**：默认 30；运行时由 Alt/Ctrl + wheel 写入，安全区 [2, 300]」
- §1.4.3 滚轮控制：扩为「**双模式**」：
  - **默认（无修饰键）**：维持 Phase 5.1.5 macro Z scroll 行为
  - **Alt 或 Ctrl 修饰**：dolly-to-cursor，改 `zCamDistance`，同步偏移 camera.x/y 保持光标命中点 NDC 不变；zCurrent 与 fov 不变
  - 在 focus 态：现状 `getMacroZWheel === false`（特写推拉）保留；Phase 13 P13.3 已决策 focus 态 wheel = noop 不动，因此 Alt+wheel 在 focus 态也 noop（保护 Perlin 球距离恒定）
- §1.4.4 clamp：补 `zCamDistance ∈ [2, 300]`

### Design Spec §1 / §2.1

- §1「内核亮度」段：补一句 Hunt 效应说明（"项目内 OKLab L 与 C 联动：L 下降时 C 同比衰减，模拟人眼在低光照下感知的色彩饱和度下降"）
- §2.1 摄像机控制：滚轮节扩为「双模式」（同 Tech Spec §1.4.3）

---

## P17.1 Hunt 效应全层接入 + P11.2 默认值禁用

### oklab.glsl 增 helper

[frontend/src/three/shaders/oklab.glsl](frontend/src/three/shaders/oklab.glsl) 增：

```glsl
/**
 * Hunt-style chroma scaling: C drops with L to mimic perceptual desaturation
 * under low lightness. Returns C_new in same units as C_base.
 *
 * - L_actual: current sample lightness (e.g. mix(uLMin, uLMax, voteNorm) result)
 * - L_ref:    reference lightness — typically uLMax (top-rated star)
 * - C_base:   reference chroma at full lightness (e.g. uChroma)
 * - gamma:    exponent (1.0 = linear; 0.5 = gentler; 1.5+ = aggressive)
 */
float applyHuntChroma(float L_actual, float L_ref, float C_base, float gamma) {
  float t = clamp(L_actual / max(L_ref, 1e-4), 0.0, 1.0);
  return C_base * pow(t, gamma);
}
```

### 共享 uniform

[galaxyMeshes.ts](frontend/src/three/galaxyMeshes.ts) `makeSharedUniforms` 加：

```ts
uHuntGamma: { value: 1.0 },
/** Bit 0 = idle vert apply, bit 1 = active vert apply, bit 2 = perlin frag apply.
 *  Default 0b111 = 7 (all on); set to 0 to A/B compare against pre-Hunt look. */
uHuntApplyMask: { value: 7 },
```

P11.2 默认值同步改：

```ts
uFocusDimChroma: { value: 1.0 }, // was 0.7 — disabled, Hunt 接管降饱和语义
uFocusDimL: { value: 1.0 },      // unchanged 1.0 (was already 1)
```

### Idle vert 接入

[galaxyIdle.vert.glsl](frontend/src/three/shaders/galaxyIdle.vert.glsl) 现有路径（粗略）：
1. `voteNorm` → P10.1 压缩 + pow → `t`
2. `L_base = mix(uLMin, uLMax, t)`
3. `C_base = uChroma`
4. P11.2 乘子：`L = mix(L_base, L_base*uFocusDimL, dimMix)`；`C = mix(C_base, C_base*uFocusDimChroma, dimMix)`
5. `a = C*cos(hue)`，`b = C*sin(hue)`，OKLab→sRGB

改为：
1. 同上
2. 同上
3. `C_base_after_hunt = (uHuntApplyMask & 1) != 0 ? applyHuntChroma(L_base, uLMax, uChroma, uHuntGamma) : uChroma`
4. P11.2 乘子继续作用于 `C_base_after_hunt`（保留接口，默认值 1.0 等于无操作）
5. 不变

注：使用 GLSL 位运算需确认 WebGL2 GLSL ES 3.00 支持 `&`（支持，对 int 操作）；`uHuntApplyMask` 类型定义为 `int`。

### Active vert 接入

[galaxyActive.vert.glsl](frontend/src/three/shaders/galaxyActive.vert.glsl)：路径与 idle 相同，但 P11.2 dim 不作用于 active（Phase 11.1 决策：active 仅 alpha 渐变）。Hunt 仍接入：

```glsl
float C_base_after_hunt = (uHuntApplyMask & 2) != 0 ? applyHuntChroma(L_base, uLMax, uChroma, uHuntGamma) : uChroma;
```

### Perlin frag 接入

[perlin.frag.glsl](frontend/src/three/shaders/perlin.frag.glsl) 现 `hueToOkSrgb(uHue[i], uPerlinL, uPerlinChroma)`：在调用前一次计算

```glsl
float C_perlin = (uHuntApplyMask & 4) != 0
  ? applyHuntChroma(uPerlinL, uLMax, uPerlinChroma, uHuntGamma)
  : uPerlinChroma;

vec3 col0 = hueToOkSrgb(uHue[0], uPerlinL, C_perlin);
// ...
```

需在 [planet.ts](frontend/src/three/planet.ts) `setFromMovie` 入场快照内复制 `uLMax` 到 perlin material（perlin 现已快照 uLMin/uLMax 等，确认是否需补）。

### Debug

[scene.ts](frontend/src/three/scene.ts) `GalaxyColorDebug` 接口扩：

```ts
huntGamma: number      // [0, 3]
huntApplyMask: number  // 0..7
```

### 验收

- 默认值（γ=1.0，mask=7）下：低分电影（vote_average=2 → 低 L）饱和度自动下降；高分电影（vote_average=9 → 高 L）保持原饱和；中性灰色（vote_average=0 → L=uLMin）几乎接近灰
- `__galaxyColor.huntApplyMask = 0` → 与 Phase 16 末态视觉等价（关闭 Hunt 比对）
- focus 态 P11.2 不再额外压饱和（默认 uFocusDimChroma=1.0）；非焦点 idle 仍由 Hunt 自身的 L 差异自然降饱和
- focus 态 Perlin 球低 vote_average 电影（如 vote_average=3）色彩明显更接近灰；高 vote_average 电影鲜艳 — 与 idle 视觉一致

---

## P17.2 P10.2 距离衰减 K 扫参回调

### 实施

- 默认值 `uDistanceFalloffK` 从 `0.0001` 改为 **`0.00005`**（初值）
- Leva（如已挂）/ `__galaxyColor.distanceFalloffK` 仍可调
- P17.4 收尾时根据视觉验收最终定值并写回 [galaxyMeshes.ts](frontend/src/three/galaxyMeshes.ts) 默认值

### 验收

- 远未来年份星群（z 距 zCurrent + zVisWindow > 50 年）L 衰减幅度小于 Phase 16 末态；视觉上"远处仍可见，但稍暗"
- 与 Hunt 联动：远处低 L → C 也降；视觉效果连贯（不会出现"远处仍鲜艳但很暗"）

---

## P17.3 Alt/Ctrl + 滚轮 dolly-to-cursor

### 数学（NDC 不变约束）

设鼠标在屏幕 CSS 坐标 `(cx, cy)`，对应 NDC `(nx, ny) ∈ [-1, 1]²`。Wheel 触发前后世界平面 z = `zCurrent` 上 cursor 命中点 `worldBefore` 与 `worldAfter`，需要满足 `worldBefore == worldAfter` → 偏移 camera.x/y。

简化：因为 fov 不变、相机轴始终沿 +Z（look-at +Z 已破例 focus 但 macro 不破例），可推导：
- `cursor 在 plane z=zCurrent 上的世界偏移 = (nx, ny) × halfWidth × (zCurrent - camera.z) / focalLength`，其中 `halfWidth = tan(fov/2) × distance × aspect`
- 简单做法：直接 unproject 两次

### camera.ts 改造

[camera.ts](frontend/src/three/camera.ts) `onWheel`：

```ts
const onWheel = (e: WheelEvent) => {
  if (options.getInputLocked?.()) return
  e.preventDefault()
  const altLike = e.altKey || e.ctrlKey  // Alt 显式 / Ctrl 含触摸板 pinch
  const dz = Math.sign(e.deltaY) * zScrollSpeed * Math.min(Math.abs(e.deltaY) / 100, 3)

  const macro = options.getMacroZWheel?.() ?? true

  if (altLike && macro) {
    // Phase 17 P17.3 — Dolly-to-cursor（focus 态 P13.3 已决 noop，所以 macro=false 时不进本分支）
    dollyToCursor(camera, e.clientX, e.clientY, dz, options.xyRange, options.xyClampPaddingRatio)
  } else if (macro) {
    // existing macro Z scroll
    const { zCurrent: prev, zCamDistance } = useGalaxyInteractionStore.getState()
    const next = THREE.MathUtils.clamp(prev + dz, zLo, zHi)
    useGalaxyInteractionStore.setState({ zCurrent: next })
    camera.position.z = next - zCamDistance
  } else {
    // legacy non-macro fallback
    camera.position.z += dz
  }
  applyFixedOrientation(camera)
}
```

### dollyToCursor helper

```ts
const _v3a = new THREE.Vector3()
const _v3b = new THREE.Vector3()
const ZCAM_DOLLY_MIN = 2
const ZCAM_DOLLY_MAX = 300
const DOLLY_SPEED_MUL = 5  // 滚轮 dz 单位映射到 zCamDistance 改动 (∝ 当前 zCamDistance 提速远场)

function unprojectToZPlane(
  ndc: { x: number; y: number },
  camera: THREE.PerspectiveCamera,
  worldZ: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  out.set(ndc.x, ndc.y, 0.5).unproject(camera)
  const dirZ = out.z - camera.position.z
  if (Math.abs(dirZ) < 1e-6) {
    out.set(camera.position.x, camera.position.y, worldZ)
    return out
  }
  const t = (worldZ - camera.position.z) / dirZ
  out.set(
    camera.position.x + (out.x - camera.position.x) * t,
    camera.position.y + (out.y - camera.position.y) * t,
    worldZ,
  )
  return out
}

function dollyToCursor(
  camera: THREE.PerspectiveCamera,
  clientX: number,
  clientY: number,
  dz: number,
  xyRange: XyRange,
  xyClampPad: number,
): void {
  const rect = camera.userData.canvas?.getBoundingClientRect?.() ?? null
  // ...或从 domElement 入参传入；细节实现时按现 ndcFromClient 同模式
  const ndc = clientToNdc(clientX, clientY, rect)
  const { zCurrent, zCamDistance: prevR } = useGalaxyInteractionStore.getState()

  const worldBefore = unprojectToZPlane(ndc, camera, zCurrent, _v3a)

  const speed = DOLLY_SPEED_MUL * Math.max(prevR / 30, 0.5)  // 远场加速、近场减速
  const nextR = THREE.MathUtils.clamp(prevR + dz * speed, ZCAM_DOLLY_MIN, ZCAM_DOLLY_MAX)
  useGalaxyInteractionStore.setState({ zCamDistance: nextR })
  camera.position.z = zCurrent - nextR
  camera.updateMatrixWorld(true)

  const worldAfter = unprojectToZPlane(ndc, camera, zCurrent, _v3b)
  camera.position.x += worldBefore.x - worldAfter.x
  camera.position.y += worldBefore.y - worldAfter.y
  clampGalaxyCameraXY(camera, xyRange, xyClampPad)
}
```

注：当用户 dolly 至边界（zCamDistance 触 MIN/MAX）后继续滚动 → noop（不动 cursor 命中点）。

### scene.ts RAF tick 影响

[scene.ts](frontend/src/three/scene.ts) tick 内当前：

```ts
if (selectionPhase === 'idle') {
  camera.position.z = st.zCurrent - st.zCamDistance
}
```

改写无需改动 — `zCamDistance` 现在变化由 store 反映，下一帧 idle tick 自动同步 camera.z。dollyToCursor 内已显式写一次 camera.z，避免一帧延迟。

### 验收

- macOS 触摸板：两指上滑（pinch out，`e.ctrlKey=true`）→ dolly 拉远；两指下滑（pinch in）→ dolly 推近；命中点（光标下）保持 NDC 不变
- Win 鼠标 + Alt：Alt + 滚轮上 → 推近；Alt + 滚轮下 → 拉远
- 默认无修饰键滚轮：仍走 Phase 5.1.5 macro Z scroll，zCurrent 推进
- focus 态：Phase 13 P13.3 决策 wheel = noop；Alt+wheel 同样 noop（在 dollyToCursor 之前 `getMacroZWheel=false` 已分支拦截）
- Timeline 在 dolly 期间不动（zCurrent 不变）
- Cursor 位置在屏幕角落（NDC 接近 ±1）时仍正确收敛（不出现严重偏移；可加更小步长容忍）

---

## P17.4 文档同步 + 回归 + 出口 fps

- [星球状态机 spec.md](docs/project_docs/星球状态机%20spec.md) §3.1 / §3.2 / §3.4.1 / §3.5.1 + 变更记录
- [视觉参数总表.md](docs/project_docs/视觉参数总表.md) §1 / §2 / §4 / §8 同步
- [Tech Spec.md](docs/project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) §1.4.1 / §1.4.3 / §1.4.4
- [Design Spec.md](docs/project_docs/TMDB%20电影宇宙%20Design%20Spec.md) §1 / §2.1
- [Phase 8 基线](docs/benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) 加 `## P17 出口` 节，重跑 P8.0.1 三片段（Hunt 主要影响 fragment / vertex 计算量，需评估 fps；dolly 对 fps 影响极小）
- 实施报告 P17.1 / P17.3 各一份；P17.2 / P17.4 合入主报告
- 扫参收口：γ / mask / K / dolly speed 默认值最终化并写回 [galaxyMeshes.ts](frontend/src/three/galaxyMeshes.ts)、[camera.ts](frontend/src/three/camera.ts) 默认值
- 回归清单：
  - 三片段视觉对比：Phase 16 末态 vs Hunt on（截图存档）
  - 远处低 vote 星 L 衰减不再"过快感"
  - Alt+wheel / pinch dolly-to-cursor 全平台（mac / win / chrome / safari）
  - focus 单态、focus 嵌套、search select 单态在 Hunt 全层应用下颜色一致
  - Phase 13/14/15/16 已落地体验无回归

---

## 风险与回滚

| 风险                                                            | 影响 | 缓解                                                                                        |
| --------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------- |
| Hunt 让低分电影几乎消色 → 用户感觉"颜色少了"                    | 中   | γ Leva 调整；保守起步 γ=0.5（更温和）；mask 单层关闭对照                                    |
| Perlin frag Hunt 改色后与 idle/active 在 focus 嵌套时连续性破裂 | 低   | mask bit 2 单独控制 Perlin Hunt；如不一致先关 Perlin Hunt（mask=3）                         |
| dolly-to-cursor NDC 在边角不稳定                                | 低   | clamp + 速度 magnitude 限制；如发现严重抖动降级为"以屏幕中心为锚点"                         |
| zCamDistance 运行时变化与 Phase 5.1.5 假设冲突影响 Timeline 等  | 中   | Timeline bridgeZ 已在 Phase 13 改为 `bridgeZ = zCurrent`，与 zCamDistance 解耦；spec 已声明 |
| Alt + wheel 与浏览器 / OS 快捷键冲突                            | 低   | `e.preventDefault()` + 仅在 canvas 区域触发；mac 系统级 Alt+wheel 无标准映射                |

## 出口准入

- 所有 P17.0–P17.4 todos `completed`
- Hunt γ / mask / K / dolly speed 默认值最终化
- Phase 8 基线 P17 出口 fps 与 P16 出口对比无显著回归（容差 ±10%；Hunt 增加 vert 一次 pow 调用，可接受）
- 三份项目 spec 与代码一致；变更记录有 Phase 17 行
- mac / win / chrome / safari dolly-to-cursor 各抽一台机器手测通过
