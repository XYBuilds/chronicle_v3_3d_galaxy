# Phase 5.1.6 三层星球着色器与 Bloom 恢复 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.6**（frontmatter 项 **`p5-1-6-three-layers`**，**方案 2**：A 背景 / B 焦点 / C 选中）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — 相关 Issue：**D1、T2、T3、T5、B1、B2** 及宏观粒子视觉分层  
> **报告日期**: 2026-04-17  
> **实施分支**: `phase-5-1-6-three-layer-shaders`（自 `main` 新开分支后提交）

---

## 1. 摘要

本次 Phase **5.1.6** 在 **单 `THREE.Points` + 自定义 Shader** 前提下完成 **Z 视距 slab 上的 A/B 视觉分层**：窗外粒子缩小为背景点、窗内保持数据驱动尺寸与交互语义；**片元**由硬边白环圆盘改为 **径向辉光**，并以 **`emissive`** 驱动高亮供后处理提取。选中态 **C 层** 重写 **`perlin.frag.glsl`**：按流派黄金比权重的 **累积阈值 + 3D FBM 噪声** 做 **面积比例分区着色**（可调 `uScale` / `uOctaves` / `uPersistence` / `uThreshold`），并将 IcoSphere **细分 `detail` 提升至 4**。**`UnrealBloomPass`** 从 strength `0` **恢复为可用强度**（与仓库内 `frontend-threejs` 约定区间对齐）。**Raycaster 拾取** 增加与 shader 一致的 **Z 窗口过滤**，避免背景层抢 hover/click（与计划「A 不可交互」及后续 **5.1.7** 方向一致）。

**材质深度**：点云与选中球 `ShaderMaterial` 的 **`depthWrite` 现为 `false`**，减轻透明粒子与后处理叠画时的深度排序压力（若后续出现「远盖近」类回归，可在独立 Issue 中再评估是否仅对点云或仅对选中态回调 `depthWrite`）。

---

## 2. 背景与目标（对照计划 5.1.6）

| 计划要求 | 实施要点 |
| --- | --- |
| **A — 窗口外背景层** | `point.vert.glsl`：Z ∉ `[zCurrent, zCurrent+zVisWindow]` 时使用极小 `gl_PointSize`（`uBgPointSizePx`）；颜色仍用属性 **`color`**（数据侧 `genres[0]` 对应 RGB） |
| **B — 窗口内焦点层** | 同上：窗内沿用 **`size` × 透视 × `uSizeScale`**；`vInFocus` 传入片元做亮度/边缘差异 |
| **A↔B 过渡** | 计划确认 **先硬切**；顶点用 `step` 二值混合 `gl_PointSize`，未做 size/alpha 渐变 |
| **C — Perlin 面积分区** | `perlin.frag.glsl`：FBM 归一化噪声映射到 `[0,1]`，按 **`uWeight0..3` 累积边界** + **`uThreshold` 控制 smoothstep 边界宽度** 分区着色；**非**旧版「单色混合 × 明暗噪声」 |
| **IcoSphere 细分** | `planet.ts`：`IcosahedronGeometry(1, detail)` 的 **`detail`：3 → 4** |
| **Bloom 重新启用** | `scene.ts`：`UnrealBloomPass` **strength / radius / threshold** 设为非零工作点（见 §4.3） |
| **片元径向辉光 + emissive** | `point.frag.glsl`：指数型 core/halo，`vEmissive` 缩放 RGB |
| **Uniform 与 tick** | `galaxy.ts` 注册 `uZCurrent`、`uZVisWindow`、`uBgPointSizePx`；`scene.ts` 每帧与 `useGalaxyInteractionStore` 同步 |
| **背景层不拾取** | `interaction.ts`：`intersectObject` 后遍历 hits，**仅采纳** `movie.z` 在焦点 slab 内的命中 |

---

## 3. 变更文件与职责

| 文件 | 变更说明 |
| --- | --- |
| `frontend/src/three/shaders/point.vert.glsl` | 新增 `uZCurrent`、`uZVisWindow`、`uBgPointSizePx`；输出 `vInFocus`；按 Z slab 混合 `gl_PointSize` |
| `frontend/src/three/shaders/point.frag.glsl` | 径向辉光、`vEmissive`、窗内外 `vInFocus` 与边缘 soft alpha |
| `frontend/src/three/shaders/perlin.frag.glsl` | 新增 `uScale`、`uOctaves`、`uPersistence`、`uThreshold`；FBM 分区混色 + 保留 rim |
| `frontend/src/three/galaxy.ts` | `ShaderMaterial.uniforms` 增加 Z 窗口与背景点像素；**`depthWrite: false`** |
| `frontend/src/three/planet.ts` | Ico **`detail = 4`**；Perlin 新 uniform 默认值；**`depthWrite: false`** |
| `frontend/src/three/scene.ts` | 挂载后初始化 `uZCurrent`/`uZVisWindow`；`tick` 内每帧写入；Bloom 参数调整 |
| `frontend/src/three/interaction.ts` | `movieInZFocusSlab` + 拾取时跳过窗外粒子 |
| `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` | frontmatter 将 **`p5-1-6-three-layers`** 标为 **`completed`** |

**未纳入本子阶段（按计划顺延）**

- **5.1.7**：Raycaster 阈值按窗内密度重算、双 Points 方案等可继续深化；当前已实现「仅窗内可命中」的核心行为。  
- **5.1.8**：Tech Spec / Design Spec 文档同步仍待单独排期。

