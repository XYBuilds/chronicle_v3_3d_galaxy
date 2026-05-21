---
name: phase 34 social preview distribution
overview: Phase 34 以 Phase 30 稳定深链为前置，规划并落地 `/today` 与 `/movie/:id` 的社交预览策略。首版可接受电影链接共用静态 OG，但必须明确 today OG、movie OG、动态/静态生成成本与部署边界。
todos:
  - id: p34-plan-doc-preflight
    content: 34.1 创建并维护 `.cursor/plans/phase_34_social_preview_distribution.plan.md`，确认 Phase 30 深链已稳定
    status: completed
  - id: p34-og-current-audit
    content: 34.2 审计现有 today OG 链路、HTML meta、cache-bust 与部署产物
    status: completed
  - id: p34-social-strategy
    content: 34.3 决定 `/today` 与 `/movie/:id` 的 OG 策略：共用静态图、有限集合生成或动态 endpoint
    status: pending
  - id: p34-today-og-hardening
    content: 34.4 强化 `/today` 预览语义，确保 today 标题、图片、URL 与 UTC 日期一致
    status: pending
  - id: p34-movie-og-policy
    content: 34.5 明确 `/movie/:id` 首版预览策略，避免承诺不可承担的每片独立卡片
    status: pending
  - id: p34-share-platform-validation
    content: 34.6 验证 X、Facebook、Telegram、Reddit、Discord、Email 等平台的链接与预览行为
    status: pending
  - id: p34-deploy-cache
    content: 34.7 补齐静态部署、R2/CDN、cache-control、cache-bust 与回滚策略
    status: pending
  - id: p34-tests-acceptance
    content: 34.8 执行 OG 产物生成、meta 校验、分享 URL、lint/build 验收
    status: pending
isProject: false
---

# Phase 34 — 社交预览与传播能力

## 目标

Phase 34 在 Phase 30 深链稳定后，提升分享链接在社交平台中的表现：

- `/today` 至少有正确 today 语义的社交预览。
- `/movie/:id` 的首版预览策略明确：共用静态 OG、有限集合生成或动态 endpoint。
- 分享 URL、OG 图片、HTML meta、cache-bust 与静态部署规则一致。
- 不过早承诺每部电影都有独立 OG 卡片，除非接受对应构建或边缘函数复杂度。

```mermaid
flowchart TD
  A[Phase 30 stable deep links] --> B[Phase 34 OG strategy]
  B --> C[/today preview]
  B --> D[/movie/:id preview]
  C --> E[existing render_og_today.py]
  D --> F{strategy}
  F -->|shared static OG| G[low cost]
  F -->|limited generated set| H[build/cron cost]
  F -->|dynamic endpoint| I[Vercel Edge/Serverless]
  G --> J[social validation]
  H --> J
  I --> J
```

## 范围边界

### 本 Phase 要做

- 审计现有 The Movie Today OG 生成链路。
- 明确 `/today` 与 `/movie/:id` 的 OG 策略。
- 更新或补齐 HTML meta、cache-bust、分享 URL 与部署产物。
- 验证主要社交平台预览行为。
- 记录静态 hosting 下可维护的首版方案。

### 本 Phase 不做

- 不在未评估成本前批量生成 60K 电影独立 HTML。
- 不引入后端数据库。
- 不改变 Phase 30 的客户端路由契约。
- 不把分享按钮 UI 迁移作为本阶段核心；Drawer 分享归 Phase 30。
- 不扩大到 SEO 全站建设，除非作为后续 backlog。

## 关键现状

