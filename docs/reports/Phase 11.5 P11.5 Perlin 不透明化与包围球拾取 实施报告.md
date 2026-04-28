# Phase 11.5（P11.5）— Perlin 不透明化与拾取包围球 — 实施报告

> **范围**：仅 P11.5：focus Perlin 球的材质从透明管线改为不透明 + `alphaTest`，`uAlpha` 二态化，以及拾取用 `lastRadius` 与阶梯位移的一致性校验。  
> **主文件**：`frontend/src/three/planet.ts`（`createSelectionPlanet` 内 `ShaderMaterial` 与 `setFromMovie` / `setOpacity`）  
> **计划来源**：`.cursor/plans/phase_11_focus_visual_upgrade_b71acde5.plan.md` §「P11.5 Perlin 不透明化 + 包围球放宽」  
> **Git 分支（实施时）**：`phase/p11-5-perlin-opaque`；提交示例：`02926fc`（以仓库 `git log` 为准）

---

## 1. 目标与边界（计划对齐）

| 计划条目 | 最终处理 |
|----------|----------|
| 阶梯边缘半透明在 bloom / 叠层下锯齿与光晕 | **材质不透明化**：`transparent: false`、`depthWrite: true`，与 active 侧「opaque + 深度」策略对齐思路 |
| 与 active 一致的片元丢弃策略 | **`alphaTest: 0.01`**：低于阈值的 alpha 片元丢弃，减少边缘伪透明 |
| `uAlpha` 仅保留 0/1 语义 | **`setOpacity`**：`uAlpha = (a > 0.001) ? 1 : 0`；**`mesh.visible`** 仍由同一阈值控制显隐，飞入/退出仍依赖 `scene.ts` 既有 visible / 直接写 `uAlpha` 路径 |
| `lastRadius` 含阶梯最大外扩，供 P11.6 拾取 | **保持并强化**：`lastRadius = worldRadius × (1 + cuts × uStepHeight)`，其中 `cuts = max(0, K−1)`，与 `perlin.vert.glsl` 中最多 `uCutCount` 档 smoothstep 累加的上界一致；计划文稿中的 `1 + 3×uStepHeight` 为 **K=4（三切分）** 的特例 |
| `mesh.renderOrder`；Perlin ≥ active | **`planet.ts` 默认 `renderOrder = 1`**；**`scene.ts`** 在 `createSelectionPlanet()` 之后将 **`planet.mesh.renderOrder = 2`**，高于 `galaxyMeshes` 中 **active = 1**，满足「Perlin 后画、opaque 与深度顺序合理」 |
| 改 `perlin.frag.glsl` 颜色公式 | **未改**：片元仍输出 `vec4(lit, uAlpha)`；不透明与裁剪由材质标志 + `alphaTest` + `uAlpha` 二态完成 |

**明确未纳入本条**：P11.6 拾取分流、`interaction.ts` 入参扩展（依赖 P11.5 的 `lastRadius` 与材质行为，在后续子项实装）。

---

## 2. 最终技术决策（汇总）

1. **Perlin 从透明改为不透明并写深度**  
   原状：`transparent: true`、`depthWrite: false`（便于半透明叠层，但在 bloom 下易出光晕/锯齿）。  
   定稿：`transparent: false`、`depthWrite: true`、`depthTest: true`，使 Perlin 球参与深度缓冲，与「焦点球为实体表面」的视觉一致。

2. **`alphaTest = 0.01` 与 active 定稿对齐**  
   与 P11.1 报告中 active 材质使用 `alphaTest: 0.01` 的思路一致：丢弃极低 alpha 片元，避免数值噪声或意外低 alpha 进入混合链。

3. **`uAlpha` 仅 0 或 1**  
   - 接口仍保留 `setOpacity(alpha: number)`，入参仍 `clamp(0,1)`，但写入 GPU 的只有 **0** 或 **1**。  
   - `scene.ts` 内对 `planet.material.uniforms.uAlpha` 的赋值已为 **0/1**，与本条一致，**无需**为 P11.5 单独改 `scene.ts`。

