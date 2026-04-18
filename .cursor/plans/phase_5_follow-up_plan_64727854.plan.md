---
name: Phase 5 Follow-up Plan
overview: Phase 5.0 评估完成后的后续开发计划，涵盖视距窗口与粒子三层分层（5.1）、UMAP 调参（5.2）、交互增强（5.3）、工程质量（5.4）四个子阶段，系统解决报告中 20 项 Issue。
todos:
  - id: p5-0-evaluation
    content: "Phase 5.0: 项目全面评估与测试 — 已产出评估报告，识别 20 项 Issue 和 3 个核心设计方案"
    status: completed
  - id: p5-1-1-camera-dir
    content: "Phase 5.1.1: 相机方向修正 — camera.ts 拖拽 X 轴符号修正 (T7)"
    status: completed
  - id: p5-1-2-blur-fix
    content: "Phase 5.1.2: Detail 模糊蒙版修复 — 去除/降低 SheetOverlay backdrop-blur (H1)"
    status: completed
  - id: p5-1-3-eslint
    content: "Phase 5.1.3: ESLint 修复 — Drawer.tsx:195 react-hooks/set-state-in-effect (B5)"
    status: completed
  - id: p5-1-4-1-t1-he
    content: "Phase 5.1.4.1: T1 根因 H-E — 运行时 camera.rotation 篡改检测（tick 循环 assert rotation.equals(GALAXY_CAMERA_EULER)）"
    status: completed
  - id: p5-1-4-2-t1-hd
    content: "Phase 5.1.4.2: T1 根因 H-D — 投影矩阵 / aspect 异常检查（打印 renderer size、camera.aspect、projectionMatrix）"
    status: completed
  - id: p5-1-4-3-t1-hf
    content: "Phase 5.1.4.3: T1 根因 H-F — Vertex shader world-space 变换审计（point.vert / perlin.vert）"
    status: completed
  - id: p5-1-4-4-t1-hb
    content: "Phase 5.1.4.4: T1 根因 H-B — 已复测中位数 XY；肉眼 T1 偏差仍明显 → 排除 H-B 为根因修复，已回滚方案 3 代码与 Tech Spec"
    status: completed
  - id: p5-1-4-5-t1-ha
    content: "Phase 5.1.4.5: T1 根因 H-A — UMAP 坐标系朝向错配（PCA 主轴分析）；已被 H-G 超越，取消"
    status: cancelled
  - id: p5-1-4-6-t1-hc
    content: "Phase 5.1.4.6: T1 根因 H-C — HUD 非对称裁切复测（隐藏 HUD，纯 canvas 下肉眼验证）；已被 H-G 超越，取消"
    status: cancelled
  - id: p5-1-4-7-t1-hg
    content: "Phase 5.1.4.7: T1 根因 H-G — Windows 系统缩放（DPR > 1）兼容性修复 — 经用户复测确认 100% 缩放下不复现、125%/150% 下右下视窗裁切；改造 scene.ts resize: setPixelRatio 先于 setSize、composer.setPixelRatio 同步、updateStyle=true 或外部 CSS 校验、设备像素比变化监听"
    status: completed
  - id: p5-1-5-z-window
    content: "Phase 5.1.5: 视距窗口模型 — 引入 zCurrent/zVisWindow/zCamDistance，改造 camera.ts 滚轮逻辑 + bridge 升级 + camera clamp (T4, D1, 方案1)"
    status: completed
  - id: p5-1-6-three-layers
    content: "Phase 5.1.6: 三层星球着色器 — A(背景)/B(焦点) shader 分层 + 重写 C(选中) Perlin 着色器为面积比例分区染色，重新启用 Bloom，fragment 径向辉光 (D1, T2, T3, T5, B1, B2, 方案2)"
    status: completed
  - id: p5-1-7-raycaster
    content: "Phase 5.1.7: Raycaster 适配 — 拾取范围限制到窗口内层 (T6)"
    status: completed
  - id: p5-1-8-spec-sync
    content: "Phase 5.1.8: Spec 文档同步 — 更新 Tech Spec / Design Spec 新增的视距窗口与分层概念"
    status: completed
  - id: p5-2-1-umap-tune
    content: "Phase 5.2.1: UMAP 参数调优 — min_dist 增大至 0.3-0.5，重跑管线，确保 export meta 同步 (DS1)"
    status: completed
  - id: p5-2-2-model-b
    content: "Phase 5.2.2: 阶段 B Embedding 模型评估（可选）— 768 维模型语义分离评估"
    status: completed
  - id: p5-3-1-timeline-drag
    content: "Phase 5.3.1: Timeline 拖动跳转 — 移除 pointer-events-none，拖动交互写入 zCurrent (H2)"
    status: pending
  - id: p5-3-2-drawer-polish
    content: "Phase 5.3.2: Drawer UI 打磨 — 响应式海报、视觉层次提升、缺省字段条件隐藏 (H3, H4, H5)"
    status: pending
  - id: p5-3-3-search
    content: "Phase 5.3.3: 搜索入口（低优先级/可选）— 基础关键词前端搜索 (H6)"
    status: pending
  - id: p5-4-1-vitest
    content: "Phase 5.4.1: Vitest 配置 + 核心测试 — 创建 vitest.config.ts，覆盖数据加载/store/窗口判定 (B6)"
    status: pending
  - id: p5-4-2-bundle
    content: "Phase 5.4.2: Bundle 优化（低优先级）— code-splitting / 动态 import (B3)"
    status: pending
  - id: p5-4-3-depth
    content: "Phase 5.4.3: 深度精度修正（低优先级）— far=1e6 收窄 (B7)"
    status: pending
