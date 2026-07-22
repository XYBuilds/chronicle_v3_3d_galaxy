# Phase 42.3 · Monthly Rating Emission Runtime / Exporter Consumer 实施报告

## 结论

p42.3 已完成并通过技术验收。网站、普通 Planet exporter 和 Phase 41 diagnostics 现在共同读取、校验并消费 active rating-emission profile；普通生产路径不再把源码冻结 LUT 当作唯一事实来源。源码冻结 profile 仅保留在显式 legacy compatibility 边界。

## 实现范围

- 新增 `frontend/src/lib/focusEmissionProfileLoader.ts`
  - 严格校验 manifest active pointer、受控资源路径、profile schema、不可变 identity、201 点 LUT、canonical SHA-256 hash 和 provenance。
  - 缓存键包含可信资源 URL 和完整 pointer identity；失败项从缓存移除以允许重试，并通过 promise identity 检查避免旧请求清除新重试项。
  - production URL 缺失或 profile/hash 错配时快速失败；legacy fallback 只允许显式 compatibility fixture/file 边界。
  - profile 成功加载后只记录一次 `profile_id`、source data version、movie count 和样本摘要。
- 网站启动链路调整为 `App.tsx → mountGalaxyScene → createSelectionPlanet`：galaxy data 与索引就绪后加载 validated active profile，再创建场景；选片和重新选片不重新请求或计算 CDF。
- `resolvePlanetAppearance()` 改为必须显式接收 emission profile；通用视觉默认值不再携带冻结 emission 数据。shader 仍只接收单一 `uEmissionIntensity`，没有新增 LUT texture 或 shader 分支。
- 普通 exporter、浏览器注入和 Phase 41 diagnostics 统一消费 validated profile；普通 `renderPlanetImage` 静态要求 resolved visual config，P39 legacy 与 Phase 41 diagnostic 使用独立显式入口。
- `resolvePlanetVisualConfig()` 生成唯一 canonical visual-config payload，覆盖完整渲染配置、emission profile、provenance 和 Phase 41 non-emission overrides。renderer diagnostics、DOM dataset、browser validation、visual hash、sidecar 与 evidence 输出共享同一 payload/hash。
- browser exporter 独立 canonical-serialize `visual_config_payload` 并验证 hash，不信任重复传入的 hash 字符串；Phase 41 evidence 按每张 snapshot 的内部 hash aliases 校验，不再依赖过期的固定生产 hash。

## 验证

- Focused frontend suites：loader、visual config、Phase 41 diagnostic profile、planet export、planet core、planet appearance
  - 6 个测试文件、72 个测试通过。
- `npm test -w planet-exporter`
  - 22 个测试文件、155 个测试通过。
- `npm run typecheck -w planet-exporter`
  - 通过；该 workspace 的权威类型入口为 `tsconfig.check.json`。
- Phase 41 browser integration
  - 1 个测试通过。
- `npm run lint`
  - 通过。
- `npm run lint -w planet-exporter`
  - 通过。
- `npm run build`
  - 通过，包括 frontend `tsc -b`、Vite build、size checks 和 SPA verification。
- `git diff --check`
  - 通过。

实现提交：`843875e feat(p42.3): consume active emission profile at runtime`。

## 已确认的既有失败

- 完整 frontend test 仅在 `frontend/src/three/perlinLinearEmissionShader.spec.ts` 保留既有数值断言失败；同一失败已在干净 `main` 基线复现，本 TODO 未新增 frontend test failure。
- `npm run test:integration -w planet-exporter -- --reporter=verbose` 保留两个普通 exporter Bloom 断言失败：运行值约为 `strength=1`、`threshold=10`，历史断言期望约为 `strength=0.01`、`threshold=0`，第二个 core pixel increment 断言由同一参数差异导致。两个失败均在 detached clean `4b27fe3e33b3b1afc2b7a626e02385671f09bfd2` 基线逐项复现，属于 p42.3 范围外的既有问题；当前分支没有新增 ordinary-exporter integration failure。

## 边界

- 本 TODO 不修改 monthly/nightly workflow、R2/Pages 上传顺序或 active pointer 发布策略，这些属于 p42.4。
- 未执行真实 R2 上传、Pages 生产部署、完整 UMAP 或生产数据重建。