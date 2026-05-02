# Phase 17.2（P17.2）— Hunt 全层接入、focus 邻域 hover 与 HUD 对齐 — 实施报告

> **范围**：P17.2 及在同一开发分支上直接依赖 P17.2 的收尾项（视觉默认扫参、L 参考条 Hunt 对齐、hover active 不透明度可调）。**不含** P17.3（dolly-to-cursor）、P17.4（全量 spec / 基线文档收口）。  
> **前置**：P17.1 已完成（idle opaque + depthWrite、Z 轴距离-L、`uZCamDistance` 每帧同步）。  
> **计划来源**：`.cursor/plans/phase_17_visual_system_upgrade_e8b64dbb.plan.md`（§「P17.2 Hunt 效应全层接入 + P11.2 默认值禁用」及后续验收相关条目）  
> **Git 分支（实施期）**：`feat/p17.2-hunt`（基于已含 P17.1 的 `main` 历史）  
> **Git 提交（按时间顺序）**：`42feb36` → `474e2b0` → `d54d9d0` → `6aac44d`

---

## 1. 目标与边界（计划对齐）

| 计划项 | 最终处理 |
|--------|----------|
| `oklab.glsl` 增加 `applyHuntChroma(L_actual, L_ref, C_base, gamma)` | **已实现**；与 GLSL `pow(clamp(L/L_ref,0,1), γ)` 一致 |
| 共享 uniform：`uHuntGamma`、`uHuntApplyMask`（int，位掩码）、`uHoveredInstanceId` | **已实现**（`galaxyMeshes.ts`） |
| P11.2 默认「不压 idle」：`uFocusDimChroma = 1.0` | **已实现**（Hunt 接管降饱和语义） |
| **Idle**：在 P17.1 `L_distance` 之后接 Hunt（mask bit0） | **已实现**（`galaxyIdle.vert.glsl`） |
| **Active**：在 vote→`L_base` 后接 Hunt（mask bit1）；focus 邻域 hover 提高 alpha | **已实现**（`galaxyActive.vert.glsl`）；hover 语义限定 **`uSelectionMode == 2`** |
| **Perlin**：`hueToOkSrgb` 前对 `uPerlinChroma` 做 Hunt（mask bit2） | **已实现**（`perlin.frag.glsl` + `planet.ts` 初始 uniform） |
| `scene.ts`：`hoveredMovieId` → `uHoveredInstanceId`；Perlin 每帧同步 Hunt / `uLMax` | **已实现** |
| `__galaxyColor` 扩展 `huntGamma`、`huntApplyMask`、`distanceLightnessFloor`（P17.1 已有） | **已实现** |
| HUD `FocusLReference` 十阶色带与 active 路径一致（含 Hunt） | **已实现**（`colorMath.ts` + `FocusLightnessSnap` 扩字段） |
| focus 下 hover **active** 邻域星：不透明度**可调**（相对 `dimAlpha`「提高」） | **已实现**：`uFocusHoveredActiveAlpha` + `max(dimAlpha, …)`（提交 `6aac44d`） |

**明确不在本报告范围**：P17.3 滚轮 dolly；P17.4 三份主 spec / Phase 8 基线全文同步（若已另 PR 完成，以仓库为准）。

---

## 2. 最终决策（设计 / 数学）

### 2.1 Hunt 公式与参考（定稿）

- **形式**：`C_new = C_base × clamp(L_actual / L_ref, 0, 1)^γ`。  
- **`L_ref`**：取 **`uLMax`**（与计划 D2、现有 P10.1 上端点一致）。  
- **`L_actual`**：  
  - **Idle**：`L_distance`（P17.1 距离-L 之后）。  
  - **Active**：`L_base`（vote→P10.1，**不含**距离-L；避免搜索/宏观 active 随相机距离忽明忽暗）。  
  - **Perlin**：`uPerlinL`（与 `lightnessFromVoteAverage` 快照一致）。  
- **`γ`**：`uHuntGamma`，经扫参后生产默认定为 **0.3**（见 §4；初版代码曾为 `1.0`）。  
- **位掩码 `uHuntApplyMask`**（int）：bit0 = idle vert；bit1 = active vert；bit2 = perlin frag；**默认 `7`（0b111）**；置 `0` 可关 Hunt 做 A/B（idle 仍保留 P17.1 opaque + 距离-L）。

