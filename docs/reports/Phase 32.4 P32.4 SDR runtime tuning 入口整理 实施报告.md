# Phase 32.4 / P32.4 SDR runtime tuning 入口整理 实施报告

## 1. 任务目标

整理 Phase 32 SDR 主路径的运行时调参入口：保留开发期手调能力，将验收后的参数固化到源码 SSOT 常量，并明确背景 token + idle 宏观虚化（Z + near + macro-fade blend）为主路径，`__galaxyColor` 为辅助。

对应计划：[`.cursor/plans/phase_32_sdr_readability_motion.plan.md`](../../.cursor/plans/phase_32_sdr_readability_motion.plan.md) · TODO `p32-sdr-runtime-toggles`（32.4）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **P1** | 新增 `sdrRuntimeTuning.ts` 聚合 `SDR_RUNTIME_DEFAULTS` 与 `FOCUS_SELECT_MS` / `FOCUS_DESELECT_MS` |
| **P2** | 主入口 `window.__sdrTuning`：`log()` 一行汇总 + 分项；`resetAll()` 恢复背景 + near + Z |
| **P3** | 新增 `window.__galaxyIdleMacroFade` 只读观察 `uIdleMacroFadesBlend` 与 `focusDriver` 同步 |
| **P4** | `__galaxyIdleNearFade.reset()` / `__galaxyIdleZFade.reset()` 写回 `IDLE_*_FADE_DEFAULTS` |
| **P5** | 启动时仅 `__sdrTuning.log()`；`__galaxyColor` 保留但不作为 SDR 提亮主路径 boot log |

---

## 3. 实现摘要

| 产出物 | 说明 |
| :--- | :--- |
| **`sdrRuntimeTuning.ts`** | `SDR_RUNTIME_DEFAULTS`、`applyIdleNearFadeDefaults` / `applyIdleZFadeDefaults`、`formatSdrRuntimeTuningLog` |
| **`sdrRuntimeTuning.spec.ts`** | defaults 镜像、reset helpers、log 格式（3 cases） |
| **`scene.ts`** | `__sdrTuning`、`__galaxyIdleMacroFade`；near/Z `reset()`；`SELECT_MS`/`DESELECT_MS` 改引 `FOCUS_*_MS` |
| **计划 32.4 备忘** | shipped defaults 表、console 示例、放弃候选 |

**发布默认（SSOT）：**

| 参数 | 值 |
| --- | --- |
| `COSMOS_UNIVERSE_BG_DEFAULT` | `#000002` |
| `IDLE_NEAR_FADE_DEFAULTS` | enabled=1, startDist=20, width=10, minAlpha=0.1 |
| `IDLE_Z_FADE_DEFAULTS` | mode=-1, outsideAlpha=0.5 |
| macro-fade 过渡 | `FOCUS_SELECT_MS=700`, `FOCUS_DESELECT_MS=450` |

**Console 示例：**

```js
__sdrTuning.log()
__sdrTuning.resetAll()
__galaxyIdleMacroFade.blend
__galaxyUniverseBg.color = '#0a1628'
```

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/three/sdrRuntimeTuning.spec.ts src/three/universeBackground.spec.ts` | 7 passed |
| `npm run build -w frontend` | 通过 |
| 用户验收 | 通过（无额外调整） |

---

## 5. 已知风险与后续

- **32.5+** 自转轴与 perlin Bloom 调试入口将沿用同类「分项 + 汇总」模式，不与 `__sdrTuning` 混用全局 Bloom 语义。
- `resetAll()` 不强制重置 macro-fade blend（随 focus 状态机变化）；观察进退场需在 browsing↔focus 切换时读 `__galaxyIdleMacroFade`。
- 未改 UMAP、拾取半径、相机或 Bloom 路径。
