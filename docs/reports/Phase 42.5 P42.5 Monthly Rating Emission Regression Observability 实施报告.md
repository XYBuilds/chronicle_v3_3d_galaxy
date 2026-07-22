# Phase 42.5 · Monthly Rating Emission Regression & Observability 实施报告

## 结论

p42.5 已完成并通过技术验收。跨端回归现在用同一组 monthly/nightly fixture 证明：月内 active profile 冻结、nightly 只复用当前 profile、失败保留旧 pointer、force activation 留下完整审计记录，且 drift 指标与 profile/source provenance 对齐。

本 TODO 没有把 CDF 计算或发布状态扩散到 appearance、shader 或 render loop。网站与 Planet exporter 仍在 CPU 侧消费同一份已验证 profile，shader 只接收最终的 `uEmissionIntensity` 标量。

## 自动证据

新增 `scripts/tests/phase42_monthly_nightly.fixture.json`，其中 monthly 与 nightly 使用同一组电影但刻意改变 `vote_average`。`scripts/tests/test_phase42_regression_observability.py` 通过现有生成与发布纯函数验证：

- nightly manifest 的 `data_version` 更新，但 `profile_id`、`curve_sha256`、`source_data_version` 与 immutable profile URL 保持 monthly active 值；
- 同月普通 candidate 得到 `frozen-same-period`，active pointer 不变；
- 显式 force activation 记录 old/new profile、reason、actor 和 activation time；
- 非法 candidate hash 在 activation 前失败，失败 metadata 继续引用旧 active pointer；
- drift 的 previous/current profile、source data version、mean/max LUT delta 与 candidate provenance 一致；
- Python 生成的关键 LUT 节点与 TypeScript 纯函数结果一致，legacy manifest 仍可解析。

前端与 exporter 测试补充以下边界：

- runtime profile 并发加载只 fetch、校验和记录 provenance 一次，后续复用同一缓存对象；
- appearance 保留已验证 profile identity，rating 只改变 emission intensity；
- Planet material 不引入 LUT uniform 或 shader 分支；
- exporter 必须使用 manifest 声明的 immutable profile URL，并校验 URL 中的 profile ID 与 active pointer 一致；
- diagnostics 透传同一 pointer 与 profile URL，不隐式启用 legacy fallback。

## Exporter URL 收敛

`tools/planet-exporter/src/data-source.ts` 现在优先读取 `focus_emission_profile_url`，而不是从 versioned galaxy asset URL 猜测 profile 路径。URL 只接受 HTTP(S)，禁止 userinfo、query 和 fragment，且路径必须以 `/focus-emission-profiles/<profile_id>.json` 结尾。

`frontend/src/planet-export/request.ts` 使用相同的路径尾部合同，因此网站 exporter、CLI exporter 与 diagnostics 接收同一份不可变资源地址。旧 manifest 未携带 URL 时仍保留原有兼容推导路径。

## Shader 回归契约修正

全量前端测试暴露出一个既有矛盾：`perlinLinearEmissionShader.spec.ts` 一方面禁止对 `litLinear/finalLinear` clamp，另一方面又要求经批准的固定 Key 作用后绿色通道 `<= 1`。当前参数下该通道为约 `6.12`，属于预期的线性 HDR headroom。

本 TODO 只修正测试契约：验证固定 Key、rating→emission 单调性、精确未裁剪线性计算和 HDR 值保留。生产 shader、`PLANET_VISUAL_DEFAULTS` 与 production profile 均未修改。

## 验证

- `python -m pytest scripts/tests/test_phase42_regression_observability.py scripts/tests/test_monthly_profile_generator.py scripts/tests/test_emission_profile_release.py scripts/tests/test_upload_galaxy_r2.py`
  - 40 个测试通过。
- `npm run test -w frontend`
  - 42 个测试文件、315 个测试通过。
- `npm run test -w planet-exporter`
  - 22 个测试文件、157 个测试通过。
- `npm run lint -w frontend`
  - 通过。
- `npm run build -w frontend`
  - `tsc -b`、Vite build、dist size check 与 SPA fallback verification 完成，退出码 0。
  - 本地 `frontend/public/data/galaxy_data.json` 与 `.gz` 超过 Cloudflare Pages 25 MiB 的既有提示仍保留；生产 workflow 会在 build 前执行 R2 prune。
- `npm run typecheck -w planet-exporter`
  - 通过。
- `npm run lint -w planet-exporter`
  - 通过。
- `git diff --check`
  - 通过。

## 边界

本 TODO 未运行完整 UMAP、真实 monthly/nightly workflow、R2 上传或生产部署。首次月度切换、故障注入、同月 force activation 复演与 Focus Planet 人工视觉 Go/No-Go 属于 p42.6。