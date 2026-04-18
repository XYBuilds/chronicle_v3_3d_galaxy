# Phase 5.1.8 Spec 文档同步 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.8**（frontmatter 项 **`p5-1-8-spec-sync`**）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — Phase 5.1 核心架构变更（视距窗口 / 三层粒子 / DPR 兼容）超出当前 Spec 覆盖范围  
> **报告日期**: 2026-04-18  
> **实施分支**: `phase-5.1.8-spec-sync`（自 `main` 新开分支后提交；`main` 头已含 5.1.1–5.1.7 全部已完成子阶段）

---

## 1. 摘要

Phase **5.1.8** 是 Phase 5.1 的**纯文档收尾**子阶段：不改动任何运行时代码，仅将 **5.1.4.7（DPR 兼容）**、**5.1.5（视距窗口模型）**、**5.1.6（三层粒子着色器 + Perlin 重写 + Bloom 恢复）**、**5.1.7（Raycaster 窗口内拾取）** 四个子阶段引入的新概念 / 新约束同步到产品级规范文档：

| 规范文档 | 范围 |
| :---- | :---- |
| `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` | §1.1 渲染架构（三层粒子 + Perlin 面积分区 + detail=4）、§1.2 Bloom（5.1.6 工作点、DPR 约束）、§1.4 拆分为 1.4.1–1.4.7 覆盖视距窗口 / 初始位置 / 滚轮双模式 / clamp / DPR 约束、**新增 §1.5 交互拾取（Raycaster）** |
| `docs/project_docs/TMDB 电影宇宙 Design Spec.md` | §2.1 宏观漫游状态补充视距窗口 + A/B 分层表 + 宏观 idle 下滚轮语义；§2.2 微观聚焦状态更新 Perlin 着色策略为面积比例分区（含与旧实现的对比）；§3.1 Timeline 指示器改为 `zCurrent` 语义并说明 bridge 分支 |

**未涉及**：Python 数据处理规则（`TMDB 数据处理规则.md`）与特征工程总表（`TMDB 数据特征工程与 3D 映射总表.md`）—— Phase 5.1.4 的根因最终锁定为 H-G（DPR 兼容），**不**触及 UMAP 管线或坐标构建端（H-A / H-B 路径均 cancelled / 未采纳），因此数据侧文档 **本阶段无需同步**。Phase 5.2 UMAP 调参将独立推进，届时再同步相关条目。

---

## 2. 背景与目标（对照计划 5.1.8）

### 2.1 背景

计划 **§5.1.8** 原文：

> 方案 1/2 引入的 `zCurrent`、`zVisWindow`、`zCamDistance`、粒子三层分层等概念超出现有 Tech Spec / Design Spec 范围。5.1.4 T1 根因修复若涉及世界坐标系构建或 UMAP 管线，也需在此统一同步。

在 5.1.4.7 / 5.1.5 / 5.1.6 / 5.1.7 各自的实施报告"未纳入本子阶段 / 后续工作"条目中，均将"**Spec 文档同步**"顺延至本阶段；本次一次性合并完成。

### 2.2 目标与完成情况

| 目标 | 结果 |
| :---- | :---- |
| Tech Spec §1.4 相机章节补充 `zCurrent` / `zVisWindow` / `zCamDistance` 三参数模型 | **已完成**（§1.4.1） |
| Tech Spec §1.4 补充 DPR 兼容性约束（setPixelRatio 顺序、composer 同步、updateStyle=true、RAF 兜底） | **已完成**（§1.4.6） |
| Tech Spec §1.1 粒子渲染补充 A / B / C 三层与 shader 分支（单 draw call 保持） | **已完成** |
| Tech Spec §1.1 Perlin 选中层由"单色 × 明暗"升级为"面积比例分区 + 可调 uniform" | **已完成** |
| Tech Spec §1.2 Bloom 补充 Phase 5.1.6 恢复后的工作点与 DPR 约束指针 | **已完成** |
| Tech Spec 新增 §1.5 Raycaster 拾取规则（slab 闭区间 + nSlab 启发式 threshold） | **已完成** |
| Design Spec §2.1 宏观状态补充视距窗口定义与 A / B 分层表 | **已完成** |
| Design Spec §2.2 微观状态更新 Perlin 策略并**明确记录旧实现已被整体替换** | **已完成** |
| Design Spec §3.1 Timeline 指示器由"camera Z"改为"zCurrent"语义（含非 idle 推导） | **已完成** |
| 计划 frontmatter **`p5-1-8-spec-sync`** 标记为 `completed` | **已完成** |

