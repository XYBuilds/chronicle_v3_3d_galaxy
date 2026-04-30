# Phase 13.5 — focus 态 size / L 参照 实施报告

**范围**：P13.5（`phase_13_focus_experience` 子项「focus 态 size/L 参照组件」）  
**日期**：2026-04-30  
**状态**：代码已落地；本报告汇总**最终定稿**的产品与技术决策及工程操作（含迭代过程中的取舍收口）。

---

## 1. 目标（与计划对齐）

在 **film focus** 下为用户提供两组只读参照：

1. **Size 参照**：与 Perlin 球同心的多档 `vote_count` 圆环，半径与管线 `size` → 壳半径公式一致，随 focus 进出显隐。
2. **L 参照**：在 HUD 上解释当前焦点星的 **OKLab L / 评分** 语义，与星系 shader P10.1 路径一致。

不动数据契约；不新增后端。

---

## 2. 最终决策总表

| 主题 | 决策 |
|------|------|
| Size 半径来源 | 与 `export_galaxy_json.py` 一致：`log10(vote_count+1)` 在**当前已加载 `movies[]`** 上的 `min/max` 线性映射到 `size`（默认 `size_min=2`、`size_max=25`），再乘 `uSizeScale * uActiveSizeMul` 得到与 InstancedMesh / Perlin **底壳**一致的世界半径。 |
| Size 档位 | 固定五档：`10 / 100 / 1k / 10k / 100k`（`FOCUS_VOTE_REFERENCE_TIERS`）。 |
| 超过某档时 | 若当前电影 `vote_count` **大于**该档阈值，则**隐藏**该档圆环及对应标注（避免低票片外圈仍显示高票参照）。 |
| 圆环线宽 | **世界空间绝对线宽** `RING_STROKE_WORLD`：每帧用 `RingGeometry(max(ε,r−stroke/2), r+stroke/2)`，`mesh.scale=1`；仅当 `r` 变化超过 `RING_GEOMETRY_R_EPS` 时重建几何。 |
| 圆环平面姿态 | 由 `movieId` 种子生成稳定四元数 `seededRingPlaneQuaternion(movieId)`，同一电影跨刷新角度一致。 |
| 标注位置 | 与五档共用同一方位角 `sharedLabelAzimuth`（`movieId` 种子）；径向距离 = **外半径** `r + stroke/2` + `LABEL_OUTSIDE_GAP_WORLD`。 |
| 标注朝向 | **`THREE.Sprite`**，引擎 billboard，**始终朝向观众**（不再使用圆环平面内 Mesh 的切向排字方案）。 |
| 标注文案（当前仓库） | 五档英文全称：`10 votes` … `100,000 votes`（与 `TIER_LABEL_TEXTS` 一致；若后续改回「10ⁿ Votes」仅改常量表即可）。 |
| 标注字体 | Canvas：`font-weight: 100` + `LABEL_UI_FONT_STACK`（与 Tailwind `font-sans` 栈对齐）；`LABEL_CANVAS_FONT_PX` 当前 **32**。 |
| L 数据来源 | `scene` 在 focus 相关阶段将 galaxy shader 的 P10.1 + `uChroma` 写入 `focusLightnessSnap`（JSON 字符串节流，避免每帧 setState）。 |
| L 标题 | `Rating = {vote_average.toFixed(1)}`。 |
| L spectrum | **10 条等宽色带**；每档颜色为 `voteNorm = (k+0.5)/10`（即评分 **0.5, 1.5, …, 9.5**）走 `srgb01FromHueAndVoteNorm`，与顶点 shader 中 `voteNorm = vote_average/10` 语义一致。 |
| L 指针 | **线性**：`clamp(vote_average/10,0,1) * 100%`，支持非整数评分。 |
| L 视觉 | **无**圆角、**无**边框、**无**两端 0/10 刻度字、**无** shadow（条与指针均无）。 |
| L 布局位置 | 固定于视口偏下：`top-[min(70vh,calc(50%+11rem))] sm:top-[68vh]`（避免与 Perlin / 搜索条重叠；可再调 Tailwind）。 |
| Perlin L 单点真源 | `planet.ts` 中 Perlin 的 L 改为调用 `@/lib/colorMath` 的 `lightnessFromVoteAverage`，与 HUD 共用同一套 P10.1 公式。 |

---

## 3. 工程操作（新增 / 修改文件）

