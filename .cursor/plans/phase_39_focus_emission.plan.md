---
name: Phase 39 Focus 自发光
overview: 将 focus Perlin 星球从“评分控制 OKLab Lightness”迁移为“固定基础 Lightness/Chroma + 评分经可版本化 power curve 控制逐片元局部底色 Emission + 固定 Key Light 塑形”，修正 linear RGB 合成后再统一转换 sRGB 的颜色空间顺序，并收敛网站 focus、Cover 今日星球与静态导出的纯 Bloom 增量合成与视觉参数。三个入口共用同一视觉配置，FocusLReference 与 FocusSizeReferenceRings 完整退役。
todos:
  - id: p39-contract-baseline
    content: 39.1 锁定现状、基础材质 smoke 与非 focus Lightness 不变量
    status: complete
  - id: p39-emission-domain
    content: 39.2 建立可测试的评分→Emission 强度线性纯函数与显式端点
    status: complete
  - id: p39-focus-appearance-uniform
    content: 39.3 固定 Focus L/C 与 Key Light 并让评分只写入 Emission uniform
    status: complete
  - id: p39-linear-emission-shader
    content: 39.4 实现逐片元局部底色 Emission、linear RGB 固定主光与单次 sRGB 输出
    status: complete
  - id: p39-shared-consumers-hash
    content: 39.5 统一网站 Focus、Cover、静态导出与视觉 hash
    status: complete
  - id: p39-reference-retirement
    content: 39.6 完整退役 FocusLReference、FocusSizeReferenceRings 及旧契约
    status: complete
  - id: p39-verification
    content: 39.7 完成自动化回归、受控评分矩阵与 3000×3000 导出一致性验证
    status: complete
  - id: p39-emission-curve-diagnostics
    content: 39.9 隔离固定 Key、验证 cubic Emission 曲线并重建低中高候选矩阵
    status: complete
  - id: p39-bloom-composition-correctness
    content: 39.10 修复 Perlin Bloom 基础画面重复叠加、统一三端合成契约并验证参数范围
    status: complete
  - id: p39-visual-parameter-convergence
    content: 39.11 [需人工验收] 按 Key、Emission exponent、Bloom、Emission 端点顺序完成单变量视觉收敛
    status: pending
  - id: p39-visual-gate
    content: 39.8 [需人工验收] 使用最终参数完成三端与宏观层综合视觉 Gate、参数固化及文档报告
    status: pending
isProject: false
---

# Phase 39 — Focus 评分自发光、颜色空间与三端视觉统一

## 前置与目标

- 非 focus 的 idle / active / select 继续使用现有评分 → OKLab Lightness 映射，不改 [`frontend/src/lib/colorMath.ts`](frontend/src/lib/colorMath.ts) 与宏观 galaxy shader 的视觉语义。
- focus Perlin 星球改为固定基础 Lightness/Chroma；`vote_average` 只进入独立、可版本化的评分 → Emission power curve，不再改变 Focus 的基础 L 或 Key Light。
- Emission 使用 Perlin/genre band 合成后的逐片元局部底色：蓝色区域发蓝光，黄色区域发黄光，不叠加白色 Emission 改写局部色相。
- 不引入 Three.js `PointLight` / `DirectionalLight`；固定 Key Light 仍由 [`frontend/src/three/shaders/perlin.frag.glsl`](frontend/src/three/shaders/perlin.frag.glsl) 的中性 Lambert uniform 模型实现，只负责球体、地形和 band 塑形。
- 网站 focus、Cover 今日星球、静态星球导出继续共同消费 [`createSelectionPlanet()`](frontend/src/three/planet.ts)，不得形成三套参数或分支。
- [`FocusLReference`](frontend/src/hud/FocusLReference.tsx) 与 [`FocusSizeReferenceRings`](frontend/src/three/FocusSizeReferenceRings.ts) 完整退役，不保留隐藏渲染、每帧同步、Store 快照、locale 接口或旋转命名依赖。

```mermaid
flowchart LR
  V[Movie.vote_average] --> M[纯函数 clamp + power map]
  M --> EI[uEmissionIntensity]
  C[固定 Focus L/C + genre/Perlin bands] --> B[逐片元 baseLinear]
  B --> EM[baseLinear × emissionIntensity]
  EI --> EM
  B --> KL[baseLinear × fixed Key × Lambert]
  K[固定 uKeyLightIntensity] --> KL
  EM --> SUM[linear RGB 相加]
  KL --> SUM
  SUM --> S[一次 linear to sRGB]
  S --> P[shared createSelectionPlanet]
  P --> W[网站 focus]
  P --> COV[Cover 今日星球]
  P --> EX[3000×3000 静态导出]
  S --> BLOOM[Perlin selective Bloom 后处理]
```

## 范围边界

### 本 Phase 要做

