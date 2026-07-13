# Phase 36.2 / P36.2 Shared Planet Core 实施报告

## Scope

本报告对应 Phase 36 的 TODO `p36-shared-planet-core`（36.2）。交付范围仅限网站 focus 星球与后续导出器共用的视觉默认值、外观解析和半径计算，以及网站消费这些模块的重构与测试。

未涉及无 UI 导出页面、`tools/planet-exporter`、根 `package.json`、Phase 计划文件或 36.1 报告。

## Implementation

- 新增可序列化的 `PLANET_VISUAL_DEFAULTS`，集中 geometry、active shell、noise、色带、阶梯、颜色、Lambert 光照与材质默认值，并提供稳定 JSON hash 输入。
- 新增纯外观模块：保留 TMDB movie ID 的噪声 seed、题材色带、评级亮度与 `selectionPlanetBaseQuaternion()` 的确定性姿态。
- 新增纯尺寸模块：统一 active shell 基础半径、题材阶梯外扩和实际外接半径；`screenRadius.ts` 改为消费同一计算，避免网站拾取/选择半径与导出尺寸漂移。
- `createSelectionPlanet()` facade 保持不变，仍使用正式 Perlin Shader；其 uniforms、scale、outer radius 和 quaternion 改由共享模块驱动。
- `galaxyMeshes.ts` 从共享默认值初始化题材颜色与 Hunt 参数，同时保留既有 `DEFAULT_GALAXY_U_*` re-export，避免已有消费者回归。
- 增加默认值快照、movie ID 可重复性、姿态、题材层数外接半径、facade 对齐及临界 off-slab 回退测试。

## Verification

| 命令 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- planetCore.spec.ts` | Pass — 1 test file、10 tests passed。 |
| `npm run test -w frontend` | Pass — 36 test files、223 tests passed。 |
| `npm run lint -w frontend` | Pass — ESLint completed with exit code 0。 |
| `npm run build -w frontend` | Pass — TypeScript、Vite、产物大小检查和 SPA fallback 检查均以 exit code 0 完成。 |

补充审查：比较重构前后默认 uniforms、shader/material 配置、movie ID 噪声序列和 base quaternion；未发现意图外的行为变更。审查中发现 `galaxyMeshes.ts` 意外移除了公开的 `DEFAULT_GALAXY_U_*` re-export，已在本 TODO 内恢复并由完整验证覆盖。构建仍输出已有的大型本地 `public/data/galaxy_data.json(.gz)` 超过 Cloudflare 25 MiB 限制及 bundle 大小警告，但构建成功，且该数据/打包警告不由本 TODO 引入。

## Technical Debt & Caveats

- 36.2 只建立共享核心；正交相机、透明 PNG、Bloom 与 Playwright 调用边界由后续 36.3/36.4 实现。
- `screenRadius.ts` 的半径计算继续读取运行时 active material uniforms；默认导出路径改由 `PLANET_VISUAL_DEFAULTS.activeShell` 使用相同公式，页面运行时调参不被隐式带入导出。
- 全量前端验证已通过；构建警告来自工作树中已有的大型本地 galaxy 数据和现有 chunk 大小，并未由本 TODO 改动造成。