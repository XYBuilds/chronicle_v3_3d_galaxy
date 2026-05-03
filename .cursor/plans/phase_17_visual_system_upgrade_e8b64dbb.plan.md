---
name: phase 17 visual system upgrade
overview: Phase 17 升级整体色彩、深度与交互系统：上线 Hunt 效应（C 随 L 衰减 ~ C_base × (L/L_base)^γ）覆盖 idle / active / Perlin 三层 OKLab 色彩公式；彻底移除 idle 片元透明度控制并将 idle 材质切到 opaque + depthWrite 修复遮挡；用距离-L 公式 L(d)=Lmax*(d0/d)^(2/3) 取代旧 P10.2 透明/颜色距离衰减，Hunt 直接消费距离修正后的 L；禁用 P11.2 focus 态 idle 降 C/L 路径作为对照；滚轮双模式：**Alt 按住**时滚轮与 Timeline 脱钩，仅 dolly-to-cursor（局部放大：zCamDistance、「以光标为中心」数学同 P17.3 节）；**Alt 松开（keyup）**将 zCamDistance 复位默认、滚轮恢复 macro Z / Timeline；**不**使用 `e.ctrlKey` 触发 dolly（浏览器将 Ctrl+滚轮用作页面缩放，触摸板 pinch 常带 ctrlKey）；zCurrent 在 dolly 路径不变。
todos:
  - id: p170-spec
    content: P17.0 spec 升级（无代码）：状态机 / 视觉参数总表 / Tech Spec / Design Spec 同步 Hunt 全层 + idle opaque/depthWrite + 距离-L 替代 P10.2 + P11.2 默认禁用 + zCamDistance 运行时可调 + 滚轮双模式
    status: completed
  - id: p171-idle-depth-distance-lightness
    content: P17.1 idle 遮挡修复 + 距离-L：移除 idle alpha 控制；idleMaterial transparent=false/depthWrite=true；移除旧 P10.2 uDistanceFalloffK / uDistanceFalloffMode 参与；新增 L(d)=Lmax*(d0/d)^(2/3)，d0=观测平面参考距离（默认 zCamDistance，非数学 0）
    status: completed
  - id: p172-hunt
    content: P17.2 Hunt 效应全层接入 + P11.2 默认值禁用 + focus 邻域 hover 不透明：oklab.glsl 增 applyHuntChroma；galaxyMeshes.ts 加 uHuntGamma / uHuntApplyMask / uHoveredInstanceId + uFocusDim默认 1.0；idle 基于 P17.1 L_distance 接入，active vert + perlin.frag 接入；__galaxyColor 拓展
    status: completed
  - id: p173-dolly-zoom
    content: P17.3 仅 Alt+滚轮 dolly（不用 ctrlKey）+ Alt keyup 复位默认 zCamDistance；无 Alt 时滚轮仅 timeline/macro Z；dollyToCursor / clamp [2,300] / focus noop 同前
    status: pending
  - id: p174-doc-sync
    content: P17.4 文档同步 + 回归 + 出口 fps：三份 spec / Phase 8 基线 P17 出口 / 实施报告；扫参收口（γ / mask / d0 策略 / distance-L clamp / dolly speed 默认值）；mac/win/chrome/safari 手测 dolly；focus 邻域 hover alpha 回归
    status: pending
isProject: false
---

# Phase 17 — 视觉系统升级

> 接 Phase 13/14/15/16 体验与 HUD 抛光后的状态。本 Phase **首次**让 `zCamDistance` 成为运行时变量（之前是 Phase 5.1.5 起的常量），并把 OKLab 色彩公式从「L 来自 vote_average，C 是常量」升级为「距离修正后的 L + Hunt 效应：C 随 L 衰减」。同时把 idle 从半透明雾化层改为深度正确的 opaque 层，属于 shader、材质状态与相机契约级改动，是 Phase 13 后的二档风险。

## 范围

