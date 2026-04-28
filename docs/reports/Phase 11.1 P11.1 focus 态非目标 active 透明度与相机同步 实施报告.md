# Phase 11.1（P11.1）— focus 态非目标 active 透明度与相机缓动同步 — 实施报告

> **范围**：仅 P11.1 中与「焦点视觉」相关的本条需求；**未**实装原计划文档中的「近相机遮挡剔除」（`uFocusOcclusionRadius` / `uCameraWorldPos` / NDC 外推），该路径由产品修正为「非目标 active 压暗 + 与相机同一缓动曲线」。  
> **主文件**：`frontend/src/three/galaxyMeshes.ts`、`frontend/src/three/shaders/galaxyActive.vert.glsl`、`frontend/src/three/shaders/galaxyActive.frag.glsl`、`frontend/src/three/scene.ts`  
> **计划来源**：`.cursor/plans/phase_11_focus_visual_upgrade_b71acde5.plan.md`（P11.1 条目；实施时采纳用户修正需求）  
> **Git 分支（实施时）**：`phase-11-p11-1-focus-active-alpha-dim`（建议在合并前核对本地分支名与提交信息）

---

## 1. 目标与边界（计划对齐）

### 1.1 原计划 P11.1（未按此实装）

| 原计划摘要 | 本次处理 |
|------------|----------|
| 近相机 `uFocusOcclusionRadius` + `uCameraWorldPos`，近处非焦点实例 `sActive/sIdle=0` + NDC 外推 | **未做**；若后续仍需防穿模，可在 P11 后续子项或新条目中单独追加 |

### 1.2 用户修正需求（本次定稿）

| 需求 | 最终处理 |
|------|----------|
| 进入 focus 后，**非目标**的 **active** 星球透明度 alpha 压到 **0.1** | **已实现**：片元 `gl_FragColor.a = mix(1.0, uFocusNonTargetActiveAlpha, blend)`，默认 `uFocusNonTargetActiveAlpha = 0.1` |
| **飞入中**的目标仍保持 **不透明（alpha = 1）** | **已实现**：`selecting` 阶段 `uFocusedInstanceId = -1`，用 `uFocusTargetInstanceId == gl_InstanceID` 识别目标实例，乘子恒为 `1.0` |
| 非目标 active 从 **alpha 1 → 0.1** 的曲线与 **相机从宏观到微观 focus** 的移动一致 | **已实现**：`uFocusCameraBlend` 与 `camera.position.lerpVectors(fromCam, toCam, easeOutCubic(t))` 使用同一 `easeOutCubic(t)`（`selecting`）；退出 focus 时对称使用 `1 - easeOutCubic(t)`（`deselecting`） |
| idle 层 / 背景星是否同步压暗 | **未纳入**：需求明确写「**active**」；idle 着色器未接 `vFocusAlphaMult` |

---

## 2. 最终技术决策（汇总）

1. **驱动量统一为「相机缓动标量」**  
   不单独对 alpha 再做一套插值时间线；`uFocusCameraBlend ∈ [0,1]` 与 `SELECT_MS` / `DESELECT_MS` 内相机 `lerp` 的 **easeOutCubic** 参数一致，保证「看到的相机进度」与「看到的背景 active 变淡」同源。

2. **为何需要 `uFocusTargetInstanceId`（与 `uFocusedInstanceId` 并存）**  
   - `selecting` 阶段历史上 `uFocusedInstanceId = -1`（焦点实例在双 mesh 上仍按「未选中」处理，直到 `selected`）。  
   - 若仅用 `uFocusedInstanceId` 判断「目标」，飞入全程无法识别哪一颗是目标，**无法**保证「目标 active 不透明」。  
   - 因此在飞入/飞出/已选中全程，用 **`uFocusTargetInstanceId = pendingSelectInstanceIndex`** 标记「当前 focus 操作针对的实例」；`selected` 阶段与 `uFocusedInstanceId` 数值一致，语义上前者管「谁是目标」，后者管「双 mesh 隐藏焦点实例」。

3. **每实例 alpha 在顶点着色器打包为 `vFocusAlphaMult`**  
   `gl_InstanceID` 在片元阶段不可靠/不可用为通用前提，故在 **`galaxyActive.vert.glsl`** 内根据 `uFocusTargetInstanceId` 与 `uFocusCameraBlend` 计算 `vFocusAlphaMult`，**`galaxyActive.frag.glsl`** 仅 `vec4(c, vFocusAlphaMult)`。

4. **active 材质从 opaque 改为透明管线**  
   为使 `gl_FragColor.a < 1` 真正参与混合，`active` 的 `ShaderMaterial` 设为 **`transparent: true`**，并 **`depthWrite: false`**（与 idle 一致思路），避免半透明实例之间 depth 写入导致的自遮挡/顺序伪影；保留 **`alphaTest: 0.01`** 丢弃极低 alpha 片元。

5. **Uniform 放在共享 `makeSharedUniforms` 中**  
   与 P8.4 一致，idle/active 共用同一 uniform 对象；idle 顶点/片元**未引用**上述新 uniform，由 Three/WebGL 对未使用 uniform 忽略上传，不增加 idle 着色器逻辑。

