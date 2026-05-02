# Phase 16.3 — active 材质双路径（修 genre / person 大量 active 深度错乱）实施报告（定稿）

本文档为 Phase 16 子项 **P16.3** 的**最终决策**、**已落地操作**与**验收口径**归档。  
关联计划：`.cursor/plans/phase_16_search_refinements_22478218.plan.md`（条目 **p163-active-dual-path**；YAML 状态已标为 **completed**）。  
规范锚点：计划内 **D5**、状态机 spec **§3.2.1**（active 材质双路径）；与 **P11.1**（focus 下非目标 active 的 `vFocusAlphaMult` 渐变）兼容。

---

## 1. 背景与范围

### 1.1 问题

`galaxyActiveMaterial` 长期配置为 `transparent: true`、`depthWrite: false`（见 `galaxyMeshes.ts`，为 P11.1 避免重叠自遮挡）。在 **`searchMode` 为 person 或 genre** 且 **未进入单片 focus**（`selectedMovieId === null`）时，选区内大量 active 片元 **alpha≈1**，仍走透明队列、不写深度，导致 **绘制顺序依赖实例顺序**，视觉上出现「远处球盖住近处球」的错乱。

### 1.2 目标

在 **不改动** `galaxy_data` 契约、**不新增**第二套 active mesh（默认路径）、**保留** P11.1 focus / focus 嵌套 select 下 alpha 渐变的前提下，在 **select 单态** 下切换 active 材质的 GPU 透明/深度行为，使大量全不透明 active 的深度关系正确。

### 1.3 范围边界

| 纳入 P16.3 | 不纳入（本报告范围外） |
| ---------- | ---------------------- |
| `scene.ts` RAF 内对 `galaxy.activeMaterial` 的 `transparent` / `depthWrite` / `needsUpdate` 条件切换 | **idle** 层材质（idle 片元 alpha 为设计语言的一部分，**不能**用与 P16.3 相同的 opaque 切换无损替代；见计划 **P16.3** 与 idle  shader 说明） |
| 与计划一致的 **路径切换矩阵**（见 §2） | **方案 B**（双 active mesh）：仅作计划中的降级备选，**未实施** |
| 路径变化时的 **单次** `console.log` | P16.4 文档全量同步（Design Spec / 状态机 / 视觉总表 / Tech Spec） |

---

## 2. 最终锁定决策

| 编号 | 决策项 | 最终方案 |
| ---- | ------ | -------- |
| **D5-A** | 主修复路径 | **运行时切换**同一 `InstancedMesh` 所用 `ShaderMaterial` 的 `transparent` 与 `depthWrite`（**方案 A**） |
| **D5-B** | select 单态判定 | `inSelectOnly = (searchMode === 'person' \|\| searchMode === 'genre') && selectedMovieId === null` |
| **D5-C** | select 单态下 GPU 状态 | `transparent = false`，`depthWrite = true`（opaque 路径，便于深度缓冲正确） |
| **D5-D** | 其余所有状态 | `transparent = true`，`depthWrite = false`（透明路径，保留 P11.1） |
| **D5-E** | `needsUpdate` | **仅**在 `transparent` / `depthWrite` 与目标不一致时置 `true`，避免每帧重编译 |
| **D5-F** | 日志 | 仅在路径 **实际切换** 时打印 `[Active material] opaque (select-only) \| transparent (default)`，不在 RAF 内刷屏 |
| **D5-G** | 方案 B（双 mesh） | **不进入本阶段默认实现**；若方案 A 在目标硬件上出现明显 hitch 或不稳定再评估 |

### 2.1 路径切换矩阵（与计划 D5 表一致）

| `searchMode` | `selectedMovieId` | 路径 | 说明 |
| ------------ | ----------------- | ---- | ---- |
| `idle` | `null` | B（transparent） | 默认 |
| `idle` | non-null | B | focus 单态，需 P11.1 |
| `movie` | `null` | B | 联想未选片 |
| `movie` | non-null | B | focus |
| **`person`** | **`null`** | **A（opaque）** | 大量 active |
| **`person`** | non-null | B | focus 嵌套 person |
| **`genre`** | **`null`** | **A（opaque）** | 大量 active |
| **`genre`** | non-null | B | focus 嵌套 genre |