### 2.2 Focus 邻域 hover alpha（定稿）

- **条件**：`uSelectionMode == 2`（电影 focus 球形邻域）且 `gl_InstanceID == uHoveredInstanceId`，且**非**主目标 `isFocusTarget`（与计划 D11、防误伤 person/genre mode 1 一致）。  
- **初版（`42feb36`）**：hover 时 `vFocusAlphaMult = 1.0`（与非主目标 `dimAlpha` 二选一）。  
- **定稿（`6aac44d` + 扫参）**：引入 **`uFocusHoveredActiveAlpha`**，片元 alpha 为  
  **`max(dimAlpha, clamp(uFocusHoveredActiveAlpha, 0, 1))`**。  
  - `dimAlpha = mix(1.0, uFocusNonTargetActiveAlpha, uFocusCameraBlend)`（P11.1 既有逻辑）。  
  - **语义**：hover 至少「抬到」设定下限；默认曾设为 `1.0`（等价原全不透明）；**当前仓库默认以 `galaxyMeshes.ts` 为准**（见 §4，便于「略提高不透到顶」）。

### 2.3 HUD L 参考条（定稿）

- **路径**：与 **active 顶点**一致：vote→`L_base` → Hunt（**仅当** `snap` 提供 `uHuntGamma` / `uHuntApplyMask` 且 **bit1 置位** 时启用 `srgb01FromHueAndVoteNorm` 内 Hunt）。  
- **不镜像 idle 距离-L**：图例仅表达评分轴 + 主类型 hue；若未来要对齐 idle，需再扩 snap（`zCamDistance`、floor 等）并在 HUD 侧对每阶算 `L_distance`。

### 2.4 测试与工程化（定稿）

- **`colorMath.spec.ts`** 重命名为 **`colorMath.test.ts`**，纳入现有 Vitest `include: ['src/**/*.test.ts']`，避免 `*.spec.ts` 长期不参与 CI。  
- 新增 `applyHuntChroma` 与 HUD 路径的单元测试。

---

## 3. 代码操作清单（按模块）

| 模块 | 操作摘要 |
|------|----------|
| `frontend/src/three/shaders/oklab.glsl` | 新增 `applyHuntChroma` |
| `frontend/src/three/shaders/galaxyIdle.vert.glsl` | `uHuntGamma` / `uHuntApplyMask`；Hunt 接在 `L_distance` 后；P11.2 仍乘在 Hunt 之后 |
| `frontend/src/three/shaders/galaxyActive.vert.glsl` | Hunt + `uHoveredInstanceId`；后续迭代 `uFocusHoveredActiveAlpha` |
| `frontend/src/three/shaders/perlin.frag.glsl` | `uLMax` / `uHuntGamma` / `uHuntApplyMask`；`C_perlin` 后入 `hueToOkSrgb` |
| `frontend/src/three/galaxyMeshes.ts` | 新增/默认上述 uniforms；`uniforms` 块缩进整理；**视觉扫参默认值**（§4） |
| `frontend/src/three/planet.ts` | Perlin 材质增加 `uLMax`、`uHuntGamma`、`uHuntApplyMask` 初值 |
| `frontend/src/three/scene.ts` | 每帧 `uHoveredInstanceId`；Perlin 与双 mesh Hunt/`uLMax` 同步；`focusLightnessSnap` 增加 Hunt 字段；`__galaxyColor` 增加 `huntGamma`、`huntApplyMask`、`focusHoveredActiveAlpha` |
| `frontend/src/store/galaxyInteractionStore.ts` | `FocusLightnessSnap` 增加 `uHuntGamma`、`uHuntApplyMask` |
| `frontend/src/hud/FocusLReference.tsx` | 注释更新（语义依赖 `srgb01FromHueAndVoteNorm` + snap） |
| `frontend/src/lib/colorMath.ts` | `applyHuntChroma`、`GalaxyHudColorSnap`、`srgb01FromHueAndVoteNorm` 内 Hunt（bit1） |
| `frontend/src/lib/colorMath.test.ts` | 新建（自原 `colorMath.spec.ts` 迁移 + P17.2 用例） |
| `frontend/src/storybook/GalaxyThreeLayerLab.stories.tsx` | `uDistanceLightnessFloor` / `uChroma` 默认与产品对齐（扫参后） |

---