4. **`lastRadius` 公式相对计划文稿的「3」**  
   - 顶点着色器按 **`uCutCount`** 门控多档 `smoothstep`，单顶点最大沿法线位移（单位球上）上界为 **`level_max × uStepHeight`**，且 **`level_max ≤ uCutCount`**（每档贡献 ∈ [0,1]）。  
   - 缩放后世界空间外接球半径上界：**`worldRadius × (1 + cuts × uStepHeight)`**，`cuts = K−1` 与 uniform `uCutCount` 一致。  
   - 计划中的 **`1 + 3 × uStepHeight`** 对应 **K=4、三切分** 的上界；当前实现 **泛化到任意 K≤8**，比固定常数 3 更贴合实际几何。

5. **可验证性：`console.assert`**  
   在 `setFromMovie` 计算完 `handle.lastRadius` 后断言 **`handle.lastRadius >= worldRadius`**，防止半径倍率误写导致拾取球小于基球。

6. **z-fight 与双 mesh**  
   计划备注：焦点实例在 idle/active 上仍由既有 P8.4 路径处理（例如 NDC 外推/隐藏），与 Perlin 不透明化不冲突；本条**未**新增几何或实例层逻辑。

---

## 3. 代码变更清单（文件级）

| 文件 | 变更摘要 |
|------|----------|
| `frontend/src/three/planet.ts` | `ShaderMaterial`：`transparent: false`、`depthWrite: true`、`alphaTest: 0.01`；`setOpacity` 内 `uAlpha` 二态；`setFromMovie` 内 `lastRadius` 后增加 `console.assert` |
| `frontend/src/three/scene.ts` | **本条未提交变更**；既有 `planet.mesh.renderOrder = 2` 已满足 P11.5 对 renderOrder 的验收核对 |
| `frontend/src/three/shaders/perlin.frag.glsl` | **未改** |

---

## 4. 材质与 uniform 行为（摘要）

**构造参数（节选）**：

- `transparent: false`
- `depthWrite: true`
- `depthTest: true`
- `alphaTest: 0.01`

**`setOpacity(alpha)`**：

- `a = clamp(alpha, 0, 1)`
- `material.uniforms.uAlpha.value = a > 0.001 ? 1 : 0`
- `mesh.visible = a > 0.001`

**`setFromMovie` 与 `lastRadius`**：

- `cuts = max(0, K - 1)`，`radiusMul = 1 + cuts * stepH`，`handle.lastRadius = worldRadius * radiusMul`
- `scene.ts` 中在半径刷新路径使用 **`r * (1 + cuts * stepH)`** 与 `uCutCount` / `uStepHeight` 同步更新 `planet.lastRadius` 的既有逻辑，与本条 **同一几何上界模型**，仍适用于 P11.6 拾取预读

---

## 5. 验收对照（计划 P11.5）

| 验收项 | 说明 |
|--------|------|
| 阶梯边缘锐利、减少半透明锯齿 | 由 opaque + `depthWrite` + `alphaTest` 达成（需在运行态结合 bloom 目视确认） |
| bloom 下减少光环泄漏 | 依赖不透明与深度写入；若仍有后处理阶相关 artifact，在 P11.7 或 bloom 专项记录 |
| focus 飞入/退出丝滑 | 仍由 `mesh.visible` 与 `scene.ts` 对 `uAlpha` 的 0/1 与相机动画驱动；本条不缩短/延长过渡时间 |
| `renderOrder` | Perlin **2** ≥ active **1**，已满足 |

---

## 6. 构建与回归

- **命令**：`frontend` 目录下 `npm run build`（`tsc -b && vite build`）  
- **结果**：通过（实施时无 TypeScript 报错）

---

## 7. 后续衔接

- **P11.6**：`interaction.ts` 在 focus 态优先对 Perlin `mesh` 做 `intersectObject`，拾取半径应读取 **`selectionPlanetHandle.lastRadius`**（已含 `cuts × uStepHeight` 外扩）。  
- **P11.7**：可将 Perlin 材质 opaque / `alphaTest` / `uAlpha` 二态写入「视觉参数总表」与 Tech Spec 若尚未记载。

---

## 8. 修订历史

| 日期 | 说明 |
|------|------|
| 2026-04-29 | 初稿：对应 P11.5 实施与计划文档 §P11.5 |
