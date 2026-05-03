---
name: phase 19 browse active depth
overview: 将宏观浏览（含 movie 搜索、Space dolly）纳入 active 路径 A（opaque + depthWrite）；唯一半透明特例为 focus 管线（P11.1）。同步 project_docs 语义为「常态不透明 / focus 特例透明」。本 phase 工程量较小，下列 todo 不按序号强约束执行顺序。完结后撰写 Phase 19 实施报告归档 docs/reports。
todos:
  - id: scene-wantOpaque
    content: scene.ts：`wantOpaque = selectionPhase === 'idle' && selectedMovieId === null`；注释由 P16.3 扩展为 P19；log 文案可选区分 macro vs focus
    status: completed
  - id: docs-state-machine
    content: 《星球状态机 spec》§3.2.1 重写为「默认路径 A；路径 B 仅 focus 相关相位」；标注 Phase 16→19 演进
    status: completed
  - id: docs-tech-spec
    content: 《Tech Spec》§1.1 更新 active 段落与切换矩阵（替代原 Phase 16 全表口径）；RAF 条件改为 selectionPhase + selectedMovieId
    status: completed
  - id: docs-visual-params
    content: 《视觉参数总表》Active 材质（Phase 16 双路径）小节改为 Phase 19 判定口径（与 §3.2.1 一致）
    status: completed
  - id: docs-design-spec
    content: 《Design Spec》§2.1 宏观漫游：补一句「宏观 active 默认不透明 + 写深度；仅 focus 会话内保留非目标 active 片元 alpha（P11.1）」
    status: completed
  - id: report-p19
    content: 新增 docs/reports《Phase 19 P19 浏览态 active 深度路径 实施报告.md》：决策、与 P16.3 关系、wantOpaque 条件、验收、回滚；关联本 plan 与 SSOT 锚点
    status: completed
isProject: false
---

# Phase 19 — 浏览态 active 深度路径（宏观默认 opaque · focus 特例半透明）

## 计划说明

- **工程量较小**：下列 todo **不特别标注执行序号**，可按依赖顺序执行（建议先代码 `scene.ts`，再批量改 SSOT，最后报告）。
- **概念重述（SSOT 写法）**：项目中 **active 层**在实现与产品上应以 **不透明 + 深度写入** 为**常态**（时间轴浏览、movie 联想未 focus、person/genre select 未 focus、Space dolly 推近等）；**唯一需要半透明渲染路径（路径 B）的特例**是 **focus 相关会话**（`selectionPhase !== 'idle'`），以便 **P11.1** `vFocusAlphaMult` / `uFocusCameraBlend` 压暗非目标邻域 active。**Phase 16** 当时仅在 person/genre select 单态切入路径 A；**Phase 19** 将同一 opaque 逻辑扩展到 **全部 `selectionPhase === 'idle' && selectedMovieId === null`**，与上述概念对齐。

## 背景与目标

- **问题**：默认浏览下 active 仍为路径 B，实例间遮挡错误；Phase 17 局部推近后更明显。
- **目标**：`wantOpaque = selectionPhase === 'idle' && st.selectedMovieId === null`（与先前计划一致）；**不改** focus 下半透明语义。
- **初值**：`galaxyMeshes.ts` 仍为路径 B 构造初值；运行时由 `scene.ts` 覆盖。

## 代码改动（最小）

| 文件 | 改动 |
|------|------|
| [frontend/src/three/scene.ts](frontend/src/three/scene.ts) | 用上一节条件替换当前 `inSelectOnly`-only 的 `wantOpaque`；更新注释 |

## project_docs 同步（概念：常态 A · 特例 B）

| 文档 | 改动要点 |
|------|----------|
| [docs/project_docs/星球状态机 spec.md](docs/project_docs/星球状态机 spec.md) | **§3.2.1**：表格与正文改为 **路径 A** = 宏观无 focus（`selectionPhase === 'idle'` 且 `selectedMovieId === null`）；**路径 B** = focus 飞入/保持/飞出（`selecting` / `selected` / `deselecting`）或等价需 P11.1 的状态；说明 Phase 16 矩阵由「searchMode 细分」收敛为 Phase 19「focus 特例」 |
| [docs/project_docs/TMDB 电影宇宙 Tech Spec.md](docs/project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) | **§1.1**：替换 **Phase 16 · 切换矩阵** 为 Phase 19 规则简述 + 可选精简表（避免 `idle/movie`+`null` 仍写路径 B）；bullet「Phase 16 RAF」改为 **Phase 16 + Phase 19**，条件 **`selectionPhase` × `selectedMovieId`**（并注明 `selectionPhase` 来自 `scene.ts` 闭包，非 Zustand） |
| [docs/project_docs/视觉参数总表.md](docs/project_docs/视觉参数总表.md) | **Active 材质**行：由 Phase 16 人名/流派条件改为 Phase 19 判定；扫描基线一句补 Phase 19 |
| [docs/project_docs/TMDB 电影宇宙 Design Spec.md](docs/project_docs/TMDB%20电影宇宙%20Design%20Spec.md) | **§2.1** 宏观漫游：一句产品向说明（常态 opaque active vs focus 特例） |

## 验收清单

1. 宏观浏览 + Space dolly：条带内多颗星遮挡合理。
2. movie / idle 搜索输入：仍为 opaque 路径。
3. genre / person select（未点片）：与 Phase 16 行为一致。
4. focus 飞入/保持/飞出：路径 B，P11.1 不变。
5. ESC 回宏观：恢复路径 A。

## 风险与回滚

- **风险**：单帧 `selectionPhase` 与 `selectedMovieId` 顺序不一致导致闪烁（低概率）。
- **回滚**：恢复 `wantOpaque = (searchMode === 'person' || searchMode === 'genre') && selectedMovieId === null`。

## 实施报告（todo：report-p19）

- **路径**：`docs/reports/Phase 19 P19 浏览态 active 深度路径 实施报告.md`（命名对齐 [Phase 16.3 报告](docs/reports/Phase%2016.3%20P16.3%20active%20材质双路径%20实施报告.md) 风格）。
- **建议章节**：背景；与 P16.3 关系（扩展而非取代）；最终判定式；变更文件列表；验收；回滚。
