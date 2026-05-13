# Phase 26.3 — Camera-distance idle 近距透明渐变与拾取对齐（最终实施报告）

| 项 | 内容 |
| --- | --- |
| Phase | 26（设备与空间感优化）子项 **P26.3** |
| 计划来源 | [`.cursor/plans/phase_26_device_spatial_optimization.plan.md`](../../.cursor/plans/phase_26_device_spatial_optimization.plan.md) §「P26.3 Camera-distance Idle Near-cull 实验」 |
| 日期 | 2026-05-13 |
| 修订 | 2026-05-13 — 消除代码/注释与默认 `enabled: 1` 的漂移：`idleNearFade.ts`、`galaxyMeshes.ts`、`scene.ts`、`galaxyIdle.vert.glsl` 注释已与 SSOT 对齐；本报告 §6 重写。 |
| 关联会话 | Cursor agent transcript [P26.3 idle near-fade](f96126be-41c3-4f04-b825-c948afe6fe65)（本地 `agent-transcripts` 目录，文件名同 UUID） |
| 状态 | **已落地**：idle 双网格之 **idle** 支路采用 **相机世界坐标 → 星体世界坐标** 的欧氏距离驱动 **alpha 渐变**；**CPU active 射线拾取**在「低 slab 权重 + 极低 idle 透明度」时与视觉对齐；**Dev 控制台**可调 uniforms。 |
| 报告性质 | **工作留档**：汇总本阶段最终决策与已执行操作。**参数 SSOT** 以 [`frontend/src/three/idleNearFade.ts`](../../frontend/src/three/idleNearFade.ts) 中 `IDLE_NEAR_FADE_DEFAULTS` 与运行时 `galaxy*.ShaderMaterial` 的同名 uniform 为准；若与本文表格不一致，以代码为准。**P22.1 world-Z 近裁**已于 **Phase 27.4** 从着色器与拾取中删除；下文 **D3** 及「active 保留 `uNearCullWorldZ`」等表述 **已作废**，以 **Tech Spec §1.4.5a** 与 **Phase 27.4** 实施报告为准。 |

**范围说明**：本阶段仅覆盖 **idle InstancedMesh** 的近距视觉与 **active 球拾取** 的辅助门槛。**Phase 27.4** 起 **P22.1 `uNearCullWorldZ` 已从 idle/active 顶点着色器与拾取路径移除**；本报告历史段落若仍写「active 保留 Z 近裁」，视为过时，见 **Tech Spec §1.4.5a**。**不**包含 P26.4 文档全库 SSOT 同步（见 §8）。

---

## 1. 目标（与计划对齐）

1. **用相机距离替代「按 Z 硬裁切」的直觉**：以 `length(cameraWorld - starWorld)` 在近处压低 idle **alpha**，形成掠过感，而非 clip 外丢片元。
2. **可调实验参数**：`enabled / startDist / width / minAlpha` 映射为共享 shader uniforms，默认由 `IDLE_NEAR_FADE_DEFAULTS` 注入。
3. **拾取与视觉一致**：近处 idle 已极淡时，**不应**在「条带边缘、低 `inFocus`」区域仍被 active 射线球强命中；**focus / cover today** 与 shader 使用同一 **exempt** 语义。
4. **透明与性能路径显式化**：开启实验时 idle 从 **opaque + depthWrite** 切到 **transparent + 无 depthWrite**，并在报告中记录已知代价（排序与 overdraw），供 P26.4 / 生产决策引用。

---

## 2. 最终决策总表

