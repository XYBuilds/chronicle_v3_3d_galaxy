# Phase 39.5 / P39.5 三入口与 visual hash 实施报告

## 交付范围

本 TODO 将网站 Focus、Cover 今日星球与静态导出的最终 Focus 视觉契约收敛到同一生产路径，并把 Emission/color pipeline 的版本与固定参数纳入可复现 hash。未删除后续 P39.6 负责的 Reference，也未执行 P39.7 的 3000×3000 导出矩阵。

- 基线提交：`78d461ef9afc84d981bb639a7bcc29af4a7f335a`
- 视觉参数：沿用 P39.2–P39.4 已验收的固定 Lightness/Chroma、Emission 端点与固定 Key Light
- Shader：沿用 P39.4 已验收的 linear RGB 局部底色 Emission 管线

## 三入口共享契约

三个生产入口继续只通过 `createSelectionPlanet()` 创建星球，并以相同三个参数调用 `setFromMovie(movie, genreById, genrePalette)`：

```text
Movie
  → resolvePlanetAppearance()
  → PlanetAppearance
  → setFromMovie()
  → shared uniforms
  → website Focus / Cover / static export
```

入口 contract 测试明确禁止以下分叉：

- 入口直接 import 或读取 `PLANET_VISUAL_DEFAULTS`；
- 入口自行调用评分到 Emission 的映射函数；
- 入口自行写入 `uPerlinL`、`uPerlinC`、`uEmissionIntensity` 或 `uKeyLightIntensity`；
- 入口复制 Emission 端点、pipeline version 或 shader conversion 逻辑。

因此入口只提供电影与 genre 数据，固定配置、评分映射和 uniform 写入仍分别归属于 defaults、appearance 与 planet 模块。

## Visual hash schema v3

`planetVisualConfigHashInput()` 升级为 schema v3。输入显式包含：

- 固定 Focus `lightness`、`chroma`；
- Emission `intensityMin`、`intensityMax`；
- 固定 `keyLight.intensity`；
- Emission 模型版本；
- OKLab → linear RGB、逐片元局部底色 Emission、linear RGB Emission + Key 合成、最终单次 linear → sRGB 的 pipeline 版本；
- 既有大小、几何、旋转、姿态、Bloom 与 genre palette 配置。

实现期间删除了候选字段 `voteAverageRange`：生产领域函数仍明确使用 TMDB 的固定 `0..10` 契约，让一个不驱动运行时行为的字段进入 hash 会形成伪 SSOT。schema v3 只保留真实驱动视觉行为的参数，或明确标记算法边界的版本字段。

## 页面配置与 SHA-256

新增唯一生产构造函数 `planetExportVisualConfigInput(planetVisualConfigInput, exportSizeRoot)`，由静态导出页面与测试共同使用。页面级输入固定为：

```text
planet visual config + export size root
  → planetExportVisualConfigInput()
  → canonical JSON
  → SHA-256
```

测试不再复制页面 JSON wrapper，并锁定：

- 相同生产输入重复计算得到完全相同的 SHA-256；
- schema/pipeline 版本化后的输入与旧版 hash 不同；
- `exportSizeRoot` 与完整 planet visual input 都进入页面配置；
- 浏览器 exporter 继续从页面读取 hash，并将其写入导出 metadata。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm exec vitest run src/three/planetCore.spec.ts src/three/perlinLinearEmissionShader.spec.ts src/planet-export/planetExport.spec.ts src/planet-export/visualConfig.spec.ts`（`frontend`） | 4 files，定向测试通过 |
| `npm test`（`frontend`） | 39 files，252 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过；TypeScript、Vite、文件检查与 SPA fallback 均成功 |
| `npm test`（`tools/planet-exporter`） | 6 files passed |
| `npm run typecheck`（`tools/planet-exporter`） | 通过 |
| `npm run lint`（`tools/planet-exporter`） | 通过 |
| `git diff --check` | 通过 |

`npm run build` 仍提示仓库既有的 `frontend/public/data` 大文件超过 Cloudflare Pages 25 MiB，以及主 JS chunk 超过 500 kB；构建退出码为 0，本 TODO 未修改这些大数据文件。3000×3000 实际导出与 metadata/hash 一致性矩阵留待 P39.7。