## 4. Uniform / 默认值定稿表（以当前 `galaxyMeshes.ts` 为 SSOT）

以下数值为**前端源码默认值**（不含 Leva / `__galaxyColor` 运行时改写）。P17.1 表中已列项此处从略或与 P17.1 报告交叉引用。

| 名称 | 当前默认（本仓库） | 说明 |
|------|-------------------|------|
| `uHuntGamma` | **0.3** | 全层共享；扫参结论：较 `1.0` 更不「死灰」 |
| `uHuntApplyMask` | **7** | 三层全开；`0` 关 Hunt A/B |
| `uHoveredInstanceId` | **-1** | `scene.ts` 由 `hoveredMovieId` + `movieIdToIndex` 写入 |
| `uDistanceLightnessFloor` | **0.5** | P17.1 项；扫参后自 `0.08` 上调，减轻远处过暗 |
| `uChroma` | **0.18** | 自 `0.15` 略增，补偿 Hunt 后观感 |
| `uFocusDimChroma` | **1.0** | P11.2 默认关闭 |
| `uFocusNonTargetActiveAlpha` | **0.08** | P11.1 / P13.6 邻域非主目标 active 底透明度 |
| `uFocusHoveredActiveAlpha` | **0.4** | focus 邻域 hover 的 active：`alpha = max(dimAlpha, 本值)`；初版提交曾为 `1.0`，扫参后改为「略提高不透到顶」；`__galaxyColor.focusHoveredActiveAlpha` 可调 |

Perlin 材质初值：`uHuntGamma` **0.3**、`uLMax` **1.0**；每帧与双 mesh 对齐。

---

## 5. 验收与调试（摘要）

- **Hunt**：低 vote 更灰、高 vote 更饱和；`__galaxyColor.huntApplyMask = 0` 关 Hunt 对照。  
- **Focus 邻域**：非 hover 半透明；hover 命中实例 alpha **不低于** `uFocusHoveredActiveAlpha` 与 `dimAlpha` 的较大者；离开 hover 后无「卡不透明」。  
- **Person/genre select（`uSelectionMode == 1`）**：不受 `uHoveredInstanceId` / hover alpha 规则影响（shader 条件保证）。  
- **HUD**：focus 时 L 参考条与 active 色带 Hunt 一致（`focusLightnessSnap` 含 `uHuntGamma` / `uHuntApplyMask`）。  
- **工程**：`npm run build`、`npm test`（含 `colorMath.test.ts`）通过。

---

## 6. 风险与回滚

| 风险 | 缓解 / 回滚 |
|------|-------------|
| Hunt 过强导致整体偏灰 | 调低 `uHuntGamma`、提高 `uDistanceLightnessFloor` / `uChroma`；或关单层 mask |
| focus hover 过透 / 不够透 | 调 `uFocusHoveredActiveAlpha` 与 `uFocusNonTargetActiveAlpha` |
| Perlin 与双 mesh 色差 | 先关 mask bit2 对照；检查 `scene.ts` 每帧同步是否中断 |

**回滚代码**：可仅回退相关提交；P17.1 几何与距离-L 仍独立保留。

---

## 7. 变更记录（Git）

| 提交 | 说明 |
|------|------|
| `42feb36` | `feat(P17.2): Hunt chroma + focus-neighborhood hover alpha` |
| `474e2b0` | `chore(P17): tune default distance-L floor, chroma, and Hunt gamma` |
| `d54d9d0` | `feat(hud): mirror active-layer Hunt chroma in FocusLReference stripes` |
| `6aac44d` | `feat(focus): tunable alpha boost for hovered active neighbors` |

---

## 8. 相关文档

- Phase 17 总计划：`.cursor/plans/phase_17_visual_system_upgrade_e8b64dbb.plan.md`  
- P17.1 实施报告：`docs/reports/Phase 17.1 P17.1 idle 遮挡修复与距离-L 实施报告.md`  
- 状态机 / 视觉总表 / Tech Spec：以 Phase **P17.4** 文档同步任务为准（若尚未合并，以计划 §P17.0 与代码为准）。

---

*报告撰写依据：上述计划节、分支 `git log`、以及当前仓库中 `frontend/src/three`、`frontend/src/lib/colorMath.ts`、`frontend/src/hud/FocusLReference.tsx`、`frontend/src/store/galaxyInteractionStore.ts` 的实现。*
