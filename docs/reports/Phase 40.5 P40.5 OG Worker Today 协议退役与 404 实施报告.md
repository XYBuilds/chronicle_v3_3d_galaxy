# Phase 40.5 / P40.5 OG Worker Today 协议退役与 404 实施报告

## 交付范围

本 TODO 在独立 OG Worker 仓库移除 The Movie Today 的运行时协议，包括 KV `today` 读取、Today HTML meta、Today PNG handler、日期参与的 version/hash 计算，以及卡片中的 `today's pick` 专属渲染分支。

`/today`、`/og/today.png` 及 query 变体不再进入 HTML、PNG 或品牌 fallback，GET/HEAD 均由 Worker 未注册路由返回 `404 Not Found`。`/share/today` 作为旧分享入口同样保持未知路由 404，防止回退到 SPA shell。

本 TODO 未部署 Worker、未访问生产 KV/R2、未清理边缘缓存。生产发布和线上 URL 验证仍属于 40.8 人工 Gate。

## 退役后的 Worker 边界

- 删除 KV `today` key、record parser 与运行时读取。
- 删除 Today HTML path matcher、标题/meta builder 与 SPA shell 注入 handler。
- 删除 `/og/today.png` handler、Today 内容指纹及日期 cache-bust 逻辑。
- 删除电影卡片中的 Today overline 输入和渲染分支。
- 未注册路由统一保留 GET 文本 404 与 HEAD 空 body 语义。
- `themoviecosmos.com/today*` 仍需绑定 Worker，作为 Pages SPA fallback 之前的退役 URL guard；该绑定不恢复任何 Today 业务能力。

## 非 Today 不变量

以下能力保持原契约：

- `/og/brand.png` 的 canonical version redirect、PNG 响应与 HEAD 行为。
- `/og/movie/:id.png` 的 KV `meta:G` / `movie:*` 读取、内容版本、PNG 渲染与 HEAD 行为。
- movie KV miss 或 `meta:G` 缺失时的品牌 PNG fallback。
- `/movie/:id` 的 HTML Accept negotiation、SPA shell meta 注入、canonical URL 与品牌 meta fallback。
- PNG cache headers、poster fallback 和普通 movie hash golden fixture。

## 404 回归矩阵

路由测试覆盖 `/today` 与 `/og/today.png` 的 GET/HEAD、无 query/有 query，以及 `Accept: text/html`、`image/png`、`*/*`。测试同时锁定：

- 状态为 `404 Not Found`。
- GET body 为 `Not Found`，HEAD body 为 `null`。
- 响应不具有 HTML 或 PNG Content-Type。
- 不读取 `OG_INDEX` KV。
- 不 fetch SPA shell。
- 不调用品牌或电影 PNG renderer。

另覆盖 `/share/today` 与 query 变体的 GET/HEAD，确认旧分享入口不会进入任何活动路由。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm test` | 4 files passed，35 tests passed |
| `npm run typecheck` | 通过 |
| 受影响 TypeScript 文件诊断 | 未发现错误 |
| `git diff --check` | 通过 |
| `npm run dry-run` | 未运行；本地无 `.env`，且未执行部署 |

## 跨仓交付记录

- OG Worker 基线：`57efb42bd6e29bc5b09c26c441b720bbfa681698`
- 实现提交：`f2be6f82157d1f3527dcfb47c67919e0f7fdde42`
- PR：[XYBuilds/themoviecosmos-og-worker#5](https://github.com/XYBuilds/themoviecosmos-og-worker/pull/5)
- Merge commit：`2e026dceba840d3778fa79e64eab3e1b75ad12c8`
- 合并后 OG Worker `HEAD`、`main`、`origin/main` 均为上述 merge commit；任务分支已在本地和远端删除。
- Deploy version：未产生；由 40.8 人工 Gate 部署后记录到 Phase 40 最终报告。