# Phase 41.6 Bloom ON 手工联调 Gate 实施报告

## 结论

P41.6 Bloom ON 手工联调 Gate 已通过。人工批准 `v5-high-strength` 作为本 TODO 的 Bloom 诊断候选，进入后续 P41.7 三端契约与回归验证。

该批准不等于生产参数已经锁定。P41.6 未修改生产视觉 SSOT、schema、shader、普通渲染入口或网站运行时 Bloom 默认值。

## 批准候选

- 候选 ID：`p41.6-cdf-lut-high-strength-bloom-candidate-v5`
- 来源 profile：`rating-midrank-cdf-lut-v1`
- Bloom OFF：`enabled=false, strength=0.01, radius=1, threshold=0`
- Bloom ON：`enabled=true, strength=0.12, radius=0.35, threshold=0.2`
- 对照候选 v4：`strength=0.05, radius=0.35, threshold=0.2`
- 合成契约：`pure-bloom-delta-v1`

P41.6 全局舍弃 `1.25` 的 ON/OFF core luma ratio 硬契约。`on_to_off_mean_luma_ratio` 继续作为诊断统计记录，但不再作为候选拒绝条件；核心可见信号、alpha 核心像素、正亮度增量、halo 以及 OFF/ON 仅 Bloom 变量变化等证明仍保留。

## 证据与机器验收

v4 和 v5 均从权威 `frontend/public/data/galaxy_data.json.gz` 生成，每套矩阵为 `7 × 11 × 2 = 154` 个 cell：

- 154 个原始 PNG
- 154 个 render sidecar
- manifest 记录 154 个 source
- contact sheet、manifest、PNG 与 sidecar hash 校验通过
- `authoritative_gzip`、`cell_hashes`、`contact_sheet_complete`、固定 fixture 参数、`off_on_only_declared_bloom_variation`、`pure_bloom_delta_core`、`rating_emission_only_by_row` 全部为 `pass`
- 原始 `validation.json` 保持 `pending-human-review`，用于区分机器验证状态与本报告记录的人工 Go

证据目录：

- `data/runs/phase41/p41.6-bloom-integration-v4-safe-strength/`
- `data/runs/phase41/p41.6-bloom-integration-v5-high-strength/`

## 人工 Gate 结果

人工确认 v5 满足 P41.6 的最终 Bloom ON 条件：

- 有光感但不吞掉地形
- 中段评分层级仍然清楚
- 高分样本没有大面积白核
- OFF/ON 差异符合 `pure-bloom-delta-v1`
- 未观察到基础画面重复叠加

因此 P41.6 记录为 Go，并结束本 TODO。

## 自动检查

- `npm run test -w planet-exporter`：21 个测试文件、145 个测试通过
- `npm run typecheck -w planet-exporter`：通过
- `npm run lint -w planet-exporter`：通过
- `git diff --check`：通过
- Bloom proof 源码与生成脚本中不存在 `1.25` ratio 上限、`maxOnToOffMeanLumaRatio` 或 `core_proof_max_on_to_off_mean_luma_ratio`

## 后续边界

P41.7 负责网站、普通 exporter、diagnostics 三端契约统一及最终回归证据。v5 在 P41.7/P41.8 完成前仍属于诊断候选，不应被视为已切换的生产 Bloom 默认值。