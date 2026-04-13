# Phase 3.4 Three.js 场景初始化与自定义相机控制器 — 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 3.4「Three.js 场景初始化」  
> **规范依据**: 计划 §3.4、`frontend-threejs.mdc`（轴向与 Z 平行、滚轮 Z 穿梭、拖拽 truck/pedestal、无旋转）、《TMDB 电影宇宙 Tech Spec.md》§4.2（`meta.z_range`、`meta.xy_range` 与相机初始位姿约定）  
> **报告日期**: 2026-04-14  
> **范围**: **`frontend/src/three/scene.ts`**（Renderer / Scene / Camera / 渲染循环）、**`frontend/src/three/camera.ts`**（自定义控制器）、**`App.tsx`** 挂载全屏画布；为支撑相机中心计算，在 **`loadGalaxyData.ts`** 中补齐 **`meta.xy_range`** 运行时校验。  
> **顺带说明（根目录 npm）**: 仓库根目录新增 **`package.json`** 脚本代理，解决在 **`E:\projects\chronicle_v3_3d_galaxy`** 直接执行 **`npm run dev`** 时因缺少根级 **`package.json`** 导致的 **ENOENT**（与 Phase 3.4 同次会话内完成，可与 3.4 一并审阅与提交）。

---

## 1. 摘要

在用户要求 **先新开 Git 分支再做** 的前提下，从 **`main`** 创建分支 **`phase-3.4-threejs-scene-camera`**，落实开发计划 **Phase 3.4**：

- 新增 **`mountGalaxyScene(container, meta)`**（`scene.ts`）：黑色场景、**WebGL** 渲染器、**透视相机**；初始位置为 **XY 取 `meta.xy_range` 中心**、**Z = `meta.z_range[0] - 2`**；朝向 **+world Z**（欧拉角 **`(0, π, 0)`**，与默认相机绕 Y 翻转 180° 等价），满足「**无轨道旋转、轴与 Z 平行**」的交互基线。
- 新增 **`attachGalaxyCameraControls`**（`camera.ts`）：**左键拖拽** → **truck X** + **pedestal Y**；**滚轮** → **沿 Z 平移**；每次交互后 **强制写回固定欧拉角**，防止旋转漂移。
- **`App.tsx`**：在 **`status === 'ready'`** 且 **`data`** 存在时，于 **`fixed inset-0`** 容器内挂载场景，卸载时 **`dispose()`**（取消 rAF、断开 ResizeObserver、移除监听、**`renderer.dispose()`**、从 DOM 移除 canvas）。
- **`loadGalaxyData.ts`**：在 **`validateMeta`** 中增加 **`meta.xy_range`** 的 **结构与有限数** 校验，避免 JSON 缺字段时在 Three 初始化阶段才失败。

**Git 提交（Phase 3.4 核心变更）**: **`5c8a6ba`** — `feat(frontend): Phase 3.4 Three.js scene and axis-parallel camera controls`。

**根目录 `package.json`**: 报告撰写时可能仍为 **未跟踪文件**（**`git status`** 显示 **`?? package.json`**）；用于从仓库根执行 **`npm run dev`** 等命令时 **转发到 `frontend/`**，建议单独 **`git add` + `commit`** 或并入下一 PR。

---

## 2. Git 与分支

| 项 | 内容 |
| --- | --- |
| 基线分支 | `main` |
| 工作分支 | **`phase-3.4-threejs-scene-camera`** |
| Phase 3.4 提交 | **`5c8a6ba`** — `feat(frontend): Phase 3.4 Three.js scene and axis-parallel camera controls` |

---

