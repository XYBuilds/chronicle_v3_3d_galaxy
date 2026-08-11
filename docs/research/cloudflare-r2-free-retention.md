# Cloudflare R2 免费保留每日 Galaxy Release 调查

日期：2026-08-11
问题：Chronicle 当前使用什么对象存储？如果每天保留一套不可变的 galaxy/search release，能否一直免费？

## 结论

Chronicle 使用 **Cloudflare R2 Standard** 存放 Galaxy 大型 gzip。R2 对单 bucket 的总容量和对象数量没有硬上限，已完成上传的普通对象也不会因默认规则自动过期，所以技术上可以长期保留；但按当前约 **59.63 MB/天** 的增长量，**不能在免费额度内永久保留每天的全部 release**。

Cloudflare 当前给 R2 Standard 的免费存储额度是每月 **10 GB-month**。若 bucket 从空开始、每天成功发布一次且文件大小不变，存量约在第 **168 天**达到 10 GB；由于实际计费是一个 30 天账期内“每日峰值存储”的平均值，恰好从账期第一天开始时，前六个账期仍在免费额度内，第七个账期首次超出。现有 bucket 已使用的容量、同一账户的其他 R2 用量、数据增长和实际账期边界都会让这个时间提前。

如果“保持 $0”是硬约束，建议采用**有界、manifest-aware 的保留策略**：先设 8 GB 左右的内部预算；永久保护线上 manifest 当前引用的 release，保留有限数量已验证的 rollback release，超过预算后只删除未被引用的旧 release。以当前体积保留最近 120 套日更 release 约占 **7.16 GB**，给 profile、OG checkpoint、数据增长和其他对象留出约 2.84 GB 余量。清理器落地前可以暂不删除，但应设置容量检查；不能把“暂时全部保留”理解成可永久免费。

## 仓库事实

- [nightly workflow](../../.github/workflows/nightly_vote_refresh.yml) 每日执行，并向脚本注入 `R2_ACCOUNT_ID`、`R2_BUCKET` 等 R2 配置。
- [R2 uploader](../../scripts/cron/upload_galaxy_r2.py) 为每次内容发布生成 `galaxy/releases/<version>-<content-id>/...` 的独立 key，分别上传 `galaxy_data.json.gz` 与 `galaxy_search_index.json.gz`，并为这些对象设置一年 `immutable` 缓存语义。
- workflow 中的 `R2_GALAXY_PRUNE_AFTER_UPLOAD=1` 容易被误解。脚本的 `_maybe_prune()` 只删除 runner 本地 `frontend/public/data/` 下的三个大文件，避免它们进入 Pages bundle；它**没有**列举或删除 R2 上的历史 release。
- 最近一次有明确体积证据的生产验收记录为 galaxy gzip **38,239,840 bytes**，search gzip **21,389,576 bytes**，合计 **59,629,416 bytes**。[生产管线恢复报告](../reports/Phase37-production-pipeline-health-recovery-report.md)
- 仓库无法证明 Cloudflare Dashboard 中当前 bucket 已占用多少容量、bucket 默认 storage class 是否曾被人工改动、或是否存在人工配置的 lifecycle rule。因此本报告的 runway 是从 0 开始的模型，不是账号余额审计；最终决定前应从 Dashboard 补录当前 `Storage used` 和 lifecycle 配置。

## Cloudflare 当前规则

