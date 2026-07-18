# Phase 39.9 / P39.9 隔离固定 Key、验证 cubic Emission 与重建候选矩阵 实施报告

## 交付范围

P39.8 首轮人工 Gate 的结论为 No-Go：低分星球过亮，低分与高分的直觉亮度差异不足。P39.9 按单变量顺序隔离 fixed Key 和 Emission 曲线，生成 A/B/C/D 候选，并将通过技术验收的 cubic 曲线作为下一轮 P39.8 候选。

本 TODO 不批准 P39.8，不更新最终状态机或视觉映射文档，也不把候选参数写成最终视觉定稿。

- 基线提交：`93f2be0bef7980f9c6bc713bae246dc4de675afd`
- 受控电影：TMDB `157336`
- 评分：`0/4/5/10`
- data version：`phase39-contract-baseline-v1-p39.7-controlled`
- ignored 证据目录：`data/runs/phase39-p39.9/`

## A/B/C/D 单变量诊断

| 候选 | Emission | fixed Key | 用途 |
| --- | --- | ---: | --- |
| A | linear | `1.0` | P39.7 行为基线 |
| B | linear | `0.0` | 只隔离 Key |
| C | cubic | `0.0` | 只比较曲线 |
| D | cubic | `1.0` | 最终生产候选 |

独立 sidecar 比较结果：

- A → B 只改变 `key_light.intensity`；
- B → C 只改变 `emission` 与 `emission_curve`；
- C → D 只改变 `key_light.intensity`；
- movie、genres、band、geometry、固定 Lightness/Chroma、noise、seed、pose、rotation、camera、padding 与 size root 均未变化；
- Key OFF 只存在于 ignored 诊断导出，没有进入生产 API、visual defaults 或运行时开关。

`data/runs/phase39-p39.9/candidate-validation.json` 保存结构化校验结果。观察用联系表为：

- `data/runs/phase39-p39.9/review/abcd-emission-key-matrix.png`，1812×1982；
- `data/runs/phase39-p39.9/review/d-cubic-bloom-matrix.png`，1812×1022。

联系表和原始导出均受 `.gitignore` 保护，不进入提交。

## cubic Emission 候选

生产公式为：

\[
t = \frac{\operatorname{clamp}(rating, 0, 10)}{10}
\]

\[
E = 0.06 + t^3 \times 0.54
\]

| 评分 | cubic Emission | 原 linear Emission |
| ---: | ---: | ---: |
| 0 | `0.06` | `0.06` |
| 4 | `0.09456` | `0.276` |
| 5 | `0.1275` | `0.33` |
| 10 | `0.60` | `0.60` |

有限评分先 clamp，再计算 power curve。`0/10` 精确保持既有端点；`4/5` 相对 linear 明显降低；`0 < 4 < 5 < 10` 对应的 Emission 严格单调。非有限评分、非有限端点、负端点、反向端点，以及非有限或 `<= 0` 的 exponent 均快速失败。

fixed Key 保持开启且强度为 `1.0`。固定 OKLab Lightness `0.55`、Chroma `0.15`、genre band、Bloom 配置和颜色空间流程未改动。本轮证据不支持继续调整 Lightness。

## appearance、diagnostics 与 visual hash

评分曲线仍只定义在 `focusEmissionIntensityFromVoteAverage()`。`resolvePlanetAppearance()` 读取共享 defaults，输出 Emission 结果、curve model/exponent/端点与 fixed Key；网站 Focus、Cover 和静态导出继续通过 `setFromMovie()` 消费同一 appearance 数据流。

`PLANET_VISUAL_DEFAULTS.schemaVersion` 从 `3` 升至 `4`，Emission 配置为：

```text
modelVersion = vote-average-power-clamped-v1
exponent = 3
intensityMin = 0.06
intensityMax = 0.60
```

model、exponent 和端点均进入完整 visual config/hash。候选 hash 为：

