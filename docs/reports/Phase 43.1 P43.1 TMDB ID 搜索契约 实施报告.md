# Phase 43.1 · TMDB ID 搜索契约实施报告

## 结论

P43.1 已完成并通过技术验收。前端现在具备独立、纯函数式的 TMDB ID 查询契约；该模块只依赖已加载电影的 `Movie.id`，不依赖搜索索引包，也没有引入 UI、路由或全局状态职责。

## 实现

新增 `frontend/src/utils/tmdbIdSearch.ts`：

- 构建 TMDB ID 精确映射和按数值升序排列的前缀条目；输入电影顺序不影响结果。
- 索引构建时拒绝非正安全整数和重复 `Movie.id`，避免静默覆盖。
- 只接受 ASCII 十进制数字；负数、小数、指数、空白夹杂、前后空格和其他字符均返回格式错误。
- 任意长度查询都尝试精确命中；达到 4 位后追加前缀候选。
- 精确命中固定排在首位，其余候选按 TMDB ID 数值升序，结果上限为 8。
- 查询结果显式区分 `invalid`、`no-results` 和 `results`，供后续 UI 使用。
- 开发环境仅在索引构建时记录电影数、索引数和首尾 ID，不在查询热路径输出日志。

新增 `frontend/src/utils/tmdbIdSearch.spec.ts`，覆盖格式校验、短 ID 精确匹配、4 位前缀规则、精确优先、结果上限、确定性排序及非法/无结果状态分离。

## 验证

- `npm run test -w frontend -- src/utils/tmdbIdSearch.spec.ts`
  - 1 个测试文件、17 个测试通过。
- `npx tsc -b frontend/tsconfig.json`
  - 通过。
- `npm run lint -w frontend`
  - 通过。
- 编辑器诊断
  - 新增实现与测试无诊断错误。

## 边界

本 TODO 未接入 `SearchBar`、候选行、focus 或 History API。这些职责分别属于 P43.2 和 P43.3；locale 与响应式视觉验收属于 P43.4。