- 子节点：P17.0 → P17.4
- 数据契约：**不变**
- 渲染管线：idle / active vert + perlin.frag 公式扩 Hunt；idle 新增距离-L 路径并切 opaque + depthWrite；新增共享 uniform `uHuntGamma`、`uHuntApplyMask`（位标志，便于关闭单层调试）；focus 邻域 active 增加 hover alpha override（R 内非 hover 半透明、hover 不透明、R 外保持 idle）
- 相机契约：`zCamDistance` 从「常量 30」改为「**Alt 按住**时滚轮仅 dolly（与 Timeline 脱钩）；**Alt 松开（keyup）**复位默认 30；无 Alt 时滚轮恢复 macro Z / Timeline；dev tool 仍可手写」；store 已有该字段，无需扩
- 涉及文件（预计）：
  - [frontend/src/three/galaxyMeshes.ts](frontend/src/three/galaxyMeshes.ts)（新增 uniforms + 默认值；P11.2 默认值改为关闭；idleMaterial 改 `transparent=false` / `depthWrite=true`；新增 `uHoveredInstanceId`）
  - [frontend/src/three/shaders/oklab.glsl](frontend/src/three/shaders/oklab.glsl)（新增 `applyHuntChroma(L, L_ref, C_base, gamma) -> C_new` helper）
  - [frontend/src/three/shaders/galaxyIdle.vert.glsl](frontend/src/three/shaders/galaxyIdle.vert.glsl)（接入距离-L + Hunt；P11.2 dim 路径默认无效化；移除旧 P10.2 `vDistFalloff` 语义）
  - [frontend/src/three/shaders/galaxyIdle.frag.glsl](frontend/src/three/shaders/galaxyIdle.frag.glsl)（移除 idle alpha 控制，opaque 路径输出 `alpha=1.0`）
  - [frontend/src/three/shaders/galaxyActive.vert.glsl](frontend/src/three/shaders/galaxyActive.vert.glsl)（接入 Hunt；focus 邻域 hover alpha override）
  - [frontend/src/three/shaders/perlin.frag.glsl](frontend/src/three/shaders/perlin.frag.glsl)（接入 Hunt — `uPerlinChroma → C_new`）
  - [frontend/src/three/planet.ts](frontend/src/three/planet.ts)（focus 入场快照 `uHuntGamma`）
  - [frontend/src/three/camera.ts](frontend/src/three/camera.ts)（onWheel：仅 `e.altKey` 走 dolly；**不**用 `ctrlKey`；Alt keyup 复位默认 zCamDistance；安全区 clamp）
  - [frontend/src/three/scene.ts](frontend/src/three/scene.ts)（每帧同步 `uZCamDistance`；`hoveredMovieId → uHoveredInstanceId`；`__galaxyColor.huntGamma` / `__galaxyColor.huntApplyMask` / distance-L debug；`__galaxyInteraction.zCamDistance` 仍可手写）
  - [docs/project_docs/星球状态机 spec.md](docs/project_docs/星球状态机%20spec.md) §3.1 / §3.2 / §3.4.1 / §3.5
  - [docs/project_docs/视觉参数总表.md](docs/project_docs/视觉参数总表.md) §1（zCamDistance 改为运行时） / §2（Hunt uniforms）/ §4（Perlin Hunt）
  - [docs/project_docs/TMDB 电影宇宙 Tech Spec.md](docs/project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) §1.4.1 / §1.4.3
  - [docs/project_docs/TMDB 电影宇宙 Design Spec.md](docs/project_docs/TMDB%20电影宇宙%20Design%20Spec.md) §1（色彩） / §2.1（Alt 按住 dolly / 松开复位 + 滚轮 Timeline）

## 决策表（已锁定）