| 候选 | visual config hash |
| --- | --- |
| A | `748268843d6be3153c97e3f8a39d3d53a10239a0f3c70a67f449b8fd3322763a` |
| B | `d739c08de028ddf60dca6a54d84f099a4f3a0ebf95089352c72f14134ae0d982` |
| C | `753e6bfff0a07fee05e550d7e3eb9c32c9ecfba4edef2e6eba8a55bb09c4c992` |
| D | `4162c5251898dd5dff64173d262c22e26fae82856570468d178bf3faf1d6754c` |

静态导出 diagnostics 从 planet 已解析的最终 appearance 读取 `emission_curve`，不重算评分逻辑。exporter parser 会拒绝缺失/null curve、空 model version、非有限或非正 exponent、非有限端点、负最小值和反向范围。

shader 合同未改变：Emission 使用最终逐片元 `baseLinear`；fixed Key 仍为 linear RGB Lambert 主光；HDR 正值不截断；末端只执行一次 linear → sRGB。

## 导出证据

`data/runs/phase39-p39.9/exports/` 保留 21 份 3000×3000 PNG 及对应 sidecar：

- A：`0/4/5/10`，Bloom OFF，共 4 份；
- B：`0/4/5/10`，Bloom OFF，共 4 份；
- C：`0/4/5/10`，Bloom OFF，共 4 份；
- D：`0/4/5/10`，Bloom OFF/ON，共 8 份；
- D、评分 4、Bloom OFF 重复导出 1 份。

独立批量校验结果：

- 21 份 PNG 均为 3000×3000 RGBA，存在可见内容；按 P39.7 的 alpha `>1` 可见边界口径，内容未触碰画布边缘，边缘仅允许既有 Bloom alpha `1/255` 尾迹；
- 每份 sidecar 的 resolution、diagnostics 与 `png_sha256` 均和实际 PNG 一致；
- D 的相同评分 Bloom OFF/ON diagnostics 完全一致；
- D、评分 4、Bloom OFF 的两次 PNG SHA-256 均为 `6e04fe6764d14c15d452ccf97996719cc9a077cac227fbb1023ead8baa620790`；
- A/B/C/D 的单变量关系、cubic 单调性及 `0.06/0.60` 端点全部通过。

P39.7 原始目录、fixture、PNG 和 sidecar 未被覆盖或删除。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm test -- src/three/planetAppearance.spec.ts src/three/planetCore.spec.ts src/three/perlinLinearEmissionShader.spec.ts src/planet-export/planetExport.spec.ts src/planet-export/visualConfig.spec.ts`（`frontend`） | 5 files，49 tests passed |
| `npm test -- src/browser.test.ts src/phase39Fixtures.test.ts`（`tools/planet-exporter`） | 2 files，19 tests passed |
| `npm test`（`frontend`） | 37 files，252 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过；TypeScript、Vite、文件检查与 SPA fallback 成功 |
| `npm test`（`tools/planet-exporter`） | 7 files，47 tests passed |
| `npm run typecheck`（`tools/planet-exporter`） | 通过 |
| `npm run lint`（`tools/planet-exporter`） | 通过 |
| 21 份 PNG/sidecar 独立校验 | 通过 |
| `git diff --check` | 通过 |

前端构建仍报告仓库既有的主 JS chunk 超过 500 kB，以及 `frontend/public/data/galaxy_data.json`、`galaxy_data.json.gz` 超过 Cloudflare Pages 25 MiB。构建退出码为 0；P39.9 未修改这些数据文件。

## Gate 边界

P39.9 技术验收完成，只说明候选构造、单变量隔离和导出合同成立。P39.8 继续保持 pending，首轮 No-Go 结论不变。下一轮必须由用户查看候选联系表和运行时效果后明确给出 Go/No-Go；在此之前不更新最终参数文档，不宣称 Phase 39 视觉 Gate 已通过。