- 建立可测试纯函数 `focusEmissionIntensityFromVoteAverage(voteAverage, minIntensity, maxIntensity, exponent)`；输入评分先 clamp 到 `0…10`，再经可版本化 power curve 映射到明确的最低/最高 Emission 强度。
- 将 focus appearance 收敛为固定 `lightness/chroma/keyLightIntensity`、genre hues 和评分派生 `emissionIntensity`；删除 focus 对宏观 galaxy Lightness uniform 快照的依赖。
- 删除与同色 Emission 数学重复的独立 ambient 参数；最低可见辐射由 `emissionIntensityMin` 承担。
- 把 Perlin 颜色流程改为：OKLab/OKLCH → 逐片元 `baseLinear` → 局部底色 Emission + 固定 Lambert Key → 单次 sRGB 输出。
- 更新共享视觉默认值与 `planetVisualConfigHashInput()`，使 Emission 曲线端点、固定 Key 和颜色空间语义参与导出 hash。
- 删除两个旧 Reference 及其 scene/HUD/store/CSS/i18n/test 边界；保留并去除旧术语后的确定性星球姿态与自转。
- 完成自动化检查、同一 movie fixture 的受控低/中/高评分矩阵、真实样本验证、3000×3000 导出检查和人工视觉 Gate。

### 本 Phase 不做

- 不改 `Movie` / `Meta` 数据类型、Python pipeline、后端或 `galaxy_data.json`。
- 不改 vote_count → size、focus 半径、拾取、相机、地形噪声、genre band、星球自转和宏观状态机行为。
- 不让 focus 新曲线反向影响 idle / active / select，也不强行复用宏观 Lightness 曲线。
- 不让评分驱动 Key Light；不预埋 E+K 运行时模式、隐藏开关、第二条评分曲线或入口专属参数。
- 不新增独立 emissive buffer、GI、AO 或让星球照亮其他对象；本 Phase 的“自发光”指星球自身逐片元辐射与现有 selective Bloom 表现。
- 不默认开启全局 Bloom，不让 idle / active 粒子进入 Perlin selective Bloom。
- 不用 CSS 隐藏代替 Reference 退役，不保留“以后可能再用”的运行时死接口。

## 已确认设计

### D1 · Focus 与宏观评分视觉分层

- 宏观层：保持现有 `lightnessFromVoteAverage()` 和 galaxy shader 参数不变。
- Focus 层：[`frontend/src/three/planetAppearance.ts`](frontend/src/three/planetAppearance.ts) 独立计算 `emissionIntensity`；基础 Lightness/Chroma 与 Key Light 读取共享 focus defaults，不再读取 `PlanetGalaxyColorSnap`。
- `PlanetAppearance` 明确包含 `lightness`、`chroma`、`emissionIntensity`、`keyLightIntensity`。评分不得再写入 `uPerlinL` 或 `uKeyLightIntensity`。
- `keyLightIntensity` 保留在 appearance 中作为最终视觉状态的一部分，但对所有评分保持固定且由共享 defaults 提供。

### D2 · 独立、可版本化的 Emission power curve

39.2 先建立线性纯函数；39.9 在保持端点不变的前提下将生产候选扩展为以下 power curve：

```ts
const t = clamp(voteAverage, 0, 10) / 10
return minIntensity + Math.pow(t, exponent) * (maxIntensity - minIntensity)
```

- `emissionIntensityMin`、`emissionIntensityMax`、`exponent` 与 curve model version 是 [`PLANET_VISUAL_DEFAULTS`](frontend/src/three/planetVisualDefaults.ts) 中可序列化的 Focus 自发光参数；`keyLightIntensity` 是独立的固定标量。
- 函数对非有限评分/端点/exponent、负端点、`maxIntensity < minIntensity`、`exponent <= 0` 快速失败；只对有限的越界评分执行 clamp，不静默修复非法配置。
- `vote_average=0` 精确得到 min，`10` 精确得到 max；相等端点合法，用于固定 Emission 的诊断对照。
- 39.9 当前候选为 exponent `3`、`Emin=0.06`、`Emax=0.6`；最终 exponent、端点与固定 Key 由 39.11 单变量收敛后交给 39.8 人工 Gate 验收，不把临时 diagnostics override 当发布配置。

### D3 · 局部底色自发光、固定 Key 与单次终点转换

[`frontend/src/three/shaders/perlin.frag.glsl`](frontend/src/three/shaders/perlin.frag.glsl) 调整为：

1. genre hue + 固定 L/C 转成 linear RGB；只在底色边界处理 gamut/负通道安全。
2. Perlin/genre band 完成逐片元合成后得到 `baseLinear`；Emission 必须使用这份最终局部底色，而不是统一白色、单一 genre 色或 band 合成前的中间色。
3. 在线性 RGB 中计算：

```glsl
vec3 emissiveLinear = baseLinear * uEmissionIntensity;
vec3 keyLitLinear = baseLinear * uKeyLightIntensity * lambert;
vec3 litLinear = emissiveLinear + keyLitLinear;
```