isProject: false
---

# TMDB 电影宇宙 — Phase 5 后续开发计划

> 承接 [tmdb_galaxy_dev_plan_5ad6bea5.plan.md](.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md) 全部已完成的 Phase 0–4.6
> 依据 [Phase 5.0 项目全面评估与测试报告.md](docs/reports/Phase%205.0%20项目全面评估与测试报告.md)

## 修订记录

- **Rev 3**: 用户复测锁定 T1 根因为 **Windows 系统缩放 / DPR 兼容性问题**——100% 缩放下不复现，125%/150% 下相机画面右下区域不在视窗内，视觉上形成"主轴向右下偏"的错觉。新增 **H-G（5.1.4.7）** 作为已确认的根因假设，并将尚未开展的 **5.1.4.5（H-A）** 与 **5.1.4.6（H-C）** 标记为 cancelled（被 H-G 超越，如 H-G 修复后仍有残留偏差可再复启）。已完成的 5.1.4.1–5.1.4.4 排查保持历史记录不变。
- **Rev 2**: 根据报告对 T1 的改判，5.1.4 从"XY 内容中点居中（方案 3）"改为"T1 根因调查与修复（相机朝向非 Z 平行）"，拆分为 5.1.4.1–5.1.4.6 六个子任务，对应报告 §11.1 中 H-E → H-D → H-F → H-B → H-A → H-C 的排查顺序；设计方案 3 降级为 H-B 成立时的修复路径，内嵌于 5.1.4.4。
- **Rev 1**: 5.1 内部按"快速修正 → 核心架构"重新编号；确认 overlay 完全去除、zVisWindow=1 年、A+B 先单 Points shader 分支、A↔B 先硬切。

---

## Phase 5.0 — 项目全面评估与测试（已完成）

对 Phase 0–4.6 全部交付物进行自动化构建/类型/Lint 检查 + 数据管线产物分析 + 代码审计 + 用户手动测试，产出 [评估报告](docs/reports/Phase%205.0%20项目全面评估与测试报告.md)。结论：**全部计划功能点已交付并通过验收**；报告所列问题为面向下一阶段的改进方向。

识别 20 项 Issue（D1, T1–T7, H1–H6, DS1, B1–B3/B5–B7），提出三个核心设计方案：
- **方案 1** — 宏观漫游视距窗口逻辑（`zCurrent` / `zVisWindow` / `zCamDistance`）
- **方案 2** — 星球视觉三层分层（A 背景 / B 焦点 / C 选中）
- **方案 3** — XY 内容中点居中（中位数替代 min/max 中心）

---

## Phase 5.1 — 视距窗口与粒子分层（核心架构变更）

本阶段是下一步开发的核心，解决大部分 High 优先级问题。三个设计方案协同实施。按"快速修正先行 → 中等改动 → 核心架构"的顺序排列。

### 5.1.1 相机方向修正

**解决**: T7（相机控制左右反了）

**现状**: [camera.ts](frontend/src/three/camera.ts) 第 73 行 `camera.position.x -= dx * speed`，因 `GALAXY_CAMERA_EULER = (0, PI, 0)` 相机面向 +Z，世界 X 轴与屏幕方向可能相反。

**实现**: 修改拖拽 handler 中 X 轴的符号方向（`-=` 改 `+=` 或反之），测试拖拽方向与鼠标移动方向一致。

**验收**: 鼠标向左拖 → 视野向左移动（符合直觉）。

---

### 5.1.2 Detail 模糊蒙版修复

**解决**: H1（Detail 态多余的模糊蒙版遮挡星球）

**现状**: [Drawer.tsx](frontend/src/components/Drawer.tsx) 使用 shadcn Sheet，overlay 层在 `ui/sheet.tsx` 中定义为 `SheetOverlay` = `bg-black/10` + `supports-backdrop-filter:backdrop-blur-xs`。这层 blur 把左侧 3D 场景模糊掉了。

**实现**: 完全去除 `SheetOverlay`（抽屉打开时背景无任何遮挡），让 3D 场景在详情态时保持完全可见。

**验收**: 点击星球 → 抽屉弹出时，左侧 3D 场景无遮罩、无模糊。

---

### 5.1.3 ESLint 修复

**解决**: B5（Drawer.tsx ESLint error）

**现状**: `Drawer.tsx:195` — `setSheetDelayedOpen(false)` 在 useEffect 体内同步调用 setState，触发 `react-hooks/set-state-in-effect`。

**实现**: 重构 effect 中的状态设置逻辑，例如将 delayed open 逻辑改为 useRef + event-driven 模式，或合并为 reducer。

---

### 5.1.4 T1 根因调查与修复（相机朝向非 Z 平行）

**解决**: T1（相机视线与 Z 轴不平行）| 根因调查，不绑定单一设计方案

