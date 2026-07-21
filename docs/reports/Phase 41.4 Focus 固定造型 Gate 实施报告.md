# Phase 41.4 Focus 固定造型 Gate 实施报告

## 结论

Phase 41.4 已完成。用户人工批准了背光方向、Lightness 和 Key，Bloom OFF 下的 Focus 固定造型生产参数已锁定。

## 锁定参数

| 参数 | 锁定值 | 证据 |
| --- | --- | --- |
| Direction | `backlight-east-v1`，归一化 `[0.700665949127905, 0.4003805423588029, 0.5905612999792342]` | `data/runs/phase41/p41.4-fixed-shaping-direction-v4-backlight-semantic-fixtures/` |
| Lightness | `0.66` | `data/runs/phase41/p41.4-fixed-shaping-lightness-v5-backlight-lightness-066-semantic-fixtures/` |
| Key | `0.45` | `data/runs/phase41/p41.4-fixed-shaping-key-v5-backlight-lightness-066-semantic-fixtures/` |
| flatShadingMix | `0.8` | 三组 checkpoint 固定参数 |
| Emission | `0.005`，`vote-average-power-clamped-v1` | 三组 checkpoint 固定参数 |
| Bloom | OFF | 三组 checkpoint 固定参数 |

方向候选已完成 Z 轴反转。旧前光方向及其下游 Lightness/Key 证据被标记为失效，不参与本 Gate。

## 证据完整性

- Direction：5 fixtures × 3 candidates = 15 PNG、15 sidecar、15 manifest cells、15 validation cells。
- Lightness：5 fixtures × 4 candidates = 20 PNG、20 sidecar、20 manifest cells、20 validation cells。
- Key：5 fixtures × 3 candidates = 15 PNG、15 sidecar、15 manifest cells、15 validation cells。
- Key validation 已记录 `candidate_review: approved`、`approved_candidate: key-0.45` 和 `production_lock: locked`。
- 所有 sidecar 均保留生产配置来源、诊断 override、上游批准输入和 visual config hash。

## 生产配置

`frontend/src/three/planetVisualDefaults.ts` 已升级到 schema version 6，并锁定：

- `focus.lightness = 0.66`
- `lighting.direction = [0.700665949127905, 0.4003805423588029, 0.5905612999792342]`
- `lighting.keyLightIntensity = 0.45`

评分到 emission 的生产曲线仍保持原配置，留给 Phase 41.5 单独收敛；本 Gate 没有跨阶段修改 emission 生产接口。

## 验证

- exporter `npm test`：129/129 通过。
- exporter `npm run typecheck`：通过。
- exporter `npm run lint`：通过。
- frontend `npm test`：266/266 通过。
- frontend `npm run lint`：通过。
- frontend `npm run build`：通过。
- 生成器三阶段矩阵完整性断言：通过。
- `git diff --check`：通过。

构建输出仍报告仓库既有的 `frontend/public/data/galaxy_data.json` 与 `.gz` 超过 Cloudflare Pages 单文件 advisory 限制；该问题与本次视觉参数变更无关。

## 下一步

进入 Phase 41.5，继续在已锁定的方向、Lightness 和 Key 上收敛 rating → emission；不得重新解释方向坐标或回退到旧前光证据。