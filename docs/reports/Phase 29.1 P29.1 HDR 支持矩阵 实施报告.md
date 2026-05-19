# Phase 29.1 / P29.1 HDR 支持矩阵 实施报告

## 1. 任务目标

定义 HDR 支持矩阵，锁定 OS、浏览器、显示器、渲染 API 与发布门槛组合，供 29.2（probe）、29.3（proof）、29.7（gate）与 Phase 33 引用。

对应计划：[`.cursor/plans/phase_29_release_gates_technical_decision.plan.md`](../../.cursor/plans/phase_29_release_gates_technical_decision.plan.md) · TODO `p29-hdr-matrix`（29.1）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **M1** | 当前生产 **WebGL2 + `THREE.SRGBColorSpace`** 在所有环境下均为 **`fallback-sdr`**，不作为 HDR 发布路径 |
| **M2** | 唯一候选真实 HDR 链路为 **WebGPU canvas `toneMapping.mode: "extended"`**（非 Bloom、非 `uLMax`） |
| **M3** | **P0 发布门槛候选**：Win11 HDR on + Chrome/Edge stable + WebGPU extended + HDR 屏（#1–#2） |
| **M4** | **P1 发布门槛候选**：macOS HDR on + Safari stable + WebGPU extended + XDR/HDR 屏（#3） |
| **M5** | OS HDR off、SDR 屏、Firefox、仅 flag 可用的 WebGPU、Canvas 2D HDR lab — **不进**普通用户发布门槛 |
| **M6** | 矩阵中 `supported` 须在 **29.3 像素 proof** 后方可在 gate 中生效；29.1 仅锁定 **预分类** |

全文矩阵见 [`docs/project_docs/Phase 29 发布门槛与技术判定 spec.md`](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) **§4**。

---

## 3. 实现摘要

| 产出物 | 说明 |
| :--- | :--- |
| **Phase 29 spec §4** | 判定语义、API 分层、12 行组合矩阵、P0/P1 发布门槛、实验排除、29.2/29.3 输入 |
| **Design Spec §1.3** | 增加 HDR 矩阵一行摘要 |
| **本报告** | 决策与验证记录 |

**无** `frontend/` 代码变更（29.2 起再引入 probe）。

---

## 4. 平台依据（文档调研，非实测）

| 来源 | 结论 |
| :--- | :--- |
| Chrome 129+ WebGPU | `GPUCanvasToneMappingMode`：`standard` vs `extended`（[Chrome Developers Blog](https://developer.chrome.com/blog/new-in-webgpu-129)） |
| WebKit | WebGPU HDR canvas 已合入（[WebKit PR #34668](https://github.com/WebKit/WebKit/pull/34668)）；部分环境仍依赖 feature flag |
| WebGL / 2D Canvas HDR | W3C Color on the Web CG 进行中；**无**稳定跨浏览器生产承诺 |
| 本项目 `scene.ts` | `outputColorSpace = SRGBColorSpace`；`postFxBloomEnabled = false` — 与 M1 一致 |

**说明**：29.1 为**能力预分类**；是否在 P0/P1 上观察到扩展亮度，由 **29.3 proof** 实测填写。

---

## 5. 验证

- 与 `scene.ts`（`SRGBColorSpace`、Bloom 默认关）及 Phase 29 spec D1–D4 对照一致。
- 文档-only；未运行 build/typecheck。

---

## 6. 风险与后续

| 项 | 负责人 |
| :--- | :--- |
| WebGPU 与 Three.js 主场景 **未集成** | 29.2 probe 设计 + 29.3 受控 proof patch |
| Safari flag / 版本碎片 | 29.3 须记录 Safari build 与 flag 状态 |
| P0 全失败 | 29.7 → No-go Phase 33，保留 SDR + capability 文档 |
| SDR 回归矩阵 | 29.4 fallback 策略 |

---

## 7. 分支

- `docs/p29.1-hdr-support-matrix`
