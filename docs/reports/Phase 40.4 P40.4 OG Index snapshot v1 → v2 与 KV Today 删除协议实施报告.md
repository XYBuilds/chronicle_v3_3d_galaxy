# Phase 40.4 / P40.4 OG Index snapshot v1 → v2 与 KV Today 删除协议实施报告

## 交付范围

本 TODO 将 OG Index committed snapshot writer 从 schema v1 迁移为不含 Today control 的 schema v2，并提供一次性、显式的 `--migrate-v1` 入口删除 KV `today`。普通 nightly/monthly sync 仅接受 v2 checkpoint；缺失或损坏时快速失败，不自动读取 v1、执行 full recovery 或隐式迁移。

本 TODO 未访问 Cloudflare 生产环境、未执行 workflow、未删除 R2 v1 checkpoint。真实迁移与 v1 对象清理由 40.8 人工 Gate 完成。

## Snapshot v2 契约

新 writer checkpoint 固定为：

- `schema_version: 2`
- `projection_version: og-index-v2`
- R2 key `ops/og-index/state-v2.json.gz`
- `control` 仅包含 `meta_g_value`

v2 build、parse、validate 和 diff 均严格拒绝 v1 shape、Today control、额外字段、布尔或浮点 schema version，以及非法 movie hash/key。R2 writer 只写 v2 key；legacy reader 只在显式迁移路径读取 `ops/og-index/state-v1.json.gz`，并严格校验 v1 Today payload、movie hashes 与 `meta:G`。

## 显式迁移与副作用顺序

`--migrate-v1` 在 v2 checkpoint 不存在时读取 v1，以旧 movie hashes 作为 deletion-safe diff baseline，并以当前 `galaxy_data.json` 构造完整 v2 candidate。所有输入、candidate、mutation plan、配额和凭据在写操作前完成 fail-closed 校验。

执行顺序固定为：

1. 应用 movie PUT/DELETE。
2. read-back 核对 movie PUT 值与 DELETE 缺失。
3. 删除 KV `today` 并 read-back 确认 missing。
4. 最后写入并核对 `meta:G`。
5. 提交 v2 checkpoint。

任一步失败都不会提交 v2 checkpoint，也不会删除 v1 对象。若最终 checkpoint commit 失败，下一次可继续从仍存在的 v1 幂等重放。迁移的 `today` DELETE 已独立计入 destructive mutation summary、batch count 与 delete quota，不能绕过配额。

## Scheduled 与非 Today 不变量

- Nightly/monthly workflow 删除旧 P38 `bootstrap_og_index` input、环境变量和 `--bootstrap-remote-audit` 参数。
- Scheduled 与普通 manual workflow 固定执行 `--scope incremental`，不暴露 `--migrate-v1`、full recovery 或 over-quota 权限。
- 普通 v2 incremental 只同步 `movie:*` 与 `meta:G`，不会读取、写入、删除或核对 KV `today`。
- Full recovery 继续要求显式授权、远端 movie key 审计和最终完整 keyset 核对；统计保留真实远端 previous count。
- KV bulk batching、read-back retry、凭据映射、R2 missing/corrupt/repository error 分类、deterministic gzip 与 required metadata 保持。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| P40.4 schema/R2/KV/sync/workflow 聚焦 pytest | 55 passed，38 subtests passed |
| `python -m pytest -q scripts/tests` | 102 passed，40 subtests passed |
| 修改模块 `python -m compileall -q` | 通过 |
| Nightly/monthly workflow YAML parse | 通过 |
| 受影响文件诊断 | 未发现阻塞错误 |
| `git diff --check` | 通过 |

测试覆盖 v2 严格 schema、显式 v1 migration、普通 v2 no-op/delta、D5 精确副作用顺序、movie/Today/meta/read-back/commit 各失败分支、commit 失败后的 v1 幂等重放、配额与批次边界、full recovery 最终 keyset、R2 v1/v2 key 隔离，以及 scheduled workflow 的 v2-only 契约。