# Phase 43.2 · 共享电影候选行实施报告

## 结论

P43.2 已完成并通过技术验收。电影搜索命中现在提供结构化展示数据，Title 候选与后续 ID 候选可以共用同一个纯展示组件；Person 和 Genre 保持原有职责与交互。

## 数据模型

`frontend/src/utils/searchScore.ts` 为电影命中增加以下字段：

- `displayTitle`
- `originalTitle`
- `releaseYear`
- `tmdbId`
- `displayTitleHighlightRanges`
- `originalTitleHighlightRanges`

展示片名与原始片名分别计算高亮范围。TMDB ID、年份和 Genre 不参与高亮；仅原始片名命中时，主片名不会被错误标记。异常或缺失发行日期输出 `null`，不同于展示片名的原始片名才进入次级信息。

旧 `label` 仅保留给现有 Store 查询文本兼容，候选行不再解析该长字符串。

## UI 边界

新增 `frontend/src/components/MovieSuggestionRow.tsx`：

- 第一层展示片名与固定可见的 `TMDB <id>`；TMDB 区域固定 `dir="ltr"`。
- 第二层展示可用年份和不同的原始片名，不显示 Genre。
- `min-w-0`、`truncate` 和 TMDB badge 的 `shrink-0` 保证窄屏优先保留片名与主标识。
- 组件只接收展示数据、激活状态和外部回调，不负责搜索、排序、focus、路由或 Store 更新。

新增 `frontend/src/components/HighlightedText.tsx`，让电影字段和 Person 候选复用相同纯文本高亮渲染。`SearchBar.tsx` 仅把 Title 结果映射到共享电影行；Person 的计数、高亮与选择交互保持不变，Genre 多选未改动。

## 验证

- `npm run test -w frontend -- src/utils/searchScore.spec.ts`
  - 1 个测试文件、26 个测试通过。
- `npx tsc -b frontend/tsconfig.json`
  - 通过。
- `npm run lint -w frontend`
  - 通过。
- `git diff --check`
  - 通过。
- 编辑器诊断
  - 修改文件无诊断错误。

## 边界

本 TODO 未新增 ID Tab、focus 回显或 locale 文案。ID 查询接入与键盘/路由状态流属于 P43.3；桌面、窄屏和 RTL 的最终浏览器视觉门禁属于 P43.4。