**背景**:
- `GALAXY_CAMERA_EULER = Euler(0, π, 0, 'YXZ')` 数学上严格 Z 平行（forward=+Z / up=+Y），与 Design Spec §2.1 一致
- 用户实测现象：需在 `GALAXY_CAMERA_EULER` 基础上叠加 `yaw ≈ -15°`、`pitch ≈ -7.5°` 才肉眼与 Z 平行
- 代码 grep 确认仅 `camera.ts:20`、`scene.ts:86/133/151` 三处写入 `camera.rotation`（全部 copy `GALAXY_CAMERA_EULER`）
- **现象与代码不符，属深层根因问题**
- **Rev 3 关键更新**: 复测发现该现象**仅在 Windows 系统缩放 > 100% 时出现**（125%/150% 复现，100% 不复现）——根因从"几何/数据层问题"收敛为**渲染管线对 `devicePixelRatio > 1` 的兼容性问题**。直接导向新增的 **5.1.4.7 (H-G)**；已完成但未命中的 5.1.4.1–5.1.4.4 作为历史验证保留，尚未开展的 5.1.4.5 (H-A)、5.1.4.6 (H-C) 被超越、取消

**修复原则（硬约束）**:
- **禁止**将实测偏移值 `-15°/-7.5°` 写进 `GALAXY_CAMERA_EULER` 或任何代码常量 — 那是症状掩盖，且随 UMAP 重新训练 / 数据集变化后失效
- 定位根因后，优先修正**世界坐标系构建端 / 数据生成端**，保持相机严格 `Euler(0, π, 0, 'YXZ')` 不动
- 每个子任务（H-E 至 H-C）为**独立验证步骤**，排查成本从低到高排序；某一步成立即跳转对应修复路径，无需继续后续假设

**调查流程总览**（Rev 3 后；历史顺序保留于 §11.1）:

```
[历史排查 — 均已完成且排除根因]
H-E (rotation drift) ✔  →  H-D (aspect/proj) ✔  →  H-F (vertex shader) ✔  →  H-B (XY density) ✔

[Rev 3 锁定路径]
H-G (DPR > 1 视窗裁切) ← 用户复测确认 ← 进入 5.1.4.7 修复

[取消]
H-A (UMAP 主轴) ✗ cancelled    H-C (HUD 非对称) ✗ cancelled
（若 H-G 修复后仍有残留偏差可再复启）
```

---

#### 5.1.4.1 H-E · 运行时 camera.rotation 篡改检测

**假设**: 存在未识别的代码（第三方库、EffectComposer 内部、异步回调）在运行中写入 `camera.rotation` / `camera.quaternion`。

**验证代码片段** — 在 [scene.ts](frontend/src/three/scene.ts) render tick 开头（`composer.render()` 之前）插入：

```ts
if (!camera.rotation.equals(GALAXY_CAMERA_EULER)) {
  console.error('[T1/H-E] camera.rotation drift', {
    actual: [camera.rotation.x, camera.rotation.y, camera.rotation.z, camera.rotation.order],
    expected: [0, Math.PI, 0, 'YXZ'],
  })
}
```

**判定标准**:
- **成立**: 控制台持续报错（每帧或特定时机） → 定位篡改源（grep `camera.rotation` / `camera.quaternion` / `lookAt` / `.up.set`，包括 `node_modules` 下的 three.js 扩展），修正后移除 assert
- **不成立**: 每帧 rotation 恒等，assert 不触发 → 排除 H-E，进入 5.1.4.2

**排除后下一步**: 进入 5.1.4.2（H-D 投影矩阵检查）。

---

#### 5.1.4.2 H-D · 投影矩阵 / aspect 异常

**假设**: 容器尺寸被 DevTools / CSS 缩放 / 非标准 devicePixelRatio 干扰，`camera.aspect ≠ canvas.width/canvas.height`，灭点偏移导致透视不对称。

**验证代码片段** — 在挂载后和每次 resize 后打印：

```ts
const size = renderer.getSize(new THREE.Vector2())
console.log('[T1/H-D]', {
  canvasSize: [size.x, size.y],
  clientSize: [canvas.clientWidth, canvas.clientHeight],
  aspect: camera.aspect,
  expectedAspect: size.x / size.y,
  fov: camera.fov,
  near: camera.near,
  far: camera.far,
  projectionMatrix: Array.from(camera.projectionMatrix.elements),
})
```

**判定标准**:
- **成立**: `camera.aspect` 与 `size.x/size.y` 不一致，或 `projectionMatrix` 非标准透视（元素 `m[8]` / `m[9]` 非零，表示灭点偏移） → 修正 resize 逻辑，确保 `camera.aspect = size.x/size.y` 且 `camera.updateProjectionMatrix()` 每次 resize 后调用
- **不成立**: aspect 正确，`projectionMatrix` 为标准透视矩阵（`m[8]=m[9]=0`，`m[0]=1/(aspect*tan(fov/2))`） → 排除 H-D，进入 5.1.4.3

**排除后下一步**: 进入 5.1.4.3（H-F vertex shader 审计）。

---

#### 5.1.4.3 H-F · Vertex shader world-space 变换审计

**假设**: `point.vert.glsl` / `perlin.vert.glsl` 对顶点坐标做了非预期的旋转 / 缩放 / 位移，使星系整体偏转，视觉上伪装成"相机斜了"。

**验证方法** — 审计所有 vertex shader 文件：

```
frontend/src/three/shaders/point.vert.glsl
frontend/src/three/shaders/perlin.vert.glsl
```

