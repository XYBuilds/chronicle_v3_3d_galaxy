# Phase 37.5 · Production Pipeline Recovery Report

**日期：** 2026-07-15  
**人工验收：** 通过

## 结论

已恢复 canonical embedding bundle 与生产发布链路。monthly 和 nightly 均在 `force_skip_dim_check=false` 下完整成功，v2 language palette 的 104 维向量已成为 canonical bundle 输入。

## Canonical bundle

- Kaggle 快照经全量重建后得到 `61,460` 条 final membership。
- 矩阵契约：text `(61460, 384)`、genre `(61460, 19)`、language `(61460, 104)`；全部有限且逐行 L2 范数为 1。
- 发布 GitHub Release：`p37-3-language-palette-v2`。
- `GALAXY_EMBED_BUNDLE_URL` 已切换到该 Release asset；旧 `p18-monthly-v1` 保留，作为可回滚历史产物。

## 生产验证

| 工作流 | Run | 结果 | 关键证据 |
| --- | --- | --- | --- |
| monthly refit | [29441529543](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29441529543) | success | `lang=v2`、104 维 language、Supabase upsert、R2、Cloudflare Pages 均成功 |
| nightly vote refresh | [29443556489](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/29443556489) | success | final-membership drift gate 为 `lang=v2`，Supabase、KV、R2、Cloudflare Pages 均成功 |

monthly 的 final membership 为 61,460，UMAP 融合宽度为 507；anchor mean L2 为 3.53299，超过 soft observation 线但低于 50 的失败阈值，因此按既定 soft mode 继续。

## 恢复期间的部署阻塞

首次 monthly run `29439523289` 在数据写入与 R2 上传完成后，于前端构建阶段因 `MovieTooltip.tsx` 中未使用的 `useEffect` import 失败，Cloudflare Pages 未执行。修复已通过 PR [#255](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/pull/255) 合入 `main`，随后 monthly 重跑全绿。

## 本地与人工验证

- `python -m pytest scripts/tests/test_language_palette_v2_bundle.py`：4 passed。
- `npm run build -w frontend`：通过。
- 人工验收：首页、星系交互、HUD/详情与非英语影片检查通过。

## 保留事项

37.6 仍需按计划等待并验收下一次 scheduled nightly，确认定时触发路径保持绿色；本报告不将该独立 TODO 标为完成。