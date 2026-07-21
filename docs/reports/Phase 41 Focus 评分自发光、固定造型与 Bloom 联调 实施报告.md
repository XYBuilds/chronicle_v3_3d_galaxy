# Phase 41 Focus 评分自发光、固定造型与 Bloom 联调实施报告

## 结论

`p41.8-production-gate` 已通过人工 Go。用户审查了更新后的两张最终 contact sheet，并批准 `rating-midrank-cdf-lut-v1` 作为最终生产评分自发光曲线。

本次 Go 同时锁定以下生产契约：

- 评分只影响 `emission`；Lightness、Chroma、Key、方向、`flatShadingMix` 和 Bloom 参数不随电影变化。
- 生产评分曲线为 `rating-midrank-cdf-lut-v1`。
- 生产 Bloom 合成仍为 `pure-bloom-delta-v1`。
- 诊断 override 仍仅允许出现在带 `diagnostic_only: phase41-visual-diagnostic-v1` 标记的离线入口。

## 生产 CDF 曲线

生产 profile 位于 `frontend/src/three/productionFocusEmissionProfile.ts`，由 P41.5 已批准的 CDF/LUT 证据冻结而来，不在网站运行时重新读取 gzip，也不把全量电影数据打入前端。

- 权威输入：`frontend/public/data/galaxy_data.json.gz`
- 数据版本：`2026.07.18.daily.113`
- 电影数量：`61531`
- 权威 gzip SHA-256：`eb15d597479f4f46792c440ae6478ddade9ba1bd95cc623d0dd135e680c60cad`
- rating 域：`0..10`
- LUT：201 点，步长 `0.05`
- 插值：线性插值
- emission 域：`0.005..0.65`
- 曲线 SHA-256：`d3c434c9ccb4e2e520edc4d5a8e1cb7a2d7842d42800cd225ab6482fbaa91d6d`
- profile manifest SHA-256：`e5b81ec89f6482c99e6878af4d602171f025b4940fa865e21257a27b206f26de`

历史 anchored smoothstep 保留在 P41.5 历史证据和诊断兼容路径中，但不再是生产默认曲线。

## 三端统一

`PLANET_VISUAL_DEFAULTS` 升级为 schema 9，并嵌入生产 CDF profile。以下三端均从同一生产 SSOT 解析曲线和 visual config hash：

1. 网站 Focus。
2. 普通 planet exporter。
3. 无 override 的 diagnostics。

普通请求不接受 `diagnostic_only`、`profile` 或视觉候选参数。诊断入口可以显式覆盖曲线或 Bloom，但其 resolved hash 带有诊断 provenance，不会改变生产 hash。

固定造型参数保持：

- Lightness `0.66`
- Chroma `0.15`
- Key intensity `0.45`
- direction `[0.700665949127905, 0.4003805423588029, 0.5905612999792342]`
- `flatShadingMix = 0.8`
- 生产 Bloom ON：`enabled=true, strength=0.01, radius=1, threshold=0`

## 最终视觉证据

两组证据均由 `npm run evidence:p41.7 -w planet-exporter` 生成，原始单格 PNG 均为 `3000×3000`。

### 受控评分 Bloom OFF/ON

- 目录：`data/runs/phase41/p41.7-final-controlled-bloom-off-on/`
- 14 个 cell：同一电影覆盖 `4.0/4.5/5.5/6.5/7.5/8.2/9.5`，每个评分各有 Bloom OFF/ON。
- OFF visual config hash：`f7081e1d97220541aa13d3b818092d45bfb57ba2bcd5216140e1cbc8f31aadf7`
- ON visual config hash：`24eec62c1a05dc2a03cea43827cf74815565f3bcf46c544d4f344fd372dc8429`

### 真实生产样本 Bloom ON

- 目录：`data/runs/phase41/p41.7-final-real-bloom-on/`
- 5 个样本：真实低分、中段、高分、人口密集区和高分低票异常。
- 5 个样本均使用生产 Bloom ON 和生产 CDF profile。

每组均包含 contact sheet、contact-sheet manifest、validation、原始 PNG 和 render sidecar。机器 validation 保持 `pending-human-review`，用于保留机器校验与人工 Go 的边界；本报告记录人工 Go 结论。人工抽查通过后，p41.8 生产状态锁定。

## 验证

- `npm run test -w frontend`：40 个测试文件、277 个测试通过。
- `npm run lint -w frontend`：通过。
- `npm run build -w frontend`：通过；仅保留仓库既有的大数据文件 Cloudflare Pages 体积警告。
- `npm run test -w planet-exporter`：22 个测试文件、149 个测试通过。
- `npm run typecheck -w planet-exporter`：通过。
- `npm run lint -w planet-exporter`：通过。
- `git diff --check`：通过。
- 独立证据核对：19 个 PNG、19 个 sidecar，全部 `3000×3000`；所有 sidecar 为 CDF；所有 `diagnostic_override` 为空；两组 validation 的 cell/hash/完整性断言通过。

## 计划收口

canonical Plan 中 `p41.8-production-gate` 已更新为 `completed`。本报告与该 Plan 状态、生产实现和最终证据属于同一 TODO 交付范围。