# Phase 39.2 / P39.2 评分到 Emission 领域函数实施报告

## 交付范围

本 TODO 建立 Focus 评分到 Emission 强度的领域边界，并把后续 Focus 外观所需的固定配置纳入可序列化视觉配置。未修改 shader、宏观 `colorMath`、locale，也未接通 39.3 的完整 `setFromMovie()` uniform 链路。

- 基线提交：`b685151eb492b6b307a87b7f86b0f932f21b99f9`
- Focus Lightness：`0.55`
- Focus Chroma：`0.15`
- Emission 候选端点：`0.06 / 0.6`
- 固定 Key Light：`1.0`
- visual defaults schema：`2`

Emission 端点仍是 39.8 人工视觉 Gate 的候选值，本 TODO 只锁定映射语义和配置归属。

## 领域函数

`frontend/src/three/planetAppearance.ts` 新增 `focusEmissionIntensityFromVoteAverage()`：

```text
t = clamp(voteAverage, 0, 10) / 10
emission = minIntensity + t * (maxIntensity - minIntensity)
```

函数只返回 Emission 标量，不读取宏观 Lightness，也不计算 Key Light。输入约束如下：

- `voteAverage` 和两个端点必须有限；
- 端点必须非负，且 `maxIntensity >= minIntensity`；
- 只有有限的越界评分会被 clamp；
- 评分 `0`、`10` 分别精确返回两个端点；
- 相等端点合法，可用于固定 Emission 诊断。

`frontend/src/three/planetAppearance.spec.ts` 覆盖 `0 / 5 / 10`、越界评分、线性、单调性、相等端点及全部快速失败分支，并断言该领域边界不调用 `lightnessFromVoteAverage()`。

## 视觉配置边界

`PLANET_VISUAL_DEFAULTS` 升级到 schema v2，新增可序列化的固定 Focus Lightness/Chroma、Emission 端点及固定 Key Light。`planetVisualConfigHashInput()` 继续序列化完整 defaults，因此这些配置已进入 visual hash 输入。

当前 shader 仍需要旧 `uAmbient = 0.06`。该值只作为 `createSelectionPlanet()` 内的私有过渡常量 `legacyShaderAmbientIntensity` 保留，没有进入共享 defaults 或 schema v2，避免把将在 39.3 删除的适配细节固化为视觉 SSOT。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm exec vitest run src/three/planetAppearance.spec.ts src/three/planetCore.spec.ts`（`frontend`） | 通过 |
| `npm test`（`frontend`） | 37 files，245 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过 |
| `git diff --check` | 通过 |

`npm run build` 仍提示仓库既有的 `frontend/public/data` 大文件超过 Cloudflare Pages 25 MiB，以及主 JS chunk 超过 500 kB；构建退出码为 0，本 TODO 未修改这些文件。