| #   | 决策项                      | 选定方案                                                                                                                                                                   | 备注                                                                                                                                                                                    |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Hunt 应用范围               | **全层 idle + active + Perlin**                                                                                                                                            | 三层共享 `uHuntGamma`；perlin.frag 内共享 hue + 同一 L → 同一 C_new                                                                                                                     |
| D2  | Hunt 公式形式               | `C_new = C_base × clamp(L_actual / L_ref, 0, 1)^γ`                                                                                                                         | `L_ref` = `uLMax`（满分电影 L 端点，与现状参考一致）；`C_base` = 现 `uChroma`；γ 默认 `1.0` 起步，Leva 扫参后定                                                                         |
| D3  | P11.2 idle 降 C/L 处置      | **禁用**（默认 `uFocusDimChroma=1.0` / `uFocusDimL=1.0`）                                                                                                                  | 不删 uniform；通过默认值生效。Leva 仍可调；Phase 11.2 spec 标注「Phase 17 起 Hunt 接管语义，默认值保留乘子=1」                                                                          |
| D4  | 旧 P10.2 距离衰减处置       | **移除 / 废弃** `uDistanceFalloffK` + `uDistanceFalloffMode` 对 idle/active 颜色或 alpha 的参与                                                                            | Hunt 不再与旧 P10.2 并存；远处视觉由距离-L + Hunt 承担                                                                                                                                  |
| D5  | Alt + 滚轮局部放大          | **Dolly-to-cursor**（沿用 P17.3 数学）：**仅 Alt 按住**时滚轮只改 `zCamDistance` 并偏移 camera.x/y 保持光标下 z=zCurrent 世界点不变；fov / zCurrent 不变；与 Timeline 脱钩 | **Alt 松开（keyup）**`zCamDistance` 复位默认 30。**不**用 `e.ctrlKey` 走 dolly：浏览器将 Ctrl+滚轮用作页面缩放，触摸板 pinch 亦常带 `ctrlKey`。本 phase **不**实现 pinch→dolly 替代入口 |
| D6  | dolly 安全区                | `zCamDistance ∈ [2, 300]`                                                                                                                                                  | MIN=2 避免相机进入 zCurrent 平面（`near=0.05` 还有余量）；MAX=300 避免 far culling 大量 active                                                                                          |
| D7  | dolly 影响 viswindow 视觉吗 | **不影响**：viswindow 视觉仍由 zCurrent / zVisWindow 驱动；dolly 只改物理距离与可视范围（屏幕投影 size 自然变化）                                                          | Timeline 指针位置不动                                                                                                                                                                   |
| D8  | idle 遮挡修复               | **彻底移除 idle 透明度控制**，idle 材质默认 `transparent=false` / `depthWrite=true` / `depthTest=true`                                                                     | 修复 idle 层同类透明排序遮挡问题；片元输出 `alpha=1.0`，不再依赖 `vInFocus` 或距离调 alpha                                                                                              |
| D9  | 距离-L 公式                 | `L_distance = L_star × clamp(pow(d0 / max(d, eps), 2.0/3.0), L_floor, 1.0)`                                                                                                | `L_star` 为 vote/Hunt 前该星应有 L；`d0` **不是数学 0**，定义为观测平面参考距离，默认运行时 `zCamDistance`                                                                              |
| D10 | 距离 d 定义                 | 初版采用 **Z 轴相机距离** `d = abs(aZ - cameraZ)`，不是完整欧氏距离                                                                                                        | 避免同一 z 平面屏幕边缘因 XY 距离变暗；若后续想要真实空间衰减再另开视觉评估                                                                                                             |
| D11 | focus 邻域 hover 透明度     | **并入 P17.2 轻量实现**：focus 态 R 内邻域仍走 active mask；非 hover 默认半透明，hover 命中实例 alpha=1；R 外仍保持 idle 态                                                | 复用 `focusNeighborIds` / `uSelectionMode=2` / `hoveredMovieId`，只新增 hovered instance uniform，不生成多 Perlin                                                                       |

## 执行顺序

```mermaid
flowchart TD
    P170["P17.0 spec 升级（无代码）"]
    P171["P17.1 idle 遮挡修复 + 距离-L"]
    P172["P17.2 Hunt 效应全层接入 + P11.2 默认值禁用"]
    P173["P17.3 Alt + 滚轮 dolly；Alt 松开复位"]
    P174["P17.4 文档同步 + 回归 + 出口 fps"]

    P170 --> P171
    P171 --> P172
    P170 --> P173
    P171 --> P174
    P172 --> P174
    P173 --> P174
```

依赖说明：
- **P17.0** 先行：把 D1–D10 写入三份 spec
- **P17.1** 先落 idle opaque + 距离-L，稳定最终 `L_distance`
- **P17.2** 再接 Hunt，让 idle 消费 P17.1 的 `L_distance`；P17.3 可与 P17.1/P17.2 并行，但最终需回归 `zCamDistance` 与距离-L 同步
- **P17.4** 收尾：扫参定 γ / mask / d0 策略 / distance-L clamp / dolly 速度默认值

---

## P17.0 spec 升级（无代码）

### 状态机 spec §3.1 / §3.2 / §3.4.1 / §3.5

- §3.1 idle 色彩条目：从「`uChroma` 标量 + 透明/距离 alpha」改为「vote 得到 `L_star` → 距离-L 得到 `L_distance` → Hunt 衰减 `C_new = C_base × (L_distance/L_max)^γ`」；idle 材质为 opaque + depthWrite
- §3.2 active 色彩条目：同步加 Hunt 说明
- §3.4.1 focus 视觉降级：保留 P11.2 uniform 接口，**默认值改为 chroma=1.0 / L=1.0**（不压制），把"非焦点降饱和"语义交给 Hunt（Phase 17 起 idle 内 L 已经压低 → C 也跟着压低）
- §3.5.1 Perlin 片元：在 `hueToOkSrgb(uHue[i], uPerlinL, uPerlinChroma)` 之前先计算 `C_new = uPerlinChroma × (uPerlinL/uLMax)^γ`，再传入；**仅当 `uHuntApplyMask` 第 2 位置位时**生效（与 idle/active 第 0/1 位独立）
- 变更记录：Phase 17 行

### 视觉参数总表 §1 / §2 / §4

