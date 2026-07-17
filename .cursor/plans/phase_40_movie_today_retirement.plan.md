---
name: unused
overview: Phase 40 彻底退役 The Movie Today：移除每日选片、Today cover、专属路由/分享/OG/KV 协议，将 `/` 收敛为 galaxy idle，并在人工 Gate 中完成 snapshot v1→v2、R2/KV/cache 清理与生产验收。保留 `/movie/:id`、电影动态 OG、品牌首页 OG 和 Daily Stargazing 的具体电影深链。
todos:
  - id: p40-contract-baseline
    content: 40.1 锁定三仓库基线、生产遗留对象与退役路由/状态契约
    status: pending
  - id: p40-frontend-retirement
    content: 40.2 将首页收敛为 galaxy idle 并完整退役 Today cover/WebGL 状态
    status: pending
  - id: p40-pipeline-retirement
    content: 40.3 移除每日选片、today.json 上传与 manifest today_url 生产链
    status: pending
  - id: p40-og-state-v2
    content: 40.4 实现 OG Index snapshot v1→v2 与一次性 KV today 删除协议
    status: pending
  - id: p40-worker-retirement
    content: 40.5 退役 OG Worker Today KV/meta/PNG 路由并固定旧 URL 为 404
    status: pending
  - id: p40-tests-docs
    content: 40.6 完成回归测试、locale parity、现行 SSOT 与中英文 README 对齐
    status: pending
  - id: p40-integration-verification
    content: 40.7 完成本地集成、迁移 dry-run 与 Daily Stargazing 深链验证
    status: pending
  - id: p40-production-gate
    content: 40.8 [需人工验收] 完成生产发布、v2 迁移、线上清理与 scheduled Gate
    status: pending
isProject: false
---

# Phase 40 — The Movie Today 退役与首页状态收敛

## 前置与目标

- 前置：Phase 38 已建立 OG Index KV 增量同步与 R2 committed snapshot；Phase 39 与本 Phase 存在 `Cover 今日星球` 交叉改动，执行前必须以最新 `main` 为基线并核对实际合并状态。
- 产品职责已迁移：Daily Stargazing 负责每日发现、推荐与社媒引流；主站不再维护第二套“每日一部电影”体验。
- `/` 在 galaxy 数据与搜索索引就绪后直接进入 idle；`/movie/:id` 继续直达电影 focus。
- `/today` 与 `/og/today.png` 不重定向、不返回 410，按未注册资源返回 `404 Not Found`。
- 完整退役 `today.json`、assets manifest `today_url`、KV `today`、Today OG/meta/cache 及 cover/WebGL 特例。

```mermaid
flowchart LR
  D[Daily Stargazing] -->|/movie/:id| M[Movie focus]
  H[/] --> I[Galaxy idle]
  I -->|click/search| M
  M -->|clear selection| I
  E[Galaxy export] --> P[Movie OG projection]
  P --> K[KV movie:* + meta:G]
  K --> O[Movie dynamic OG]
  T[/today + /og/today.png] --> N[404]
```

## 范围边界

### 本 Phase 要做

- 删除前端 Today loader、cover store/HUD、Today route 和 WebGL 推荐星体特殊状态，让 home 成为稳定的无选择 idle。
- 从 nightly/monthly 与 R2 upload 中删除每日选片、`today.json` 和 `today_url` 生产链。
- 将 OG Index committed snapshot 从含 Today control 的 schema v1 迁移为仅含 movie hashes 与 `meta:G` 的 v2。
- 从 OG Worker 删除 Today KV、HTML meta、PNG/version 和路由协议，保留品牌与电影 OG。
- 更新自动化测试、全部 locale bundle、现行 SSOT、运维指南及中英文根 README。
- 在人工 Gate 内按 Worker → 主站 → v2 migration → R2/KV/cache cleanup 顺序发布和验收。

### 本 Phase 不做

- 不为 `/` 新建品牌 cover、Daily Stargazing feed 或另一套启动页状态。
- 不改变 galaxy idle/active、普通电影 focus、Drawer、搜索、时间轴、电影分享和 `/movie/:id` 动态 OG 的产品语义。
- 不改写 Phase 23/27/34/38 等历史计划、验收指南或实施报告；历史事实保留原文。
- 不把 Daily Stargazing 中表示日期/批次的普通 `today` 全局改名；没有 `/today` 依赖偏差时不修改该仓库代码。
- 不运行昂贵 monthly UMAP 或全量数据重建。
- 不在普通实现 TODO 中部署 Worker、触发生产 workflow、删除远端对象或清缓存；这些操作只属于 40.8 人工 Gate。