`alphaTest` 等仍由 `galaxyMeshes.ts` 初始创建；本阶段 **未** 在运行时改动 `alphaTest`。

---

## 3. Git 与分支操作

| 操作 | 说明 |
| ---- | ---- |
| 实施前要求 | 在独立分支上开发（与计划执行说明一致） |
| 分支名 | `feat/p16-3-active-material-dual-path` |
| 提交 | `7368018` — `feat(P16.3): dual-path active material for person/genre select-only` |
| 变更文件数 | 1：`frontend/src/three/scene.ts` |

合并主干前请以 `git log` 核对 hash；若已 rebase，以当前仓库为准。

---

## 4. 实施操作清单

### 4.1 代码落点

在 `mountGalaxyScene` 内 **`tick`** 中，于 **`applySelectionFrame(nowMs)`**、**`zCurrentDriver`** 更新之后，**首次** `useGalaxyInteractionStore.getState()` 得到 `st` 的紧接着位置，插入 P16.3 逻辑（保证与后续 `uSelectionMode` 等使用同一帧 store 快照）。

逻辑摘要：

1. `inSelectOnly` ← person/genre 且无 `selectedMovieId`。
2. `wantOpaque` ← 与 `inSelectOnly` 同真值。
3. `activeMat = galaxy.activeMaterial`。
4. 若 `activeMat.transparent !== !wantOpaque` 或 `activeMat.depthWrite !== wantOpaque`，则写入 `transparent`、`depthWrite`，`needsUpdate = true`，并 `console.log` 一次。

`galaxyMeshes.ts` 中 active 的**初始**仍为 `transparent: true` / `depthWrite: false`；首帧若已是 select 单态，第一次 `tick` 会切到 opaque 并打日志。

### 4.2 未修改的文件（相关）

| 路径 | 说明 |
| ---- | ---- |
| `frontend/src/three/galaxyMeshes.ts` | active 材质默认值不变；双路径由 `scene.ts` 运行时覆盖 |
| `frontend/src/three/shaders/galaxyActive.frag.glsl` | 未改 uniform；opaque 路径下可见片元 alpha 仍为 1，与深度写入一致 |

### 4.3 构建验证

实施时已在 `frontend` 目录执行 **`npm run build`**（`tsc -b && vite build`），通过。

---

## 5. 验收口径（P16.3，与计划一致）

| 项 | 预期 |
| -- | ---- |
| genre 大集合（如 `Drama`）select 单态 | 大量 active 前后遮挡关系合理（远处被近处挡） |
| 点选进入 focus | 切回 **路径 B**，P11.1 非目标 active alpha 渐变正常 |
| 退出 focus 回到 select 单态 | **路径 A** 再次生效 |
| ESC 等退出至 idle | **路径 B** |
| DevTools | **仅在路径切换时** 出现 `[Active material]` 日志，非每帧 |
| 性能 | 与计划一致：切换频率极低；若观察到 shader 重编译 hitch，再评估 **方案 B** |

---

## 6. 风险与回滚

| 风险 | 缓解 |
| ---- | ---- |
| `needsUpdate` 触发 shader 重编译导致单帧卡顿 | 切换仅发生在用户跨越 select/focus/idle 边界；不可接受时启用计划 **方案 B** |
| 与 P11.1 冲突 | 路径矩阵保证 **凡 `selectedMovieId !== null` 一律路径 B** |

**回滚**：撤销 `scene.ts` 中 P16.3 块即可恢复始终 transparent / depthWrite false 行为。

---

## 7. 后续工作（P16.4）

将 **§2** 矩阵与 **§3.2.1** 语义同步至 Design Spec、状态机 spec、视觉参数总表、Tech Spec；并按计划做 Phase 8 基线与手测回归（本报告不重复 P16.4 清单）。
