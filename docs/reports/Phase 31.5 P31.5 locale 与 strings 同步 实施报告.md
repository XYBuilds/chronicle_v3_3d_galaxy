# Phase 31.5 — locale 与 `strings.ts` 同步

## 任务目标

将 Phase 31.4 新增的搜索 placeholder 语义同步到全部非 `en` locale bundle，并确认 `drawer.poster.*` 嵌套结构与 `strings.ts` 导出已与 `en.json` SSOT 对齐。

## 关键决策

- **结构**：`en.json` 仍为唯一结构基准；`drawer.posterPlaceholder` 已在 31.3 迁移为 `drawer.poster.*`，本任务不再保留旧键。
- **范围**：仅更新 `searchBar.placeholderMovie` / `placeholderPerson` 译文；`placeholderGenre` 保持各语言既有文案。
- **`strings.ts`**：31.2–31.3 已导出 `poster: raw.drawer.poster` 与 `searchBar: raw.searchBar`，本任务无代码改动。

## 实施摘要

| 文件 | 变更 |
| --- | --- |
| `frontend/src/lib/locales/zh.json` | 搜索 placeholder 对齐 31.4 语义 |
| `frontend/src/lib/locales/zh-Hant.json` | 同上 |
| `frontend/src/lib/locales/ja.json` | 同上 |
| `frontend/src/lib/locales/es.json` | 同上 |
| `frontend/src/lib/locales/fr.json` | 同上 |
| `frontend/src/lib/locales/ar.json` | 同上 |
| `en.json` / `strings.ts` | 已在 `main` 就绪，未改 |

## 验证

- `npx vitest run frontend/src/lib/locales/locales.schema.spec.ts` — 12 passed
- `grep posterPlaceholder frontend/src` — 无残留

## 已知风险 / 后续

- 人物搜索仍仅建议英文名；多语言别名属 Phase 35 或数据任务，非本 Phase。
- **31.6** 键盘 / 读屏 / RTL 手测待做；**31.7** 组件测试与全量 lint/build 待做。