| # | 决策 | 说明 |
| --- | --- | --- |
| D1 | **仅 idle 着色器做距离 alpha** | `galaxyIdle.vert.glsl` / `galaxyIdle.frag.glsl` 引入 `vNearFadeAlpha`；`galaxyActive.vert.glsl` **不**引入同款距离 fade（active 仍服务 slab 内高对比壳层）。 |
| D2 | **与 exempt 对齐** | `exemptIdleNearFade`（`uFocusedInstanceId` 命中 **或** cover today 实例）在距离 fade 上复用：**不参与**近距压暗（`nearFadeAlpha = 1`）。 |
| D3 | ~~**保留 legacy Z 近裁 uniform**~~ **（已删除，Phase 27.4）** | **`uNearCullWorldZ`** 与 **`nearCullWorldZ.ts`** 已从工程移除；**不得**再与 P26.3 拾取/ exempt 混为一谈。 |
| D4 | **CPU 使用 Three `smoothstep` 参数顺序** | `THREE.MathUtils.smoothstep(x, min, max)` 与 GLSL `smoothstep(edge0, edge1, x)` 参数顺序不同；`idleNearFade.ts` 已固定为 **`smoothstep(dist, startDist, startDist + width)`**，与 vert 中 `smoothstep(uIdleNearFadeStartDist, uIdleNearFadeStartDist + wFade, distCam)` **数值一致**。 |
| D5 | **拾取门限** | **P26.3**：当 `uIdleNearFadeEnabled > 0.5` 时，若 `!exemptFade && inFocus ≤ 0.5 && fadeAlpha ≤ minAlpha + 0.05`，则 **跳过**该实例的 active 球求交（`screenRadius.ts`）。**Phase 27.4** 起与 **Z 乘子**合并为 **乘积 `prod`** 与 **`floorA`** 门槛（见 Tech Spec **§1.5**）。`inFocus > 0.5` 的 slab 主体内仍允许拾取，避免挡在眼前的「主亮星」无法点中。 |
| D6 | **idle 材质双态** | `scene.ts` 每帧：**`uIdleNearFadeEnabled > 0.5` 或 `abs(uIdleZFadeMode) > 0.5`**（P27.4）→ `idleMaterial.transparent = true`、`depthWrite = false`、`alphaTest = 0.003`；否则恢复 **opaque + depthWrite**（与 P17.1 idle opaque 优化路径一致）。 |
| D7 | **默认参数（当前仓库）** | `IDLE_NEAR_FADE_DEFAULTS`：**enabled = 1**，**startDist = 4.0**，**width = 4.0**，**minAlpha = 0.1**（见 `idleNearFade.ts`）。即 **默认打开** idle 近距渐变与透明路径；若需完全回退实验，将 `enabled` 置 `0` 或通过 `window.__galaxyIdleNearFade.enabled = 0`。 |
| D8 | **Dev 调试面** | `window.__galaxyIdleNearFade`：`enabled / startDist / width / minAlpha` 读写即改共享 uniforms；`log()` 打印当前值与 defaults 引用。`dispose` 时从 `window` 上摘除。 |

---

## 3. 参数与公式（SSOT）

### 3.1 TypeScript 默认常量

定义于 [`frontend/src/three/idleNearFade.ts`](../../frontend/src/three/idleNearFade.ts)：

| 符号 | 当前默认值 | 含义 |
| --- | --- | --- |
| `enabled` | `1` | `> 0.5` 时启用 shader 分支 + idle 透明材质路径 + CPU pick gate。 |
| `startDist` | `4.0` | 世界单位：距离 **≤ start** 时 `smoothstep` 输出端为「近端」；与 `width` 共同决定渐变带。 |
| `width` | `4.0` | 世界单位：`smoothstep` 从 `startDist` 到 `startDist + width` 过渡到全不透明 alpha。 |
| `minAlpha` | `0.1` | 近端 alpha 下限（`mix(minAlpha, 1, t)`）。 |

### 3.2 Shader（与 TS 同构）

- **距离**：`distCam = distance(uCameraWorldPos, vec3(instanceMatrix[3][0..2]))`。
- **过渡**：`tFade = smoothstep(uIdleNearFadeStartDist, uIdleNearFadeStartDist + max(uIdleNearFadeWidth, 1e-6), distCam)`。
- **输出**：`nearFadeAlpha = mix(uIdleNearFadeMinAlpha, 1.0, tFade)`；片段着色器 `gl_FragColor = vec4(vColor, vNearFadeAlpha)`。

### 3.3 共享 Uniform 注入

[`frontend/src/three/galaxyMeshes.ts`](../../frontend/src/three/galaxyMeshes.ts) 的 `makeSharedUniforms` 将上述默认值写入 **idle / active 共用** uniform bag（`uIdleNearFade*`）；active 顶点着色器当前未读取这些 uniform，**无功能变化**。

---

## 4. 工程操作（修改路径一览）

