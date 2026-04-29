# Phase 12.5 · P12.5 selectionMask 渲染通路 — 实施报告

> 对应 [Phase 12 计划](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md) 中 **P12.5**（`p125-selection-mask-pipeline`）：为每人实例一位掩码建立 **`uSelectionMask`（R8 DataTexture）** + **`uSelectionMode`**，idle/active 顶点着色器在时间轴 `inFocus` 之上可切换为 **mask 覆盖**；`scene` 订阅 `selectionIds` 并调用 `setSelectionMask`；供 **P12.6**（人名/genre 多 active + viswindow 解耦）与 **P12.7**（连线）使用。  
> **SSOT**：[`星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) §3.6（与 Tech Spec §4.5 渲染契约一致）。  
> **日期**：2026-04-29。

---

## 1. 目标与最终决策

| 议题 | 决策 |
|------|------|
| 掩码载体 | **`THREE.DataTexture`**，`RedFormat` + `UnsignedByteType`，每 texel **0 / 255** 表示该实例是否命中 selection；`NearestFilter`，**不 flipY**，避免 UV 与 row-major 写入错位。 |
| 实例索引 ↔ texel | `gl_InstanceID` 与 `movies[]` 数组序一致；TMDB `Movie.id` → `instance index` 由 **`buildMovieIdToIndexMap(movies)`** 在 `mountGalaxyScene` 时构建并 **assert 无重复 id**。 |
| `uSelectionMode` 语义（本阶段实装） | **0**：与 P11 一致，**仅**时间轴条带推导 `inFocus`（mask 采样仍执行但不改写视觉）。**1**：**完全用 mask 替代**顶点着色器内的 `inFocus`（与计划 snippet 一致：`inFocus = selMask`）。**2**：规范预留（mix-with-inFocus），**未接线**。 |
| 写入入口 | **`setSelectionMask(ids \| null, idToIndex, uniforms)`**：`null` 或 **`[]`** → 清零纹理、`uSelectionMode=0`、`uSelectionCount=0`；非空 id 列表 → 映射到实例下标、写 255、**`uSelectionMode=1`**（若成功写入数 &gt; 0）。无法解析的 id **跳过并 `console.warn`**。 |
| Store 联动 | **`useGalaxyInteractionStore`** 的 **`selectionIds`** 变化时（**引用级**比较）调用 `setSelectionMask`；挂载时 **同步一次**初始状态。 |
| `uMovieCount` | 留在 **CPU uniform bag**（供 `setSelectionMask` 校验实例下标）；**顶点着色器未声明**该 uniform（避免无用 GPU uniform；实例合法性由数据管线保证）。 |
| **`MAX_TEXTURE_SIZE` 约束（关键）** | 初版将纹理做成 **`movieCount × 1`** 单行，在 ~59k 影片下超过典型 **`gl.MAX_TEXTURE_SIZE`（16384）**，触发 Three 警告与 WebGL 上传失败。**最终**采用 **2D atlas**：`width = min(movieCount, cap)`，`height = ceil(movieCount / width)`，**`cap = floor(renderer.capabilities.maxTextureSize)`**，并增加 **`uSelectionAtlasWidth` / `uSelectionAtlasHeight`** 与着色器内 **行主序 UV** 与 CPU 写入 **同构**。若 `movieCount > cap²` 则 **抛错**（当前全量规模远小于 `16384²`，可视为硬边界）。 |
| 资源释放 | `createGalaxyDualMeshes` 的 `dispose` 中 **先 `disposeSelectionMaskTexture()`** 再处理几何/材质。 |
| 开发流程 | 在独立 Git 分支 **`feature/p12-5-selection-mask`** 上实现并提交（见 §7）。 |

---

## 2. 交付物清单

| 类型 | 路径 | 说明 |
|------|------|------|
| 双网格 + 共享 uniform | [`frontend/src/three/galaxyMeshes.ts`](../../frontend/src/three/galaxyMeshes.ts) | `createGalaxyDualMeshes(movies, pixelRatio, maxTextureSize)`；`makeSharedUniforms` 内创建 mask DataTexture、**`uSelectionMask` / `uSelectionCount` / `uSelectionMode` / `uMovieCount` / `uSelectionAtlasWidth` / `uSelectionAtlasHeight`** |
| 掩码工具 | [`frontend/src/three/selectionMask.ts`](../../frontend/src/three/selectionMask.ts) | **`computeSelectionMaskAtlasDimensions`**；**`buildMovieIdToIndexMap`**；**`setSelectionMask`**；**`SelectionMaskUniformBag`** 类型 |
| 场景挂载 | [`frontend/src/three/scene.ts`](../../frontend/src/three/scene.ts) | `renderer.capabilities.maxTextureSize` 传入 `createGalaxyDualMeshes`；构建 **`selectionMaskUniforms`**；**`syncSelectionMaskFromStore`** + **subscribe**；**dispose** 时取消订阅 |
| Idle 顶点着色器 | [`frontend/src/three/shaders/galaxyIdle.vert.glsl`](../../frontend/src/three/shaders/galaxyIdle.vert.glsl) | 条带 `inFocus` 后采样 mask；**`uSelectionMode == 1`** 时 **`inFocus = selMask`** |
| Active 顶点着色器 | [`frontend/src/three/shaders/galaxyActive.vert.glsl`](../../frontend/src/three/shaders/galaxyActive.vert.glsl) | 同上 |

---

## 3. 纹理布局与着色器 UV（2D atlas）

**实例下标** `i ∈ [0, movieCount)`：

- `atlasW = uSelectionAtlasWidth`，`atlasH = uSelectionAtlasHeight`
- `x = i mod atlasW`，`y = floor(i / atlasW)`
- **CPU 写入**：`offset = y * atlasW + x`，`data[offset] ∈ {0, 255}`
- **GPU 采样**（与 idle/active.vert 一致）：

```glsl
float aw = float(max(uSelectionAtlasWidth, 1));
float ah = float(max(uSelectionAtlasHeight, 1));
float idF = float(gl_InstanceID);
float ax = mod(idF, aw);
float ay = floor(idF / aw);
vec2 selUv = vec2((ax + 0.5) / aw, (ay + 0.5) / ah);
float selMask = texture2D(uSelectionMask, selUv).r;
```

**示例**（`maxTextureSize = 16384`，`movieCount = 59014`）：`atlasW = 16384`，`atlasH = 4`，总 texel 65536，**合法上传**。

---

## 4. 验收方式

| 步骤 | 预期 |
|------|------|
| 正常启动应用 | 控制台出现 **`[GalaxyMeshes] P12.5 selection mask atlas WxH texels`**，**无** `Image in DataTexture is too big` / `texSubImage2D` **无效值** 类错误。 |
| **DevTools** 设置 `useGalaxyInteractionStore.setState({ selectionIds: [<若干存在的 TMDB id>] })` | **仅**命中实例呈现 **active** 尺度语义（mask 通道打开时条带逻辑被覆盖）；无效 id 被跳过。 |
| 清空选择（`selectionIds: null` 或 `[]`） | `uSelectionMode` 回到 **0**，画面与 **P11 时间轴条带基线**一致（regression）。 |
| `npm test`、`npm run build`（`frontend`） | 通过（本阶段未新增专用 Vitest 文件；与掩码相关的逻辑可在后续与 P12.6 一并补测）。 |

---

## 5. Git 分支与提交（实施记录）

| 说明 | 值 |
|------|-----|
| 分支名 | `feature/p12-5-selection-mask` |
| 提交 `d39e0ce` | `feat(P12.5): selectionMask DataTexture + uSelectionMode shader path` — 首版通路（单行纹理）。 |
| 提交 `ce71a2c` | `fix(P12.5): pack selection mask in 2D atlas under MAX_TEXTURE_SIZE` — **修复**超大单行纹理超出 **`MAX_TEXTURE_SIZE`** 的运行时错误。 |

合并策略由仓库维护者决定（PR / 直接 merge）。

---

## 6. 已知边界与后续 Phase

| 项目 | 说明 |
|------|------|
| **P12.6** | `searchMode === 'person' \| 'genre'` 时在同一 RAF 或订阅链路中将 **`uSelectionMode`** 置 **1**、与 **viswindow** 视觉解耦等，在计划中单列为实现项；**本报告仅交付掩码基础设施**。 |
| **`uSelectionMode == 2`** | 接口占位，着色器未分支。 |
| **focus × mask** | 风险表里「焦点实例不被 mask 错误覆盖」等细则：当前顶点路径仍为 **`isFocused` 优先隐藏双网格实例**；与 mask 叠加的完整优先级可在 P12.6/P12.8 按 spec 收口。 |
| **实例数上界** | `movieCount > maxTextureSize²` 时 **`computeSelectionMaskAtlasDimensions` 抛错**；若未来实例数逼近该上界，需 **分块纹理或多 pass**（当前产品规模不需要）。 |

---

## 7. 参考资料

- Phase 12 总计划：[`.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md`](../../.cursor/plans/phase_12_search_and_select_6c9bfa94.plan.md) — §「P12.5 selectionMask 渲染通路」
- 状态机 / 掩码数据流：[`docs/project_docs/星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) §3.6
