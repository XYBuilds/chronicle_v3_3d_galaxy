# Phase 40.7 P40.7 本地集成与发布候选验证实施报告

## 1. 验收结论

Phase 40.7 已完成技术验收，并经人工确认接受本阶段记录的流程偏差。

主站 release candidate、OG Worker、OG Index v1 → v2 合成 migration、Daily Stargazing `/movie/:id` 发布链接均通过验证。三仓库未产生产品代码 diff。

首轮主站 preview 按 committed manifest 匿名读取了两项公开生产 R2 资产，违反了本阶段“完全本地、不访问生产 R2”的执行边界。该访问没有使用凭据，没有调用 Cloudflare API，没有访问 KV，也没有执行写入、删除、部署或 migration。后续已使用 synthetic fixture、localhost-only server、CSP 与浏览器网络阻断完成 clean rerun。人工决定接受技术验收并保留偏差记录，不将历史事件改写为“全程未访问生产”。

Phase 40.8 仍为 pending；本阶段未执行任何生产发布、对象清理或 scheduled Gate。

## 2. 验证基线

| 仓库 | Commit | 验证分支 |
| --- | --- | --- |
| 主站 | `ec98ec8eed24b0b9947a42a5dc0e05c60da420d9` | `test/p40.7-integration-verification` |
| OG Worker | `2e026dceba840d3778fa79e64eab3e1b75ad12c8` | `main` |
| Daily Stargazing | `1edaa3169387c6ab67ff502a087f5719d01d4e8d` | `main` |

验证结束时三仓库 staged/unstaged diff 均为空；Daily Stargazing 保持只读、零 diff。

## 3. 主站 release candidate

### 3.1 自动化与构建

- `npm test`：37 个 test files、259 个 tests 全部通过。
- `npm run lint`：通过。
- `npm run build`：通过，包含 TypeScript build、Vite production build、文件尺寸检查和 SPA fallback/dist Today guard。
- Phase 40 retirement/documentation 聚焦测试：7 项通过。

构建只报告既有的大型本地 galaxy 文件和主 chunk 体积警告；命令退出码为 0，Today dist guard 通过。

### 3.2 完全本地 smoke

clean rerun 使用 3 部影片的 synthetic galaxy/search fixture、临时 manifest 和仅监听 `127.0.0.1:4174` 的本地 server。验证层同时采用：

- CSP 限制为 self；
- 浏览器 CDP 阻断 `https://*`；
- 页面层拒绝并记录非 localhost 的 fetch/XHR/WebSocket/beacon；
- Tally widget 使用本地 stub；
- 验证结束后停止 server、关闭页面并删除临时 fixture。

最终资源列表全部来自 `http://127.0.0.1:4174/`，外部资源列表和外联尝试日志均为空。

通过的 smoke：

- `/`：data/search-index terminal 后进入 galaxy idle，HUD、搜索和时间轴可用，Drawer 未打开。
- `/movie/550`：进入普通 focus，Drawer 显示 `Fight Club`。
- 关闭 Drawer：返回 `/`，恢复 galaxy idle。
- `/movie/not-a-real-id`：normalize 到 `/`。
- 搜索：`Fight Club` 可检索并清除。
- 时间轴：键盘操作可将值推进到 fixture 上限 2020。
- idle picking：在 `/` 的真实 WebGL canvas 中央约 `(470.5, 633)` 发出真实 click，URL 从 `/?p407=5` 变为 `/movie/550?p407=5`，Drawer 打开；未直接调用 store、history 或搜索结果模拟选片。
- 网络请求：clean rerun 未出现 Today 请求或外部请求。

前端 retirement tests 同时锁定 boot、scene、shader 和 picking 文件中不存在 `uCover`、`coverMode`、`todayMovieId`、`exitCover` 等 Today/Cover 运行时分支。

## 4. OG Worker release candidate

- `npm test`：4 个 test files、35 个 tests 全部通过。
- `npm run typecheck`：通过。
- 路由/meta 聚焦矩阵：31 项通过。

验证结果：

- 品牌 OG：非 canonical version 重定向正常；canonical GET/HEAD 返回 `image/png`，HEAD 无 body。
- 代表性电影 OG：`/og/movie/550.png` 的 version、GET/HEAD、PNG 行为正常；mock 只读取 `meta:G` 与 `movie:550`。
- 电影 HTML meta：`/movie/550?lang=zh` 在 HTML Accept 下返回电影 canonical/OG metadata。
- `/today` 与 `/og/today.png`：GET/HEAD、query、HTML/image/通配 Accept 代表矩阵返回真实 404；未回退至 SPA、电影或品牌 PNG，未读取 KV。
- Worker runtime 只保留 `meta:G` 与 `movie:{id}` KV 协议，不存在 KV `today`、Today meta/PNG/version 分支。

未运行 `npm run dry-run`：该入口会执行环境同步并可能改写 `wrangler.toml`，同时依赖本地 Cloudflare 环境；本阶段没有满足可证明零副作用的运行条件。未运行 `npm run deploy`。

## 5. OG Index v1 → v2 合成 migration

相关主站测试共 36 项通过；执行顺序和 application boundary 聚焦测试另有 8 项通过。

合成 fixture：

- v1 snapshot：2 部电影；
- current/v2 输入：1 部电影；
- summary：`movie_delete=1`、`today_delete=1`、`total_delete=2`；
- movie delete、Today delete 分别为 1 个 batch。

锁定顺序：

1. 严格前置校验；
2. movie PUT；
3. movie DELETE；
4. movie read-back；
5. KV `today` DELETE；
6. KV `today` read-back missing；
7. `meta:G` PUT/read-back；
8. v2 R2 checkpoint commit。