- §1：把「`zCamDistance = 30`（常量）」改为「**`zCamDistance` 默认 30 / 运行时可调**（仅 Alt 按住 + wheel dolly；Alt keyup 复位默认；**不**用 Ctrl 修饰）；安全区 `[2, 300]`」；新增「Wheel 双模式」节
- §2：双 mesh 共享 uniform 列表加 **`uHuntGamma`（默认 1.0）/`uHuntApplyMask`（默认 `0b111` = 7）/ `uZCamDistance` / distance-L 参数**；P11.2 默认值改为 1.0 / 1.0；标注旧 P10.2 `uDistanceFalloffK` / `uDistanceFalloffMode` 在 Phase 17 废弃
- §4：Perlin 表加 Hunt 行（与 §3.5.1 一致）
- §8 Dev 调试桥：`__galaxyColor.huntGamma` / `__galaxyColor.huntApplyMask` / distance-L clamp 参数；`__galaxyInteraction.zCamDistance` 已存在；新增 `__galaxyInteraction.dollyZoomSpeed`

### Tech Spec §1.4.1 / §1.4.3

- §1.4.1 表格 `zCamDistance` 行：注释改为「**Phase 17 起**：默认 30；Alt 按住 + wheel 写入 dolly；**Alt keyup** 复位默认；安全区 [2, 300]」
- §1.4.3 滚轮控制：扩为「**双模式**」：
  - **默认（未按住 Alt）**：维持 Phase 5.1.5 macro Z scroll（Timeline）；此时 `zCamDistance` 为默认（Alt 松开后已复位）
  - **Alt 按住**：滚轮与 Timeline 脱钩，仅 dolly-to-cursor（局部放大：改 `zCamDistance`，偏移 camera.x/y 保持光标下命中点不变）；zCurrent 与 fov 不变
  - **Alt 松开**：`zCamDistance →` 默认；滚轮恢复上条 macro 行为
  - **Ctrl+滚轮**：不进入 dolly、不推进 macro Z；`onWheel` 若检测到 `e.ctrlKey` 则 **直接 return 且不 `preventDefault()`**，交给浏览器页面缩放（常见 Ctrl+滚轮）
  - 在 focus 态：现状 `getMacroZWheel === false`（特写推拉）保留；Phase 13 P13.3 已决策 focus 态 wheel = noop 不动，因此 Alt+wheel 在 focus 态也 noop（保护 Perlin 球距离恒定）
- §1.4.4 clamp：补 `zCamDistance ∈ [2, 300]`

### Design Spec §1 / §2.1

- §1「内核亮度」段：补一句距离-L + Hunt 说明（"项目内 OKLab L 先随观察距离下降，再由 Hunt 让 C 随 L 同步衰减，模拟远处低光照下的感知变暗与降饱和"）；同时注明 idle 不再使用透明度表达远近
- §2.1 摄像机控制：滚轮节扩为「Alt 按住 = 局部 dolly / 脱钩 Timeline；Alt 松开 = 默认机位距离 + 滚轮回 Timeline」（同 Tech Spec §1.4.3）

---

## P17.1 idle 遮挡修复 + 距离-L

### 目标

用 **opaque + depthWrite** 修复 idle 层半透明排序导致的遮挡错乱；同时把旧 P10.2 的"远处变暗 / 透明"语义改为 **OKLab L 的距离修正**。P17.1 只产出稳定的 `L_distance`，P17.2 再让 Hunt 消费该 L 并同步降低 C。

### 可行性评估

结论：**可行，但必须把 d0 定义为参考距离而不是数学 0，并接受 idle 雾状半透明叠层被下线。**

- `transparent=false` / `depthWrite=true` 可直接让 idle 进入不透明深度路径，修复 idle 与 idle 之间"远处盖近处"的同类透明排序问题。
- idle 片元 alpha 需要彻底退出设计语义：`galaxyIdle.frag.glsl` 输出 `vec4(vColor, 1.0)`；`vInFocus` 不再参与 alpha。
- 旧 `vDistFalloff` / `uDistanceFalloffK` / `uDistanceFalloffMode` 不再用于 idle 片元颜色或 alpha；如保留 uniform，只能标 deprecated，不应继续参与视觉。
- 公式 `L(d)=L_star*(d0/d)^(2/3)` 中，`d0` **不能为 0**。若 `d0=0`，所有 `d>0` 的星都会得到 `L=0`。本计划把用户口径"0距离观测星星"解释为"观测平面参考星"，即 `d0 = zCamDistance`。
- 为避免近处星 `d < d0` 被放大到超过自身应有 L，必须 clamp：`distanceLightnessMul = clamp(pow(d0 / max(d, eps), 2.0/3.0), L_floor, 1.0)`。

### 数学与 d 定义

初版采用 **Z 轴相机距离**，不采用完整欧氏距离：

```glsl
float d0 = max(uZCamDistance, 1e-3);
float d = max(abs(aZ - (uZCurrent - uZCamDistance)), 1e-3);
float distanceMul = clamp(pow(d0 / d, 2.0 / 3.0), uDistanceLightnessFloor, 1.0);
float L_distance = L_star * distanceMul;
```

