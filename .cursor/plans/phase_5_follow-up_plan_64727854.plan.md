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
    status: pending
  - id: p5-1-3-eslint
    content: "Phase 5.1.3: ESLint 修复 — Drawer.tsx:195 react-hooks/set-state-in-effect (B5)"
    status: pending
  - id: p5-1-4-xy-center
    content: "Phase 5.1.4: XY 内容中点居中 — scene.ts 中用 movies[].x/y 中位数替代 xy_range min/max 中心 (T1, 方案3)"
    status: pending
  - id: p5-1-5-z-window
    content: "Phase 5.1.5: 视距窗口模型 — 引入 zCurrent/zVisWindow/zCamDistance，改造 camera.ts 滚轮逻辑 + bridge 升级 + camera clamp (T4, D1, 方案1)"
    status: pending
  - id: p5-1-6-three-layers
    content: "Phase 5.1.6: 三层星球着色器 — A(背景)/B(焦点) shader 分层 + 重写 C(选中) Perlin 着色器为面积比例分区染色，重新启用 Bloom，fragment 径向辉光 (D1, T2, T3, T5, B1, B2, 方案2)"
    status: pending
  - id: p5-1-7-raycaster
    content: "Phase 5.1.7: Raycaster 适配 — 拾取范围限制到窗口内层 (T6)"
    status: pending
  - id: p5-1-8-spec-sync
    content: "Phase 5.1.8: Spec 文档同步 — 更新 Tech Spec / Design Spec 新增的视距窗口与分层概念"
    status: pending
  - id: p5-2-1-umap-tune
    content: "Phase 5.2.1: UMAP 参数调优 — min_dist 增大至 0.3-0.5，重跑管线，确保 export meta 同步 (DS1)"
    status: pending
  - id: p5-2-2-model-b
    content: "Phase 5.2.2: 阶段 B Embedding 模型评估（可选）— 768 维模型语义分离评估"
    status: pending
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

### 5.1.4 XY 内容中点居中

**解决**: T1（星系不在屏幕中间）| **方案 3**

**现状**: [scene.ts](frontend/src/three/scene.ts) 使用 `(x_min+x_max)/2, (y_min+y_max)/2` 作为相机 XY（`xyCenter` 函数），UMAP 分布不对称导致内容偏离屏幕中心。

**实现**:
- 在 [scene.ts](frontend/src/three/scene.ts) 的 `mountGalaxyScene` 中，数据加载后对 `movies[].x` / `movies[].y` 分别排序求**中位数** `medianX`, `medianY`（59K 量级，单次排序可接受）
- 用 `(medianX, medianY)` 替代现有 `xyCenter(meta)` 的返回值作为相机初始 XY
- 可选：`console.log` 输出中位数与 min/max 中点差值供调试

**验收**: 首屏星系视觉中心在屏幕中央附近，不再明显偏移。

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

方案 1/2/3 引入的 `zCurrent`、`zVisWindow`、`zCamDistance`、粒子三层分层等概念超出现有 Tech Spec / Design Spec 范围。每完成一个子任务后同步更新：
- [TMDB 电影宇宙 Tech Spec.md](docs/project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) — 相机模型 §1.4、粒子渲染 §1.1
- [TMDB 电影宇宙 Design Spec.md](docs/project_docs/TMDB%20电影宇宙%20Design%20Spec.md) — 视觉分层、交互模型

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

Phase 5.1 编号即为执行顺序：**5.1.1–5.1.3（快速修正）→ 5.1.4（中位数）→ 5.1.5（视距窗口）→ 5.1.6（三层着色器）→ 5.1.7（Raycaster 适配）→ 5.1.8（Spec 同步）**

**已确认**: Phase 5.2 在 5.1 全部完成后再做（在新视觉体系下评估局部聚合是否仍需调参）。Phase 5.3 与 5.1 有依赖（Timeline 拖动依赖 `zCurrent` 概念），建议在 5.1.5 后开始。Phase 5.4 可随时穿插。