4. `uKeyLightIntensity` 是中性固定主光标量；不同评分不得改变它。删除独立 `uAmbient`，不得同时保留 `baseLinear * ambient` 与同色 Emission 两个不可辨识项。
5. 保留现有导数法线、几何法线混合、band 选择、alpha 和 lighting enable 诊断行为；关闭/开启 lighting 仍共用同一个颜色空间输出边界，不创建第二条 sRGB 分支。
6. 片元末尾只调用一次 `linear_to_srgb`；不得在相加或乘光前 gamma encode，也不得再叠加 `colorspace_fragment` 等第二次转换。
7. 保留高于 1 的 Emission/受光结果供 selective Bloom 使用，只防止负值进入 gamma；是否需要上限处理以现有 SDR/Bloom 合成实测为准，不能提前截断亮部层级。

### D4 · 三个入口只有一个视觉 SSOT

- [`frontend/src/three/planetVisualDefaults.ts`](frontend/src/three/planetVisualDefaults.ts) 保存固定 L/C、Emission 最低/最高强度、固定 Key 强度/方向和颜色流程版本；不再保存独立 ambient 或 Key 最低/最高端点。
- [`frontend/src/three/planet.ts`](frontend/src/three/planet.ts) 的 `setFromMovie()` 不再接收 galaxy Lightness 快照；网站 focus 与 Cover 的 [`frontend/src/three/scene.ts`](frontend/src/three/scene.ts)、导出的 [`frontend/src/planet-export/renderPlanetImage.ts`](frontend/src/planet-export/renderPlanetImage.ts) 调用同一简化接口。
- 三个入口只能通过 `resolvePlanetAppearance()` 获得评分派生 Emission 和固定 Key，不得自行重建评分函数、端点或局部颜色。
- `PLANET_VISUAL_DEFAULTS.schemaVersion` 升级，增加明确的 Emission/color-pipeline version 标识；[`frontend/src/planet-export/main.ts`](frontend/src/planet-export/main.ts) 继续把完整配置写入 `visualHash`，使 [`tools/planet-exporter/src/browser.ts`](tools/planet-exporter/src/browser.ts) 生成新的 `visual_config_hash`，旧图不能被误判为相同配置。

### D5 · E+K 是 Gate 未通过后的独立决策

- Phase 39 的唯一生产候选是 `E(rating) + KFixed`，不同时实现 `K(rating)`，避免在同一轮引入两条评分曲线和四个可调端点。
- 若 39.8 仅发现亮度范围或 Bloom 问题，继续一次只调整一个 Emission 端点、固定 Key 或既有 Bloom 参数，不以评分 Key 掩盖问题。
- 2026-07-18 首轮 39.8 人工 Gate 为 No-Go：低分星球过亮，低分与高分的直觉亮度差异不足。后续 P39.9 先隔离固定 Key，再验证 cubic Emission；只有排除 Key 与曲线后仍偏亮，才评估固定 OKLab Lightness。
- 若受控矩阵证明高 Emission 必然抬平地形、而固定 Key 无法同时满足低/高评分，39.8 保持 pending：尚未交付时新增明确的后续 TODO 评估 E+K；若当前视觉契约已经交付或需要重新定义，则另开后续 Phase。
- 后续 E+K 必须有自己的纯函数、hash 版本和人工 Gate，不在本 Phase 预留隐藏运行时分支。

### D6 · Reference 完整退役，但不误删自转

- 删除 [`frontend/src/hud/FocusLReference.tsx`](frontend/src/hud/FocusLReference.tsx)、[`frontend/src/three/FocusSizeReferenceRings.ts`](frontend/src/three/FocusSizeReferenceRings.ts) 及专属测试。
- 从 [`frontend/src/App.tsx`](frontend/src/App.tsx) 移除 HUD 挂载；从 [`frontend/src/three/scene.ts`](frontend/src/three/scene.ts) 移除 ring 创建、scene 挂载、每帧更新、dispose 和 `focusLightnessSnap` 写入。
- 从 [`frontend/src/store/galaxyInteractionStore.ts`](frontend/src/store/galaxyInteractionStore.ts) 删除 `FocusLightnessSnap` 与 `focusLightnessSnap`。
- 从 [`frontend/src/lib/strings.ts`](frontend/src/lib/strings.ts) 和所有 locale bundle 删除 `focusLReference` / `focusVoteReference`；运行 locale schema parity 测试。
- 删除 [`frontend/src/index.css`](frontend/src/index.css) 的专属 `--hud-focus-ref-*` token。
- 若 [`frontend/src/lib/galaxyVoteSize.ts`](frontend/src/lib/galaxyVoteSize.ts) 的 tier/ring helpers 已无消费者，则连同专属测试删除；不删除仍被真实粒子尺寸逻辑消费的代码。
- [`frontend/src/three/selectionPlanetRotation.ts`](frontend/src/three/selectionPlanetRotation.ts) 保留确定性姿态、自转轴、自转速度和 quaternion 行为，但将 `REFERENCE_RING_*` / `RingPlane` 术语改为 planet-local spin/base-orientation 术语，并用测试锁定数值行为不变。

