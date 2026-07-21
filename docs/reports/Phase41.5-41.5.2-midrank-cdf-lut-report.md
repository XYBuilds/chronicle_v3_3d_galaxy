# Phase 41.5.2 — Midrank CDF + LUT Report

## 状态

- TODO：`p41.5.2-midrank-cdf-lut`
- 状态：`complete`
- 分支：`feat/p41.5.2-midrank-cdf-lut`

## 完成内容

- 在 `frontend/src/three/focusEmission.ts` 增加 `rating-midrank-cdf-lut-v1` profile、固定 `0..10` rating 域、`0.05` 步长和 201 个采样点。
- 实现对已排序最终渲染集合的 midrank CDF：`(count(< rating) + 0.5 * count(= rating)) / N`。
- 实现 LUT 生成、有限值/单调性/端点/长度校验，以及 rating clamp 后的节点命中和相邻节点线性插值。
- 增加 `FocusEmissionProfile` dispatcher，支持 anchored smoothstep 与诊断 LUT 两种 profile。
- 在 `planetAppearance.ts` 增加独立的 profile-aware helper；生产两参数 resolver 和 `PLANET_VISUAL_DEFAULTS` 保持不变，appearance 不负责统计分布。
- 保留 anchored smoothstep evaluator 作为历史基线，未修改 shader、Meta schema、网站默认入口或 monthly refit。

## 验证

- `npm test -- --run src/three/focusEmission.spec.ts src/three/planetAppearance.spec.ts src/three/planetCore.spec.ts`（`frontend`）：3 files、41 tests passed。
- `npx tsc -b`（`frontend`）：passed。
- `npm run lint`（`frontend`）：passed。
- `git diff --check`：passed。
- 最近修改文件 linter diagnostics：无错误。

## 后续

`41.5.3` 继续补充 exporter contract/invariant 与可复现证据契约；本 TODO 只完成纯函数和诊断消费边界，不代表 LUT 已切换为生产默认或已生成 Bloom OFF contact sheet。