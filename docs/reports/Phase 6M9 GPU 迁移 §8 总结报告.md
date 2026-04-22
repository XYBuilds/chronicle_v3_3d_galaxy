# Phase 6M9 — GPU 迁移 **§8 总结**（交接面）

**关联计划：** [phase_6_gpu_migration_202aac8f.plan.md](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) — **M9** 完成项 (d)  
**完整操作说明与文件清单**：[Phase 6M9 GPU 迁移 文档同步 实施报告.md](./Phase%206M9%20GPU%20%E8%BF%81%E7%A7%BB%20%E6%96%87%E6%A1%A3%E5%90%8C%E6%AD%A5%20%E5%AE%9E%E6%96%BD%E6%8A%A5%E5%91%8A.md)（**第 4 节**为面向 Phase 6.0 I1–I6 下一份 plan 的 **§8 阶段交接摘要**）。

---

## §8 里程碑总览（M1–M9）

| 阶段 | 含义 |
|------|------|
| **M1–M2** | WSL 基础、conda `chronicle` + RAPIDS cuML |
| **M3** | `requirements` CPU/GPU 拆分，Windows 回退不破坏 |
| **M4–M5** | UMAP 双后端、`run_pipeline` 透传、`meta.umap_params.densmap`、前端类型 |
| **M6** | 代码/数据在 WSL 家目录、产物回写 Windows |
| **M7–M8** | 子样本冒烟、全量 59K + DensMAP / `n_neighbors=100` 等重训 |
| **M9** | Tech Spec + 根 README 文档同步、本交接面 |

**主路径 / 回退路径** 一句话：**WSL + cuML** 做全量 GPU UMAP；**Windows + umap-learn** 作 CPU 与小样本。详见 Tech Spec **§2.1** 与根 **README**「运行管线」。
