# Phase 32.1 / P32.1 SDR 计划与 Phase 29–33 边界确认 实施报告

## 1. 任务目标

创建并维护 Phase 32 计划文件，对照 Phase 29.7 gate 与 Phase 33 收窄范围，锁定 SDR 可读性与选中动效的工作边界，确保 HDR 结论不阻塞本阶段、且 32.3+ 调参不冒充 HDR 或破坏 29.4 SDR fallback。

对应计划：[`.cursor/plans/phase_32_sdr_readability_motion.plan.md`](../../.cursor/plans/phase_32_sdr_readability_motion.plan.md) · TODO `p32-plan-doc-preflight`（32.1）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| Phase 32 与 HDR gate | **解耦并行**（29.7：Phase 32 **Go**），不等待 Phase 33.5 |
| Phase 33 HDR production | **No-go**（29.7）；本阶段禁止用 L remap / Bloom 充当 HDR |
| Phase 33 收窄范围 | probe / proof / `renderMode` / fallback 文档；**33.5 主路径冻结** |
| 生产渲染不变量 | WebGL2 + `SRGBColorSpace`；Bloom `postFxBloomEnabled === false` |
| HDR 模块 | `hdrCapabilities` / `hdrProof` / `sdrFallback` 本阶段 **只读引用** |

---

## 3. 实施摘要

- 维护 [`.cursor/plans/phase_32_sdr_readability_motion.plan.md`](../../.cursor/plans/phase_32_sdr_readability_motion.plan.md)。
- 新增 **「Phase 29 / Phase 33 边界确认（32.1 锁定）」**：决策表、32 vs 33 职责矩阵、29.4 不变量、32.1 结论句。
- 更新 **§32.1 交付** 与 **关键现状**（`scene.ts` SDR fallback、Phase 29 三模块路径）。
- SSOT 引用：[`Phase 29.7 Gate report`](./Phase%2029.7%20P29.7%20Phase%2029%20Gate%20report%20实施报告.md)、[`Phase 29 发布门槛 spec`](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) §4–§10。

无应用代码变更。

---

## 4. 验证

- 人工对照 29.7 执行摘要与 Phase 33 plan §33.2 三条分支，计划表一致。
- 对照 `frontend/src/three/scene.ts`：`SDR_FALLBACK_OUTPUT_COLOR_SPACE`、`postFxBloomEnabled` 默认关，与计划「关键现状」一致。
- 无 lint/build 要求（仅 Markdown 计划）。

---

## 5. 剩余风险与后续

| 风险 | 缓解 |
| :--- | :--- |
| 32.3+ 调参误伤 SDR fallback | 遵守计划锁定节「不变量」；每次只改一组 L/fade 参数 |
| 与 Phase 33 文档漂移 | 33.1 须复核同一 29.7 gate；32 标定完成后 33 不得覆盖 `galaxyMeshes` 默认 |
| **下一步** | **32.2** SDR 可读性基线采集（截图 / uniform 日志 / `window.__galaxy*` 当前值） |
