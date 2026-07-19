# Phase 39 / P39 Focus 评分自发光与颜色空间统一实施报告

## 最终结论

Phase 39 已完成。P39.8 人工 Gate 结论为 **Go，带保留项**。

- 生产数据中，评分 `5.1` 与 `8.482` 的亮度差异目测不明确。
- 其他验收项目无目测问题。
- 本次 Go 表示接受当前 Phase 结果并结束 Phase 39，不表示评分亮度层级已经解决。
- 后续视觉参数由用户在 Phase 39 之外自行手调。本 Phase 不再追加 P39.x 调参，也不替用户选择新参数。

## 交付链

Phase 39 按 TODO 独立分支、PR、merge 串行交付。P39.8 在 P39.11 合并后的 `main@19806400f6d13fe49d2c602b9667affc21011701` 上重跑最终 Gate。

| TODO | 交付内容 | PR | merge commit |
| --- | --- | ---: | --- |
| P39.1 | 现状基线、基础材质 smoke、非 Focus Lightness 不变量 | #265 | `b685151eb492b6b307a87b7f86b0f932f21b99f9` |
| P39.2 | 评分→Emission 领域函数与显式端点 | #266 | `aab562fa951710aa0ab111389228035a8b01e7d0` |
| P39.3 | 固定 Focus L/C、固定 Key 与 Emission uniform | #267 | `09a73fdacf7e03aa6118b5a761321d9b28c5c767` |
| P39.4 | 局部底色 Emission、linear RGB 合成与单次 sRGB 输出 | #268 | `78d461ef9afc84d981bb639a7bcc29af4a7f335a` |
| P39.5 | 网站 Focus、Cover、静态导出与 visual hash 统一 | #269 | `55092eb47f4058890d83035ce3a28b278570a3ed` |
| P39.6 | `FocusLReference` 与 `FocusSizeReferenceRings` 完整退役 | #270 | `f436c8cdf40a9b2a65fa0eb9a9de9ae2fdbeb467` |
| P39.7 | 自动化回归、受控评分矩阵与 3000×3000 导出证据 | #271 | `93f2be0bef7980f9c6bc713bae246dc4de675afd` |
| P39.9 | 隔离 fixed Key、验证 cubic Emission 候选 | #272 | `38c058414ea72c709f61c11d5844d5e2e68a05f9` |
| P39.10 | 修复 Bloom 主体重复叠加并统一三端纯增量合同 | #273 | `b4278821b7f438ed0a1559a8027a4c4127678570` |
| P39.11 | 按 Key、exponent、Bloom、Emission 端点完成单变量收敛 | #274 | `19806400f6d13fe49d2c602b9667affc21011701` |
| P39.8 | 使用最终生产参数完成静态、运行时、生产数据与宏观层人工 Gate | 本收尾交付 | 本收尾交付 |

P39.8 首轮 No-Go 后按计划先执行 P39.9–P39.11，再返回最终 Gate；因此编号顺序与实际交付顺序不同。

## 最终生产合同

### Focus appearance

```text
Focus Lightness = 0.55
Focus Chroma = 0.15
fixed Key = 0.35
Key direction = normalize(0.7, 0.7, -0.14)
flatShadingMix = 0.8
Emission model = vote-average-power-clamped-v1
Emission exponent = 2
Emin = 0.06
Emax = 0.60
planet visual schema = 5
```

有限评分先 clamp 到 `0..10`：

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

评分只驱动 `uEmissionIntensity`。Focus Lightness/Chroma、fixed Key、genre band、geometry、seed、pose、camera 与 Bloom 参数不读取评分。宏观 idle/active/select 继续使用既有评分→OKLab Lightness 链，没有改用 Focus 曲线。

### Shader 与颜色空间

Perlin/genre band 先生成逐片元 `baseLinear`，再在线性 RGB 中计算：

```text
emissiveLinear = baseLinear × emissionIntensity
keyLitLinear = baseLinear × 0.35 × lambert
litLinear = emissiveLinear + keyLitLinear
```

独立 ambient 已删除。负通道在底色边界归零，正 HDR 值在 Bloom 前不截断；片元末端只做一次 linear→sRGB。蓝色、黄色等区域使用自身局部底色发光，不叠加统一白色 Emission。

### Perlin selective Bloom

```text
composition = pure-bloom-delta-v1
threshold = 0
radius = 1
strength = 0.01
```