### D7 · Bloom 是纯增量后处理，正确性先于视觉调参

- 2026-07-19 对 P39.9 `d-cubic-bloom-matrix.png` 的复核发现：网站 Focus 与静态导出都先渲染基础场景，再把 `UnrealBloomPass` 已包含基础画面的 composer 输出整体加回，结果近似 `base + (base + bloom)`；该矩阵的 Bloom ON 行不能作为最终亮度或过曝判断依据。
- [`frontend/src/three/perlinSelectiveBloom.ts`](frontend/src/three/perlinSelectiveBloom.ts) 与 [`frontend/src/planet-export/renderPlanetImage.ts`](frontend/src/planet-export/renderPlanetImage.ts) 必须共享“基础场景只出现一次，附加项只含纯 Bloom 增量”的合成契约，不允许以调低 `strength`、Key 或 Emission 掩盖重复主体。
- Perlin Bloom 参数必须有限，且满足 `strength >= 0`、`radius ∈ [0,1]`、`threshold >= 0`；当前 `radius=2` 超出 Three.js `UnrealBloomPass` 契约，39.10 先恢复合法诊断基线，39.11 再做视觉择优。
- 执行顺序固定为 `39.9 → 39.10 → 39.11 → 39.8`：39.10 只修正确性，39.11 按 Key、Emission 曲线、Bloom、Emission 端点的顺序单变量收敛，39.8 只验收最终参数。
- 39.10/39.11 生成的候选与修复证据写入独立 ignored 目录，不覆盖 39.7/39.9 原始 PNG、sidecar 或联系表；旧证据保留为问题发现与行为对照。

## 工作拆分

### 39.1 `[contract]` 锁定现状与非 focus 不变量

**依赖：** 无。

- 在 [`frontend/src/three/planetCore.spec.ts`](frontend/src/three/planetCore.spec.ts) 和必要的 colorMath 聚焦测试中记录代表性评分输入、现有宏观 Lightness 输出与当前 Focus `uPerlinL/uAmbient/uDiffuse`（或实际等价命名）uniform 契约。
- 使用已有 `renderMode=basic` 路径先确认几何、相机、可见性和 3000×3000 canvas 基线，避免把传值/坐标问题误判为 shader 问题。
- 记录网站 focus、Cover、导出当前截图/metadata 与旧 `visual_config_hash`；选择一个可清楚观察两种局部颜色和地形的固定 movie fixture，并记录真实低/中/高评分样本 ID 供后续二级验证。

**验收：**

- 非 focus 代表性评分 → Lightness 输出被测试锁定。
- 当前 Focus 的 ambient/key/base-L uniform、基础材质 smoke、三端截图和旧 visual hash 已记录。
- 固定 movie fixture、受控评分值与真实样本清单可复现；基线只记录，不在本 TODO 调视觉参数。

### 39.2 `[domain]` 建立评分 → Emission 强度线性纯函数

**依赖：** 39.1。

- 在 [`frontend/src/three/planetAppearance.ts`](frontend/src/three/planetAppearance.ts) 建立 `focusEmissionIntensityFromVoteAverage()` 和必要的输入校验。
- 在 [`frontend/src/three/planetVisualDefaults.ts`](frontend/src/three/planetVisualDefaults.ts) 增加固定 Focus Lightness/Chroma、`emissionIntensityMin/Max` 与固定 `keyLightIntensity`；删除独立 ambient 和 Key 曲线端点配置。
- 测试 `0/5/10`、有限越界评分 clamp、端点精确值、线性、单调性、相等端点，以及非有限评分/端点、负端点、倒置端点快速失败。

**验收：**

- `vote_average=0` 精确得到 min，`10` 精确得到 max，区间内严格线性且单调不降。
- 新函数不 import 或调用 `lightnessFromVoteAverage()`，也不计算或返回 Key Light。
- Emission 端点、固定 L/C 与固定 Key 均可序列化并进入 visual hash。

### 39.3 `[appearance+uniform]` 固定 Focus L/C 与 Key 并让评分只驱动 Emission

**依赖：** 39.2。

