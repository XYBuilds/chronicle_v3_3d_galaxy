# Phase 20.4 — R2 Cache-Control 与 manifest 缓存语义（实施报告）

**范围：** 对照 [.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md](../../.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md) 中的 **P20.4**：在 R2 上传脚本中为版本化 gzip 对象写入 **长缓存 + `immutable`**；在 Cloudflare Pages 侧通过 **`frontend/public/_headers`** 为 **`galaxy_assets_manifest.json`** 配置 **短 TTL + `must-revalidate`**，使「当前应指向哪份 R2 资源」尽快在边缘与浏览器生效。

**明确不在本期：** 修改 `galaxy_data.json` 公共字段契约；改动 UMAP / Procrustes / 清洗逻辑；改动前端 `galaxyAssetUrls.ts` 中 manifest 请求的 `cache: 'no-cache'` 行为（浏览器侧仍可按现有实现校验最新 manifest）；Phase 20 总文档收口 — **留待 P20.6**。

**Git：** 分支 **`phase20-p204-cache-control`**。P20.4 代码改动：**`5436345`** — `feat(P20.4): R2 immutable Cache-Control; Pages manifest short TTL`。本 **`docs/reports/...`** 实施报告与上述改动**同分支提交**（具体哈希以 **`git log -- docs/reports/Phase 20.4 P20.4 R2 Cache-Control 与 manifest 缓存语义 实施报告.md`** 为准）。

---

## 1. 最终决策（已定稿）

| 议题 | 决策 | 理由 |
|------|------|------|
| R2 上 `galaxy_data.json.gz` / `galaxy_search_index.json.gz` | 上传时使用 **`Cache-Control: public, max-age=31536000, immutable`** | 对象路径在运维模型下随数据版本更新而「逻辑版本化」：manifest 中的 URL 带 **`?v=<data_version>`** 查询参数用于缓存区分；R2 侧对稳定 URL 给长缓存可减少边缘与浏览器重复拉取，与计划一致。 |
| 实现方式 | 延续 **boto3 `upload_file`**，在 **`ExtraArgs`** 中设置 **`CacheControl`**（等价于 S3 **`put_object` 的 Cache-Control 元数据**） | 仓库现状已用 `upload_file`；仅替换原先偏短的 TTL，不引入新的 SDK 调用路径。 |
| 可观测性 | 每条上传日志增加 **`cache_control=...`** 打印 | 与项目「状态可见性」习惯一致，便于在 Actions 日志中核对上传策略而无需额外 HEAD 对象。 |
| 变更前 R2 策略 | 曾为 **`public, max-age=600`** | 10 分钟 TTL 对「几乎不变的大 gzip」偏保守，边缘与客户端重复下载成本高；在版本化 URL + manifest 指向下，改为 immutable 更匹配成本模型。 |
| Pages 上的 `galaxy_assets_manifest.json` | 使用 **`frontend/public/_headers`** 为路径 **`/data/galaxy_assets_manifest.json`** 设置 **`Cache-Control: public, max-age=60, must-revalidate`** | manifest 体积小、更新频率相对高（cron 刷新后需较快全局可见）；**60s** 与计划一致；**`must-revalidate`** 在过期后要求与源校验，避免长期陈旧。 |
| `_headers` 放置位置 | 文件位于 **`frontend/public/_headers`**（Vite / Pages 静态资源根） | Cloudflare Pages 标准机制：构建产物根目录的 `_headers` 参与响应头合并。 |

---

## 2. 最终操作（仓库内实际改动）

### 2.1 修改文件

| 文件 | 变更摘要 |
|------|----------|
| [scripts/cron/upload_galaxy_r2.py](../../scripts/cron/upload_galaxy_r2.py) | 新增常量 **`R2_VERSIONED_GZIP_CACHE_CONTROL`**；**`_upload_one`** 增加关键字参数 **`cache_control`**；两处 gzip 上传传入该常量；日志输出 **`cache_control`**。 |
| [frontend/public/_headers](../../frontend/public/_headers) | **新建**：为 **`/data/galaxy_assets_manifest.json`** 声明 **`Cache-Control: public, max-age=60, must-revalidate`**（附简短注释说明与 R2 策略分工）。 |

### 2.2 关键常量（摘录）

