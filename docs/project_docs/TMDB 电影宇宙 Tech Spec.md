# **TMDB 电影宇宙 \- 技术实现方案 (Tech Spec)**

## **1\. 系统架构与技术栈**

项目采用严格的前后端计算分离架构：

* **后端/数据处理层 (Python)**：负责数据清洗、NLP 向量化及降维计算（UMAP），输出静态 JSON/Parquet 数据。  
* **前端/渲染层**：  
  * **3D 画布**：原生 **Three.js**（非 R3F / TresJS 等声明式封装），直接控制渲染循环、`InstancedMesh` + 自定义 ShaderMaterial、后处理与**非标准**轴平行相机。理由：~60K 实例双 mesh + focus 高模球体、性能敏感，原生 Three.js 可避免中间层抽象泄漏。  
  * **HUD / UI 层**：**React**（DOM 覆盖层），负责 Tooltip、档案详情抽屉、Loading 页面等。  
  * **状态桥接**：React ↔ Three.js 通过**轻量状态管理**（如 Zustand）通信——Three.js 写入选中/悬停状态，React 读取并渲染 UI；React 写入搜索/导航指令，Three.js 执行相机动画。  
* **数据加载策略**：前端启动时**一次性加载**全量坐标与属性数据（静态 JSON 或等价格式），经 **四阶段 Loading**（含搜索索引 hydrate，见 **§1.4.7**）后进入 **Cover**；用户点击 **Start** 后再初始化 3D 场景（**WebGL** 与双 `InstancedMesh` 挂载）。

### **1.1 前端渲染架构（Phase 8：双 `InstancedMesh` + focus Perlin 球）**

**生产路径**已自 Phase 7 的**单 `THREE.Points` 宏观层**切换为**两份全量 `InstancedMesh`**（idle + active）+ **按需 focus Perlin 球**；`point.{vert,frag}.glsl` 仅保留供基准 / Vitest 等，**不**再挂载主场景。

* **WebGL2 硬前置**：`WebGLRenderer` 创建后若 `!renderer.capabilities.isWebGL2` 则**抛错**并提示升级浏览器；宏观与 focus 使用 **`gl_InstanceID`** 与 per-instance 属性，**不**维护 WebGL1 或手动 `aInstanceId` 回退（与 Phase 7.2 浏览器红线一致）。  
* **宏观双 mesh（各 ~60K instance，共享 `instanceMatrix` 与 hue / voteNorm / aSize）**（`frontend/src/three/galaxyMeshes.ts`）：  
  * **idle**：`IcosahedronGeometry(1, 0)`；`ShaderMaterial` **`transparent: true`**、**`depthWrite: false`**、`depthTest: true`；`renderOrder = 0`。  
  * **active**：`IcosahedronGeometry(1, 1)`；`ShaderMaterial` **`alphaTest: 0.01`**、`depthTest: true`；`renderOrder = 1`。**构造初值**（`galaxyMeshes.ts`）：**`transparent: true`**、**`depthWrite: false`**。**Phase 16 + Phase 19**：运行时由 **`scene.ts` RAF** 在 **`selectionPhase`（**闭包**，非 Zustand）× `selectedMovieId`（store）** 下切换 **双路径**——详见《星球状态机 spec》**§3.2.1** 与下表；切换时仅在 **`transparent` / `depthWrite`** 变化处设 **`material.needsUpdate = true`**。  
  * **active · Phase 11.1（路径 B 语义）**：非目标 active 片元 **`alpha`** 随 **`uFocusCameraBlend`**（与 **`transitionDriver`** / `focusDriver.progress` 同步）从 **1** 过渡到 **`uFocusNonTargetActiveAlpha`**（默认 **0.08**，**Phase 13.6** 由 **0.10** 下调以适配邻域球变密）；目标实例在飞入/飞出全程由 **`uFocusTargetInstanceId`** 识别并保持 **alpha = 1**（详见《星球状态机 spec》§3.4.3 与《视觉参数总表》§2）。**路径 A（宏观 opaque）** 下片元 **alpha 恒为 1**，与状态机 **§3.2.1** 一致。**Phase 11.2**：**不**在 active 上改 L/chroma；非焦点 **idle** 在 focus 时对 **`L_base` / `C_base` 乘** `uFocusDimL` / `uFocusDimChroma`（定稿 **1** / **0.7**），见《星球状态机 spec》§3.4.1。  
  * **Z 条带与过渡**：与 [`星球状态机 spec.md`](星球状态机%20spec.md) 一致——`W = uZVisWindow × 0.2`，`inFocus = smoothstep(zLo−W, zLo, aZ) × (1 − smoothstep(zHi, zHi+W, aZ))`；**idle** 侧尺度 `sIdle = (1 − inFocus) × uSizeScale × uBgSizeMul × aSize`，**active** 侧 `sActive = inFocus × uSizeScale × uActiveSizeMul × aSize`；二者互补（初值 `uSizeScale=0.3`，`uActiveSizeMul=0.02`，`uBgSizeMul=0.002`，见《视觉参数总表》）。  
  * 色彩：§4.3 **`genre_hue`（弧度）** + OKLab **`uLMin` / `uLMax` / `uChroma`**；**Lightness** 由 **`voteNorm`** 经 **Phase 10.1** 分段压缩与 `pow` 映射到 **L**（见《视觉参数总表》§2，非线性等价于「评分驱动明暗」）。  

**Phase 19 · `galaxyActive` 渲染路径规则**（取代 Phase 16 按 **`searchMode`** 细分矩阵；与《星球状态机 spec》**§3.2.1** 同构；由 **`scene.ts` RAF** 驱动 **`transparent` / `depthWrite`**，**`needsUpdate`** 仅在组合变化时置位）：

- **`selectionPhase`**：`scene.ts` **`mountGalaxyScene`** 内 **`applySelectionFrame` / focus 驱动`** 维护的闭包变量（**非** Zustand store 字段）。
- **路径 A（opaque）**：**`selectionPhase === 'idle'`** 且 **`selectedMovieId === null`** —— 宏观浏览、电影名联想未点片、person/genre select 未 focus、Space dolly 等均在此列。
- **路径 B（transparent）**：**否则** —— **`selecting` / `selected` / `deselecting`** 任一则需 **P11.1**；或 **`selectedMovieId !== null`**（单片 focus / 嵌套会话）。

| 条件（AND） | 路径 | 备注 |
| :---- | :---- | :---- |
| **`selectionPhase === 'idle'`** ∧ **`selectedMovieId === null`** | **A**（opaque + `depthWrite`） | 常态宏观 active |
| **否则** | **B**（transparent） | focus 管线 **P11.1** |

* **Focus 态 Perlin 球（按需、单实例）**：`IcosahedronGeometry(1, 8)` + **CPU** 上按顶点 noise **分位数阈值**划分至多 **8** 档 genre 带（`perlin.frag.glsl` 中 **`step`** 分 **`bandIdx`**；顶点 **`perlin.vert.glsl`** 用 **`smoothstep`** 累加 **`level`** 做阶梯挤出，见《星球状态机 spec》§3.5）。**Phase 11.4**：片元用 **`dFdx`/`dFdy`** 重构法线与 Lambert 明暗；**`uPerlinL`** 由 **`vote_average`** 经与宏观一致的 **P10.1** 公式写入；**`uPerlinChroma`** 与星系 **`uChroma`** 快照一致；**hue** 为主 genre **`movie.genre_hue`**（若存在）+ 其余 genre **`genreHueForGenreName`**（palette key 序对齐 Python **`sorted`**）；线性 RGB **clamp** 后编码 **sRGB**；光照定稿见《视觉参数总表》§4。**Phase 11.5**：材质已切换为 **opaque**（`transparent: false`、`depthWrite: true`、`alphaTest: 0.01`），降低台阶边缘透明伪影。`movie.id` 种子化 PRNG；面积比例由 **`uAreaRatio`** 等控制。当 `uFocusedInstanceId` 命中时，**idle + active** 上该 `gl_InstanceID` 的 scale 在 shader 中**置零**，仅由 Perlin 球呈现。  
* **后处理顺序（生产）**：同帧先画 idle → active → focus 时 Perlin 球 `visible=true`（`renderOrder` 以 `scene.ts` 为准）。**`UnrealBloomPass`** 默认**不**参与输出（§1.2）；调试启用时再走 composer。

**历史注记（Phase 5.1.6 · 已退役）**：旧版在**单 `THREE.Points`** 上用 `uBgSizeMul` / `uFocusSizeMul` 与 `gl_PointSize` 做 A/B 层；P8.4 起由双 mesh 的 `inFocus` 与双尺度取代。

### **1.2 后处理管线（Bloom：生产默认关闭，可选调试）**

**生产路径（Phase 10.3 定稿）**：主 RAF **不**将 `UnrealBloomPass` 加入 `EffectComposer`，直接 **`renderer.render(scene, camera)`** 输出（见 `scene.ts` `postFxBloomEnabled` 与 `tick`）。实例 **`new UnrealBloomPass(..., 0.95, 0.52, 0.82)`** 仍存在，供本地 / Storybook 通过 **`window.__bloom.enable()`** 挂载后再 **`composer.render()`**。产品决策与曾尝试路线见 **[`Phase 10.3 P10.3 Bloom 决策与收尾报告.md`](../reports/Phase%2010.3%20P10.3%20Bloom%20决策与收尾报告.md)**。

**启用 Bloom 时的逻辑管线（调试）**：

```
Render Scene (galaxyIdle + galaxyActive + 可选 focus Perlin mesh)
    ↓