确认变换严格为：
```glsl
gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
```

**判定标准**:
- **成立**: 发现自定义 `mat4` / `mat3` 作用于 `position`、或 `modelMatrix` 被替换、或顶点做了 `sin()/cos()` 位移 → 修正 shader，保留标准变换
- **不成立**: 所有 vertex shader 仅使用标准 MVP 变换 → 排除 H-F，进入 5.1.4.4

**排除后下一步**: 进入 5.1.4.4（H-B XY 偏心复测）。

---

#### 5.1.4.4 H-B · 相机 XY 与数据密度中心偏离 + 透视效应

**假设**: 相机位于 `(cx, cy, zMin-2)` 严格沿 +Z 看，但若数据密度中心偏离 `(cx, cy)`，透视近大远小会让远方内容"飘向屏幕一侧"，用户视觉上解读为"相机斜了"。**这是设计方案 3（中位数居中）重新获得价值的路径。**

**验证代码片段** — 在 [scene.ts](frontend/src/three/scene.ts) `mountGalaxyScene` 中临时替换 `xyCenter(meta)` 返回值：

```ts
function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
const medianX = median(data.movies.map((m) => m.x))
const medianY = median(data.movies.map((m) => m.y))
console.log('[T1/H-B]', {
  minMaxCenter: [(meta.xy_range.x[0] + meta.xy_range.x[1]) / 2, (meta.xy_range.y[0] + meta.xy_range.y[1]) / 2],
  median: [medianX, medianY],
  delta: [medianX - (meta.xy_range.x[0] + meta.xy_range.x[1]) / 2, medianY - (meta.xy_range.y[0] + meta.xy_range.y[1]) / 2],
})
camera.position.set(medianX, medianY, zMin - 2)
```

然后**由用户肉眼复测**：改用中位数后，是否仍需 `-15°/-7.5°` 偏移才能"视觉平行"。

**判定标准**:
- **成立**: 改用中位数后肉眼偏差**消失或显著减小** → 确认 H-B，**按设计方案 3 实施中位数居中作为本子任务的修复方案**：
  - 将 `xyCenter(meta)` 重构为 `xyCenterFromMovies(movies)`，返回 `(medianX, medianY)`
  - 移除临时 `console.log`
  - 记录 median 与 min/max 中点差值到实施报告
- **不成立**: 偏差依旧 → 排除 H-B，进入 5.1.4.5；同时方案 3 不必实施

**排除后下一步**: 进入 5.1.4.5（H-A UMAP 主轴分析）。

---

#### 5.1.4.5 H-A · UMAP 坐标系朝向错配 — **已取消**

> **Rev 3 取消**: 用户复测锁定根因为 DPR 兼容性问题（见 5.1.4.7），H-A 被超越。若 5.1.4.7 修复后仍有残留主轴偏移再复启本子任务；保留原假设描述供参考，不再作为排查路径。

原假设：UMAP 输出的二维嵌入 (x, y) 主轴未必与世界 +X / +Y 对齐；若数据云整体"歪了"，即便相机严格 Z 平行，透视下星系主轴仍会倾斜。原修复路径为 Python 管线端追加 PCA 正交旋转，或前端对 galaxy Group 施加一次性 `rotation.z`。

---

#### 5.1.4.6 H-C · HUD 非对称裁切导致构图中心偏移 — **已取消**

> **Rev 3 取消**: 同上，被 H-G 超越。若 5.1.4.7 修复后用户反馈 HUD 仍有主观构图偏斜，可复启为独立 HUD 布局优化项（并入 5.3.2 Drawer UI 打磨更合适）。

原假设：HUD（Timeline 吸底、Drawer 右侧）使用户主观"画面中心"偏离渲染器几何中心。原修复路径为 Timeline 居中底部布局 / Drawer 改为浮动弹窗。

---

#### 5.1.4.7 H-G · Windows 系统缩放（DPR > 1）兼容性修复 — **已锁定根因**

**假设（已由用户复测确认）**: 在 `window.devicePixelRatio > 1` 环境下（Windows 显示设置缩放 125% / 150%），当前 `scene.ts` 的 `resize()` 逻辑使 renderer 绘图缓冲、Three.js 相机 aspect、EffectComposer 内部 RT 三者对 DPR 的处理不一致，导致相机画面右侧与下侧溢出 canvas 可见区域。用户视觉上将裁切后的画面解读为"主轴向右下偏移，需要旋转相机补偿"。

**用户复测证据**:

| 系统缩放            | 现象                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| **100%** (DPR=1)    | T1 不复现，星系主轴肉眼即与 Z 轴平行                                 |
| **125%** (DPR=1.25) | 相机画面右下裁切，肉眼需叠加 `yaw ≈ -15° / pitch ≈ -7.5°` 才匹配主轴 |
| **150%** (DPR=1.5)  | 同 125%，裁切更显著                                                  |

**当前代码已知隐患**（`frontend/src/three/scene.ts:280-284`）:

```ts
renderer.setSize(w, h, false)                                // ①
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // ②
composer.setSize(w, h)                                       // ③
bloomPass.setSize(w, h)
galaxy.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2)
```

三个 DPR 反模式：

