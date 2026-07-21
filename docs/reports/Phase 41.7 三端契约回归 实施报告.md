# Phase 41.7 三端契约回归实施报告

## 结论

`p41.7` 技术验收通过。网站 Focus、普通 exporter 和无 override 的 diagnostics 现在从同一份 `PLANET_VISUAL_DEFAULTS` 解析生产视觉配置；Phase 41 诊断候选仍被限制在显式 `diagnostic_only` 离线入口。

## 实现

- `PLANET_VISUAL_DEFAULTS` 升级到 schema 8，纳入 `pure-bloom-delta-v1`、生产 Bloom 参数和固定造型参数。
- 新增生产 Bloom 状态解析和 OFF/ON visual-config hash 输入，普通 exporter 只允许由请求中的 Bloom 状态选择生产配置，不接受诊断视觉参数。
- `PlanetAppearance.emissionCurve` 与 `FocusEmissionProfile` 对齐，支持生产 anchored smoothstep 以及隔离的 CDF/LUT 诊断 profile。
- `resolvePhase41VisualProfile` 显式校验 Bloom 状态、固定 `flatShadingMix = 0.8` 和诊断 override；普通 request 仍拒绝 `diagnostic_only`、`profile` 及候选参数。
- exporter diagnostics/sidecar 记录完整 emission、固定光照、噪声、rotation、camera、Bloom 和 production visual config；网站运行时移除 Focus 视觉调参入口，避免生产参数漂移。
- 增加 `npm run evidence:p41.7 -w planet-exporter`，生成两组可复现最终证据。

## 自动验证

以下命令均通过：

- `npm run test -w frontend`：40 files / 277 tests
- `npm run lint -w frontend`
- `npm run build -w frontend`
- `npm run test -w planet-exporter`：21 files / 145 tests
- `npm run typecheck -w planet-exporter`
- `npm run lint -w planet-exporter`
- `git diff --check`

前端构建保留仓库既有的大数据文件体积警告：`galaxy_data.json` 与 `.gz` 超过 Cloudflare Pages 25 MiB 限制；构建退出码为 0，SPA fallback 校验通过。

## 最终证据

证据使用权威 `frontend/public/data/galaxy_data.json.gz`，复现命令为 `npm run evidence:p41.7 -w planet-exporter`。最终重跑结果为 `controlled_cells=14`、`real_cells=5`、`repeat_byte_stable=true`。

- `data/runs/phase41/p41.7-final-controlled-bloom-off-on/`
  - 同一电影覆盖 `4.0/4.5/5.5/6.5/7.5/8.2/9.5`，每个评分都有 Bloom OFF/ON 对照。
  - OFF visual config hash：`f784979c7f3b010acf536ff0c1cfb17771c58c54b71e6ebb81ebe5643834c486`。
  - ON visual config hash：`c2eeda1cd020205b363f187460e013b348993a8353b5ac2ee2a7e7b5c58f6160`。
- `data/runs/phase41/p41.7-final-real-bloom-on/`
  - 覆盖真实低分、中段、高分、人口密集区和高分低票异常样本；5 个样本均使用生产 Bloom ON 配置。
- 每组均包含 `contact-sheet.png`、`contact-sheet.manifest.json`、`validation.json`、原始 PNG 和 `.render.json` sidecar；sidecar 的 `diagnostic_override` 均为 `null`。

两组 validation 当前标记为 `pending-human-review`，作为 `p41.8` 最终生产 Go/No-Go 的人工审查输入，不影响本 TODO 的自动技术验收。