- today OG 生成脚本在 [scripts/cron/render_og_today.py](scripts/cron/render_og_today.py)，输出 `frontend/public/data/og-today.png`。
- 该脚本使用 `frontend/public/data/galaxy_data.json` 与 `frontend/public/data/today.json`，并在 poster fetch 失败时保留可用 fallback。
- 项目已有 P23/P27 相关 reports，说明 today OG、分享入口、cache-bust 曾实现过。
- Phase 30 计划将分享 URL 指向 `/movie/:id` 和 `/today`，因此 Phase 34 必须基于稳定深链而不是根路径 `/`。
- 当前部署是静态 hosting；每片独立 OG 如果需要真实 per-path meta，必须引入预渲染、边缘函数或有限集合生成。

## 工作拆分

### 34.1 文档落地与 Phase 30 前置确认

创建并维护计划文件：`.cursor/plans/phase_34_social_preview_distribution.plan.md`。

#### 34.1.1 计划文件状态

| 项                   | 状态                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 计划路径             | `.cursor/plans/phase_34_social_preview_distribution.plan.md`（本文件）                                                                                          |
| Phase 30 计划        | 全部 TODO 30.1–30.8 **completed**（见 [phase_30_routing_sharing.plan.md](./phase_30_routing_sharing.plan.md)）                                                  |
| Phase 30 验收报告    | [P30.8 路由分享测试与验收](../docs/reports/Phase%2030.8%20P30.8%20路由分享测试与验收%20实施报告.md) — 155/155 单测、build + `verify-spa-fallback-dist.mjs` 通过 |
| Phase 34 与 Phase 33 | **无依赖** — HDR production 不阻塞社交预览                                                                                                                      |
| 34.1 执行分支        | `feat/p34.1-phase30-preflight`（2026-05-21）                                                                                                                    |

#### 34.1.2 Phase 30 前置检查（2026-05-21）

**结论：Go — Phase 34 社交预览工作可开工。**

