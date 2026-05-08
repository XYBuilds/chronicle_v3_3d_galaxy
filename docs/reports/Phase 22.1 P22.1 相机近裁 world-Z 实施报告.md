# Phase 22.1（P22.1）— 相机近裁（世界 Z 距离）— 实施报告

> **范围**：idle / active 双 `InstancedMesh` 在 **世界 Z 轴** 上与相机过近时 **整星不渲染**，并与 **CPU 球拾取** 同构，避免「看不见仍能点到」；focus 选中片在实例层与拾取层 **豁免**。  
> **本阶段结论**：验收后认为 **量纲与观感不达预期**，功能 **已禁用**（阈值置零），**实现代码保留** 供后续重做。  
> **计划来源**：`.cursor/plans/phase_22_visual_interaction_polish_f88228c5.plan.md`（P22.1 相机最近裁剪）  
> **主文件**：`frontend/src/three/nearCullWorldZ.ts`、`galaxyMeshes.ts`、`shaders/galaxyIdle.vert.glsl`、`shaders/galaxyActive.vert.glsl`、`scene.ts`、`screenRadius.ts`、`interaction.ts`

---

## 1. 最终决策（定稿）

| 议题 | 决策 |
|------|------|
| 近裁量纲 | **世界 Z 距离**：`abs(cameraWorldZ - starZ)`，与 `galaxy_data.json` 中 `z`（decimal year）同单位（1 单位 ≈ 1 年）。 |
| 与 Perlin 焦点球关系 | 焦点片在双网格上本就 **缩成 0 尺度**（`uFocusedInstanceId`），主视觉由 **Perlin 球**承担；近裁主要作用于 **条带内其他 idle/active 实例**。 |
| Shader 与 Pick 一致性 | **必须同步**：顶点里丢到 clip 外则 CPU `pickClosestActiveMovieAlongRay` 须 **同等跳过**，否则出现鬼影拾取。 |
| focus 豁免 | **顶点**：`gl_InstanceID == uFocusedInstanceId` 时不做近裁。**拾取**：`movie.id === selectedMovieId` 时不按近裁跳过（与计划「focus 例外」一致）。 |
| 相机位置 uniform | 每帧 `camera.getWorldPosition(...)` 写入共享 uniform `uCameraWorldPos`，与轨道/宏观相机一致。 |
| **本阶段是否启用** | **否**。将 `NEAR_CULL_WORLD_Z` 设为 **`0`**：`abs(Δz) < 0` 永不成立，shader 与 CPU 路径 **逻辑保留、行为等价关闭**。恢复时把该常量改回例如 `0.5` 并再验收。 |

---

## 2. 最终操作（代码与提交摘要）

| 操作 | 说明 |
|------|------|
| 新增常量模块 | `frontend/src/three/nearCullWorldZ.ts`：导出 `NEAR_CULL_WORLD_Z`（当前为 `0` = 禁用），供 mesh uniform 与 `screenRadius` 共用，避免循环依赖。 |
| 共享 uniform | `galaxyMeshes.ts`：`uNearCullWorldZ`、`uCameraWorldPos`；`galaxyMeshes` 仍 re-export `NEAR_CULL_WORLD_Z`。 |
| 顶点着色器 | `galaxyIdle.vert.glsl` / `galaxyActive.vert.glsl`：在既有 slab / 尺度逻辑前，对非豁免实例若 `abs(uCameraWorldPos.z - aZ) < uNearCullWorldZ` 则 `gl_Position` 移出 clip 并提前 `return`（active 分支同步设置 `vFocusAlphaMult` 等）。 |
| 帧更新 | `scene.ts`：在相机位姿更新后 `camera.updateMatrixWorld()` + `getWorldPosition` → `uCameraWorldPos`。 |
| CPU 拾取 | `screenRadius.ts`：`pickClosestActiveMovieAlongRay` 增加 `cameraWorldZ`、`nearCullExemptMovieId`；循环内与 shader 同阈值过滤。 |
| 交互接线 | `interaction.ts`：`pickCameraWorldZ()` + 传入当前 `selectedMovieId` 作为拾取豁免 id。 |
| Git（参考） | 实现：`feat(three): P22.1 near-Z world cull...`；禁用：`chore(three): disable P22.1 near-Z cull (NEAR_CULL_WORLD_Z=0...)`。分支名曾为 `phase22/p22.1-near-cull-world-z`（以仓库实际为准）。 |

---

## 3. 验收记录（本阶段）

以下结论作为 **产品/视觉验收** 记录，用于说明为何 **先禁用、后重做**。

1. **按 Z 的裁切不够直观**  
   阈值固定在世界 Z 差上时，**在 XY 上靠近相机视线** 的星，往往要 **在透视意义上已经离「视角」很近** 才会触发裁切；而 **XY 上离视线远** 的星，可能在 **沿视线仍较远** 时就被裁切。用户感知与「离眼睛有多近」不一致。  
   **后续方向**：考虑改为与 **相机距离（欧氏或沿视线深度）** 相关的裁切或渐变，使「近大远小」与裁切阈值对齐。

2. **二值显示缺少动感**  
   当前实现为 **显示 / 不显示**（clip 外丢弃），星星缺少 **从眼前掠过时的速度感** 与过渡。  
   **后续方向**：考虑基于距离的 **不透明度 / 渐隐** 或带宽度的过渡带，而非硬开关。

3. **本阶段动作**  
   在重新设计前 **不启用** 该功能：保留全部管线，仅将 **`NEAR_CULL_WORLD_Z = 0`** 作为 **功能总开关**（见 `nearCullWorldZ.ts` 注释）。

---

## 4. 与计划 P22.1 的对照

| 计划项 | 结果 |
|--------|------|
| `NEAR_CULL_WORLD_Z` 可调（约半年量级 dial-in） | 已实现；dial-in 未最终采纳，改为 **默认 0 关闭**。 |
| idle/active vertex + picking 同步 | **已实现**（禁用状态下仍保持代码路径一致）。 |
| focus 实例与选中 id 豁免 | **已实现**。 |
| 验收：推近条带、focus 保留、无鬼影拾取 | **代码层满足**；**视觉与直觉未通过**，故产品层 **不启用**。 |

---

## 5. 后续工作建议（非本阶段承诺）

- 重新定义 **近场** 度量：例如 **相机到实例世界位置的距离**，或 **视空间深度**，与 HUD/设计 spec 对齐后再定阈值。  
- 将 **硬裁切** 改为 **alpha / 厚度** 等与现有透明 active 路径兼容的方案，并评估对 depth、bloom 的影响。  
- 若重新启用，同步更新 `docs/project_docs/视觉参数总表.md` 与 Tech Spec 中渲染章节（随 Phase 22.9 文档收口任务一并处理即可）。

---

## 6. 出口状态

| 项 | 状态 |
|----|------|
| P22.1 代码合并意图 | **保留在仓库**，默认 **关闭**（`NEAR_CULL_WORLD_Z === 0`）。 |
| 产品行为 | 与 **未做 P22.1 前** 一致：无近 Z 硬裁切、无额外拾取过滤（条件恒假）。 |
| 文档 | 以本报告为 Phase 22.1 **实施与验收 SSOT**。 |