网站 Focus、Cover 与静态导出共用 `frontend/src/three/perlinBloomContract.ts`：

- HalfFloat render target；
- planet-only layer，宏观 idle/active 不进入 Bloom source；
- 基础场景只出现一次；
- 附加项只包含 `max(composite - isolatedBase, 0)`；
- camera layer、render target、scene background 与 `autoClear` 异常安全恢复；
- composer、Bloom pass、targets、材质与 fullscreen quad 明确释放。

宏观全局 `window.__bloom` 继续默认关闭，并与 Perlin selective Bloom 互斥。

最终 `visual_config_hash`：

```text
6f53d5f893484514a34d56efb2ee4bda5130ff5502ded78e158e2bba7341727a
```

## P39.8 验收证据

所有运行证据保留在 Git ignored 目录，不纳入提交，也未删除。

### 最终静态证据

目录：`data/runs/phase39-p39.8/final-production/`

- 结构化校验：`validation.json`
- 受控联系表：`contact-sheet-rows-rating-0-4-5-10-columns-bloom-off-on.png`
- 真实样本联系表：`contact-sheet-real-low-mid-high-bloom-on.png`
- 受控输入：同一 TMDB `157336`，只覆盖 rating `0/4/5/10`，固定 genre、seed、pose、camera、L/C、Key 与构图；每档导出 Bloom OFF/ON 3000×3000 RGBA PNG。
- 真实输入：low/mid/high 各一份 Bloom ON 3000×3000 RGBA PNG。

结构化校验通过 visual hash、生产参数、透明边界、重复导出和 pure Bloom delta。受控 Bloom ON 的平均 sRGB luma 为：

| rating | 平均亮度 |
| ---: | ---: |
| `0` | `0.173` |
| `4` | `0.236` |
| `5` | `0.265` |
| `10` | `0.424` |

该结果证明受控输入的统计值单调，不等于生产电影之间一定形成清晰的主观亮度层级。rating `5` Bloom ON 重复导出的 SHA-256 均为 `dcb5a721094808219b90ecd930c310301bc4c323ea474a4a097644485636cd08`。

### 浏览器状态机证据

目录：`data/runs/phase39-p39.8/runtime/`

`runtime-evidence.json` 与截图证明 Cover 入口、宏观 active、hover、拾取、selected、返回 idle 和 hover 清理可复现。该服务使用单电影 fixture，不能证明 Cover/Focus 与 3000px 静态导出的严格视觉对应，因此不把它作为最终三端视觉一致性的单独结论。

### 正常生产数据复核

浏览器与 exporter 直接读取 R2 文件时被 CORS 拒绝。验收改用同一份生产文件的同源本地副本；这些文件受 `.gitignore` 保护，不属于交付 diff：

- `frontend/public/data/galaxy_data.json.gz`，`38,240,418` bytes
- `frontend/public/data/galaxy_search_index.json.gz`，`21,389,592` bytes
- `frontend/public/data/today.json`

数据版本为 `2026.07.18.daily.113`。对照样本：

| 样本 | TMDB ID | rating | Emission | 3000px 证据 |
| --- | ---: | ---: | ---: | --- |
| Today | `1140721` | `5.1` | `0.200454` | `data/runs/phase39-p39.8/production-runtime/today-1140721-bloom-on.png` |
| Interstellar | `157336` | `8.482` | `0.4484993496` | `data/runs/phase39-p39.8/production-runtime/interstellar-157336-bloom-on.png` |

两份 PNG 均有同目录 `.png.render.json` sidecar，记录相同生产 visual hash、Bloom/Key/L/C 合同与数据版本。用户随后在正常生产网站完成目测：`5.1` 与 `8.482` 的亮度差异不明确，其他项目无目测问题，并明确选择 Go。

## 验收边界

本报告固化已经交付的架构与当前生产参数，不把人工保留项改写成成功指标。Phase 39 到此结束：

- 不再修改 Shader、参数或测试期待值；
- 不返回 P39.11 checkpoint；
- 不新增 P39.x 调参；
- 不引入评分驱动 Key 或第二套 appearance 数据流；
- 用户后续手调不属于本 Phase，也不改变本次 P39.8 Gate 的历史结论。

P39.11 已完成 frontend 全量 test/lint/build、planet-exporter test/integration/typecheck/lint、最终 3000px 证据与 sidecar 复核。本次 P39.8 收尾只修改 canonical Plan、状态机/视觉映射文档和本报告，不改运行时代码。