- 扩展 `PlanetAppearance.emissionIntensity/keyLightIntensity`；`lightness/chroma/keyLightIntensity` 固定读取 Focus visual defaults，只有 `emissionIntensity` 读取评分映射结果。
- 将 `uDiffuse` 收敛为固定语义的 `uKeyLightIntensity`，新增 `uEmissionIntensity`，删除独立 `uAmbient`；`setFromMovie()` 按电影评分只写 Emission，`uPerlinL` 与 Key 始终写固定值。
- 删除 `PlanetGalaxyColorSnap`、`setFromMovie(..., galaxyColor)` 参数，以及 [`frontend/src/three/scene.ts`](frontend/src/three/scene.ts) 从 galaxy uniforms 每帧同步 `uLMax/uHuntGamma/uHuntApplyMask` 的耦合；若 Hunt 色度保护仍保留，只读取 Focus defaults，不跟随宏观 runtime 调参。
- 更新现有 `[Planet]` 日志，输出 `vote_average`、固定 L/C、映射后的 Emission 和固定 Key；断言 uniform 有限、Emission 位于端点范围、Key 等于共享配置。

**验收：**

- 对同一 movie fixture 仅替换低/中/高评分时，`uPerlinL`、Chroma 与 `uKeyLightIntensity` 完全相同，只有 `uEmissionIntensity` 按线性函数单调变化。
- 网站 focus、Cover、导出调用 `setFromMovie()` 时不再传宏观 Lightness 快照，也不自行写 Emission/Key。
- 修改 `window.__galaxyColor` 不再改变已定义的 Focus 基础 L/C、Emission 曲线或固定 Key。

### 39.4 `[shader]` 实现逐片元局部底色 Emission、linear RGB 固定主光与单次 sRGB 输出

**依赖：** 39.3。

- 重构 [`frontend/src/three/shaders/perlin.frag.glsl`](frontend/src/three/shaders/perlin.frag.glsl)：底色函数返回 linear RGB，band 合成得到逐片元 `baseLinear`，再按 D3 公式计算 `emissiveLinear + keyLitLinear`。
- 保留现有导数法线、几何法线混合、band 选择、alpha 和 lighting enable 诊断行为。
- 增加 shader contract 测试，锁定局部底色 Emission、固定 Lambert Key、“先在线性空间合成、后单次 `linear_to_srgb`”、无 ambient 重复项和 Bloom 前不截断 HDR。

**验收：**

- 蓝/黄等每个局部区域均以自己的 `baseLinear` 计算 Emission；不存在白色 Emission 或统一 genre 色覆盖局部 band。
- shader 中没有“sRGB base × shade”，也没有 `baseLinear * ambient + baseLinear * emission` 两个等价方向无关项。
- `linear_to_srgb` 只位于最终输出边界；关闭/开启 lighting 共用该边界。
- 受控评分提高时暗面与受光面输出均单调不降，Key 项保持不变；高于 1 的正值在 Bloom 前不被提前截断。

### 39.5 `[shared consumers+hash]` 统一网站 Focus、Cover 与静态导出

**依赖：** 39.3–39.4。

- 简化 [`frontend/src/three/scene.ts`](frontend/src/three/scene.ts) 的普通 focus 与 Cover today 初始化，两者只提供 movie/palette/radius。
- 简化 [`frontend/src/planet-export/renderPlanetImage.ts`](frontend/src/planet-export/renderPlanetImage.ts) 的 `prepareExportPlanet()`，不得自行重建评分、Emission、Key 或 Lightness 参数。
- 升级 [`PLANET_VISUAL_DEFAULTS`](frontend/src/three/planetVisualDefaults.ts) schema/Emission/color-pipeline 标识；扩展 [`frontend/src/three/planetCore.spec.ts`](frontend/src/three/planetCore.spec.ts)、[`frontend/src/planet-export/planetExport.spec.ts`](frontend/src/planet-export/planetExport.spec.ts) 与 exporter metadata 测试。

**验收：**

- 三个入口均经 `resolvePlanetAppearance()` → `createSelectionPlanet()`，不存在入口专属 Emission 端点、固定 Key 或颜色转换。
- 新配置生成的新 `visual_config_hash` 与基线不同；同配置重复导出 hash 稳定；修改 Emission 端点、固定 Key 或颜色流程版本会改变 hash。
- 3000×3000 Bloom ON 导出使用与网站相同的固定 L/C、评分 Emission、固定 Key 和逐片元局部色公式。

### 39.6 `[retirement]` 完整退役两个旧 Reference

**依赖：** 39.5。

- 按 D6 删除 HUD、Three scene object、Store snapshot、每帧更新、CSS token、locale keys、专属尺寸 tier helper 与测试。
- 同步删除全部 7 个 locale bundle 的对应键，保持 [`en.json`](frontend/src/lib/locales/en.json) SSOT 与其他 bundle 同构。
- 重命名旋转模块中的 ring/reference 术语，保持 seeded 姿态、自转轴、速度与运行时自转逻辑不变。
- 全仓搜索确保生产代码、类型、测试和文档待更新列表中没有 Reference 运行时消费者。

**验收：**

- `App` 不挂载 Reference；scene 不创建、更新或 dispose rings；Store 不保存 `focusLightnessSnap`。
- locale schema parity 通过，`strings.ts` 不再暴露旧文案接口。
- 自转相关测试证明退役 rings 前后同一 movie ID 的姿态和转速不变。

