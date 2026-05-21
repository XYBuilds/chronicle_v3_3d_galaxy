# Phase 32.6 / P32.6 selection planet spin runtime 实施报告

## 1. 任务目标

接入选中 Perlin 星球缓慢自转：自转轴与 size reference 环共面、由 `movieId` 种子稳定；换片重置基准；不改变拾取与 focus 半径。顺带修正 tier 标签在环上的锚点。

对应计划：`.cursor/plans/phase_32_sdr_readability_motion.plan.md` · TODO `p32-selection-rotation-runtime`（32.6）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **P1** | 自转轴：世界 +Y 为竖直，种子倾斜 0–45°、方位 0–360°；环平面法线 = 自转轴 |
| **P2** | 自转角速度：`movieId` 种子，signed rev/s ∈ [-0.1, 0.1]（正负 = 顺/逆时针） |
| **P3** | 自转合成：`baseQuat * localZ(θ)`，禁止世界轴右乘（避免翻滚） |
| **P4** | tierLabels：相机左 + 朝向相机在环平面 45° 平分，每帧更新（(−X,−Z) 默认视角） |

---

## 3. 实现摘要

| 产出物 | 说明 |
| :--- | :--- |
| `selectionPlanetRotation.ts` | 种子轴/速率、`selectionPlanetOrientedQuaternion`、环平面四元数 |
| `scene.ts` | `bindSelectionPlanetSpin` / `applySelectionPlanetSpin` 接入 RAF |
| `FocusSizeReferenceRings.ts` | `computeTierLabelAzimuthRad`；`update` 传入 `camera` |
| `*.spec.ts` | 自转轴/速率/合成、tier 锚点象限 |

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/three/selectionPlanetRotation.spec.ts` | 10 passed |
| `npm run test -w frontend -- src/three/FocusSizeReferenceRings.labelAzimuth.spec.ts` | 1 passed |
| `npm run build -w frontend` | 通过 |
| 用户验收 | 通过 |

---

## 5. 已知风险与后续

- **32.7** perlin-only selective Bloom
- **32.8** 全阶段视觉矩阵与 lint/build 汇总
- 环平面与 pivot 严重倾斜时，标签锚点退化分支仅用左或近单侧向量
