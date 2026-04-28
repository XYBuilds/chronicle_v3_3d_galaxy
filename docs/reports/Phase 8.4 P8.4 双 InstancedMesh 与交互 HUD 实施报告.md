# Phase 8.4（P8.4）双 InstancedMesh 与交互 HUD — 最终决策与操作报告

> **范围**：以 `phase_8_visual_upgrade` 计划中 P8.4 为主线，合并会话 transcript 中后续迭代结论。  
> **依据**：[`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md)、[`星球状态机 spec.md`](../project_docs/星球状态机%20spec.md)；实现过程见 Cursor 父会话 transcript（本地）：[P8.4 双 mesh 主线实现](a9633d56-2fa6-4dd7-bb1c-769552b4da59)、[hover/环/tooltip/Perlin/相机迭代](dac926d0-b213-4299-9e3d-65953e91e18e)。  
> **仓库状态**：以当前 `frontend/` 源码为准（报告撰写日：**2026-04-27**）。

---

## 1. 目标与验收对齐

| 目标 | 决策摘要 |
|------|-----------|
| **替换生产路径 Points** | 主场景宏观层改为 **双 `InstancedMesh`**（idle + active），`THREE.Points` 保留供对照 / Vitest，不作为生产挂载路径。 |
| **P8.4 准入 / WebGL2** | `mountGalaxyScene` 在创建 renderer 后 **`isWebGL2` 硬断言**，非 WebGL2 抛错并 dispose，与 Phase 7.2 红线一致（`gl_InstanceID` 依赖）。 |
| **视觉与状态机** | idle / active 分工、`uZCurrent` / `uZVisWindow` 条带、`uFocusedInstanceId` 隐藏选中实例，对齐《星球状态机 spec》。 |
| **拾取** | `InstancedMesh` 内置 raycast 不反映顶点缩放 → 使用 **CPU 射线–世界球**（半径与 `galaxyActive.vert` 一致），hover 与 click 共用逻辑；click 额外 **`movieZInFocusFactor > 0.5`** 门槛（与 spec P8.4 描述一致）。 |
| **HUD** | Hover 环 + MovieTooltip；锚点与环 **星球中心投影**；tooltip **仅上下方向** 避让（`sideOffset`），无水平平移 store 字段。 |
| **Perlin 选中球尺度** | 与 active 世界半径一致：`computeActiveWorldRadius`；条带外 `inFocus≈0` 时用 **`worldSpan` 比例回退** 避免半径为 0。 |
| **特写相机距离** | 由 **`worldSpan` 比例 + 下限** 改为 **绝对常数** `FOCUS_PERLIN_CAMERA_STANDOFF`（`camera.ts`）。 |

---

## 2. 分支与操作流水（transcript 摘要）

1. **新开分支**（transcript）：`feat/p8-4-dual-instanced-mesh`（P8.4 专用，避免与主线混杂）。
2. **新增 / 修改核心文件**（按实现顺序归纳）：
   - GLSL：`shaders/oklab.glsl`、`galaxyIdle.vert/frag.glsl`、`galaxyActive.vert/frag.glsl`
   - TS：`galaxyMeshes.ts`、`screenRadius.ts`、`interaction.ts`、`camera.ts`、`scene.ts`
   - Store：`galaxyInteractionStore.ts`（hover 相关字段演进见 §4）
   - HUD / UI：`HoverRing.tsx`、`hoverRingLayout.ts`、`MovieTooltip.tsx`、`App.tsx`；Storybook / Leva 与双 mesh 参数同步（`GalaxyThreeLayerLab*` 等）
3. **验证**：`npm test -w frontend`、`npm run build -w frontend`（多轮 transcript 中均通过）。
4. **后续会话（dac926d0…）**：在 P8.4 已合并主线逻辑上，完成 **tooltip 穿透**、**HoverRing 几何**、**tooltip 垂直 sideOffset**、**hover 常量定稿**、**Perlin 半径对齐 active**、**特写相机绝对 standoff** 等迭代（无新 Phase 编号，视为 P8.4 交付打磨）。

---

## 3. 架构决策（最终形态）

### 3.1 双 InstancedMesh

- **idle**：`IcosahedronGeometry(1, 0)`，`transparent: true`，`depthWrite: false`，缩放 ∝ `(1 - inFocus) × uSizeScale × uBgSizeMul × aSize`。
- **active**：`IcosahedronGeometry(1, 1)`，不透明，`depthWrite: true`，缩放 ∝ `inFocus × uSizeScale × uActiveSizeMul × aSize`。
- **实例属性**：idle / active **各一份** `InstancedBufferAttribute`（避免 dispose 共享 attribute 的隐患），创建时断言 idle/active 数组一致。
- **Uniform**：idle / active **共用同一 `uniforms` 对象**（避免 `UniformsUtils.clone` 双份不同步）；`uFocusedInstanceId` 在选中态隐藏该实例在两套 mesh 上的绘制。

### 3.2 条带与 inFocus

- 与 shader 一致：`W = uZVisWindow × 0.2`，`inFocus` 为两段 `smoothstep` 积（与 `screenRadius.ts` 中 `movieZInFocusFactor` 对齐）。

### 3.3 拾取（`interaction.ts` + `screenRadius.ts`）

- **`pickClosestActiveMovieAlongRay`**：遍历候选，`R = inF × uSizeScale × uActiveSizeMul × size`（与顶点公式一致）；`requireSlabInteraction === true` 时丢弃 `inF ≤ 0.5` 的命中（点击）。
- **Hover 锚点**：使用 **电影世界中心** `(x,y,z)` 投影到 CSS，而非射线击中点（与 HoverRing 同心）。

### 3.4 场景与 WebGL2（`scene.ts`）

- `createGalaxyDualMeshes` → `scene.add(idle)` + `scene.add(active)`。
- **WebGL2**：`if (!renderer.capabilities.isWebGL2) { … throw … }`。
- **选中流程**：`beginSelect` / `applySelectionFrame` 中维护 `pendingSelectInstanceIndex`、`uFocused`、Perlin `planet`、`setFocusCameraPosition` 等（与 transcript 一致）。

### 3.5 调试 API（保留）

- `window.__galaxyPointScale`：仍映射到共享 `uSizeScale` / `uActiveSizeMul` / `uBgSizeMul`（命名随 `uFocusSizeMul` → `uActiveSizeMul` 已更新语义）。
- `mountGalaxyScene` 返回 `galaxyMaterial`（idle）与 `galaxyActiveMaterial`（active），便于 Storybook / 控制台。

---

## 4. Store 与 HUD 字段演进（最终）

**`galaxyInteractionStore`（当前）**

| 字段 | 用途 |
|------|------|
| `hoveredMovieId` / `selectedMovieId` | TMDB `id` |
| `hoverAnchorCss` | 星球中心屏幕坐标（CSS） |
| `hoverPlanetRadiusCss` | `computeActiveMeshScreenRadiusCss` 结果，供 HoverRing + tooltip `sideOffset` |
| `zCurrent` / `zVisWindow` / `zCamDistance` | 宏观时间轴与相机（非 Perlin standoff） |

**已移除（dac 会话）**：`hoverTooltipOffsetXPx`（曾用于水平 `translate`）；tooltip 间距改为 **`hoverTooltipSideOffsetPx`**（`hoverRingLayout.ts`）→ `MovieTooltipContent` 的 `sideOffset`。

---

## 5. 可调视觉常量（落地文件）

### 5.1 `frontend/src/hud/hoverRingLayout.ts`（当前数值）

| 常量 | 值（撰写时） | 含义 |
|------|----------------|------|
| `HOVER_RING_GAP_PX` | `2` | 球轮廓到环描边内缘的间隙（CSS px） |
| `HOVER_RING_STROKE_PX` | `1` | 环描边粗细（固定） |
| `HOVER_TOOLTIP_CLEAR_PX` | `10` | 环外缘沿 top/bottom 再让出给 tooltip |
| `hoverRingOuterRadiusPx` / `hoverTooltipSideOffsetPx` | 函数 | 外环半径与 `TooltipContent` 的 `sideOffset` |

### 5.2 `frontend/src/three/galaxyMeshes.ts`（撰写时默认）

| 项 | 值 | 说明 |
|----|-----|------|
| `DEFAULT_GALAXY_U_SIZE_SCALE` | `0.3` | 与当前 `uActiveSizeMul`/`uBgSizeMul` 搭配的宏观尺度默认 |
| `uActiveSizeMul` | `0.02` | 条带内 active 分支乘子 |
| `uBgSizeMul` | `0.002` | 条带外 idle 分支乘子 |

（历史上曾合并 `uMeshCalib` 进 `uSizeScale`、再恢复 `0.3` 视觉；**当前无 `uMeshCalib` uniform**。）

### 5.3 `frontend/src/three/camera.ts`

| 常量 | 值（撰写时） | 含义 |
|------|----------------|------|
| `FOCUS_PERLIN_CAMERA_STANDOFF` | `0.35` | Perlin 特写下相机相对片子中心的 **绝对** 世界距离（沿 −Z） |

**宏观**相机仍用 store 的 **`zCamDistance`**（如默认 `30`），与上表无关。

---

## 6. 交互与 Tooltip 修复（dac 会话决策）

1. **静止 hover 丢失**：根因是 Portal 内 **`TooltipContent` 拦截指针** → canvas `pointerleave` → store 清空。  
   - **决策**：`TooltipContent` 增加 **`pointer-events-none`**；canvas 增加 **`pointerenter`** 补一次拾取。
2. **HoverRing**：圆心 = 星球中心；内开口随 `hoverPlanetRadiusCss`；固定描边；间隙由 `HOVER_RING_GAP_PX` 控制。
3. **Tooltip 位置**：取消水平右移；**`side="top"` + `sideOffset={hoverTooltipSideOffsetPx(r)}`**，依赖 Base UI 在贴边时翻转到 bottom，同一 offset 保证与球/环的垂直间隙。

---

## 7. Perlin 球与 active 等大（最终）

- **`beginSelect`**：`rActive = computeActiveWorldRadius(movie, uZ, uZw, galaxy.activeMaterial)`。  
- **`r = rActive > 1e-6 ? rActive : rFallback`**，`rFallback = clamp(span×0.014, 0.07, span×0.05)`（条带外防止半径为 0）。  
- **`console.assert`**：当 `rActive > 0` 时 `r` 与 `rActive` 一致（防静默漂移）。

---

## 8. 文件清单（P8.4 相关，便于审计）

| 路径 | 角色 |
|------|------|
| `frontend/src/three/galaxyMeshes.ts` | 双 mesh 工厂、共享 uniforms、默认尺度 |
| `frontend/src/three/shaders/oklab.glsl` | OKLab 管线共享 |
| `frontend/src/three/shaders/galaxyIdle.vert.glsl` / `galaxyIdle.frag.glsl` | idle 顶点/片元 |
| `frontend/src/three/shaders/galaxyActive.vert.glsl` / `galaxyActive.frag.glsl` | active 顶点/片元 |
| `frontend/src/three/screenRadius.ts` | `movieZInFocusFactor`、`computeActiveWorldRadius`、射线拾取、屏幕半径 |
| `frontend/src/three/interaction.ts` | `attachGalaxyActiveMeshInteraction`、Points 遗留 `computePointScreenRadiusCss` |
| `frontend/src/three/scene.ts` | WebGL2 gate、双 mesh 挂载、选中态、Bloom、调试桥 |
| `frontend/src/three/camera.ts` | 控制器、`FOCUS_PERLIN_CAMERA_STANDOFF`、`setFocusCameraPosition` |
| `frontend/src/three/planet.ts` | Perlin 选中球（尺度由 `setFromMovie` 的 `worldRadius` 传入） |
| `frontend/src/store/galaxyInteractionStore.ts` | 交互与时间轴状态 |
| `frontend/src/hud/HoverRing.tsx` / `hoverRingLayout.ts` | 悬停环布局 |
| `frontend/src/components/MovieTooltip.tsx` | Tooltip HUD、`sideOffset` |
| `frontend/src/App.tsx` | `HoverRing` + `MovieTooltip` 挂载 |
| `frontend/src/storybook/GalaxyThreeLayerLab*.tsx` | 双 mesh 实验与 Leva |

---

## 9. 已知边界与后续（计划内）

- **P8.5+**：idle 亚像素 / alpha 曲线、active Lambert 等视觉细化可在本基线上继续（见 Phase 8 总计划）。  
- **性能**：P8.0.2 Story `InstancedMeshBench` 与主场景 Bloom 组合需分别对照；P8.0 文档已记录测量口径。  
- **选中后 scrub 时间轴**：Perlin 半径在 `beginSelect` 时刻锁定；若需随 `zCurrent` 实时同步 active 半径，需额外每帧或订阅更新（当前未做）。

---

## 10. 验证命令

```bash
npm test -w frontend
npm run build -w frontend
```

---

*本报告为 P8.4 交付与后续 transcript 决策的合并摘要；若与 Git 历史 commit message 字面不完全一致，以当前 `frontend` 源码与上表常量为权威。*
