# Phase 19 — 浏览态 active 深度路径（宏观默认 opaque · focus 特例半透明）实施报告

本文档归档 Phase **19** 的决策、落地改动与验收口径。  
关联计划：`.cursor/plans/phase_19_browse_active_depth.plan.md`。  
规范锚点：《星球状态机 spec》**§3.2.1**、《TMDB 电影宇宙 Tech Spec》**§1.1**、《视觉参数总表》Active 材质行、《TMDB 电影宇宙 Design Spec》**§2.1**。

---

## 1. 背景

宏观浏览与 **Phase 17** Space dolly 推近后，条带内多颗 **active** 仍走透明队列（**`depthWrite: false`**）时，易出现实例绘制顺序导致的遮挡错误。**Phase 16.3** 仅在 **`person` / `genre` select 单态**切换到 opaque 路径；**idle**、**`movie` 联想**等仍为路径 **B**，与产品语义「常态不透明 active」不一致。

---

## 2. 与 Phase 16.3 的关系

| 项目 | Phase 16.3 | Phase 19 |
|------|------------|----------|
| 判定 | `searchMode ∈ {person, genre}` ∧ `selectedMovieId === null` | **`selectionPhase === 'idle'`** ∧ **`selectedMovieId === null`** |
| 语义 | select 单态修深度 | **扩展**为全部宏观无 focus（含 **`movie` 联想**、Space dolly） |
| Focus | 路径 **B** + **P11.1** 不变 | 不变 |

Phase 19 **扩展** P16.3 的 opaque 思路，**非**废弃双路径模型；**`galaxyMeshes.ts`** 仍为路径 **B** 构造初值，运行时由 **`scene.ts` RAF** 覆盖。

---

## 3. 最终判定式（代码 SSOT）

在 **`frontend/src/three/scene.ts`** 的 **`tick`** 内（读取 store 快照 **`st`** 之后）：

```ts
const wantOpaque = selectionPhase === 'idle' && st.selectedMovieId === null
```

- **`selectionPhase`**：`scene.ts` **闭包**变量（**非** Zustand），与 **`applySelectionFrame` / focus 过渡**一致。
- **`wantOpaque === true`**：`transparent = false`，`depthWrite = true`，`needsUpdate` 仅在组合变化时置位。
- 路径切换时 **`console.log`**：`opaque (path A · macro browse)` / `transparent (path B · focus)`。

---

## 4. 变更文件列表

| 文件 | 说明 |
|------|------|
| `frontend/src/three/scene.ts` | **`wantOpaque`** 条件由 P16.3 **`inSelectOnly`** 替换为上一节 |
| `docs/project_docs/星球状态机 spec.md` | **§3.2.1** 重写为 Phase **16→19** 口径；变更记录 |
| `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` | **§1.1** active 段落 + Phase **19** 规则表 |
| `docs/project_docs/视觉参数总表.md` | 扫描基线 + **Active 材质**行 |
| `docs/project_docs/TMDB 电影宇宙 Design Spec.md` | **§2.1** 产品向一句 |
| `docs/reports/Phase 19 P19 浏览态 active 深度路径 实施报告.md` | 本文档 |

---

## 5. 验收清单（与计划一致）

1. 宏观浏览 + Space dolly：条带内多颗星遮挡合理。
2. **`movie` / idle** 搜索输入（未点片）：opaque 路径 **A**。
3. **`genre` / `person` select**（未点片）：与 Phase 16 视觉效果一致（仍满足路径 **A**）。
4. Focus 飞入 / 保持 / 飞出：路径 **B**，**P11.1** 不变。
5. **ESC** 回宏观：恢复路径 **A**。

---

## 6. 风险与回滚

- **风险**：单帧 **`selectionPhase`** 与 **`selectedMovieId`** 更新顺序不一致导致一帧闪烁（低概率）。
- **回滚**：恢复  
  `wantOpaque = (searchMode === 'person' || searchMode === 'genre') && selectedMovieId === null`  
  并还原 **§3.2.1 / §1.1** 等文档至 Phase 16 矩阵口径。
