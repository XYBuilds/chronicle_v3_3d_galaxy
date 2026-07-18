# Phase 39.1 / P39.1 Focus 现状基线与非 focus 不变量实施报告

## 交付范围

本 TODO 只记录 Phase 39 改造前的行为，不修改颜色映射、Focus shader 或视觉参数。

- 基线提交：`c69103c6c99deacacda950a2203567a8ce88e533`
- 固定电影：Interstellar，TMDB `157336`
- 受控评分：`3.9 / 5.3 / 8.6`
- 旧 `visual_config_hash`：`28407a6ebef33b2749fdd5531158540f2c7ff5214f647f0a7de464b087185dcb`

## 锁定的契约

### 非 focus Lightness

`frontend/src/lib/colorMath.test.ts` 锁定 `vote_average = 0 / 5 / 8.5 / 10` 的现有 OKLab Lightness 输出。`frontend/src/lib/colorMath.ts` 未修改。

### Focus uniform

`frontend/src/three/planetCore.spec.ts` 锁定当前评分驱动的 `uPerlinL`，以及固定值：

- `uPerlinChroma = 0.15`
- `uAmbient = 0.06`
- `uDiffuse = 1`
- `uLightingEnabled = 1`
- `uLightDir = normalize([0.7, 0.7, -0.14])`

这些值用于后续 TODO 判断是否只改变计划内的 Focus 语义。

### 三端与基础材质 smoke

`tools/planet-exporter/fixtures/phase39-contract-baseline.json` 保存固定电影、受控评分、真实样本、旧 uniform、旧 hash、复现命令和三端入口关系。

同一 fixture 已完成：

| 入口 | 证据 |
| --- | --- |
| 网站 Focus | `/movie/157336` 渲染成功；截图 `phase39-p39.1-focus-baseline.png`；canvas `1329×1510` |
| Cover | `/` 渲染成功；截图 `phase39-p39.1-cover-baseline.png`；canvas `1329×1510` |
| 静态导出 | `renderMode=shader` 导出页 `exportReady=1`；截图 `phase39-p39.1-export-baseline.png`；canvas `3000×3000` |
| 基础材质 | `renderMode=basic`、Bloom OFF、`3000×3000` Playwright smoke 通过 |

截图用于本次验收，没有加入 Git。完整生产 galaxy 数据未检出，三端浏览器验证使用 `VITE_GALAXY_DATA_GZIP_URL` 指向固定本地 fixture；CLI 复现不依赖生产数据。

## 导出器补强

`tools/planet-exporter` 新增显式 `--render-mode basic|shader`，默认仍为 `shader`。`basic` 与 Bloom ON 的组合会快速失败。CLI 将模式透传给页面，并在 `.render.json` 写入 `render_mode`，便于区分基础材质与 shader 基线。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm exec vitest run src/lib/colorMath.test.ts src/three/planetCore.spec.ts src/planet-export/planetExport.spec.ts`（`frontend`） | 3 files，23 tests passed |
| `npm test`（`frontend`） | 36 files，228 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过 |
| `npm test`（`tools/planet-exporter`） | 5 files，28 tests passed |
| `npm run typecheck`（`tools/planet-exporter`） | 通过 |
| `npm run lint`（`tools/planet-exporter`） | 通过 |
| `npm run test:integration`（`tools/planet-exporter`） | 2 tests passed，含 3000×3000 basic smoke |
| fixture JSON 结构检查 | `meta.count === movies.length`，通过 |
| `git diff --check` | 通过 |

`npm run build` 仍提示现有 `frontend/public/data` 大文件超过 Cloudflare Pages 25 MiB，以及主 JS chunk 超过 500 kB；构建退出码为 0，本 TODO 未修改这些文件。