UnrealBloomPass（简单路线）
    ↓
(可选) FXAA / SMAA 抗锯齿
    ↓
Output
```

* **Bloom 方案**：Three.js 内置 **`UnrealBloomPass`**（`EffectComposer`）。  
* **选择性泛光策略**（仅在 pass 启用时适用）：**简单路线**——不对 Layers 做分离渲染。Mesh 片元亮度由 OKLab **L**（含 P10.1 映射）等驱动；高分 fragment 可高于 Bloom `threshold`；`threshold` 筛高亮。  
* **实例初值（可调；与 constructor 一致）**：`strength` **0.95**、`radius` **0.52**、`threshold` **0.82**（亦落在下列经验区间内）。  
* **经验区间（迭代参考）**：`strength` **0.8 – 1.2**；`radius` **0.4 – 0.6**；`threshold` **~0.85**（若未来重新对齐 rating→片元亮度分布，再校准文案）。  
* **调试接口**：**`window.__bloom`** — `enable` / `disable`，读写 `strength` / `radius` / `threshold`。  
* **历史**：Phase 5.1.6 曾在分层调试中将 strength=0 关闭；也曾以 **strength ≈ 0.95 / radius ≈ 0.52 / threshold ≈ 0.82** 作为集成默认值——**当前产品默认不挂 pass**，以上数值保留为调试起点。  
* **DPR 约束**：一旦启用 Bloom，`UnrealBloomPass.setSize` 与 `EffectComposer.setPixelRatio` 必须随 renderer 同步——详见 **§1.4 DPR 兼容性约束**。

### **1.3 性能参考基线（非强制，仅作优化阶段对照）**

开发阶段**不设硬性性能约束**，优先跑通全链路。以下数值仅作为后期优化时的**参考锚点**：

| 指标 | 参考基线 | 备注 |
| :---- | :---- | :---- |
| 帧率 | 60 fps（中端独显） / 30 fps（最低可接受） | 低于 30fps 时 3D 漫游体感明显卡顿 |
| JS 堆内存 | ≤ 300 MB | 60K 条 JSON ≈ 30–50 MB；余量留给 Three.js 对象与海报纹理缓存 |
| GPU 显存 | ≤ 500 MB | 双 `InstancedMesh` + instance attribute；主要开销另含 Bloom 多 pass RT 与海报纹理 |
| 首屏（白屏→可交互） | ≤ 5 秒 | 已有 Loading 页，用户预期在"加载一个世界" |

### **1.4 相机初始配置与首屏加载**

#### **1.4.1 视距窗口模型（Phase 5.1.5 · 方案 1）**

引入三个参数刻画宏观漫游下「相机 Z」与「用户时间关注点」的解耦——**均作为 Zustand `useGalaxyInteractionStore` 的一级字段**，`camera.ts` / `scene.ts` / `point.*.glsl` / `interaction.ts` 共享同一份状态：

| 参数 | 含义 | 初值与来源 |
| :---- | :---- | :---- |
| **`zCurrent`** | 用户当前关注的发行年（世界 Z，与 `movies[i].z` 同轴，含小数年） | 挂载时写入 **`z_range` 排序后的较早端 `zLo`**（计划 Rev 4；从时间轴起点开始漫游） |
| **`zVisWindow`** | 可观测 Z 窗口宽度（年），定义 **`[zCurrent, zCurrent + zVisWindow]`** 闭区间 | 默认 **1 年**（非常聚焦），供 §1.1 粒子分层与 §1.5 拾取共用 |
| **`zCamDistance`** | 相机沿 −Z 相对 `zCurrent` 的后退距离 | **Phase 7.3**：初值 **`30`** 世界单位，Zustand 默认与 `mountGalaxyScene` 挂载写入一致，**不再**按 `zSpan` 公式计算。**Phase 17 起**：**运行时可调**——**宏观 idle** 下 **按住 Space + 滚轮**走 **dolly-to-cursor**，写入 **`zCamDistance`** 并平移相机 XY 使光标 NDC 下世界命中点不变；**`zCurrent` 与 fov 不变**；**局部 dolly 写入时** **`clamp(zCamDistance, 2, 30)`**（**上限 = 默认 standoff**，仅允许相对默认「推近」，见 §1.4.4）。**松开 Space**（本轮曾武装 dolly）将 **`zCamDistance` 复位为 30**。**Ctrl + 滚轮**不处理相机（交给浏览器页面缩放）。**focus 会话**内滚轮（含 Space + wheel）**仍为 noop**（与 Phase 13 一致）。实现见 `galaxyInteractionStore.ts`、`camera.ts`、`scene.ts` |

**相机世界 Z 关系（宏观 idle 态）**：

\[
\text{camera.position.z} = z_{\text{Current}} - z_{\text{CamDistance}}
\]

* **挂载时**与 **RAF `tick`** 中 `selectionPhase === 'idle'` 的每一帧重置一次，使相机与 store 单向对齐。  
* **Timeline 等效读数（Phase 13 起）**：HUD / `galaxyCameraZBridge` 使用**单一路径** **`bridgeZ = zCurrent`**（**不再**按 `selectionPhase === 'idle'` 分支为 `camera.position.z + zCamDistance`）。**理由**：进入 focus 时 **`zCurrent`** 与焦点片 **`movie.z`** 对齐（瞬时或经 **`transitionDriver`** 渐变，见 Phase 13 P13.4）；退出 focus 后 **`zCurrent` 保留在 `movie.z`**，不回退到进入前宏观值。

#### **1.4.2 相机初始位置**

* **X, Y**：`meta.xy_range` 的中心点（`(x_min + x_max) / 2`、`(y_min + y_max) / 2`）。  
* **Z**：由 §1.4.1 关系计算得 **`camera.position.z = zLo - zCamDistance`**（不再使用旧的"`z_range[0] - 2`"固定偏移）。  
* **朝向**：**宏观 idle** 下始终看向 **+Z 方向**（向未来），`GALAXY_CAMERA_EULER = Euler(0, π, 0, 'YXZ')`，**在 `selectionPhase === 'idle'` 时运行期恒定不变**（与 Design Spec §2.1 一致）；**严禁**将目测 yaw / pitch 补偿（如 -15° / -7.5°）写入代码常量（Phase 5.1.4 硬约束）。  
* **Phase 13 红线例外**：**`GALAXY_CAMERA_EULER` 恒定**仅对上述 **idle** 相位成立。**单片 focus**（`selectedMovieId !== null` 且处于 **`selecting` / `selected` / `deselecting`** 的 focus 相机路径）使用**轨道相机**（`lookAt(pivot)` + store **`focusOrbit.{yaw,pitch}`**，半径恒 **`FOCUS_PERLIN_CAMERA_STANDOFF`**），详见《星球状态机 spec》§3.4.6。

#### **1.4.3 滚轮与拖拽控制**

* **滚轮双模式**（Phase 5.1.5，经 Phase 13 修订，**Phase 17** 扩 **dolly-to-cursor**）：  
  * **默认（无 Space 武装、且非 Ctrl 交由浏览器）**：**宏观 idle 态**下滚轮修改 **`zCurrent`**（受 `[zLo, zHi]` clamp），随即同帧写 `camera.position.z = next - zCamDistance`，维持 Phase 5.1.5 **macro Z scroll** 行为。  
  * **按住 Space + 滚轮**（仅 **宏观 idle**、`getMacroZWheel === true`）：**dolly-to-cursor**——修改 **`zCamDistance`**（clamp **§1.4.4**），并偏移 **`camera.position.x/y`** 使**光标下屏幕 NDC 对应的世界点**在 **`z = zCurrent`** 平面上 dolly 前后保持一致（实现：`Raycaster` + 水平 **`Plane`**）；**`zCurrent` 不变**、**透视 fov 不变**。**松开 Space**（且本轮曾武装 dolly）→ **`zCamDistance → 30`**。  
  * **`Ctrl + 滚轮`**：**不** `preventDefault`、**不**改 **`zCurrent` / `zCamDistance`**，交给**浏览器页面缩放**（避免与触摸板 pinch 的 `ctrlKey` 抢手势）。  
  * **非 idle、且非 Phase 13 focus 轨道路径**（如历史「飞入途中推拉」等）：无 Space 武装时滚轮可直接调节 `camera.position.z`（保留 Phase 4.5 特写推拉体验），**直至** focus 轨道相机语义落地后以实现为准。  
  * **Phase 13 · focus 会话**（与单片 `selectedMovieId` 关联的 **`selecting` / `selected` / `deselecting`**）：滚轮 **noop**——**不**修改 **`zCurrent`**、**不** dolly **`camera.position.z`**、**不**改变 **`FOCUS_PERLIN_CAMERA_STANDOFF`**、**不**改 **`zCamDistance`**（**含** Space + wheel；保证 Perlin 球屏幕尺寸严格映射 **`vote_count`**，与 P13.3 一致）。  
  * 控制函数暴露 **`getMacroZWheel?: () => boolean`** 钩子；缺省视为 true；**focus 态 macro 滚轮已 noop 时**，**Space + wheel** dolly 分支同样不得生效。  
* **滚轮步长初值**：每刻度约 **0.5**（半年），在开发阶段按实际视觉效果调整；**dolly 速度**初值见《视觉参数总表》§1 / §8。  
* **拖拽**：**宏观 idle** 下仅 **truck / pedestal**（XY 平移），Rotation 恒定。**Phase 13 · focus 轨道段**：指针拖拽用于 **orbit**（更新 store **`focusOrbit.yaw` / `focusOrbit.pitch`**，绕 pivot），**不**沿用 idle 的 truck/pedestal 语义（见状态机 spec §3.4.6）。

#### **1.4.4 Clamp（相机运动约束）**

* **`zCurrent`** 限制在 **`[zLo, zHi] = sorted(meta.z_range)`** 内。  
* **相机 XY** 限制在 **`meta.xy_range`** 加 **padding = 0.08 × 轴跨度**；`clampGalaxyCameraXY` 在拖拽回调与每帧 tick 均被调用，全相位一致。  
* **`zCamDistance`**（**Phase 17**）：**局部 dolly 写入路径**为 **`clamp(zCamDistance, 2, 30)`**——**下限 2** 避免相机过于贴近 **`zCurrent`** 平面（`near=0.05` 余量）；**上限 = 默认 standoff 30**，产品语义为**仅允许相对默认机位「推近」**，不允许通过 dolly 把 standoff 拉到大于默认。**store 初值 / 松开 Space 复位**仍为 **30**。历史草案 **[2, 300]** 上界仅见于早期计划文本，**以实现为准**。

#### **1.4.5 近远裁面（Phase 8 定稿）**

* **near**：**0.05**  
* **far**：**1e6**（大跨度 Z 与相机推拉余量；见 `scene.ts` `PerspectiveCamera` 构造）

旧版文档曾记 **0.1 / 300**；以**源码**为准。

#### **1.4.6 DPR 兼容性约束（Phase 5.1.4.7 · H-G）**

在 **`window.devicePixelRatio > 1`**（Windows 显示缩放 125% / 150% 等）下，`WebGLRenderer` / `EffectComposer` 的 pixelRatio 处理必须严格同步，否则会出现**画面右下裁切**与"主轴非 Z 平行"的**错觉**（用户曾在 Phase 5.0 评估中报告 T1，Rev 3 锁定为 DPR 问题）。

**强制约束**（实现于 `scene.ts`）：

1. **顺序**：`renderer.setPixelRatio(pr)` **必须早于** `renderer.setSize(w, h, ...)`；composer 侧在同次 resize 中同步 **`composer.setPixelRatio(pr)`**。  
2. **`EffectComposer` 显式对齐**：不得依赖 `EffectComposer` 构造时继承的 pixelRatio 默认值；每次 resize 都显式 `setPixelRatio`。`UnrealBloomPass.setSize(w, h)` 入参为 **CSS 尺寸**（composer 内部再乘以 pixelRatio）。  
3. **CSS 尺寸交由 Three.js 维护**：`renderer.setSize(w, h, true)`（`updateStyle=true`）或等效手动 CSS 同步，避免 drawing buffer 与 canvas CSS 尺寸比例错位。  
4. **DPR 变化兜底**：RAF `tick` 中比对 `renderer.getPixelRatio()` 与 `Math.min(window.devicePixelRatio, 2)`，不一致则重新调用 resize 流程（处理运行中跨显示器拖拽或 Windows 缩放变化）。  
5. **pixelRatio 上限**：`Math.min(window.devicePixelRatio, 2)`，避免在 3x 高 DPI 下 Bloom 多 pass RT 爆显存。  
6. 星系材质（idle/active shader）的 **`uPixelRatio`** 与 `pr` 同步，保证屏幕空间尺度一致（若与 Points 测试路径并存，同规则）。

**非目标 / 禁止**：任何将目测 `-15° / -7.5° / 0.26180 / 0.13090` 等旋转值写入 `GALAXY_CAMERA_EULER` 或相机常量的"症状掩盖"式修复。

#### **1.4.7 首屏加载体验（Phase 15）**

首屏加载分为**四阶段**（与 `Loading.tsx` 进度 `ol` 一一对应）：

1. **download** — `fetch` **`galaxy_data.json.gz`**（HTTP 字节流；进度由 `Content-Length` / 已下载字节驱动）。  
2. **decompress** — `DecompressionStream` 解压（进度仅阶段切换，无字节级）。  
3. **parse** — `JSON.parse` + 类型校验。  
4. **index** — **`galaxy_search_index.json.gz`** hydrate（`meta.has_search_index === true` 时执行；为 **`false`** 时本阶段直接 **`status='skipped'`**，不阻塞）。

**Hydrate 与 3D mount 时序（实现契约）**：**`App.tsx`** 在 **`galaxyDataStore.status === 'ready'`** 且 **`data`** 已解析可用时，于 **`useEffect`** 中**立即**调用 **`useSearchIndexStore.getState().hydrateFromGalaxyMeta(data.meta)`**——与 UI 的 **`index-loading`** / 第四阶段进度展示**并行**，**不**等待用户点击 **Start**；**`mountGalaxyScene`**（创建 **`WebGLRenderer`**、GPU buffer）**仅**在本地 **`started === true`**（用户手势触发 **`setStarted(true)`**）**且**索引 hydrate 已达终态（**`ready` / `skipped` / `error`**）后执行。Cover 阶段 **`WebGLRenderingContext` 数量为 0**；点击 **Start** 后增至 **1**（DevTools 验收）。

四阶段**全部完成**（含 **`skipped`**）后进入 **Cover-await-start** 状态：保留 Loading **同一覆盖层**；**不**再使用独立 **Spinner** 与进度区**标题行**（加载阶段与 Cover 均**以四阶段 `ol` + 进度条**为主叙事；索引 loading 时可在条下显示 **`footerMessage`**）。**Start** 按钮置于视口**下方**；用户**点击 Start**（或聚焦按钮后 **Enter** / **Space**）后再 **mount Three.js 场景**（首次创建 `WebGLRenderer` 与 GPU buffer）。**`App.tsx`** 以本地 **`started`** 状态门闩：仅 **`started === true`** 时挂载主场景。失败处理：

* **`galaxy_data`** 的 download / decompress / parse **任一失败** → **错误页 + Retry**（与现状一致）；**不**进入 Cover。  
* **`galaxy_search_index`** 失败 → 第四阶段标 **`Failed`**，用户仍**可点 Start** 进入应用；搜索框 **disabled**（与 Phase 12 §4.8「无索引退化」一致）。

#### **1.4.7a P15.3 回归验收**

* **主路径**：刷新 → 四阶段 Loading → Cover（**Start**）→ 进入宏观漫游；**Phase 13 focus**、**Phase 14** 全屏 / HUD 等已落地行为在 **Start 之后**无回归。  
* **`galaxy_data` 失败**：仅错误页 + **Retry**，**不**出现 Cover。  
* **搜索索引**：**`skipped`**（无索引包）与 **`error`**（fetch/解析失败）时第四阶段分别显示 **Skipped** / **Failed**，仍可 **Start**；入场后搜索 **disabled**（与 Phase 12 §4.8 一致）。  
* **可重复性**：整页刷新可重复完整链路；**`started`** 仅在当前文档生命周期内为 **`true`**（重载即重置）。  
* **历史导航**：本应用为**无路由状态的 SPA**（无 `react-router` 级会话）；浏览器后退/前进若触发整页重载则重新走加载；同页内不产生「离开 Cover 再返回」的路由态。

### **1.5 交互拾取（Phase 8.4：active `InstancedMesh` + 世界球；Phase 12：search 多选与 mask 对齐）**

生产路径**不再**对 `THREE.Points` 主拾取；**仅**对 **`galaxyActive`** 使用 `Raycaster` 时，引擎给出的网格命中**不能**直接反映 `instanceMatrix` 的顶点缩放量，故实现采用 **`screenRadius.ts` 中的世界空间球/半径** 与 `pickClosestActiveMovieAlongRay`：**射线与每颗「active 尺度下」世界球求交**，取最近合法命中，并与 shader 的 `sActive` / `inFocus` **同构**。

| 环节 | 规则 |
| :---- | :---- |
| **主拾取对象** | `galaxyActive`（`InstancedMesh`）；**idle 不作为**可点目标 |
| **Slab / inFocus 门控** | **默认**（`searchMode === 'idle'`，`uSelectionMode === 0`）：与 §1.1 一致；采纳拾取时须 **`inFocus > 0.5`**（与《星球状态机 spec》及《视觉参数总表》一致），等同「只与条带内 active 可交互区」。**Phase 12**（`searchMode` 为 **`person`** 或 **`genre`**）：GPU 上 `uSelectionMode === 1` 时 idle/active 顶点着色器 **`inFocus` 改由 `uSelectionMask` 纹理采样**（与 Z 条带解耦）；CPU 侧 `screenRadius.ts` / `interaction.ts` 用 **`selectionMaskPickSet`**（`selectionIds` 集合）使**仅 mask 内影片**按全 **`inFocus = 1`** 计算 active 世界球半径并参与射线求交，其余实例跳过；采纳命中仍须 **`inFocus > 0.5`**（对 mask 内实例恒成立）。**电影名搜索**（`searchMode === 'movie'` 或未进入多选）不改变上述默认 slab 拾取。**Phase 13**：当 **`selectedMovieId !== null`** 且 **`uSelectionMode === 2`**（focus 邻域球）时，**`getSelectionMaskPickSet`** 返回 **focus 邻域 id 集合**（与 search mask **互斥**：focus 态优先邻域 mask；退出 focus 后若仍处于 select，则恢复 §1.5 上行 `mode=1` 行为），GPU 与 CPU 同构。 |
| **hover 环** | **HTML overlay**（`HoverRing`），**无 CSS transition**，与 Tooltip 同节奏显隐 |
| **历史：Points** | 旧版对 `Points.threshold` 的估算与 A/B 层过滤见归档讨论；`interaction.ts` 中 `computePointScreenRadiusCss` 等**仅**供基准/遗留对照 |

**假设与局限**：active 在条带外趋近零尺度时极难点中，属预期；若 T6 类问题再现，可收紧容差或第二近邻（性能基线与准入归档见 [`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md)，含 **`## P12 入口/出口`** 搜索压力片段与 **`## P16 出口`** Phase 16 复跑 / 手测登记）。

