# Phase 36.8 — 跨仓库星球导出最终验收报告

## 结论

用户已人工批准最终视觉口径：`--size-root 3`。Chronicle CLI 默认值与 Daily 适配器显式参数均固定为三次方根；发布图保留 `3000×3000`、8% 留白与 Bloom on/off 双产物协议。

## 真实数据端到端验证

- 数据源：`frontend/dist/data/galaxy_data.json.gz`，版本 `2026.05.11.h3`。
- Daily 通过 `scripts.lib.planet_renderer.render_planet()` 调用 Chronicle CLI，实际生成电影 `157336` 的 Bloom off/on RGBA PNG 与 metadata。
- 两张图的 metadata 均记录匹配的 `tmdb_id`、数据版本、分辨率、留白、Bloom、Chromium 和 WebGL renderer。
- PNG 验证通过：Bloom off 的 alpha bounds 为 `(183, 172, 2801, 2827)`；Bloom on 的半透明光晕扩展到画布边缘，符合既有 Bloom 处理约定。

## 最终视觉验收素材

最终三档高亮度样本位于忽略目录 `.tmp/phase-36.8-acceptance-cuberoot-size/`：

| 档位 | TMDB ID | 产物 |
| --- | ---: | --- |
| 小 | `1628660` | `small-high-bloom-on.png` |
| 中 | `40601` | `medium-high-bloom-on.png` |
| 大 | `41050` | `large-high-bloom-on.png` |

全部以 `--resolution 3000 --padding 0.08 --bloom on --size-root 3` 从同一真实数据源重新导出，并各自包含 `.render.json`。

## 共享视觉 SSOT 验证

临时将 `PLANET_VISUAL_DEFAULTS.lighting.ambient` 从 `0.06` 改为 `0.07` 后，CLI 重新导出的 metadata visual hash 从 `28407a6e…087185dcb` 变为 `ac2594aa…51fecd033`。网站 focus facade 和导出器均从该共享模块读取正式默认值；验证后参数已恢复为 `0.06`。

## 自动验证

- Chronicle：`npm run test -w frontend` — 36 files / 226 tests passed。
- Chronicle：`npm run lint -w frontend`、`npm run build -w frontend` passed。
- Chronicle exporter：`npm run test -w planet-exporter` — 5 files / 24 tests passed；lint 与 typecheck passed。
- Daily：`python -m pytest tests/test_planet_renderer.py tests/test_main_publish.py` — 20 passed。

构建期间仅报告本地完整 galaxy 数据文件超过 Cloudflare Pages 25 MiB 限额；该文件为忽略的本地验收数据，不属于本 TODO。