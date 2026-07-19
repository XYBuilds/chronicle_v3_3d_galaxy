# Phase 39.11 / P39.11 Key、Emission 曲线与 Bloom 单变量收敛实施报告

## 交付范围

P39.11 在 P39.10 的纯 Bloom 增量合成契约上，按固定 Key → Emission exponent → Bloom threshold/radius/strength → Emission 端点的顺序完成单变量视觉收敛。每个 checkpoint 都使用同一电影、genre、seed、pose、camera、固定 Lightness/Chroma 与 rating `0/4/5/10`；候选参数只存在于专用离线 diagnostics 入口。

- 基线提交：`b4278821b7f438ed0a1559a8027a4c4127678570`
- 受控电影：TMDB `157336`
- 证据目录：`data/runs/phase39-p39.11/`
- 最终 visual config hash：`6f53d5f893484514a34d56efb2ee4bda5130ff5502ded78e158e2bba7341727a`
- P39.10 合成契约：`pure-bloom-delta-v1`，保持不变

## 人工选择结果

| Checkpoint | 单变量候选 | 人工选择 |
| --- | --- | --- |
| A · fixed Key | `0.35 / 0.50 / 0.65`，Bloom OFF | `0.35` |
| B · Emission exponent | `3 / 2.5 / 2`，固定 Key `0.35`、Bloom OFF | `2` |
| C1 · Bloom threshold | OFF 参考及 `0 / 0.05 / 0.10` | `0` |
| C2 · Bloom radius | OFF 参考及 `0 / 0.5 / 1` | `1` |
| C3 · Bloom strength | OFF 参考及 `0.0025 / 0.005 / 0.01` | `0.01` |
| D · Emission 端点 | 条件触发：只在低分不可读或高分过曝时调整 | 不触发，保留 `0.06 / 0.60` |

P39.11 最终人工验收为 Go。该结果只接受 P39.11 的参数收敛与证据，不等于 P39.8 最终视觉 Go。

## 最终生产参数

```text
Focus Lightness = 0.55
Focus Chroma = 0.15
fixed Key = 0.35
Emission model = vote-average-power-clamped-v1
Emission exponent = 2
Emin = 0.06
Emax = 0.60
Bloom composition = pure-bloom-delta-v1
Bloom threshold = 0
Bloom radius = 1
Bloom strength = 0.01
planet visual schema = 5
```

有限评分先 clamp 到 `0..10`，再使用平方曲线：

```text
t = rating / 10
E = 0.06 + t² × 0.54
```

| rating | Emission |
| ---: | ---: |
| `0` | `0.06` |
| `4` | `0.1464` |
| `5` | `0.195` |
| `10` | `0.60` |

评分只驱动 Emission。固定 Key、Lightness/Chroma、genre band、geometry、seed、pose、camera 与 Bloom 参数不读取评分。

`PLANET_VISUAL_DEFAULTS.schemaVersion` 从 `4` 升到 `5`。Emission 仍使用同一个 power-clamped 模型，颜色管线仍使用同一 linear composition 与单次 sRGB 输出，Bloom 仍使用同一 pure-delta 算法，因此没有伪升级 `modelVersion`、`pipelineVersion` 或 Bloom composition version。完整 planet、Bloom 与 exporter size 配置继续共同进入 visual hash。

## 离线 diagnostics 隔离

Checkpoint A/B/C 使用独立 HTML、前端 diagnostics wrapper、exporter wrapper 与 evidence 生成器。普通 `planet-export.html` 和标准 export request 不接受以下参数：

- `p3911KeyLightIntensity`
- `p3911EmissionExponent`
- `p3911BloomThreshold`
- `p3911BloomRadius`
- `p3911BloomStrength`

普通入口遇到这些参数会按 unknown request parameter 快速失败。生产网站、Cover 与 CLI 没有新增运行时视觉开关，也没有第二套 appearance 数据流。

C1/C2 证据保留生成当时固定的 `strength=0.005`，不会因生产值更新为 `0.01` 被反向改写；C3 候选继续固定为 `[0.0025, 0.005, 0.01]`。Phase 39.1 record-only baseline fixture 未改写。

## Checkpoint 证据

各目录均保留 3000×3000 RGBA PNG、sidecar、结构化校验和联系表，且受 `.gitignore` 管理：

- A：`data/runs/phase39-p39.11/checkpoint-a/`
  - `contact-sheet-rows-rating-0-4-5-10-columns-key-0.35-0.50-0.65.png`
- B：`data/runs/phase39-p39.11/checkpoint-b/`
  - `contact-sheet-rows-rating-0-4-5-10-columns-exponent-3-2.5-2.png`
