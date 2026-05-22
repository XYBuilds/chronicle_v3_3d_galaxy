# Phase 34.7 / P34.7 TMDB 合规 实施报告

## 1. 任务目标

落实 [TMDB API Terms](https://www.themoviedb.org/documentation/api/terms-of-use) §3（Attribution）与 Phase 34 计划 **34.7**：

- 主站 **Logo + 强制声明**（About / 持久 HUD / `index.html` 静态 fallback）。
- OG Worker：**海报仅 `image.tmdb.org/t/p/*`**；OG 卡可选底栏 **Data from TMDB**。
- 合规检查清单（非验收矩阵）：`docs/guides/P34.7 TMDB 合规检查清单.md`。

对应计划：[`.cursor/plans/phase_34_social_preview_distribution.plan.md`](../../.cursor/plans/phase_34_social_preview_distribution.plan.md) · TODO `p34-tmdb-compliance`（34.7）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| 强制声明措辞 | 与 API Terms 英文原文一致；各 locale `attribution.notice` 为译文 |
| Logo 资源 | `frontend/public/assets/tmdb-logo-short.svg`（TMDB 官方 short 标记，经 Wikimedia 镜像落盘） |
| HUD 位置 | **右下角**固定；`z-index` 33，低于 Drawer（110），用户接受被侧栏遮挡 |
| 换行 | 声明与「Logos & attribution」分行；栏宽约 `21–24rem`，声明约 2–3 行 |
| OG 底栏 | 英文 `Data from TMDB`（社交图 crawler 语言，不进 HUD i18n） |
| 子仓 | `themoviecosmos-og-worker` 同分支名独立 PR |

---

## 3. 实施摘要

### 主仓

| 交付物 | 说明 |
| :--- | :--- |
| `TmdbAttribution.tsx` | Logo + notice + 文档链接；`footer` / `info` 变体 |
| `App.tsx` | 挂载 HUD 署名；SPA 启动后移除 `#tmdb-attribution-static` |
| `InfoModal.tsx` | `info.tmdbSectionHeading` 专节嵌入 `TmdbAttribution` |
| `locales/*.json` | `attribution.*`、`info` TMDB 节；8 bundle 与 `en.json` 同构 |
| `NOTICE` | API Terms 声明对齐 |
| `index.html` | 静态右下 footer（hydrate 前可见） |
| `index.css` | `--z-hud-attribution: 33` |

分支：`feat/p34.7-tmdb-compliance`。

### OG Worker 子仓

| 交付物 | 说明 |
| :--- | :--- |
| `poster.ts` | 仅 `https:` + `image.tmdb.org` + 路径 `/t/p/` |
| `constants.ts` | `TMDB_OG_ATTRIBUTION` |
| `render/card.ts`、`render/brand.ts` | 底栏文案 |
| `test/poster.spec.ts` | 非 TMDB / http / 非法路径拒绝 |

分支：`feat/p34.7-tmdb-compliance`（独立 repo）。

---

## 4. 验证

```text
# 主仓
cd frontend && npx vitest run src/lib/locales/locales.schema.spec.ts
→ 12 passed

npm run lint -w frontend && npm run build -w frontend
→ OK

# 子仓
cd themoviecosmos-og-worker && npm test
→ 22 passed
```

**部署后抽检**（见 P34.7 指南）：主页 HTML 含 TMDB 声明；Worker 部署后 OG 图目视「Data from TMDB」。

---

## 5. 已知风险与后续

| 风险 / 跟进 | 说明 |
| :--- | :--- |
| Worker 生产 | 子仓 PR 合并后需 `npm run deploy` 方生效 OG 底栏 |
| Drawer 遮挡 | 右下角署名在选片时不可见；About 弹窗 TMDB 节仍完整 |
| 商用 | 若未来 monetize，需评估 TMDB Commercial Agreement（见指南人工项） |
| **34.8** | 四平台分享预览抽样 |
| **34.9** | 全量单测 / 回滚文档 |

**建议下一任务**：**34.8** 平台验证矩阵。
