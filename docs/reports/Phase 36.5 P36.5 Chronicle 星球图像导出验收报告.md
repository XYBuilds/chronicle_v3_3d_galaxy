# Phase 36.5 — Chronicle 星球图像导出验收报告

## 结论

人工验收通过。网站正式 focus 与导出图的颜色、地形和 Lambert 光照一致；透明边缘与构图可接受。

Daily Stargazing 的发布素材固定为同一电影的两个版本：Bloom off 与 Bloom on。36.7 将以带模式后缀的独立 PNG 和 metadata 文件输出两组产物，避免覆盖。

## 自动验收

- 三档样本：小 `127017`、中 `26009`、最大 `150540`。
- 每档导出 `3000×3000` 的 Bloom off/on RGBA PNG，并检查尺寸、非空 alpha 与可见像素边界。
- 最终验收图位于本地忽略目录 `.tmp/phase-36.5-final/`；包含六张 PNG、对应 metadata 与联系表。
- 前端：`npm test`（225 tests）、`npm run lint`、`npm run build` 通过。
- 导出器：单元测试（20 tests）、typecheck、lint 与 Playwright Chromium 集成测试通过。

## 验收期间修正

- 导出场景先前将题材台阶的外接半径同时作为 mesh 基础半径，最大多题材星球会被阶梯二次放大并裁切。导出 mesh 现使用共享 active-shell 基础半径，而相机仍按共享实际外接半径留白。
- Bloom 模糊会在画布边缘留下 `alpha=1` 的不可见量化拖尾。PNG 安全检查忽略该阈值，但仍会拒绝 `alpha≥2` 的真实可见裁切。

## 人工确认

- Focus mesh 颜色、地形和光照与网站正式默认效果一致。
- Bloom off 的透明区干净，Bloom on 的半透明光晕可接受。
- Daily 后续发布默认同时产出 Bloom off 和 Bloom on 两个版本。