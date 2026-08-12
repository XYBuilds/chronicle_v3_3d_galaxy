# HDR 双栈路线与 Phase 29–33 讨论纪要

> **Disposition:** historical material at this path. Not current product authority.


> **文档性质**：临时说明稿（`docs/temp/`），汇总 2026-05 关于 HDR 发布门槛、最小 proof、WebGPU 迁移与后续路线的对话结论。  
> **权威规格**仍以 [`docs/project_docs/Phase 29 发布门槛与技术判定 spec.md`](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md)、各 Phase 计划（`.cursor/plans/`）及实施报告（`docs/reports/`）为准。  
> **最后整理**：2026-05-19

---

## 1. 我们现在的目标

### 1.1 产品级渲染目标（双栈）

希望长期形态为：

| 层级 | 含义 |
|------|------|
| **主路径（默认）** | **WebGL2 + `THREE.SRGBColorSpace`**：全站 ~60K 粒子星系、交互、Drawer、时间轴等，**SDR 语义**（Phase 29 **D2**）。 |
| **条件分支（非默认）** | 在探测与环境满足时，保留 **WebGPU / HDR 输出** 的**实验或未来生产**能力；**不满足时强制回 SDR**，无黑屏、无默认 Bloom 冒充 HDR。 |

用 Phase 33 计划中的 `renderMode` 表述即为：

- **`sdr`**：所有人默认；`renderer.render(scene, camera)`，现有 WebGL2 管线。
- **`hdr-capable`**：探测到 P0/P1 候选（如 Win + Chrome + WebGPU extended configure 成功），**仅标记能力**，不自动切换主画面。
- **`hdr-active`**：已接入**可验证**的 HDR 呈现链路（需新 proof；当前**未**对主星系启用）。

### 1.2 与 Phase 编号的关系

| Phase | 在本目标中的作用 |
|-------|------------------|
| **29** | 发布门槛：**矩阵、probe、最小 proof、SDR fallback、深链预检、gate 报告**（29.0–29.3 已完成部分）。 |
| **32** | **SDR 可读性**与选中星球动效；**不**依赖 HDR，改善主路径体验。 |
| **33（收窄）** | 固化 **SDR fallback + renderMode 文档/日志 + Bloom 策略**；在 gate 为 experimental 时 **不做 33.5 生产 HDR**。 |
| **33-spike / 33.5（未来）** | Three.js **WebGPURenderer + ExtendedSRGB** 类 lab 与新 D1 proof；通过后再谈 `hdr-active` 接主场景或子场景。 |
| **30** | 深链 `/movie/:id`、`/today`；与 HDR 分支独立。 |

### 1.3 明确「不是什么」

- **不是**把 SDR 提亮、`uLMax` 顶格或默认 Bloom 当作 HDR（Phase 29 **D1/D3**）。
- **不是**短期「整库替换为 WebGPU 渲染器」的大迁移。
- **不是**在未通过显示级 proof 时，对用户默认开启 HDR 星系。

---

## 2. 我们遇到的问题

### 2.1 Phase 29.3 最小 proof（`window.__hdrProbe`）

在 **Win11 HDR 开、HDR 主屏、Chrome 148 / Edge、多屏但窗口在 HDR 屏** 上执行：

```js
await window.__hdrProbe.show()
const report = await window.__hdrProbe.runComparison()
```

**结果摘要**（`console.table`）：

| 字段 | 值 |
|------|-----|
| `matrixRow` | `1`（P0 #1） |
| `webgpuExtendedToneMapping` / `webgpuExt` | `true` |
| `extRatio` / `stdRatio` | 均为 `1` |
| `verdict` | `sdr-clamped` |
| `meetsD1Proof` | `false` |

**目视**：`renderMode('extended')` 与 `standard`、**窗口与全屏**下，左右补丁（linear **1.0** vs **4.0**）**亮度完全相同**。

**曾出现的工程问题（已修）**：

- 对 swapchain 纹理 `copyTextureToBuffer` → `CopySrc` 报错；已改为离屏 `COPY_SRC` 纹理再 blit 到 canvas。
- Windows 上 `requestAdapter({ powerPreference })` 无意义警告；已改为 Win 上省略该参数。
- `window.__hdrProbe.report` 在 DevTools 中偶发难读；已改为 `runComparison()` 后写入普通属性，`log()` 返回 report。

### 2.2 与「环境不能 HDR」的区分

