# Phase 11.3（P11.3）— Perlin 阶梯地形与动态 genre 分带 — 实施报告

> **范围**：focus 态 Perlin 球「顶点挤出阶梯地形」、**band 数随本片 genre 数量变化**、CPU 分位数阈值与 shader 对齐、`scene` 侧包围球与控制台调试；**不含** P11.4 的片元法线重构（`dFdx`/`dFdy`）、不含 P11.5 不透明化。  
> **主文件**：`frontend/src/three/planet.ts`、`frontend/src/three/shaders/perlin.vert.glsl`、`frontend/src/three/shaders/perlin.frag.glsl`、`frontend/src/three/scene.ts`；Storybook 默认参数：`frontend/src/storybook/GalaxyThreeLayerLab.stories.tsx`  
> **计划来源**：`.cursor/plans/phase_11_focus_visual_upgrade_b71acde5.plan.md`（P11.3 条目；实施中追加产品与视觉定稿）  
> **Git 分支（实施时）**：`feature/p11.3-perlin-terrace-vert`（合并前请以仓库实际分支为准）

---

## 1. 计划对齐与超出部分

| 原计划 P11.3 摘要 | 本次处理 |
|-------------------|----------|
| 固定 4 档阶梯 + 3 个 smoothstep 累加 | **已扩展**：阶梯档数 **K = 本片用于球的 genre 数**（见 §2），非固定 4 |
| `lastRadius = worldRadius × (1 + 3 × uStepHeight)` | **已改为**：`× (1 + uCutCount × uStepHeight)`，其中 `uCutCount = max(0, K−1)` |
| `perlin.frag` 仍用 `uColor0..3` | **已改为**：`uniform vec3 uColors[8]` + 按 `bandIdx` 混合 |
| 几何 detail 未约定 | **已定稿**：`IcosahedronGeometry` **`detail = 8`**（§3.3） |

---

## 2. 产品与技术决策（最终）

### 2.1 Band 数与 genre 一致

- **K** = `genreDisplayWeights(movie.genres, PLANET_MAX_BANDS).genres.length`，**PLANET_MAX_BANDS = 8**（shader 数组上限）。
- **K = 1**（仅一种展示 genre）：`uCutCount = 0`，顶点侧不累加任何阶梯，`level` 恒为 0，**无高度差**。
- **K ≥ 2**：`uCutCount = K − 1`，在噪声域有 `K−1` 个分界阈值；顶点 **`level`** 为至多 `K−1` 段 `smoothstep` 之和，位移 **`position + normal × (level × uStepHeight)`**。

### 2.2 面积权重与「genre0 最低、逐级升高」

- CPU 侧目标面积比例仍为 **∝ [1, x, x², …, x^(K−1)]**，`x = uAreaRatio`（默认 **1/φ**），经 **LRM** 落到整顶点计数，再在**排序噪声**上取相邻分位的中点作为 **`uThresh[0..K−2]`**。
- **排序噪声升序** → 低噪声端分给的顶点数为 band0 → **展示顺序第 0 个 genre**（列表首位，φ 衰减下**面积最大**）→ **最低台面**；随噪声升高依次为 genre1、genre2… → **逐级增高**。
- **颜色与地形分界**：同一 **`vNoise`**、同一套 **`uThresh`**；片元用 **`step`** 形成离散 **`bandIdx`**，与顶点 **`level`**（smoothstep）在阈值处对齐为同一套分界逻辑。

### 2.3 定稿参数（用户验收）

经控制台对比，**正式默认**：

| Uniform | 定稿值 | 说明 |
|---------|--------|------|
| **uStepHeight** | **0.03** | 单位球上相邻 band 之间一级台阶高度；世界尺度再乘 `worldRadius` 与 `level`。 |
| **uStepSmoothness** | **0.01** | 噪声域 smoothstep 过渡半宽；**0** 时边界更硬。 |

以上已写入 `planet.ts` 材质初始值，并与 Storybook `planetStepHeight` / `planetStepSmoothness` 默认 args 一致。

### 2.4 球面细分（detail）

- **`detail = 8`**（由 `6` 提升），显著改善台阶与轮廓观感；代价为顶点数约按档 **×4** 增长，CPU FBM + `sort()` 随顶点数增加（参见同期工程评估结论）。

### 2.5 包围球与 focus 交互

- **`handle.lastRadius`**（及 `scene.ts` 每帧 `syncSelectionPlanetWorldScale`）：  
  **`lastRadius = r × (1 + uCutCount × uStepHeight)`**，其中 **`r`** 为 `resolveSelectionWorldRadius` 给出的 focus 球世界半径。