### 2.3 非目标

- 不改动任何 `.ts` / `.tsx` / `.glsl` / `.py` 源码。  
- 不重排章节编号之外的既有条款（如 Bloom 建议区间 `0.8–1.2`、相机 near/far 初值、UMAP 参数约定等保持原样），仅在必要位置追加或替换局部段落。  
- 不涉及 Python 管线文档（`TMDB 数据处理规则.md` / `TMDB 数据特征工程与 3D 映射总表.md`）——本轮 T1 根因为 DPR，无管线层改动。

---

## 3. 变更文件与职责

| 文件 | 变更摘要 |
| :---- | :---- |
| `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` | §1.1 补"粒子分层（Phase 5.1.6 · 方案 2）"段与 A/B/C 层表；选中层 Perlin 段重写；§1.2 追加"Phase 5.1.6 工作点"与"DPR 约束"指针；§1.4 拆分为 1.4.1–1.4.7；**新增 §1.5 交互拾取（Raycaster · Phase 5.1.7）** |
| `docs/project_docs/TMDB 电影宇宙 Design Spec.md` | §2.1 补"视距窗口"与"粒子视觉分层"两个子项（含 A/B 两行表）、滚轮语义澄清；§2.2 重写第 2 步"材质溶解"中 Perlin 策略，附旧实现被替换的变更记录；§3.1 Timeline 指示器与 bridge 分支说明 |
| `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` | frontmatter 将 **`p5-1-8-spec-sync`** 标为 **`completed`**（正文 `## 里程碑` 段已隐含 M5.1 完成状态，无需额外改写） |
| `docs/reports/Phase 5.1.8 Spec 文档同步 实施报告.md` | **本报告**（新增） |

---

## 4. 关键变更摘要（按 Spec 章节）

### 4.1 Tech Spec §1.1 渲染架构

**粒子分层（新增段落）**：

- 在保持"单 `THREE.Points` + 自定义 `ShaderMaterial` / 1 次 draw call"的前提下，顶点 shader 新增 **`uZCurrent`** / **`uZVisWindow`** / **`uBgPointSizePx`** uniform，按 `step` 在 A / B 间二值混合 `gl_PointSize`。  
- 列出 A / B / C 三层的定义、视觉、交互语义对照表。  
- 点云 `ShaderMaterial.depthWrite = false`（减轻透明粒子与后处理叠画的深度排序压力）。

**选中层（Perlin 重写）**：

- IcoSphere `detail` 由 3 提升至 4。  
- Perlin 策略由"所有 genre 颜色加权混合成单色 × 噪声明暗"变更为"按累积阈值 + 3D FBM 噪声做**面积比例分区着色**"，边界使用 `smoothstep(uThreshold)` 柔和过渡。  
- 明确可调 uniform：`uScale` / `uOctaves` / `uPersistence` / `uThreshold`，附默认值（约 2.35 / 4 / 0.52 / 0.048）。

### 4.2 Tech Spec §1.2 Bloom

- 追加 "Phase 5.1.6 实施工作点"：strength ≈ 0.95、radius ≈ 0.52、threshold ≈ 0.82，落在既有建议区间内；保留运行时 **`window.__bloom`** 调参接口的事实说明。  
- 追加 "DPR 约束" 指针——指向 §1.4.6。

### 4.3 Tech Spec §1.4 相机（重构）

拆分为 7 个子章节：

