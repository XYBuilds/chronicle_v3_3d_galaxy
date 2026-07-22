# Phase 42.6 · Monthly Rating Emission Production Gate 实施报告

## 结论

P42.6 已完成本地可复现的首次月度切换生产 Gate，并获得人工 **Go**。Phase 42 的 monthly rating→emission profile 生命周期现已覆盖月初激活、nightly 月中冻结、失败回滚、同月重跑保护、force activation 审计、三端消费一致性与 Focus Planet 视觉层级验收。

本 Gate 全程使用受控 fixture、文件系统 immutable object store 和 localhost HTTP adapter；没有执行真实 R2 上传、Pages 部署或生产数据切换。

## 生命周期证据

`python scripts/cron/run_p426_production_gate.py` 从 `scripts/tests/phase42_monthly_nightly.fixture.json` 生成并持久化本地证据：

- 首次 monthly candidate 通过校验后上传 immutable profile，再更新 active pointer；
- nightly 改变电影 `vote_average` 和 galaxy `data_version`，随后从 `fake-r2/active.json` 与 immutable profile object 重新读取，不复用内存中的 retained profile；
- nightly 前后 `profile_id`、`curve_sha256`、完整 201 点 LUT、`samples_sha256` 和 source provenance 完全一致；
- 注入 pointer update 失败后，旧 active pointer 继续服务，失败原因与 rollback targets 进入 artifact；
- 同月普通重跑得到 `frozen-same-period`；显式 force activation 记录 old/new profile、reason、actor 与 activated time。

本地证据输出在 `data/runs/phase42/p42.6-production-gate/`。该目录按仓库 `.gitignore` 约定不提交，但可由单条命令确定性重建。

## 三端真实入口

Gate 没有从同一个 profile 对象手工复制三份结果：

- website 通过 Vite SSR 加载 `focusEmissionProfileLoader.ts:loadFocusEmissionProfile`，从随机 localhost 端口请求 immutable profile；
- normal Planet exporter 通过 `renderInBrowser → planet-export.html` 请求 exporter 本地 adapter 暴露的 immutable profile 路径；
- Phase 41 diagnostics 通过独立的 `renderPhase41DiagnosticInBrowser → phase41-diagnostics.html` 入口读取同一 profile，且不启用 diagnostic override。

三个消费面分别断言 profile 请求恰好一次，并对齐 `profile_id`、curve hash、201 点 LUT hash、source data version 和 source movie count。

## 人工视觉 Gate

视觉样本固定同一 `movie_id=40` 及 seed、地形、hue、genres、camera、rotation、Bloom 和 profile，仅改变 rating 及其派生 emission：

| 样本 | rating | emission |
| --- | ---: | ---: |
| low | 4.0 | 0.085625 |
| mid | 6.0 | 0.327500 |
| high | 8.0 | 0.569375 |

三张 1200×1200 原图具有相同 invariant snapshot hash 和 alpha hash，平均 RGB 亮度按 low → mid → high 单调提升。Contact sheet、三张原图、PNG sidecar、无 override diagnostic 图和 manifest 均由 Gate 原子生成并校验 hash。

人工审阅已确认低分、中段密集区和高分的 Focus Planet 视觉层级未超出 Phase 41.5–41.8 已验收契约，结论为 **Go**。

## 验证

- `python scripts/cron/run_p426_production_gate.py`
  - 完整本地 Gate 通过。
- `python -m pytest scripts/tests/test_phase42_regression_observability.py scripts/tests/test_monthly_profile_generator.py scripts/tests/test_emission_profile_release.py scripts/tests/test_upload_galaxy_r2.py`
  - 40 个测试通过。
- `npm run test -w frontend`
  - 42 个测试文件、315 个测试通过。
- `npm run test -w planet-exporter`
  - 22 个测试文件、158 个测试通过。
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

额外执行的 `npm run test:integration -w planet-exporter` 暴露两个既有 Phase 41 Bloom 基线失败：测试仍期望 `strength=0.01/threshold=0`，当前已验收生产默认值为 `strength=1/threshold=10`。`browser.integration.test.ts`、`bloomProof.ts` 和 `planetVisualDefaults.ts` 在本分支相对 `main` 均无差异，因此该结果不属于 P42.6 引入的回归，也不改变本 Gate 的人工 Go 结论。

## 交付边界

P42.6 只增加确定性 Gate、localhost fake adapter、请求级消费证据与报告，不修改 rating→emission 算法、shader、视觉常量、宏观 `Movie.emissive` 语义或生产发布 workflow。本次交付不包含真实上传或部署声明。