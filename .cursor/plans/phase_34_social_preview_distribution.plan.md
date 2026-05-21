---
name: phase 34 social preview distribution
overview: Phase 34 以 Phase 30 稳定深链为前置，规划并落地 `/today` 与 `/movie/:id` 的社交预览策略。首版可接受电影链接共用静态 OG，但必须明确 today OG、movie OG、动态/静态生成成本与部署边界。
todos:
  - id: p34-plan-doc-preflight
    content: 34.1 创建并维护 `.cursor/plans/phase_34_social_preview_distribution.plan.md`，确认 Phase 30 深链已稳定
    status: completed
  - id: p34-og-current-audit
    content: 34.2 审计现有 today OG 链路、HTML meta、cache-bust 与部署产物
    status: pending
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

审计范围：

- [scripts/cron/render_og_today.py](scripts/cron/render_og_today.py)
- `frontend/public/data/today.json`
- `frontend/public/data/og-today.png`
- HTML `og:image`、`twitter:image`、title、description meta。
- 构建或 cron 中是否调用 `render_og_today.py`。
- CDN/cache-control/cache-bust 行为。

输出：

- 当前 `/today` 预览是否正确。
- 当前 `/movie/:id` 是否只能得到通用 preview。
- 哪些资源需要随 today 每日更新。

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