| 前置条件                           | 结论             | 证据                                                                                                                                                                                         |
| ---------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/movie/:id` 刷新 → focus + Drawer | **满足**         | `routeControllerSync` T1：`selectedMovieId` 设置、`coverMode` false；`MovieDetailDrawer` 订阅 `selectedMovieId` 打开 Sheet；`runInitialRouteBoot` R4 深链 boot                               |
| `/today` 刷新 → today 体验         | **满足**         | `routeControllerSync` T3：`coverMode` true、`todayMovieId` 来自 `resolveTodayMovieId`                                                                                                        |
| Drawer 分享 URL 新 tab 可复现      | **满足（单测）** | `shareLinks.spec.ts`：`buildMovieSharePageUrl` → `/movie/:id` + query；`DrawerMovieShare` 使用同一 builder + clipboard                                                                       |
| 静态 rewrite 不吞 `/data/*`、OG    | **满足**         | `public/_redirects` 仅 `/movie/*`、`/today`；`spaRedirects.spec.ts` 断言无 `/data/` rewrite；`public/_headers` 含 `/data/og-today.png` cache；`verify-spa-fallback-dist.mjs` build 后 **ok** |

**自动化验证（34.1 执行日）**

| 命令                                                                                                 | 结果                                                                     |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `vitest run` 子集：`routes` · `routeControllerSync` · `routeActions` · `shareLinks` · `spaRedirects` | **28/28** 通过                                                           |
| `npm run build -w frontend`                                                                          | 通过；`[spa-fallback-dist] ok`；`og-today-image-cache-bust` v=2026-05-08 |

**已知限制（不阻塞 34.2+）**

| 项                       | 说明                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| 生产深链刷新手测         | P30.8 未在本机 CF preview 复验 R1–R8；契约由 `_redirects` + dist 脚本兜底                             |
| 全路径 per-route OG meta | Phase 30 **明确不做**；静态 `index.html` 共用 OG — 34.3 再定 movie 策略                               |
| `og-today.png` 仓库      | 构建期由 cron/`render_og_today.py` 产出；`public/data/` 可能无提交副本，dist 构建仍带 cache-bust 插件 |

**对后续 TODO 的约束（自 Phase 30 继承）**

- **34.2–34.4**：不得破坏 `/today` 与 `/movie/:id` 深链；OG 强化在静态 meta + `og-today.png` 链路上进行。
- **34.5**：movie 深链 preview 默认共用静态 OG，除非明确接受动态 endpoint 成本。
- **34.7**：`_headers` 与 `_redirects` 与 Phase 30.7 一致扩展，不新增会 rewrite `/data/*` 的规则。

### 34.2 现有 OG 链路审计

**执行分支**：`feat/p34.2-og-current-audit`（2026-05-21）  
**状态**：**completed**（2026-05-21 验收通过）。

#### 34.2.1 审计范围与证据

| 审计项       | 路径 / 机制                                                  | 结论                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OG 渲染脚本  | `scripts/cron/render_og_today.py`                            | **健全**：1200×630 PNG；读 `today.json` + `galaxy_data.json`；原子写入；poster 拉取失败保留前日 PNG                                                                          |
| Cron 调用    | `nightly_vote_refresh.py` L508–511；`monthly_refit.py` L835+ | **已集成**：在 `write_today_json_after_galaxy_export` 之后调用 `render_og_today_after_galaxy_export`；失败仅 WARN                                                            |
| R2 上传      | `upload_galaxy_r2.py`                                        | **已集成**：`og-today.png` → `galaxy/og-today.png`，`Cache-Control: public, max-age=300, must-revalidate`；manifest `og_today_url` 带 `?v=<utc-date>`；prune **不删** OG PNG |
| 本地产物     | `frontend/public/data/og-today.png`                          | **gitignore**，不入仓；本机存在副本 ≈179 KB（2026-05-09 生成），与 `today.json` 日期 **2026-05-08** 一致                                                                     |
| HTML meta 源 | `frontend/index.html`                                        | 全站 **单一** `index.html`；无按路由分 meta                                                                                                                                  |
| Cache-bust   | `frontend/vite.config.ts` `ogTodayImageCacheBustPlugin`      | 构建期把 `og:image` / `twitter:image` 基 URL 替换为 `?v=YYYY-MM-DD`（优先 `today.json.date`，其次 `VITE_OG_TODAY_V`，否则 UTC 当天）                                         |
| Pages 缓存头 | `frontend/public/_headers` `/data/og-today.png`              | `max-age=300, must-revalidate`                                                                                                                                               |
| SPA rewrite  | `frontend/public/_redirects`                                 | 仅 `/movie/*`、`/today` → `index.html`；**无** `/data/*` rewrite                                                                                                             |
| CI 顺序      | `nightly_vote_refresh.yml`                                   | nightly Python → R2 upload → **`npm run build`**（此时 `today.json` + `og-today.png` 已写出）→ Pages deploy                                                                  |
| 灰度 GHP     | `deploy-pages.yml`（`push main`）                            | **不跑** `render_og_today`；依赖仓库/构建机上是否已有 `public/data/og-today.png`（通常无，仅靠历史 artifact 或手动生成）                                                     |

**构建验证（34.2 执行日）**

| 命令                                            | 结果                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `python scripts/cron/render_og_today.py --help` | 正常；默认 I/O 路径与文档一致                                                              |
| `npm run build -w frontend`                     | 通过；`[og-today-image-cache-bust] v=2026-05-08`；`[spa-fallback-dist] ok`                 |
| `today.json` ↔ `galaxy_data.json`               | `movie_id=301334`（*Una*）在 galaxy 中存在                                                 |
| `dist/index.html` meta                          | `og:image` / `twitter:image` → `https://themoviecosmos.com/data/og-today.png?v=2026-05-08` |

#### 34.2.2 `/today` 社交预览是否正确？

| 维度                         | 现状                                                                                                             | 评价                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **预览图**                   | 各路径 crawler 均读同一 `index.html` → 指向当日 `og-today.png`（卡面含 `today's pick · YYYY-MM-DD`、片名、海报） | **图语义正确**（展示当日 pick），但 **所有 URL 共用同一张图**                    |
| **og:title / twitter:title** | 固定 `The Movie Cosmos`                                                                                          | **未体现** “The Movie Today” 或当日片名                                          |
| **og:description**           | 固定品牌 + “Today's pick refreshes every UTC midnight”                                                           | 部分 today 语义，**非**当日电影标题                                              |
| **og:url**                   | 固定 `https://themoviecosmos.com/`                                                                               | **错误/弱化**：分享 `/today` 时 canonical 仍指向 apex，非 `/today`               |
| **cache-bust**               | meta 图 URL `?v=` 与 `today.json.date` 对齐（构建时）                                                            | **机制正确**；需保证 nightly **先**写 `today.json`+PNG **再** build（CI 已满足） |
| **CDN 陈旧图**               | PNG 300s TTL + meta `?v=` 日更                                                                                   | 风险可控；跨日仍依赖 nightly + 重建 index                                        |

**结论（/today）**：**部分正确** — 大图是当日 pick，但 **title/description/url 未路由化**；34.4 应强化 today 语义（至少 `og:url`→`/today`、title/description 与 UTC 日期/片名一致）。

#### 34.2.3 `/movie/:id` 是否只能得到通用 preview？

| 维度                   | 现状                                                    | 评价                                                                                         |
| ---------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| HTML                   | `/movie/:id` SPA fallback → **同一份** `index.html`     | 无 per-id meta                                                                               |
| og:image               | 仍为 **`og-today.png`（当日 pick 卡片）**               | **非通用品牌图，也非所分享电影** — 分享深链时预览图可能显示 **另一部** 当日电影              |
| og:title / description | 与首页相同                                              | **通用品牌文案**，不声称具体电影（符合 34.5「共用静态 OG」文案边界，但 **图** 与文案不一致） |
| 客户端                 | `frontend/src` **无** `document.title` / 动态 meta 注入 | 爬虫不执行 JS → 无补救                                                                       |

**结论（/movie/:id）**：**不是**「纯品牌通用 preview」，而是 **品牌 title + 当日 Today 卡片图**；对电影深链 **语义误导风险高**。34.3/34.5 需明确：改为共用 **品牌级** 静态 OG 图，或接受有限集合/动态 endpoint。

#### 34.2.4 需随 today 每日更新的资源

| 资源                                         | 更新触发                              | 消费者                                                               |
| -------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| `frontend/public/data/today.json`            | `pick_movie_today` / nightly          | 应用 runtime、`render_og_today`、**Vite cache-bust 读 date**         |
| `frontend/public/data/og-today.png`          | `render_og_today_after_galaxy_export` | `og:image` 直连 Pages `/data/og-today.png`；R2 `galaxy/og-today.png` |
| **构建产物** `dist/index.html` 内 `?v=`      | nightly 流水线内 `npm run build`      | 社交平台对 **HTML** 的 scrape（固定 URL 换 query）                   |
| `galaxy_assets_manifest.json` `og_today_url` | R2 upload                             | 运行时 manifest 消费者（非 crawler 主路径）                          |

**不同步风险（已观测）**

- 仓库内 `today.json` **date=2026-05-08**，`galaxy_assets_manifest.json` 中 `og_today_url` / `today_url` 为 **2026-05-10**（上次 R2 上传快照，**非**当前 `today.json`）— 仅影响 manifest 引用，**不**影响 `index.html` meta（构建读 `today.json`）。
- `push main` 的 `deploy-pages.yml` **不**再生 OG；若 CF 主部署亦未跑 nightly，线上可能缺新 PNG 或 meta `?v=` 与图不一致。

#### 34.2.5 对 34.3+ 的建议输入（非决策，供策略 TODO）

1. **`/today`**：保留现有 Pillow 链路；34.4 补 **路由级 meta**（`og:url`、`og:title`、description 与 `today.json` 对齐）。
2. **`/movie/:id`**：当前 **图** 不适合作为 movie 深链 preview；首版优先 **共用品牌静态 OG 图**（与 34.5 文案一致），或文档化「preview 显示 Today pick」为已知限制直至动态/有限集合方案。
3. **34.7**：已具备 PNG 短 TTL + meta `?v=`；需写清 R2 vs Pages 双源、nightly-only 重建 index、GHP 灰度路径缺口。

#### 34.2.6 审计命令留档

```bash
python scripts/cron/render_og_today.py --help
npm run build -w frontend
# dist meta（PowerShell）
Select-String -Path frontend/dist/index.html -Pattern "og:|twitter:"
```

### 34.3 社交预览策略决策

明确三种候选方案：

1. **共用静态 OG**：所有 `/movie/:id` 共用品牌级图片和描述，成本最低。
2. **有限集合生成**：构建或 cron 只生成 today、热门电影、最近分享电影等有限集合。
3. **动态 endpoint**：使用 Vercel Edge/Serverless 根据 id 生成或返回 per-movie OG。

建议首版：

- `/today` 使用现有 today OG 链路并强化正确性。
- `/movie/:id` 先使用通用电影分享 OG，除非明确接受动态 endpoint 或批量预渲染成本。

### 34.4 `/today` OG 强化

目标：确保 `/today` 至少有正确 today 语义。

检查点：

- OG title 包含 The Movie Today 或当前产品语义。
- OG image 指向 `og-today.png` 且带 cache-bust。
- UTC 日期、today movie id、poster、genre palette 一致。
- poster fetch 失败时有可接受 fallback，不输出破图。
- today 变更后 CDN 不长时间缓存旧图。

### 34.5 `/movie/:id` OG 策略落地

首版必须明确边界。

如果选择共用静态 OG：

- 所有 movie deep link 有稳定品牌预览。
- 文案不声称是具体某部电影。
- Drawer 分享正文仍可包含具体电影标题；社交 crawler preview 则共用。

如果选择有限集合或动态 endpoint：

- 定义生成范围。
- 定义缓存键和失效策略。
- 定义失败 fallback。
- 定义部署成本与回滚路径。

### 34.6 分享平台验证

验证平台：

- X / Twitter。
- Facebook。
- Telegram。
- Reddit。
- Discord。
- Email 客户端基本 fallback。

验证内容：

- 分享 URL 是否保留 `/today` 或 `/movie/:id`。
- 文案编码是否正确。
- image/title/description 是否刷新。
- cache-bust 是否生效。
- 平台 crawler 是否因静态 rewrite 拿到正确 HTML。

### 34.7 部署与缓存策略

静态部署下重点处理：

- `og-today.png` 的 cache-control。
- meta 图片 URL 的 version query。
- R2/CDN 与 Vercel/static hosting 的资源路径一致性。
- `/data/*` 不被 SPA fallback rewrite。
- 回滚时旧图、旧 meta 与 today state 不互相打架。

### 34.8 测试与验收

建议命令：

- `python scripts/cron/render_og_today.py --help`
- 使用实际参数生成 today OG 的 dry run 或本地产物。
- `npm run lint -w frontend`
- `npm run build -w frontend`

验收标准：

- `/today` 有正确 today 预览图和 meta。
- `/movie/:id` 的 preview 策略被明确实现或记录为共用 OG。
- 分享平台至少抽样验证 3 个主要平台。
- cache-bust 和部署缓存策略明确。
- 不因社交预览破坏 Phase 30 深链刷新。

## Phase 34 交付物

- `.cursor/plans/phase_34_social_preview_distribution.plan.md`
- OG 当前链路审计记录。
- `/today` OG 强化或确认。
- `/movie/:id` OG 策略决策。
- 分享平台验证矩阵。
- 部署/cache-control/cache-bust 说明。
- 剩余成本与风险记录。