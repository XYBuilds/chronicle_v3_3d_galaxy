# Phase 36.4 — Planet Export CLI 实施报告

## 改动范围（Scope）

- 新增 `tools/planet-exporter` workspace，提供 `npm run planet:export -- ...` 命令。
- 支持 `--data-file`、`--data-url` 和 manifest 数据源，优先级固定为 file → URL → manifest。
- 输出透明 RGBA PNG 与同名 `*.render.json` metadata；stdout 仅保留单行成功 JSON，诊断写入 stderr。
- 导出页补充可机器读取的失败阶段与错误详情，使 CLI 能稳定区分参数、数据、渲染和写入失败。

## 技术实现（Implementation）

- CLI 按参数解析、数据源选择、Vite/Playwright 编排、PNG 检查、产物事务拆分职责。
- Vite programmatic server 直接加载当前 frontend 源码；Playwright 固定使用 `1.52.0` Chromium，并强制 `renderMode=shader`。
- 页面导航前预检 WebGL `MAX_TEXTURE_SIZE`；页面完成后校验 PNG signature、8-bit RGBA、尺寸、非空 alpha bounds 和不裁切。
- PNG 与 metadata 先写临时文件，两个文件均成功后再重命名；metadata 提交失败会回滚已提交 PNG，并清理临时文件。
- CLI 编排函数通过依赖注入保持可测试；模块仅在作为主入口直接执行时启动。
- exporter 独立固定 TypeScript `5.9.3`，兼容 Playwright 1.52 类型声明，不影响 frontend 的 TypeScript 6 工具链。

## 本地验证结果（Verification）

- `npm run typecheck -w tools/planet-exporter`：通过。
- `npm test -w tools/planet-exporter`：5 个文件、19 项单元测试通过。
- `npm run lint -w tools/planet-exporter`：通过。
- `npm run test:integration -w tools/planet-exporter`：1 个文件、2 项 Chromium 集成测试通过。
  - 使用 128×128 最小 fixture 连续成功导出两次。
  - PNG 为 RGBA，背景透明、存在可见像素且边界不触碰画布。
  - 两次运行均生成 PNG/metadata，证明页面、context、browser、Vite server 和随机端口可重复释放。
  - 未知 movieId 返回数据退出码 3，stdout 为空且无半成品。
- `npm test`：frontend 36 个文件、225 项测试通过。
- `npm run lint`：通过。
- `npm run build`：通过；保留现有 bundle size 与本地大数据文件 CFP 警告，不作为本 TODO 阻塞。

## 潜在影响或技术债（Technical Debt & Caveats）

- 首次运行前必须安装与锁定 Playwright 版本匹配的 Chromium：`npx playwright install chromium`。
- 36.4 只做小分辨率自动化验证；3000×3000、Bloom on/off 和三档星球视觉比较属于 36.5 人工验收范围。
- metadata 的 `generated_at` 按契约记录真实生成时间，因此不用于逐字节重复性比较。