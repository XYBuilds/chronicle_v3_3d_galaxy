# Phase 34.9 / P34.9 测试验收与回滚 实施报告

## 1. 任务目标

落实 Phase 34 计划 **34.9**：主仓与子仓单测、lint/build、生产 smoke、统一回滚与验收文档，为 Phase 34 收尾提供可重复验证入口。

对应计划：[`.cursor/plans/phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) · TODO `p34-tests-acceptance`（34.9）。

**验收日**：2026-05-22  
**分支**：`test/p34.9-tests-acceptance`

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| `hash8` golden | 主仓不重复实现；SSOT 在子仓 `test/version.spec.ts`（`M=90cacf9f`） |
| 管线断言 | Python 只读检查 nightly/monthly 源码无 `render_og_today` 调用 |
| 回滚文档 | 新建 `docs/guides/P34.9 测试与验收回滚指南.md`，汇总 P34.4/34.5/34.3 回滚层级 |
| Go/No-Go | **Go** — 自动化与生产 smoke 通过 |

---

## 3. 交付物

| 交付 | 说明 |
| --- | --- |
| `frontend/src/lib/indexOgMeta.spec.ts` | apex `index.html` 品牌 `og:image`、无 `og-today.png` |
| `scripts/tests/test_og_pipeline_phase34.py` | nightly/monthly 仅 `sync_og_index_kv` |
| `docs/guides/P34.9 测试与验收回滚指南.md` | 命令、checklist、回滚 §4 |
| 子仓 `README.md` | 回滚章节指向 P34.9 指南（子仓单独提交） |

---

## 4. 验证

### 4.1 主仓

```text
npx vitest run shareLinks spaRedirects indexOgMeta routeControllerSync routes
→ 5 files, 25 tests passed

python -m unittest tests.test_og_pipeline_phase34 -v
→ 2 passed

npm run lint -w frontend → OK
npm run build -w frontend → OK (spa-fallback-dist ok; dist-max-bytes 对大 galaxy 既有警告)
dist/index.html → og/brand.png，无 og-today
```

### 4.2 Worker 子仓

```text
npm test → 22 passed
npm run typecheck → OK
npm run dry-run → OK
```

### 4.3 生产 smoke

| URL | 结果 |
| --- | --- |
| `/og/brand.png?v=og-brand-og-v1` | 200 PNG |
| `/og/movie/999999999.png` | 200 PNG（KV miss → 品牌，非 500） |

---

## 5. 验收标准对照

| # | 项 | 结果 |
| --- | --- | --- |
| 1 | 主仓单测 + lint + build | Pass |
| 2 | Worker 单测 + dry-run | Pass |
| 3 | 分享 `?lang=` | `shareLinks.spec.ts` Pass |
| 4 | `_redirects` 不吞 `/og/*` | `spaRedirects.spec.ts` Pass |
| 5 | 无静态 `og-today` SSOT | `indexOgMeta` + pipeline 测试 Pass |
| 6–8 | 平台 / today / 无效 id | 34.8 矩阵 + 生产 curl Pass |
| 9 | Phase 30 深链 | `routeControllerSync.spec.ts` Pass |
| 10 | nightly 不产 `og-today.png` | 源码断言 Pass |

---

## 6. 风险与后续

| 风险 | 缓解 |
| --- | --- |
| 本地 build 含大 `galaxy_data.json` 触发 dist-max-bytes 警告 | CI 生产构建仍依赖 R2 prune；与 P34.9 无功能回归 |
| 回滚需 Dashboard 手工解绑路由 | P34.9 指南 §4 分四级说明 |

**建议下一任务**：Phase 35 质量运维（KV 同步失败、Worker 5xx 告警）。
