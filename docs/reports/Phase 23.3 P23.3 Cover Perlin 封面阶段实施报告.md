# Phase 23.3 P23.3 Cover Perlin 封面阶段实施报告

## 1. 背景与目标

Phase 23.3 将首屏从「加载完成 → 用户点 Start → 进入主体」改为「加载完成 → 自动解析 The Movie Today → WebGL 场景以 **cover mode** 挂载：仅渲染今日片相关视觉 + 中心 Perlin 球，空白拖拽复用 focus orbit，无 Start 按钮」。

- 计划 SSOT：`.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md` §P23.3  
- 初始实现分支：`feat/p23-3-cover-perlin-stage`（首交：`feat(P23.3): cover mode uniforms, orbit camera, remove Start CTA`）  
- 后续交互与缺陷修复：见会话 transcript  
  - [e6c182f8-6422-4525-b4f9-2834e53000dc](file:///c:/Users/pexy9/.cursor/projects/e-projects-chronicle-v3-3d-galaxy/agent-transcripts/e6c182f8-6422-4525-b4f9-2834e53000dc/e6c182f8-6422-4525-b4f9-2834e53000dc.jsonl)（cover → focus → 退出 focus 相机跳跃）  
  - [201f686c-32c3-4664-894f-d9331123121b](file:///c:/Users/pexy9/.cursor/projects/e-projects-chronicle-v3-3d-galaxy/agent-transcripts/201f686c-32c3-4664-894f-d9331123121b/201f686c-32c3-4664-894f-d9331123121b.jsonl)（0% 卡住、Perlin/HUD、遮挡、hover 白圈、UI 半径与主体对齐）

本报告汇总 **P23.3 范围内的最终决策** 与 **已落地的最终操作**（含首版与后续补丁）。

---

## 2. 最终决策（定稿）

### 2.1 状态机与入口

- **移除 Start**：`Loading` 不再提供 `await-start` / `onStart`；galaxy + index 就绪后进入 `cover-loading-today`，解析 `today.json`（或 fallback），再进入主场景。  
- **Cover 与主体共用单场景**：`mountGalaxyScene` 在数据与 today 解析完成后立即挂载；cover 通过 **GPU uniform** 与 **store** 协同，而非第二套渲染器。  
- **`selectedMovieId` 在 cover 阶段保持 `null`**，避免 drawer 提前展开；进入 focus 时由 `exitCoverIntoFocus` 写入今日 `id`。

### 2.2 Cover mode 渲染（GPU）

- 新增 uniform：`uCoverMode`、`uCoverTodayInstanceId`、`uCoverActiveSizeBoost`。  
- **Culling**：`uCoverMode > 0.5` 且 `gl_InstanceID != uCoverTodayInstanceId` 时顶点 early-out（idle + active 一致）。  
- **低 vote 可见性**：对今日 instance 应用 `uCoverActiveSizeBoost`（实现中取约 **4**），仅影响 **仍绘制的壳**；与 Perlin 同屏时的最终策略见 §2.5。  
- **Near-Z**：今日 instance 在 cover 下与 focus 类似，参与 **exempt near cull**，避免被 `uNearCullWorldZ` 误杀。

### 2.3 相机与 orbit

- Cover 阶段 **复用主体 focus 的 orbit 拖拽**（`attachGalaxyCameraControls` 的 `orbit` 分支 + `?orbitDrag=normal|inverted`）。  
- **`macroZWheel`**：cover 下关闭时间轴滚轮宏观行为（与 orbit 并存时语义冲突）。  
- **Cover → focus**：通过 `exitCoverPreserveOrbit`，`beginSelect` 在从 idle 进入时 **不重置** `focusOrbit`（沿用 yaw/pitch）。  
- **Cover → focus → 退出 focus（deselect）**：`restCam` **不得**在 `idle` 时简单 `copy` orbit 下的 `camera.position`。当 `exitCoverPreserveOrbit` 流程曾发生时，必须用与 idle tick 一致的 **宏观浏览机位**（`zCurrent - zCamDistance` + `clampGalaxyCameraXY`）预计算 **`restCam`**，否则 deselect 动画结束后再被 idle tick 拽回宏观位会产生 **跳跃**（见 §3.2）。

### 2.4 Perlin 球与 idle 分支

- Cover 下 **`selectionPhase` 仍为 `idle`**，但需 **显示 Perlin** 并与 focus 共用 **`setFocusOrbitCameraPosition` / `FOCUS_PERLIN_CAMERA_STANDOFF`**。  
- 在 `applySelectionFrame` 的 idle 分支中：若 `coverMode && todayMovieId`，则设置与 **selected** 等价的 blend（`uFocusCameraBlend = 1`）、`planet` 可见、`setFromMovie` 在 bootstrap 中完成；**`uFocusedInstanceId = 今日 instance index`**，使 idle/active 着色器对今日星走 **`isFocused` 零尺寸路径**，避免放大的 icosphere **深度遮挡 Perlin**。  
- **`wantOpaque`（active 材质 path A/B）**：cover+Perlin 时与 focus 一致走 **透明 path B**，避免错误深度排序。

### 2.5 HUD 与 Cover 叠层

- **Cover 阶段**：仅保留 **全屏 canvas**、**CoverBackdrop**（双品牌字、无 click hint）、以及 **HoverRing + MovieTooltip**（z-index 高于 backdrop，保证可交互与可读）。  
- **其余 HUD**（SearchBar、Timeline、Drawer、右上角 chrome、FocusExitButton、FocusLReference 等）在 `coverMode` 下 **不挂载**，避免「遮住但仍可点」的幽灵交互。

### 2.6 Hover / 拾取 / UI 半径（与主体同一套逻辑）

- 引入 **`planetAnchorMovieId()`**：`selectedMovieId ??`（cover 下）`todayMovieId`。  
- **`focusPlanetBeatsActiveAlongRay`**：始终用锚点片 + `selectionPlanet.lastRadius` 计算 `tFocus`，与 **同一套** `pickClosestActiveMovieAlongRay` 参数比较 `t`（P11.6 语义）。  
- **`coverTodayWorldPickRadius`**：封面仅拾取今日时，对该 instance 的 CPU 射线球半径使用 **`lastRadius`**，而不是 boost 后的 active 壳，从而使 **`tFocus < pickedActive.t`** 在 cover 下也成立，**hover 白圈使用 `computeWorldSphereScreenRadiusCss(lastRadius)`**，与主体 focus 一致。  
- **结论**：白圈过大 **不是**「Perlin 相机与 active 相机两套」导致，而是 **hover 曾错误使用 boost 后的 active 半径**；修复后统一走 **Perlin 世界半径** 与主体路径。

### 2.7 加载与开发体验（P23.3 迭代中暴露的问题）

- **首屏必须触发 `fetchGalaxyData()`**：仅失败页 retry 会导致 store 长期 `idle`、`loadProgress` 为 `null`，界面卡在 **0% Download**。  
- **下载前进度**：进入 loading 时下发 `preparingDownload`；`fetch` 前 emit 进度；Download 阶段在 `downloadedBytes === 0` 时可设 **下限百分比**，避免长时间 0% 误解。  
- **Butler 字体与 `base` 子路径**：`index.css` 中绝对 `/fonts/butler/` 在 **`base` 非 `/`** 时可能拿到 HTML，触发 OTS `invalid sfntVersion`；通过 Vite 插件将 CSS 内 url 改写为 **带 `base` 前缀** 的路径（实现以当前 `vite.config.ts` 为准）。

---

## 3. 最终操作清单（按模块）

### 3.1 新增 / 调整的前端模块

| 区域 | 文件 | 操作摘要 |
|------|------|----------|
| Store | `frontend/src/store/coverModeStore.ts` | `coverMode`、`todayMovieId`、`setCover`、`exitCoverIntoFocus`、`exitCoverPreserveOrbit` |
| HUD | `frontend/src/hud/CoverBackdrop.tsx` | 双品牌字、`pointer-events: none`、暗色下 `text-white` |
| App | `frontend/src/App.tsx` | 阶段：`cover-loading-today` → `resolveTodayMovieId` → `setCover` → 挂载场景；cover 下条件渲染 HUD；`useEffect` 挂载 `fetchGalaxyData`（补丁） |
| Loading | `frontend/src/components/Loading.tsx` | 移除 Start / `await-start`；索引未 terminal 前不进入 brand 动画 |
| Stories | `frontend/src/components/Loading.stories.tsx` | 同步新 API |
| Galaxy | `frontend/src/three/galaxyMeshes.ts` | cover 相关 uniform |
| Shaders | `frontend/src/three/shaders/galaxyIdle.vert.glsl`、`galaxyActive.vert.glsl` | cover cull、boost、near exempt |
| Scene | `frontend/src/three/scene.ts` | cover orbit、`applySelectionFrame` idle+Perlin、`snapshotMacroBrowseRestCam` + `restCam` 修正、constellation 在 cover 下关闭、uniform 每帧同步、`beginSelect` preserve orbit |
| Pick | `frontend/src/three/screenRadius.ts` | `pickClosestActiveMovieAlongRay` 支持 `coverTodayInstanceIndex`、`coverActiveSizeBoost`、`coverTodayWorldPickRadius` |
| Interaction | `frontend/src/three/interaction.ts` | cover 点击 → `exitCoverIntoFocus`；`planetAnchorMovieId`、`buildActivePickOptions`、hover 与主体对齐 |
| 数据/构建（补丁） | `frontend/src/store/galaxyDataStore.ts`、`frontend/src/data/loadGalaxyGzip.ts`、`frontend/vite.config.ts`、`frontend/src/lib/strings.ts`、各 `locales/*.json` | 首屏 fetch、准备下载文案、Butler base 插件等（以仓库为准） |

### 3.2 相机 `restCam` 修正（transcript e6c182f8）

- **问题**：cover 进入 focus 时 `selectionPhase === 'idle'` 但相机在 orbit 位，`restCam.copy(camera.position)` 把 **orbit 快照**当成 deselect 目标；idle tick 下一帧又用宏观位覆盖 → **跳变**。  
- **操作**：新增 **`snapshotMacroBrowseRestCam(out)`**：临时将 `camera.position.z = zCurrent - zCamDistance` 并 `clampGalaxyCameraXY`，写入 `out` 后恢复相机；当 **`exitCoverPreserveOrbit`** 为真时，`onSelectionStore` 的 idle 分支用该快照填充 **`restCam`**。

### 3.3 Perlin / HUD / 遮挡 / Hover（transcript 201f686c）

1. **Perlin + 机位**：idle+cover 分支显示 planet，bootstrap `setFromMovie` + `animateZCurrentTo(today.z)`；`wantOpaque` 在 cover+Perlin 时走 focus 路径。  
2. **HUD**：`App` 中 cover 时去掉 SearchBar/Timeline/Drawer 等，保留 HoverRing/MovieTooltip。  
3. **Active 挡 Perlin**：cover idle 下 **`uFocused = idxToday`**，今日双网格不绘制。  
4. **Hover 白圈**：`planetAnchorMovieId` + `coverTodayWorldPickRadius: lastRadius` + 统一 `focusPlanetBeatsActiveAlongRay` / `setHoverFromClient`。

---

## 4. 验收要点（P23.3）

- 加载完成 → **无 Start** → 自动 today → 场景进入 cover。  
- Cover：**仅今日**相关粒子壳策略 + **Perlin** 可见；**无**其余星拾取；空白拖拽 orbit 与 `orbitDrag` 一致。  
- 点击今日（及后续 P23.4 的键盘兜底）→ focus + drawer；**orbit 角度沿用**。  
- 退出 focus → 回宏观 **无二次跳跃**（`restCam` 与 idle tick 一致）。  
- Cover：**HoverRing + MovieTooltip** 可用，白圈与 **Perlin 屏幕投影**一致。  
- 首屏 gzip：**非 0% 假死**（有 preparing / 最小进度）；Butler 在 dev/preview 下 **不返回 HTML 当字体**。

---

## 5. 已知边界与后续（P23.4+）

- **Enter / Space**、Tab 可达透明按钮、cover 下 ESC 策略等，计划在 **P23.4** 与 a11y 段落对齐。  
- **OG / 自定义域名 / 文档 SSOT** 属 P23.5–P23.7，不在本报告范围。

---

## 6. 参考

- Phase 23 总计划：`.cursor/plans/phase_23_movie_today_domain_og_8aceff5a.plan.md`  
- P23.2 Loading 报告：`docs/reports/Phase 23.2 P23.2 Loading Figma 对齐实施报告.md`  
- Transcript（父会话）：  
  - `e6c182f8-6422-4525-b4f9-2834e53000dc`  
  - `201f686c-32c3-4664-894f-d9331123121b`