| #   | 问题                                                                                   | 在 DPR=1 时的影响              | 在 DPR>1 时的影响                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ①   | `setSize(..., false)` — `updateStyle=false`，Three.js 不写 `canvas.style.width/height` | 无（因 CSS 本就 100%）         | 若外部 CSS 与 Three.js 内部 `_width/_height` 在 DPR 过渡态不一致，canvas CSS 显示尺寸与 drawing buffer 物理尺寸比例错位                                                           |
| ②   | `setPixelRatio` 在 `setSize` **之后**调用                                              | 无（`pr=1`，setSize 不受影响） | `setSize(w, h)` 以当时的 `_pixelRatio` 设定 drawing buffer；随后 `setPixelRatio` 改变 `_pixelRatio` 并重算 drawing buffer，**首帧（挂载 → 第一次 resize 之间）存在 DPR 错位状态** |
| ③   | 从未调用 `composer.setPixelRatio(renderer.getPixelRatio())`                            | 无（`_pixelRatio=1` 一致）     | `EffectComposer` 内部 RT 按 **CSS 尺寸** 分配（`_pixelRatio=1` 默认），但最终 pass 写入 **DPR 缩放后** 的 canvas drawing buffer → viewport 或 RT 比例错位 → **画面被裁切/偏移**   |

**修复实现**（5.1.4.7 主要改动）:

1. **`scene.ts` 挂载期（第 84–100 行附近）**
   - 创建 renderer 后**立刻**调用 `renderer.setPixelRatio(...)`，再调用 `renderer.setSize(...)`（而非反向）
   - 同步调用 `composer.setPixelRatio(renderer.getPixelRatio())`（若该版本 Three.js EffectComposer 支持；当前依赖 three 的 `three/examples/jsm/postprocessing/EffectComposer.js` 已含此 API）
2. **`resize()` 函数（第 275–285 行）**
   ```ts
   const resize = () => {
     const w = Math.max(1, container.clientWidth)
     const h = Math.max(1, container.clientHeight)
     const pr = Math.min(window.devicePixelRatio, 2)

     // 1) pixel ratio 先行（避免 setSize 用到陈旧的 _pixelRatio）
     renderer.setPixelRatio(pr)
     composer.setPixelRatio(pr)

     // 2) 尺寸 & 投影
     renderer.setSize(w, h, true)     // updateStyle=true，让 Three.js 统一维护 canvas CSS 尺寸
     composer.setSize(w, h)
     bloomPass.setSize(w, h)          // UnrealBloomPass.setSize 内部以 CSS 尺寸入参即可
     camera.aspect = w / h
     camera.updateProjectionMatrix()

     galaxy.material.uniforms.uPixelRatio.value = pr
   }
   ```
   关键变更：
   - `setPixelRatio` 在 `setSize` **之前**调用（renderer + composer 同步）
   - `updateStyle` 由 `false` 改为 `true`（或改为手动设 `canvas.style.width/height` 为 `w/h` px），确保 CSS 尺寸由 Three.js 统一维护
   - `composer.setPixelRatio` 显式调用，解决 EffectComposer 内部 RT 与 renderer drawing buffer 的 DPR 错位
3. **新增 DPR 变化监听**（处理用户运行时将浏览器拖到不同 DPI 显示器或临时改 Windows 缩放的情况）:
   ```ts
   const dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
   const onDprChange = () => resize()
   dprQuery.addEventListener('change', onDprChange)
   // dispose 时移除
   ```
   或更简单：每次 RAF 校验 `renderer.getPixelRatio()` 与 `window.devicePixelRatio` 是否一致，不一致则 `resize()`。
4. **实时调试探针**（验证期保留，修复确认后移除，遵循 5.1.4.1 H-E 的模式）:
   ```ts
   const size = renderer.getSize(new THREE.Vector2())
   const drawing = new THREE.Vector2(renderer.domElement.width, renderer.domElement.height)
   console.log('[T1/H-G] dpr check', {
     dpr: window.devicePixelRatio,
     rendererPR: renderer.getPixelRatio(),
     composerPR: (composer as any).getPixelRatio?.() ?? 'n/a',
     cssSize: [size.x, size.y],
     drawingBuffer: [drawing.x, drawing.y],
     canvasStyle: [renderer.domElement.style.width, renderer.domElement.style.height],
     clientSize: [renderer.domElement.clientWidth, renderer.domElement.clientHeight],
     aspect: camera.aspect,
     expectedAspect: size.x / size.y,
   })
   ```
   在以下场景验证：初始挂载、窗口 resize、切换 Windows 缩放（100/125/150%）、浏览器 DevTools 开关、跨显示器拖拽。

**判定标准**:
- **成立（预期）**: 修复后在 125% / 150% 缩放下 canvas 完全填充视口、星系主轴肉眼与 Z 轴平行，无需 `-15°/-7.5°` 补偿 → 关闭 T1，进入 5.1.5
- **部分成立**: 修复后 125% 改善但 150% 仍有残留 → 核查 `Math.min(devicePixelRatio, 2)` 的 clamp 是否在高 DPR 下触发，以及 `bloomPass` / 其他 Pass 是否也需 pixelRatio 显式同步
- **不成立**: 修复后偏差依旧存在 → 考虑复启 5.1.4.5 (H-A) 与 5.1.4.6 (H-C)，并扩充假设集（浏览器 compositor、`window.visualViewport` API、`content-visibility`、Electron/WebView 场景等）