**Phase 11.6（已实装）**：当 `selectedMovieId != null` 时，拾取先判断 focus Perlin 球包围球（半径 `selectionPlanet.lastRadius`）是否沿当前射线比 active 命中更近；若更近，则 hover/click 归为焦点星语义（保持 focus，tooltip 继续由 `hoveredMovieId` 单一字段驱动）；否则回落既有 `galaxyActive` 世界球命中路径以支持切换 focus。详见《星球状态机 spec》§3.5.2 与 `interaction.ts`。

## **2\. 核心坐标生成算法 (Coordinate Generation)**

> 数据源、清洗、特征工程、UMAP/DensMAP 参数、Z 轴、genre palette、自动化更新节奏与 Phase 18+ 部署流的 SSOT 迁移至 [`TMDB 电影宇宙 Data Pipeline.md`](./TMDB%20电影宇宙%20Data%20Pipeline.md)。本节仅保留前端/渲染所需的坐标生成心智模型；若与 Data Pipeline SSOT 冲突，以后者为准。

### **2.1 X/Y 平面生成 (UMAP 预计算)**

二维语义坐标的 (X, Y) 在 Python 管线中**预计算**后写入 `galaxy_data.json`。**UMAP 实现后端**分为两条路径，由运行参数选择（`scripts/run_pipeline.py` 的 `--umap-backend` / `--cpu` 等），二者**不保证** bitwise 一致；**任意更换后端**须 bump 宇宙数据版本并在变更中注明。

