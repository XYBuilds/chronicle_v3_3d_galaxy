# Phase 41.5.4 Bloom OFF CDF + LUT 证据实施报告

## 结论

`p41.5.4-bloom-off-evidence` 已完成技术验收。`rating-midrank-cdf-lut-v1` 仍是诊断候选，证据状态保持 `pending-human-review`；本报告不将人工视觉 Gate 或父级 Phase 41.5 标记为通过。

## 实现

- 在 `tools/planet-exporter/scripts/generate-p41-midrank-cdf-lut-evidence.ts` 中新增独立证据生成入口。
- 从权威 `frontend/public/data/galaxy_data.json.gz` 的最终 `movies` 集合生成 201 点 midrank CDF LUT。
- 使用既有 7 个 P41.5 fixtures 和固定 Bloom OFF profile，覆盖 11 个 rating：`4.0/4.5/5.0/5.5/6.0/6.5/7.0/7.5/8.0/8.2/9.5`。
- 生成 77 个未缩放 PNG、77 个 sidecar、contact sheet、contact-sheet manifest、profile manifest 和 validation。
- 机器契约固定 `rating/emission` 为唯一允许变化字段，并校验 fixture、hue、seed、genres、geometry、camera、Lightness、Key、direction、flatShadingMix 与 Bloom 参数未变化。
- 保留 anchored smoothstep 历史目录 `data/runs/phase41/p41.5-emission-curve-bloom-off/`，未覆盖其原始 PNG、sidecar 或 manifest。
- CDF/LUT 仍隔离在诊断入口，未修改 `PLANET_VISUAL_DEFAULTS`、生产数据 schema、shader 或普通网站入口。

## 证据

目录：`data/runs/phase41/p41.5-midrank-cdf-lut-bloom-off/`

- 数据版本：`2026.07.18.daily.113`
- 电影数量：`61531`
- 权威 gzip SHA-256：`eb15d597479f4f46792c440ae6478ddade9ba1bd95cc623d0dd135e680c60cad`
- LUT：201 点，步长 `0.05`，范围 `0.0..10.0`
- emission 范围：`0.005..0.65`
- 固定视觉 profile：Lightness `0.66`、Key `0.45`、`flatShadingMix=0.8`、Bloom `OFF`
- validation 状态：`pending-human-review`
- validation 自动断言：权威 gzip、最终电影集合、LUT 有限值/单调/端点、fixture hash、PNG hash、manifest、Bloom OFF 与 rating/emission-only variation 均为 `pass`

## 验证命令

```text
npm test -w frontend -- phase41DiagnosticProfile.spec.ts focusEmission.spec.ts
npm test -w planet-exporter -- p41EmissionEvidence.test.ts
npm run typecheck -w planet-exporter
npm run lint -w planet-exporter
npm run lint -w frontend
npm run build -w frontend
npm run evidence:p41.5:cdf-lut -w planet-exporter
```

结果：前端 2 个测试文件共 21 个测试通过；exporter 6 个测试通过；类型检查与两端 lint 通过；前端构建、dist 检查与 SPA fallback 校验通过；证据生成成功并输出 7 行 × 11 列 × 77 格。前端构建同时报告仓库现有 `frontend/public/data/galaxy_data.json` 与 `.gz` 超出 25 MiB 部署提示，该提示不是本 TODO 引入的代码错误。

证据生成已在相同输入、profile 与 Git revision 下重复执行，并通过内部 byte-stable hash 校验。

## 后续门禁

`p41.5.5-human-gate` 仍需人工打开原始 PNG 和 contact sheet，重点检查 `4.5–5.5` 连续性、`5.5–7.5` 层级、`6.0–7.0` 主变化、`8.0+` 白核控制以及 `<=4.5` 的轮廓可读性。人工 Go/No-Go 前不得进入 41.6，也不得把诊断 LUT 写入生产默认配置。