# Phase 29.2 / P29.2 HDR capability probe 实施报告

## 1. 任务目标

设计并在运行时接入 HDR capability probe：明确 WebGL / WebGPU / canvas 能力探测字段、矩阵行映射与推荐输出模式，供 29.3（proof）、29.7（gate）与 Phase 33 引用。

对应计划：[`.cursor/plans/phase_29_release_gates_technical_decision.plan.md`](../../.cursor/plans/phase_29_release_gates_technical_decision.plan.md) · TODO `p29-hdr-probe-design`（29.2）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **P1** | 模块置于 `frontend/src/lib/hdrCapabilities.ts`（与 Three 解耦的纯探测 + 映射；`scene.ts` 仅挂载） |
| **P2** | 生产渲染路径探测恒为 `apiPath: webgl2-srgb`、`recommendedMode: sdr`（D2 不变） |
| **P3** | `osHdr` 恒 `unknown`；`displayHdr` 仅依赖 `(dynamic-range: high)`，**不**冒充 OS HDR 状态 |
| **P4** | WebGPU `toneMapping.mode: extended` 为**离屏异步**探测；初报 `pending`，完成后二次 `console.log` |
| **P5** | `meetsTargetMatrix` 仅在 `matrixRow ∈ {1,2,3}` 且 extended 成功时为 `true`（对齐 §4.4 P0/P1） |
| **P6** | 调试面 `window.__hdrCapabilities`：`report` / `log()` / `refreshWebGpu()` |

全文契约见 [`docs/project_docs/Phase 29 发布门槛与技术判定 spec.md`](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) **§7**。

---

## 3. 实现摘要

| 产出物 | 说明 |
| :--- | :--- |
| **`hdrCapabilities.ts`** | `HdrCapabilitiesReport`、UA/OS/显示器 hints、矩阵行/verdict 推导、WebGPU extended 探测 |
| **`hdrCapabilities.spec.ts`** | 矩阵映射单元测试（6 cases） |
| **`scene.ts`** | WebGL2 校验后挂载 `createHdrCapabilitiesDebug`；dispose 清理 `window.__hdrCapabilities` |
| **Phase 29 spec §7** | 字段表、映射规则、限制与 29.3 衔接 |
| **Design Spec §1.3** | probe 摘要一行 |
| **本报告** | 决策与验证记录 |

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -- src/lib/hdrCapabilities.spec.ts` | 6 passed |
| `npm run build`（`tsc -b` + vite） | 通过 |
| 生产色彩语义 | 未修改 `outputColorSpace` / Bloom 默认关 |

**手动验收**（Win11 + Chrome 148 + HDR 屏，`dynamic-range: high`）：

| 字段 | 实测 |
| :--- | :--- |
| `matrixRow` | `1`（P0 #1） |
| `webgpuExtendedToneMapping` | `true` |
| `meetsTargetMatrix` | `true` |
| `verdictPre` | `experimental` |
| `recommendedMode` | `hdr-capable` |
| `apiPath` / `outputColorSpace` | `webgl2-srgb` / `srgb` |

`refreshWebGpu()` 复测一致；Chromium `powerPreference` 在 Windows 上被忽略的 warning 可忽略（crbug/369219127）。

---

## 5. 风险与后续

| 项 | 负责人 |
| :--- | :--- |
| extended 探测失败不代表 OS HDR off | 29.3 proof 须人工记录 OS/显示器状态 |
| probe 非像素 proof | 29.3 受控 `window.__hdrProbe` patch |
| Firefox / flag-only WebGPU | 矩阵 #8/#9；`meetsTargetMatrix` 保持 false |
| SDR 回归 | 29.4 fallback 策略 |

---

## 6. 分支

- `docs/p29.2-hdr-probe-design`
