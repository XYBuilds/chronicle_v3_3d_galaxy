# Phase 32.3 / P32.3 idle 宏观虚化 focusDriver 过渡 实施报告

## 1. 任务目标

将 **idleZFade** 与 **idleNearFade** 纳入同一套宏观虚化 **blend（0…1）**，在 browsing ↔ focus 切换时经既有 `focusDriver`（`SELECT_MS=700` / `DESELECT_MS=450`）平滑进退场，替换 `uIdleMacroFadesActive` 的 0/1 硬切；GPU 与 CPU 拾取门控一致。

对应计划：[`.cursor/plans/phase_32_sdr_readability_motion.plan.md`](../../.cursor/plans/phase_32_sdr_readability_motion.plan.md) · TODO `p32-idle-z-fade-transition`（32.3）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **P1** | `uIdleMacroFadesActive` → **`uIdleMacroFadesBlend`**（float）；shader 内 `mix(1.0, macroFadeAlpha, blend)` |
| **P2** | **selecting**（宏观进入）：`blend = 1 - focusDriver.progress`（1→0）；**deselecting**：`blend = 1 - progress`（progress 1→0 时 blend 0→1） |
| **P3** | **focus 内换星**：`selectingEnteredFromMacro === false` 时 `blend = 0`，不重新打开 near/Z |
| **P4** | `applySelectionFrame` 与 `uFocusCameraBlend` 同帧 `syncIdleMacroFadesBlend`；宏观 enter/exit 期间 idle 保持 transparent 路径 |
| **P5** | 验收后 **`IDLE_NEAR_FADE_DEFAULTS.minAlpha = 0.1`**（原 0.05） |

---

## 3. 实现摘要

| 文件 | 变更 |
| :--- | :--- |
| `galaxyMeshes.ts` | 注册 `uIdleMacroFadesBlend` |
| `galaxyIdle.vert.glsl` | near + Z 合成 `macroFadeAlpha` 后按 blend 插值 |
| `scene.ts` | `computeIdleMacroFadesBlend` / `syncIdleMacroFadesBlend`；RAF 材质门控 |
| `screenRadius.ts` / `interaction.ts` | `idleMacroFadesBlend` + `applyMacroFadeBlend` |
| `idleNearFade.ts` | `computeIdleMacroFadesBlendForPhase`、`applyMacroFadeBlend` |
| `idleNearFade.spec.ts` | blend 相位与 lerp 回归测试 |

**单独调试 near / Z**（宏观 idle、未进 focus）：

```js
window.__galaxyIdleNearFade.enabled = 1  // 0 关
window.__galaxyIdleZFade.mode = 0        // -1/1 开一侧，0 关
window.__galaxyIdleNearFade.log()
window.__galaxyIdleZFade.log()
```

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npx vitest run src/three/idleNearFade.spec.ts`（frontend） | 10 passed |
| `npm run build -w frontend` | 通过 |
| 手测 | 用户确认通过；修复 deselecting 时 blend 方向反相 |

---

## 5. 已知风险与后续

- **32.4** 将整理 `__galaxyIdleNearFade` / `__galaxyIdleZFade` 与背景 token 的调参固化说明；本任务未新增 `__macroFadeBlend` 独立入口。
- 虚化仅作用于 **idle** mesh；focus 内主要视觉仍由 active / Perlin 承担。
- 未改 UMAP、拾取半径、fly-to 时长、Bloom 路径。