截至调查日，Cloudflare 官方 [R2 Pricing](https://developers.cloudflare.com/r2/pricing/) 规定：

- Standard storage：**$0.015 / GB-month**；
- 免费额度：每月 **10 GB-month** Standard storage、100 万次 Class A、1,000 万次 Class B；
- 免费额度只适用于 Standard，不适用于 Infrequent Access；
- `PutObject`、`ListObjects` 等属于 Class A，`GetObject`、`HeadObject` 等属于 Class B，删除对象免费；
- 直连 R2 的公网 egress 免费，但读取仍会计入 Class B；“流量费为零”不等于“读取请求无限免费”；
- GB-month 按 30 天账期内每日峰值存储的平均值计算，账单用量会向上取整到下一个计费单位。

当前日更只产生两个主要 release 对象，即使底层 multipart upload 产生多个操作，写入量仍远低于每月 100 万次 Class A；存储增长是这一问题的首要约束。Class B 是否保持免费取决于实际用户读取量，不能仅凭仓库判断。

Cloudflare 官方 [R2 Limits](https://developers.cloudflare.com/r2/platform/limits/) 将单 bucket 的数据容量和对象数量都列为 `Unlimited`，单对象上限约 5 TiB。这里没有阻止长期保留的容量上限，但“无限容量”不等于“无限免费容量”。该页面也明确区分 GB（十进制）与 GiB（二进制）。

官方 [Object Lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) 说明，bucket 的默认 lifecycle 只会在七天后终止**未完成的 multipart upload**。对已成功上传的普通对象，只有显式配置删除型 lifecycle rule 或主动删除才会移除；删除型规则生效后通常在 expiration 后 24 小时内完成。也就是说，Cloudflare 不会替本项目自动清理已完成的每日 release。

官方 [Bucket Locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/) 可以为对象设置保留期并阻止提前删除，而且 lock 优先于 lifecycle。它适合保护少量明确 pin 的关键回滚对象，但不应无限期锁住整个 daily release 前缀：那会使免费预算清理无法执行。

官方 [Storage Classes](https://developers.cloudflare.com/r2/buckets/storage-classes/) 说明 Standard 是新 bucket 的默认 storage class。把旧 release 转入 Infrequent Access 不能帮助实现“永久免费”：R2 免费额度不适用于 IA，且 IA 有读取费与 30 天最低存储期。

## Runway 计算

以生产验收的两个 gzip 为基准：

```text
每日新增 = 38,239,840 + 21,389,576
         = 59,629,416 bytes
         = 59.629416 MB（十进制）
         = 56.867043 MiB（二进制）

30 天新增 = 1.78888248 GB = 1.66602664 GiB
365 天新增 = 21.76473684 GB = 20.26999075 GiB

10 GB / 59,629,416 bytes ≈ 167.70 天
```

Cloudflare 的价格页使用 `GB-month`，因此主计算按十进制 10,000,000,000 bytes 处理。若错误地把免费额度理解成 10 GiB，则约能容纳 180 套；这不是本报告采用的计费口径。

假设从空 bucket 开始、账期固定为 30 天、每天上传发生在当日峰值统计之前，前七个账期的平均存储约为：

| 30 天账期 | 平均存储（GB） | 是否超过 10 GB-month |
| --- | ---: | --- |
| 1 | 0.924 | 否 |
| 2 | 2.713 | 否 |
| 3 | 4.502 | 否 |
| 4 | 6.291 | 否 |
| 5 | 8.080 | 否 |
| 6 | 9.869 | 否 |
| 7 | 11.658 | 是 |

一年后存量约 21.76 GB。忽略其他对象和请求费用时，第一年末所在月份的超额 Standard storage 约 10.6–11.8 GB-month，对应约 **$0.16–$0.18/月**；实际账单还受 Cloudflare 向上取整、账期边界和其他 R2 用量影响。金额很小，但不再是免费。

## 三种保留方案

### 1. 全部永久保留

优点是发布和回滚模型最简单，任何历史 manifest 都有机会继续工作。R2 不会默认删除完成对象，也没有 bucket 容量/对象数硬上限。

缺点是存储单调增长，约五个半月后达到 10 GB 存量，并大约从第七个完整账期开始收费。它适合“接受极低费用”，不适合“必须永远 $0”。

### 2. 固定年龄 lifecycle

例如 90 天固定保留约 5.37 GB，120 天约 7.16 GB，150 天约 8.94 GB。配置简单，并能给存储设硬上界。

但它不了解生产 manifest。若发布链故障超过保留期，线上 manifest 仍可能引用最后一次成功 release，而 lifecycle 会按年龄把该 release 删除，网站随后失去数据。因此不能直接对整个 `galaxy/releases/` 前缀设置无条件固定过期，除非另外建立永不删除的 active key/前缀并修改发布合同。

### 3. Manifest-aware cleanup（推荐）

清理前读取线上生产 manifest 和 active profile pointer，建立保护集合，再只删除：

- 未被当前 manifest 引用；
- 未被明确 pin 为 rollback；
- 超出数量、年龄或 8 GB 内部预算；
- 且已通过 dry-run 清单复核的旧 release。

为保持永久免费，保留集合本身也必须有界；“永久 pin 每个月版本”最终同样会超过 10 GB。建议初始目标为最近 **120 套成功 release + 当前 active release**（当前已在最近 120 套中时不重复计算），并以实际总字节数而不是日期作为最终 gate。数据体积增长或同账户其他 R2 用量增加时，应进一步缩短窗口。

## Q7 建议表述

> 为保持 Cloudflare R2 免费，不永久保留每天的全部 immutable release。短期维持现状并检查 Dashboard 的当前总用量；随后实现 manifest-aware cleanup，以约 8 GB 为内部上限，始终保护当前生产 manifest 和有限数量 rollback release，初始保留最近 120 套成功日更。不要对整个 release 前缀直接设置固定年龄删除，也不要把旧对象迁入没有免费额度的 Infrequent Access。

价格和免费额度属于供应商当前政策，不是永久承诺；即使采用有界清理，也应至少每年复查一次官方价格与实际用量。

## 官方来源

- Cloudflare R2 Pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare R2 Limits: https://developers.cloudflare.com/r2/platform/limits/
- Cloudflare R2 Object Lifecycles: https://developers.cloudflare.com/r2/buckets/object-lifecycles/
- Cloudflare R2 Bucket Locks: https://developers.cloudflare.com/r2/buckets/bucket-locks/
- Cloudflare R2 Storage Classes: https://developers.cloudflare.com/r2/buckets/storage-classes/
