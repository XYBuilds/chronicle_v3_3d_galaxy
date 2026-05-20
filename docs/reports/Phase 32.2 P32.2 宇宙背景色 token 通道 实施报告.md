# Phase 32.2 / P32.2 宇宙背景色 token 通道 实施报告

## 1. 任务目标

开放宇宙背景色 token 的开发期 runtime 修改通道，统一 CSS 变量、`THREE.Scene.background` 与 WebGL clear color，并为后续按交互驱动背景色变化预留来源优先级边界。

对应计划：[`.cursor/plans/phase_32_sdr_readability_motion.plan.md`](../../.cursor/plans/phase_32_sdr_readability_motion.plan.md) · TODO `p32-background-token-channel`（32.2）。

---

## 2. 关键决策

| ID | 决策 |
| :--- | :--- |
| **P1** | SSOT 常量 `COSMOS_UNIVERSE_BG_DEFAULT` + `UNIVERSE_BG_TOKEN`；CSS 根变量 `--cosmos-universe-bg` 与 TS 默认保持一致 |
| **P2** | `applyUniverseBackgroundColor` 一次写入三通道：CSS、`scene.background`、`renderer.setClearColor` |
| **P3** | 来源优先级：`runtime` (100) > `interaction` (10，预留) > `default` (0)；低优先级更新忽略并 `console.warn` |
| **P4** | 开发入口 `window.__galaxyUniverseBg`（`.color` / `.apply` / `.reset` / `.log` / `.source`）；成功 apply 默认打印 css/scene/clear |
| **P5** | 发布默认背景色定为 `#000002`（验收后相对纯黑 `#000000` 略抬 SDR 场域亮度，仍不引入 HDR/Bloom） |

---

## 3. 实现摘要

| 产出物 | 说明 |
| :--- | :--- |
| **`universeBackground.ts`** | token 解析/格式化、canonical hex、来源优先级、`UniverseBgTargets` |
| **`universeBackground.spec.ts`** | 解析、三通道同步、优先级、reset（4 cases） |
| **`scene.ts`** | 启动 `applyUniverseBackgroundColor(readUniverseBgHex(), { scene, renderer })`；`__galaxyUniverseBg` 绑定双目标 |
| **`index.css`** | `--cosmos-universe-bg: #000002` |

**Console 示例：**

```js
__galaxyUniverseBg.color = '#0a1628'
__galaxyUniverseBg.log()
__galaxyUniverseBg.reset()
```

---

## 4. 验证

| 检查 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/three/universeBackground.spec.ts` | 4 passed |
| `npm run build -w frontend` | 通过 |
| `npm run lint -w frontend` | 仓库既有 eslint 报错（非本任务引入） |

---

## 5. 已知风险与后续

- **32.4** 将把本通道与 idleZFade 调试入口一并整理，并把验收后的参数固化说明写入计划/默认值文档。
- 未来 `interaction` 源驱动背景色时，须在 `applyUniverseBackgroundColor(..., { source: 'interaction' })` 调用；开发期 `runtime` 仍可覆盖以便手调。
- 未改 UMAP、拾取半径、相机或 Bloom 路径。