原因：
- `d0 = zCamDistance` 时，位于当前观测平面 `aZ == uZCurrent` 的星有 `d == d0`，因此 `L_distance == L_star`。
- 用 Z 轴距离可以避免同一 z 平面中屏幕边缘星因为 XY 远离相机而变暗，减少"暗角 / vignette"感。
- dolly-to-cursor 改变 `zCamDistance` 时，参考距离同步变化；当前观测平面保持原 L，远离观测平面的星按相对距离变暗。

### galaxyMeshes.ts

- `idleMaterial` 改为：

```ts
transparent: false,
depthWrite: true,
depthTest: true,
blending: THREE.NormalBlending,
```

- 新增 / 保留参数：

```ts
uZCamDistance: { value: 30 },
uDistanceLightnessFloor: { value: 0.08 },
```

- 废弃：

```ts
uDistanceFalloffK
uDistanceFalloffMode
```

若 active / 旧 debug 仍引用这些 uniform，P17.1 内同步清理，避免"旧距离衰减 + 新距离-L + Hunt"三者叠加。

### galaxyIdle.vert.glsl

现有：
1. `voteNorm` → `L_base`
2. 旧 P10.2 计算 `vDistFalloff`
3. P11.2 focus dim 可能压 L/C
4. 片元再用 `vDistFalloff` / alpha 混合做远处衰减

改为：
1. `voteNorm` → `L_star`
2. `distanceMul = clamp(pow(d0 / d, 2.0/3.0), L_floor, 1.0)`
3. `L_distance = L_star * distanceMul`
4. P11.2 乘子保留但默认 1.0，等于无操作
5. `C = uChroma` 暂不接 Hunt；P17.2 再替换为 `applyHuntChroma(L_distance, ...)`
6. OKLab → sRGB 输出 `vColor`

### galaxyIdle.frag.glsl

改为纯 opaque 片元：

```glsl
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
```

`vInFocus` 仍可在 vert 内用于 `sIdle = (1.0 - inFocus) * ...` 控制几何大小 / 是否画 idle，但不再传入片元控制 alpha。

### scene.ts uniform 同步

在 RAF tick 内与 `uZCurrent` 同步的位置补：

```ts
uZCamDistance.value = st.zCamDistance
```

确保 dolly-to-cursor 改变 `zCamDistance` 后，距离-L 的 `d0` 与相机实际距离同帧一致。

### 可能损失的视觉效果

| 原效果                         | Phase 17 处置 | 损失 / 变化                                                     |
| ------------------------------ | ------------- | --------------------------------------------------------------- |
| idle 半透明星尘叠层            | 下线          | 背景会更"实"，少一些雾状空气感                                  |
| `vInFocus` 控 alpha 的窗缘软边 | 下线          | 窗缘过渡更多依赖 idle/active 的尺寸互补；可能变硬               |
| 多颗 idle 半透明混色           | 下线          | 改为深度正确遮挡，颜色不再靠 alpha 叠亮                         |
| 旧 P10.2 距离暗化              | 被距离-L 取代 | P17.1 先只变暗；P17.2 Hunt 再同步降饱和，视觉更统一但更"物理化" |

### 验收

- idle 默认态观察密集区域：近处 idle 正确遮挡远处 idle，不再出现明显"远盖近"。
- idle 层在透明度 debug / 截图中不再依赖 alpha：片元输出 alpha 恒为 1，材质为 opaque + depthWrite。
- 当前观测平面 `aZ≈zCurrent` 的星亮度与 Phase 16 同 vote L 基线接近；远离观测平面的星按 `2/3` 幂次柔和变暗。
- P17.1 单独验收时：远处星只按 L 变暗，C 暂不随 L 变；P17.2 再验收 Hunt 后的降饱和。
- 搜索 select / focus：active 层 P16.3 双路径不回退；idle 不写透明不会破坏 active 高亮的可读性。
- 搜索 select / focus 额外检查：前景 idle 写入 depth 后，后景 active 会被真实遮挡；若选中集合可读性显著下降，优先评估 selection/focus 态 idle 尺寸或亮度压低，而不是恢复 idle alpha。
- 若窗缘过硬，优先调 `uBgSizeMul` / `uDistanceLightnessFloor` / `uHuntGamma`，不恢复 idle alpha。

---

## P17.2 Hunt 效应全层接入 + P11.2 默认值禁用

### oklab.glsl 增 helper

[frontend/src/three/shaders/oklab.glsl](frontend/src/three/shaders/oklab.glsl) 增：

```glsl
/**
 * Hunt-style chroma scaling: C drops with L to mimic perceptual desaturation
 * under low lightness. Returns C_new in same units as C_base.
 *
 * - L_actual: current sample lightness (e.g. P17.1 L_distance for idle)
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
/** Focus-neighborhood hover alpha override. -1 = no hovered active instance. */
uHoveredInstanceId: { value: -1 },
```