1. **§1.4.1 视距窗口模型（Phase 5.1.5 · 方案 1）**：`zCurrent` / `zVisWindow` / `zCamDistance` 三参数与初值来源；宏观 idle 下相机世界 Z = `zCurrent - zCamDistance`；非 idle 不覆盖相机 Z，bridge 改为 `camera.position.z + zCamDistance` 推导。  
2. **§1.4.2 相机初始位置**：X/Y 仍为 `xy_range` 中心；Z 由 §1.4.1 推导；朝向 `Euler(0, π, 0, 'YXZ')` 永远恒定；硬约束禁止将目测 yaw / pitch 补偿写入常量。  
3. **§1.4.3 滚轮与拖拽控制**：滚轮双模式（宏观 idle 改 `zCurrent`；非 idle 直接改 camera.z），`getMacroZWheel` 钩子；滚轮步长初值 0.5；拖拽语义。  
4. **§1.4.4 Clamp**：`zCurrent` ∈ `[zLo, zHi]`；XY ∈ `xy_range + 0.08 × 轴跨度`；`clampGalaxyCameraXY` 在拖拽与每帧 tick 共享。  
5. **§1.4.5 近远裁面**：沿用 near=0.1 / far=300，预告 Phase 5.4.3 按 `zVisWindow` 收窄。  
6. **§1.4.6 DPR 兼容性约束（Phase 5.1.4.7 · H-G）**：6 条强制条款（顺序、EffectComposer 显式对齐、setSize updateStyle=true、RAF 兜底、pixelRatio 上限 2、uPixelRatio 同步）；明确禁止症状掩盖式旋转常量。  
7. **§1.4.7 首屏加载体验**：沿用原 §1.4 末段（Spinner、全量解析、不做错误页）。

### 4.4 Tech Spec §1.5 交互拾取（新增）

- `movieInZFocusSlab` 闭区间判定；命中序列按序过滤；A 层跳过。  
- `Points.threshold` 的 `nSlab` 启发式公式：`nSlab ≈ movieCount × zVisWindow / |z_span|`、`avgXYSpacing = sqrt(xyArea / nSlab)`、`threshold = clamp(0.75 × avgXYSpacing, xyMin × 1e-4, xyMin × 0.08)`。  
- 更新时机：`zVisWindow` 变化时重算并缓存；仅 `zCurrent` 滚动时 O(1) 早退。  
- 备选"双 Points"方案不启用的说明。  
- 假设与局限：发行年在 `z_range` 上近似均匀；Z 过滤保证窗外点绝不成为交互目标。

### 4.5 Design Spec §2.1 宏观漫游状态

- 新增"视距窗口（Phase 5.1.5 · 方案 1）"子项：`zCurrent` / `zVisWindow` / `zCamDistance` 的设计语义与初值；状态位于 Zustand；多处（Timeline / 相机 / shader / Raycaster）共享。  
- 新增"粒子视觉分层（Phase 5.1.6 · 方案 2）"A / B 二行对照表；A↔B 硬切策略与未来过渡方案预留。  
- 滚轮语义澄清：宏观 idle 下实际写入 `zCurrent`，相机 = `zCurrent - zCamDistance`。  
- 拖拽补充 XY clamp 描述。

### 4.6 Design Spec §2.2 微观聚焦状态

- 材质溶解步骤中，Perlin 描述由通用 "Scale / Octaves / Persistence / edgeSoftness" 更新为 Phase 5.1.6 的**面积比例分区着色**策略：  
  - `IcosahedronGeometry(radius, detail=4)`；  
  - 权重 `w_k` 累积阈值 + 3D FBM 噪声分区选色；  
  - 边界 `smoothstep(uThreshold)`；  
  - 可调 uniform `uScale` / `uOctaves` / `uPersistence` / `uThreshold` 与默认值。  
- **附变更记录**：明确说明 Phase 5.1.6 之前的"单色 × 明暗调制"实现已被**整体替换**，避免阅读历史代码时产生语义歧义。  
- "环境景深重构"与 §2.1 A 背景层建立语义对应。

### 4.7 Design Spec §3.1 Timeline

- 当前位置标记由"摄像机所在年代"改为 "`zCurrent`"（Phase 5.1.5）；分宏观 idle 与非 idle 两种 bridge 行为。  
- 交互条目注明"拖动 / 点击跳转"在 Phase 5.3.1 单独排期，不属于本阶段交付。

---

## 5. 与各前置子阶段报告的一致性核对