普通 scheduled sync 在 v2 缺失时 fail-closed，不读取 v1；只有显式 `migrate_v1=True` 可读取 v1，已有 v2 时拒绝重复 migration。

所有 KV/R2 边界均由 test doubles 承担。dry-run 与无凭据分支中 KV PUT/DELETE/read-back 和 checkpoint commit 均为 0 个真实网络调用；未触碰生产对象。

## 6. Daily Stargazing 深链验证

发布链的默认前缀仍为：

`https://themoviecosmos.com/movie/`

数据流保持为 candidate `movie_url` → `retrieve.json` → selection → publication bundle → platform copy links。聚焦测试覆盖：

- tmdb `429918` 的 publication copy；
- tmdb `157336` 的 candidate/compose fixture；
- tmdb `42` 的 pipeline deep-link 断言。

5 项深链/发布链接聚焦测试全部通过，确认链接为 `/movie/:id`，没有恢复 `/today`。

### 6.1 已识别的独立非稳定缺陷

较宽的 publication 测试集曾出现 `153 passed / 1 failed`：

`tests/test_publication_adapter.py::PublicationAdapterTests::test_failure_is_isolated_and_other_targets_remain_ready`

只读诊断确认失败点为 Windows 上 `publication_bundle.write_manifest()` 执行 `os.replace()` 时偶发 `PermissionError: [WinError 5] Access is denied`。20 次全 mock、多 artifact 诊断中出现 3 次 drafts 状态误记为 failed；单 drafts target 40 次均为 ready。

该问题影响 Daily publication manifest 持久化可靠性，但不读取、构造或改写 `movie_url`，不推翻已通过的 `/movie/:id` 契约。按 40.7 的 Daily 只读边界未修改该仓库；后续应由独立 Daily 任务为 `os.replace` 增加有界短退避重试及 transient `PermissionError` 测试。

## 7. 已接受的 R2 只读流程偏差

首轮 preview 使用 committed manifest，浏览器匿名 GET 了：

- `https://pub-f949433b3a004a35b0a5e38f8f508c57.r2.dev/galaxy/galaxy_data.json.gz?v=2026.05.10.daily.30`
- `https://pub-f949433b3a004a35b0a5e38f8f508c57.r2.dev/galaxy/galaxy_search_index.json.gz?v=2026.05.10.daily.30`

现有证据支持：

- 请求来自浏览器按 manifest 加载 galaxy/search assets 的普通 asset fetch；
- 使用匿名 GET；
- 未使用 Cloudflare 凭据；
- 未调用 Cloudflare API；
- 未见 PUT、DELETE、POST 或其他 mutation；
- 未访问 KV；
- 未执行 migration、workflow 或 deploy。

首轮原始浏览器网络事件已不可重新导出，因此不声称仅凭历史日志可以绝对证明不存在任何其他请求。代码路径、保留的请求记录和仓库状态只支持“上述公开资产发生匿名 GET，未见 mutation”的结论。

后续 clean rerun 已改用完全本地 synthetic fixture 并显式阻断外网，所有功能 smoke 通过。人工接受该偏差并要求保留本节记录。

## 8. Phase 40.8 checklist 输入

### 8.1 待发布提交

- 主站 release candidate：以合入本报告后的 `main` 为准；40.7 验证基线为 `ec98ec8eed24b0b9947a42a5dc0e05c60da420d9`。
- OG Worker：`2e026dceba840d3778fa79e64eab3e1b75ad12c8`。
- Daily Stargazing：`1edaa3169387c6ab67ff502a087f5719d01d4e8d`。

### 8.2 Workflow 与部署入口

- `.github/workflows/nightly_vote_refresh.yml`：nightly 增量 OG sync 与 galaxy assets upload。
- `.github/workflows/monthly_refit.yml`：monthly refit、增量 OG sync 与 galaxy assets upload。
- `.github/workflows/deploy-pages.yml`：retired GitHub Pages manual smoke，不作为当前生产发布链。
- OG Worker 生产入口：`npm run deploy` → `scripts/deploy.ps1` → 环境同步 → `npx wrangler deploy`；40.8 获得单独授权前不得运行。

### 8.3 人工 Gate 对象

- KV：`today`。
- R2 Today：`galaxy/today.json`。
- R2 legacy checkpoint：`ops/og-index/state-v1.json.gz`。
- R2 v2 checkpoint：`ops/og-index/state-v2.json.gz`。
- 保护对象：`galaxy/galaxy_data.json.gz`、`galaxy/galaxy_search_index.json.gz` 及当前 galaxy/search manifest/version 语义。

### 8.4 URL 与缓存 smoke

- `/`：GET 后 data/search-index terminal → galaxy idle；无 Today request。
- 有效 `/movie/:id`：进入 focus；关闭 Drawer 回 `/`。
- 无效 `/movie/:id`：normalize 到 `/` idle。
- 品牌 OG：version redirect、canonical GET/HEAD 200 PNG。
- 电影 OG/meta：代表性电影 GET/HEAD、HTML Accept、canonical metadata 正常。
- `/today`、`/og/today.png`：base/query × GET/HEAD × HTML/image/通配 Accept 均为 404，不发生 shell/movie/brand fallback 或 KV read。
- 清理 Today OG edge-cache query/Accept 变体后复测 404。

## 9. 未执行事项

- 未部署主站、OG Worker 或 Daily Stargazing。
- 未运行 `workflow_dispatch`。
- 未执行真实 v1 → v2 migration。
- 未访问或修改生产 KV。
- 未修改、删除或上传生产 R2 对象。
- 未清理生产 cache。
- 未恢复 scheduled workflow。
- 除第 7 节已记录的公开 R2 匿名 GET 外，后续 clean rerun 没有外部网络访问。