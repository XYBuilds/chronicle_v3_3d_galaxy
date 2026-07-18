# Phase 39.10 / P39.10 Bloom 合成正确性与三端契约统一实施报告

## 交付范围

P39.10 修复 Perlin selective Bloom 把 `base + bloom` 结果再次叠到基础画面的问题。网站 Focus、Cover 与 3000×3000 静态导出现在共用同一个参数校验、HalfFloat render target 和纯 Bloom 增量合成模块。

本 TODO 只恢复合成正确性，没有做视觉择优：

- fixed Key：`1.0`
- Emission exponent：`3`
- `Emin / Emax`：`0.06 / 0.6`
- Bloom 诊断基线：`strength=0.005`、`radius=1.0`、`threshold=0`

`radius=1.0` 是将旧非法值 `2` 收回 Three.js 合法范围后的诊断基线，不是 P39.11 的视觉定稿。

- 基线提交：`38c058414ea72c709f61c11d5844d5e2e68a05f9`
- 合成契约：`pure-bloom-delta-v1`
- P39.10 visual config hash：`eb8fc4537f613bdf4f2e664747fc120a4743bfd85d1097c014bf22a07fc187b1`

## 合成架构

`frontend/src/three/perlinBloomContract.ts` 是 Bloom 合同边界，负责：

1. 校验 `strength >= 0`、`radius ∈ [0,1]`、`threshold >= 0`，并拒绝所有非有限值；
2. 以 HalfFloat render target 分别保存 isolated base 与 `UnrealBloomPass` composite；
3. 在 GPU 上计算 `max(composite - isolatedBase, 0)`；
4. 只把该增量加到已经渲染一次的基础画面；
5. 保存并恢复 camera layer、renderer target、scene background 与 `renderer.autoClear`；
6. 明确释放 `UnrealBloomPass`、composer、base target、材质与 fullscreen quad 几何资源。

网站路径与导出路径都调用该模块。入口仍各自负责帧循环、正交导出相机和透明背景，但不再实现两套 Bloom 算法。planet-only layer、全局 Bloom 互斥及 `window.__bloom` 默认关闭语义保持不变。

导出 diagnostics 记录实际 Bloom 合同和参数；离线 `--bloom-strength` 只用于 P39.10 的零强度证明，不改变生产默认值。

## 黑盒正确性证据

`npm run evidence:p39.10` 从受版本控制的 `tools/planet-exporter/fixtures/phase39-contract-baseline.json` 派生受控 rating `0/4/5/10` fixture，再生成 ignored 目录 `data/runs/phase39-p39.10/`：

- `rating 0/4/5/10 × Bloom OFF/ON` 3000×3000 RGBA PNG 与 sidecar；
- 四份 Bloom ON、`strength=0` 对照；
- `contact-sheet-rating-rows-off-on-columns.png`；
- `correctness-stats.json`。

零强度结果：四组 Bloom ON/OFF PNG 的 SHA-256 均完全相同，证明开启 Bloom 但增量为零时不会再次写入主体。

非零强度使用 `alpha >= 250` 的稳定主体核心统计。重复叠加 base 会使核心亮度接近 `2×`，自动验收上限设为 `1.25`；实测结果如下：

| rating | ON/OFF 核心平均亮度比 | 正增量像素占比 | 平均正增量 |
| ---: | ---: | ---: | ---: |
| 0 | `1.040329` | `0.999966` | `2.0625` |
| 4 | `1.039754` | `1.000000` | `2.2251` |
| 5 | `1.040084` | `1.000000` | `2.3989` |
| 10 | `1.040114` | `1.000000` | `3.8331` |

结果同时证明两点：非零 Bloom 产生了可测正增量；主体没有被第二份 base 重复叠加。透明 PNG 的 8-bit 量化会产生极少量最低 `-2` 的通道差，GPU 合同本身在相加前已 clamp 到非负。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm test`（`frontend`） | 37 files，259 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过 |
| `npm test`（`tools/planet-exporter`） | 8 files，53 tests passed |
| `npm run typecheck`（`tools/planet-exporter`） | 通过 |
| `npm run lint`（`tools/planet-exporter`） | 通过，包含 `src/` 与 `scripts/` |
| `npm run test:integration`（`tools/planet-exporter`） | 1 file，4 tests passed；包含非零纯增量与零强度字节一致性 |
| `npm run evidence:p39.10`（`tools/planet-exporter`） | 12 份 3000×3000 PNG 与 sidecar、联系表、结构化统计生成成功 |
| `git diff --check` | 通过 |

前端构建仍报告仓库既有的主 JS chunk 超过 500 kB，以及本地 `frontend/public/data/galaxy_data.json`、`galaxy_data.json.gz` 超过 Cloudflare Pages 25 MiB。构建退出码为 `0`；P39.10 未修改这些数据文件。

## 后续边界

P39.10 只证明 Bloom 合成和参数合同正确，不批准当前 Key、Emission 或 Bloom 的视觉效果。P39.11 必须从最新 `main` 独立执行，并按 Key → exponent → Bloom → Emission 端点顺序做单变量收敛。P39.8 继续等待 P39.11 人工接受后再执行最终 Go/No-Go。