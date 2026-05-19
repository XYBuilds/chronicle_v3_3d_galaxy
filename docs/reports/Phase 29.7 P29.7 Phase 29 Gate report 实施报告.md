# Phase 29.7 / P29.7 Phase 29 Gate report 实施报告

## 1. 任务目标

汇总 Phase 29.0–29.6 的结论，输出 **go/no-go** 决策：是否进入 Phase 33 HDR production、HDR 能力如何保留、Phase 30 实施前置是否满足，以及转入 Phase 32 / 34 / backlog 的风险项。

对应计划：[`.cursor/plans/phase_29_release_gates_technical_decision.plan.md`](../../.cursor/plans/phase_29_release_gates_technical_decision.plan.md) · TODO `p29-gate-report`（29.7）。

---

## 2. 执行摘要

| 决策域 | 结论 | 一句话 |
| :--- | :--- | :--- |
| **Phase 33 HDR production（33.5 主路径接入）** | **No-go** | P0 #1 已实测：WebGPU `extended` configure 成功，D1 像素/目视 proof **未通过**；P0/P1 无稳定 `supported` 组合 |
| **Phase 33（收窄路径）** | **Go（条件）** | 固化 probe + proof + SDR fallback；**不**默认 `hdr-active`；33.5 **冻结**直至独立 spike |
| **Phase 30 深链产品化** | **Go** | §5 路由契约 + §6 静态 rewrite 方案已锁定；30.7 落地配置后即可实现 |
| **Phase 32 SDR 可读性** | **Go（并行）** | 与 HDR gate 解耦；不依赖 Phase 33 |
| **当前生产渲染** | **不变** | WebGL2 + `SRGBColorSpace`；Bloom 默认关 |

---

## 3. HDR：证据与矩阵终态

### 3.1 P0/P1 抽样（29.3 §8.5 + 讨论纪要）

```text
Environment: Win11 HDR on; primary HDR display 2560×1440 (about-gpu: LINEAR_HDR, RGBA_F16, rel peak ~2.11×);
Chrome 148.0.7778.168 + Edge; matrixRow=1; webgpuExtendedToneMapping=true.
Proof (__hdrProbe): visual extended/standard identical (window + fullscreen); extRatio=stdRatio=1;
verdict=sdr-clamped; meetsD1Proof=false.
Control: YouTube HDR sample (watch?v=QlLJMeEfSmA) — visible HDR on same machine.
Conclusion: P0 #1 API-capable (experimental); D1 display proof FAILED for raw WebGPU canvas extended.
Production: WebGL2 sRGB unchanged (D2).
```

本地 GPU 日志（不入库）：`logs/about-gpu-2026-05-19T09-55-48-512Z.txt`。

### 3.2 矩阵行终态（gate 锁定）

| # | 组合 | 29.1 预分类 | **29.7 终态** | 说明 |
| :---: | :--- | :--- | :--- | :--- |
| 1 | Win11 HDR on · Chrome · WebGPU extended · HDR | experimental ★ | **`experimental`** | configure OK；D1 **失败** — 不得升为 `supported` |
| 2 | Win11 HDR on · Edge · WebGPU extended · HDR | experimental ★ | **`experimental`** | 与 #1 同栈；**未单独 proof**；gate 沿用 #1 结论 |
| 3 | macOS HDR on · Safari · WebGPU extended · XDR | experimental ★ | **`experimental`** | **未在本轮实测**；33.5 前须补 proof，不得假设 `supported` |
| 4–5 | HDR on · WebGL2 sRGB | fallback-sdr | **`fallback-sdr`** | 当前生产栈（D2） |
| 6–7, 11–12 | blocked 语义行 | blocked | **`blocked`** | 无 HDR 输出预期 |
| 8–10 | Firefox / flag-only / Canvas 2D | experimental | **`experimental`** | 不进发布门槛 |

**D4 门禁**：P0/P1 **无一** `supported` → **No-go Phase 33 HDR production**（对齐 spec §4.6、§8.3）。

### 3.3 三条分支（对齐 Phase 33 plan §33.2）

| 分支 | Phase 29 判定 | Phase 33 含义 |
| :--- | :--- | :--- |
| `production` / `hdr-active` | **不进入** | 33.5 主路径接入 **冻结** |
| `experimental` | **是**（#1–#3 API 层） | 保留 `__hdrCapabilities`、`__hdrProbe`、Storybook lab；仅 capability / lab |
| `fallback-sdr` | **是**（全部用户默认） | `sdrFallback` 策略已锁定（29.4）；生产恒 SDR |

---

## 4. Phase 33 go/no-go（详表）

| 子项 | Go / No-go | 依据 |
| :--- | :--- | :--- |
| **33.5 HDR render path 接入星系** | **No-go** | D1 未满足；WebGPU extended canvas 与 SDR reference 无可见分离 |
| **33.1–33.4 probe 产品化** | **Go** | 29.2–29.4 已实现；33 可文档化 + debug 面巩固 |
| **33.6 Bloom 作为 HDR 替代** | **No-go** | D3；与 gate 无关 |
| **33.7 SDR fallback 文档** | **Go** | 29.4 已落实代码与 §9 |
| **33.8 全矩阵 HDR 设备验收** | **Defer** | 待 spike 或 #3 补测后再定义通过标准 |

