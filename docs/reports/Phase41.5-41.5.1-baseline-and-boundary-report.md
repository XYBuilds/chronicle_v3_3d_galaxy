# Phase 41.5.1 — Baseline and Candidate Boundary Report

## 状态

- TODO：`p41.5.1-baseline-and-boundary`
- 状态：`complete`
- 分支：`feat/p41.5.1-baseline-boundary`
- 基线提交：`b3498b1`

## 完成内容

- 保留 anchored smoothstep 的历史 Bloom OFF evidence 目录及其 PNG、sidecar、manifest 和 contact sheet，不覆盖原始产物。
- 将 anchored smoothstep 标记为 `candidate-no-go` 历史候选。
- 声明 `rating-midrank-cdf-lut-v1` 为诊断专用、尚未实现的候选边界。
- 固定权威输入为 `frontend/public/data/galaxy_data.json.gz`，数据版本为 `2026.07.18.daily.113`，电影数为 `61531`，并锁定 SHA-256。
- 固定 emission 范围 `0.005..0.65`、P41.4 approved fixed profile、Bloom OFF 和候选间唯一允许变化字段 `rating` / `emission`。
- 明确禁止本 TODO 提前修改生产默认、运行时 LUT、schema、shader、monthly refit 和普通网站入口。

## 验证

- `npm test -- --run src/p41EmissionEvidence.test.ts`（`tools/planet-exporter`）：1 file、3 tests passed。
- `npm run typecheck`（`tools/planet-exporter`）：passed。
- `npm run lint`（`tools/planet-exporter`）：passed。
- `npm test -- --run src/three/planetAppearance.spec.ts src/three/focusEmission.spec.ts`（`frontend`）：1 file、12 tests passed。
- `git diff --check`：passed。
- 修改文件 linter diagnostics：无错误。

## 后续

`41.5.2` Worker 负责实现 midrank CDF、201 点 LUT、运行时纯查表插值及对应校验；本报告不表示该候选已接入生产运行时。