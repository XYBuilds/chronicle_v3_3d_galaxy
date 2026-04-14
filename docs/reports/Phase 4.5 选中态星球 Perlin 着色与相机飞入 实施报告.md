# Phase 4.5 — 选中态（微观层）：IcoSphere、Perlin 噪声着色与相机飞入动画 — 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 4.5「选中态（微观层）」  
> **计划 Todo ID**: `p4-selected-planet`（YAML frontmatter 中已标记为 **`completed`**）  
> **报告日期**: 2026-04-15  
> **实施分支**: `feat/phase-4-5-selected-planet`  
> **提交**: `5767b22` — `feat(frontend): Phase 4.5 selection planet, Perlin shader, camera fly-to`  
> **范围**: Three.js 选中星球 mesh、GLSL 3D 噪声材质、与 Zustand `selectedMovieId` 联动的相机动画与粒子全局透明度、相机控制在动画期间的输入锁定、详情抽屉 Sheet 的延迟打开以贴合时序；**不包含** Phase 4.6 的 Storybook 全量收口

---

## 1. 本次目标

依据开发计划 Phase 4.5 与其中验收描述，本次交付目标为：

1. **`planet.ts`**：在选中影片的世界坐标 `(x, y, z)` 处放置**细分二十面体**（`IcosahedronGeometry`，作为 IcoSphere 的工程近似），表面使用 **Perlin 风格 3D 噪声**（GLSL 实现为 value noise + FBM）的 `ShaderMaterial`。  
2. **流派混色**：按 `Movie.genres` 顺位，以 **黄金比衰减** \(w_k = (1/\varphi)^{k-1}\) 归一化权重，从 `meta.genre_palette` 解析 sRGB；缺失条目回退到 `movie.genre_color`。控制台输出 **`[Planet] genres=… weights=… colors=…`**，满足计划 Step B 的可观测性要求。  
3. **相机**：选中时在 **约 700 ms** 内使用 **`easeOutCubic`** 将相机从当前位置插值到目标位姿（XY 对齐影片，Z 沿当前「面向 +Z」轴在影片前方 `standoff`）；取消选中时在 **约 450 ms** 内插值回**首次进入选中前**记录的 `restCam`。  
4. **粒子层**：通过粒子材质 uniform **`uPointsOpacity`** 实现全局淡出（选中末态为 0）、取消选中时恢复为 1；片段在极低 alpha 时 **`discard`**，避免无效片元。  
5. **输入**：在 `selecting` / `deselecting` 阶段通过 `getInputLocked()` **禁止** truck / pedestal / wheel，避免用户操作与程序化相机冲突。  
6. **HUD 时序**：`MovieDetailDrawer` 在「从 null 到首次有选中 id」时 **延迟约 420 ms** 再打开 Sheet，使抽屉略晚于相机与星球动画，贴合计划「相机 → 粒子/球体 → 抽屉」的叙述顺序；同一选中会话内切换另一部影片时 Sheet **立即**保持打开。  
7. **Git**：按用户要求在**独立分支**上完成实现并提交。  
8. **构建验证**：`npm run build --workspace=frontend`（`tsc -b && vite build`）通过。

计划中提到的 **Step A（先用 `MeshStandardMaterial` 绿色球体验证）** 在本次交付中**未单独保留为开关**：实现直接进入 Step B 的 ShaderMaterial，功能上仍可通过控制台日志与视觉确认坐标与动画链路。

---

## 2. Git 与执行前状态

| 项 | 内容 |
| --- | --- |
| 基线分支 | `main` |
| 用户要求 | 先新开分支再实施 Phase 4.5 |
| 创建分支 | `git checkout -b feat/phase-4-5-selected-planet` |
| 结果 | 在该分支上完成修改并以单次提交 `5767b22` 落地 |

---

## 3. 代码改动概览

### 3.1 新增文件

| 路径 | 说明 |
| --- | --- |
| `frontend/src/three/planet.ts` | `createSelectionPlanet()`：Ico 球体 mesh、`setFromMovie` / `setOpacity` / `dispose`；流派权重与调色板解析；`[Planet]` 日志 |
| `frontend/src/three/shaders/perlin.vert.glsl` | 传递 `vObjPos`、`vNormal`（噪声与边缘光使用） |
| `frontend/src/three/shaders/perlin.frag.glsl` | 3D hash lattice + `noise3` + 4 倍频 FBM；四路 `uColor*` / `uWeight*`；`uTime` 缓慢漂移；`uAlpha` |

