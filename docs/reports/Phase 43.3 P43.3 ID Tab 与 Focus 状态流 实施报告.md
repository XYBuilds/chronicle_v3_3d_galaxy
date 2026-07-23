# Phase 43.3 · ID Tab 与 Focus 状态流实施报告

## 结论

P43.3 已完成并通过技术验收。搜索 HUD 新增独立 ID Tab；TMDB ID 查询、候选导航和 focus 回显保持在 SearchBar 局部状态，命中后只写既有 `selectedMovieId`。Three.js focus 与 `/movie/:tmdbId` 路由继续由现有状态订阅和 `useRouteController` 驱动，没有新增路由或相机协议。

## 数据流

```text
movies → TMDB ID index → local debounced ID query
      → shared ResultRow / MovieSuggestionRow
      → selectedMovieId
      → existing focus + History API route sync
```

- ID 索引只依赖已加载 `movies`，不依赖 `galaxy_search_index`。
- 搜索索引缺失、加载失败或未导出时，Title/Person/Genre 内容按原规则阻塞，但 Tab 仍可点击；有电影数据时 ID Tab 可用。
- ID 候选只存在于 SearchBar 局部 `resultRows`，不写入全局 `searchResults`。
- ID 候选选择只更新 `selectedMovieId`，不写全局 `searchQuery`，不调用 `window.location`。
- ID 选择日志只在确认候选时记录 query、候选数和 selected TMDB ID，不在按键热路径输出。

## 局部状态机

新增 `frontend/src/components/idTabInputState.ts`，集中处理：

- 当前 focus 的 TMDB ID 回显；
- 用户编辑后从 focus echo 切回 query；
- focus 退出时移除回显；
- Clear 时清空局部查询；
- Enter 在无显式高亮时选择第一候选；
- debounce 结果仅在对应当前输入时显示反馈。

进入或离开 ID Tab 不清空 Title/Person 的全局查询文本。ID Tab 的 Clear 只清理局部 ID 状态和共享的 `selectedMovieId`，不会污染其他搜索会话。

## 交互

- ID Tab 复用现有候选下拉、ArrowUp/ArrowDown、Enter 和点击选择流程。
- ID 结果复用 `MovieSuggestionRow`，不复制候选布局；ID 路径不做标题高亮。
- focus 状态下输入显示当前 `Movie.id`，右侧显示固定 `TMDB` tag；编辑后恢复 ID 查询态。
- 无效格式和有效无结果分开反馈；正式多语言文案留给 P43.4。

## 验证

- `npm run test -w frontend -- src/utils/tmdbIdSearch.spec.ts src/utils/searchScore.spec.ts src/components/idTabInputState.spec.ts`
  - 3 个测试文件、49 个测试通过。
- `npx tsc -b frontend/tsconfig.json`
  - 通过。
- `npm run lint -w frontend`
  - 通过。
- `git diff --check`
  - 通过。
- 编辑器诊断
  - 修改文件无诊断错误。

## 边界

本 TODO 未修改 locale。ID Tab 标签、placeholder、格式错误、无候选及可访问性文案的 7 locale 同步，以及桌面、窄屏、RTL、URL/history 的最终浏览器门禁属于 P43.4。