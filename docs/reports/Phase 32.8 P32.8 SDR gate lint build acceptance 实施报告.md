# Phase 32.8 / P32.8 SDR gate lint build acceptance 实施报告

## 1. 任务目标

执行 Phase 32 收尾验收：视觉矩阵手测签字、**lint / build / P32 单测**自动化门禁，并固化最终 SDR 参数与 perlin Bloom / macro-fade 策略记录。

对应计划：`.cursor/plans/phase_32_sdr_readability_motion.plan.md` · TODO `p32-tests-acceptance`（32.8）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **P1** | 全仓 `npm run lint -w frontend` 作为 32.8 硬门槛；7 项遗留 `react-hooks/*` 在本任务内一并消除 |
| **P2** | HUD 侧避免 `useEffect` 同步 `setState`：改用渲染期 state 同步（React 推荐模式）或派生常量 |
| **P3** | `perlinSelectiveBloom.spec.ts` 与 `PERLIN_BLOOM_DEFAULTS` SSOT 对齐，不改动 shipped 视觉默认 |
| **P4** | Phase 29/33 不变量未触碰：无 HDR 主路径、无全局 Bloom 默认开启 |

---

## 3. 实现摘要

| 类别 | 变更 |
| :--- | :--- |
| **验收修复** | `perlinSelectiveBloom.spec.ts`；`planet.ts` / `FocusSizeReferenceRings.ts` / `scene.ts` prefer-const |
| **Lint 清零** | `App.tsx` cover latch；`SearchBar.tsx` genre 清空；`CoverBackdrop` / `FullscreenButton` / `routes.ts` / `HdrProofLab` |
| **计划** | `phase_32_sdr_readability_motion.plan.md` 32.8 → completed |

### Shipped SDR 参数（32.4 SSOT，本任务未改）

| 通道 | 默认 |
| :--- | :--- |
| 宇宙背景 | `#000002` · `__galaxyUniverseBg` |
| idle near | enabled=1, start=20, width=10, minA=0.1 |
| idle Z | mode=-1, outsideA=0.5 |
| macro-fade | browsing=1 / focus=0 · SELECT **700ms** / DESELECT **450ms** |
| Perlin bloom | enabled=true, strength=**0.005**, radius=2, threshold=**0** · `__perlinBloom` |
| 选中自转 | ≤0.1 rev/s，轴倾斜 0–45° |

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run lint -w frontend` | 0 errors |
| `npm run build -w frontend` | 通过（`tsc -b` + `vite build`） |
| P32 vitest（6 文件 / 34 cases） | 全部通过 |
| 用户视觉矩阵 | 通过 |

```bash
npm run lint -w frontend
npm run build -w frontend
npm run test -w frontend -- src/three/universeBackground.spec.ts src/three/idleNearFade.spec.ts src/three/idleZFade.spec.ts src/three/sdrRuntimeTuning.spec.ts src/three/selectionPlanetRotation.spec.ts src/three/perlinSelectiveBloom.spec.ts
```

**Console 快速核对：**

```js
__sdrTuning.log()
__galaxyIdleMacroFade.blend
__perlinBloom.log()
```

---

## 5. 剩余风险

| 风险 | 说明 |
| :--- | :--- |
| **dist 体积** | 本地 build 仍提示 `galaxy_data.json` >25MiB（CI/R2 路径已知，非 P32 回归） |
| **Perlin threshold=0** | 极克制 strength 下仍可能在部分显示器偏亮；可用 `__perlinBloom` 手调 |
| **视觉矩阵** | 未纳入 CI；后续回归依赖手测或截图对比 |

---

## 6. Phase 32 结论

Phase 32（32.1–32.8）在 SDR 主路径下交付：背景 token、idle 宏观虚化 `focusDriver` 过渡、选中星球自转、perlin-only selective Bloom，且 **lint / build / P32 单测门禁通过**。HDR production 仍由 Phase 33 条件路径处理，不得覆盖本阶段 SDR 默认标定。