* **Backend: `umap-learn`（CPU，Windows 本地回退）**：在 **Windows** 侧 **`.venv`** 与 `pip` 依赖（`requirements.txt` → `requirements.cpu.txt`）上运行。适合小样本、无 NVIDIA GPU、或仅做清洗与联调。  
* **Backend: RAPIDS cuML（GPU，WSL2 Ubuntu 主路径）**：在 **WSL2** 的 conda 环境 **`chronicle`**（由 `scripts/env/rapids_env.yml` 创建）中，通过 `cuml.manifold.UMAP` 计算；数据与代码宜放在 WSL 文件系统，产物可同步回 Windows 工作区见 `scripts/env/sync_artifacts_to_windows.sh`。注意：cuML 不支持 DensMAP；当 production 参数 `densmap=true` 时，管线使用 CPU `umap-learn` 路径。

* **输入特征 (Input Features)**：  
  1. **剧情文本**：overview \+ tagline，通过 NLP 模型生成 Embeddings（**规范见下节 2.1.1**）。  
  2. **流派分类 (genres)**：采用**顺位加权编码 (Rank-Weighted Encoding)**；顺位权重为**等比衰减**，**现行默认公比为黄金比例** \(q=1/\varphi\)（**见下节 2.1.2**）。  
  3. **文化锚点 (original\_language)**：执行 One-hot 编码。  
* **UMAP 超参数**：`n_neighbors`、`min_dist`、`metric` 等**不在此文档锁死数值**；由实验阶段**手动调参**，并将最终取值写入运行配置与产物元数据（与宇宙数据版本号一并记录）。  
* **UMAP 随机种子（可复现）**：`umap-learn` 与 **cuML** 调用中均须传入 **`random_state=42`**（固定整数，**不可省略**）。同一套输入特征、超参与**同一后端**下，重跑管线应得到**稳定可比对**的 (X, Y) 拓扑（在相同 `torch` / `numpy` 及 **`umap-learn` 或 `cuml` 等版本**前提下的各自语义下）。`umap-learn` 与 `cuml` 之间、或库大版本升级导致的数值漂移，须在变更日志中注明；**故意**更换 `random_state` 视为新宇宙版本，须 bump 版本号并重新 `fit`/`fit_transform`。该值须写入 `meta.umap_params.random_state`。  
* **排除字段**：绝对排除 release\_date、vote\_count、vote\_average、revenue、budget 以及具有强共线性的 spoken\_languages 和 production\_countries。  
* **数据驱动原则**：genre 集合、language 集合及其对应的向量维度（N\_genre、N\_lang）均须在管线运行时**从当前数据源动态计算**，严禁写死为常量。所有依赖这些维度的下游数值（如 `1/√d` 缩放因子、色板 hueStep、One-hot 编码宽度等）也必须跟随动态计算。此原则同样适用于 `vote_count`/`vote_average` 的值域边界——映射函数的输入范围由实际数据的 min/max 决定，不可硬编码。

### **2.1.1 文本 Embedding 规范（overview + tagline）**

本节为**可执行约定**：实现与复现时须按此处固定模型、输入形态与归一化策略；更换其中任一项须视为**新宇宙版本**（与 UMAP 模型一并版本化）。

