# Phase 13.7 — 文档同步与 Phase 8 基线收口

**范围**：P13.7（`.cursor/plans/phase_13_focus_experience_ab016b85.plan.md` 子项「文档同步 + 出口 fps」中的**文档与基线登记**部分）  
**日期**：2026-05-01  
**Git 分支**：`phase13/p13-7-doc-sync`

---

## 1. 完成项

| 项 | 说明 |
|----|------|
| **状态机 spec** | 《星球状态机 spec》§3.4.3 默认 **`uFocusNonTargetActiveAlpha`** 与代码对齐为 **0.08**；§3.4.5 默认半径表述收口；变更记录追加 **P13.7** 行 |
| **视觉参数总表** | 扫描基线日期 **2026-05-01**；`uFocusNonTargetActiveAlpha`、`uFocusCameraBlend`（`transitionDriver`）、`focusNeighborRadius` / 拾取表与 **§6** store 与实现对齐 |
| **Tech Spec** | §1.1 active 段：`uFocusNonTargetActiveAlpha` 默认 **0.08** 与 **`transitionDriver`** 表述 |
| **Design Spec** | §2.2 增补 **P13.5** size/L 图例；§3.1 Timeline 与 **`FocusLReference`**；§4 性能指针含 **`## P13 出口`** |
| **PRD** | §3.1 层级二补充 **vote_count 圆环 + L 指针** 产品语义 |
| **Phase 8 基线** | 文首里程碑索引、§P8.0.4 增补 **P13.7**；新增 **`## P13 出口`**（**未**重录三线，登记手测通过 + 待补录表） |
| **计划 todos** | `.cursor/plans/phase_13_focus_experience_ab016b85.plan.md` 中 **`p137-doc-sync`** 标为 **completed** |

子 phase **P13.0–P13.6** 实施报告已在仓库内，本阶段**未**逐份复查正文（按任务约定）。

---

## 2. 未执行项（明示）

- **Chrome Performance 三线（§P8.0.1 同口径）**：本里程碑**未**重录；理由：**视觉与交互手测已通过**，维护者选择跳过当次 fps 表更新。数值门槛（focus **≥** §P13.0 入口 **约 95%**）仍写在 **`## P13 出口`** 供日后补录对照。

---

## 3. 交叉引用

- 默认 alpha **0.08** 的工程决策见 [`Phase 13.6 P13.6 focus 收尾 实施报告.md`](./Phase%2013.6%20P13.6%20focus%20收尾%20实施报告.md)。  
- 性能归档主文件：[`docs/benchmarks/Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../benchmarks/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md)。
