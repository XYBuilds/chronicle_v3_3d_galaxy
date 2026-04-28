# Phase 11.4（P11.4）— Perlin 法线重构、vote→L、genre 色与光照定稿 — 实施报告

> **范围**：focus 态 Perlin 球的 **片元侧法线重构**（`dFdx`/`dFdy` + 与几何法线混合）、**OKLab 极坐标上色**（与星系 idle/active 一致的 **L + C + hue**）、**vote_average→L**（与 `galaxyIdle.vert.glsl` P10.1 同公式）；**不含** P11.5 不透明化与拾取分流（P11.6）。  
> **主文件**：`frontend/src/three/planet.ts`、`frontend/src/three/shaders/perlin.vert.glsl`、`frontend/src/three/shaders/perlin.frag.glsl`、`frontend/src/three/scene.ts`、`frontend/src/utils/genreHue.ts`  
> **计划来源**：`.cursor/plans/phase_11_focus_visual_upgrade_b71acde5.plan.md`（P11.4 条目）  

---

## 1. 计划对齐摘要

| 原计划 P11.4 摘要 | 本次落地 |
|-------------------|----------|
| `perlin.frag` 重写：`dFdx`/`dFdy` 重构法线 + Lambert | **已实现**：见 §3.2 |
| `hue + uPerlinL + uPerlinChroma`，四档→八档 genre band | **已实现**：`uniform float uHue[8]`，分段逻辑随 `uCutCount` 最多 8 档 |
| `uPerlinL = mix(uLMin,uLMax,voteNorm)` 同源 P10.1 | **已实现**：CPU `computePerlinLFromVoteAverage`，快照来自 focus 入场时的星系共享 uniform（见 §2.2） |
| `uLightDir` / `uAmbient` / `uDiffuse` / `uFlatShadingMix` | **已实现并定稿**：见 §2.4 |

---

## 2. 最终决策（定稿）

### 2.1 色彩模型：OKLCH 语义 vs 实现载体

- **语义**：Perlin 与双网格共用 **OKLCH（L、C、h）**：片元中写 `a = C·cos(h)`、`b = C·sin(h)`，即 OKLab 平面上的 **极坐标**，与星系顶点着色一致。
- **显示**：帧缓冲仍为 **sRGB**，故 **`linear_to_srgb`**（伽马编码）不可避免；与「全链路不在 shader 里写 OKLab」并不矛盾——写的是 **L/C/h**，最后一步才是编码到显示器。

### 2.2 vote_average → `uPerlinL`

- **输入**：`vote_average`，先映射为 `t = clamp(vote_average / 10, 0, 1)`。
- **公式**：与 **`galaxyIdle.vert.glsl`** 一致——`tCompressed`、`pow(..., uLightnessRatingExponent)`、`mix(uLMin, uLMax, tPow)`。
- **快照**：在 **`scene.ts`** 的 `beginSelect` 内，从 **`galaxy.idleMaterial.uniforms`** 读取当前 **uLMin、uLMax、uHighRatingT、uHighTierTRangeScale、uLightnessRatingExponent、uChroma**，传入 **`planet.setFromMovie(..., galaxyColor)`**，保证 focus 入场一刻与星系全局旋钮一致。

### 2.3 Chroma

- **`uPerlinChroma`**：入场时同步为快照中的 **`uChroma`**（星系共享 uniform）。

### 2.4 Perlin 光照（用户验收定稿）

以下为 **`planet.ts`** 材质 **初始值**（运行时仍可通过 `window.__planetTerrace` 覆盖部分项，见 §3.4）。

| Uniform | 定稿值 | 说明 |
|---------|--------|------|
| **uLightDir** | **`normalize(vec3(0.5, 0.5, -0.1))`**（世界空间） | 约 **(0.700, 0.700, -0.140)** |
| **uAmbient** | **0.95** | 环境项，避免低分片整体发灰死黑 |
| **uDiffuse** | **0.55** | 漫反射系数，与 ambient 一起构成 `lit = base × (ambient + diffuse × lambert)` |
| **uFlatShadingMix** | **0.8** | **几何法线**与 **屏幕导数法线**的混合；`1` 为纯导数法线 |

着色方程（片元）：**`lit = baseCol × (uAmbient + uDiffuse × max(dot(N, normalize(uLightDir)), 0))`**。

### 2.5 Genre 色相来源

| 场景 | 策略 |
|------|------|
| **主 genre**（`movie.genres` 中首个非空字符串）且 **`movie.genre_hue` 存在** | **直接使用 `movie.genre_hue`（弧度）**，与导出管线主 genre 一致 |
| **其余 genre 档** | **`genreHueForGenreName(g, palette, fbHue)`**：palette key 顺序为 **`Object.keys(palette).sort()`**，与 Python **`sorted(found)`** 一致 |
| **无 palette 命中等** | **`fbHue`**：`movie.genre_hue ?? hueFromGenreColor(movie.genre_color)` |

**说明**：JSON 每片仅一个 **`genre_hue`**（主 genre）；多档分带时除主档外仍必须用 palette 推导 hue，无法仅凭单个标量覆盖所有档。

---

## 3. 实现摘要

### 3.1 顶点（`perlin.vert.glsl`）

- 输出 **`vWorldPos`**（位移后世界坐标）、**`vGeomNormalWorld`**（未位移前的法线在世界的方向，供与导数法线混合及朝向校正）。
- 延续 P11.3：**`level`** 累加 smoothstep，沿法线位移。

### 3.2 片元（`perlin.frag.glsl`）

