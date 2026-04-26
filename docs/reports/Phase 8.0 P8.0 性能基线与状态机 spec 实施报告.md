# Phase 8.0 · P8.0 性能基线与状态机 spec — 实施报告

> 对应 [Phase 8 计划](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md) 中 **P8.0**（`p80-baseline`）：建立主场景 Performance 基线、双 InstancedMesh Story 压力基准、星球状态机 SSOT；**不**改生产渲染路径。  
> **分支**：`phase/p8-0-performance-baseline`（相对 `main` 的 P8.0 工作线）。  
> **日期**：2026-04-27。

---

## 1. 目标回顾

| 计划项 | 完成情况 |
|--------|----------|
| Chrome DevTools Performance：idle / timeline 拖动 / focus 各约 5 s，数值落表 | **已完成**（见 [`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../project_docs/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) §P8.0.1） |
| 双 mesh 60K×detail0 + 60K×detail1 同屏 VS，为 P8.4 定门槛 | **Story 与桌面独显数据已完成**；集成显卡 / throttle 行仍为可选补强 |
| `docs/project_docs/星球状态机 spec.md` | **已完成** |
| 生产路径 `isWebGL2` 硬断言 | **按计划在 P8.4**；P8.0 仅在 Story bench 内 `console.assert` + HUD |

---

## 2. 交付物清单

| 类型 | 路径 | 说明 |
|------|------|------|
| 性能与准入文档 | [`docs/project_docs/Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../project_docs/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) | P8.0.1 三场景表、P8.0.2 双 mesh 说明与 fps 表、P8.0.3 WebGL2、P8.0.4 指向状态机 spec |
| 状态机 SSOT | [`docs/project_docs/星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) | idle / active / hover / focus / 延后 select；`W = uZVisWindow×0.2`；双 mesh 互补 scale；WebGL2 / `gl_InstanceID` 约定 |
| Storybook 基准 | [`frontend/src/storybook/InstancedMeshBench.tsx`](../../frontend/src/storybook/InstancedMeshBench.tsx)、[`InstancedMeshBench.stories.tsx`](../../frontend/src/storybook/InstancedMeshBench.stories.tsx) | 60k+60k `InstancedMesh`，`MeshBasicMaterial`，HUD fps 中位数、几何 `console.log` |
| Cursor 索引说明 | [`docs/project_docs/视觉参数总表-本地维护说明.md`](../project_docs/视觉参数总表-本地维护说明.md) | `视觉参数总表.md` **Git 跟踪**、**`.cursorignore`** 排除 Cursor 默认索引 |
| Phase 7 总表 | [`docs/project_docs/视觉参数总表.md`](../project_docs/视觉参数总表.md) | Phase 7 全文保留；文末指针链到 Phase 8 基线文档与上述说明 |
| 规则更新 | [`.cursor/rules/project-overview.mdc`](../../.cursor/rules/project-overview.mdc) | Key Docs 增加 Phase 8 基线文档与总表 + `.cursorignore` 说明 |
| 索引排除 | [`.cursorignore`](../../.cursorignore) | 追加 `docs/project_docs/视觉参数总表.md` |

---

## 3. 基线数据摘要（摘自跟踪文档）

- **P8.0.1**：idle / timeline（子选区 2.05–7.02 s）/ focus（3.02–8.00 s）的 Scripting 粗算 per-frame、fps ~60、Long tasks 与 INP 等已写入基线表；GPU ms 多为 **N/A**（定性描述 GPU 轨道）。环境行 **Chrome 版本 / GPU 型号** 仍待补。
- **P8.0.2**：Three **r183** `IcosahedronGeometry` 非索引，`position.count` **60 + 240** / 实例；桌面 Storybook HUD **fps 中位数 158.7**（n=160），**WebGL2: yes**，准入 **≥50** 判通过；**笔电集成显卡** 与 **4× throttle** 两行仍为 *待填*。

---

## 4. 工程与文档结构调整（纠正记录）

1. **初版误用 `.gitignore`** 排除 `视觉参数总表.md`，已在提交 **`ea1ddef`** 纠正为 **仅 `.cursorignore`**，并恢复该文件 **Git 跟踪**。  
2. Phase 8 基线从总表正文拆出为独立 **`Phase 8 基线 P8.0 性能与 P8.4 准入.md`**，避免与 Phase 7 超长清单混排；总表文末保留跳转节。

---

## 5. 相关提交（`phase/p8-0-performance-baseline`）

| 提交 | 摘要 |
|------|------|
| `841c2db` | P8.0 首包：状态机 spec、InstancedMesh bench、plan 标 `p80-baseline` completed |
| `cb0180b` | 填入 P8.0.1 Chrome Performance 三行 |
| `a8143d3` | 填入 P8.0.2 Storybook fps（桌面） |
| `d478b04` | Phase 8 基线独立文档；曾误将总表 `.gitignore` |
| `ea1ddef` | 改为 `.cursorignore`；恢复 `视觉参数总表.md` 跟踪；说明文档与 Phase 8 引言同步 |

---

## 6. 遗留与建议（不阻塞 P8.1）

1. 在 [`Phase 8 基线 P8.0 性能与 P8.4 准入.md`](../project_docs/Phase%208%20基线%20P8.0%20性能与%20P8.4%20准入.md) 补全 **Chrome / GPU** 环境字段。  
2. 在 **集成显卡**（或 Windows 图形设置「节能」Chrome）下重跑 `DualMeshWorstCase`，填写第二行 fps；若 35–50 fps，按计划在文档中 **书面接受** 后继续 P8.4。  
3. 可选：Performance **4× CPU/GPU** 节流一行作趋势参考。

---

## 7. Plan 中 Todo 状态

- **`p80-baseline`**：在仓库当前 [Phase 8 plan](../../.cursor/plans/phase_8_visual_upgrade_6ed5cf56.plan.md) frontmatter 中已为 **`status: completed`**。若你本地仍为 `pending`，请 `git pull` 或手动对齐为 `completed`。

---

## 8. 后续依赖

- **P8.1**（H-only 数据迁移等）可在此基线与状态机 spec 之上开工；P8.4 再实装生产路径 **`renderer.capabilities.isWebGL2`** 硬断言。
