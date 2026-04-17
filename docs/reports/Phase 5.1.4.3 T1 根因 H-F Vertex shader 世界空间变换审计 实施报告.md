# Phase 5.1.4.3 T1 根因 H-F（Vertex shader 世界空间变换）审计 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.4.3**（frontmatter 项 **`p5-1-4-3-t1-hf`**）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — **Issue T1**（相机视线与 Z 轴不平行；根因调查序列 **11.1 节** 中 **H-F**）  
> **报告日期**: 2026-04-17  
> **范围**: 对 `frontend/src/three/shaders/point.vert.glsl` 与 `frontend/src/three/shaders/perlin.vert.glsl` 做**静态代码审计**，核对顶点是否经**标准 MVP** 进入裁剪空间；是否存在自定义矩阵、对 `position` 的三角函数位移、或替换 `modelMatrix` 等非预期变换。  
> **不在范围**: H-B / H-A / H-C；视距窗口、三层着色器、Raycaster、Spec 同步等。

---

## 1. 摘要

在 **Phase 5.1.4.1 已排除 H-E**、**5.1.4.2 已排除 H-D** 的前提下，按计划 **5.1.4.3** 审计 **H-F**：vertex shader 是否在**世界/视图空间**对点云或选中星球几何做了额外旋转、缩放或位移，从而在屏幕上伪装成「相机不平行于 Z」。

**审计对象**（与计划一致）:

- `frontend/src/three/shaders/point.vert.glsl` — 星系 **Points** 粒子  
- `frontend/src/three/shaders/perlin.vert.glsl` — 选中 **IcoSphere / Perlin** 星球  

仓库内 **仅此两个** `.vert.glsl` 文件（`frontend/src/three/shaders/` 下 glob 核对）。

**结论**: 两文件均将 **`gl_Position`** 约束为 **`projectionMatrix * modelViewMatrix * vec4(position, 1.0)`** 的**数学等价**形式；**未**发现计划所列「自定义 `mat4`/`mat3` 作用于 `position`」「替换 `modelMatrix`」「`sin`/`cos` 位移」等情形。**H-F 不成立**。**无需**修改着色器源码；T1 继续按计划在 **Phase 5.1.4.4（H-B）** 等后续假设上排查。

| 项 | 内容 |
| --- | --- |
| **假设（H-F）** | Vertex shader 对坐标做了非预期旋转/缩放/位移，使整体偏转。 |
| **审计方式** | 通读两 vertex shader；检索非标准 MVP 与对 `position` 的三角函数修饰。 |
| **结论** | **排除 H-F**；`gl_Position` 路径为标准透视管线。 |
| **代码终态** | **无** 功能性改动；与审计前行为一致。 |

**Git**: 本任务在分支 **`phase-5-1-4-3-t1-hf`** 上交付实施报告与计划 frontmatter 同步；提交信息 **`docs(phase-5.1.4.3): H-F vertex shader audit; complete T1/H-F plan todo`**（具体 SHA 见该分支 **`git log -1`**）。

**计划同步**: follow-up 计划 frontmatter 中 **`p5-1-4-3-t1-hf`** 标记为 **`completed`**。

---

## 2. 逐文件审计

### 2.1 `point.vert.glsl`

- **`gl_Position`**: `modelViewMatrix * vec4(position, 1.0)` 得到 `mvPosition`，再 **`projectionMatrix * mvPosition`**。  
  与计划要求的 **`projectionMatrix * modelViewMatrix * vec4(position, 1.0)`** 为**同一变换**（结合律），仅拆行以便复用 **`mvPosition.z`** 计算 **`gl_PointSize`** 的透视近似（`500.0 / dist`），属于 **sprite 尺寸**逻辑，**不**改变裁剪空间顶点方向意义上的「相机斜率」。  
- **`position`**: **未**经 `sin`/`cos` 或额外矩阵预处理再进入 `modelViewMatrix`。  
- **Uniform**: `uPixelRatio`、`uSizeScale` 仅影响 **点大小**，**不**进入 `gl_Position` 的矩阵链。

### 2.2 `perlin.vert.glsl`

- **`gl_Position`**: 单行 **`projectionMatrix * modelViewMatrix * vec4(position, 1.0)`**，与计划原文一致。  
- **`vObjPos = position`**: 将**物体空间**坐标传给 fragment，供噪声采样；**不**改写传入 MVP 的 `position`。  
- **`vNormal`**: **`normalMatrix * normal`**，标准法线变换，**不**影响 `gl_Position`。

---

## 3. 与计划判定标准的对应

| 计划判定线索 | 本仓库两 vertex shader |
| --- | --- |
| 自定义矩阵作用于 `position` | **无** |
| `modelMatrix` 被替换（在 shader 内） | Three.js 注入的 `modelViewMatrix`；shader **未**手写替换 |
| `sin`/`cos` 位移顶点 | **无** |
| `gl_Position` 标准 MVP | **满足**（`point.vert` 为等价拆分写法） |

---

## 4. 构建验证

在 **`frontend/`** 目录执行 **`npm run build`**，确认审计过程**未引入**编译错误（本任务默认无 shader 改动时与 **`main`** 一致通过）。

---

## 5. 后续（计划内）

按 **`.cursor/plans/phase_5_follow-up_plan_64727854.plan.md`**：**排除 H-F** 后进入 **Phase 5.1.4.4（H-B）** — XY 与数据密度中心偏离复测。