### 3.2 修改文件

| 路径 | 说明 |
| --- | --- |
| `frontend/src/three/scene.ts` | 引入 `genre_palette` 的 `meta` 类型扩展；挂载星球；`useGalaxyInteractionStore.subscribe` 驱动 `idle` / `selecting` / `selected` / `deselecting` 状态机；每帧 `applySelectionFrame`；dispose 时退订并 `planet.dispose()` |
| `frontend/src/three/galaxy.ts` | `ShaderMaterial` 增加 `uPointsOpacity`（默认 1）；`transparent: true` |
| `frontend/src/three/shaders/point.frag.glsl` | 读取 `uPointsOpacity` 写入 `gl_FragColor.a`，低 alpha `discard` |
| `frontend/src/three/camera.ts` | `GalaxyCameraControlOptions.getInputLocked?`；在 pointer / wheel 路径早退 |
| `frontend/src/components/Drawer.tsx` | `MovieDetailDrawer`：`sheetDelayedOpen` + `prevSelectedRef`；首次选中延迟打开 Sheet |

### 3.3 依赖

- **未新增** npm 依赖；继续使用 `vite-plugin-glsl` 加载 `.glsl`。

---

## 4. 详细实现说明

### 4.1 星球几何与材质

- **几何**: `THREE.IcosahedronGeometry(1, 3)`，在 `setFromMovie` 中 `mesh.scale.setScalar(worldRadius)`，球心置于 `(movie.x, movie.y, movie.z)`。  
- **世界半径 `worldRadius`**: 由 `worldSpan(meta)`（XY/Z 包络最大值）推导，`clamp(span * 0.014, 0.07, span * 0.05)`，避免 subsample 与全量数据下尺度失当。  
- **`standoff`**: `max(r * 4.2, span * 0.018)`，目标相机位置为 `(mx, my, mz - standoff)`，与现有相机欧拉角 **面向 +world Z** 的设定一致（与 Phase 3.4 `GALAXY_CAMERA_EULER` 一致）。  
- **`renderOrder`**: 星球 mesh 设为 `1`，尽量后绘于点云之上。

### 4.2 噪声着色与流派权重

- 片元着色器中对 `vObjPos` 缩放后叠加 `uTime` 驱动的慢平移，得到**随时间轻微流动**的表面纹理。  
- 基础色 `cMix = Σ uWeight_i * uColor_i`，再经 FBM 调制与简单 rim 项增强体积感。  
- 若 `genres` 为空，使用单标签 `'Unknown'` 与权重 1，颜色回退 `genre_color`。

### 4.3 场景内选中状态机

- **订阅**: `useGalaxyInteractionStore.subscribe(onSelectionStore)`；挂载后手动调用一次与「`prev.selectedMovieId === null`」等价的初始化，处理极端情况（首帧即有选中 id）。  
- **`restCam`**: 仅在 `selectionPhase === 'idle'` 且即将进入新一次选中时，从当前 `camera.position` 拷贝，用于取消选中后**回到进入微观层前的机位**。  
- **切换影片**（`selected` 或 `selecting` 下 id 变更）: **不**重写 `restCam`；`fromCam` 取当前相机位置，`toCam` 取新影片目标，实现连续飞入。  
- **`deselecting` 过程中再次选中**: 与上类似，从当前插值中的相机位置开始新的 `selecting`。  
- **日志**: `[Selection] phase=selecting | …`、`phase=selected`、`phase=deselecting`、`phase=idle`，便于对照计划中的分步验收。

### 4.4 粒子透明度与深度

- 选中末态 `uPointsOpacity = 0`，依赖片段 **`discard`** 避免全透明点仍写深度；材质为 `transparent: true`，`depthWrite: true`（与 Phase 3.5 注释中「点云深度正确性」折中：仅在淡出窗口内接受潜在排序瑕疵）。  
- **`uPointsOpacity` 未在 `point.vert.glsl` 中重复声明**，由 Three.js 在片元阶段绑定同名 uniform。