### 39.7 `[verification]` 自动化回归、受控评分矩阵与导出一致性

**依赖：** 39.1–39.6。

- 运行聚焦 Vitest：planet appearance、shader contract、rotation、export、locale schema。
- 运行 `npm test`、`npm run lint`、`npm run build`（工作目录 [`frontend`](frontend)）。
- 运行 [`tools/planet-exporter`](tools/planet-exporter) 的 test/typecheck。
- 在测试/导出验证层对 39.1 的同一 movie fixture 仅覆盖 `vote_average` 为低/中/高三个值，保持 movie ID、genre、Perlin seed、姿态、相机、L/C 和 Key 不变；各导出 3000×3000 Bloom OFF 与 Bloom ON PNG、`.render.json`。
- 再对真实低/中/高评分样本导出 3000×3000 Bloom ON 作为实际构图验证；真实样本不替代受控矩阵。
- 检查日志和 metadata 中的固定 L/C、单调 Emission、固定 Key 与新 visual hash；不读取 raw CSV，不运行 Python 全量数据重建。

**验收：**

- 自动化检查无新增错误，非 focus Lightness 测试保持 39.1 基线结果。
- 受控矩阵只改变评分与 Emission；固定 Key、种子、姿态、相机和其余视觉配置一致，输出可复现。
- Bloom OFF 能隔离验证表面 Emission/Key 层级；Bloom ON 能验证蓝/黄等局部颜色光晕且不改变 hash/config 归属。
- 所有导出尺寸、透明背景、metadata 与 hash 正确；相同输入重复导出稳定。

### 39.9 `[diagnostics+curve]` 隔离固定 Key、验证 cubic Emission 与重建候选矩阵

**依赖：** 39.7 完成；39.8 首轮人工 Gate 已明确 No-Go。

- 保留 P39.7 线性曲线、fixed Key ON 的 3000×3000 导出作为 A 基线，不改写其 PNG、fixture 或 sidecar。
- 用同一 movie、genre、seed、姿态、相机、固定 L/C 和 Emission 端点生成单变量候选：A `linear + Key ON`、B `linear + Key OFF`、C `cubic + Key OFF`、D `cubic + Key ON`；评分至少覆盖 `0/4/5/10`，其中 cubic 使用 `t³`，例如评分 4 的归一化权重为 `0.4³`。
- Key OFF 只用于离线诊断，生成证据后恢复 fixed Key ON；不得提交隐藏运行时开关、评分 Key、入口专属参数或第二套 appearance 数据流。
- 若 C 相对 B 证明曲线能压低低分，而 D 回装 fixed Key 后仍保留可辨识层级，则生产候选改为可序列化的 power curve，并把 exponent/model version 纳入 visual hash；端点、固定 L/C、fixed Key 强度与 Bloom 参数本 TODO 不同时调整。
- 只有 B/C 在 Key OFF 下仍显示低分底色过亮，才新增固定 OKLab Lightness 候选；不得在同一轮同时改 curve 与 Lightness。
- 新候选产物写入独立 ignored 目录，不覆盖 `data/runs/phase39-p39.7/` 原始证据；更新领域函数、三入口/hash contract、export diagnostics 和非 focus 不变量测试。

**验收：**

- A/B 只改变 fixed Key，B/C 只改变线性与 cubic 曲线，C/D 只改变 fixed Key；其余 diagnostics 完全一致。
- cubic 对有限评分先 clamp 到 `0…10`，再计算 `t³`；`0/10` 仍精确命中既有端点，`4/5` 明显低于线性值，保持严格单调和快速失败。
- 最终生产候选仍是 `E_curve(rating) + KFixed`，评分不进入 Key、L/C、genre band、size、pose、camera 或 Bloom。
- 新 visual hash 能识别 curve exponent/model version；相同候选重复导出 PNG SHA-256 稳定。
- 人工只在候选矩阵生成后判断层级；未获新 Go 前，39.8 保持 pending，不更新最终状态机/视觉映射文档。

### 39.10 `[bloom correctness]` 修复 Bloom 合成与参数契约

**依赖：** 39.9 完成；P39.9 Bloom ON 复核已确认主体重复叠加与非法 `radius=2`。

**目标：** 只恢复工程正确性，不对 Key、cubic exponent、Emission 端点、`threshold=0` 或 `strength=0.005` 做视觉择优。

