# Phase 17.1（P17.1）— idle 遮挡修复与距离-L — 实施报告

> **范围**：仅 P17.1（Phase 17 子项）。将 idle 从半透明雾化层改为 **opaque + depthWrite**，修复同类透明排序导致的遮挡错乱；**下线**旧 P10.2 `uDistanceFalloffK` / `uDistanceFalloffMode` 对 idle/active **颜色与 alpha** 的参与；在 idle 顶点引入 **Z 轴距离-L**（`2/3` 幂次 + 上下限 clamp），`d0` 与运行时 **`zCamDistance`** 对齐。  
> **不动**：`galaxy_data.json` 契约、实例矩阵语义、active 层 P11.1 alpha 与 P16.3 双路径逻辑（仅去掉 P10.2 对 rgb 的乘子）。  
> **Hunt 色度衰减**：**不在本项**；由 **P17.2** 在 `oklab.glsl` + 各层 shader 接入。  
> **计划来源**：`.cursor/plans/phase_17_visual_system_upgrade_e8b64dbb.plan.md`（§「P17.1 idle 遮挡修复 + 距离-L」）  
> **Git 分支**：`phase/p17-1-idle-depth-distance-l`  
> **Git 提交**：`01aa592`（`feat(p17.1): idle opaque depth + Z-axis distance-L; remove P10.2 falloff`）

---

## 1. 目标与边界（计划对齐）

| 计划项 | 最终处理 |
|--------|----------|
| idle 材质 `transparent=false` / `depthWrite=true` / `depthTest=true` | **已实现**（`galaxyMeshes.ts` `idleMaterial`） |
| idle 片元 **不再**用 alpha 表达远近；`alpha = 1.0` | **已实现**（`galaxyIdle.frag.glsl`） |
| 移除 P10.2 对 idle/active **颜色或 alpha** 的参与 | **已实现**：删除 `uDistanceFalloffK`、`uDistanceFalloffMode`、`vDistFalloff`；active.frag 不再乘 falloff |
| 新增距离-L：`L_distance = L_star × clamp(pow(d0/d, 2/3), L_floor, 1.0)` | **已实现**（仅 **idle** `galaxyIdle.vert.glsl`） |
| `d0` 取 **`uZCamDistance`**（非数学 0）；`d` 为 **Z 轴相机距离** | **已实现**：`d = \|aZ - (uZCurrent - uZCamDistance)\|` |
| `scene.ts` 每帧同步 `uZCamDistance` 与 store `zCamDistance` | **已实现** |
| P11.2 乘子保留；**默认等价关闭**（为 Hunt 让路） | **已实现**：`uFocusDimChroma` 默认 **1.0**（原为 0.7） |
| Storybook / Leva 与 `__galaxyColor` 调试桥 | **已迁移**：P10.2 旋钮移除，改为 P17.1 参数 |

---

## 2. 最终决策（设计 / 数学）

### 2.1 为何下线 idle 半透明 + P10.2

- **决策**：idle **彻底退出**片元 alpha 语义；**不再**使用 `vInFocus` 驱动 alpha；**不再**使用 P10.2 的 `vDistFalloff` 乘 rgb 或配合高 alpha 的 Bloom 互斥路径。  
- **原因**（与计划 D8、D4 一致）：同类半透明 instancing 的排序无法保证「近遮远」，易出现 **远盖近**；远处明暗改由 **OKLab L** 的距离修正表达，与后续 **Hunt**（P17.2）分层一致。  
- **代价**（计划已明示）：idle 叠层雾感减弱、窗缘软边可能变硬；**不**通过恢复 idle alpha 修窗缘，优先调 `uBgSizeMul` / `uDistanceLightnessFloor` /（P17.2 后）`uHuntGamma`。

### 2.2 Z 轴距离 d 与参考面 d0（定稿）

- **`aZ`**：`instanceMatrix[3][2]`，世界 Z（decimal year）。  
- **相机宏观站位**（与 Phase 5.1.5 一致）：`camera.position.z = zCurrent - zCamDistance`，故 **观测参考世界 Z** 取 **`camPlaneZ = uZCurrent - uZCamDistance`**。  
- **参考距离**：`d0 = max(uZCamDistance, 10⁻³)`，避免 `d0=0` 导致全体 `L→0`。  
- **样本距离**：`d = max(|aZ - camPlaneZ|, 10⁻³)`。  
  - 当 `aZ == camPlaneZ` 时 `d == d0`（在 ε 意义下），**`distanceMul == 1`**，`L_distance == L_star`，与「当前观测平面亮度对齐 Phase 16 vote-L 基线」一致。  
- **不采用**全欧氏距离：避免同 Z 平面内屏幕边缘粒子因 XY 距相机更远而被额外压暗（计划 D10）。

### 2.3 距离-L 公式（定稿）

在 idle 顶点（vote → P10.1 得 `L_star` 之后）：

```text
distanceMul = clamp( (d0 / d)^(2/3), uDistanceLightnessFloor, 1.0 )
L_distance   = L_star × distanceMul
```

- **指数 `2/3`**：计划锁定，远处变暗较柔和。  
- **`uDistanceLightnessFloor`**：防止 `d < d0` 时 `pow > 1` 把 L 拉得高于 `L_star`；默认 **0.08**（源码初值，可 Leva / `__galaxyColor.distanceLightnessFloor` 扫参）。

### 2.4 P11.2 与 P17.2 的衔接

- **本项**：P11.2 **uniform 与分支保留**，在 `L_distance` 与 `C_base` 上继续可乘 `uFocusDimL` / `uFocusDimChroma`。  
- **默认**：`uFocusDimChroma = 1.0`、`uFocusDimL = 1.0` → **不改变** `L_distance` / `C`，避免与尚未接入的 Hunt 双重压暗/降饱和。  
- **P17.2**：在 `L_distance` 上接 Hunt；P11.2 仍可作调试乘子。