P11.2 默认值同步改：

```ts
uFocusDimChroma: { value: 1.0 }, // was 0.7 — disabled, Hunt 接管降饱和语义
uFocusDimL: { value: 1.0 },      // unchanged 1.0 (was already 1)
```

### Idle vert 接入

[galaxyIdle.vert.glsl](frontend/src/three/shaders/galaxyIdle.vert.glsl) 基于 P17.1 新路径：
1. `voteNorm` → `L_star`
2. P17.1 距离-L → `L_distance`
3. `C_base_after_hunt = (uHuntApplyMask & 1) != 0 ? applyHuntChroma(L_distance, uLMax, uChroma, uHuntGamma) : uChroma`
4. P11.2 乘子继续作用于 `C_base_after_hunt`（保留接口，默认值 1.0 等于无操作）
5. `a = C*cos(hue)`，`b = C*sin(hue)`，OKLab→sRGB

注：使用 GLSL 位运算需确认 WebGL2 GLSL ES 3.00 支持 `&`（支持，对 int 操作）；`uHuntApplyMask` 类型定义为 `int`。

### Active vert 接入

[galaxyActive.vert.glsl](frontend/src/three/shaders/galaxyActive.vert.glsl)：active 的 focus / search select 亮度语义保持由 vote L + Hunt 决定，避免搜索高亮层因相机距离变化而忽明忽暗：

```glsl
float C_base_after_hunt = (uHuntApplyMask & 2) != 0 ? applyHuntChroma(L_base, uLMax, uChroma, uHuntGamma) : uChroma;
```

同时并入 **focus 邻域 hover 不透明** 规则（轻量子项，复用 Phase 13 邻域 mask）：

- `uSelectionMode == 2` 时，R 范围内实例已由 `focusNeighborIds → uSelectionMask` 切为 active；R 外实例保持 idle，不额外进入 active。
- `uFocusCameraBlend > 0` 时，非目标 active 仍按 `uFocusNonTargetActiveAlpha` 半透明。
- `gl_InstanceID == uHoveredInstanceId` 时，hover 命中实例 `vFocusAlphaMult = 1.0`，覆盖非目标半透明；hover 离开后 `uHoveredInstanceId = -1`，恢复半透明。
- focus 主目标实例仍由 `uFocusedInstanceId` 在双 mesh 上归零，Perlin 球独占；本规则不生成多 Perlin，不改变 `selectedMovieId`。

示意：

```glsl
bool isHovered = (uHoveredInstanceId >= 0) && (gl_InstanceID == uHoveredInstanceId);
bool hoverAlphaOverride = (uSelectionMode == 2) && isHovered;
vFocusAlphaMult = (isFocusTarget || hoverAlphaOverride) ? 1.0 : dimAlpha;
```

### scene.ts hover uniform 同步

[scene.ts](frontend/src/three/scene.ts) 复用现有 `movieIdToIndex`，每帧或订阅同步：

```ts
const hoveredId = st.hoveredMovieId
uHoveredInstanceId.value = hoveredId === null ? -1 : movieIdToIndex.get(hoveredId) ?? -1
```