**收窄后 Phase 33 目标**：`renderMode` 模型 + capability 运行时暴露 + SDR-only 默认 + 明确「HDR 非当前发布能力」说明；**不**承诺用户可见 HDR 星系。

**建议 backlog（非 29.7 实施范围）**：

- 新建 **`phase_33b_webgpu_hdr_spike`**（或等价）计划：Three.js WebGPU + extended tone mapping 与主场景隔离 spike；通过后再解冻 33.5。
- `hdr-active` 若将来成立：优先 **lab / 开发者 flag**，非全站默认。

---

## 5. HDR 能力保留方式（No-go 后）

| 保留物 | 位置 | 用途 |
| :--- | :--- | :--- |
| Capability probe | `frontend/src/lib/hdrCapabilities.ts` → `window.__hdrCapabilities` | 用户反馈、矩阵行、WebGPU extended 异步探测 |
| 最小 proof | `frontend/src/lib/hdrProof.ts` → `window.__hdrProbe` | 回归 D1；新浏览器/OS 补证据 |
| SDR 策略 | `frontend/src/lib/sdrFallback.ts` → `window.__sdrFallback` | 生产不变量与 `fallbackReason` |
| Storybook lab | `HdrProofLab` | 非生产验收 |
| 文档 SSOT | `docs/project_docs/Phase 29 发布门槛与技术判定 spec.md` §4–§10 | 矩阵、proof、gate |
| 讨论纪要 | `docs/temp/HDR 双栈路线与 Phase 29-33 讨论纪要.md` | 路线与 spike 上下文 |

**不要求**：删除 probe/proof；**不要求**：为「变亮」调高 `uLMax` 或默认 Bloom（归 Phase 32）。

---

## 6. Phase 30 实施前置

| 前置项 | 状态 | 引用 |
| :--- | :--- | :--- |
| Path 契约 `/` · `/movie/:id` · `/today` | **满足** | spec §5；[P29.5 报告](./Phase%2029.5%20P29.5%20深链路由契约%20实施报告.md) |
| URL ↔ `selectedMovieId` / cover boot / query 保留 | **满足** | R1–R9 |
| 静态托管 rewrite 方案 | **满足** | spec §6；[P29.6 报告](./Phase%2029.6%20P29.6%20静态部署%20rewrite%20预检%20实施报告.md) |
| CF 主域隐式 SPA | **已确认（文档）** | W1；生产 URL 手测建议 30.8 |
| GHP 备线 `404.html` | **待 30.7** | W3 |
| 显式 `_redirects` | **待 30.7** | W2 |

**结论**：Phase 30 **可开工**；首 sprint 建议 30.2–30.4（parser + controller）与 30.7（rewrite 文件）并行规划。

**Phase 30 不依赖 Phase 33**。

---

## 7. 风险与下游分流

| 风险 | 严重度 | 分流 |
| :--- | :--- | :--- |
| 将 WebGPU configure 成功误判为 HDR 已交付 | 高 | 对外文案仅用「experimental / lab」；以 D1 proof 为准 |
| Canvas 读回恒 clamp | 中 | 不以 `meetsD1Proof` 单独否决/通过；须目视 + 对照（YouTube HDR） |
| macOS #3 未测即启动 33.5 | 高 | 33.5 冻结；#3 proof 为 spike 退出条件之一 |
| cover boot 与 `/movie/:id` 竞态 | 中 | Phase 30 实现 R4 + `pendingRoute` |
| GHP 深链 404 | 中 | Phase 30.7 `404.html` |
| `vite preview` 误报深链 | 低 | 30.8 用 CF / wrangler |
| 产品侧「先变亮」压力 | 中 | **Phase 32** SDR 可读性；**非** Phase 33 伪 HDR |
| 每片 OG / 分享卡片 | — | **Phase 34** |
| Three WebGPU 全量 port（WGSL/TSL） | 高 | **独立 spike / backlog**；不与收窄 P33 同 sprint |

---

## 8. Phase 29 交付物核对

| 交付物 | 状态 |
| :--- | :--- |
| HDR support matrix | **完成**（§4；#1 gate 终态已填） |
| HDR capability probe | **完成**（§7 + 代码） |
| HDR proof 记录 | **完成**（§8；P0 #1 实测） |
| SDR fallback 说明 | **完成**（§9 + 代码） |
| Phase 30 路由契约 | **完成**（§5） |
| Static hosting rewrite 方案 | **完成**（§6） |
| Phase 33 go/no-go | **完成**（本节 + spec §10） |

**Phase 29 总状态**：**Gate 通过**（判定任务完成）；**HDR production 分支 No-go**。

---

## 9. 验证

| 检查 | 结果 |
| :--- | :--- |
| 29.0–29.6 报告与 spec §4–§9 交叉引用 | 一致 |
| D4 / §4.6 No-go 条件 | P0 无 `supported` → 已触发 |
| 本 TODO 代码变更 | **无**（文档 + spec §10） |
| 前端 build | **未执行**（无代码变更） |

---

## 10. 分支

- `docs/p29.7-gate-report`

---

## 11. 待人工验收

请确认是否接受本 gate 结论。接受后可将计划 TODO `p29-gate-report` 标为 completed，并执行 `finish_todo.sh` 流程。