- 在 [`frontend/src/three/perlinSelectiveBloom.ts`](frontend/src/three/perlinSelectiveBloom.ts) 收敛 Bloom 管线职责：基础场景只渲染一次，附加合成只包含纯 Bloom 增量，不再把 `UnrealBloomPass` 的 `base + bloom` 结果整体加回基础画面。
- 将网站 Focus 与 [`frontend/src/planet-export/renderPlanetImage.ts`](frontend/src/planet-export/renderPlanetImage.ts) 的 Bloom 参数校验、render target 和纯增量合成语义收敛到共享模块；入口只负责场景/相机/透明背景差异，不保留两套近似算法。
- 对 Bloom 参数快速失败：所有值必须有限，且满足 `strength >= 0`、`radius ∈ [0,1]`、`threshold >= 0`；把非法默认 `radius=2` 暂置为合法上限 `1.0`，仅作为 39.11 前诊断基线，不视为视觉定稿。
- 保留 HalfFloat HDR、透明背景、planet-only layer 与全局 Bloom 互斥语义；不得让 idle/active 粒子进入 Perlin selective Bloom，也不得改变全局 `window.__bloom` 默认关闭行为。
- 更新 [`frontend/src/three/perlinSelectiveBloom.spec.ts`](frontend/src/three/perlinSelectiveBloom.spec.ts)、[`frontend/src/planet-export/planetExport.spec.ts`](frontend/src/planet-export/planetExport.spec.ts) 及 exporter 必要测试，锁定共享配置、参数边界和合成契约。
- 使用固定 fixture 生成 `data/runs/phase39-p39.10/` 证据：`strength=0` 时 Bloom ON/OFF 可见主体 RGB 一致；非零 strength 只增加 Bloom 增量，不能再次叠加完整 base；修复前后的差异可由结构化统计和联系表复现。

**验收：**

- 自动化测试证明基础画面只出现一次，非有限/负参数及越界 radius 被拒绝。
- 网站 Focus 与 3000×3000 exporter 消费同一个 Bloom 合成与参数契约；静态导出仍正确保留 RGBA 透明背景。
- 生成修复后的 `rating 0/4/5/10 × Bloom OFF/ON` 诊断矩阵，只用于验证合成正确性，不用于固化最终视觉参数。
- `K=1.0`、exponent `3`、`Emin=0.06`、`Emax=0.6` 在本 TODO 中保持不变；除合法性基线外不调 Bloom。
- frontend 定向测试、`npm test`、`npm run lint`、`npm run build`，以及 [`tools/planet-exporter`](tools/planet-exporter) 的相关 test/typecheck 全部通过。

### 39.11 `[visual convergence]` Key、Emission 曲线与 Bloom 单变量收敛 `[需人工验收]`

**依赖：** 39.10 完成，且修复后的 Bloom OFF/ON 证据已证明可用于视觉判断。

- 候选生成使用独立的离线 diagnostics override，不提交隐藏运行时开关、评分 Key、入口专属参数或并行视觉数据流；最终只把人工选定值一次性写回 [`PLANET_VISUAL_DEFAULTS`](frontend/src/three/planetVisualDefaults.ts)。
- 所有候选使用同一 movie、genre、seed、pose、camera、固定 L/C 与 rating `0/4/5/10`，写入 `data/runs/phase39-p39.11/`；每个 checkpoint 只改变声明的单一变量族，并保留结构化 sidecar 对比。

#### Checkpoint A · Bloom OFF 下选择固定 Key

- 保持 exponent `3`、`Emin=0.06`、`Emax=0.6` 不变，先比较 `K=0.35/0.50/0.65`；必要时只围绕最佳候选缩小一次区间。
- 人工选择足以塑形、保留地形和明暗方向，但不主导主体亮度的固定 Key；评分仍不得进入 Key。

#### Checkpoint B · 固定 Key 后评估 Emission exponent

- 若 rating 4/5 仍过暗或难以区分，再比较 exponent `3/2.5/2`；若 Checkpoint A 后 cubic 已满足层级，则保持 exponent `3`，不为产生改动而调参。
- `Emin/Emax` 继续固定，人工选择能兼顾低分可读性、4/5 层级和高分动态范围的单一 exponent。

#### Checkpoint C · 固定表面亮度后调整 Bloom

- 在修正后的纯 Bloom 管线上，按 `threshold → radius → strength` 顺序一次只改变一个参数。
- `threshold=0` 可以作为“整球柔光”候选，但必须与低正 threshold 对照，确认不会填平暗部、地形和评分层级；`radius` 始终保持在 `[0,1]`。
- Bloom 只负责光晕，不得通过 Bloom 参数补偿错误的 Key 或 Emission 曲线。

#### Checkpoint D · 最后评估 Emission 端点

- 只有固定 K、exponent 和 Bloom 后 rating 10 仍过曝，才单独评估降低 `Emax=0.6`。
- 只有 rating 0 暗面不可读，才单独评估 `Emin=0.06`；两个端点不得同轮盲调。
- 将最终参数、model/config version、schema version 和 visual hash 一并更新；网站 Focus、Cover 与静态导出继续只经共享 defaults 和 `resolvePlanetAppearance()` 取值。

**验收：**