### 2.5 Active 层与 P10.2

- **决策**：active **不再**将 `vDistFalloff` 乘入 rgb；片元为 **`vec4(vColor, vFocusAlphaMult)`**。  
- **原因**：计划要求 P10.2 **不得**再参与 active 颜色；远处语义统一交给 idle 距离-L + 后续 Hunt；active 仍以 **alpha** 表达 focus 非目标衰减（P11.1）。

---

## 3. Uniform 与材质定稿表

| 名称 | 默认值 | 说明 |
|------|--------|------|
| `uZCamDistance` | **30** | 与 `galaxyInteractionStore.zCamDistance` 初值一致；每帧由 `scene.ts` 写入 |
| `uDistanceLightnessFloor` | **0.08** | `distanceMul` 下界 |
| `uFocusDimChroma` | **1.0**（本项从 0.7 调整） | P11.2 默认关闭 |
| `idleMaterial.transparent` | **false** | — |
| `idleMaterial.depthWrite` | **true** | — |
| `idleMaterial.depthTest` | **true** | — |
| ~~`uDistanceFalloffK`~~ | — | **已删除** |
| ~~`uDistanceFalloffMode`~~ | — | **已删除** |

---

## 4. 工程操作清单（文件级）

| 文件 | 操作摘要 |
|------|----------|
| `frontend/src/three/galaxyMeshes.ts` | 删除 P10.2 两 uniform；新增 `uZCamDistance`、`uDistanceLightnessFloor`；idle 材质改 opaque + depthWrite；断言 `uZCamDistance > 0`、`uDistanceLightnessFloor ∈ (0,1]`；启动 `console.log` 含 P17.1 字段 |
| `frontend/src/three/shaders/galaxyIdle.vert.glsl` | 距离-L；去掉 `vDistFalloff` / `vInFocus` varying；P11.2 作用于 `L_distance` |
| `frontend/src/three/shaders/galaxyIdle.frag.glsl` | 纯 `vec4(vColor, 1.0)` |
| `frontend/src/three/shaders/galaxyActive.vert.glsl` | 删除 `uDistanceFalloffK` 与 `vDistFalloff` |
| `frontend/src/three/shaders/galaxyActive.frag.glsl` | 删除 falloff；`gl_FragColor = vec4(vColor, vFocusAlphaMult)` |
| `frontend/src/three/scene.ts` | 挂载时与 RAF 内 `uZCamDistance.value = st.zCamDistance`；`GalaxyColorDebug` 用 `distanceLightnessFloor` 替代 P10.2 两字段；`log()` 更新；注释 P16.3 与 idle opaque 关系 |
| `frontend/src/storybook/GalaxyThreeLayerLabCore.tsx` | Props：`uZCamDistance`、`uDistanceLightnessFloor`；同步 uniform + `setState({ zCamDistance })` |
| `frontend/src/storybook/GalaxyThreeLayerLabLevaHost.tsx` | Leva 替换为 P17.1 两项 |
| `frontend/src/storybook/GalaxyThreeLayerLab.stories.tsx` | `args` / `argTypes` 与默认 `uFocusDimChroma: 1.0` |

**自动化验证（实施时）**：`frontend` 下 `npm run build`、`npm run test`（Vitest）均已通过。

---

## 5. 调试与运行时契约

| 入口 | 行为 |
|------|------|
| `window.__galaxyInteraction.zCamDistance` | 与宏观相机一致；修改后下一帧写入 `uZCamDistance` |
| `window.__galaxyColor.distanceLightnessFloor` | 读写 `uDistanceLightnessFloor`（setter 内 `clamp(0.02, 1)`） |
| `window.__galaxyColor.log()` | 单行摘要含 P17.1 floor；**不再**含 P10.2 |

---

## 6. 视觉验收清单（与计划 §验收 一致）

以下建议 **合并前手测**（主应用 + 必要时 Storybook `GalaxyThreeLayerLab`）：

1. **idle 密集区**：近处 idle **遮挡**远处 idle，无明显「远盖近」。  
2. **材质语义**：idle **alpha 恒为 1**；opaque + depthWrite（可用帧调试 / 截图确认）。  
3. **观测面**：`aZ ≈ zCurrent` 附近亮度与 Phase 16 **vote-L 基线接近**；沿 Z 远离观测面时 **仅 L 变暗**，饱和度变化 **留待 P17.2 Hunt** 验收。  
4. **search / focus**：P16.3 active 双路径不回退；idle 不透明后 **active 高亮仍可读**；注意前景 idle 写深度后 **可能遮挡后方 active**——若可读性下降，**先**调 `uBgSizeMul` / `uDistanceLightnessFloor`（及后续 `uHuntGamma`），**不**恢复 idle alpha。  
5. **窗缘过硬**：同上扫参；**不**恢复 idle alpha。

---

## 7. 与后续子项关系

| 子项 | 依赖本项 |
|------|----------|
| **P17.2 Hunt** | idle 已产出稳定 `L_distance`；在 `C` 上接 `applyHuntChroma` |
| **P17.3 Dolly** | 本项已每帧同步 `uZCamDistance`；dolly 改 `zCamDistance` 后距离-L **自动**与 `d0` 一致 |
| **P17.4 文档收口** | 《视觉参数总表》等若仍写「P10.2 uniform 可暂留 deprecated」，与 **代码已完全删除** 两 uniform 的事实需在 P17.4 **对齐** |

---

## 8. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-05-03 | 首版实施报告：对应提交 `01aa592`、分支 `phase/p17-1-idle-depth-distance-l` |
