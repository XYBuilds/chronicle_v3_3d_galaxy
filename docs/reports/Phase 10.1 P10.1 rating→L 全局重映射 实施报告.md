# Phase 10.1（P10.1）— `voteNorm` → OKLCH **L** 全局常数重映射 — 实施报告

> **范围**：仅 P10.1（Phase 10 子项）。在 idle / active **顶点着色器**中替换「线性 `voteNorm` → L」为：**分母固定 [0,1]（对应 vote 0–10）**、**高分段斜率压缩**、**幂次非线性**，再 `mix(uLMin, uLMax, …)`。  
> **不动**：`galaxy_data.json` 契约、实例属性名（`voteNorm` 仍为 `vote_average / 10`）、mesh 拓扑、片段着色器逻辑（P10.2 再动 frag）、Bloom 默认开关（P10.3）。  
> **计划来源**：`.cursor/plans/phase_10_global_remap_1b67de2d.plan.md`（§ P10.1）  
> **Git**：分支 `phase10/p10-1-rating-l-remap`，提交 `8bbf131`（`feat(P10.1): global rating-to-L remap with uniforms and Leva`）

---

## 1. 目标与边界（计划对齐）

| 计划项 | 最终处理 |
|--------|----------|
| idle / active.vert 替换 `L = mix(uLMin, uLMax, clamp(voteNorm,…))` 为 t 压缩 + pow + mix | **已实现**：两路 vert 公式一致 |
| 新增 uniform `uHighRatingT`、`uHighTierTRangeScale`、`uLightnessRatingExponent` | **已实现**：写入 `makeSharedUniforms`，与 idle/active 共享同一 bag |
| `uLMin` / `uLMax` 默认由 0.4 / 0.85 改为 0.2 / 1.0 | **已实现**（`galaxyMeshes.ts`） |
| leva 或等价调试入口暴露三档 | **已实现**：生产路径为 `window.__galaxyColor` 三字段；Vite dev 下 Storybook **`GalaxyThreeLayerLabLevaHost`** 增加 Leva 三项 + `uLMax` 上限 1.0 |
| P10.2 距离衰减、P10.3 Bloom 默认开、P10.4 文档出口 | **未在本子项实施**（按计划留待后续提交） |

---

## 2. 数学与参数定稿（最终决策）

### 2.1 输入语义（不变）

- **`voteNorm`**（per-instance attribute）：`clamp(vote_average / 10, 0, 1)`，在 `galaxyMeshes.ts` 的 `buildInstanceAttributes` 中写入；**不**使用 batch min/max，分母恒为 10。

### 2.2 GLSL 映射（定稿）

记 `t = clamp(voteNorm, 0.0, 1.0)`：

1. **高分段斜率压缩**（阈值与缩放由 uniform 驱动）  
   - 若 `t < uHighRatingT`：`tCompressed = t`  
   - 否则：`tCompressed = uHighRatingT + (t - uHighRatingT) * uHighTierTRangeScale`
2. **非线性**：`tPow = pow(tCompressed, uLightnessRatingExponent)`
3. **映射到 L**：`L = mix(uLMin, uLMax, tPow)`

与计划伪代码一致；`uHighRatingT ≈ 0.85` 对应约 **vote 8.5** 附近进入压缩段；`uHighTierTRangeScale = 0.4` 表示高分区间在 t 轴上被「拉长」的可调强度（越小压缩越强）。

### 2.3 Uniform 默认值（定稿）

| Uniform | 默认值 | 说明 |
|---------|--------|------|
| `uLMin` | **0.2** | OKLCH L 下限（计划建议 0.2） |
| `uLMax` | **1.0** | OKLCH L 上限（计划建议 1.0，便于与后续 Bloom 阈值配合） |
| `uHighRatingT` | **0.85** | 高分压缩起点（t 域） |
| `uHighTierTRangeScale` | **0.4** | 高于阈值段的斜率乘子 |
| `uLightnessRatingExponent` | **3.0** | 对压缩后 t 的幂次 |

**决策**：默认值与 Phase 10 计划文档一致；后续若 P10.3/P10.4 联调过亮，优先在 **Leva / `__galaxyColor`** 调 `uLMax` 或 Bloom 参数，而非静默改 shader 常量（除非版本备忘）。

---

## 3. 工程操作清单（文件级）

| 文件 | 操作摘要 |
|------|----------|
| `frontend/src/three/shaders/galaxyIdle.vert.glsl` | 声明三 uniform；替换 L 计算块 |
| `frontend/src/three/shaders/galaxyActive.vert.glsl` | 同上 |
| `frontend/src/three/galaxyMeshes.ts` | `makeSharedUniforms` 增三字段并改 `uLMin`/`uLMax`；`createGalaxyDualMeshes` 内 `console.assert` + `console.log`（P10.1 参数可见性） |
| `frontend/src/three/scene.ts` | 扩展 `GalaxyColorDebug` 与 `window.__galaxyColor`：`highRatingT`、`highTierTRangeScale`、`lightnessRatingExponent` 读写绑定上述 uniform；`log()` 输出扩展 |
| `frontend/src/storybook/GalaxyThreeLayerLabCore.tsx` | Props 增加三项；`useEffect` 同步到 `galaxyMaterial.uniforms` |
| `frontend/src/storybook/GalaxyThreeLayerLabLevaHost.tsx` | Leva 增加 P10.1 三滑条；`uLMax` 控件 max 改为 1.0；同步 `set` / `merged` |
| `frontend/src/storybook/GalaxyThreeLayerLab.stories.tsx` | 默认 args 与 argTypes 对齐新默认值与范围 |

**Git 流程（实施时约定）**：在 **`main` 之外**新建分支 `phase10/p10-1-rating-l-remap`，再提交；符合「先开分支再改」的要求。

---

## 4. 验证与验收

### 4.1 自动化

- 在 `frontend` 目录执行 **`npm run build`**（`tsc -b && vite build`）：**通过**（实施时记录）。

### 4.2 计划中的「人眼验收」项（留作对照，非自动化）

- 低分（vote_average 较低）粒子应 **相对更暗**（相对原线性 `voteNorm → L`）。  
- 高分密集区（约 8.0–9.5）不应 **全部挤到同一亮度**（依赖压缩 + 指数）。  
- 与 P10.3 Bloom 默认开启后的配合：计划在 P10.4 做截图与 fps 对照；**P10.1 单步**以 shader 与 uniform 正确性为主。

### 4.3 运行时调试（可选）

- 浏览器控制台：`window.__galaxyColor` 读写 `lMin` / `lMax` / `highRatingT` / `highTierTRangeScale` / `lightnessRatingExponent`，调用 `window.__galaxyColor.log()` 查看当前值。

---

## 5. 已知限制与后续衔接

1. **主应用未内嵌 Leva**：与历史架构一致；调参依赖 **`__galaxyColor`** 或 Storybook dev 的 Leva。  
2. **`uLMax = 1.0`**：若在未开 Bloom 或阈值较低时主观过亮，可在不改代码的情况下先调 `__galaxyColor.lMax` 或等待 P10.3/P10.4 统一收口并写入《视觉参数总表》。  
3. **P10.4 文档登记**：计划要求将定稿 uniform 写入 `docs/project_docs/视觉参数总表.md`；**本报告不替代**该总表更新，建议在 P10.4 一并同步。

---

## 6. 参考链接（仓库内）

- 计划：`.cursor/plans/phase_10_global_remap_1b67de2d.plan.md`  
- 技术约束总览：`.cursor/rules/project-overview.mdc`（UMAP / Z 轴等与本子项无关部分未改）
