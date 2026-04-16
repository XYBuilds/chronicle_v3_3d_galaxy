# Phase 5.1.1 相机水平拖拽方向修正 实施报告

> **关联计划**: `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` — **Phase 5.1.1 相机方向修正**  
> **评估依据**: `docs/reports/Phase 5.0 项目全面评估与测试报告.md` — **Issue T7**（相机控制左右反了）  
> **报告日期**: 2026-04-16  
> **范围**: `frontend/src/three/camera.ts` 中星系相机 **水平 truck（pointer X → `camera.position.x`）** 的符号方向；不涉及滚轮 Z、Y 轴 pedestal、或其它模块。  
> **不在范围**: Phase 5.1.2 及以后的 Sheet 蒙版、中位数居中、视距窗口、着色器分层等条目。

---

## 1. 摘要

在用户要求 **先新开 Git 分支再实施** 的前提下，从基线创建分支 **`phase-5.1.1-camera-drag-x-fix`**，对 `attachGalaxyCameraControls` 的指针移动处理做 **一行符号修正**：

| 项 | 内容 |
| --- | --- |
| **现象** | 在固定朝向 `GALAXY_CAMERA_EULER = (0, π, 0)`（绕 Y 旋转 180°，相机朝向 **+world Z**）下，水平拖拽时 **屏幕左右与场景平移方向与直觉相反**。 |
| **修改** | `onPointerMove` 内将 **`camera.position.x -= dx * truckPedestalSpeed`** 改为 **`camera.position.x += dx * truckPedestalSpeed`**。 |
| **Y 轴** | **`camera.position.y += dy * truckPedestalSpeed`** 未改（计划仅针对 X）。 |
| **验证** | 在 `frontend/` 执行 **`npm run build`**（`tsc -b && vite build`）通过。 |

**Git 提交（按时间顺序）**:

| SHA（短） | 说明 |
| --- | --- |
| **`38b1edf`** | `fix(camera): correct X-axis truck direction for PI Y-rotation (Phase 5.1.1 / T7)` |
| **`7c715dc`** | `chore(plan): mark Phase 5.1.1 camera X fix as completed`（更新 follow-up 计划 frontmatter 中 **`p5-1-1-camera-dir`** 为已完成） |

---

## 2. 背景与目标

### 2.1 背景

- 星系场景使用 **无轨道、无俯仰** 的固定相机朝向：`GALAXY_CAMERA_EULER`，等价于绕 Y 轴旋转 π。  
- 该取向下，**世界 X 与屏幕水平方向的感官映射** 与未旋转相机不同；若仍按「未考虑旋转」的符号实现 truck，会出现 **左右拖拽反了** 的体验问题。  
- Phase 5.0 评估报告将其记为 **T7**，并在 Phase 5 follow-up 计划中列为 **5.1.1** 的首批快速修正项。

### 2.2 目标（对照 Phase 5.1.1 验收）

| 目标 | 结果 |
| --- | --- |
| 鼠标 **向左拖** → **视野向左移动**（符合直觉） | 通过 **X 轴符号反转** 实现；需在运行态人工确认手感 |
| 改动面 **仅限** 相机水平 truck 逻辑 | **已满足**（单文件单行行为变更） |
| 构建/类型检查通过 | **`npm run build` 已通过** |

---

## 3. 技术说明（根因与改法）

### 3.1 代码位置

实现位于 **`frontend/src/three/camera.ts`** 的 **`attachGalaxyCameraControls`**：`pointermove` 中根据 `dx`、`dy` 更新 `camera.position`，并在每帧逻辑末尾 **`applyFixedOrientation(camera)`** 将旋转重置为 `GALAXY_CAMERA_EULER`。

### 3.2 修改前后对比（语义）

- **修改前**: `position.x -= dx * speed` — 在 π 绕 Y 的取向下，与常见「拖哪边、场景跟哪边」的 **水平** 直觉不一致（报告 T7）。  
- **修改后**: `position.x += dx * speed` — 与计划中 **「`-=` 改 `+=`」** 的指引一致，使 **水平拖拽与屏幕 X 同向** 的平移效果与产品验收对齐。

### 3.3 未改动部分（刻意保持）

- **`GALAXY_CAMERA_EULER`** 定义未改。  
- **滚轮 `onWheel`**（`camera.position.z`）未改。  
- **`truckPedestalSpeed` / `zScrollSpeed` 默认值** 未改。  
- **`getInputLocked`、pointer capture、卸载清理** 等行为未改。

---

## 4. Git 与分支

| 项 | 内容 |
| --- | --- |
| 工作分支 | **`phase-5.1.1-camera-drag-x-fix`** |
| 功能提交 | **`38b1edf`** — 相机 X truck 符号修正 |
| 计划同步提交 | **`7c715dc`** — 计划 todo **`p5-1-1-camera-dir`** 标记为 **`completed`** |

> **合并说明**: 若需合入默认分支，请在目标分支上执行 merge 或 rebase，并以 `git log` 核对上述提交。

---

## 5. 变更清单（按文件）

### 5.1 `frontend/src/three/camera.ts`

- **`onPointerMove`**: `camera.position.x -= dx * truckPedestalSpeed` → **`camera.position.x += dx * truckPedestalSpeed`**。

### 5.2 `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md`

- Frontmatter 中 **`id: p5-1-1-camera-dir`** 的 **`status`** 更新为 **`completed`**（与「对应 todo 已完成」一致；Cursor 计划文件使用 **`completed`** 而非 **`complete`** 字符串）。

---

## 6. 验证与复现步骤

### 6.1 构建与类型检查

在仓库 **`frontend/`** 目录：

```bash
npm run build
```

本次执行结果：**成功**（`tsc -b` 与 `vite build` 均无错误）。

### 6.2 建议的手动验收（运行态）

1. `npm run dev` 启动前端，加载星系场景。  
2. 在画布上 **按住左键向左拖动**：预期 **画面整体向左平移**（与 Phase 5.1.1 文字验收一致）。  
3. 若与个别用户对「视野向左」的定义不一致，可在 **`camera.ts`** 仅对 X 行再次取反并回归本报告 §3 记录原因。

---

## 7. 风险与回滚

| 风险 | 说明 |
| --- | --- |
| 主观交互差异 | 「地图式拖拽」与「抓场景拖拽」对产品文案的解读不同可能导致「仍觉得反」的反馈；此时应 **对齐 PRD/Design Spec 的交互定义** 再定符号。 |
| 回滚 | 将 **`+=`** 改回 **`-=`** 并提交即可；或 `git revert 38b1edf`（注意是否需同时还原计划文件提交 **`7c715dc`**）。 |

---

## 8. 后续工作（不在本次范围）

Phase 5 follow-up 计划中 **5.1.1 之后** 的条目仍待实施，例如：

- **5.1.2** Detail 模糊蒙版（H1）  
- **5.1.3** Drawer ESLint（B5）  
- **5.1.4** XY 中位数居中（T1）  
- **5.1.5** 及以后视距窗口、分层着色器、Raycaster、Spec 同步等  

详见 `.cursor/plans/phase_5_follow-up_plan_64727854.plan.md` 正文 **§ Phase 5.1**。

---

## 9. 结论

本次操作 **已完成 Phase 5.1.1（T7）**：在新分支上修正 **`camera.ts`** 水平 truck 的 **X 轴符号**，使固定 π-Y 朝向下拖拽方向与计划验收一致；**前端生产构建通过**；计划项 **`p5-1-1-camera-dir`** 已标记为 **`completed`**，并以本报告归档于 `docs/reports/`。