| 前置子阶段 | 关键事实 | 本次 Spec 同步位置 |
| :---- | :---- | :---- |
| 5.1.4.7（H-G DPR） | `setPixelRatio` 先于 `setSize`；composer 显式同步；setSize updateStyle=true；RAF 兜底；pixelRatio 上限 2；严禁目测旋转常量 | Tech Spec §1.4.6（逐条对齐） |
| 5.1.5（视距窗口） | `zCurrent = zLo`（Rev 4）；`zCamDistance = max(2, zSpan × 0.045 + 1.2)`；idle 双模式滚轮；XY / Z clamp；bridge 语义 | Tech Spec §1.4.1 / §1.4.3 / §1.4.4；Design Spec §2.1 / §3.1 |
| 5.1.6（三层 + Perlin） | 单 Points + shader 分支；`uZCurrent` / `uZVisWindow` / `uBgPointSizePx`；径向辉光 + emissive；Perlin 累积阈值 + 3D FBM 面积分区；detail=4；Bloom 恢复 strength≈0.95 | Tech Spec §1.1 / §1.2；Design Spec §2.1 / §2.2 |
| 5.1.7（Raycaster 适配） | `movieInZFocusSlab` 闭区间；`nSlab` 启发式 threshold；命中按序过滤；双 Points 未启用 | Tech Spec §1.5 |

各条与前置实施报告中的"变更文件与职责"、"技术细节"、"验收对照"保持一致；若后续代码迭代产生漂移，优先以**最新实施报告 + 源码**为准，Spec 作为"产品级约定"同步更新。

---

## 6. 验证与命令

本阶段为**纯文档变更**，无需 `npm run build` / `npm run lint` 等运行时校验。验证手段：

1. **人工复读**：逐段对照 `phase_5_follow-up_plan_64727854.plan.md` 中 5.1.4–5.1.7 的"实现"与"验收"条目、以及对应实施报告的"变更文件与职责"、"技术细节"表。  
2. **Markdown 渲染**：在 Cursor 预览下检查 `|` 表格对齐、LaTeX 公式（`\(...\)`、`\[...\]`）渲染、章节锚点（§1.4.1 等）无断链。  
3. **交叉引用**：  
   - Tech Spec §1.2 → §1.4.6 的 DPR 约束指针可达；  
   - Tech Spec §1.1 粒子分层 → §1.5 `movieInZFocusSlab` 区间一致（闭区间）；  
   - Design Spec §2.2 "环境景深重构" → §2.1 A 背景层语义对齐。

---

## 7. 已知限制与后续说明

| 项 | 说明 |
| :---- | :---- |
| **Python 管线文档未改** | 本轮 T1 根因为 DPR，未触及 UMAP / 坐标构建。Phase 5.2.1 调整 `min_dist` 时再同步 `TMDB 数据处理规则.md` / `TMDB 数据特征工程与 3D 映射总表.md` 的 UMAP 章节（计划 §5.1.8 原本列为"若 5.1.4 确认 H-A 才更新"的条件分支，现无需执行） |
| **API 命名遗留** | `setGalaxyCameraZ` 仍为历史名但语义已为 `zCurrent`；Spec 中已说明，代码重命名为 `setGalaxyZCurrent` 可放在日后统一重构中处理（属 Phase 5.4 或后续，非本阶段范围） |
| **Timeline 拖动** | Design Spec §3.1 已预告归入 Phase 5.3.1；届时该子阶段的实施报告应复核并更新本处"交互（可选 / 规划中）"段 |
| **Bloom 未淹没颜色** | Phase 5.1.6 报告指出"视觉终态仍需打磨"；若后续在真实数据 + 多 DPR 场景下调整数值，Tech Spec §1.2 的"Phase 5.1.6 实施工作点"需同步更新，不 bump 宇宙数据版本号 |

---

## 8. Git 信息

| 项 | 值 |
| :---- | :---- |
| **分支** | `phase-5.1.8-spec-sync` |
| **提交范围** | 本报告提交时一并包含 Tech Spec / Design Spec 的内容变更与计划 frontmatter 状态更新 |

---

*本报告随代码与 Spec 后续迭代可增补"修订记录"表；首次建档时 M5.1（视距窗口 + 三层粒子 + 相机修正 + 蒙版修复 → 宏观浏览体验质变）所覆盖的 Phase 5.1.1–5.1.8 全部子阶段在计划 frontmatter 中均已 **completed**。*
