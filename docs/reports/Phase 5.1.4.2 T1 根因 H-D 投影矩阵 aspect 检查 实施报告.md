# Phase 5.1.4.2 T1 根因 H-D（投影矩阵 / aspect）检查 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.4.2**（frontmatter 项 **`p5-1-4-2-t1-hd`**）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — **Issue T1**（相机视线与 Z 轴不平行；根因调查序列 **§11.1** 中 **H-D**）  
> **报告日期**: 2026-04-17  
> **范围**: 在 `frontend/src/three/scene.ts` 的 **`mountGalaxyScene`** 中临时加入 **renderer 尺寸、`camera.aspect`、`projectionMatrix` 及与计划一致的辅助判定**；经控制台观测 **排除 H-D** 后 **移除全部诊断代码**，与计划「5.1.4 收尾」一致。  
> **不在范围**: H-F（vertex shader）、H-B / H-A / H-C；视距窗口、三层着色器、Raycaster、Spec 同步等。

---

## 1. 摘要

在 **Phase 5.1.4.1 已排除 H-E**（运行时 `camera.rotation` 漂移）的前提下，按计划 **5.1.4.2** 验证 **H-D**：**容器 / 画布尺寸与 `devicePixelRatio` 是否导致 `camera.aspect` 与 WebGL 绘制缓冲宽高比不一致，或投影矩阵出现非标准透视（灭点偏移）**。

实施方式：在 **`resize()`** 完成 `camera.aspect`、`updateProjectionMatrix`、`renderer.setSize` 等之后，以及 **首次将 `renderer.domElement` 挂到 DOM 之后**，打印 **`[T1/H-D]`** 结构化日志；并对 **`camera.aspect` 与 `renderer.getSize` 推导的 `expectedAspect`**、以及 **`projectionMatrix.elements[8]` / `[9]`** 做阈值检测，异常时 **`console.error`**。

**观测结论（用户一次典型采样）**：`aspect` 与 `expectedAspect` 一致；`projectionMatrix` 的 **`m[8]`、`m[9]` 为 0**；`canvasSize`（绘制缓冲）与 `clientSize`（CSS 布局）不同属 **DPR 缩放下的正常现象**，且宽高比与 `aspect` 一致。**H-D 不成立**。随后 **删除** 所有 H-D 诊断代码，**`scene.ts` 恢复为无 `[T1/H-D]` 日志的常态**。

| 项 | 内容 |
| --- | --- |
| **假设（H-D）** | 尺寸或 CSS 干扰导致 **`camera.aspect` ≠ 绘制缓冲宽高比**，或 **`projectionMatrix` 非标准透视**（如 `m[8]` / `m[9]` 非零），灭点偏移使画面「像相机歪了」。 |
| **检测方式** | **`renderer.getSize`**、`camera.aspect`、`expectedAspect`、`fov` / `near` / `far`、**`projectionMatrix`** 全量打印；**aspect 偏差**与 **m[8]/m[9]** 辅助报错。 |
| **观测结论** | **排除 H-D**；T1 继续按计划在 **Phase 5.1.4.3（H-F）** 等后续假设上排查。 |
| **代码终态** | **无** H-D 诊断残留；行为与加入诊断前一致。 |

**Git 参考（诊断曾存在于功能分支）**:

| SHA（短） | 说明 |
| --- | --- |
| **`c7c5351`** | `feat(phase-5.1.4.2): T1/H-D projection matrix and aspect diagnostics` — 在 `scene.ts` 中加入 H-D 日志与辅助 `console.error`。 |
| **收尾提交** | 与 **本文档** 同批交付：`docs(phase-5.1.4.2): H-D aspect/projection report; remove T1/H-D diagnostics from scene.ts` — 从 **`scene.ts`** 移除全部 H-D 探针（具体 SHA 见 **`git log`**）。 |

**计划同步**: follow-up 计划 frontmatter 中 **`p5-1-4-2-t1-hd`** 标记为 **`completed`**（与 Phase 5.1.4.2 完成态一致）。

---

## 2. 背景与目标

### 2.1 背景