- C1：`data/runs/phase39-p39.11/checkpoint-c-threshold/`
  - `contact-sheet-rows-rating-0-4-5-10-columns-off-threshold-0-0.05-0.10.png`
- C2：`data/runs/phase39-p39.11/checkpoint-c-radius/`
  - `contact-sheet-rows-rating-0-4-5-10-columns-off-radius-0-0.5-1.png`
- C3：`data/runs/phase39-p39.11/checkpoint-c-strength/`
  - `contact-sheet-rows-rating-0-4-5-10-columns-off-strength-0.0025-0.005-0.01.png`

每个 checkpoint 的 sidecar 自动断言只有声明的变量族变化。PNG 均通过尺寸、RGBA、sidecar SHA 与透明边界校验；候选矩阵保留独立 visual hash，重复输入的 PNG SHA-256 稳定。

## 最终生产矩阵

最终证据使用标准 `planet-export.html` 与 `renderInBrowser()`，没有调用任何 P39.11 diagnostics override：

- 受控矩阵：`data/runs/phase39-p39.11/final/contact-sheet-rows-rating-0-4-5-10-columns-bloom-off-on.png`
- 真实样本：`data/runs/phase39-p39.11/final/contact-sheet-real-low-mid-high-bloom-on.png`
- 结构化结果：`data/runs/phase39-p39.11/final/validation.json`

共生成 8 份受控 `rating 0/4/5/10 × Bloom OFF/ON` 和 3 份真实 low/mid/high Bloom ON PNG。11 份产物均为 3000×3000 RGBA，PNG SHA、sidecar 与 visual config hash 一致，四边 alpha `<2`。

受控矩阵的普通生产 visual hash 全部相同。相同评分的 OFF/ON diagnostics 只改变 `bloom.enabled`；跨评分只改变 rating 与 Emission。rating 5 Bloom ON 重复导出两次的 SHA-256 均为：

```text
dcb5a721094808219b90ecd930c310301bc4c323ea474a4a097644485636cd08
```

最终 `strength=0.01` 下，rating `0/4/5/10` 的 Bloom ON/OFF 核心平均亮度比分别约为 `1.080160 / 1.080864 / 1.080453 / 1.080975`，均低于 P39.10 防主体重复上限 `1.25`。

Checkpoint D 使用的高亮统计如下：

| 样本 | 任一通道 255 | 全 RGB 255 | luma ≥ 0.98 |
| --- | ---: | ---: | ---: |
| controlled rating 0，Bloom ON | `2.3763%` | `0.2392%` | `0.2392%` |
| controlled rating 10，Bloom ON | `11.0131%` | `2.2685%` | `2.3102%` |
| real high，rating 8.482，Bloom ON | `10.9506%` | `0.9031%` | `0.9243%` |

这些统计只用于辅助人工判断，不自行定义过曝阈值。人工检查后决定不触发端点调整。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm test`（`frontend`） | 37 files，265 tests passed |
| `npm run lint`（`frontend`） | 通过 |
| `npm run build`（`frontend`） | 通过 |
| `npm test`（`tools/planet-exporter`） | 13 files，96 tests passed |
| `npm run test:integration`（`tools/planet-exporter`） | 1 file，4 tests passed |
| `npm run typecheck`（`tools/planet-exporter`） | 通过 |
| `npm run lint`（`tools/planet-exporter`） | 通过 |
| `npm run evidence:p39.11:final` | 8 份受控图、3 份真实图、两张联系表与 validation 生成成功 |
| 11 份 final PNG/sidecar 独立复核 | SHA、3000×3000 RGBA、visual hash 与关键高亮统计一致 |
| `git diff --check` | 通过 |

Chromium integration 在生产 strength 更新后先暴露两处旧测试假设：diagnostics 仍期望 `0.005`，以及 128px、padding `0.08` 的非零 Bloom smoke 会被裁边保护拒绝。测试改为期望最终 `0.01`；128px 非零 Bloom OFF/ON 对照统一使用首个通过安全边界的 padding `0.35`。3000px 最终生产证据仍使用 padding `0.08`，裁边保护、pure Bloom 上限和 strength=0 字节一致性断言均未放宽。

frontend build 仍报告仓库既有的主 JS chunk 体积，以及本地大数据文件超过 Cloudflare Pages 25 MiB；构建退出码为 `0`，本 TODO 未修改这些数据文件。

## 后续边界

P39.8 保持 pending。P39.11 合并后必须从最新 `main` 重新执行 P39.8 人工视觉 Gate；P39.8 不允许现场调参。若 Gate 为 No-Go，应返回 P39.11 对应 checkpoint 重新生成单变量候选，而不是在 Gate 内临时 patch。