**验收**:
- 100% / 125% / 150% 三档系统缩放下，肉眼观察相机画面边缘**恰好填充容器**，无裁切、无留白、无拉伸
- `GALAXY_CAMERA_EULER` 保持 `(0, π, 0, 'YXZ')` 不变，代码库中**无**任何 `-15° / -7.5° / 0.26180 / 0.13090` 硬编码常量
- 构建与现有 Storybook 通过；手动复测后移除 `[T1/H-G]` 诊断日志

**规模评估**: S–M（核心改动约 15–30 行，`scene.ts` resize 与挂载段；新增 DPR 变化监听 5–10 行；诊断日志按 5.1.4.1 模式实施+回滚）。

**涉及文件**:
- `frontend/src/three/scene.ts`（主要）
- 必要时 `frontend/src/App.tsx` 或 `frontend/src/index.css`（若外部 CSS 与 Three.js `updateStyle=true` 产生冲突）

**Spec 同步（延伸至 5.1.8）**:
- Tech Spec §1.4 相机 / 渲染管线章节补一条"DPR 兼容性约束"：pixelRatio 在 renderer + composer 间必须显式同步；Windows 缩放变化需触发 resize
- 在相关 `CHANGELOG` / 开发者 FAQ 中记录该问题的定位过程（有助于后续同类 issue 排查）

---

**5.1.4 收尾**:
- 将最终确认的根因与修复方案写入 Phase 5.1.4 实施报告
- 移除所有临时 `console.log` / assert 探针
- 确认 `GALAXY_CAMERA_EULER` 保持 `(0, π, 0, 'YXZ')` 不变
- 若修复涉及 Python 管线（H-A 首选路径）或世界坐标系构建，一并更新相关 Spec 文档（5.1.8 处理）

**5.1.4 总体验收**:
- 相机 `rotation` 严格等于 `GALAXY_CAMERA_EULER`（assert 不触发）
- **在 Windows 系统缩放 100% / 125% / 150% 三档下，首屏肉眼看到星系主轴与屏幕 X / Y 轴大致平行**，无须用户在头脑中补偿倾斜
- canvas 在各缩放档位下**边缘恰好贴合容器**，无右下裁切、无留白
- 代码库中**无**任何 `-15°` / `-7.5°` / `0.26180` / `0.13090` 硬编码常量

---

### 5.1.5 视距窗口模型

**解决**: T4（相机初始位置）、D1（星星过多）| **方案 1**

**核心概念**: 引入三个参数定义宏观漫游的"可观测范围"：

```
zCurrent      — 用户关注的时间轴位置
zVisWindow    — 可观测 Z 范围宽度（zCurrent ~ zCurrent + zVisWindow）
zCamDistance   — 相机到 zCurrent 的后退距离
相机世界 Z = zCurrent - zCamDistance
```

**已确认参数**:
- `zVisWindow` 初始值 **1 年**（非常聚焦的视角；现代年份约 2000–3000 部/年，早期年份更少）
- `zCurrent` 初始值 = `z_range[1]` 附近（~2026，现代电影）
- `zCamDistance` 待开发中迭代确定

**实现**:
- **Zustand 状态**: 在 [galaxyInteractionStore.ts](frontend/src/store/galaxyInteractionStore.ts) 或新建 store 中添加 `zCurrent`, `zVisWindow`, `zCamDistance` 状态
- **相机控制改造**: [camera.ts](frontend/src/three/camera.ts) 的滚轮逻辑从直接修改 `camera.position.z` 改为修改 `zCurrent`，相机位置由 `zCurrent - zCamDistance` 驱动
- **Z bridge 升级**: [galaxyCameraZBridge.ts](frontend/src/lib/galaxyCameraZBridge.ts) 同步 `zCurrent`（而非原始 camera.z），供 Timeline 等 HUD 消费
- **camera clamp**: 顺带实现 [code_review_follow-up plan](/.cursor/plans/code_review_follow-up_9d90ade4.plan.md) 中 pending 的 camera-clamp — `zCurrent` 限制在 `z_range` 范围，XY 限制在 `xy_range` + padding

**验收**: 首屏从现代年份（~2026）附近启动；滚轮改变 `zCurrent`，相机跟随；Timeline 显示 `zCurrent` 值；窗口内约 1 年范围的星球以真实大小显示。

---

### 5.1.6 三层星球着色器

**解决**: D1, T2, T3, T5, B1, B2 | **方案 2**

这是本阶段工作量最大的子任务。将 59K 粒子分为三个视觉层级：

**层级 A — 窗口外背景层**（z 不在 `[zCurrent, zCurrent+zVisWindow]` 内）:
- 固定极小 size，`genres[0]` 单色，2D 圆盘
- 不可 hover / click
- 提供星空氛围，不干扰焦点层

**层级 B — 窗口内焦点层**（z 在窗口内）:
- 显示真实 `size`，`genres[0]` 色相，2D 圆形
- 可 hover / click
- 核心信息载体

**层级 C — 选中层（需重写 Perlin 着色器）**:

当前 [planet.ts](frontend/src/three/planet.ts) + [perlin.frag.glsl](frontend/src/three/shaders/perlin.frag.glsl) 的实现与报告要求有本质差距：

