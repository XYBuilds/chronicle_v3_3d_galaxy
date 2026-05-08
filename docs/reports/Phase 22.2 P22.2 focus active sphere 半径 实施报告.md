# Phase 22.2（P22.2）— focus active sphere 半径下调 — 实施报告

> **范围**：缩小条带内 **active** `InstancedMesh` 的世界尺度（focus 主星及周边 slab 内 active 球），**不**调整 `FOCUS_PERLIN_CAMERA_STANDOFF` 等相机 standoff。  
> **计划来源**：`.cursor/plans/phase_22_visual_interaction_polish_f88228c5.plan.md`（§ P22.2 focus active sphere 半径下调）  
> **主文件**：`frontend/src/three/galaxyUniformDefaults.ts`、`galaxyMeshes.ts`；拾取与 HUD 环路与 `screenRadius.ts` / `galaxyActive.vert` 公式一致，**无独立硬编码半径**（除既有逻辑外未改）。

---

## 1. 最终决策（定稿）

| 议题 | 决策 |
|------|------|
| 调控对象 | 只改 **`uActiveSizeMul`**（共享 uniform，idle/active 材质共用一袋）。**不改** `FOCUS_PERLIN_CAMERA_STANDOFF`（仍为 `camera.ts` 中 **1** world year）。 |
| 与 shader 的关系 | Active 顶点尺度 **`sActive = inFocus × uSizeScale × uActiveSizeMul × aSize`**（`galaxyActive.vert.glsl`）。下调 **`uActiveSizeMul`** 即整体缩小 active 球映射，含中间 vote 区间；**非**只压上限 cap。 |
| CPU 拾取与 HUD | **`computeActiveWorldRadius`** / **`pickClosestActiveMovieAlongRay`** 已读材质上的 **`uActiveSizeMul`**，与 GPU 同构；**`constellation.ts`** 的 `getActiveWorldRadius` 回调来自同一套计算；**`FocusSizeReferenceRings`** 使用传入的 `uActiveSizeMul`，**无需额外同步补丁**。 |
| 初值 dial-in（迭代过程） | 首版实现取 **`0.013`**（相对历史生产默认 **`0.02`** 约 **0.65×**），落在计划建议的 **0.6–0.7×** 量级内。 |
| **生产最终数值** | 经产品拍板，**`DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL = 0.01`**，即相对历史 **`0.02`** 为 **0.5×**。 |
| 常量 SSOT 位置 | 新增 **`galaxyUniformDefaults.ts`**（**不** `import` GLSL），导出 **`DEFAULT_GALAXY_U_SIZE_SCALE`** 与 **`DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL`**，避免 Vitest 从 `galaxyMeshes` 间接加载 shader 导致解析失败。 |
| 对外导出 | **`galaxyMeshes.ts`** 从 `galaxyUniformDefaults` 取值写入 `makeSharedUniforms`，并 **re-export** 两个 `DEFAULT_*`，保持既有 `import … from '@/three/galaxyMeshes'` 用法。 |
| Git 分支 | 开发分支名：**`p22-2-focus-active-sphere-radius`**（与合并目标分支无关，仅记录实施时习惯）。 |

---

## 2. 最终操作（代码与文档）