* **语言策略**：**保留所有语言的 overview**（不对 overview 做「仅英语」过滤）。TMDB 为多语言简介混布，须使用**多语言句向量模型**；不得使用纯英文句向量模型（如 `all-MiniLM-L6-v2`）作为主模型，否则非英语条目在语义空间中会被系统性扭曲，验证结论不可靠。  
* **模型分档（按项目阶段）**：  
  * **阶段 A — 轻量化验证（subsample、管线联调、算力/耗时优先）**：`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`。输出稠密向量维度 **384**。允许牺牲部分语义质量以换取速度与低显存占用。  
  * **阶段 B — 质量版（全量或周期性宇宙重构）**：`sentence-transformers/paraphrase-multilingual-mpnet-base-v2`。输出稠密向量维度 **768**。在流程跑通后，用同套清洗与特征拼接规则替换本模型，再执行 `fit_transform` 或全量重算。  
* **实现栈**：Python 侧统一使用 **`sentence-transformers`** 加载上述 Hugging Face 模型 ID；编码时**优先使用 GPU**（如 NVIDIA RTX 3070 级别）。`encode` 的 `batch_size` 建议从 **64** 起试，显存充足可逐步提高至 **128～256**；出现 OOM 则下调 batch，而非静默丢样本。  
* **PyTorch 与 CUDA（GPU 环境）**：`sentence-transformers` 依赖 PyTorch。若只执行 **`pip install -r requirements.txt`** 且未额外指定 PyTorch 官方 CUDA 索引，pip 通常会从 PyPI 解析到 **CPU 构建**（`torch.__version__` 带 **`+cpu`** 后缀，`torch.version.cuda` 为 **`None`**，`torch.cuda.is_available()` 为 **`False`**），无法满足上条「优先 GPU」的约定。  
  * **本机有 NVIDIA GPU、需要 GPU 跑 embedding 时**：须按 [PyTorch Get Started](https://pytorch.org/get-started/locally/) 选择 **Windows / Pip / 合适 CUDA 版本**，使用其给出的 **`--index-url https://download.pytorch.org/whl/cu…`** 安装 **`torch`（及官方建议捆绑的 `torchvision` / `torchaudio`）**。仓库当前开发机基准为 **CUDA 12.8 线**，示例（在项目 venv 内）：`pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128`。成功后 **`torch.__version__` 应含 `+cu128`（或所选 cu 标签）**，且 **`torch.cuda.is_available()` 为 `True`**。驱动版本须满足所选 CUDA 簇的最低要求；若驱动偏旧，在官网改选较低 CUDA 对应的索引（如 `cu126`、`cu118`）。  
  * **无 GPU 或仅需 CPU 验证**：可继续使用 PyPI 上的 CPU 构建；须在运行配置或产物元数据中注明 **CPU**，避免与 GPU 产出的宇宙数据在无说明的情况下混比。  
* **输入拼接（单条影片一条文本）**：  
  * 若 `tagline` 非空：拼接为两行结构 —— 第一行固定前缀 `Tagline:` \+ tagline 原文；第二行固定前缀 `Overview:` \+ overview 原文。  
  * 若 `tagline` 为空或仅空白：仅使用 `Overview:` \+ overview 原文。  
  * **截断**：在送入模型前对**拼接后的整段字符串**做单次截断，**保留开头、截掉超出部分**（即从尾部截断）。默认最大长度 **3000 字符**（UTF-8 下按字符计数，与 Python 字符串长度一致）；若 subsample 试验需进一步提速，可临时改为 **2000**，但须在产物元数据中注明该参数。  
* **向量归一化**：对模型输出的每条 embedding 做 **L2 归一化**（`sentence-transformers` 中 `normalize_embeddings=True` 或与等价实现），并在全项目保持一致，便于跨阶段对比与增量追加时的数值尺度稳定。  
* **可复现与版本锁定**：在 `requirements.txt`（或等价锁文件）中固定 **`torch`、`sentence-transformers`** 的主次版本；流水线配置中记录所用**模型 Hugging Face ID**；若需严格 bitwise 可复现，可额外记录模型仓库的 **Git revision**。记录 `torch` 时建议写入 **完整构建标签**（例如 **`2.11.0+cu128`** 与 **`2.11.0+cpu`** 主次版本相同但二进制不同），与上条安装来源一致。更换 `torch` / `sentence-transformers` / 模型任一项时，在变更日志中标注**宇宙数据版本号**。

### **2.1.2 流派顺位权重（等比衰减 · 默认黄金比例）**

TMDB 中一条影片可出现 **任意多个**流派标签（按 API 给定顺序作为顺位 \(k=1,2,3,\ldots\)）。权重须在无限顺位上**单调递减**，避免高阶标签与主标签抢权重。

* **现行默认（等比 + 黄金比例）**：设 \(\varphi=(1+\sqrt{5})/2\)，公比 **\(q = 1/\varphi\)**（数值约 **0.6180339887**）。第 \(k\) 顺位权重  
  \[
  w_k = \varphi^{-(k-1)} = q^{\,k-1}.
  \]  
  即 \(w_1=1,\ w_2\approx0.618,\ w_3\approx0.382,\ w_4\approx0.236,\ldots\)，相邻顺位恒满足 \(w_{k+1}/w_k = q\)。  
* **与特征向量拼接**：将各流派的 one-hot（或该流派在嵌入空间中的分量）乘以对应的 \(w_k\) 后**累加**（或按实现约定拼接后再缩放）；具体张量形状与 genres 编码实现一致即可，但**顺位权重必须来自同一套 \(w_k\)**。  
* **可调参（保留未来调整空间）**：公比 **不必写死在业务逻辑里**。实现中应以**单一常量或配置项**暴露（例如 `genre_weight_ratio`，默认等于 `1/φ`）。若日后改为其他 \(q\in(0,1)\) 或改用别的衰减族，须：  
  * 在运行配置与产物元数据中记录 **`genre_weight_ratio`**（及可选的 **`genre_weight_scheme`**，例如 `geometric_phi`）；  
  * 在变更日志中** bump 宇宙数据版本号**（与 UMAP 再训练策略一致）。  
* **视觉层**：宏观主色仍取 **genres\[0\]**；微观混合纹理若使用多流派加权，**建议使用同一组 \(w_k\)**，避免 UMAP 输入与 Shader 各用一套比例。

### **2.1.3 多模态特征融合规范（Multi-modal Feature Fusion）**

三类特征组维度量级差距悬殊（文本 384/768 vs 流派 N_genre vs 语言 N_lang，后两者的维度由数据集中实际出现的去重值数量决定，**不可写死常量**）。若直接拼接，高维组将在距离计算中天然主导，低维组的拓扑贡献被压扁。本节规定拼接前的**逐组归一化与尺度对齐**策略。

* **逐组 L2 归一化**：三组各自独立做 L2 归一化（文本向量已在 §2.1.1 中完成；genres 加权向量与 language One-hot 向量在拼接前亦须各自 L2 归一化），使每组样本的向量模长 = 1。  
* **维度均衡缩放（`1/√d`）**：L2 归一化后，每组再乘以 `1/√d`（d 为该组维度数）。数学依据：两个随机单位向量在 d 维空间中的期望欧氏距离与 d 无关（恒 ≈ √2），但拼接后高维组在**总平方距离**中占的份额与 d 成正比；`1/√d` 恰好将每组的平方距离期望贡献拉齐。  
* **可调模态权重乘子**：在 `1/√d` 缩放之上，再暴露三个可调权重 `w_text`、`w_genre`、`w_lang`（默认均为 **1.0**），作为管线配置项。若实验中发现「文本过强、流派星团不明显」，可提升 `w_genre`；反之亦然。  
* **最终拼接伪代码**：

  ```python
  combined = np.concatenate([
      text_vec  * (1 / sqrt(d_text))  * w_text,
      genre_vec * (1 / sqrt(d_genre)) * w_genre,
      lang_vec  * (1 / sqrt(d_lang))  * w_lang,
  ], axis=1)  # → 送入 UMAP
  ```

* **版本化**：三个权重值须写入 `meta`（`feature_weights: { text: 1.0, genre: 1.0, lang: 1.0 }`）；修改任一权重须 bump 宇宙数据版本号。

### **2.2 Z 轴深度生成 (时间映射)**

* **绝对小数年份法 (Decimal Year)**：在前端或预处理中，将 release\_date 转换为小数格式以实现无断层映射。  
  * 公式：Z \= 年份 \+ (当前日期在当年天数 \- 1\) / 当年总天数。  
* **Z 轴不做归一化 / 缩放**：保留原始小数年份值（约 1900–2025，跨度 ~125），**不**将其压缩至 X/Y 同量级范围。这是有意为之——Z 轴远大于 X/Y 的跨度能营造"在时间长河中浏览"的纵深感，历史空白年代的空旷也应如实保留。前端相机的 near/far 平面与滚轮步进需适配此量级。  
* **时间偏移噪音 (Temporal Jittering)**：识别占位符数据（如 YYYY-01-01），在 \[.0000, .9999\] 范围内注入小数偏移量，打散重叠节点。**不剔除占位符日期**——采用 Jitter 而非删除，保证这些影片仍然出现在宇宙中。  
  * **可复现性要求**：Jitter 必须为**确定性**——以每部影片的 **TMDB `id`** 作为随机种子（例如 `rng = np.random.default_rng(seed=tmdb_id)`），保证同一影片在不同管线运行中获得相同的 Z 偏移。Phase 18+ 即使改为周期性全量 `fit_transform`，同一影片的 Z 坐标也不可在重跑时漂移。

## **3\. 数据生命周期流水线 (Data Pipeline)**

数据生命周期与 Phase 18+ 自动化方案以 [`TMDB 电影宇宙 Data Pipeline.md`](./TMDB%20电影宇宙%20Data%20Pipeline.md) 为准。

当前已确认方向：

* **初始化**：本地或 CI 全量清洗 → embedding → DensMAP/UMAP `fit_transform` → 导出静态 JSON.gz。
* **每日刷新**：GitHub Actions 拉取 Kaggle daily update，更新已有电影的 `vote_count` / `vote_average` / `popularity`，重导静态 JSON.gz；每日任务不重算 UMAP 坐标。
* **周度 / 月度 refit**：全量 `fit_transform`，合入 pending 新片，并用 v1 reference 做 Procrustes 对齐后写回当前坐标。
* **不再依赖 UMAP `.pkl` 增量 transform**：当前 `umap_model.pkl` 体积大且受 pickle/numba ABI 影响，不作为 Phase 18+ 稳定管线依赖。

## **4\. 输出数据 Schema（Python → 前端契约）**

Python 管线的最终产物以 **`galaxy_data.json`**（及 gzip）为主；**Phase 12 起**可选增加配套 **`galaxy_search_index.json.gz`**（与 `meta.has_search_index` 联动）。前端一次性加载主文件后拆分到 GPU Buffer 与 DOM HUD；搜索索引为独立 Hydrate，详见 §4.5。

### **4.1 顶层结构**

```jsonc
{
  "meta": { /* §4.2 元数据 */ },
  "movies": [ /* §4.3 每条电影对象的数组 */ ]
}
```

### **4.2 `meta` 元数据块**

数据版本、生成参数、genre palette 版本与自动化管线语义见 [`TMDB 电影宇宙 Data Pipeline.md`](./TMDB%20电影宇宙%20Data%20Pipeline.md)；本节仅定义前端消费的 JSON 字段契约。

| 字段 | 类型 | 说明 |
| :---- | :---- | :---- |
| `version` | string | 宇宙数据版本号，格式 `YYYY.MM.DD` 或语义版本 |
| `generated_at` | string (ISO 8601) | 本文件的生成时间 |
| `count` | int | `movies` 数组长度 |
| `embedding_model` | string | 所用 sentence-transformers 模型 HF ID |
| `umap_params` | object | `{ n_neighbors, min_dist, metric, random_state, densmap, ... }` 实际使用的 UMAP 超参；**`random_state` 固定为 `42`**（见 §2.1）；**`densmap`** 为 **bool**（`true`/`false`），与 Phase 2.4 `umap_projection.py` 及导出入口是否传入 **`--densmap`** 一致，表示是否启用 DensMAP |
| `genre_weight_ratio` | float | 流派权重公比（默认 ≈0.618） |
| `genre_palette` | object | **genre 名 → sRGB hex 色值** 映射表，例如 `{ "Drama": "#E74C3C", ... }`。源色彩空间为 **OKLCH**，Phase 18+ 由 frozen palette 生成；管线中转为 sRGB hex 后写入此处。**HUD swatch** 与兼容用途 |
| `genre_palette_version` | string \| undefined | **Phase 18+**：frozen genre palette 版本，例如 `"v1"`；若 palette 重排或加入新 genre，必须 bump |
| `has_genre_hue` | bool \| undefined | **Phase 8.1**：为 **`true`** 时，每条 `movies[i]` **应**含 **`genre_hue`**（弧度 \([0, 2\pi)\)），GPU 宏观/focus 路径优先消费 hue + 均匀 L/C；与 `genre_color` **双字段共存**直至下一大版本移除旧字段（须 bump 版本并回归） |
| `has_search_index` | bool \| undefined | **Phase 12+**：为 **`true`** 时，静态目录中**应**存在 **`galaxy_search_index.json.gz`**（§4.5），且每条 `movies[i]` **应**含 **`title_normalized`**（§4.3）；前端据此启用 HUD 搜索（人名 / genre 联想）；缺失时搜索 UI disabled（见 Design Spec §4） |
| `feature_weights` | object | `{ text: 1.0, genre: 1.0, lang: 1.0 }` §2.1.3 多模态融合的权重乘子 |
| `z_range` | `[float, float]` | 数据集中 Z 轴（小数年份）的 `[min, max]`，供前端相机初始化与 clamp |
| `xy_range` | `{ x: [min, max], y: [min, max] }` | UMAP 坐标的实际值域，供前端归一化或相机边界设置 |

### **4.3 `movies[i]` 单条电影对象**

分为**三组**字段：GPU 渲染层直接消费、HUD DOM 层展示、逻辑/关联。

#### **A. GPU 渲染层（加载后写入 BufferAttribute）**

| 字段 | 类型 | 来源 / 计算方式 | 说明 |
| :---- | :---- | :---- | :---- |
| `x` | float | UMAP 输出坐标 | 语义平面 X |
| `y` | float | UMAP 输出坐标 | 语义平面 Y |
| `z` | float | `release_date` → 小数年份（含 Jitter） | 时间纵深 |
| `size` | float | `log10(vote_count + 1)`，再线性映射到 `[size_min, size_max]` | **InstancedMesh** 世界尺度链中的 **`aSize`** 来源（与 `uSizeScale`×`u*SizeMul` 相乘）；值域与管线映射同前（**可调**） |
| `emissive` | float | `vote_average` 线性映射到 `[emissive_min, emissive_max]` | 资产中可保留；**P8.4 宏观 mesh** 片元主路径用 **`voteNorm = vote_average/10`** 与 OKLab **L** 混色（见 `galaxyMeshes.ts`）。Bloom 仍受 §1.2 阈值约束 |
| `genre_hue` | float | Pipeline 按流派 index 分配等距色相，**弧度** \([0, 2\pi)\)（与导出 `build_genre_palette` 一致） | **P8.1+**：GPU `hue` attribute；缺省时前端 `hueFromGenreColor(genre_color)` |
| `genre_color` | `[float, float, float]` | `genres[0]` 查 `meta.genre_palette` → 转 RGB 归一化 `[0-1]` | **兼容 / HUD**；无 `genre_hue` 时前端可用 `hueFromGenreColor` 回推 hue（见 Vitest） |

#### **B. HUD / DOM 展示层**

| 字段 | 类型 | 说明 |
| :---- | :---- | :---- |
| `title` | string | 电影标题（Tooltip + 抽屉） |
| `title_normalized` | string \| undefined | **Phase 12+ 管线**：`NFKD` + ASCII fold + **casefold**，供搜索与子串匹配；与 `has_search_index` 同步出现；旧包无此字段时前端跳过电影名索引路径 |
| `original_title` | string | 原始语言标题 |
| `overview` | string | 剧情简介全文 |
| `tagline` | string \| null | 宣传标语（可空） |
| `release_date` | string (`YYYY-MM-DD`) | 精确日期文本展示 |
| `genres` | string[] | 全部流派名称（按顺位排列） |
| `original_language` | string | 原始语言代码 |
| `vote_count` | int | 评价人数 |
| `vote_average` | float | TMDB 评分 |
| `popularity` | float | TMDB 热度 |
| `imdb_rating` | float \| null | IMDb 评分 |
| `imdb_votes` | int \| null | IMDb 评价人数 |
| `runtime` | int \| null | 片长（分钟） |
| `revenue` | int | 票房（0 表示未收录） |
| `budget` | int | 预算（0 表示未收录） |
| `production_countries` | string[] | 出品国家 |
| `production_companies` | string[] | 出品公司 |
| `spoken_languages` | string[] | 对白语种 |
| `cast` | string[] | 演员（已按顺位截取，建议 ≤ 20 人精简体积） |
| `director` | string[] | 导演 |
| `writers` | string[] | 编剧 |
| `producers` | string[] | 制片人 |
| `director_of_photography` | string[] | 摄影指导 |
| `music_composer` | string[] | 配乐 |
| `poster_url` | string | 完整海报 URL（Python 侧拼装 `https://image.tmdb.org/t/p/w500` + `poster_path`） |

#### **C. 逻辑 / 关联层**

| 字段 | 类型 | 说明 |
| :---- | :---- | :---- |
| `id` | int | TMDB ID，作为 Raycaster 拾取与数据绑定的唯一键 |
| `imdb_id` | string \| null | 用于拼接 IMDb 外链 (`https://www.imdb.com/title/{imdb_id}/`) |

### **4.4 体积与加载说明**

以 ~60K 条为例：纯 JSON 原始常见量级为**数十 MB**；经 gzip 后的体积随字段丰富度、字符串长度与压缩级别变化。**不对 `galaxy_data.json.gz` 设体积硬性上限**；首包与托管成本以实际网络环境与 `meta.count` 为准。**`galaxy_search_index.json.gz`**（§4.5）为人名倒排 + genre 列表，体积通常远小于主文件；若需减轻传输或解析压力，可考虑：  
* **拆分**：GPU 字段抽为独立 binary buffer（Float32Array dump），HUD 字段按需懒加载。  
* **裁剪 cast**：截取前 10 人（而非 20）可减轻一部分文本体积。  
* **当前阶段不做此优化**，优先跑通。

### **4.5 配套搜索索引 `galaxy_search_index.json.gz`（Phase 12+）**

与 `galaxy_data.json.gz` **并列**部署于 `public/data/`（或等价 CDN 路径）。**仅当 `meta.has_search_index === true`** 时前端尝试加载；**`version`** 字符串与 **`galaxy_data.meta.version`** 对齐，便于一致性校验。

**顶层结构（逻辑 schema）：**

```jsonc
{
  "version": "<同 galaxy_data.meta.version>",
  "people": {
    "<normalized_key>": {
      "full": "Original Display Name",
      "role_mask": 61,
      "movie_ids": [123, 456],
      "movie_roles": {
        "123": 2,        // 在 #123 上仅任 director
        "456": 17        // 在 #456 上同时任 cast(1) + producers(16)
      }
    }
  },
  "genres": {
    "Action": { "count": 12345, "movie_ids": [11, 22, 33] },
    "Drama":  { "count":  9876, "movie_ids": [44, 55] }
  }
}
```

#### **4.5.1 `people`**

- **`key`**（`normalized_key`）：人名 NFKD + ASCII fold + casefold 后的字符串（与 `title_normalized` 共用同一规范化函数）；**多个原始写法可能合并到同一 key**，此时 `full` 取出现频次最高 / 第一条原始字符串。
- **`full`**：展示用原始姓名（保留大小写、变音符号）。
- **`role_mask`**：**uint8** 位掩码，按位**或**合并**全部参演影片**的多角色：
  | 位 | 数值 | 来源字段 |
  | :---- | :---- | :---- |
  | 0 | `1` | `cast` |
  | 1 | `2` | `director` |
  | 2 | `4` | `director_of_photography` |
  | 3 | `8` | `writers` |
  | 4 | `16` | `producers` |
  | 5 | `32` | `music_composer` |
  - 取值范围 **`[0, 63]`**；`assert role_mask <= 63` 是管线必检约束。
- **`movie_ids`**：参演影片 TMDB ID 数组，**去重**；顺序不限（前端按需排序，例如人名星座连线按 `release_date` 升序）。
- **`movie_roles`**（**Phase 12.7+** 新增，可选）：对象映射 **`"<tmdb_id>" → <该片上的 role 位掩码>`**，描述该人在每部参演影片**单片粒度**的职位组合。位定义与 `role_mask` 一致；同片多职位按位**或**合并。
  - **键集合**：与 `movie_ids` 作为集合**完全一致**（管线断言 `set(movie_roles.keys()) == set(str(id) for id in movie_ids)`）。
  - **值约束**：每个值 ∈ `[1, 63]` 且 `(value & ~role_mask) === 0`（即每片职位是该人 `role_mask` 的子集）。
  - **用途**：前端按职位**拆分人名星座连线**（Design Spec §4.0 / §4.4），三组链 producers / crew(director|dop|writers|music_composer) / cast 各自按 `release_date` 升序连段；详见《星球状态机 spec》§3.6 与 `frontend/src/three/constellation.ts`。
  - **降级**：旧包无 `movie_roles` 字段时前端**不报错**，星座连线退化为 `selectionIds` 单条时间序折线。
  - **体积**：`movie_roles` 为对象，体积与「人数 × 平均参演片数」线性相关；`galaxy_search_index.json.gz` 整体随之增大，**部署侧须与 `galaxy_data` 同版本一并重导**。
- **任意 token 前缀（Design Spec §4.4）**：实现可在 **运行时**按空白拆分 `normalized_key` token，亦可由管线**预拆分**写入额外字段（例如 `tokens: string[]`）；本 Schema 不强制，与 Design Spec 行为契约一致即可。

#### **4.5.2 `genres`**

- **结构**：对象映射 **`genre 名 → { count, movie_ids }`**；`genre 名` 与 **`meta.genre_palette`** 的 key 集合**完全一致**。
- **`count`**：该 genre 在数据集中**出现次数**（`Σ movies where genre ∈ m.genres`，**不限于 `genres[0]`**）。供 Design Spec §4.5 的 **二级排序（按数量降序）** 使用。
- **`movie_ids`**：包含该 genre（任一顺位）的全部影片 TMDB ID，去重。供 select 会话直接驱动 `selectionIds`（无需前端再扫一次 60K × N）。
- **稳定枚举**：JSON 对象迭代顺序在 Python 3.7+ 保持插入序；管线写入顺序应为 **palette key 序**（与 `meta.genre_palette` 一致）。

#### **4.5.3 渲染侧契约**

`galaxy_search_index` 仅承载**检索数据**；视觉层 **`uSelectionMask`**、**`uSelectionMode`**、**`uMovieCount`** 与 macro mesh 的对接见《星球状态机 spec》§3.6。
- **`viswindow` 关系**：`person` / `genre` 进入 select 会话后，**active 集合由 `selectionIds` 决定**，**与 `uZCurrent` / `uZVisWindow` 解耦**（shader 内 `uSelectionMode == 1` 时 `inFocus` 由 mask 重写）；timeline UI 可继续接收 wheel / drag 写 `zCurrent`，但视觉无反馈。
- **focus 嵌套**：select 会话中点击 active 影片进入 focus，**两者并存**；ESC 出栈语义见 Design Spec §4.6。
- **`selectionPersonKey`（store 一级字段）**：人名联想点击时写入命中条目的 **normalized key**（即 `searchIndex.people` 的键），供 `scene.ts` 在 RAF 中读取 **`searchIndex.people[selectionPersonKey].movie_roles`** 作为人名星座连线的分组依据；`searchMode !== 'person'` 或 `clearSearch()` 时清回 `null`。

## **5\. 部署架构**

### **5.1 当前阶段（产品验证期）**

纯静态前端部署，**无后端服务**：

```
[Python 本地管线]
    ↓ 产出
galaxy_data.json (gzip)    ← §4 定义的 Schema
    ↓ （可选，Phase 12+）
galaxy_search_index.json.gz ← §4.5，当 meta.has_search_index 时
    ↓ 放入
前端项目 public/data/
    ↓ 部署
Vercel / Netlify / GitHub Pages（静态托管）
```

* Python 管线在**本地手动执行**（清洗 → embedding → UMAP → 导出 JSON + gzip），大体积 **`galaxy_data.json.gz`** 可提交到 `frontend/public/data/` 或由 CDN 提供。  
* 前端默认 **`fetch(BASE_URL + 'data/galaxy_data.json.gz')`** 一次性加载；按 **gzip 魔数**与 **HTTP 透明 gzip** 分支处理后再 `JSON.parse`；Loading 完成后初始化 Three.js 场景（实现见 `frontend/src/data/loadGalaxyGzip.ts`、`frontend/src/utils/loadGalaxyData.ts`）。  
* **静态托管**：**GitHub Pages**（本仓库已配 Actions 构建部署）或 **Vercel / Netlify** 等；注意子路径部署时 Vite `base` 与资源 URL 一致。

### **5.2 未来阶段（自动化数据管线）**

Phase 18+ 的自动化部署目标以 [`TMDB 电影宇宙 Data Pipeline.md`](./TMDB%20电影宇宙%20Data%20Pipeline.md) 为准：

```
Kaggle Daily Updates
    ↓
GitHub Actions nightly / weekly jobs
    ↓
Supabase (source of truth)
    ↓
export galaxy_data.json.gz + galaxy_search_index.json.gz
    ↓
Cloudflare Pages
    ↓
Browser 一次性加载静态数据
```

* **Supabase** 仅作 source of truth；前端不直接查询数据库。
* **每日任务**只刷新已有电影的投票/评分/热度并重导静态 JSON。
* **周度 / 月度任务**全量 `fit_transform`，合入 pending 新片，并用 v1 reference 做 Procrustes 对齐。
* **Cloudflare Pages** 是 Phase 18 目标静态托管；GitHub Pages 保留为灰度备线。

## **6\. 项目目录结构**

```
chronicle_v3_3d_galaxy/
│
├── data/                           # ⛔ 不进 npm 包，Python 侧管理
│   ├── raw/                        #   原始 CSV（gitignore 大文件，或 LFS）
│   └── subsample/                  #   随机子集，供快速调试
│
├── docs/
│   ├── project_docs/               #   PRD / Tech Spec / Design Spec 等
│   └── reports/                    #   数据集质量报告等
│
├── scripts/                        # Python 数据管线
│   ├── _archive/                   #   Phase 1.0：旧版独立过滤脚本归档（仅参考）
│   ├── feature_engineering/        #   embedding / genre 编码 / UMAP
│   └── export/                     #   导出 galaxy_data.json
│
├── frontend/                       # 前端项目根目录
│   ├── public/
│   │   └── data/                   #   galaxy_data.json（管线产物放这里）
│   ├── src/
│   │   ├── components/             #   React 组件（HUD、Tooltip、Drawer、Loading）；各组件旁或子目录内放 *.stories.tsx
│   │   ├── three/                  #   原生 Three.js 模块
│   │   │   ├── scene.ts            #     场景、renderer、postprocessing、WebGL2 断言
│   │   │   ├── galaxyMeshes.ts     #     P8.4 双 InstancedMesh（idle + active）
│   │   │   ├── planet.ts           #     focus Perlin 球 `Icosahedron(1,8)` + 分位数阈值 / P11.4 光照与 L
│   │   │   ├── camera.ts           #     truck/pedestal、滚轮、`setFocusCameraPosition`
│   │   │   ├── interaction.ts      #     active mesh 拾取、hover/click
│   │   │   └── shaders/            #     GLSL
│   │   │       ├── galaxyIdle.vert/frag.glsl, galaxyActive.vert/frag.glsl
│   │   │       ├── perlin.vert/frag.glsl, oklab.glsl
│   │   │       └── point.vert/frag.glsl   # 基准 / 测试，非主场景
│   │   ├── store/                  #   Zustand store（React ↔ Three.js 桥）
│   │   ├── hooks/                  #   React hooks
│   │   ├── utils/                  #   数据解析、格式化等
│   │   ├── types/                  #   TypeScript 类型定义（含 §4 JSON Schema 的 TS 接口）
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .storybook/                 #   Storybook 配置（main.ts、preview.ts 等）
│   ├── index.html
│   ├── vite.config.ts              #   Vite 构建配置
│   ├── tsconfig.json
│   └── package.json                #   含 storybook / build-storybook 脚本
│
├── requirements.txt                # Python 依赖
└── README.md
```

### **6.1 开发规范（轻量级，个人项目适用）**

* **语言**：前端 **TypeScript**（严格模式）。Python 侧使用 type hints。  
* **构建工具**：**Vite**（快速 HMR、原生 ESM、GLSL 文件可通过 `vite-plugin-glsl` 导入）。  
* **Storybook**：与 Vite 栈对齐，使用 **`@storybook/react-vite`**；`npm run storybook` 用于本地开发 HUD，`npm run build-storybook` 可选用于静态部署组件目录页。  
* **代码风格**：ESLint + Prettier，采用默认推荐规则集即可，不必自定义过多规则。  
* **Git**：  
  * `data/raw/` 下的大文件加入 `.gitignore`（或 Git LFS）。  
  * `frontend/public/data/`：推荐 Git **仅跟踪** `galaxy_data.json.gz`；未压缩 `galaxy_data.json` 由管线本地生成并 **gitignore**（见仓库根 `.gitignore`）。  
  * Commit message 无强制格式，保持简洁可读即可。

## **7\. 浏览器兼容性**

| 要求 | 说明 |
| :---- | :---- |
| **最低要求** | **WebGL 2.0**（Three.js r163+ 默认 WebGL2 renderer）。覆盖 Chrome 56+、Firefox 51+、Safari 15+、Edge 79+（即 2022 年后的主流桌面浏览器均支持） |
| **移动端** | **不作为主要适配目标**。项目核心交互（滚轮穿梭、hover tooltip、拖拽平移）依赖鼠标，移动端体验天然受限。若移动端能打开且基本渲染正常即为 bonus，不投入专门的触控适配 |
| **降级策略** | 若浏览器不支持 WebGL 2.0，显示一个**静态提示页**（"请使用现代桌面浏览器访问"），不做 WebGL 1.0 降级（维护成本 >> 收益） |

## **8\. 无障碍 / 可访问性**

作为以 3D 视觉交互为核心的个人项目，完整的 WCAG 2.1 AA 达标**不作为当前目标**。但以下**低成本高收益**的措施应予保留：

* **语义 HTML**：HUD 层（React DOM）使用合理的 heading 层级、`<button>` / `<a>` 等语义标签，而非全部 `<div>`。  
* **键盘可达**：档案抽屉的关闭按钮、外链按钮等 DOM 交互元素确保可通过 Tab 键聚焦。  
* **色彩对比度**：HUD 文字（标题、评分等）与背景之间保持足够对比度（深色背景上使用浅色文字）。  
* **alt 属性**：海报 `<img>` 标签带 `alt="{movie title} poster"`。  
* **3D 场景**：WebGL Canvas 本身不具备无障碍语义，不做额外的 ARIA 标注（投入产出比极低）。

## **9\. 测试策略**

个人项目以**快速迭代**为主，不追求覆盖率指标。测试重心放在**数据正确性**、**DOM 层 UI 的隔离开发与回归**（Storybook）以及 **3D 场景的手动联调**上：

### **9.1 Python 管线**

* **数据校验断言**：管线脚本在关键步骤后加入 `assert` 检查——  
  * 过滤后行数在预期范围内（防止一次性丢弃 >50% 数据时无感知）  
  * 输出 JSON 中 `x`, `y`, `z`, `size`, `emissive` 无 NaN / Inf  
  * `meta.count` == `len(movies)`  
* **subsample 快速冒烟**：使用 `data/subsample/` 的小数据集跑通全管线，验证输出格式正确。  
* 不设单元测试框架；若未来脚本复杂度增长，可引入 `pytest`。

### **9.2 前端（3D 画布 + 全应用联调）**

* **手动交互测试为主**：每次改动后在浏览器中验证——Loading → 粒子渲染 → hover tooltip → click 选中 → 相机推进 → 材质溶解 → 抽屉信息 → 取消回退。  
* **数据加载冒烟**：在 `console` 中打印 `movies.length`、抽样几条检查字段完整性。  
* **TypeScript 类型守卫**：§4 的 JSON Schema 定义为 TS `interface`，加载时做基础运行时校验（例如 `if (!data.meta || !data.movies)` → 弹出错误提示而非白屏）。  
* **3D 部分**：不在 Storybook 中覆盖；依赖上述全应用手动联调。若未来需要回归测试，优先考虑 **Playwright**（可截图对比 3D 渲染结果）。

### **9.3 Storybook（DOM / HUD 层 UI）**

* **确定采用 [Storybook](https://storybook.js.org/)** 开发与验收**非 3D** 的 React UI：Loading 页、Tooltip、档案详情抽屉、错误提示、外链按钮等。  
* **目的**：在**不挂载 Three.js** 的前提下隔离调试布局、字体、动效与多状态（空 tagline、缺海报、长 overview、多流派列表等），并作为组件文档供日后迭代。  
* **约定**：每个可复用 HUD 组件配套 `*.stories.tsx`；Story 内用**固定 mock 数据**（可从 `data/subsample/` 抽一条或几条合成），避免依赖真实 `galaxy_data.json` 才能预览。  
* **与 Vite**：使用 `@storybook/react-vite`（与 §6 构建栈一致）。  
* **不设** Storybook 与 3D 的联合 E2E；全应用联调仍归 §9.2。