- **`hueToOkSrgb`**：`vec3(L, C·cos(h), C·sin(h))` → `oklab_to_linear_srgb` → **`clamp` 线性 RGB 到 [0,1]** → `linear_to_srgb`。  
  - **原因**：低 **L**、固定 **C** 时部分 hue 会落在可显示 sRGB 色域外；若不对线性 RGB clamp，负分量进入 `pow()` 伽马会产生未定义/NaN，表现为脏色（例如整体偏绿）。
- **法线**：`normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)))`，与 **`vGeomNormalWorld`** 点积校正朝向；再与几何法线按 **`uFlatShadingMix`** 混合。
- **分带**：按 **`bandIdx`**（与 P11.3 一致的阈值 step 逻辑）混合最多 8 档 **`uHue[i]`**。

### 3.3 CPU（`planet.ts`）

- **`PlanetGalaxyColorSnap`** + **`computePerlinLFromVoteAverage`**。
- **`uHue`**：`Float32Array(PLANET_MAX_BANDS)`，在 **`setFromMovie`** 中按 §2.5 写入。
- **`uMeshWorldPos`**：与 **`mesh.position`**（世界坐标球心）同步，供后续扩展或调试；当前片元主路径以导数法线为主。

### 3.4 控制台（`scene.ts`）

- **`window.__planetTerrace`** 扩展：**`flatShadingMix`、`perlinAmbient、perlinDiffuse、perlinLightDir`**；**`log()`** 输出含 **`uPerlinL`、`uPerlinChroma`** 与阶梯相关 uniform。

---

## 4. 缺陷修复记录（非计划正文但影响验收）

### 4.1 Palette 索引排序

- **问题**：曾用 **`localeCompare`** 对 palette key 排序，与 Python **`sorted()`** / JS **`.sort()`** 不一致；典型表现为 **`TV Movie` 与 `Thriller` 顺序交换**，Perlin hue 与 HUD hex 错位。
- **修复**：统一使用 **`genreHueForGenreName`**（内部 **`Object.keys(palette).sort()`**）；并为 **`genreHueForGenreName`** 增加可选 **`fallbackHue`**，与 Perlin 的 **`fbHue`** 对齐。

### 4.2 色域与 NaN

- **问题**：低 **`uPerlinL`** + 固定 **`uPerlinChroma`** 时，线性 RGB 可为负，伽马路径不稳定。
- **修复**：片元 **`hueToOkSrgb`** 内在 **`linear_to_srgb`** 之前 **`clamp`** 线性 RGB（见 §3.2）。

---

## 5. 涉及文件清单

| 文件 | 变更性质 |
|------|----------|
| `frontend/src/three/shaders/perlin.frag.glsl` | P11.4 上色 + 法线 + Lambert + 线性域 clamp |
| `frontend/src/three/shaders/perlin.vert.glsl` | `vGeomNormalWorld` 等（续 P11.3） |
| `frontend/src/three/planet.ts` | `uHue`、`uPerlinL`、`uPerlinChroma`、光照定稿、主 genre→`genre_hue` |
| `frontend/src/three/scene.ts` | `setFromMovie` 传入 **`PlanetGalaxyColorSnap`**；**`__planetTerrace`** 照明调试 |
| `frontend/src/utils/genreHue.ts` | **`genreHueForGenreName(..., fallbackHue)`** |
| `frontend/src/utils/genreHue.test.ts` | **`TV Movie` / `Thriller` 顺序回归** |

---

## 6. 验收建议

1. **focus 进入**后 Perlin 球阶梯上有清晰明暗（可调 **`__planetTerrace.perlinDiffuse = 0`** 对照接近平涂）。
2. **主 genre** 与 **Drawer/TMDB** 主类型一致时，**最大面积档** hue 与 **`movie.genre_hue`** / 星系粒子一致（同一快照下）。
3. **低分片**（如 vote≈6）不出现整球脏绿或色相漂移；若仍偏暗，优先调 **`uAmbient`/`uDiffuse`**（已定稿表）或星系 **uLMin/uLMax**。
4. 控制台 **`[Planet]`** 日志可核对 **`uPerlinL`、`vote_avg`、genres 列表**。

---

## 7. 后续（未纳入本报告）

- **P11.5**：不透明材质、`alphaTest`、包围球与阶梯高度关系（见总计划）。
- **P11.6**：focus 态拾取优先 Perlin 球。

---

## 8. 关联文档回填（2026-04-29）

下列 **`docs/project_docs`** 已与 P11.4 实现对齐，供人类开发者与审阅对照（仍以 **Tech Spec**、**状态机 spec**、源码为准）：

| 文档 | 更新要点 |
|------|----------|
| [`视觉参数总表.md`](../project_docs/视觉参数总表.md) | §4 整节重写为 P11.3/P11.4；§8 增补 **`__planetTerrace`**；扫描基线日期与 Phase 编号 |
| [`TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) | §1.1 Focus Perlin 段落：`detail`、K 档阈值、P11.4 着色/光照；目录树 `planet.ts` 说明 |
| [`星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) | §3.4 focus 表（detail/色彩）；§3.5 K 档与 **`lastRadius`**；新增 **§3.5.1** P11.4；变更记录行 |

**计划**：`.cursor/plans/phase_11_focus_visual_upgrade_b71acde5.plan.md` 中 **P11.7** 仍保留 **pending**（Phase 8 基线 **fps 出口**等待录入）；**P11.4 相关 project_docs 回填**已完成。

---

*文档版本：与仓库 `frontend/src/three/planet.ts` 中 P11.4 定稿注释及 shader 行为一致；若仅改 Leva/控制台而未改默认材质，以运行时 uniform 为准。*