| 路径 | 作用 |
|------|------|
| `frontend/src/lib/colorMath.ts` | P10.1 `voteNorm`→L、`vote_average`→L、`oklab→sRGB`、`srgb01FromHueAndVoteNorm`、`srgb01ToCss` 等，供 HUD 与测试。 |
| `frontend/src/lib/galaxyVoteSize.ts` | 管线 `vote_count→size`、五档、`focusShellRadiiForVoteTiers` 及断言单调。 |
| `frontend/src/lib/colorMath.spec.ts` / `galaxyVoteSize.spec.ts` | Vitest：L 单调、`normalizedLBlendT` 与 L 混色因子一致、档位半径递增等。 |
| `frontend/src/three/FocusSizeReferenceRings.ts` | 五环 + Sprite 标注 + `createFocusSizeReferenceRings` / `seededRingPlaneQuaternion`。 |
| `frontend/src/three/scene.ts` | 挂载 `sizeRings.group`；tick 内 `update`（`pivotWorld`、`movieId`、`voteCount`、`opacity`、`uSizeScale`、`uActiveSizeMul`）；`dispose`；写入 `focusLightnessSnap`。 |
| `frontend/src/three/planet.ts` | Perlin L 使用 `lightnessFromVoteAverage`。 |
| `frontend/src/store/galaxyInteractionStore.ts` | `FocusLightnessSnap` + `focusLightnessSnap`。 |
| `frontend/src/hud/FocusLReference.tsx` | 标题 + 10 档色条 + 指针。 |
| `frontend/src/App.tsx` | 挂载 `FocusLReference`。 |

---

## 4. Size 参照 — 可调参数（`FocusSizeReferenceRings.ts` 导出）

| 常量 | 含义（当前典型值） |
|------|---------------------|
| `RING_STROKE_WORLD` | 圆环世界空间线宽（**与 r 无关**）。当前 `0.001`。 |
| `RING_GEOMETRY_R_EPS` | `r` 变化阈值，低于则不重建 `RingGeometry`。 |
| `RING_INNER_RADIUS_FLOOR` | 内半径下限，防退化。 |
| `RING_OPACITY_BASE` | 圆环 alpha 系数，再乘 focus 淡出 `opacity`。 |
| `LABEL_CANVAS_FONT_PX` | 标注 Canvas 字号。当前 `32`。 |
| `LABEL_OUTSIDE_GAP_WORLD` | 标注中心相对外沿的径向间隙。当前 `0.006`。 |
| `LABEL_SPRITE_WORLD_HEIGHT` | Sprite 垂直世界尺寸下限，并与 `max(r*0.06, …)` 取大。当前 `0.028`。 |
| `LABEL_UI_FONT_STACK` | UI sans 字体栈。 |

---

## 5. L 参照 — 数据流

1. `mountGalaxyScene` 在 `selectionPhase` 为 selecting / selected / deselecting 且存在 pivot 电影时，从 `galaxy.idleMaterial.uniforms` 读取 `uLMin`、`uLMax`、`uHighRatingT`、`uHighTierTRangeScale`、`uLightnessRatingExponent`、`uChroma`，序列化为 JSON；与上一帧相同则**不写** store。
2. `FocusLReference` 订阅 `selectedMovieId` + `focusLightnessSnap`，用 `meta.genre_palette` 与 `genreHueForGenreName` / `genre_hue` 求主类型 hue。
3. 色带：`k=0..9`，`voteNorm=(k+0.5)/10` → `srgb01FromHueAndVoteNorm` → CSS `backgroundColor`。
4. 指针：`left: clamp(vote_average/10,0,1)*100%`。

---

## 6. 迭代中曾出现、**已收口或替换**的选项（备忘）

下列内容在对话中出现过，**最终代码未保留**或已替换，避免后人误读旧需求：

- 圆环标注曾用「10¹ Votes」上标、平面内 Mesh、沿切向、**屏幕最低点**方位角、相机背面翻转防镜像等——**当前**为 **Sprite + 种子固定方位角 + 永远朝向观众**。
- L 条曾用连续渐变、`normalizedLBlendT` 驱动指针、两端 0/10、圆角边框 shadow 等——**当前**为 **10 档半整数色带 + 线性指针 + 扁平无装饰**。

若产品要恢复其中某一行为，应在本报告 §2 更新决策表后再改代码。

---

## 7. 验证

- `frontend`：`npm test`（含 `colorMath` / `galaxyVoteSize` spec）、`npm run build` 在交付链路上通过。
- 手测建议：进入 focus → 核对五环与 Perlin 尺度、高票隐藏外圈、换片种子角度、L 标题与指针与 Drawer 评分一致。

---

## 8. 与后续 Phase 的关系

- **P13.6 / P13.7**：搜索 X、默认 alpha、文档与基线 fps 等**不在**本报告范围；若改动 `focusLightnessSnap` 写入频率或 L HUD 位置，建议在对应 Phase 报告中追加一行「依赖 P13.5」。

---

*本报告为 P13.5 实施与定稿的单一事实来源（SSOT）之一；与 `.cursor/plans/phase_13_focus_experience_ab016b85.plan.md` 中 P13.5 条目互补：计划描述意图，本报告描述**最终代码行为**。*
