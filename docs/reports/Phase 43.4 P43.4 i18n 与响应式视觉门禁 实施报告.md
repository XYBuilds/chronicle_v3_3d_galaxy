# Phase 43.4 · i18n、回归与响应式视觉门禁实施报告

## 结论

P43.4 已完成并通过自动验证与人工视觉验收。Phase 43 的 ID Tab、TMDB ID 查询、共享电影候选行、focus 回显和无刷新路由链路已收口；7 个 HUD locale 保持同构，Title/ID 候选共用同一展示与可访问性契约。

用户于 2026-07-24 对最终候选行布局给出 Go。最终次级行规则为：有 original title 时年份紧随其后且不显示分隔点；无 original title 时年份从次级行起点显示。TMDB badge 继续固定在主标题行右侧，ID 数字区域保持 `dir="ltr"`。

## i18n 与可访问性

- `frontend/src/lib/locales/en.json` 作为结构 SSOT，`zh.json`、`zh-Hant.json`、`ja.json`、`es.json`、`fr.json`、`ar.json` 同步 ID Tab、placeholder、格式错误、无结果及候选可访问性文案。
- `frontend/src/lib/strings.ts` 导出 ID 搜索文案与候选 aria label formatter，插值参数由统一 formatter 处理。
- 候选列表使用稳定 option id、`aria-label`、`aria-selected` 和 active descendant 关联；TMDB 标识使用当前 locale 文案，数字保持 LTR。

## 交互与布局

- ID Tab 继续只依赖已加载 movies，不依赖 Title/Person/Genre 的搜索索引包。
- Title 与 ID 复用 `MovieSuggestionRow`；片名是主信息，TMDB ID 是固定主标识，original title 与年份属于次级信息。
- 年份不再靠右，也不再显示 `·`；有 original title 时呈现为 `<original title> <year>`。
- 窄屏优先保留展示片名和 TMDB badge；次级 original title 允许截断，年份保持稳定显示。
- 候选选择仍只更新 `selectedMovieId`，由既有 Three.js focus 与 History API 路由同步处理，无页面 reload。

## 验证

- `npm test`
  - 45 个测试文件、355 个测试通过。
- `npx vitest run frontend/src/lib/locales/locales.schema.spec.ts`
  - 1 个测试文件、6 个测试通过。
- `npm run lint`
  - 通过，无 ESLint 错误。
- `npm run build`
  - TypeScript、Vite build、dist 大文件检查与 SPA fallback 检查均完成，命令退出成功。
- 编辑器诊断
  - `frontend/src/components/MovieSuggestionRow.tsx` 无诊断错误。

## 非阻断告警

生产构建继续报告既有告警：主 JS chunk 超过 500 kB；本地 `frontend/public/data` 复制出的 `galaxy_data.json` 与 gzip 超过 Cloudflare Pages 25 MiB。两项均未导致构建失败，且本 TODO 未修改数据发布或 R2 prune 流程。

## 范围边界

本 TODO 未增加 IMDb ID 支持，未修改 galaxy 数据 schema、Three.js 选中态协议、相机动画、渲染材质、数据重建、远程上传或生产部署。