## 已确认设计

### D1 · Home 是 galaxy idle，不是无电影的 cover

- [`App.tsx`](E:/projects/chronicle_v3_3d_galaxy/frontend/src/App.tsx) 的启动门闩收敛为 `galaxy data ready + search index terminal`；不再等待 `resolveTodayMovieId()`。
- 初始 `/` 清空选中并进入 idle；有效 `/movie/:id` 继续跳过 home 初始化并直接 focus。
- 无效或已不在 galaxy 的 movie id 继续规范化到 `/`，但不得触发 Today fallback。
- 删除 cover 后 HUD 搜索、时间轴、Drawer、Info、语言、全屏等通用入口在 idle 直接可用。

### D2 · Cover 是完整退役边界

- 删除 [`loadToday.ts`](E:/projects/chronicle_v3_3d_galaxy/frontend/src/data/loadToday.ts)、[`coverModeStore.ts`](E:/projects/chronicle_v3_3d_galaxy/frontend/src/store/coverModeStore.ts) 与 [`CoverBackdrop.tsx`](E:/projects/chronicle_v3_3d_galaxy/frontend/src/hud/CoverBackdrop.tsx)，不保留永远为 false 的兼容 store。
- 从 [`scene.ts`](E:/projects/chronicle_v3_3d_galaxy/frontend/src/three/scene.ts)、interaction、screen radius、galaxy meshes 与 GLSL 删除 cover 推荐星体的 size/exempt/picking/camera/orbit 分支。
- 普通 focus 与 idle 的 shader/uniform/拾取不变量保留；不能用隐藏 DOM 代替状态机退役。
- 从 `en.json` 删除 Today/cover keys，并同步全部 locale bundle 的叶子键路径，保持 schema parity。

### D3 · `/today` 在服务边界返回真实 404

- [`routes.ts`](E:/projects/chronicle_v3_3d_galaxy/frontend/src/lib/routes.ts) 不再定义 `today` route 或 `buildTodayPath()`；[`frontend/public/_redirects`](E:/projects/chronicle_v3_3d_galaxy/frontend/public/_redirects) 删除 `/today /index.html 200`。
- OG Worker 不再识别 `/today` 与 `/og/today.png`；GET/HEAD、HTML/image Accept 及 query 变体均不得 fetch SPA shell 或回退品牌图。
- 直接请求的 404 由 Worker/托管边界保证，不依赖客户端 unknown route 回首页。

### D4 · 每日生产协议从源头消失

- [`pick_movie_today.py`](E:/projects/chronicle_v3_3d_galaxy/scripts/cron/pick_movie_today.py) 与废弃 [`render_og_today.py`](E:/projects/chronicle_v3_3d_galaxy/scripts/cron/render_og_today.py) 删除，不移入运行时代码归档。
- Nightly/monthly 继续完成 galaxy export、validate、KV movie sync 与 R2 upload，但不生成或传递 Today payload。
- [`upload_galaxy_r2.py`](E:/projects/chronicle_v3_3d_galaxy/scripts/cron/upload_galaxy_r2.py) 只上传 galaxy/search assets；新 manifest 不含 `today_url`。

### D5 · Snapshot v2 是新 writer checkpoint

- 新 checkpoint 使用 `schema_version: 2`、`projection_version: og-index-v2` 和新对象 key `ops/og-index/state-v2.json.gz`；control 只保留 `meta_g_value`，不允许可选 `today_value`。
- v1 只允许显式迁移路径严格读取；迁移复用其 movie hashes 与 `meta:G`，丢弃 Today control，不让 scheduled run 继续生成 v1。
- 迁移顺序：计算/校验 candidate v2 → 应用 movie delta → 删除 KV `today` → read-back 确认不存在 → `meta:G` 最后写入/核对 → 提交 v2 checkpoint。
- 任一 mutation、删除验证或 v2 snapshot commit 失败均保留 v1 checkpoint，不删除旧对象；下一次可从 v1 幂等重放。
- v2 成功并完成远端审计后，40.8 才删除 `state-v1.json.gz`。

### D6 · OG Worker 只保留品牌与电影能力

