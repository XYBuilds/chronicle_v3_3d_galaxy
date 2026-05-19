# Phase 31.1 / P31.1 Phase 31 计划与 Phase 30 兼容预检 实施报告

## 1. 任务目标

创建并维护 Phase 31 计划文件；对照 Phase 30 深链路由与 Drawer 分享落地现状，确认 31.2–31.7（poster 状态机、retry UI、搜索 placeholder、locale 同步）可在不改动路由/分享层的前提下执行。

对应计划：[`.cursor/plans/phase_31_hud_polish_i18n.plan.md`](../../.cursor/plans/phase_31_hud_polish_i18n.plan.md) · TODO `p31-plan-doc-preflight`（31.1）。

---

## 2. 关键决策

| 项 | 决策 |
| :--- | :--- |
| Phase 30 → 31 衔接 | **无阻塞**；Phase 30 全部 TODO 已在 `main` 完成 |
| Poster 改动边界 | 仅改 `DrawerPoster` 与 `AspectRatio` 容器内 UI；**不改** `DrawerMovieShare`、route 层 |
| 搜索能力表述 | 31.4 仅改 placeholder 文案；**不扩展** 人物多语言别名或搜索索引 |
| Poster retry | 31.2–31.3 使用客户端 `reloadToken` / cache-bust；**不引入** 图片代理或 CDN |

---

## 3. 实施摘要

| 交付物 | 说明 |
| :--- | :--- |
| `.cursor/plans/phase_31_hud_polish_i18n.plan.md` | 计划正文 + §31.1「预检结论（2026-05-20）」 |
| Drawer / 路由边界表 | Share 在 `SheetHeader`；poster 在可滚动 body——布局正交 |
| 分支 | `docs/p31.1-phase30-preflight` |

**未实施（归属后续 TODO）**：`DrawerPoster` 状态机、retry UI、locale `drawer.poster.*`、搜索 placeholder 更新、测试。

---

## 4. Phase 30 兼容预检结果

### 4.1 Phase 30 完成度

| 检查项 | 状态 |
| :--- | :--- |
| `phase_30_routing_sharing.plan.md` 30.1–30.8 | **completed** |
| `routes.ts` / `routeControllerSync` / `routeActions` | **已落地** |
| `DrawerMovieShare` + `drawer.share.*` locale | **已落地** |
| `frontend/public/_redirects` + `spaRedirects.spec.ts` | **已落地** |

### 4.2 Drawer 布局（31.2–31.3 约束）

| 区域 | 位置 | Phase 31 |
| :--- | :--- | :--- |
| `DrawerMovieShare` | `SheetHeader`（genre / TMDB / IMDb 下方） | **不改** |
| `DrawerPoster` | body 顶部 `AspectRatio` | **主改区** |
| overview / details / cast | body sections | **不改** |

### 4.3 `DrawerPoster` 基线（预检日）

| 行为 | 现状 |
| :--- | :--- |
| 状态 | 单 `failed` boolean |
| 空 URL vs 加载失败 | 共用 `drawer.posterPlaceholder` |
| 切换电影 | `key={\`${movie.id}\|${movie.poster_url}\`}` remount |
| loading / retry | 无；`<img loading="lazy">` + `onError` only |

### 4.4 可复用资产

| 资产 | 用途 |
| :--- | :--- |
| `frontend/src/components/ui/spinner.tsx` | 31.2 loading / retrying |
| `strings.ts` `drawer.posterAlt` | 保留；31.5 扩展 `drawer.poster.*` |
| `SearchBar.tsx` placeholder 键 | 31.4 仅改 `en.json` 等文案 |

**Gate 结论**：Phase 31 **可开工**；31.2 起无需等待或并行修改路由/分享。

---

## 5. 验证

| 项 | 结果 |
| :--- | :--- |
| 对照 `phase_30` 计划与 `Drawer.tsx` / `DrawerMovieShare.tsx` | 布局与职责分离确认 |
| `en.json` / `SearchBar.tsx` / `spinner.tsx` 存在性 | 与计划 §关键现状一致 |
| 前端构建 / 测试 | **未跑**（本 TODO 仅文档与预检） |

---

## 6. 风险与后续

| 风险 | 分流 |
| :--- | :--- |
| 空 URL 与失败占位混淆 | **31.2–31.3** 分状态 + 分文案 |
| `posterPlaceholder` 键迁移 | **31.5** 全 locale + `strings.ts` 一次性 |
| 旧图片请求污染新电影状态 | **31.2** `onLoad`/`onError` 请求世代守卫 |
| RTL / 读屏 retry | **31.6** 验收 |

**建议下一任务**：31.2（`DrawerPoster` 状态机）。