---

## 4. 技术细节

### 4.1 Z slab 判定（与 store / 相机一致）

- **区间**：**\[`zCurrent`, `zCurrent + zVisWindow`\]**（闭区间，与 `interaction.ts` 中 `movieInZFocusSlab` 一致）。  
- **数据源**：`useGalaxyInteractionStore`（Phase **5.1.5** 已引入 `zCurrent`、`zVisWindow`、`zCamDistance`）。  
- **更新时机**：`mountGalaxyScene` 在 `createGalaxyPoints` 后立即写入首帧 uniform；**RAF `tick`** 内与相机同一帧读取 store 并更新 **`uZ` / `uZw`**，避免与滚轮修改的 `zCurrent` 脱节。

### 4.2 点云 Shader 关键 uniform

| Uniform | 含义 | 典型初值 / 说明 |
| --- | --- | --- |
| `uZCurrent` | 时间轴焦点（世界 Z，decimal year） | 与挂载时 store 一致 |
| `uZVisWindow` | 可见 Z 窗口宽度（年） | 计划默认 **1** |
| `uBgPointSizePx` | 背景层屏幕近似直径（CSS 像素侧尺度） | 默认 **2.25**（可按美术再调） |
| `uPixelRatio` / `uSizeScale` / `uPointsOpacity` | 既有；DPR、尺寸倍率、选中动画全局淡出 | 与 Phase 4.5 行为兼容 |

### 4.3 Bloom（`scene.ts`）

当前 **`UnrealBloomPass`** 构造参数（`resolution`, **strength**, **radius**, **threshold**）为：

- **strength**: `0.95`（计划建议约 **0.8–1.2**）  
- **radius**: `0.52`  
- **threshold**: `0.82`  

运行时仍可通过 **`window.__bloom`** 读写 strength / radius / threshold 并 `log()`，便于后续联调。

### 4.4 选中球 Perlin 新 uniform（`planet.ts` 默认值）

| Uniform | 默认值（约） | 作用 |
| --- | --- | --- |
| `uScale` | `2.35` | 物体空间噪声采样缩放 |
| `uOctaves` | `4` | FBM 八度上限 **8** 内 clamp |
| `uPersistence` | `0.52` | 八度振幅衰减 |
| `uThreshold` | `0.048` | 流派边界 smoothstep 半宽（噪声归一化空间） |

流派颜色与权重仍由 **`setFromMovie`** 写入 **`uColor0..3`**、**`uWeight0..3`**（黄金比衰减与 Phase 4.5 一致）。

### 4.5 拾取逻辑（`interaction.ts`）

- **`pickIndex`**：在 **`raycaster.intersectObject(points)`** 返回的 **hits 数组** 上按顺序查找 **第一个** 满足 **`movieInZFocusSlab(movies[idx].z, zCurrent, zVisWindow)`** 的 **`index`**。  
- 效果：窗外小点可被射线碰到，但 **不会** 成为 hover/click 结果，与 **A 层不参与交互** 的产品描述一致。

---

## 5. 验收对照（计划 5.1.6 原文要点）

| 验收项 | 状态 |
| --- | --- |
| 宏观浏览时 **仅时间窗口内** 粒子以数据 **`size`** 呈现；窗外为背景小点 | **已实现**（顶点 `gl_PointSize` 分支） |
| 窗内粒子可拾取；窗外不参与 hover/click | **已实现**（拾取过滤；shader 侧 A 层更小更淡） |
| Bloom **重新启用**且不依赖 strength=0 | **已实现**；具体「不淹没颜色」需后续肉眼与 **`__bloom`** 微调 |
| C 层 Perlin：**按权重面积分区** + 可调噪声参数 | **已实现**；观感与阈值需后续迭代 |
| 单 draw call（单 Points） | **保持** |

---

## 6. 构建与静态检查

在 `frontend/` 目录执行：

- **`npm run build`**（`tsc -b` + `vite build`）— **通过**  
- **`npm run lint`**（`eslint .`）— **通过**

---

## 7. Git 信息

| 项 | 值 |
| --- | --- |
| **分支** | `phase-5-1-6-three-layer-shaders` |
| **代表性提交** | **`1d0eec1`** — `feat(phase-5.1.6): three-layer points shader, Perlin genre zones, bloom` |

若此后在 **同一分支** 上继续提交（例如 **Bloom 数值**、`uBgPointSizePx`、**`depthWrite`** 策略），建议在 PR 描述中引用本报告并追加小节或修订记录表。

---

## 8. 结论与后续说明（简短记录）

**计划层面**：当前 **Phase 5.1.6** 在 follow-up 计划中的 **功能性与实现项**（A/B/C 分层路径、Bloom 恢复、Perlin 分区模型、uniform 驱动、窗内拾取约束等）**已按条目交付并在本报告中对照完毕**。

**观感与质量层面**：**视觉上尚未达到理想终态**；Bloom 强度、背景点尺度、径向辉光曲线、Perlin 边界柔和度与颜色饱和度等仍需在 **真实数据与多 DPR / 多缩放** 下继续打磨。**Bug 与改进点** 不在本报告穷尽列出，**将在后续开发与复测过程中** 以 Issue 或新子阶段（如 **5.1.7 / 5.1.8**）形式提出并跟踪。

---

*本报告随代码演进可增补「修订记录」表（日期 / 变更摘要 / 关联提交）。*