- [`src/index.ts`](E:/projects/themoviecosmos-og-worker/src/index.ts)、`src/html.ts`、`src/kv.ts`、`src/version.ts` 删除 Today handler、KV record、meta builder 与 cache-bust/version 逻辑。
- 保留 `/og/brand.png`、`/og/movie/:id.png`、`/movie/:id` HTML meta 注入及其 KV `movie:*` / `meta:G` 契约。
- Worker 与主站分别通过各自仓库分支、测试和 PR 交付；主站 Plan/报告记录 Worker PR 与部署版本，不把两个 Git 仓库混成一个提交。

### D7 · 文档保留历史，现行契约同步改写

- 当前 PRD、Design Spec、Tech Spec、Data Pipeline、运维指南删除 Today 作为现行能力的表述，并把首页定义改为 galaxy idle。
- 明确同步 [`README.md`](E:/projects/chronicle_v3_3d_galaxy/README.md) 与 [`README.en.md`](E:/projects/chronicle_v3_3d_galaxy/README.en.md)。
- 历史计划/报告不加 retired banner、不重写旧结论；代码删除不等于抹除项目历史。
- Daily Stargazing 只验证 `DEFAULT_MOVIE_LINK_PREFIX` 与真实发布产物继续使用 `https://themoviecosmos.com/movie/{tmdb_id}`。

## 工作拆分

### 40.1 `[contract]` 基线审计与退役契约锁定

**依赖：** 无。

- 重新检查主站、OG Worker、Daily Stargazing 的 branch/status/head；重点保护疑似用户改动的 [`test_sync_og_index_kv.py`](E:/projects/chronicle_v3_3d_galaxy/scripts/tests/test_sync_og_index_kv.py)。
- 锁定 `/` idle、`/movie/:id` focus、`/today` 404、`/og/today.png` 404 的路由矩阵，以及 idle/focus/WebGL 非 Today 不变量。
- 只读记录当前 R2 `today.json`、manifest `today_url`、KV `today`、v1 checkpoint key、Today OG cache URL/version 和 scheduled workflow 时间窗。
- 建立删除清单与回滚边界；本 TODO 不修改远端状态。

**验收：**

- 三仓库基线、用户脏改动、Phase 39 交叉文件和生产对象清单可定位。
- 路由/状态/OG/KV 的退役前行为有自动化 fixture 或只读证据。
- 线上清理命令尚未执行，敏感值不写入 Plan、日志或报告。

### 40.2 `[frontend]` Home idle 与 Cover/WebGL 完整退役

**依赖：** 40.1；若 Phase 39 尚未合并，先完成并同步其 `main`。

- 重构 [`App.tsx`](E:/projects/chronicle_v3_3d_galaxy/frontend/src/App.tsx)、[`useRouteController.ts`](E:/projects/chronicle_v3_3d_galaxy/frontend/src/lib/useRouteController.ts) 与 [`routeControllerSync.ts`](E:/projects/chronicle_v3_3d_galaxy/frontend/src/lib/routeControllerSync.ts)，删除 cover boot kind/readiness，home 直接清 selection 并进入 idle。
- 删除 Today route/builder、loader、store、HUD 与专属 CSS/i18n 接口。
- 按 D2 删除 scene、interaction、screen radius、galaxy meshes、shader 与相机/轨道中的 cover 分支；保留普通 idle/focus 数值行为。
- 更新前端 route、App boot、scene/shader contract 与 locale schema 测试。

**验收：**

- `/` 不发起 `today.json` 请求，数据/索引就绪后只挂载一次 scene 并进入 idle。
- `/movie/:id` 仍直接 focus；清除 selection 后 URL 与状态回到 `/` idle。
- 生产代码、类型、uniform、shader、locale 和测试中没有 Today cover 运行时消费者。
- `npm test`、`npm run lint`、`npm run build` 与 locale schema spec 通过。

### 40.3 `[pipeline]` 每日选片、R2 Today 与 manifest 字段退役

**依赖：** 40.1。

- 从 [`nightly_vote_refresh.py`](E:/projects/chronicle_v3_3d_galaxy/scripts/cron/nightly_vote_refresh.py)、[`monthly_refit.py`](E:/projects/chronicle_v3_3d_galaxy/scripts/cron/monthly_refit.py) 及两个 workflows 删除 Today 生成/参数/产物接线，保留 galaxy export、validate 与独立 KV sync。
- 从 [`upload_galaxy_r2.py`](E:/projects/chronicle_v3_3d_galaxy/scripts/cron/upload_galaxy_r2.py) 删除 `today.json` 上传、存在性校验和 manifest `today_url`。
- 删除 `pick_movie_today.py`、`render_og_today.py` 及仅服务这些入口的测试/文档调用。
- 更新 workflow contract 测试，锁定 nightly/monthly 不再生成或上传 Today，但仍按既有顺序发布 galaxy/search assets。

