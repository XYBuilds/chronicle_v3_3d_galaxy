# Phase 41 · P41.1 基线冻结与 Fixtures 实施报告

## 结论

P41.1 已完成技术验收。权威数据、统计摘要和 Phase 41 fixtures 均通过可复现生成器产出；未执行视觉人工 Gate，也未推进后续 TODO。

## 实现

- 新增 `tools/planet-exporter/src/phase41Baseline.ts`。
  - 只接受 `frontend/public/data/galaxy_data.json.gz`，校验 gzip magic、JSON 结构、电影数量、唯一 TMDB ID、完整字段以及有限数值。
  - 拒绝未压缩 JSON 和非权威输入路径。
  - 生成确定性的 rating/vote_count 分布摘要，包含 min/max、P50/P90/P99、`4.5–7.5` 数量和 `>=9` 数量。
  - 生成 7 个受控评分 fixture：`4.0/4.5/5.5/6.5/7.5/8.2/9.5`；每个 fixture 只含一部完整电影，并保留源电影字段。
  - 生成 7 个真实代表样本，覆盖 hue、xmur3 seed、类型数量和高分低票异常；选择规则带 TMDB ID 稳定 tie-break。
  - 记录 P39.11 production config 以及既有 Bloom ON baseline PNG 的路径、sidecar 和 SHA-256。
  - 使用临时文件原子写入 baseline evidence。
- 新增 `tools/planet-exporter/scripts/generate-p41-baseline.ts` 和 `npm run evidence:p41.1`。
- 新增 `phase41Baseline.test.ts`，覆盖输入边界、摘要稳定性、fixture 完整性、选择确定性和重复生成结果。
- 将新模块纳入 `tsconfig.check.json`。

## 冻结结果

输入：`frontend/public/data/galaxy_data.json.gz`

- data version：`2026.07.18.daily.113`
- SHA-256：`eb15d597479f4f46792c440ae6478ddade9ba1bd95cc623d0dd135e680c60cad`
- 电影数：`61,531`
- rating：`1.222–10`，P50 `6.3`，P90 `7.3`，P99 `8.1`
- rating `4.5–7.5`：`55,270`
- rating `>=9`：`53`
- vote_count：`3–40,311`，P50 `61`，P90 `715`，P99 `7,342`

P39.11 既有基线 PNG：

- 路径：`data/runs/phase39-p39.11/final/controlled-rating-5-bloom-on.png`
- SHA-256：`dcb5a721094808219b90ecd930c310301bc4c323ea474a4a097644485636cd08`

运行时证据目录为 `data/runs/phase41/baseline/`，由仓库忽略规则排除，不将大型 PNG 或派生 fixture 二进制提交到 Git。需要重现时使用同一权威 gzip 执行 `npm run evidence:p41.1`。

## 验证

在 `tools/planet-exporter` 执行：

- `npm test`：14 个测试文件、100 个测试通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `npm run evidence:p41.1`：通过，并得到上述相同 source SHA、版本、电影数和统计值。

## 范围边界

未实现 contact-sheet、诊断 profile、emission 曲线或 Bloom 联调；这些属于 P41.2–P41.8。未读取 raw CSV，未调用真实服务，未执行生产操作。