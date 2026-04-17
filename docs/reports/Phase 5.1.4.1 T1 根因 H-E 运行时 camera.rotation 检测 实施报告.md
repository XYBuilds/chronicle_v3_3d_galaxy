# Phase 5.1.4.1 T1 根因 H-E（运行时 camera.rotation 篡改）检测 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.4.1**（frontmatter 项 **`p5-1-4-1-t1-he`**）  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — **Issue T1**（相机视线与 Z 轴不平行；根因调查序列 **§11.1** 中 **H-E**）  
> **报告日期**: 2026-04-17  
> **范围**: 在 `frontend/src/three/scene.ts` 的渲染循环（RAF `tick`）中临时加入 **`camera.rotation` 与 `GALAXY_CAMERA_EULER` 一致性检测**；经人工验证未触发后 **移除断言**，避免长期每帧开销。**不**修改 `GALAXY_CAMERA_EULER` 常量、不将实测 yaw/pitch 偏移写入代码（与计划「硬约束」一致）。  
> **不在范围**: H-D（aspect / 投影矩阵）、H-F（vertex shader）、H-B/H-A/H-C 等后续子项；视距窗口、三层着色器、Raycaster、Spec 同步等。

---

## 1. 摘要

在用户要求 **先新开 Git 分支再实施** 的前提下，从 **`main`** 创建分支 **`phase-5.1.4.1-t1-he-rotation-drift`**，按计划 **5.1.4.1** 在 **`mountGalaxyScene`** 的 **`tick`** 中、在 **`applySelectionFrame`** 与 **`composer.render()`** 之前插入 **`camera.rotation.equals(GALAXY_CAMERA_EULER)`** 检测：不一致时 **`console.error('[T1/H-E] camera.rotation drift', { actual, expected })`**。

随后在多种交互与生命周期场景下观察控制台：**从未出现** `[T1/H-E]` 日志。据此可认定 **H-E 假设在当前实现下不成立**（未发现「运行中 rotation 偏离设计 Euler」的证据），按计划排除该根因路径，并 **删除** 每帧检测代码，使 `scene.ts` 恢复为无诊断开销的常态实现。

| 项 | 内容 |
| --- | --- |
| **假设（H-E）** | 存在未识别代码或依赖在运行中改写 **`camera.rotation`** / **`camera.quaternion`**，导致与 **`Euler(0, π, 0, 'YXZ')`** 不一致。 |
| **检测方式** | 每帧 **`rotation.equals(GALAXY_CAMERA_EULER)`**；失败则打印 **`actual`**（x, y, z, order）与 **`expected`**。 |
| **观测结论** | **未触发** → **排除 H-E**；T1 视角异常更可能来自 **H-D / H-F / H-B / H-A / H-C** 等后续假设（见计划 **5.1.4.2** 起）。 |
| **代码终态** | 诊断已移除；**默认分支行为**与加入检测前一致（无残留 assert）。 |

**Git 提交（按时间顺序）**:

| SHA（短） | 说明 |
| --- | --- |
| **`f141544`** | `feat(phase-5.1.4.1): assert galaxy camera rotation each frame (T1/H-E)` — 加入每帧检测。 |
| **`72d5823`** | `chore: remove T1/H-E rotation drift assert (hypothesis ruled out)` — 假设排除后移除检测。 |

**计划同步**: follow-up 计划 frontmatter 中 **`p5-1-4-1-t1-he`** 已标记为 **`completed`**（与本报告一致）。

---

## 2. 背景与目标

### 2.1 背景

- Phase 5.0 将「相机视线与 Z 轴不平行」记为 **T1**；现象与「代码中仅三处 `rotation.copy(GALAXY_CAMERA_EULER)`」存在张力，需按成本递增做根因排查。  
- Follow-up 计划 **5.1.4.1** 将 **H-E** 列为第一步：**是否存在运行时的 rotation 漂移**。  
- 计划明确 **禁止** 将用户目测的 **-15° / -7.5°** 等补偿写进 **`GALAXY_CAMERA_EULER`**（症状掩盖、随数据与管线失效）。本实施 **未** 触碰该常量。

### 2.2 目标（对照 Phase 5.1.4.1）

| 目标 | 结果 |
| --- | --- |
| 实现可复现的 **H-E 检测** | **已完成**（`f141544`） |
| 在典型场景下完成 **人工观测** | **已完成**（用户确认：均未出现 `[T1/H-E]`） |
| 根据判定标准 **排除或确认 H-E** | **已排除 H-E** |
| 排除后 **移除** 每帧 assert，避免无意义开销 | **已完成**（`72d5823`） |
| 生产构建仍可通过 | **`npm run build`** 在移除前后均 **已通过**（见 §5） |

---

## 3. 技术说明