| 路径 | 操作摘要 |
| --- | --- |
| `frontend/src/three/idleNearFade.ts` | `IDLE_NEAR_FADE_DEFAULTS`、`computeIdleNearFadeAlpha`（CPU 镜像）；模块注释与默认 `enabled === 1` 及关闭方式一致。 |
| `frontend/src/three/idleNearFade.spec.ts` | **新建**：Vitest 覆盖 disabled / exempt / 内外距离三段。 |
| `frontend/src/three/shaders/galaxyIdle.vert.glsl` | 增加 `uIdleNearFade*`、`starWorld`、`vNearFadeAlpha`；在 `sIdle` 有效分支内计算距离 fade；**uniform 块注释**与启用语义一致。 |
| `frontend/src/three/shaders/galaxyIdle.frag.glsl` | 输出带 **alpha** 的 `gl_FragColor`。 |
| `frontend/src/three/galaxyMeshes.ts` | 注册四个新 uniform；`export { IDLE_NEAR_FADE_DEFAULTS }`；**uniform 注册处注释**与 `idleNearFade.ts` 一致。 |
| `frontend/src/three/screenRadius.ts` | `pickClosestActiveMovieAlongRay` 增加 `cameraWorldPos`；在 fade 开启时调用 `computeIdleNearFadeAlpha` 并应用 **D5** 门槛。**Phase 27.4**：与 **`computeIdleZFadeAlpha`** 乘积门槛同构；移除 **`cameraWorldZ`** / Z 近裁过滤；**`nearCullExemptMovieId` → `idleNearFadeExemptMovieId`**。 |
| `frontend/src/three/interaction.ts` | `syncCameraWorldForPick()` 在构建 pick options 前刷新 `_pickCameraWorldPos`；传入 **`cameraWorldPos`** 与 **`idleNearFadeExemptMovieId`**（**Phase 27.4** 起不再传 **`cameraWorldZ`**）。 |
| `frontend/src/three/scene.ts` | `window.__galaxyIdleNearFade` 调试对象；`tick` 内 idle 材质透明/深度写切换；`dispose` 清理 `window` 引用；`import { IDLE_NEAR_FADE_DEFAULTS }` 用于 `log()` 提示；**JSDoc 与 idle 材质日志**与默认启用一致。 |
| `.cursor/plans/phase_26_device_spatial_optimization.plan.md` | 将 **p263** todo 标为 **completed**（计划内状态与实施同步）。 |

---

## 5. 验收结论（计划 §P26.3 对照）

| 计划条目 | 结论 |
| --- | --- |
| 近处星星掠过感、非突然消失 | **已满足**（alpha 连续；exempt 星仍全亮）。 |
| 闪烁 / 排序 / 性能 | **已识别风险、未做量化压测**：idle 开启透明后失去原 **opaque + depthWrite** 的排序优势；需在目标设备上补 **帧时间与 overdraw** 记录后再定是否生产默认（建议记入 P26.4）。 |
| picking 与透明度一致 | **部分满足**：对 `inFocus ≤ 0.5` 且 fade 近 **floor** 的候选跳过求交；`inFocus > 0.5` 仍拾取（见 **D5**）。 |
| 是否 production 默认 | **当前仓库选择为默认开启**（**D7**）；若产品决策回退，将 `enabled` 默认改 `0` 并更新本报告与 P26.4 SSOT。 |

---

## 6. 已知产品限制（非文档漂移）

- **active 网格无距离 fade**：极近机位下 slab 内 active 仍可能全不透明，与 idle 淡化并存；属 **P26.3 范围界定**（仅 idle 着色器与 idle 材质路径）。若需全链路一致，需另开任务改 `galaxyActive.vert.glsl` 与拾取半径模型。

**注释 SSOT（修订后）**：`IDLE_NEAR_FADE_DEFAULTS` 与 `uIdleNearFade*` 的语义以 [`frontend/src/three/idleNearFade.ts`](../../frontend/src/three/idleNearFade.ts) 模块注释为准；`galaxyMeshes.ts` 注册处、`scene.ts` 的 `window.__galaxyIdleNearFade`、`galaxyIdle.vert.glsl` 的 uniform 注释已与 **默认启用** 表述一致。

---

## 7. 验证命令（开发机）

```bash
cd frontend
npx vitest run src/three/idleNearFade.spec.ts
npx tsc --noEmit
```

浏览器控制台（运行时调参示例）：

```js
__galaxyIdleNearFade.log()
__galaxyIdleNearFade.enabled = 0   // 关闭实验
__galaxyIdleNearFade.startDist = 5
```

---

## 8. 后续（P26.4 建议）

- 将 **§3 参数表**、`uIdleNearFade*` 名称与默认值同步至 [`docs/project_docs/视觉参数总表.md`](../project_docs/视觉参数总表.md)（若维持 production 默认）。  
- 在 [`docs/project_docs/TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) 或 Tech Spec 中增加 **「宏观浏览 idle 透明路径」** 的设计说明与 **性能/排序** 注意事项。  
- 补充 **设备矩阵** 下的截图或简要数据，支撑「默认开启」或「回退为 opt-in」的最终产品决策。

---

## 9. 仓库指针（定稿参考）

- 最近相关提交（示例）：`git log --oneline -5 -- frontend/src/three/idleNearFade.ts`（当前可见如 `83ae6b7` 等浮点默认值一致性调整）。  
- 分支历史：曾使用 `phase/p26.3-camera-distance-near-cull` 承载开发；合并后以 `main` 线为准。

---

*本报告由实施阶段整理；参数与行为以 `frontend/src/three/idleNearFade.ts` 与 `galaxyIdle*.glsl` 为单一事实来源。*
