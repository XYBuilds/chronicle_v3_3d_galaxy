# Phase 41.5.3 · CDF/LUT 自动测试与证据契约实施报告

## 结果

41.5.3 已完成。`rating-midrank-cdf-lut-v1` 仍是 diagnostic-only 候选，anchored smoothstep 仍作为 `candidate-no-go` 历史基线保留；未修改生产默认视觉配置、生产 `Meta` schema、网页数据加载路径或 shader。

## 实现

- 扩展 `focusEmission` 测试，覆盖重复 rating 的 midrank、201 点 LUT、节点命中、节点间线性插值、端点、越界 clamp、有限值、单调性、确定性和非法 profile 快速失败。
- 扩展 `planetAppearance` 测试，证明 diagnostic profile 下 rating 只改变 `emissionIntensity`，不改变 Lightness、Chroma、Key、genre、seed 或其他外观字段。
- 在 `p41EmissionEvidence.ts` 中固定权威 gzip、data version、movie count、Git commit、曲线版本、LUT step、完整固定视觉 profile、Bloom OFF 和 `rating/emission` 唯一允许变化字段。
- 增加稳定 JSON 序列化与 SHA-256 校验，manifest 对 source、LUT、固定 profile 和 hash 漂移快速失败。
- 增加 exporter contract 测试，覆盖 manifest byte-stable、固定 profile/source/LUT/hash drift 拒绝，以及 rating-only variation invariant。

## 验证

- `npm run test -w frontend -- src/three/focusEmission.spec.ts src/three/planetAppearance.spec.ts`：2 files，30 tests passed。
- `npm run test -w planet-exporter -- src/p41EmissionEvidence.test.ts`：1 file，6 tests passed。
- `npm run typecheck -w planet-exporter`：passed。
- `npm run lint -w frontend`：passed。
- `npm run lint -w planet-exporter`：passed。
- `git diff --check`：passed。

41.5.4 的 Bloom OFF contact sheet 和完整视觉产物尚未生成；人工 Go/No-Go 仍由后续 TODO 负责。