- **现状**: 所有 genre 颜色做加权混合成**单一颜色** `cMix = uColor0*uWeight0 + ...`，Perlin fbm 仅用于明暗调制（`cMix * (0.42 + 0.58 * n)`）。球面上没有颜色分区，只有一种混合色的亮度变化。fbm 参数全部硬编码。
- **要求**: 按 genre 权重（黄金比衰减 w_k）**分配不同 genre 颜色的面积比例**，通过 Perlin Noise 生成分界形状。例如 Comedy 60%、Drama 38% 面积各自显示对应颜色，边界由噪声形态决定。`Threshold`、`Scale`、`Octaves`、`Persistence` 均可调（uniform）。

**实现方向**: 将权重转为累积阈值序列 `[0, w0, w0+w1, ..., 1]`，Perlin 噪声输出 [0,1]，按落入哪个阈值区间选择对应 genre 颜色。新增 uniform `uScale`、`uOctaves`、`uPersistence`、`uThreshold`（边界锐利度 / smoothstep 宽度）。IcoSphere detail 可从 3 提升到 4–5 以匹配"高细分"要求。

**已确认方案（层级 A + B）**: 先从**单 Points + shader 分支**开始（方案 A），如果 Bloom 调参有困难再拆成双 Points（方案 B）。
- 在 [point.vert.glsl](frontend/src/three/shaders/point.vert.glsl) / [point.frag.glsl](frontend/src/three/shaders/point.frag.glsl) 中新增 uniform `uZCurrent`, `uZVisWindow`，vertex shader 按 z 与窗口的关系输出不同 `gl_PointSize`，fragment shader 输出不同视觉效果
- 在 [galaxy.ts](frontend/src/three/galaxy.ts) 的 `createGalaxyPoints` 中传入新 uniform；[scene.ts](frontend/src/three/scene.ts) 每帧 tick 更新 `uZCurrent`

**已确认方案（A↔B 过渡）**: 先用硬切，看效果再决定是否加渐变过渡（窗口边缘 size/alpha 平滑插值）。

**Bloom 重新启用**: 当前 `UnrealBloomPass` strength=0（禁用）。分层后独立调试窗口内/外各层的 Bloom 效果，重新启用 strength（Spec 建议 0.8–1.2）

**Fragment shader 升级**: 当前 `point.frag.glsl` 为硬边圆盘 + 白色外环。需要改为**径向辉光**效果（Spec §1.1 要求），并让 emissive attribute 实际驱动 HDR 亮度

**验收**: 宏观浏览时只有当前时间窗口内的星球以真实大小显示；窗口外星球缩小为背景点；Bloom 重新启用且不淹没颜色。

---

### 5.1.7 Raycaster 适配

**解决**: T6（hover/click 触发位置异常）| **方案 1 + 2**

**现状**: [interaction.ts](frontend/src/three/interaction.ts) 对全部 59K 粒子做 raycaster 拾取，threshold 由 `avgSpacing * 0.75` 计算。

**实现**:
- Raycaster 拾取**仅对窗口内层（B）生效** — 过滤方式：intersect 后检查命中粒子的 z 是否在 `[zCurrent, zCurrent+zVisWindow]` 范围内，不在则忽略
- 或：如果采用双 Points 方案（5.1.6 方案 B），raycaster 仅 `intersectObject` 窗口内 Points
- threshold 可改为基于窗口内粒子密度重新计算

**验收**: 只有当前时间窗口内的可见大星球能被 hover / click。

---

### 5.1.8 Spec 文档同步

方案 1/2 引入的 `zCurrent`、`zVisWindow`、`zCamDistance`、粒子三层分层等概念超出现有 Tech Spec / Design Spec 范围。5.1.4 T1 根因修复若涉及世界坐标系构建或 UMAP 管线，也需在此统一同步。每完成一个子任务后更新：

- [TMDB 电影宇宙 Tech Spec.md](docs/project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) — 相机模型 §1.4、粒子渲染 §1.1
- [TMDB 电影宇宙 Design Spec.md](docs/project_docs/TMDB%20电影宇宙%20Design%20Spec.md) — 视觉分层、交互模型
- **若 5.1.4 确认 H-A 并走 Python 管线修复路径**: 更新 [TMDB 数据处理规则.md](docs/project_docs/TMDB%20数据处理规则.md) / [TMDB 数据特征工程与 3D 映射总表.md](docs/project_docs/TMDB%20数据特征工程与%203D%20映射总表.md) 的 UMAP 章节，记录 PCA 正交旋转步骤
- **若 5.1.4 确认 H-B 并走设计方案 3 修复路径**: Tech Spec §1.4 相机初始 XY 改为中位数定义

---

## Phase 5.2 — UMAP 调参与数据优化

**解决**: DS1（局部小星团过于聚合）

### 5.2.1 UMAP 参数调优

**现状**: `min_dist=0.1`（[umap_projection.py](scripts/feature_engineering/umap_projection.py) 默认值），导致局部星团内部点过于紧凑。

**实现**:
- 增大 `min_dist` 至 0.3–0.5（通过 `--min-dist` CLI 参数）
- 可选调整 `--w-genre` 权重以增强流派星团分离
- 重新跑 `run_pipeline.py --through-phase-2`
- **注意**: [export_galaxy_json.py](scripts/export/export_galaxy_json.py) 有独立的 UMAP 参数默认值用于写 `meta.umap_params`，需确保与实际 UMAP 参数**同步修改**，避免 meta 与实际不符