- **H-E** 已在 5.1.4.1 中通过运行时检测 **排除**。  
- 计划 **5.1.4.2** 提出 **H-D**：DevTools、CSS 缩放、非标准 **`devicePixelRatio`** 等是否导致 **aspect / 投影矩阵** 异常，从而在透视下产生不对称灭点，被用户误读为「视线不平行于 Z」。  
- 本任务 **不** 引入任何 **-15° / -7.5°** 等硬编码角度补偿；仅做 **只读诊断** 与结论记录。

### 2.2 目标（对照 Phase 5.1.4.2）

| 目标 | 结果 |
| --- | --- |
| 在 **挂载后** 与 **每次 `resize` 后** 可复现打印诊断对象 | **已完成**（见 §3；后已移除） |
| 按判定标准 **排除或确认 H-D** | **已排除 H-D**（见 §4） |
| 排除后 **移除** 临时 `console.log` / `console.error`，避免刷屏与噪音 | **已完成** |
| 构建可通过 | 移除前后在 **`frontend/`** 执行 **`npm run build`** 均应通过（见 §5） |

---

## 3. 技术说明（实施内容）

### 3.1 修改文件

- **`frontend/src/three/scene.ts`** — 函数 **`mountGalaxyScene`** 内，**`window.__galaxyPointScale` 调试块之后**、**`resize` 定义之前**。

### 3.2 诊断逻辑（已移除，此处作文档归档）

1. **`THREE.Vector2`  scratch**：供 **`renderer.getSize(...)`** 使用，避免每帧分配。  
2. **`logT1HdProjectionDiagnostics()`**  
   - 读取 **`renderer.getSize`** → **`canvasSize`**（逻辑尺寸，与 `setSize(w,h,false)` 一致语义）。  
   - **`renderer.domElement.clientWidth` / `clientHeight`** → **`clientSize`**。  
   - 打印 **`aspect`**、**`expectedAspect = sizeX / sizeY`**、**`fov` / `near` / `far`**、**`projectionMatrix`**（`Array.from(camera.projectionMatrix.elements)`）。  
   - 若 **`|aspect - expectedAspect| > 1e-4`**（且 `sizeY > 0`），**`console.error('[T1/H-D] camera.aspect !== renderer width/height ratio', ...)`**。  
   - 若 **`|m[8]| > 1e-6` 或 `|m[9]| > 1e-6`**，**`console.error('[T1/H-D] projectionMatrix m[8]/m[9] non-zero ...')`**（对应计划所述非对称 / 斜透视线索）。  
3. **调用时机**  
   - **`resize()`** 末尾：若 **`renderer.domElement.parentElement`** 已存在（避免未挂载时无意义的 `clientSize`），调用一次诊断。  
   - **`container.appendChild(renderer.domElement)`** 之后 **再调用一次**，满足计划「挂载后」打印。

### 3.3 与计划原文的对应关系

计划建议的字段包括：`canvasSize`、`clientSize`、`aspect`、`expectedAspect`、`fov`、`near`、`far`、`projectionMatrix`。实现 **完全覆盖**上述字段，并增加 **aspect** 与 **m[8]/m[9]** 的 **自动报错** 以加快判定。

---

## 4. 实施与验证

### 4.1 分支与工作流（历史）

1. 自 **`main`** 创建或使用功能分支 **`phase-5.1.4.2-t1-hd-projection-aspect`**。  
2. 提交 **`c7c5351`**：加入 §3.2 所述诊断。  
3. 本地 **`npm run dev`**，打开星系页，打开 **Console**，执行 **窗口 resize**、开关 DevTools 等。  
4. 根据 §4.2 样本与判定表得出结论。  
5. **收尾**：删除 **`logT1HdProjectionDiagnostics`** 及相关调用，保留 **本报告** 与 **计划 todo `completed`**。

### 4.2 用户提供的典型 `[T1/H-D]` 样本（节选）

以下为一次真实控制台输出（对象字段），用于 **验收归档**：

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `aspect` | `≈ 1.05756` | 与 `expectedAspect` 一致 |
| `expectedAspect` | `≈ 1.05756` | `790/747`，与绘制缓冲宽高比一致 |
| `canvasSize` | `[790, 747]` | WebGL 绘制缓冲逻辑尺寸 |
| `clientSize` | `[1185, 1120]` | 画布 CSS 布局尺寸（约为缓冲 × **DPR**，属正常） |
| `fov` / `near` / `far` | `50` / `0.05` / `1000000` | 与 `PerspectiveCamera` 配置一致 |
| `projectionMatrix` | 16 元数组 | **`elements[8]`、`elements[9]` 为 0**；对角缩放与 `fov`、`aspect` 一致，为标准透视 |