**验收：**

- 新构建产物与 assets manifest 不含 `today.json` / `today_url`。
- Nightly/monthly 不 import、调用或声明 Today picker；非 Today 数据刷新无回归。
- 聚焦 Python/workflow tests 通过，不运行全量数据重建。

### 40.4 `[migration]` OG Index snapshot v1 → v2 与 KV Today 删除协议

**依赖：** 40.1、40.3。

- 在 [`og_index_state.py`](E:/projects/chronicle_v3_3d_galaxy/scripts/cron/og_index_state.py) 建立 v2 schema/build/validate/diff；v1 parser 只用于显式迁移且保持严格校验。
- 更新 [`sync_og_index_kv.py`](E:/projects/chronicle_v3_3d_galaxy/scripts/cron/sync_og_index_kv.py)、[`og_index_kv.py`](E:/projects/chronicle_v3_3d_galaxy/scripts/cron/og_index_kv.py) 与 [`og_index_snapshot_r2.py`](E:/projects/chronicle_v3_3d_galaxy/scripts/cron/og_index_snapshot_r2.py)，实现 D5 顺序与 `--migrate-v1` 一次性入口。
- Scheduled incremental 只接受 v2；缺 v2 时快速失败并提示显式迁移，不自动 full sync、不静默重建。
- 测试 v1→v2、已有 v2 no-op、Today 删除/验证失败、movie mutation 失败、`meta:G` 失败、snapshot commit 失败与幂等重跑。

**验收：**

- v2 不含 Today 字段，movie hash diff 与 `meta:G` 语义保持一致。
- KV `today` 删除且 read-back 为 missing 后，才允许提交 v2 checkpoint。
- 任一失败不推进 checkpoint、不删除 v1；无网络单测覆盖全部失败分支。

### 40.5 `[worker]` OG Worker Today 协议退役与 404

**依赖：** 40.1；可与 40.2–40.4 独立开发，但按串行 TODO 交付。

- 在 OG Worker 仓库按 D3/D6 删除 Today handler、HTML meta、KV record、version/hash 与测试 fixture。
- 增加 `/today`、`/today?*`、`/og/today.png`、`/og/today.png?*` 的 GET/HEAD 404 测试，确认不读取 KV、不 fetch shell、不返回品牌 fallback。
- 保留并回归品牌 PNG、电影 PNG、电影 HTML meta、canonical/version query 和 KV miss fallback。
- 更新 Worker README；不执行 `npm run deploy`。

**验收：**

- `npm test` 与 `npm run typecheck` 通过；若 packaging/config 改动且环境可用，再运行 `npm run dry-run`。
- Worker diff 不改变品牌/电影路由契约。
- 该仓库通过独立 PR 交付，并把 PR/commit/deploy version 记录到 Phase 40 最终报告。

### 40.6 `[tests+docs]` 回归矩阵、locale 与现行文档对齐

**依赖：** 40.2–40.5。

- 补齐主站 route/App/scene/shader/assets manifest、pipeline/workflow、snapshot migration 与 Worker 的聚焦测试矩阵。
- 从全部 locale bundle 删除 Today/cover keys，以 `en.json` 为结构 SSOT，运行 parity test。
- 更新主站 PRD、Design Spec、Tech Spec、Data Pipeline、P34.3/P18.6b 运维指南；同步中英文根 README；更新 Worker README。
- 保留 Phase 23/27/34/38 历史计划和报告原文，不做批量文案清洗。

**验证：**

- 主站：`npm test`、`npm run lint`、`npm run build`；`npx vitest run frontend/src/lib/locales/locales.schema.spec.ts`。
- Python：运行 `scripts/tests/` 下受影响的聚焦 `python -m pytest`。
- Worker：`npm test`、`npm run typecheck`，必要时 `npm run dry-run`。
- 不读取 raw CSV、不调用真实 Cloudflare、不执行 deploy。

### 40.7 `[verification]` 本地集成与发布候选验证

**依赖：** 40.1–40.6。

