# Phase 29.4 / P29.4 SDR fallback 策略 实施报告

## 1. 任务目标

定义并落实 SDR 降级策略：在 HDR 关、不支持或 Phase 33 未 go 时，**保持现有 WebGL2 + sRGB 主路径无回归**；禁止黑屏、色偏、过曝与 Bloom 默认开启；Phase 29 不回写 `galaxyMeshes` / `galaxyUniformDefaults`。

对应计划：[`.cursor/plans/phase_29_release_gates_technical_decision.plan.md`](../../.cursor/plans/phase_29_release_gates_technical_decision.plan.md) · TODO `p29-sdr-fallback`（29.4）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **S1** | `sdrFallback.ts` 为生产策略 SSOT；`scene.ts` 使用 `SDR_FALLBACK_OUTPUT_COLOR_SPACE` 常量 |
| **S2** | `hdr-capable` / `meetsTargetMatrix` **不**改变星系渲染器或色彩空间（待 Phase 33 + D1 proof） |
| **S3** | 启动时 `assertSdrProductionRenderer`（DEV throw / prod warn） |
| **S4** | WebGPU 异步 probe 完成后通过 `onReportUpdated` 刷新 `__sdrFallback.policy` |
| **S5** | `__hdrProbe` 叠加层与主 canvas **隔离**；默认隐藏 |

契约 SSOT：[`docs/project_docs/Phase 29 发布门槛与技术判定 spec.md`](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) **§9**。

---

## 3. 实现摘要

| 产出物 | 说明 |
| :--- | :--- |
| **`sdrFallback.ts`** | `SdrProductionPolicy`、`buildSdrProductionPolicy`、`assertSdrProductionRenderer`、`createSdrFallbackDebug` |
| **`sdrFallback.spec.ts`** | `deriveFallbackReason` / policy 单元测试（5 cases） |
| **`hdrCapabilities.ts`** | 可选 `onReportUpdated` 回调 |
| **`scene.ts`** | 挂载 `window.__sdrFallback`；`outputColorSpace` 引用 SSOT 常量 |
| **Phase 29 spec §9** | 不变量、条件表、回归矩阵 |
| **Design Spec §1.3** | 29.4 摘要一行 |
| **本报告** | 决策与验证记录 |

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -- src/lib/sdrFallback.spec.ts src/lib/hdrCapabilities.spec.ts src/lib/hdrProof.spec.ts` | **15 passed** |
| `npm run build` | `tsc` + vite 通过 |
| `galaxyMeshes` / `galaxyUniformDefaults` | **未修改** |
| Bloom 生产默认 | **仍为 off** |

### 4.1 手动验收（控制台）

```js
window.__sdrFallback.policy
// 期望：galaxyRenderPath === 'webgl2-srgb-direct', bloomEnabled === false, outputColorSpace === 'srgb'

await window.__hdrCapabilities.refreshWebGpu()
window.__sdrFallback.refresh()
// hdr-capable 环境：fallbackReason === 'hdr-capable-awaiting-phase33'，主星系仍正常 SDR

await window.__hdrProbe.show()
window.__hdrProbe.hide()
// 主 canvas 无残留叠加
```

---

## 5. 风险与后续

| 项 | 负责人 |
| :--- | :--- |
| Phase 33 切换 HDR 主路径 | 33.3 `renderMode` + 33.5 渲染路径；须复用本 §9 不变量作对比基线 |
| SDR 可读性 | Phase 32 |
| Gate 汇总 | 29.7 引用 §9.4 回归矩阵 |

---

## 6. 分支

- `docs/p29.4-sdr-fallback`
