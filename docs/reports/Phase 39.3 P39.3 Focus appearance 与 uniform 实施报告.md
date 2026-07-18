# Phase 39.3 / P39.3 Focus appearance 与 uniform 实施报告

## 交付范围

本 TODO 把 P39.2 的 Emission 领域函数接入 Focus appearance 和 material uniform，并切断 Focus 对宏观 galaxy Lightness runtime 参数的依赖。未实施 P39.4 的 linear RGB / 单次 sRGB 输出重构，也未调整视觉数值、Bloom、locale 或 Reference。

- 基线提交：`aab562fa951710aa0ab111389228035a8b01e7d0`
- 固定 Focus Lightness / Chroma：`0.55 / 0.15`
- 评分 Emission 端点：`0.06 / 0.6`
- 固定 Key Light：`1.0`

## Appearance 数据流

`resolvePlanetAppearance(movie, palette)` 现在是 Focus 外观的唯一解析边界：

```text
movie.vote_average ──> focusEmissionIntensityFromVoteAverage() ──> emissionIntensity
shared focus defaults ──> lightness / chroma / keyLightIntensity
movie + palette ──> genres / hues / bandCount / baseQuaternion
```

`PlanetGalaxyColorSnap` 已删除，生产代码不再 import 或调用宏观 `lightnessFromVoteAverage()`。`setFromMovie()` 只接收 `movie / palette / worldRadius`，并把校验后的 appearance 字段单向写入 material；uniform 写入处不再二次读取配置或重建评分映射。

## Uniform 与调用链

Focus material 使用以下契约：

- `uPerlinL`、`uPerlinChroma`：固定值；
- `uEmissionIntensity`：唯一由评分变化的外观 uniform；
- `uKeyLightIntensity`：固定主光；
- 旧 `uAmbient`、`uDiffuse` 和 P39.2 私有兼容常量已删除。

`perlin.frag.glsl` 本 TODO 只完成 uniform 接口适配，暂时仍在旧 sRGB 基础色路径计算 `baseCol * (Emission + Key * Lambert)`。逐片元 linear RGB 合成、HDR 保留和最终单次 `linear_to_srgb` 属于 P39.4。

网站 Focus、Cover 今日星球和静态导出均调用同一三参数 `setFromMovie()`。`scene.ts` 已移除每帧从 macro galaxy uniforms 向 Focus 同步 `uLMax / uHuntGamma / uHuntApplyMask` 的逻辑；Focus Hunt 参数只在 material 初始化时读取共享固定配置。

## 防御性验证与日志

`setFromMovie()` 写 uniform 前快速验证：

- L/C、Emission、Key 必须为有限数；
- L/C 和 Key 必须等于共享 Focus 配置；
- Emission 必须位于配置端点范围内。

`[Planet]` 日志记录 `vote_average`、固定 L/C、映射后的 Emission 和固定 Key，便于后续受控评分矩阵核对。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm exec vitest run src/three/planetAppearance.spec.ts src/three/planetCore.spec.ts src/planet-export/planetExport.spec.ts`（`frontend`） | 3 files，33 tests passed |
| `npm test`（`frontend`） | 37 files，245 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过；TypeScript、Vite、SPA fallback 均成功 |
| `git diff --check` | 通过 |

`npm run build` 仍提示仓库既有的 `frontend/public/data` 大文件超过 Cloudflare Pages 25 MiB，以及主 JS chunk 超过 500 kB；构建退出码为 0，本 TODO 未修改这些文件。