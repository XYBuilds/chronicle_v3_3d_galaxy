# 代码审查后续 plan — 余项与 MVP 后安排（说明报告）

> **关联计划**: `.cursor/plans/code_review_follow-up_9d90ade4.plan.md`  
> **审查依据**: `docs/reports/Project_Status_and_Code_Review_Report.md`  
> **报告日期**: 2026-04-14  
> **范围**: 仅记录 **未实施**、拟在 **MVP 开发完成之后** 再做的调试与打磨项；**不包含** 已在其它报告中写过的已完成工作（见文末索引）。

---

## 1. 摘要

[代码审查后续 plan](.cursor/plans/code_review_follow-up_9d90ade4.plan.md) 中，下列条目**不在本轮交付范围内**：计划在 **MVP 功能开发完成** 之后，再以调试 / 视觉打磨方式推进。

| 计划章节 | 主题 | 安排 |
| --- | --- | --- |
| **§3** | 相机漫游边界（审查 **3.3**） | MVP 后调试 |
| **§5** | Genre OKLCH 色板在全量下的可读性（审查 **3.4**，原列为非阻塞 backlog） | MVP 后调试 / 设计迭代 |

计划中 **§6「与主开发计划的衔接」** 为**叙事性收尾**（说明完成 §1–§4 后回到 Phase 4），**无独立交付物或工程任务**，故不单独实施。

---

## 2. §3 相机漫游边界（审查 3.3）— MVP 后

**意图**: 在自定义轴平行控制器中，依据 `meta.z_range` 与 `meta.xy_range` 对相机位置做夹紧或软边界，避免滚轮与拖拽把视角送出数据云有效范围。

**推迟理由**: 当前交互已可用于 Phase 4 开发与联调；边界手感（硬夹紧 vs 弹簧阻尼）与 padding 比例更适合在 **真实使用场景稳定** 后再统一调参，避免与 MVP 范围抢工期。

**实施时建议入口**: `frontend/src/three/camera.ts`（`attachGalaxyCameraControls`）、`frontend/src/three/scene.ts`（传入的 `z_range` / `xy_range`）。

---

## 3. §5 Genre OKLCH 色板可读性（审查 3.4）— MVP 后

**意图**: 全量数据下流派种类增多时，仅靠「数据集中出现的流派 → OKLCH 均分取色」可能导致星球花色杂乱、辨识度下降；可考虑按占比排序、长尾合并、或与 Design Spec 对齐的固定色位等策略。

**推迟理由**: 原审查已标为 **非阻塞**；不影响 Raycaster、HUD、时间轴等 MVP 交互闭环，属 **视觉与信息设计** 层优化。

**实施时建议对照**: `docs/project_docs/TMDB 电影宇宙 Design Spec.md`，以及导出管线中 genre 色板生成逻辑（见既有 Phase 2.5 文档与 `scripts/export/` 相关实现）。

---

## 4. 相关报告索引（已完成条目，本报告不重复叙述）

- `docs/reports/代码审查后续 ESLint react-refresh 告警清理 实施报告.md` — 计划 **§4**  
- `docs/reports/代码审查后续 npm workspaces 根目录 monorepo DX 实施报告.md` — 计划 **§2**  
- `docs/reports/全量管线与粒子渲染调参会话实施报告.md` — 计划 **§1**（及与渲染/Bloom 调参相关的会话结论）

---

*本说明报告随 MVP 进度可更新：若上述余项提前排期，可在此补充预计迭代与验收标准。*
