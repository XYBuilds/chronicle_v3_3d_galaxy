# Phase 40.6 P40.6 回归矩阵、locale 与现行文档对齐实施报告

## 1. 结论

Phase 40.6 已完成。

本阶段补齐了 The Movie Today 退役后的回归矩阵、production dist 产物约束和现行文档契约，并确认中英文 locale schema parity 未因退役改动发生漂移。当前启动流程固定为 data/search-index terminal 后进入 `/` galaxy idle，`/movie/:id` 继续承担唯一影片 focus 深链职责。

## 2. 实施范围

### 2.1 回归与发布产物约束

- 扩展 `frontend/scripts/verify-spa-fallback-dist.mjs`：
  - 禁止 production dist 出现 `dist/data/today.json`；
  - 禁止 Galaxy manifest 恢复 `today_url`；
  - 禁止 `r2_object_keys.today` 回归。
- 对齐 `frontend/public/_headers`，移除已退役 Today 数据路径的缓存规则。
- 清理 Storybook Loading 示例中的 Cover 阶段，不再向组件示例暴露已退役状态。
- 更新 OG pipeline、snapshot 与 KV 同步测试，锁定：
  - committed snapshot 只接受 schema v2；
  - 普通 scheduled sync 不承担 v1 兼容；
  - v1 → v2 仅由显式 migration 入口执行；
  - migration 严格遵循前置校验、movie/meta reconcile、删除 KV `today`、read-back missing、提交 v2 R2 checkpoint 的顺序。
- 新增 `scripts/tests/test_phase40_documentation_contract.py`，防止现行 SSOT 重新声明 Today loader、Cover store/shader/HUD/share、Today KV、Today manifest/R2 发布树等已退役协议。

### 2.2 locale parity

- 复核中英文 locale schema 与现行 UI 引用。
- 本阶段无需新增 locale 文案；schema parity 聚焦测试通过，未发现遗留 Today/Cover key 或中英文键集合漂移。

### 2.3 现行文档对齐

实质重写以下现行文档中的启动流程、路由、渲染状态、发布树、缓存与运维职责：

- `README.en.md`
- `README.md`
- `docs/guides/P18.6b Cloudflare R2 上线操作手册.md`
- `docs/guides/P34.3 OG Index KV 上线操作指南.md`
- `docs/project_docs/TMDB 电影宇宙 Data Pipeline.md`
- `docs/project_docs/TMDB 电影宇宙 Design Spec.md`
- `docs/project_docs/TMDB 电影宇宙 PRD.md`
- `docs/project_docs/TMDB 电影宇宙 Tech Spec.md`

文档现行契约统一为：

- `/` 进入 galaxy idle，不再加载每日选片或 Today cover；
- `/movie/:id` 保留影片 focus；
- HUD 顺序为 `Feedback → Support → Info → Lang → Fullscreen`，不再包含 `Share today`；
- Galaxy manifest 与 R2 发布树只描述 galaxy/search assets；
- OG Index 普通同步只接受 v2，v1 → v2 migration 必须显式执行；
- Today/Cover 仅允许出现在明确退役、真实 404、历史报告或 Phase 40.8 人工 Gate 语境。

## 3. ignored 退役产物处理

本地检查发现 ignored 文件 `frontend/public/data/today.json`，内容为旧 Daily payload。该文件属于已退役的公开发布输入，已在明确授权后删除。

删除后：

- `frontend/public/data/` 只保留 `.gitkeep` 与 `galaxy_assets_manifest.json`；
- 未发现 `og-today.png` 或其他 Today 专属发布物；
- production build 未重新生成或复制 Today 产物；
- 该 ignored 文件不进入 Git 提交。

## 4. 验证结果

### 4.1 前端

- `npm test`：37 个 test files、259 个 tests 全部通过。
- `npx vitest run frontend/src/lib/locales/locales.schema.spec.ts`：1 个 test file、6 个 tests 全部通过。
- `npm run lint`：通过。
- `npm run build`：通过，包含 TypeScript build、Vite production build、文件尺寸检查及 SPA fallback/dist Today guard。

### 4.2 Pipeline 与文档契约

以下聚焦测试共 39 项通过：

- `scripts/tests/test_phase40_documentation_contract.py`
- `scripts/tests/test_og_pipeline_phase34.py`
- `scripts/tests/test_og_index_state.py`
- `scripts/tests/test_og_index_snapshot_r2.py`
- `scripts/tests/test_sync_og_index_kv.py`

### 4.3 静态检查

- 编辑文件静态诊断：通过。
- `git diff --check`：通过。

构建仅报告既有的大型本地 galaxy 文件与主 chunk 体积警告，不构成 Phase 40.6 阻塞。

## 5. 执行边界

- 未执行主站、OG Worker 或 Daily Stargazing 的真实部署。
- 未访问或修改生产 KV/R2。
- 未执行 v1 → v2 生产迁移。
- 未运行 `workflow_dispatch`，也未恢复 scheduled workflow。
- Phase 40.7 与 Phase 40.8 的集成、迁移 dry-run、生产验收和对象清理 Gate 未提前执行。