| 操作 | 说明 |
|------|------|
| 新增 `galaxyUniformDefaults.ts` | 集中 **`DEFAULT_GALAXY_U_SIZE_SCALE = 0.3`**、**`DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL = 0.01`**；注释标明 P22.2 与 `galaxyActive.vert` 的对应关系。 |
| 修改 `galaxyMeshes.ts` | `makeSharedUniforms` 中 **`uActiveSizeMul`** / **`uSizeScale`** 初值改为引用上述常量；**re-export** `DEFAULT_*` 与 `NEAR_CULL_WORLD_Z`。 |
| 回归修复 | 重构时误删 **`const _dummy = new THREE.Object3D()`**，导致 `createGalaxyDualMeshes` 内 **`ReferenceError: _dummy is not defined`**；已 **恢复** 于模块顶层。 |
| Storybook | `GalaxyThreeLayerLab.stories.tsx` 默认 **`uActiveSizeMul`** 改为从 **`galaxyUniformDefaults`** 导入，与生产一致。 |
| 单测 | `galaxyVoteSize.spec.ts` 中 `focusShellRadiiForVoteTiers` 的尺度参数改为 **`DEFAULT_GALAXY_U_SIZE_SCALE`** + **`DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL`**（从 **`galaxyUniformDefaults`** 导入），避免与生产漂移。 |
| 开发者速查表 | **`docs/project_docs/视觉参数总表.md`** §2 中 **`uActiveSizeMul`** 行更新为 **`0.01`**，并注明 **P22.2**、**0.5×** 原 `0.02` 及 **`galaxyUniformDefaults.ts`** SSOT。 |

---

## 3. Git 提交摘要（按时间顺序）

| Hash（简写） | 说明 |
|--------------|------|
| `386383e` | P22.2 初落地：`uActiveSizeMul` **0.02 → 0.013**，引入 `galaxyUniformDefaults`、Storybook/单测/视觉参数表同步。 |
| `33f9caf` | **fix**：恢复 **`_dummy`**，消除运行时 **`ReferenceError`**。 |
| `6f1715f` | **`DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL`** 定稿 **0.01**；同步注释与《视觉参数总表》。 |

---

## 4. 验收记录

| 项 | 结果 |
|----|------|
| 单元测试 | `npm run test -- --run`（frontend）在定稿 **0.01** 后 **通过**（含 `galaxyVoteSize.spec.ts`）。 |
| 视觉（人工） | focus 进入高 **`vote_count`** 片：active 球相对 P22.2 前应 **明显变小**；极低 **`vote_count`** 仍依赖 **`aSize`** 下限，不应「消失」（与数据管线 `size` 映射一致，本阶段未改数据侧）。 |
| 拾取 | 与 **`uActiveSizeMul`** 联动，不应出现「球变小但拾取仍按旧半径」的漂移（代码路径已统一读 uniform）。 |

---

## 5. 与计划 P22.2 的对照

| 计划项 | 结果 |
|--------|------|
| 定位 `getActiveWorldRadius` / active 半径主控 | 主控为 **`uActiveSizeMul`** + **`uSizeScale`** + **`movie.size`** + **`inFocus`**；CPU 侧 **`computeActiveWorldRadius`** 已对齐。 |
| 下调整体映射（约 0.6–0.7× 起步再 dial） | 首版 **0.65×**；**最终产品取值 0.5×（0.01）**，满足「整体缩小」目标。 |
| 不动 `FOCUS_PERLIN_CAMERA_STANDOFF` | **未改**。 |
| 参考环 / constellation / picking | **未单独改文件**；随 uniform 与回调自然一致。 |
| dial 写入《视觉参数总表》 | **已更新**（见 §2）。 |
| Tech Spec / Design Spec 正文 | **未在本子阶段批量改**；若 Phase **22.9** 统一文档收口，可将 **`uActiveSizeMul` 初值 `0.02` → `0.01`** 写入 Tech Spec §渲染与参数表交叉引用。 |

---

## 6. 出口状态

| 项 | 状态 |
|----|------|
| 生产默认 **`uActiveSizeMul`** | **`0.01`**（`galaxyUniformDefaults.ts` **`DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL`**）。 |
| 历史默认 | **`0.02`**（P22.2 前；文档与旧报告中的初值描述）。 |
| 可调入口 | 运行时仍可通过 **`window.__galaxyPointScale.activeSizeMul`**（`scene.ts`）覆盖 uniform，用于现场扫参。 |
| 本报告 | 作为 **P22.2 最终决策与操作** 的归档 SSOT。 |
