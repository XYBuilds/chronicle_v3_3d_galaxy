# Phase 40.1 / P40.1 The Movie Today 退役契约基线实施报告

## 交付范围

本 TODO 只锁定退役前基线与后续删除边界，不删除 Today 功能，不修改生产 KV、R2、缓存或 workflow 状态。

新增：

- `scripts/tests/phase40_retirement_baseline.fixture.json`：三仓库提交、路由矩阵、WebGL 非 Today 不变量、生产遗留对象、删除阶段与回滚边界。
- `scripts/tests/test_phase40_retirement_baseline.py`：校验退役面完整性、GET/HEAD/Accept/query 契约、清理延后规则及敏感字段防护。

## 仓库基线

| 仓库 | 分支 | HEAD | 状态 |
| --- | --- | --- | --- |
| Chronicle 主站 | `chore/p40.1-contract-baseline` | `ff7ec837856e0b7a6257554816b6b03f5fba8cb7` | 初始干净；Phase 39 已合并 |
| OG Worker | `main` | `57efb42bd6e29bc5b09c26c441b720bbfa681698` | 干净 |
| Daily Stargazing | `main` | `1edaa3169387c6ab67ff502a087f5719d01d4e8d` | 干净；电影深链前缀保持 `/movie/` |

重点保护的 `scripts/tests/test_sync_og_index_kv.py` 在 Worker 开始前无用户脏改动，本 TODO 未修改该文件。

## 锁定的契约

- `/`：退役前仍进入 Today cover；Phase 40 目标为 galaxy idle。
- `/movie/:id`：有效电影保持 focus；无效电影规范化回 home，后续不得再触发 Today fallback。
- `/today`：退役前 HTML GET 为 `200`；目标为 GET/HEAD、Accept 与 query 变体统一返回真实 `404`，且不读取 KV、不 fetch SPA shell。
- `/og/today.png`：退役前无版本请求重定向到 canonical version；目标为 GET/HEAD/query 变体统一返回 `404`，不得回退品牌图。
- 普通 idle/focus 的 macro blend、fade、selected planet、constellation 等非 Today 行为作为后续 WebGL 删除工作的保护边界。

## 生产遗留对象与清理边界

fixture 已定位以下对象或协议：

1. R2 `galaxy/today.json`。
2. assets manifest `today_url` 与 `r2_object_keys.today`。
3. KV `today`。
4. R2 `ops/og-index/state-v1.json.gz`。
5. Today OG canonical URL/version 与边缘缓存。
6. nightly `0 20 * * *` UTC、monthly `0 20 1 * *` UTC 的 Today 生产接线。

所有远端删除均延后到 40.8 人工 Gate。KV `today` 的实际值、私有 v1 checkpoint 的对象元数据未使用生产凭据读取，将在获授权的迁移审计中确认。

## 验证结果

| 范围 | 结果 |
| --- | --- |
| 主站 Python 聚焦测试 | `54 passed` |
| 主站前端完整测试 | `37 files / 265 tests passed` |
| OG Worker 测试 | `3 files / 22 tests passed` |
| OG Worker typecheck | 通过 |
| Daily Stargazing 深链相关测试 | `22 passed` |
| 新增文件诊断与 `git diff --check` | 通过 |

本 TODO 未部署、未触发 workflow、未修改远端对象，也未读取原始大 CSV。