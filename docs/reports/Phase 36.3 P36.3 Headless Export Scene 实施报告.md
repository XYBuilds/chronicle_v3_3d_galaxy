# Phase 36.3 / P36.3 Headless Export Scene 实施报告

## Scope

本报告对应 `p36-headless-export-scene`。范围仅包括独立 `planet-export.html`、其 TypeScript 导出页和测试；未修改网站 React/HUD、银河 mesh、共享 Planet Core、CLI、根 `package.json` 或 Phase 计划。

## Implementation

- 建立不挂载 React/HUD 的独立页面：加载 galaxy 数据后构建一次电影 ID 索引，记录片单数量、目标 ID 和电影摘要；全片单按共享 `planetSizing` 求最大实际外接半径，使用正交相机、固定 8% 默认留白和 ID 决定的规范姿态。
- 正式 Shader 路径显式调用共享 `createSelectionPlanet()`，导出前设置不透明且可见；basic smoke 由严格的 `renderMode=basic` 请求参数触发，使用 `MeshBasicMaterial`，且拒绝与 Bloom 同时使用。`renderMode=shader` 为正式路径。
- 请求要求且仅允许 `movieId`、`dataUrl`、`resolution`、`padding`、`bloom`、`renderMode` 各一次；拒绝重复/未知参数、非正整数、非绝对 HTTP(S) 或非 JSON/gzip 数据 URL、凭据/fragment、无效 padding，以及非法 Bloom/模式组合。
- Bloom 使用导出页专用透明 RGBA render target 与独立 composer；共享 Bloom 层和默认 Bloom 参数仍从 `perlinSelectiveBloom` 引用，不复制 Planet Core 视觉参数。基础画面先直接透明渲染，再以 alpha-aware 合成叠加 glow。
- 增加请求、索引缺失/重复、全局半径、固定留白和 basic/shader 可选择且可见的单元测试。

## Verification

| 命令 | 结果 |
| :--- | :--- |
| `npm run test -w frontend -- src/planet-export/planetExport.spec.ts` | Pass — 1 file、4 tests passed。 |
| `npm run test -w frontend` | Pass — 36 files、225 tests passed。 |
| `npm run lint -w frontend` | Pass — ESLint exit 0。 |
| `npm run build -w frontend` | Pass — TypeScript、Vite、产物大小和 SPA fallback 检查 exit 0。 |

构建仍报告既有本地 `public/data/galaxy_data.json(.gz)` 超过 Cloudflare Pages 25 MiB 与 bundle 大小警告；构建成功，且本 TODO 未增加这些数据或打包体积。

## Technical Debt & Caveats

- 36.3 没有引入浏览器自动化或 PNG 写盘职责。真实 Chromium/WebGL 的 PNG 尺寸、背景 alpha、非空像素、Bloom 边缘、裁切和连续调用资源回收必须由 36.4 Playwright CLI 覆盖，并在 36.5 进行人工三档视觉验收。
- 当前 unit test 验证 basic 与 Shader 路径选择、共享材质/显式可见性和请求契约；它不声称已生成或检查真实 PNG。
- Bloom 最终默认策略仍按计划留给 36.5 人工验收；当前请求显式支持 `on`/`off`，且初始契约默认由后续 CLI 决定。