# Phase 41.5.5 Rating Emission 人工 Gate 报告

## Gate 结论

用户明确输入 `go`，批准 `rating-midrank-cdf-lut-v1` 的 Bloom OFF 人工视觉 Gate。`p41.5.5-human-gate` 通过，Phase 41.5 可将该候选作为后续 41.6 Bloom ON 联调的诊断输入。

这次 Go 只批准当前候选的 rating→emission 视觉规则，不代表 monthly refit、生产 schema、三端发布契约或生产默认切换已经完成。

## 人工验收对象

- Contact sheet：`data/runs/phase41/p41.5-midrank-cdf-lut-bloom-off/contact-sheet.png`
- 原始单格目录：`data/runs/phase41/p41.5-midrank-cdf-lut-bloom-off/cells/`
- 候选：`rating-midrank-cdf-lut-v1`
- 状态输入：用户明确 `go`
- 视觉状态：Bloom `OFF`

验收范围覆盖 `4.0/4.5/5.0/5.5/6.0/6.5/7.0/7.5/8.0/8.2/9.5` 与全部 7 个 P41.5 fixtures。人工重点检查项为 `4.5–5.5` 连续性、`5.5–7.5` 层级、`6.0–7.0` 的主要变化、`8.0+` 白核控制，以及 `<=4.5` 的低分轮廓可读性。

## 技术复核

真实 Worker 完成只读复核，主 Agent 接受结果：

- 候选 77/77 PNG 与 77/77 sidecar 存在，PNG SHA-256 全部匹配。
- 历史 anchored smoothstep 基线 49/49 PNG 与 sidecar 存在，原始 hash 未被覆盖。
- 权威输入为 `frontend/public/data/galaxy_data.json.gz`，版本 `2026.07.18.daily.113`，电影数量 `61531`，SHA-256 为 `eb15d597479f4f46792c440ae6478ddade9ba1bd95cc623d0dd135e680c60cad`。
- LUT 为 `0..10`、201 点、步长 `0.05`、线性插值；emission 范围为 `0.005..0.65`。
- 固定 profile 仍为 Lightness `0.66`、Chroma `0.15`、Key `0.45`、`flatShadingMix=0.8`、固定方向和 Bloom OFF。
- 自动断言仍证明有限值、单调性、端点、fixture hash、contact sheet/manifest hash 与仅 `rating/emission` 变化。
- 生产默认仍为 anchored smoothstep；未接入 `PLANET_VISUAL_DEFAULTS`、生产 Meta schema、shader、运行时生产查表或普通网站入口。

## 验证

```text
npm test -w frontend -- phase41DiagnosticProfile.spec.ts focusEmission.spec.ts
npm test -w planet-exporter -- p41EmissionEvidence.test.ts
npm run typecheck -w planet-exporter
```

结果：前端 2 个测试文件、21 个测试通过；exporter 6 个测试通过；exporter typecheck 通过。

## 后续边界

- 允许进入 41.6 Bloom ON 联调，但仍只作为当前诊断候选输入。
- monthly refit、LUT 生产化写入、数据 schema、网站/exporter/diagnostics 三端统一消费、月间漂移检测和失败保护必须另立后续 Phase。
- 不修改或删除 anchored smoothstep 历史证据。