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

| 项 | 内容 |
| --- | --- |
| **代码** | `xyCenterFromMovies(movies)` + `median()`；`movies.length === 0` 时回退 **`xyRangeMidpoint(meta.xy_range)`**。 |
| **文档** | Tech Spec §1.4 已改为「中位数为主、空列表回退 AABB 中点」。 |
| **临时探针** | 未保留计划中的 `[T1/H-B]` 调试 `console.log`（计划要求修复路径下移除）。 |

---

## 2. 当前数据集数值对照（`frontend/public/data/galaxy_data.json`）

在仓库随附的 **`galaxy_data.json`** 上，用与前端一致的 **中位数定义**（偶数个样本取中间两数平均）计算得到：

| 量 | X | Y |
| --- | ---: | ---: |
| **min/max 中点**（原 `xy_range` AABB） | 9.80991530418396 | 4.883304595947266 |
| **median**（全部 `movies`） | 10.292582035064697 | 4.821344614028931 |
| **Δ（median − min/max 中点）** | **+0.4826667308807373** | **−0.06195998191833496** |

样本数 **`count` = 59 014**。说明：当前云在 **X** 上相对 AABB 中点 **偏正** 约 **0.48**（UMAP 单位），**Y** 差约 **0.06**；中位数居中会略向 **+X**、略向 **−Y** 移动首屏相机，有利于对齐视觉质心（需人眼在运行态最终确认 T1 主观感受是否改善）。

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

**主观验收**（肉眼是否仍感需额外 yaw/pitch）：须在本地 **`npm run dev`** 加载上表同一数据后由使用者确认；本报告仅交付工程实现与可量化偏移。

---

## 5. 后续

若复测后 **T1 主观偏差仍显著**，按计划进入 **5.1.4.5（H-A）** UMAP 主轴 / PCA 分析；若 **H-B 不成立** 再考虑回滚或收窄本改动的适用范围（当前按「成立 → 实施方案 3」交付）。