| 名称 | 值 |
|------|-----|
| `R2_VERSIONED_GZIP_CACHE_CONTROL` | `public, max-age=31536000, immutable` |

### 2.3 仓库外操作

本期 **无强制** Cloudflare 控制台或 R2 Bucket 策略变更：缓存语义由 **对象上传元数据**（R2）与 **Pages `_headers`**（manifest）承担。若历史上在 R2 或 CDN 层对同一路径另行绑定了覆盖性 Cache-Control，需在控制台核对是否与本期脚本写入一致（避免双层规则语义冲突）。

---

## 3. 验收与观测

### 3.1 实施时已执行的本地校验

```powershell
python -m py_compile scripts/cron/upload_galaxy_r2.py
```

**结果：** 语法检查通过。

### 3.2 上线后建议验收（需真实环境）

| 检查项 | 操作 | 预期 |
|--------|------|------|
| R2 gzip 响应头 | 在 **下一次** 成功执行 **`upload_galaxy_r2.py`**（含 R2 凭据）之后，对 R2 公共访问 URL 上的 **`galaxy_data.json.gz`** 执行 **`curl -I`** | 响应中出现 **`cache-control`**，且包含 **`public`**、**`max-age=31536000`**、**`immutable`**（大小写随 CDN 可能略有差异）。 |
| Pages manifest 响应头 | 含本 **`_headers`** 的 Pages 部署完成后，对 **`https://<pages-host>/data/galaxy_assets_manifest.json`** 执行 **`curl -I`** | **`cache-control: public, max-age=60, must-revalidate`**（或与 Cloudflare 规范化形式等价）。 |
| 浏览器行为（可选） | DevTools Network：二次访问 gzip | 在缓存允许范围内可出现磁盘/内存缓存命中；manifest 侧短 TTL 下更易观察到周期性 **`200`** 与校验。 |

### 3.3 计划清单对照（P20.4 条目）

- [x] **`upload_galaxy_r2.py`** 上传 gzip 时写入 **immutable** 语义的长 **`Cache-Control`**
- [x] **`frontend/public/_headers`** 覆盖 **`galaxy_assets_manifest.json`** 短 TTL
- [ ] 上线后 **`curl -I`** 两条（依赖部署与下一次 R2 上传，**运维补做**）

---

## 4. 风险与回滚

| 风险 | 影响 | 缓解 / 回滚 |
|------|------|-------------|
| **`immutable` 与「同 key 覆盖修正数据」混用** | 客户端若曾缓存某 URL，可能继续使用旧字节直至自然过期或 URL 变化 | 运维约定：**修正数据应 bump 数据版本 / 或改 manifest 指向新 URL**；不复用「同一逻辑 URL 表示不同内容」的模型。与 Phase 20 计划风险表一致。 |
| **仅改脚本未重传对象** | 已存在于 R2 的旧对象仍保留旧 **`Cache-Control` 元数据** | 接受：下一次 cron 上传会覆盖元数据；或按需对对象做一次 **re-upload / copy-replace**。 |
| **`_headers` 路径不匹配** | manifest 实际对外路径若非 **`/data/...`**，则规则不生效 | 当前静态结构为 **`public/data/galaxy_assets_manifest.json`** → URL **`/data/galaxy_assets_manifest.json`**；若未来改挂载点，需同步改 **`_headers` 首行路径。 |
| 回滚代码 | 低 | **`git revert 5436345`** 或恢复 **`upload_galaxy_r2.py`** 中 **`CacheControl`** 与删除 **`_headers`**（回滚后已上传对象的元数据不会自动回退，需重传或接受直至过期）。 |

---

## 5. 后续衔接

- **Phase 20.6**：在 **Data Pipeline** / **Tech Spec** 中可增加「R2 Cache-Control 与 manifest TTL」对照表，与计划 P20.6 一致；本期报告可作为素材来源。
- **`.cursor/plans/phase_20_pipeline_maintenance_59b8971d.plan.md`** 中 **`p204-cache-control`** todo：主线合并 **`5436345`** 且 **`curl -I`** 验收勾选后，可将 **`status`** 更新为 **`completed`**。

---

*文档生成依据：Phase 20 计划 P20.4 节、分支 **`phase20-p204-cache-control`**、代码提交 **`5436345`** 及本报告 Markdown 文件当前正文。*