- 修改 **`uStepHeight`** 时，控制台 **`window.__planetTerrace`** 的 setter 会触发 **`syncSelectionPlanetWorldScale()`**，保证拾取/Tooltip 半径与当前挤出一致。

---

## 3. 实现摘要

### 3.1 CPU（`planet.ts`）

- 泛化 **`bandCountsLrm(N, proportions[])`**、**`thresholdsFromSortedBands(sorted, counts[])`**、**`areaProportionsK(K, x)`**。
- 写入 **`uBandCount`**、**`uCutCount`**、**`uThresh`**（长度 7，未用槽位填 **2.0** 以免参与 [0,1] 噪声的 step/smoothstep）。
- 保留 **`recomputeNoiseAndThresholds(movieId)`**：仍仅在 **`setFromMovie`** / **`syncCpuNoiseFromUniforms`**（Leva 改 `uScale` / octaves / persistence / `uAreaRatio`）时跑满顶点；**不**因仅改 `uStepHeight`/`uStepSmoothness` 重算噪声（Storybook 中已拆 `useEffect`）。

### 3.2 顶点着色器（`perlin.vert.glsl`）

- 输出 **`vNoise`**、**`vWorldPos`**、**`vLevel`**（为后续 P11.4 预留世界坐标）。
- 按 **`uCutCount`** 掩码启用前若干 **`smoothstep(uThresh[i] ± uStepSmoothness, n)`** 并累加为 **`level`**。

### 3.3 片元着色器（`perlin.frag.glsl`）

- **`bandIdx`** = 对 **`uThresh[i]`** 的 **`step`** 之和（与「跨过第几个阈值」一致）。
- **`vec3 uColors[8]`** 按 **`bandIdx`** 分段混合（硬边）；与计划中的 P11.4「OKLab + Lambert」尚未衔接。

### 3.4 控制台调试（`scene.ts`）

- **`window.__planetTerrace`**：`stepHeight` / `stepSmoothness` 读写材质 uniform；setter 将值 **clamp 到 [0, 0.25]**；**`log()`** 打印当前 `uStepHeight`、`uStepSmoothness`、`uBandCount`、`uCutCount`。
- 场景 **`dispose`** 时删除 **`__planetTerrace`**，避免泄漏。

---

## 4. 涉及文件清单

| 文件 | 变更要点 |
|------|----------|
| `frontend/src/three/planet.ts` | K 带分带、uniform 数组、`detail=8`、定稿 **0.03 / 0.01**、`PLANET_MAX_BANDS` |
| `frontend/src/three/shaders/perlin.vert.glsl` | 阶梯位移、`uThresh[7]`、`uCutCount`、`uStepHeight`、`uStepSmoothness` |
| `frontend/src/three/shaders/perlin.frag.glsl` | `uColors[8]`、`bandIdx`、`uThresh`/`uCutCount` |
| `frontend/src/three/scene.ts` | `lastRadius` 公式、`__planetTerrace` |
| `frontend/src/storybook/GalaxyThreeLayerLab.stories.tsx` | Perlin 台阶默认与控件范围（与定稿一致） |
| `frontend/src/storybook/GalaxyThreeLayerLabCore.tsx` | `planetStepHeight` / `planetStepSmoothness` 同步至材质 |
| `frontend/src/storybook/GalaxyThreeLayerLabLevaHost.tsx` | Leva 暴露同上（dev Storybook） |

---

## 5. 验收建议（P11.3 本条）

1. **多 genre 片**：可见 **K 档**高度（或 K=1 时平坦）；**genre 列表顺序首位** 对应 **最低** 区域。  
2. **定稿 0.03 / 0.01**：默认进入 focus 即该视觉，且无异常穿 near。  
3. **`__planetTerrace.log()`**：在选中/focus 球可见时，`uBandCount`/`uCutCount` 与预期 genre 数一致。  
4. **性能**：`detail=8` 下选片或改 CPU 噪声参数时若帧率或卡顿明显，可在此报告结论基础上再评估降 detail 或异步分帧（非本次代码范围）。

---

## 6. 后续条目（非 P11.3）

- **P11.4**：片元 **`dFdx`/`dFdy`** 法线、`vote_average`→L、Lambert 等（计划文档已有）。  
- **P11.5**：Perlin 材质不透明化、`alphaTest`、与 z-fight/renderOrder 的协调。  
- **P11.6**：focus 拾取优先 Perlin 球等。

---

## 7. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-04-28 | 初稿：汇总 P11.3 实施决策、定稿参数 **uStepHeight=0.03**、**uStepSmoothness=0.01**、**detail=8**、动态 K 带与 `__planetTerrace` |
