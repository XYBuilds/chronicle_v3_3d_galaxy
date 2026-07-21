# Phase 42.1 · Monthly Rating Emission Profile Contract 实施报告

## 结论

p42.1 已完成并通过技术验收。实现建立了可序列化的 rating-emission profile contract、active pointer、同月冻结和显式 force activation 语义；未接入 monthly/nightly 发布或运行时消费，这些内容留给后续 TODO。

## 实现范围

- `frontend/src/three/focusEmission.ts`
  - 增加 `rating-emission-profile-v1` contract。
  - 固定 0–10 rating domain、0.05 sample step、201 个 LUT samples 和 emission endpoints。
  - 增加有限值、长度、单调性、端点、period、ID、时间戳、SHA-256、source provenance 校验。
  - 增加稳定 JSON 序列化、曲线 hash 输入、profile hash 校验、active pointer 校验。
  - 增加 candidate、same-period freeze、force activation、older-period rejection 和显式 legacy fallback 语义。
- `frontend/src/types/galaxy.ts`
  - 增加最小 `FocusEmissionProfileProvenance` 与 `ActiveFocusEmissionProfilePointer` 类型。
- `frontend/src/lib/galaxyAssetUrls.ts`
  - manifest 仅接受最小 active provenance。
  - profile artifact 只能从受控 `data/focus-emission-profiles/<profile_id>.json` 命名空间解析，不接受任意 URL 或本地路径。
- 新增/扩展对应 Vitest 覆盖 profile 解析、序列化、hash、边界校验、同月冻结和路径安全。

## 验证

- `npm run test -- --run src/three/focusEmission.spec.ts src/three/planetAppearance.spec.ts src/three/planetCore.spec.ts src/lib/galaxyAssetUrls.test.ts`
  - 4 个测试文件通过，58 个测试通过。
- `npx tsc -b`
  - 通过。
- `npm run lint`
  - 通过。
- `git diff --check`
  - 通过。

实现提交：`4f57f90 feat(p42.1): establish monthly profile contract`。

## 边界

- 当前仍保留 Phase 41 源码冻结 LUT 作为 legacy fallback；未将 monthly profile 接入网站、Planet exporter 或 diagnostics。
- 未修改 monthly/nightly workflow、R2/Pages manifest 发布、Python profile generator 或生产部署。

## 下一依赖

p42.2 需要在 monthly final movies 导出边界生成与当前 contract 一致的 profile JSON、source provenance、curve hash 和漂移指标，并保证失败时不更新 active pointer。