- 每个 checkpoint 的单变量关系均由 sidecar 自动验证，且不覆盖 39.7/39.9/39.10 原始证据。
- 最终生成受控 `rating 0/4/5/10 × Bloom OFF/ON` 矩阵和真实低/中/高评分样本；相同输入重复导出 PNG SHA-256 稳定。
- 人工确认 Key 只塑形、Emission 决定评分层级、Bloom 只增加光晕；rating 4/5 可读且存在有意义的视觉差异。
- 自动化检查、PNG/sidecar/hash 一致性、三入口配置一致性全部通过；人工接受后才把 39.11 标为 complete。

### 39.8 `[GATE]` 最终 Emission / Key / Bloom 视觉验收与文档回写 `[需人工验收]`

**依赖：** 39.10、39.11 全部完成；执行顺序为 `39.9 → 39.10 → 39.11 → 39.8`。

1. 只使用 39.11 已选定并写入共享 defaults 的最终参数；P39.9 `d-cubic-bloom-matrix.png` 的 Bloom ON 行只保留为问题发现证据，不作为最终验收输入。
2. 检查受控 `rating 0/4/5/10 × Bloom OFF/ON` 矩阵：固定 L/C、Key、姿态、相机和局部 band 构图不变，只有 Emission 随评分单调增强，Bloom ON 不重复主体或重定义评分层级。
3. 检查真实低/中/高评分电影：低分可读、中段有层级、高分不因 Emission/Bloom 过强而抬平地形、吞掉法线或大面积漂白；蓝/黄等局部区域保持色相身份。
4. 对同一电影比较网站 Focus、Cover 今日星球与 3000×3000 Bloom ON 静态导出，确认基础色、Emission 层级、主光方向、Bloom 形态和透明背景符合各入口契约。
5. 回到 idle / active / select 检查宏观评分亮度、色相、大小、拾取和状态切换无视觉回归。
6. 39.8 不再现场调参；若任一项 No-Go，返回 39.11 对应 checkpoint 重新做单变量候选，不在 Gate 中临时 patch。
7. 人工 Go 后固化最终参数与 visual hash，更新 [`docs/project_docs/星球状态机 spec.md`](docs/project_docs/星球状态机%20spec.md) 及实际受影响的视觉映射说明，并写入 [`docs/reports/Phase 39 P39 Focus 评分自发光与颜色空间统一 实施报告.md`](docs/reports/Phase%2039%20P39%20Focus%20评分自发光与颜色空间统一%20实施报告.md)。

未获人工 Go 前，不将 39.8 标为 complete，不宣称 Phase 39 参数定稿，不写最终实施报告或执行发布交付。

## Phase 39 验收标准

- 非 focus 的评分 → OKLab Lightness 视觉与数值保持不变。
- Focus 基础 Lightness/Chroma 与 Key Light 固定，评分只通过独立、可版本化的 power curve 控制逐片元局部底色 Emission。
- 蓝色、黄色等局部区域使用自身 `baseLinear` 发光，不以白色 Emission 或单一 genre 色覆盖 band。
- Perlin shader 在 linear RGB 中相加 Emission 与固定 Lambert Key，并只在输出边界转换一次 sRGB；不存在独立 ambient 重复项或 Bloom 前 HDR 截断。
- 网站 focus、Cover 今日星球、静态导出共用同一 appearance、uniform、visual defaults 与纯 Bloom 增量合成契约。
- 基础场景只出现一次；`strength=0` 的 Bloom ON/OFF 可见主体 RGB 一致，非零 strength 只增加 Bloom 增量。
- Perlin Bloom 参数全部有限，且满足 `strength >= 0`、`radius ∈ [0,1]`、`threshold >= 0`；非法参数快速失败。
- visual hash 能识别 Emission 曲线、固定 Key、最终 Bloom 参数与颜色流程，旧导出不会误复用。
- `FocusLReference`、`FocusSizeReferenceRings` 及其运行时状态/更新/文案/测试契约彻底消失。
- 确定性姿态与自转保留；受控评分矩阵可复现，Key 只塑形、Emission 决定评分层级、Bloom 只增加光晕。
- 自动化检查、3000×3000 导出矩阵、三入口一致性和人工 Gate 全部通过。
- Phase 39 不包含评分驱动 Key；若固定 Key 模型 No-Go，按 D5 独立规划 E+K。

## Phase 39 交付物

- `.cursor/plans/phase_39_focus_emission.plan.md`
- Focus 评分 → Emission power curve、固定 Key 与共享 visual defaults。
- 使用逐片元局部底色的 Perlin Emission + linear Lambert Key → 单次 sRGB shader。
- 三入口共用的 planet appearance/uniform、纯 Bloom 增量合成链与 visual hash。
- 两个 Reference 的完整退役 diff。
- 39.7/39.9 原始证据，以及 39.10 合成修复矩阵、39.11 单变量收敛矩阵和最终真实样本导出。
- 聚焦测试、状态机 spec、视觉映射说明与 Phase 39 最终实施报告。