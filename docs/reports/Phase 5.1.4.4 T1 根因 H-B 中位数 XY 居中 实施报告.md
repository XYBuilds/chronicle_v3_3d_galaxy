# Phase 5.1.4.4 T1 根因 H-B（XY 与密度中心偏离）— 中位数居中 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.4.4**（frontmatter 项 **`p5-1-4-4-t1-hb`**）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — **Issue T1**、**§11.1** 排查链中的 **H-B**；**设计方案 3**（中位数替代 min/max 中点）  
> **报告日期**: 2026-04-17  
> **Git 分支**: `phase-5.1.4.4-t1-hb-median-xy`（相对 `main` 新开）  
> **范围**: `frontend/src/three/scene.ts` 将首屏相机 **X/Y** 从 **`meta.xy_range` AABB 中点** 改为 **`movies[]` 的 UMAP 坐标中位数**；`docs/project_docs/TMDB 电影宇宙 Tech Spec.md` §1.4 同步；**无**临时 `console.log` 探针。  
> **不在范围**: H-A（PCA / 管线旋转）、H-C（HUD）、视距窗口、着色器分层等。

---

## 1. 摘要

按计划 **5.1.4.4**，在 **H-E / H-D / H-F 已排除** 的前提下推进 **H-B**：当数据密度质心相对 **xy_range 的 min/max 中点** 有偏移时，透视下用户易将构图偏解读为「相机不平行于 Z」。本子任务采用 **方案 3**：用 **`median(x)`、`median(y)`** 定义相机初始 **XY**，使视点对准点云统计中心；**`GALAXY_CAMERA_EULER`** 与 **Z 初值规则**不变。

**主观复测（2026-04-17，使用者肉眼）**：在已部署 **中位数 XY 初值** 的运行版本中，**T1（视线与 Z 轴不平行 / 构图需心理补偿倾斜）仍明显**。结论：**仅靠 H-B 的构图修正（方案 3）不足以消除或显著缓解主观 T1**；数值上 median 与 min/max 中点确有差异（见 §2），但 **不能将 T1 根因单独归于 XY 偏心**。后续应按计划优先进入 **5.1.4.5（H-A）** 等链路；同时已在 **`scene.ts`** 重新挂载 **Phase 5.1.4.2（H-D）** 的 **`[T1/H-D]`** 投影 / aspect 诊断，便于在「T1 仍存」前提下复核画布与投影矩阵（见 §6）。

| 项 | 内容 |
| --- | --- |
| **代码** | `xyCenterFromMovies(movies)` + `median()`；`movies.length === 0` 时回退 **`xyRangeMidpoint(meta.xy_range)`**。 |
| **文档** | Tech Spec §1.4 已改为「中位数为主、空列表回退 AABB 中点」。 |
| **临时探针** | 未保留计划中的 `[T1/H-B]` 调试 `console.log`（计划要求修复路径下移除）。**H-D** 探针见 §6（与 5.1.4.2 同型）。 |

---

## 2. 当前数据集数值对照（`frontend/public/data/galaxy_data.json`）

在仓库随附的 **`galaxy_data.json`** 上，用与前端一致的 **中位数定义**（偶数个样本取中间两数平均）计算得到：

| 量 | X | Y |
| --- | ---: | ---: |
| **min/max 中点**（原 `xy_range` AABB） | 9.80991530418396 | 4.883304595947266 |
| **median**（全部 `movies`） | 10.292582035064697 | 4.821344614028931 |
| **Δ（median − min/max 中点）** | **+0.4826667308807373** | **−0.06195998191833496** |

样本数 **`count` = 59 014**。说明：当前云在 **X** 上相对 AABB 中点 **偏正** 约 **0.48**（UMAP 单位），**Y** 差约 **0.06**；中位数居中会略向 **+X**、略向 **−Y** 移动首屏相机。人眼复测后 **T1 主观仍明显**（见 §1），故 **不能**仅凭 §2 的数值差断言「H-B 成立即可关闭 T1」。

---

## 3. 实现说明

- **`median`**: 拷贝数组后排序，偶数长度取中间两项平均（与计划片段一致）。  
- **`xyCenterFromMovies`**: 对 `movies.map(m => m.x)` / `y` 分别取中位数。  
- **挂载点**: `mountGalaxyScene` 内原 `xyCenter(meta)` 调用替换为上述逻辑；**`attachGalaxyCameraControls`** 仍接收 **`meta.xy_range`** 作为 **拖拽边界**（未改为 median 边界，避免夹紧域与数据 AABB 脱节）。

---

## 4. 验收对照（计划 5.1.4.4）

| 计划条目 | 状态 |
| --- | --- |
| `xyCenter(meta)` → `xyCenterFromMovies(movies)` | ✅ |
| 移除临时 `console.log` | ✅ |
| median 与 min/max 中点差值记入报告 | ✅（见 §2） |
| **`GALAXY_CAMERA_EULER`** 不写入 −15° / −7.5° 等硬编码 | ✅ |

**主观验收**（肉眼是否仍感需额外 yaw/pitch）：**已复测 — 仍明显偏**（见 §1）。工程侧 **保留中位数 XY 实现**（仍可能改善构图质心，且与 Tech Spec 一致）；T1 根因调查 **继续**。

---

## 5. 后续

**已确认**：复测后 **T1 主观偏差仍显著** → 按计划进入 **5.1.4.5（H-A）**（UMAP 主轴 / PCA 或等价验证）。**未**因主观未解而回滚中位数 XY（方案 3 作为独立构图优化仍可保留；若 H-A 修复后需统一初值策略，再在后续迭代评估）。

---

## 6. H-D 诊断复挂（Phase 5.1.4.2）

因 **T1 在中位数 XY 后仍明显**，在 **`frontend/src/three/scene.ts`** 中 **恢复** 与 **`docs/reports/Phase 5.1.4.2 T1 根因 H-D 投影矩阵 aspect 检查 实施报告.md` §6** 一致的 **`logT1HdProjectionDiagnostics`**：

- 每次 **`resize()`** 在 **`renderer.domElement` 已挂 DOM** 后打印 **`[T1/H-D]`**；**`appendChild` 后**再打印一次首帧样本。  
- **`camera.aspect` ≠ 绘制缓冲宽高比** 或 **`projectionMatrix.elements[8]` / `[9]`** 超阈值时 **`console.error`**。

用途：在 **T1 现象仍存** 的前提下 **复核** aspect / 投影是否仍与 5.1.4.2 当时结论一致；若后续再次排除 H-D，应按计划 **5.1.4 收尾** 移除探针，避免长期噪声。
