# Phase 39.4 / P39.4 Linear RGB Emission shader 实施报告

## 交付范围

本 TODO 只重构 Focus Perlin fragment shader 的颜色空间与受光合成，并新增 shader contract 测试。未修改 appearance、三入口、visual hash、视觉参数、Bloom 配置、locale 或 Reference。

- 基线提交：`09a73fdacf7e03aa6118b5a761321d9b28c5c767`
- Focus L/C、Emission 端点与固定 Key：沿用 P39.2–P39.3 配置
- 基础材质 smoke：沿用 P39.1 已通过的 `renderMode=basic` 路径

## Shader 数据流

`frontend/src/three/shaders/perlin.frag.glsl` 的生产路径现在为：

```text
genre hue + fixed L/C
  → OKLab
  → linear RGB band colors
  → per-fragment baseLinear
  → emissiveLinear + keyLitLinear
  → one final linear_to_srgb
  → gl_FragColor
```

线性空间合成公式为：

```glsl
vec3 emissiveLinear = baseLinear * uEmissionIntensity;
vec3 keyLitLinear = baseLinear * uKeyLightIntensity * lambert;
vec3 litLinear = emissiveLinear + keyLitLinear;
```

每个 genre band 先得到自己的 linear RGB，再按当前片元的 band 选择生成 `baseLinear`。Emission 和 Key 都使用这份最终局部底色，不存在白色 Emission、统一 genre 色或 band 合成前的中间色。

## 颜色边界与诊断行为

- OKLab 转 linear RGB 时只移除负通道，避免负值进入 gamma；不截断正 HDR 底色。
- Emission 与 Key 在线性空间相加后不做上限 clamp，保留 `>1` 结果供 selective Bloom 使用。
- `uLightingEnabled=0` 继续输出 flat `baseLinear` 诊断材质；开启和关闭共用同一个最终 `linear_to_srgb` 边界。
- fragment shader 只调用一次 `linear_to_srgb`，未引入 `colorspace_fragment`、ambient 重复项或第二条 sRGB 分支。
- 导数法线、几何法线混合、Hunt 色度保护、band 选择和 alpha 行为保持不变。

## Shader contract 测试

新增 `frontend/src/three/perlinLinearEmissionShader.spec.ts`，同时检查源码契约与 CPU 对照公式：

- 8 个 genre band 均在 linear RGB 中产生局部颜色；
- `baseLinear` 形成后才计算 Emission 与固定 Lambert Key；
- 线性合成发生在唯一一次 sRGB 转换之前；
- 不存在 ambient、sRGB base 乘 shade、二次颜色转换或 Bloom 前上限截断；
- `vote_average=0/5/10` 经 P39.2 领域函数得到受控 Emission；暗面与受光面都随评分单调不降；
- 固定 Key 项不随评分变化；输入通道不超过 1 时，最大 Emission + 固定 Key 仍可产生并保留 `>1` HDR 结果。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm exec vitest run src/three/perlinLinearEmissionShader.spec.ts src/three/planetAppearance.spec.ts src/three/planetCore.spec.ts`（`frontend`） | 3 files，31 tests passed |
| `npm test`（`frontend`） | 38 files，248 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过；TypeScript、Vite、SPA fallback 均成功 |
| `git diff --check` | 通过 |

`npm run build` 仍提示仓库既有的 `frontend/public/data` 大文件超过 Cloudflare Pages 25 MiB，以及主 JS chunk 超过 500 kB；构建退出码为 0，本 TODO 未修改这些文件。浏览器 GPU 视觉与 3000×3000 受控矩阵留待 P39.7–P39.8。