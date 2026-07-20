# Phase 41.3 / P41.3 通用视觉诊断 profile 与不变量实施报告

## 交付范围

P41.3 建立了与普通生产导出物理隔离的 Phase 41 视觉诊断链路，用于后续单变量视觉 Gate。该 TODO 只提供诊断 profile、完整运行时 sidecar 与不变量校验，不执行 P41.4 的光线、Lightness 或 Key 人工择优，也不修改生产视觉默认值。

- 基线提交：`d2e1017`
- 诊断标记：`phase41-visual-diagnostic-v1`
- 固定约束：`flatShadingMix = 0.8`
- 生产配置来源：`PLANET_VISUAL_DEFAULTS`

## 隔离架构

诊断链路使用独立页面 `frontend/phase41-diagnostics.html`、独立请求解析器和独立 exporter adapter。视觉 override 只能通过带 `diagnostic_only=phase41-visual-diagnostic-v1` 的 `profile` JSON 进入诊断页面：

```text
Phase 41 evidence generator
  → renderPhase41DiagnosticInBrowser()
  → phase41-diagnostics.html
  → parsePhase41DiagnosticRequest()
  → resolvePhase41VisualProfile()
  → renderPhase41DiagnosticPlanetImage()
  → PNG + validated runtime diagnostics
```

普通 `planet-export.html`、`parsePlanetExportRequest()`、普通 exporter CLI 和普通 URL 构造器均不接受或转发诊断 marker、profile 或 Bloom strength override。普通 CLI 明确拒绝 `--bloom-strength`，防止 CLI 接受但网页拒绝的半开放状态。

历史 P39 checkpoint 不再借用普通生产渲染 API。它们通过显式 legacy/diagnostic render boundary 保持可复现性，不会把候选参数重新暴露给普通请求。

## Profile 与校验合同

单一 Phase 41 profile 可覆盖：

- emission curve：现有 power 模型或后续 anchored smoothstep 模型；
- Focus Lightness；
- Key light intensity；
- 归一化后的世界空间 light direction；
- Bloom `enabled/strength/radius/threshold`。

解析器执行 exact-key 和有限值校验，拒绝未知字段、空 override、NaN/Infinity、非法强度区间、非法评分锚点、零方向向量及越界 Bloom 参数。`chroma`、`flatShadingMix`、生产来源与生产 visual-config input 保持冻结，不能由 profile 覆盖。

无 override 时，resolved profile 直接继承生产 SSOT，`resolvedVisualConfigInput` 与生产配置输入一致。Bloom ON/OFF 由请求状态决定：sidecar 的 effective `profile.bloom.enabled` 与实际渲染诊断一致，同时不改写生产 visual-config hash 输入。有 override 时，Bloom profile 状态必须与请求状态一致，且 resolved visual input 记录 marker、完整 profile 与 override provenance。

## Sidecar 与单变量不变量

渲染 diagnostics 记录实际运行时值，而不是只回显请求：

- movie/rating、resolved emission 和完整 emission curve；
- Lightness、Chroma、Key direction/intensity、`flat_shading_mix`；
- Bloom 开关、`pure-bloom-delta-v1` 合成版本及实际参数；
- world/outer radius、camera frustum/pose；
- noise seed、octaves、scale、persistence；
- base quaternion、seeded spin axis、rotation speed；
- production/resolved visual-config input 与 override provenance。

exporter 在接收页面结果时再次校验 sidecar，并逐项比较 resolved profile 与实际 renderer diagnostics。曲线、Bloom、固定造型、camera、seed 或 rotation 任一不一致都会拒绝证据。

矩阵断言要求每次实验声明唯一允许变化的字段；未声明变量变化立即失败。rating 行进一步限定只能变化 `rating/emission`，并要求两者确实同时发生变化。

## P39.10 兼容适配器

移除普通 `--bloom-strength` 后，P39.10 文档中的 Bloom ON、`strength=0` 纯增量证明改由独立历史适配器恢复：

- 独立页面：`frontend/p3910-bloom-strength-zero-diagnostics.html`；
- 独立 marker：`p3910BloomStrengthZero=0`，只接受 TMDB `157336`、Bloom ON、shader mode；
- 固定实际参数：`enabled=true, strength=0, radius=1, threshold=0`；
- `render-p3910-matrix.ts` 为 rating `0/4/5/10` 生成 `planet-rating-*-bloom-on-strength-zero.png` 及对应 `.render.json` sidecar。

该适配器只服务历史证据生成，不进入普通 CLI/request/browser URL。集成测试确认 PNG 可生成，sidecar 记录的实际 strength 为 `0`，并使用独立历史 visual-config input。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm test`（`frontend`） | 39 files，266 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过 |
| `npm test`（`tools/planet-exporter`） | 18 files，116 tests passed |
| `npm run typecheck`（`tools/planet-exporter`） | 通过 |
| `npm run lint`（`tools/planet-exporter`） | 通过 |
| `npx vitest run src/phase41Diagnostic.integration.test.ts`（`tools/planet-exporter`） | 1 file，1 test passed |
| `npx vitest run src/p3910BloomStrengthZero.integration.test.ts`（`tools/planet-exporter`） | 1 file，1 test passed |
| `git diff --check` | 通过 |

前端构建退出码为 `0`。构建仍报告仓库既有的主 JS chunk 超过 500 kB，以及 `frontend/public/data/galaxy_data.json`、`galaxy_data.json.gz` 超过 Cloudflare Pages 25 MiB；P41.3 未修改这些数据文件。

## 阶段边界

P41.3 只完成诊断基础设施与隔离合同。P41.4 及后续人工视觉 Gate 未开始，所有生产视觉常量保持现状。