| 对照 | 结果 | 含义 |
|------|------|------|
| 同机 **YouTube HDR**（如 [样片 QlLJMeEfSmA](https://www.youtube.com/watch?v=QlLJMeEfSmA)） | **可**目视 HDR 亮度 | OS/屏/浏览器 **视频 HDR 路径** 正常 |
| `about:gpu` 主屏 2560×1440 | `LINEAR_HDR`、`RGBA_F16`、`HDR relative maximum luminance ~2.11` | Chromium **识别** HDR 显示器 |
| `__hdrProbe` patch | 无分离 | **WebGPU canvas `extended` 最小探针** 未呈现扩展亮度 |

结论：**不是**「没开 HDR」，而是 **当前选的探针路径 + 窗口化浏览器合成** 下，**不能作为 D1 显示 proof 通过**。

### 2.3 与 three.js 官方 HDR 示例的关系

[three.js `webgpu_hdr.html`](https://github.com/mrdoob/three.js/blob/master/examples/webgpu_hdr.html) 使用：

- `THREE.WebGPURenderer` + `HalfFloatType`
- `ExtendedSRGBColorSpace`
- TSL / `RenderPipeline`、加法混合累积高光

这与本仓库 **29.3 裸 WebGPU canvas + `toneMapping: extended`** **不是同一条链路**。  
官方示例说明 **HDR 在引擎栈上可实现**，但 **不能** 从 29.3 失败直接推出「应立刻全量迁 WebGPU」；需要 **单独 lab + 新 proof**。

### 2.4 对 Phase 33 的含义

按 Phase 33 计划原文：**若 Phase 29 无 stable `supported` 组合，则不进入 33.5 生产 HDR**，仅 probe + 降级说明。

当前证据支持：

- P0 #1 保持 **`experimental`**（API configure OK，D1 未过）。
- **Phase 33 收窄**：做 33.1–33.4、33.6–33.7，**跳过或冻结 33.5**。
- **完整「用户可见 HDR 星系」**：需另立 spike，不能假设收窄 P33 会交付。

---

## 3. 讨论的实施方向、条件与步骤

### 3.1 目标拆成两层（避免预期错位）

| 层次 | 内容 | 靠哪些 Phase |
|------|------|----------------|
| **A. 架构 / 治理** | 永远 WebGL2 SDR 生产；探测 → `hdr-capable` 标记；实验入口；文档化降级；Bloom 不冒充 HDR | 29.4、29.7、收窄 P33 |
| **B. 显示 / 产品 HDR** | `hdr-active` 下主场景或子场景真实扩展亮度 | 33-spike + 新 proof + 条件解冻 33.5 |

**收窄 P33 只保证 A；B 需额外计划。**

### 3.2 推荐路线图（步骤）

```text
① 29.4  SDR fallback 策略（文档 + 必要 guard）
② 29.5–29.6（若近期做深链）路由契约与静态 rewrite 预检
③ 29.7  Gate report：写入本机实测、YouTube 对照、Phase 33 → experimental + SDR-only 默认
④ 收窄 P33
      · 33.2 决策表（production / experimental / fallback-sdr）
      · 33.3–33.4 renderMode 与 capability 运行时暴露（对齐现有 hdrCapabilities）
      · 33.6 Bloom 策略
      · 33.7 Fallback 说明固化
      · 明确不做 33.5（直至 spike 通过）
⑤ （可选并行）Phase 32  SDR 可读性、选中星球自转
⑥ 新子计划：Phase 33-spike（建议单独 `.cursor/plans/` 文件）
      · 本机跑通 three.js webgpu_hdr 同源 lab
      · 最小星系切片（如仅 idle InstancedMesh）WebGPU 试验
      · 新 D1 proof 标准（目视 + 读回 + 矩阵行）
⑦ 仅当 ⑥ 通过 → 修订 29.7 / 矩阵，解冻 33.5，评估 hdr-active 接入范围
⑧ Phase 30  深链产品化（与 HDR 独立）
```

### 3.3 各步完成后的「效果」

| 阶段 | 普通用户 | 开发者 / 发布门槛 |
|------|----------|-------------------|
| ①–③ + ④ 收窄 P33 | 仍为 **SDR 星系**（P32 可能更亮但仍 SDR） | 启动可知 `renderMode`；gate 文档齐全；`__hdrProbe` / probe 保留 |
| ⑥ spike 成功 | 仍可能默认 SDR；或仅 lab/flag 下见 HDR | 可将矩阵行升为 `supported` 候选，启动 33.5 设计 |
| ⑦ 33.5 + hdr-active | **可选** HDR 画面（需产品决策：全站或子模式） | 双栈真正接通「输出腿」 |

### 3.4 Phase 33-spike 建议范围（待单独写 plan）

| 项 | 说明 |
|----|------|
| **目标** | 验证 **Three WebGPU + ExtendedSRGB** 路径在 P0 #1 上是否可比 29.3 patch 更符合 D1 |
| **不做** | 一次性替换 60K 双 mesh 全量管线；不改 UMAP/数据/HUD 路由 |
| **参考** | [three.js `webgpu_hdr.html`](https://github.com/mrdoob/three.js/blob/master/examples/webgpu_hdr.html) |
| **版本** | 核对 `three@0.183.2` 与 `three.webgpu` / `ExtendedSRGBColorSpace` 是否需升级 |
| **通过条件** | extended 下 patch 或 lab 场景 **目视** 高光分离；读回作辅证；记录 OS/浏览器/屏 |

### 3.5 全量 WebGPU 迁移（长期，非近期）

若未来要将 **主星系** 迁到 WebGPU：

- 需 port 全部 GLSL → WGSL/TSL（idle/active、oklab、selection mask 等）。
- 后处理（`UnrealBloomPass`）需 WebGPU 等价方案。
- **必须** 保留 WebGL2 回退（Firefox、旧环境、无 WebGPU）。

这与「条件 HDR 分支」相关但 **工作量级更大**；应在 spike 与 33.5 决策之后再立项，**不宜**与收窄 P33 混为同一 sprint。

### 3.6 29.7 gate 建议记录模板（可直接粘贴）

```text
Environment: Win11 HDR on; primary HDR display 2560×1440 (about-gpu: LINEAR_HDR, RGBA_F16, rel peak ~2.11×);
Chrome 148.0.7778.168 + Edge; matrixRow=1; webgpuExtendedToneMapping=true.
Proof (__hdrProbe): visual extended/standard identical (window + fullscreen); extRatio=stdRatio=1;
verdict=sdr-clamped; meetsD1Proof=false.
Control: YouTube HDR sample (watch?v=QlLJMeEfSmA) — visible HDR on same machine.
Conclusion: P0 #1 API-capable (experimental); D1 display proof FAILED for raw WebGPU canvas extended.
Phase 33 (narrow): SDR-only default; probe + __hdrProbe retained; 33.5 frozen until Three WebGPU HDR spike.
Production: WebGL2 sRGB unchanged (D2).
```

---

## 4. 相关仓库锚点

| 主题 | 路径 |
|------|------|
| 生产渲染入口 | `frontend/src/three/scene.ts`（`WebGLRenderer`、`SRGBColorSpace`） |
| HDR capability probe | `frontend/src/lib/hdrCapabilities.ts` → `window.__hdrCapabilities` |
| 最小 HDR proof | `frontend/src/lib/hdrProof.ts` → `window.__hdrProbe` |
| Storybook lab | `frontend/src/storybook/HdrProofLab.*` |
| Phase 29 spec | `docs/project_docs/Phase 29 发布门槛与技术判定 spec.md`（§4 矩阵、§7 probe、§8 proof、§8.5 验收机记录） |
| 29.3 实施报告 | `docs/reports/Phase 29.3 P29.3 最小 HDR proof 实施报告.md` |
| 计划 | `.cursor/plans/phase_29_release_gates_technical_decision.plan.md`、`phase_33_hdr_production_fallback.plan.md`、`phase_32_sdr_readability_motion.plan.md` |
| 本机 GPU 日志（不入库） | `logs/about-gpu-2026-05-19T09-55-48-512Z.txt` |

---

## 5. 待决事项（后续讨论）

- [ ] 是否在 29.7 中正式冻结 **33.5**，并创建 **`phase_33b_webgpu_hdr_spike`**（或等价）计划文件。
- [ ] Phase 32 与 29.4–29.7 的并行优先级（产品更急「变亮」还是「gate 文档」）。
- [ ] `hdr-active` 若将来成立：全站切换 vs 独立 lab 页 vs 开发者 flag。
- [ ] three.js 版本是否为目标 WebGPU HDR 升级（与构建体积、兼容性权衡）。

---

*本文档随讨论更新；若与 SSOT spec 冲突，以 `docs/project_docs/` 与已合并 PR 为准。*
