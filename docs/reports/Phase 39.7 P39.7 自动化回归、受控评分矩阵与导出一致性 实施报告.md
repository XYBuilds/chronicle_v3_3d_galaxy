# Phase 39.7 / P39.7 自动化回归、受控评分矩阵与导出一致性 实施报告

## 交付范围

本 TODO 为 Phase 39 的 Focus Emission 管线补齐自动化回归、离线单变量 fixture、3000×3000 导出矩阵与可复核 render diagnostics。P39.7 只记录客观合同和产物，不执行 P39.8 的人工视觉判断，也不调整 P39.2 已确定的 Emission 端点、固定 Lightness/Chroma、固定 Key Light 或 Bloom 参数。

- 基线提交：`f436c8cdf40a9b2a65fa0eb9a9de9ae2fdbeb467`
- 受控电影：TMDB `157336`
- 本地产物：`data/runs/phase39-p39.7/`
- 提交边界：PNG、派生 fixture 与 `.render.json` 保持 Git ignored，供 P39.8 人工验收继续使用

## 离线 fixture 与单变量控制

`tools/planet-exporter/src/phase39Fixtures.ts` 从 P39.1 已提交的 `phase39-contract-baseline.json` 生成受控数据，并可从当前 canonical JSON/JSON.gz 派生真实样本。生成器不读取 raw CSV，也不运行 Python 全量数据重建。

受控矩阵复制 P39.1 的 movie `157336`，只将 `vote_average` 覆盖为 `0`、`5`、`10`。实现期间发现若把评分写入 `meta.version`，三个 fixture 的顶层 metadata 会随评分变化，违反单变量合同；现统一使用：

```text
phase39-contract-baseline-v1-p39.7-controlled
```

测试在删除 movie 的 `vote_average` 后比较三个完整顶层 fixture，movie 之外的 metadata 和所有其他字段必须完全相等。真实样本从 canonical 数据按固定 ID 提取；源记录不存在时直接失败，不用伪造数据补齐。

当前 canonical 数据版本为 `2026.07.17.daily.112`，真实样本如下：

| 层级 | TMDB ID | 当前评分 | Emission | noise seed |
| --- | ---: | ---: | ---: | ---: |
| low | `199647` | 3.9 | 0.2706 | `2357859381` |
| mid | `9898` | 5.3 | 0.3462 | `1492834729` |
| high | `157336` | 8.482 | 0.518028 | `1006856808` |

P39.1 对 high 样本记录的评分为 8.6；当前 canonical 快照为 8.482。这是数据漂移，未回写或修改 P39.1 合同基线。

## Render diagnostics 与快速失败

静态导出页面从已配置的 planet handle、shader uniforms、mesh 与 orthographic camera 读取最终状态快照，再通过页面结果交给 exporter。diagnostics 不重建 appearance，也不成为评分开关或新的视觉 SSOT。

sidecar 的 `visual_diagnostics` 记录：

- movie ID、genres、rating、band count；
- world/outer radius、size root、padding；
- fixed Lightness/Chroma、Emission、Key Light；
- Perlin seed、scale、octaves、persistence；
- seeded spin axis、自转速度、实际 base quaternion；
- camera position、quaternion、direction 与完整 frustum。

前端快照和 exporter parser 均快速拒绝缺字段、nested null、非有限数字、非法 tuple、非法 movie ID/band count/padding/seed、非正或非均匀半径、`outer_radius < world_radius`、非 `0/1` lighting uniform、非正整数 octaves 与非法相机 frustum。

exporter 还将实际 PNG 的 SHA-256 写入 `png_sha256`。批量校验会重新计算文件哈希并与 sidecar 比对，避免 metadata 与 PNG 错配。

## 3000×3000 导出矩阵

`data/runs/phase39-p39.7/exports/` 保留 10 份导出及对应 sidecar：

- 受控 `0/5/10`：每档 Bloom OFF、Bloom ON，共 6 份；
- 受控评分 5、Bloom OFF：额外重复导出 1 份；
- 真实 low/mid/high：各 Bloom ON 1 份。

独立批量校验使用 exporter 自身的 PNG 解码器和 `parseVisualDiagnostics()`，结果如下：

- 10 份 PNG 均为 3000×3000 RGBA，存在透明像素，可见内容边界未触碰画布边缘；
- 受控 Emission 严格为 `0.06 < 0.33 < 0.6`；fixed Lightness/Chroma 与 Key Light 不变；
- 删除 `rating`、`emission` 后，六份受控 diagnostics 完全相等；
- 相同评分 Bloom OFF/ON 的完整 diagnostics 完全相等，Bloom 只改变后处理输出；
- 六份受控导出的 `visual_config_hash` 均为 `e9387df386e5812f229b756017a48462e3ccb74e59dc9f650bf48d19a201aceb`；
- 评分 5、Bloom OFF 的两次 PNG SHA-256 均为 `867f56bb26ab03c0c39dd8f941660ef6a3014f7e5ab85b5fbf8b379a9d597be8`；
- 每份 sidecar 的 `png_sha256`、resolution、Bloom、render mode、data version 与实际文件一致；
- 三份真实样本的评分、Emission、seed、半径、姿态与 camera 均通过同一 diagnostics parser 复核。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm exec vitest run src/three/planetCore.spec.ts src/three/perlinLinearEmissionShader.spec.ts src/three/selectionPlanetRotation.spec.ts src/planet-export/planetExport.spec.ts src/planet-export/visualConfig.spec.ts src/lib/locales/locales.schema.spec.ts`（`frontend`） | 6 files，42 tests passed |
| `npm test`（`frontend`） | 37 files，245 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过；TypeScript、Vite、文件检查与 SPA fallback 均成功 |
| `npm test`（`tools/planet-exporter`） | 7 files，47 tests passed |
| `npm run typecheck`（`tools/planet-exporter`） | 通过 |
| `npm run lint`（`tools/planet-exporter`） | 通过 |
| 10 份 PNG/sidecar 独立批量校验 | 通过 |
| `git diff --check` | 通过 |

`npm run build` 仍提示仓库既有的主 JS chunk 超过 500 kB，以及 `frontend/public/data/galaxy_data.json`、`galaxy_data.json.gz` 超过 Cloudflare Pages 25 MiB；构建退出码为 0，本 TODO 未修改这些大数据文件。

P39.8 仍为 pending。上述 ignored 产物继续保留，等待人工检查 Emission 层级、局部色相、Bloom、地形可读性及网站 Focus/Cover/静态导出一致性；本报告不作视觉 Go/No-Go 结论。