- 在主站 release build 验证 `/` idle、有效/无效 `/movie/:id`、关闭 Drawer 回 home、搜索/时间轴/idle picking 与普通 focus。
- 对 Worker release candidate 验证品牌 OG、代表性电影 OG/meta，以及 Today 两条 URL 的 GET/HEAD/query 404 矩阵。
- 使用合成 v1/v2 fixture dry-run 验证迁移 summary、movie counts、mutation counts 与 0 未授权网络 mutation。
- 在 Daily Stargazing 只读检查并运行相关测试，确认 `DEFAULT_MOVIE_LINK_PREFIX` 与发布包链接仍为 `/movie/:id`；无偏差则保持零 diff。

**验收：**

- 本地自动化与 smoke 全绿，无 Today 网络请求、KV读取或 WebGL运行时分支。
- v1→v2 dry-run 可复现且未触碰生产对象。
- 形成 40.8 所需 Worker/main commit、workflow、对象 key、缓存 URL 与 smoke checklist。

### 40.8 `[GATE]` 生产发布、v2 迁移与线上遗留清理 `[需人工验收]`

**依赖：** 40.7；需要单独的部署与远端删除授权。

1. 选择不会跨 scheduled nightly/monthly 的维护窗口；确认主站、Worker 两个 PR 已技术验收，记录当前 Worker version、Pages deployment、KV/R2 对象元数据。
2. 先部署 OG Worker；清理 Today OG cache 后验证 `/today` 与 `/og/today.png` 的 GET/HEAD/query 均为 404，品牌/电影 OG 正常。
3. 发布主站与 workflows；验证 `/` 直接 idle、`/movie/:id` 深链/focus/返回 galaxy 正常，当前 assets manifest 不含 `today_url`。
4. 在下一次 schedule 前显式执行一次 v1→v2 migration；核对 movie PUT/DELETE、KV `today` delete/read-back、`meta:G`、v2 checkpoint schema/count/source version。
5. v2 审计通过后删除 R2 `today.json` 与 `ops/og-index/state-v1.json.gz`；确认 v2 checkpoint、galaxy/search assets 未受影响。
6. 清理 `/og/today.png` 的边缘缓存变体并复测 404；检查日志中无 Today KV read、today.json fetch 或 scheduled Today 生成。
7. 验收下一次 scheduled nightly：movie 增量同步、v2 checkpoint 前进、R2 upload、Pages/production smoke 正常，Today 不再生成或回写。
8. 使用 Daily Stargazing 的真实候选/发布包验证 CTA 为 `/movie/:id`，走通电影详情、返回 galaxy 与电影动态 OG。
9. 人工 Go 后更新 canonical Plan 状态，并写入 [`docs/reports/Phase 40 P40 The Movie Today 退役实施报告.md`](E:/projects/chronicle_v3_3d_galaxy/docs/reports/Phase%2040%20P40%20The%20Movie%20Today%20退役实施报告.md)。

未获人工 Go 前，不将 40.8 标为 complete，不删除生产对象，不写最终实施报告，不执行发布交付。

## Phase 40 验收标准

- `/` 不依赖某部推荐电影或每日请求，数据/索引就绪后直接进入 galaxy idle。
- `/movie/:id`、普通 focus/Drawer/分享、电影动态 OG 与品牌 OG 无回归。
- `/today`、`/og/today.png` 的 GET/HEAD/query 在生产返回真实 404。
- 前端 production bundle 与 WebGL 状态机不存在 Today loader/store/route/cover/uniform/picking/camera 特例。
- Nightly/monthly、R2 upload 和 assets manifest 不再生成、上传或声明 Today。
- OG snapshot v2 不含 Today control；KV `today`、R2 `today.json`、v1 checkpoint 与 Today cache 已清理且不会被 schedule 写回。
- 现行 SSOT、运维指南、中英文 README、Worker README 与代码一致；历史计划/报告保持原文。
- Daily Stargazing 真实发布链继续使用 `/movie/:id`，且无需产品代码改动。
- 自动化、本地集成、生产迁移与下一次 scheduled nightly Gate 全部通过。

## Phase 40 交付物

- `.cursor/plans/phase_40_movie_today_retirement.plan.md`
- 主站 home idle 路由/启动状态与完整 Today cover/WebGL 退役 diff。
- 无 `today.json` / `today_url` 的 nightly/monthly/R2 发布链。
- OG Index snapshot schema v2、显式 v1 migration 与 KV Today 删除协议。
- OG Worker Today 路由/KV/meta/PNG 退役 PR。
- 聚焦测试、locale parity、现行 SSOT/运维指南及同步后的中英文 README。
- `docs/reports/Phase 40 P40 The Movie Today 退役实施报告.md`。