**验收**: 局部星团内部点间距增大，宏观浏览时不同星团可辨识。对比调参前后截图。

### 5.2.2 阶段 B Embedding 模型评估（可选）

768 维模型可能带来更好的语义分离，但需要完整重跑 embedding + UMAP。作为评估项记录，视 5.2.1 效果决定是否执行。

**已交付**: [embedding_model_eval.py](scripts/feature_engineering/embedding_model_eval.py) — 在相同 `cleaned.csv` 行集上对 Model A（384d MiniLM）与 Model B（768d mpnet）编码，输出流派对齐指标（same/cross primary-genre cosine margin、kNN purity、cosine silhouette）到 JSON。**实施报告**: [Phase 5.2.2 阶段 B Embedding 模型评估 实施报告.md](docs/reports/Phase%205.2.2%20阶段%20B%20Embedding%20模型评估%20实施报告.md)。**产物**: 子样本 [Phase_5.2.2_embedding_model_eval_subsample20.json](docs/reports/Phase_5.2.2_embedding_model_eval_subsample20.json)；全量（59014 行，CUDA）[Phase_5.2.2_embedding_model_eval_full.json](docs/reports/Phase_5.2.2_embedding_model_eval_full.json)。**复现（Windows CUDA 建议用项目 venv）**: `.venv\Scripts\python.exe scripts/feature_engineering/embedding_model_eval.py --device cuda`（默认读 `data/output/cleaned.csv`）。**计划 todo**: `p5-2-2-model-b` → **completed**。

---

## Phase 5.3 — 交互增强

### 5.3.1 Timeline 拖动跳转

**解决**: H2（时间轴应可拖动控制）

**现状**: [Timeline.tsx](frontend/src/components/Timeline.tsx) 根节点 `pointer-events-none`，纯被动指示器，通过 `useSyncExternalStore` 读取 camera Z。

**实现**:
- 移除 `pointer-events-none`（至少对拖拽滑块区域）
- 添加拖拽交互：用户拖动 thumb 或点击刻度 → 反向写入 `zCurrent`（与 5.1.2 的 store 状态衔接）
- 相机跟随 `zCurrent` 变化平滑移动

**验收**: 拖动时间轴滑块 → 星系视野平滑跳转到对应年代。

### 5.3.2 Drawer UI 打磨

**解决**: H3（小窗口海报缩减）、H4（界面死板）、H5（缺省字段显示不优雅）

- H3: 响应式调整 `AspectRatio` + `max-w` 在窄屏下的表现
- H4: 增加视觉层次、分区设计、微动效
- H5: 缺省字段条件隐藏，而非统一显示 "—"

### 5.3.3 搜索入口（低优先级 / 可选）

**解决**: H6 — PRD 标记为未来计划，但用户有此期望。若时间允许，实现基础关键词搜索（前端内存过滤 59K 条 title/overview）。

---

## Phase 5.4 — 工程质量强化

### 5.4.1 Vitest 配置 + 核心测试

**解决**: B6 — Vitest 4.1.4 已安装但零配置零测试。

- 创建 `vitest.config.ts`，添加 `test` script
- 优先覆盖：数据加载校验（`loadGalaxyData.ts`）、store 逻辑、中位数计算、z-window 判定逻辑

### 5.4.2 Bundle 优化（低优先级）

**解决**: B3 — JS bundle 906 kB。当前运行流畅度可接受，按需做 code-splitting / 动态 import Three.js。

### 5.4.3 深度精度修正（低优先级）

**解决**: B7 — `far=1e6` 过大。待视距窗口实装后，可根据实际可视范围收窄 `far` 值。

---

## 里程碑

- **M5.0**: 全面评估报告完成 -- Done
- **M5.1**: 视距窗口 + 三层粒子 + 相机修正 + 蒙版修复 → 宏观浏览体验质变
- **M5.2**: UMAP 调参 → 局部星团分离度改善
- **M5.3**: 交互增强 → Timeline 可拖动 + Drawer 打磨
- **M5.4**: 工程质量 → 自动化测试覆盖

## 执行顺序说明

Phase 5.1 编号即为执行顺序：**5.1.1–5.1.3（快速修正）→ 5.1.4（T1 根因调查，Rev 3 后直接进入 5.1.4.7 H-G 修复）→ 5.1.5（视距窗口）→ 5.1.6（三层着色器）→ 5.1.7（Raycaster 适配）→ 5.1.8（Spec 同步）**

**5.1.4 特别说明（Rev 3）**:
- 5.1.4.1–5.1.4.4（H-E/H-D/H-F/H-B）已完成且均排除 → 保留为历史证据链
- 5.1.4.5 (H-A) 与 5.1.4.6 (H-C) 已被 **H-G（DPR > 1 视窗裁切）** 超越，cancelled
- **主修复路径**: 直接实施 5.1.4.7（`scene.ts` resize 的 DPR 兼容性改造）；若修复后仍有残留偏差再复启被取消的子任务
- 本次 T1 修复不触及 Python 管线，Phase 5.2 UMAP 调参独立推进

**已确认**: Phase 5.2 在 5.1 全部完成后再做（在新视觉体系下评估局部聚合是否仍需调参）。Phase 5.3 与 5.1 有依赖（Timeline 拖动依赖 `zCurrent` 概念），建议在 5.1.5 后开始。Phase 5.4 可随时穿插。
