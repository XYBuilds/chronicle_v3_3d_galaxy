# Phase 32.5 / P32.5 selection planet spin axis 实施报告

## 1. 任务目标

为 focus 选中 Perlin 星球定义稳定自转轴：复用 `FocusSizeReferenceRings` 的 `seededRingPlaneQuaternion(movieId)`，由参考环平面法线推导世界空间 spin axis，并在 `setFromMovie` 写入与参考环一致的基准朝向。本步不接入 render-loop 自转（留给 32.6）。

对应计划：[`.cursor/plans/phase_32_sdr_readability_motion.plan.md`](../../.cursor/plans/phase_32_sdr_readability_motion.plan.md) · TODO `p32-selection-rotation-axis`（32.5）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **P1** | 新增 `selectionPlanetRotation.ts` 为轴/基准四元数 SSOT，从 `FocusSizeReferenceRings` 导入 `seededRingPlaneQuaternion` |
| **P2** | 环几何局部法线固定为 `REFERENCE_RING_PLANE_LOCAL_NORMAL`（+Z），经 seeded quaternion 变换得到世界 spin axis |
| **P3** | `planet.setFromMovie` 写入 `selectionPlanetBaseQuaternion(movie.id)`，视觉与参考环共面；拾取/半径/相机不改 |
| **P4** | 32.5 不新增 runtime debug 入口；32.6 再接入 RAF 自转与可选 `__planetSpin` |

---

## 3. 实现摘要

| 产出物 | 说明 |
| :--- | :--- |
| **`selectionPlanetRotation.ts`** | `selectionPlanetSpinAxisWorld`、`selectionPlanetBaseQuaternion`、`selectionPlanetRotationAxisForMovie` |
| **`selectionPlanetRotation.spec.ts`** | 轴长度、稳定性、与 ring quaternion 一致性（5 cases） |
| **`planet.ts`** | `setFromMovie` 设置 `mesh.quaternion` 基准朝向 |

**API 契约（32.6 消费）：**

- `spinAxisWorld`：单位世界轴，换片随 `movieId` 重算，不继承上一部错误轴向
- `baseQuaternion`：进入 focus / 换片时重置自转累计的基准

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/three/selectionPlanetRotation.spec.ts` | 5 passed |
| `npm run build -w frontend` | 通过 |
| 用户验收 | 通过（32.5 不强制完整视觉矩阵；可选目视环与星球共面） |

---

## 5. 已知风险与后续

- **32.6** 在 render loop 围绕 `selectionPlanetSpinAxisWorld` 缓慢旋转；换片重置 `baseQuaternion`，focus 内 neighbor 切换保持 blend=0 宏观虚化规则不变
- **32.7** perlin selective Bloom 独立 debug，不与 `__sdrTuning` 混用
- 自转仅影响 `planet.mesh` visual；未改 `screenRadius`、interaction、focus 半径或相机 Z 约束
