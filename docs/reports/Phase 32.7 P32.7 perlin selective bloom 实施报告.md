# Phase 32.7 / P32.7 perlin selective bloom 实施报告

## 1. 任务目标

为 focus 选中 Perlin 星球接入 **selective Bloom**：默认开启，仅 `planet.mesh` 参与合成；`galaxy.idle` / `galaxy.active` 与全局 `window.__bloom` 生产路径仍默认关闭。验收期附带 `__planetTerrace.perlinLightingEnabled` 光照开关（flat vs Lambert）。

对应计划：`.cursor/plans/phase_32_sdr_readability_motion.plan.md` · TODO `p32-perlin-selective-bloom`（32.7）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **P1** | 选择性 Bloom：three.js layer 1 + 相机 layer mask；bloom pass 只渲染 `planet.mesh` |
| **P2** | 主路径仍为 `renderer.render`；仅 planet 可见且 `uAlpha > 0.001` 时追加 bloom RT + 加法合成 |
| **P3** | 独立调试 API `window.__perlinBloom`，不复用 `__bloom.enable()` 全局语义 |
| **P4** | 全局 Bloom 开启时跳过 perlin 路径，避免双 composer 冲突 |
| **P5** | 光照开关：`uLightingEnabled`；关时输出 flat `baseCol`，默认开 |

---

## 3. 实现摘要

| 产出物 | 说明 |
| :--- | :--- |
| `perlinSelectiveBloom.ts` | layer mask、`createPerlinSelectiveBloom`、`PERLIN_BLOOM_DEFAULTS`、`shouldCompositePerlinBloom` |
| `perlinSelectiveBloom.spec.ts` | 默认常量与 composite 门控单测 |
| `scene.ts` | RAF 接入、`__perlinBloom`、resize/dispose |
| `perlin.frag.glsl` / `planet.ts` | `uLightingEnabled` + `PERLIN_LIGHTING_ENABLED_DEFAULT` |
| `scene.ts` | `__planetTerrace.perlinLightingEnabled` |

**Shipped Bloom 默认：** `enabled=true`, `strength=0.48`, `radius=0.38`, `threshold=0.82`。

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/three/perlinSelectiveBloom.spec.ts` | 2 passed |
| `npm run build -w frontend` | 通过 |
| 用户验收 | 通过 |

**Console：**

```js
__perlinBloom.log()
__perlinBloom.enabled = false
__planetTerrace.perlinLightingEnabled = false
```

---

## 5. 已知风险与后续

- **32.8** 全阶段视觉矩阵、lint 汇总与剩余风险记录
- 低性能设备上 focus 态每帧多一次 bloom composer + 加法 pass；若不稳可将 `PERLIN_BLOOM_DEFAULTS.enabled` 回退为 `false`（不影响 SDR 主亮度路径）
- Bloom 强度仍受 planet 亮度与 `threshold` 影响；与 `perlinLightingEnabled` / `perlinAmbient` 联动调参