## 3. 执行操作清单（按时间顺序）

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | `git checkout -b phase-3.4-threejs-scene-camera` | 满足「新开分支再做」 |
| 2 | 新增 **`frontend/src/three/camera.ts`** | 固定朝向 + truck / pedestal / wheel；**`touchAction: 'none'`**；**`wheel` 非 passive** 以便 **`preventDefault`** |
| 3 | 新增 **`frontend/src/three/scene.ts`** | **`mountGalaxyScene`**：场景、相机、渲染器、**`ResizeObserver`** + **`window.resize`**、**rAF** 循环 |
| 4 | 修改 **`frontend/src/App.tsx`** | **`useRef`** + **`useEffect`** 在数据就绪后挂载 / 卸载场景；全屏黑色画布宿主 |
| 5 | 修改 **`frontend/src/utils/loadGalaxyData.ts`** | **`validateMeta`** 校验 **`xy_range.x` / `y`** 各为长度 2 的有限数数组 |
| 6 | `npm run build`（`frontend/`） | **TypeScript + Vite** 生产构建通过 |
| 7 | （同会话、根目录 DX）新增 **`package.json`**（仓库根） | **`npm run dev`** 等脚本 **`--prefix frontend`**，避免根目录 **ENOENT** |

---

## 4. 与开发计划 Phase 3.4 的对照

| 计划项 | 结果 |
| --- | --- |
| **`frontend/src/three/scene.ts`** — Renderer、Scene、PerspectiveCamera | ✅ |
| **`frontend/src/three/camera.ts`** — truck / pedestal / Z-scroll，**无旋转** | ✅ |
| 相机初始：XY 中心 + **Z = z_range[0] - 2**，**朝向 +Z** | ✅（**`GALAXY_CAMERA_EULER`** + 初始 **`position.set(cx, cy, zMin - 2)`**） |
| 黑色全屏 Canvas，无 WebGL 报错预期 | ✅（场景背景 **`0x000000`**，宿主 **`bg-black`**） |
| Console：**`[Scene] Renderer: WebGL2 \| … | Canvas: {w}x{h} | Camera initial Z: …`** | ✅ |
| 滚轮 → **`[Camera] Z: …`**；拖拽 → **`[Camera] X: … Y: …`** | ✅ |
| 相机 Rotation 保持初始值（控制器不引入轨道） | ✅（每次移动后 **`rotation.copy(GALAXY_CAMERA_EULER)`**） |
| 计划中「临时 AxesHelper 验证后移除」 | ✅ **未提交 AxesHelper**（按「验收后可删、正式代码不留」处理） |

**本 Phase 明确未实现的内容**（属后续计划）：

- **Phase 3.5**：`galaxy.ts`（Points）、**`BufferAttribute`**、**`point.vert/frag.glsl`**
- **Phase 3.6**：**EffectComposer**、**UnrealBloomPass**
- **Phase 4**：Raycaster、Tooltip、Drawer、时间轴、选中态行星等

---

## 5. 交付文件与实现要点

### 5.1 新增 / 修改文件一览

| 路径 | 作用 |
| --- | --- |
| `frontend/src/three/scene.ts` | **`mountGalaxyScene`**：创建 **`WebGLRenderer`**（**`powerPreference: 'high-performance'`**、**`setPixelRatio(min(dpr, 2))`**）、**`Scene`**（黑色背景）、**`PerspectiveCamera(50, aspect, 0.05, 1e6)`**；调用 **`attachGalaxyCameraControls`**；**`requestAnimationFrame`** 渲染循环；**`dispose`** 清理 |
| `frontend/src/three/camera.ts` | **`GALAXY_CAMERA_EULER`**；**`attachGalaxyCameraControls(camera, domElement, { zRange, xyRange, … })`**；**`truckPedestalSpeed`**（默认 **0.02**）、**`zScrollSpeed`**（默认 **0.15**，并按 **`deltaY`** 幅度缩放） |
| `frontend/src/App.tsx` | **`canvasHostRef`**；**`useEffect([status, data])`** 内 **`mountGalaxyScene(el, data.meta)`** |
| `frontend/src/utils/loadGalaxyData.ts` | **`validateMeta`** 扩展：**`xy_range`** 为对象，**`x`/`y`** 均为 **`[finite, finite]`** |
| `package.json`（**仓库根**，可选提交） | **`dev` / `build` / `lint` / `preview` / `storybook` / `build-storybook`** → **`npm run … --prefix frontend`** |

### 5.2 相机与坐标约定（实现层）