约束：
- 只同步 instance index，不上传 texture、不重算 R。
- 若 hover 命中的是 focus Perlin 球，id 等于 `selectedMovieId`；双 mesh 目标实例仍归零，因此 alpha override 不产生额外可见 active 球。
- 若当前不是 focus 邻域模式（`uSelectionMode != 2`），shader 侧不应用 hover alpha override，避免 search select 态语义被误改。

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
distanceLightnessFloor: number // [0, 1], P17.1 clamp floor
```

### 验收

- 默认值（γ=1.0，mask=7）下：低分电影（vote_average=2 → 低 L）饱和度自动下降；高分电影（vote_average=9 → 高 L）保持原饱和；中性灰色（vote_average=0 → L=uLMin）几乎接近灰
- `__galaxyColor.huntApplyMask = 0` → 仅关闭 Hunt 做 A/B；P17.1 后仍保留 idle opaque + 距离-L，因此不再与 Phase 16 末态完全等价
- focus 态 P11.2 不再额外压饱和（默认 uFocusDimChroma=1.0）；非焦点 idle 由 P17.1 距离-L + Hunt 自然降饱和
- focus 态 Perlin 球低 vote_average 电影（如 vote_average=3）色彩明显更接近灰；高 vote_average 电影鲜艳 — 与 idle 视觉一致
- focus 视角 R 范围内邻域星全部走 active/focus-neighborhood 态：非 hover 半透明；hover 命中实例不透明；R 外星体保持 idle 视觉，不被 hover alpha override 提升为 active
- hover 离开 canvas / 移到空白处后，上一颗邻域星恢复半透明，无残留不透明实例

---

## P17.3 Alt + 滚轮局部放大（dolly-to-cursor）与 Timeline 脱钩

### 交互契约

- **Alt 按住**：滚轮与 **Timeline / macro Z（zCurrent）** 脱钩；滚轮仅驱动 **局部放大** — 即本节 **dolly-to-cursor**（改 `zCamDistance` + 保持光标下 `z=zCurrent` 世界点不变），数学与 clamp、`dollyToCursor` 实现细节**全部沿用**下文。
- **Alt 松开（`keyup`，`key === 'Alt'`）**：将 `zCamDistance` **复位为默认值**（如 `30`，与 Phase 5.1.5 常量一致）；相机 `position.z` 与 store 同步，避免一帧错位。之后 **滚轮恢复** Phase 5.1.5 **macro Z / Timeline** 行为（无修饰键分支）。
- **Ctrl+滚轮 / 常带 `ctrlKey` 的触摸板 pinch**：**不**作为 dolly 入口（浏览器将 Ctrl+滚轮用作**页面缩放**；pinch 与 `ctrlKey` 强相关）。本 phase **仅** `Alt+滚轮` 做局部放大；不提供 pinch→dolly 替代。

### 数学（NDC 不变约束）

设鼠标在屏幕 CSS 坐标 `(cx, cy)`，对应 NDC `(nx, ny) ∈ [-1, 1]²`。Wheel 触发前后世界平面 z = `zCurrent` 上 cursor 命中点 `worldBefore` 与 `worldAfter`，需要满足 `worldBefore == worldAfter` → 偏移 camera.x/y。

简化：因为 fov 不变、相机轴始终沿 +Z（look-at +Z 已破例 focus 但 macro 不破例），可推导：
- `cursor 在 plane z=zCurrent 上的世界偏移 = (nx, ny) × halfWidth × (zCurrent - camera.z) / focalLength`，其中 `halfWidth = tan(fov/2) × distance × aspect`
- 简单做法：直接 unproject 两次

### camera.ts 改造

[camera.ts](frontend/src/three/camera.ts) 注册 **`keyup`**（仅一次）：当 `e.key === 'Alt'`（及 `Dead`/浏览器变体若需）且 `!e.altKey` 时，将 store 的 `zCamDistance` 设为默认（如 `30`），并按当前 `zCurrent` 写回 `camera.position.z = zCurrent - zCamDistance`，再 `applyFixedOrientation`。**注意**：从别的窗口切回时若 Alt 已松开，依赖首次 wheel 前状态一致即可；可选在 `blur` 时同样复位以免 Alt 卡死。

`onWheel`：

```ts
const onWheel = (e: WheelEvent) => {
  if (options.getInputLocked?.()) return
  if (e.ctrlKey) return // 交给浏览器页面缩放，不 preventDefault、不做 dolly / macro Z
  e.preventDefault()
  const dz = Math.sign(e.deltaY) * zScrollSpeed * Math.min(Math.abs(e.deltaY) / 100, 3)

  const macro = options.getMacroZWheel?.() ?? true

  if (e.altKey && macro) {
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

- **Alt 按住 + 滚轮**：仅 dolly，**zCurrent / Timeline 不动**；光标下命中世界点稳定
- **Alt 松开**：`zCamDistance` 回到默认（如 30）；随后无修饰键滚轮仅推进 **macro Z / Timeline**
- **Ctrl+滚轮**：页面缩放由浏览器处理，canvas **不**拦截、**不**改 zCurrent / zCamDistance
- Win / mac：**Alt + 滚轮** → 推近/拉远；松 Alt 后再滚轮 → 仅 zCurrent（触摸板 pinch **不**在本 phase 映射为 dolly）
- focus 态：Phase 13 P13.3 决策 wheel = noop；Alt+wheel 同样 noop（`getMacroZWheel=false` 已分支拦截）
- Cursor 在屏幕角落（NDC 接近 ±1）时仍合理收敛（可加步长容忍）

---

## P17.4 文档同步 + 回归 + 出口 fps

- [星球状态机 spec.md](docs/project_docs/星球状态机%20spec.md) §3.1 / §3.2 / §3.4.1 / §3.5.1 + 变更记录
- [星球状态机 spec.md](docs/project_docs/星球状态机%20spec.md) §3.3 / §3.4.3 / §3.4.5 补 focus 邻域 hover alpha：R 内 active 非 hover 半透明、hover 不透明；R 外 idle；不生成多 Perlin
- [视觉参数总表.md](docs/project_docs/视觉参数总表.md) §1 / §2 / §4 / §8 同步；§2 增 `uHoveredInstanceId`（`-1` 默认，focus-neighborhood alpha override）
- [Tech Spec.md](docs/project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) §1.4.1 / §1.4.3 / §1.4.4
- [Design Spec.md](docs/project_docs/TMDB%20电影宇宙%20Design%20Spec.md) §1 / §2.1
- [Phase 8 基线](docs/benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) 加 `## P17 出口` 节，重跑 P8.0.1 三片段（Hunt + distance-L 主要影响 vertex 计算量；idle opaque 可能改善透明排序成本但增加深度写入，需实测 fps；dolly 对 fps 影响极小）
- 实施报告 P17.1 / P17.2 / P17.3 各一份；P17.4 合入主报告
- 扫参收口：γ / mask / d0 策略 / distance-L floor / dolly speed 默认值最终化并写回 [galaxyMeshes.ts](frontend/src/three/galaxyMeshes.ts)、[camera.ts](frontend/src/three/camera.ts) 默认值
- 回归清单：
  - 三片段视觉对比：Phase 16 末态 vs Hunt on（截图存档）
  - idle opaque 后遮挡关系正确；密集区域不再明显"远盖近"
  - 远处星由距离-L 变暗，且观测平面星不被整体压暗
  - Alt+wheel dolly、Alt keyup 复位默认距离、无 Alt 滚轮 Timeline；Ctrl+滚轮不劫持（浏览器缩放）；mac / win / chrome / safari 手测
  - focus 单态、focus 嵌套、search select 单态在 Hunt 全层应用下颜色一致
  - focus 视角 R 范围内邻域星：非 hover 时半透明，hover 命中时不透明；R 外星体仍保持 idle 态，不被提升为 active
  - focus 主 Perlin 球 hover 不应在双 mesh 上额外显出 active 目标球；hover 离开 / 空白 hover 后 `uHoveredInstanceId=-1`，无残留不透明邻域星
  - person/genre search select 单态不受 `uHoveredInstanceId` 影响，不引入 hover 单点 alpha 规则
  - Phase 13/14/15/16 已落地体验无回归

---

## 风险与回滚

| 风险                                                            | 影响 | 缓解                                                                                         |
| --------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| Hunt 让低分电影几乎消色 → 用户感觉"颜色少了"                    | 中   | γ Leva 调整；保守起步 γ=0.5（更温和）；mask 单层关闭对照                                     |
| Perlin frag Hunt 改色后与 idle/active 在 focus 嵌套时连续性破裂 | 低   | mask bit 2 单独控制 Perlin Hunt；如不一致先关 Perlin Hunt（mask=3）                          |
| `d0` 被误实现为数学 0                                           | 高   | 代码 assert / console.log：`d0 > 0`；以 `zCamDistance` 作为参考距离                          |
| idle opaque 失去半透明雾感、窗缘变硬                            | 中   | 明确作为 P17 新视觉；用距离-L floor、Hunt γ、`uBgSizeMul` 扫参，不恢复 idle alpha            |
| 使用欧氏距离导致屏幕边缘同 z 星变暗                             | 中   | 初版使用 Z 轴相机距离；欧氏距离只作为未来视觉实验                                            |
| idle 写 depth 后前景 idle 遮住后景 active，搜索/聚焦可读性下降  | 中   | P17.1 验收覆盖 search select / focus；必要时压低 selection/focus 态 idle 尺寸或 L            |
| focus hover 不透明残留                                          | 中   | `hoveredMovieId=null` 时同步 `uHoveredInstanceId=-1`；pointerleave / 空白 hover 手测覆盖     |
| hover override 误影响 search select                             | 低   | shader 侧限制 `uSelectionMode == 2` 才应用；person/genre select 单态回归                     |
| dolly-to-cursor NDC 在边角不稳定                                | 低   | clamp + 速度 magnitude 限制；如发现严重抖动降级为"以屏幕中心为锚点"                          |
| zCamDistance 运行时变化与 Phase 5.1.5 假设冲突影响 Timeline 等  | 中   | Timeline bridgeZ 已在 Phase 13 改为 `bridgeZ = zCurrent`，与 zCamDistance 解耦；spec 已声明  |
| Alt + wheel 与浏览器 / OS 快捷键冲突                            | 低   | `e.preventDefault()` + 仅在 canvas 区域触发；**Ctrl+滚轮不处理**，避免与浏览器页面缩放抢事件 |

## 出口准入

- 所有 P17.0–P17.4 todos `completed`
- Hunt γ / mask / distance-L floor / d0 策略 / dolly speed 默认值最终化
- focus 邻域 hover alpha 语义与代码一致：`uHoveredInstanceId` 只在 `uSelectionMode == 2` 下覆盖 active alpha
- Phase 8 基线 P17 出口 fps 与 P16 出口对比无显著回归（容差 ±10%；Hunt 增加 vert 一次 pow 调用，可接受）
- 三份项目 spec 与代码一致；变更记录有 Phase 17 行
- mac / win / chrome / safari dolly-to-cursor 各抽一台机器手测通过