### 3.1 检测位置与顺序

- **文件**: `frontend/src/three/scene.ts`  
- **函数**: `mountGalaxyScene` 内 **`const tick = () => { ... }`**  
- **插入点（已撤销）**: 在 **`requestAnimationFrame(tick)`** 调度之后、**`applySelectionFrame(performance.now())`** 之前。  
- **理由**: 在每帧业务逻辑与合成器渲染前采样 **上一帧末至本帧初** 之间可能由事件同步写入的 rotation；与计划给出的「tick 内、`composer.render()` 之前」一致。

### 3.2 参照常量

- **`GALAXY_CAMERA_EULER`** 定义于 `frontend/src/three/camera.ts`：  
  **`new THREE.Euler(0, Math.PI, 0, 'YXZ')`**  
- **`scene.ts`** 中本就在挂载、选中动画、取消选中动画等路径对 **`camera.rotation.copy(GALAXY_CAMERA_EULER)`**；检测与这些写入 **语义一致**，仅多一层 **运行时一致性断言**。

### 3.3 判定标准（与计划对齐）

| 现象 | 计划含义 |
| --- | --- |
| 控制台 **持续或特定时机** 出现 `[T1/H-E]` | **H-E 成立** → 需定位篡改源（`lookAt`、`quaternion`、第三方等），修复后再移除 assert。 |
| **每帧** rotation 恒等与 **`GALAXY_CAMERA_EULER`**，`assert` **不触发** | **H-E 不成立** → 进入 **5.1.4.2（H-D）**。 |

本仓库本次验证结果为 **后者**。

---

## 4. 实施与验证

### 4.1 分支与工作流

1. **`git checkout -b phase-5.1.4.1-t1-he-rotation-drift`**（自 **`main`**）。  
2. 提交 **`f141544`**：加入 H-E 检测。  
3. 本地 **`npm run dev`** / 构建产物下人工操作（由执行方与用户覆盖）：静止、拖拽、滚轮、选片进入/退出详情、resize 等。  
4. 用户反馈：**均未出现** `[T1/H-E]`。  
5. 提交 **`72d5823`**：移除检测块，保留结论记录（本报告 + 计划 todo）。

### 4.2 建议的观测清单（供后续类似任务复用）

以下任一若曾触发 `[T1/H-E]`，则应保留日志并抓栈或断点追查写入方：

- 首帧与长时间静置  
- 相机 truck / pedestal / wheel  
- 选中飞入、取消选中飞回  
- 窗口尺寸变化、**`devicePixelRatio`** 变化、多显示器拖拽  

本次 **全部为阴性**，故 **H-E** 不作为 T1 主因继续投入。

### 4.3 构建验证

在 **`frontend/`** 目录执行：

```bash
npm run build
```

在 **加入检测** 与 **移除检测** 两次提交前后均执行通过（`tsc -b && vite build`）。

---

## 5. 结论与后续

### 5.1 结论

- **H-E（运行时 `camera.rotation` 被篡改导致偏离设计 Euler）**：在现有检测下 **不成立**。  
- **T1** 应继续按 follow-up 计划进入 **Phase 5.1.4.2 — H-D（`camera.aspect`、renderer 尺寸、`projectionMatrix` 等）**。

### 5.2 交付物清单

| 交付物 | 路径 / 说明 |
| --- | --- |
| Git 分支 | **`phase-5.1.4.1-t1-he-rotation-drift`**（含两笔提交；合并时可 squash 或保留历史） |
| 实施报告（本文） | **`docs/reports/Phase 5.1.4.1 T1 根因 H-E 运行时 camera.rotation 检测 实施报告.md`** |
| 计划 todo | **`.cursor/plans/phase_5_follow-up_plan_64727854.plan.md`** — **`p5-1-4-1-t1-he`** → **`completed`** |

### 5.3 合并建议

- 若希望 **主分支完全无「加再删」的噪音**：可在合并 PR 时使用 **squash** 为单条提交（文案示例：`chore(phase-5.1.4.1): T1 H-E rotation drift check — ruled out, no code retained`）。  
- 若希望 **保留审计轨迹**：保留 **`f141544`** + **`72d5823`** 两笔提交即可。

---

## 6. 附录：已移除代码片段（仅作文档归档）

以下代码 **曾** 存在于 **`scene.ts`** 的 **`tick`** 内，**现已删除**，勿再复制进生产分支除非重新启用调查。

```ts
if (!camera.rotation.equals(GALAXY_CAMERA_EULER)) {
  console.error('[T1/H-E] camera.rotation drift', {
    actual: [camera.rotation.x, camera.rotation.y, camera.rotation.z, camera.rotation.order],
    expected: [0, Math.PI, 0, 'YXZ'],
  })
}
```

---

*文档结束。*