6. **可调参出口**  
   `window.__galaxyColor.focusNonTargetActiveAlpha` 读写 `uFocusNonTargetActiveAlpha`，setter 内 **`clamp(0.02, 1)`**，避免调到 0 导致整层不可见难以调试；`log()` 输出中追加该字段。

---

## 3. 状态机与 uniform 取值表

| `selectionPhase` | `uFocusedInstanceId` | `uFocusTargetInstanceId` | `uFocusCameraBlend` | 说明 |
|------------------|----------------------|---------------------------|------------------------|------|
| `idle` | `-1` | `-1` | `0` | 无 focus 淡化 |
| `selecting` | `-1` | `pendingSelectInstanceIndex` | `easeOutCubic(t)`，`t∈[0,1]` | 与相机飞入同一缓动；目标 active `alpha=1` |
| `selecting` 且 `t≥1` 当帧收尾 | 切至 `selected` 前已写 `uFocusCameraBlend=1` | 同左 | `1` | 与 `selected` 首帧一致 |
| `selected` | `pendingSelectInstanceIndex` | 同左 | `1` | 非目标 active 稳定在 `uFocusNonTargetActiveAlpha`；目标实例在 vert 中 `sActive=0`（双 mesh 隐藏） |
| `deselecting` | `-1` | `pendingSelectInstanceIndex` | `1 - easeOutCubic(t)` | 与相机拉回对称，非目标 alpha 回到 1 |
| `deselecting` 结束 | 进入 `idle` | `-1` | `0` | 清零 |

常量：`SELECT_MS = 700`、`DESELECT_MS = 450`；缓动函数 `easeOutCubic` 定义于 `scene.ts`，与既有相机代码一致。

---

## 4. Shader 与数据公式（摘要）

**顶点（`galaxyActive.vert.glsl`）**（非早退路径）：

- `blend = clamp(uFocusCameraBlend, 0, 1)`
- `dimAlpha = mix(1.0, uFocusNonTargetActiveAlpha, blend)`
- `isFocusTarget = (uFocusTargetInstanceId >= 0) && (gl_InstanceID == uFocusTargetInstanceId)`
- `vFocusAlphaMult = isFocusTarget ? 1.0 : dimAlpha`

**片元（`galaxyActive.frag.glsl`）**：

- `gl_FragColor = vec4(c, vFocusAlphaMult)`，其中 `c` 仍含 P10.2 `uDistanceFalloffMode` 对颜色的距离衰减。

---

## 5. 代码与文件操作清单

| 文件 | 操作 |
|------|------|
| `frontend/src/three/galaxyMeshes.ts` | `makeSharedUniforms` 增加 `uFocusCameraBlend`、`uFocusTargetInstanceId`、`uFocusNonTargetActiveAlpha`；active 材质 `transparent: true`、`depthWrite: false` |
| `frontend/src/three/shaders/galaxyActive.vert.glsl` | 新 uniform + `varying float vFocusAlphaMult`；早退分支赋值 `vFocusAlphaMult` |
| `frontend/src/three/shaders/galaxyActive.frag.glsl` | `varying vFocusAlphaMult`；输出 alpha |
| `frontend/src/three/scene.ts` | 引用上述 uniform；`applySelectionFrame` 各相位置写入；扩展 `GalaxyColorDebug` 与 `__galaxyColor.log()` |

**验证**：`frontend` 目录执行 `npm run build`（`tsc -b && vite build`）通过。

---

## 6. 验收建议（手动）

1. 宏观态点击一颗 slab 内 active 星：飞入过程中 **目标**在 active 层上仍清晰（alpha 1），其余 active 随相机缓动 **逐渐** 变淡至约 0.1。  
2. 完全进入 `selected`：非目标 active 稳定在低 alpha；焦点实例在双 mesh 上仍隐藏（Perlin 球为主视觉）。  
3. 取消 focus：非目标 active 随相机 **对称** 恢复至不透明。  
4. 控制台：`__galaxyColor.focusNonTargetActiveAlpha = 0.25` 等，观察非目标 active 终点透明度变化。

---

## 7. 已知限制与后续可选工作

1. **仅 active 层**：idle 不随 P11.1 压 **alpha**；**P11.2** 对非焦点 **idle** 使用 **L/C 乘子**（与 P11.1 分工，见 P11.2 实施报告）。  
2. **半透明排序**：InstancedMesh + 多半透明球体可能出现绘制顺序瑕疵；当前与 `depthWrite: false` 权衡一致，若问题明显可评估排序策略或改 RGB 乘子方案（会偏离「真 alpha」语义）。  
3. **原计划遮挡剔除**：未实现；若 Perlin 与近处 active 穿模仍困扰，可另开任务叠加「距离相机 + 半径」剔除或深度方案。

---

**主文档同步（2026-04-28）**：《视觉参数总表》§2 / §8 / 附录；《星球状态机 spec》§3.4.3–3.4.4；《TMDB 电影宇宙 Tech Spec》§1.1 active 条；`.cursor/plans/phase_11_focus_visual_upgrade_b71acde5.plan.md` P11.1 节与 todo `p111`。

---

*报告结束。*