### 4.5 相机控制锁定

- `mountGalaxyScene` 将 `getInputLocked: () => inputLocked` 传入 `attachGalaxyCameraControls`。  
- `inputLocked` 在 `selecting` / `deselecting` 的 `applySelectionFrame` 分支内置为 `true`；`selected` 与 `idle` 为 `false`，允许用户在「已对准星球」后继续 truck / Z-scroll。

### 4.6 详情抽屉延迟

- `MovieDetailDrawer` 使用 `useRef` 记录上一次非 null 的 `selectedMovieId`。  
- 当 `prevSelectedRef.current === null` 且新 id 非 null：先 `setSheetDelayedOpen(false)`，**420 ms** 后置 `true`。  
- 当在同一会话中 id 切换（非 null → 另一非 null）：**立即** `setSheetDelayedOpen(true)`，避免抽屉闪烁关闭。  
- 关闭 Sheet 仍通过 `onOpenChange(false)` 清空 `selectedMovieId`，与 Phase 4.3 行为一致。

---

## 5. 验收对照（计划 Phase 4.5 Checkpoint）

| 计划描述 | 实施情况 |
| --- | --- |
| `planet.ts` + IcoSphere + Perlin shader | 已交付 `planet.ts` + `perlin.vert/frag.glsl`（Ico 用 `IcosahedronGeometry` 近似） |
| 相机推进 600–800 ms、`easeOutCubic` | 使用 **700 ms**、`easeOutCubic` |
| 粒子 alpha 渐出 + 球体渐入 | `uPointsOpacity` 与 `planet.setOpacity` 与相机动画同帧驱动 |
| 抽屉滑出 | Sheet 首次选中 **延迟 420 ms** 打开 |
| 取消选中反向 400–500 ms | 使用 **450 ms** 反向插值 |
| Step B：`[Planet] genres weights colors` | 已实现 |
| Step A 绿球 | 未保留独立分支；由当前 Shader 一步到位 |

---

## 6. 已知限制与后续可选优化

1. **IcoSphere 命名**: Three.js 核心无 `IcoSphereGeometry`，采用**高细分 Icosahedron** 近似，与计划文案「IcoSphere」语义一致。  
2. **点云透明 + depthWrite**: 淡出阶段若出现极轻微粒子间排序瑕疵，可考虑仅在 `uPointsOpacity < 1` 时动态 `depthWrite: false`（需评估全量 60k 点的副作用）。  
3. **`restCam` 语义**: 取消选中始终回到**第一次选中前**记录的机位；若用户在 `selected` 阶段大幅 truck，取消选中仍会回到旧 `restCam`，属当前产品取舍（与「离开微观层回到宏观漫游起点」一致）。  
4. **Bloom 与透明星球**: 当前 Bloom `strength` 在 `scene.ts` 中可能为 0（历史调参）；星球高亮主要依赖片元直接亮度，不依赖 Bloom 必开。

---

## 7. 建议自测步骤

1. `npm run dev`（workspace `frontend`），确保 `frontend/public/data/galaxy_data.json` 存在。  
2. 点击一颗粒子：观察相机平滑推进、粒子隐去、噪声星球显现；约半秒后右侧 Sheet 打开。  
3. 关闭 Sheet 或点击空白取消选中：星球消失、粒子恢复、相机回到首次选中前大致位置。  
4. 打开 DevTools：确认 `[Planet]`、`[Selection]`、`[MovieDetailDrawer]` 日志顺序与内容合理。  
5. `npm run build --workspace=frontend`：确认无类型错误与构建失败。

---

## 8. 小结

Phase 4.5 已在分支 **`feat/phase-4-5-selected-planet`** 上完成：选中时以 Ico 细分球体 + GLSL 噪声材质呈现「微观层」星球，并与相机飞入、粒子淡出及详情抽屉延迟打开串联；取消选中时反向播放并恢复宏观点云视图。计划项 **`p4-selected-planet`** 在 `tmdb_galaxy_dev_plan_5ad6bea5.plan.md` 的 YAML todos 中已更新为 **`completed`**。