- **初始位姿**：**`cx = (x_min + x_max) / 2`**，**`cy` 同理**；**`z = z_range[0] - 2`**（比数据 **Z 最小值** 再沿 **−Z** 偏移 2 个世界单位，便于「从时间轴更早一侧」望向 **+Z** 方向的数据体）。
- **朝向**：使用 **`Euler(0, Math.PI, 0, 'YXZ')`**，使相机前向与 **+Z** 对齐（相对 Three.js 默认「朝 −Z」绕 Y 翻转 180°）。
- **交互**：**`position.x -= dx * speed`**（拖拽向右 → 相机 **−X**，符合「拖动画布」手感）；**`position.y += dy * speed`**；**`position.z += dz`**（滚轮）；**不修改** 除上述固定欧拉角以外的旋转分量。

### 5.3 与 Phase 3.3 的衔接

- 仍为：**`idle` / `loading` → Loading 全屏**；**`error` → 错误页**；仅 **`ready`** 时挂载 WebGL，避免无数据初始化场景。
- Loader 现与 **Tech Spec** 一致地要求 **`meta.xy_range`**，与 **§4.2** 及 **相机中心** 计算一致；若管线产物缺该字段，将在 **fetch 校验阶段** 失败并进入 **error** 态，错误信息带 **`[GalaxyData]`** 前缀。

---

## 6. 验收与复现

### 6.1 准备数据

将管线输出的 **`galaxy_data.json`** 置于 **`frontend/public/data/galaxy_data.json`**（或保持现有 **`.gitignore`** 策略：本地生成、不提交大文件）。

### 6.2 启动方式

- **推荐（仓库根）**: `npm run dev`（依赖根目录 **`package.json`** 已存在并已提交到本机仓库）  
- **或**: `cd frontend && npm run dev`

浏览器打开 Vite 提示的本地 URL（默认 **`http://localhost:5173`**）。

### 6.3 计划 Checkpoint 对照

1. **全黑 Canvas**，DevTools **Console** 无 WebGL 初始化致命错误。  
2. 打印一行：**`[Scene] Renderer: WebGL2 | Canvas: … | Camera initial Z: …`**（环境仅 WebGL1 时为 **WebGL1**）。  
3. **滚轮**：持续出现 **`[Camera] Z: …`**。  
4. **左键拖拽**：出现 **`[Camera] X: … Y: …`**；**`camera.rotation`** 应保持 **`(0, π, 0)`**（可在 Console 临时检查 **`camera.rotation`**）。  
5. 调整窗口大小：画布应随 **`ResizeObserver`** 更新，无比例错乱导致的拉伸异常（**`updateProjectionMatrix`** 已调用）。

### 6.4 构建验证

在 **`frontend/`** 执行：

```bash
npm run build
```

应 **`tsc -b` + `vite build`** 均成功（与实施时一致）。

---

## 7. 已知事项与后续建议

| 项 | 说明 |
| --- | --- |
| 根目录 **`package.json`** | 若尚未提交，合并分支前请 **`git add package.json`** 并 **`commit`**，以便协作者与 CI 在仓库根统一 **`npm run dev`**。 |
| **`npm run lint`** | 前端工程仍存在与本次无关的历史 ESLint 规则告警（如 **`react-refresh/only-export-components`**）；未作为 Phase 3.4 交付范围修复。 |
| 相机 **Z 边界夹紧** | 当前未按 **`z_range`** 对 **`position.z`** 做硬夹紧；若需防止穿出数据体，可在 **Phase 4** 与时间轴联动时补充。 |
| **AxesHelper** | 若需对照计划做一次肉眼验收，可本地临时 **`scene.add(new THREE.AxesHelper(10))`**，验收后删除，勿提交。 |

---

## 8. 小结

Phase 3.4 已在分支 **`phase-3.4-threejs-scene-camera`** 上完成：**WebGL2/1 黑色场景**、**轴平行 +Z 相机**、**truck / pedestal / Z 滚轮** 控制器，以及 **`App`** 中的 **生命周期正确的挂载 / 卸载**。同时补强 **`meta.xy_range`** 的 **运行时校验**，并在仓库根增加 **`npm` 脚本代理**，改善从项目根启动前端的体验。下一步按计划进入 **Phase 3.5（Points + Shader）**。