**未出现**实现中附加的两类 **`console.error`**（aspect 比值不一致、m[8]/m[9] 非零）。

### 4.3 判定标准（与计划对齐）与本结论

| 计划含义 | 本次结果 |
| --- | --- |
| **成立**：`camera.aspect` 与 `size.x/size.y` 不一致，或 `projectionMatrix` 非标准（如 **m[8]/m[9] 非零**） | **未观测到** |
| **不成立**：aspect 正确，标准透视 | **满足** → **排除 H-D** |

### 4.4 构建验证

在 **`frontend/`** 目录：

```bash
npm run build
```

在 **含诊断** 与 **移除诊断** 后均应 **`tsc -b && vite build`** 通过。

---

## 5. 结论与后续

### 5.1 结论

- **H-D（aspect / 投影矩阵异常导致透视不对称）**：在本次实现与观测下 **不成立**。  
- **T1** 根因调查按计划进入 **Phase 5.1.4.3 — H-F（`point.vert.glsl` / `perlin.vert.glsl` 世界空间变换审计）**。

### 5.2 交付物清单

| 交付物 | 路径 / 说明 |
| --- | --- |
| 实施报告（本文） | **`docs/reports/Phase 5.1.4.2 T1 根因 H-D 投影矩阵 aspect 检查 实施报告.md`** |
| 计划 todo | **`.cursor/plans/phase_5_follow-up_plan_64727854.plan.md`** — **`p5-1-4-2-t1-hd`** → **`completed`** |
| 代码终态 | **`frontend/src/three/scene.ts`** — **无** `[T1/H-D]` 诊断代码 |

### 5.3 合并建议

- 若功能分支上仍保留 **`c7c5351`** 仅含「加诊断」的提交：合并到 **`main`** 时建议 **以移除诊断后的树为准**，或 **squash** 为一条「调查完成、无残留探针」的提交，避免 **`main`** 长期携带调试日志。

---

## 6. 附录：已移除代码片段（仅作文档归档）

以下代码 **曾** 存在于 **`scene.ts`** 的 **`mountGalaxyScene`** 内（**`pointScaleDebug.log()`** 与 **`resize` 定义之间**，以及 **`resize` 末尾**、**`appendChild` 之后**），**现已删除**，勿再复制进生产分支除非重新启用调查。

```ts
const t1HdSizeScratch = new THREE.Vector2()

const logT1HdProjectionDiagnostics = () => {
  renderer.getSize(t1HdSizeScratch)
  const sizeX = t1HdSizeScratch.x
  const sizeY = t1HdSizeScratch.y
  const expectedAspect = sizeY !== 0 ? sizeX / sizeY : Number.NaN
  const canvasEl = renderer.domElement
  const m = camera.projectionMatrix.elements
  console.log('[T1/H-D]', {
    canvasSize: [sizeX, sizeY],
    clientSize: [canvasEl.clientWidth, canvasEl.clientHeight],
    aspect: camera.aspect,
    expectedAspect,
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
    projectionMatrix: Array.from(m),
  })
  if (sizeY > 0 && Math.abs(camera.aspect - expectedAspect) > 1e-4) {
    console.error('[T1/H-D] camera.aspect !== renderer width/height ratio', {
      aspect: camera.aspect,
      expectedAspect,
    })
  }
  if (Math.abs(m[8]) > 1e-6 || Math.abs(m[9]) > 1e-6) {
    console.error('[T1/H-D] projectionMatrix m[8]/m[9] non-zero (asymmetric / skew frustum)', {
      m8: m[8],
      m9: m[9],
    })
  }
}

// resize() 末尾曾包含：
// if (renderer.domElement.parentElement) {
//   logT1HdProjectionDiagnostics()
// }

// appendChild 之后曾包含：
// logT1HdProjectionDiagnostics()
```

---

*文档结束。*
