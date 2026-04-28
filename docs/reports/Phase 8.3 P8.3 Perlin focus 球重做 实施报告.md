# Phase 8.3 · P8.3 Perlin focus 球重做 — 实施报告

> 对应 [Phase 8 计划](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md) 中 **P8.3**（`p83-perlin-redo`）：detail=6 二十面体近似球、`movie.id` 确定性 PRNG + **CPU** Simplex FBM、排序分位 **四阈值** 四色带、**`uAreaRatio`**（几何面积比）与 Leva 面板；focus 层与宏观 Points 的 **OKLab 逆变换** 对齐；npm workspace 下 Vite 开发依赖解析修复；验收后 Perlin 片元改为 **硬分区**（无阈值软边、无 rim 渐变）。  
> **分支**：`p8.3-perlin-focus`。  
> **日期**：2026-04-27。

---

## 1. 目标回顾

| 计划项 | 完成情况 |
|--------|----------|
| `IcosahedronGeometry(1, 6)`，`position`/`normal` `StaticDrawUsage` | **已完成** |
| `xmur3(String(id))` → `mulberry32` → `simplex-noise` `createNoise3D` | **已完成**（`frontend` 依赖 `simplex-noise@4`） |
| CPU：逐顶点噪声 → 排序 → 目标占比 `[1,x,x²,x³]`（`x=uAreaRatio`，默认 `1/φ`）→ 四阈值与面积校验日志 | **已完成** |
| 片元：`uColor0..3`、`uThresh1..4`，计划中的 step/smoothstep；后续按产品反馈改为 **纯 step** | **已完成**（见 §5） |
| `uAreaRatio` 暴露为 uniform，Storybook Leva | **已完成** |
| focus 纹理与 **P8.1 hue + 定稿 L/C** 一致、无系统性色相偏绿 | **已完成**（`genreHue.ts` OKLab 逆变换修正，见 §4） |

---

## 2. 交付物清单

| 类型 | 路径 | 说明 |
|------|------|------|
| Focus 星球逻辑 | [`frontend/src/three/planet.ts`](../../frontend/src/three/planet.ts) | detail=6；`aNoise` buffer；CPU FBM（与旧 GPU FBM 参数语义对齐：`uScale`/`uOctaves`/`uPersistence`）；最大余数法分配四带顶点数；排序数组上 **中点阈值**；`console.assert` / `console.log`（目标 `p`、分配占比、硬边界计数 L1）；`syncCpuNoiseFromUniforms()` 供 Leva 改参后重算 |
| 顶点着色器 | [`frontend/src/three/shaders/perlin.vert.glsl`](../../frontend/src/three/shaders/perlin.vert.glsl) | 仅传递 **`vNoise`**（已移除未使用的 `vObjPos`/`vNormal`） |
| 片元着色器 | [`frontend/src/three/shaders/perlin.frag.glsl`](../../frontend/src/three/shaders/perlin.frag.glsl) | **`step`** 四段硬着色；无 `smoothstep`、无 rim；`uThresh4` 仍由 CPU 写入（材质一致），片元逻辑仅依赖 `uThresh1..3` |
| Hue / OKLab（CPU） | [`frontend/src/utils/genreHue.ts`](../../frontend/src/utils/genreHue.ts) | `oklabToLinearSrgb` 中 **`m_`、`s_` 与 `l_` 一样做三次方**（与 `point.vert.glsl`、Python 导出一致），修复 focus 层黄绿偏色 |
| 测试 | [`frontend/src/utils/genreHue.test.ts`](../../frontend/src/utils/genreHue.test.ts) | 更新 `pointColorFromHueVote` 金值（逆变换修正后数值变化） |
| Vite | [`frontend/vite.config.ts`](../../frontend/vite.config.ts) | **`react` / `react-dom` / jsx-runtime / client** alias 指向仓库根 `node_modules`，消除 workspace 提升后 **`frontend/node_modules/react-dom` ENOENT** |
| Storybook | [`GalaxyThreeLayerLabCore.tsx`](../../frontend/src/storybook/GalaxyThreeLayerLabCore.tsx)、[`GalaxyThreeLayerLabLevaHost.tsx`](../../frontend/src/storybook/GalaxyThreeLayerLabLevaHost.tsx)、[`GalaxyThreeLayerLab.stories.tsx`](../../frontend/src/storybook/GalaxyThreeLayerLab.stories.tsx) | **`planetThreshold` → `planetAreaRatio`**；宏观 uniform 与 Perlin 重算 **拆成两个 `useEffect`**，避免拖 `zCurrent` 时重复 ~40k 顶点 CPU 算噪声 |
| 场景循环 | [`frontend/src/three/scene.ts`](../../frontend/src/three/scene.ts) | 移除对已删除 **`uTime`** uniform 的写入（纹理改为静态确定性） |
| 依赖 | [`frontend/package.json`](../../frontend/package.json)、根 [`package-lock.json`](../../package-lock.json) | 增加 **`simplex-noise`** |

