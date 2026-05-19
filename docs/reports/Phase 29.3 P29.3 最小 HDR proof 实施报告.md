# Phase 29.3 / P29.3 最小 HDR proof 实施报告

## 1. 任务目标

规划并实现最小可复现 HDR proof：在受控 WebGPU patch 上同屏对比 **SDR reference white**（linear 1.0）与 **HDR candidate highlight**（linear 4.0），区分 `toneMapping.mode: "extended"` 与 `"standard"`，为 §4.3 ★ 行（P0/P1）提供 D1 像素级验收手段。

对应计划：[`.cursor/plans/phase_29_release_gates_technical_decision.plan.md`](../../.cursor/plans/phase_29_release_gates_technical_decision.plan.md) · TODO `p29-hdr-proof`（29.3）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **H1** | 常量锁定：`HDR_PROOF_SDR_REFERENCE_LINEAR = 1.0`，`HDR_PROOF_CANDIDATE_LINEAR = 4.0` |
| **H2** | 载体为独立 WebGPU 全屏三角着色器 + 叠加 canvas，**不**改星系 shader 或 `outputColorSpace` |
| **H3** | `runComparison()` 先 extended 后 standard，中心像素读回 + `interpretHdrProofComparison()` 自动 verdict |
| **H4** | 读回仅为 best-effort；`inconclusive` 时须 HDR 屏目视；证据模板写入 spec §8.4 |
| **H5** | 生产挂载 `window.__hdrProbe`（默认隐藏）；Storybook `Dev/HDR proof lab` 便于 lab 验收 |

契约 SSOT：[`docs/project_docs/Phase 29 发布门槛与技术判定 spec.md`](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) **§8**。

---

## 3. 实现摘要

| 产出物 | 说明 |
| :--- | :--- |
| **`hdrProof.ts`** | 渲染、采样、`HdrProofReport`、`createHdrProofDebug()` |
| **`hdrProof.spec.ts`** | `interpretHdrProofComparison` 单元测试（4 cases） |
| **`scene.ts`** | 挂载 / dispose `window.__hdrProbe` |
| **`HdrProofLab` + Storybook** | 可视化 lab 页 |
| **Phase 29 spec §8** | 方法、判定、证据清单 |
| **Design Spec §1.3** | proof 一行摘要 |
| **本报告** | 决策与验证记录 |

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -- src/lib/hdrProof.spec.ts src/lib/hdrCapabilities.spec.ts` | 10 passed |
| `npm run build` | `tsc` + vite 通过 |
| 生产星系路径 | 未改 Bloom 默认、未改 `galaxyMeshes` |

### 4.1 手动验收步骤（HDR 环境）

在 Win11/macOS **HDR on** + HDR 屏 + Chrome/Edge/Safari stable：

```js
await window.__hdrProbe.show()
const r = await window.__hdrProbe.runComparison()
// 期望：目视右侧明显亮于左侧（extended）；r.verdict 可能为 hdr-output-likely 或 inconclusive（读回常 clamp）
window.__hdrProbe.log()
```

记录 `r`、`window.__hdrCapabilities.report`、截图与 OS/显示器/浏览器版本，供 **29.7 gate** 汇总。

### 4.2 验收机实测（P0 #1，已接受）

| 项 | 结果 |
| :--- | :--- |
| 环境 | Win11 HDR on；主屏 2560×1440 HDR（`about-gpu`：LINEAR_HDR / RGBA_F16）；Chrome **148.0.7778.168** + Edge；多屏但窗口在 HDR 屏 |
| API | `matrixRow=1`，`webgpuExtendedToneMapping=true` |
| 读回 | `extRatio=1`，`stdRatio=1`；`verdict=sdr-clamped`，`meetsD1Proof=false` |
| 目视 `__hdrProbe` | extended / standard、窗口与全屏：**左右亮度无差别** |
| 对照 | [YouTube HDR 样片](https://www.youtube.com/watch?v=QlLJMeEfSmA) 同机同浏览器 **可** 目视 HDR 亮度 → 视频 HDR 路径 OK，WebGPU canvas extended **未** 呈现 headroom |

**29.3 / Phase 33 前置结论**：P0 #1 保持 **`experimental`**（configure 成功，D1 显示 proof 未通过）；生产仍为 WebGL2 sRGB。29.7 汇总时引用本节 + `logs/about-gpu-2026-05-19T09-55-48-512Z.txt`（本地，不入库）。

---

## 5. 风险与后续

| 项 | 负责人 |
| :--- | :--- |
| Canvas 读回常在 SDR 范围 clamp | 29.7 以目视 + 截图为准；勿单独信 `meetsD1Proof` |
| OS HDR off 时 proof 无意义 | 人工字段必填（spec §8.4） |
| 未在 ★ 行全量实测 | 29.7 前须在 #1–#3 至少抽样完成证据 |
| SDR 主路径回归 | 29.4 fallback 策略 |

---

## 6. 分支

- `docs/p29.3-hdr-proof`