---

## 3. 算法与数据流（摘要）

1. **种子**：`String(movie.id)` → `xmur3` → 首 uint32 → `mulberry32` → `[0,1)` 流 → `createNoise3D(rng)`。同一部电影多次 `setFromMovie` 得到相同噪声场。
2. **顶点噪声**：对象空间顶点 **单位球** 上，按 `uScale`、`uOctaves`、`uPersistence` 做与原先片元 FBM 等价的 **CPU** 累加，归一化到 `[0,1]`，写入 **`aNoise`**。
3. **四带面积**：权重比例 `∝ [1, x, x², x³]`，`x = uAreaRatio`，归一化得到目标 `p0..p3`；对顶点数 `N` 做 **最大余数法** 得到整数带长 `n0..n3`，和为 `N`。
4. **阈值**：对排序后的噪声数组，在带间边界取 **相邻元素中点** 得到 `t1、t2、t3`，并取最大值作为 `t4`（材质统一）；断言单调性；统计「硬 `< t`」计数与分配的差异（要求 **L1 &lt; 0.005**）。
5. **着色**：CPU 写入 `uThresh*`；片元用 **`step`** 选四色之一（见 §5）。

---

## 4. OKLab 逆变换修正（focus / CPU 与 GPU 对齐）

历史问题：`genreHue.ts` 中 `oklabTo_linear_srgb` 对 **`m_`、`s_` 误用平方**，而 **`l_` 为立方**，导致与 `point.vert.glsl` 不一致，宏观 Points 正确、**focus `pipelineRingSrgb01` 偏黄绿**。  
修正为 **`m = m_³`、`s = s_³`** 后，与顶点着色器及 Python 参考一致；Vitest 中 **`pointColorFromHueVote`** 金值已更新。

---

## 5. Perlin「无渐变」产品结论

- **第一版**：片元使用 **`smoothstep`** 软化阈值边界，并带 **rim** 高光 → 视觉上存在带状混合与球面明暗渐变。
- **定稿（用户通过）**：去掉 **`smoothstep`** 与 **rim**，仅用 **`step`** 做四段硬分区；阈值处无颜色混合。  
- **说明**：`vNoise` 仍为顶点属性 **线性插值**，极粗网格时对角线附近可能仍有极窄过渡；若未来要求片元级常数噪声，需在 **WebGL2 + GLSL3** 下考虑 **`flat` varying** 或片元侧重算噪声（本报告未实施）。

---

## 6. 验收记录（本仓库执行）

| 检查项 | 结果 |
|--------|------|
| `npm run build`（`frontend`） | **通过** |
| `npm test`（`frontend`，含 `genreHue` / `loadGalaxyData`） | **通过** |
| Storybook `GalaxyThreeLayerLab` + dev Leva（Perlin 旋钮、`planetAreaRatio`） | **人工通过**（本步交付范围内） |
| Phase 8 计划中的 **fps ≥ P8.0×95%**（focus 片段） | **未在本报告中填数**；建议在定型机器上补一次 Performance 录制后记入 [Phase 8 基线](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) 附录 |

---

## 7. Git 提交索引（`p8.3-perlin-focus`）

| Commit | 摘要 |
|--------|------|
| `55e0a6f` | feat(p8.3): Perlin focus sphere — Icosahedron detail 6, CPU simplex FBM, quantile bands |
| `48c37b8` | fix(vite): resolve react/react-dom from workspace root for dev optimizer |
| `1146e08` | fix(genreHue): OKLab inverse cubes m_/s_ (focus ring + CPU path match point.vert) |
| `4c1a10d` | fix(perlin): hard step banding, remove smoothstep and rim gradient |

---

## 8. 后续依赖（计划内）

- **P8.4**：双 InstancedMesh（idle/active）与 focus Perlin 球 **`renderOrder`**、拾取、`gl_InstanceID` 等；本步 Perlin 几何与着色语义作为 focus 独立 mesh 基线。
- **文档同步**：按 Phase 8 节奏，将 **`uAreaRatio` 默认值**、四带硬分区行为、OKLab CPU 路径与 **`point.vert`** 一致性 回写 **Tech Spec / 视觉参数总表**（可在合入 `main` 与用户定稿后执行）。

---

## 9. 引用

- [Phase 8 视觉升级计划（含 P8.3 原文）](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md)  
- [星球状态机 spec](../project_docs/星球状态机%20spec.md)（focus 仍为独立 Perlin mesh，与本步一致）
