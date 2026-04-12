# Phase 2.5 Z 轴、派生字段与 galaxy_data.json 导出 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 2.5（`p2-export`）  
> **规范依据**: `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` §2.2（时间轴 / Z 轴 / Jitter）、§4（JSON Schema）、`docs/project_docs/TMDB 电影宇宙 Design Spec.md` §1.1（OKLCH 色板）、`.cursor/rules/python-pipeline.mdc`（Jitter 种子 = TMDB `id`）  
> **报告日期**: 2026-04-12  
> **范围**: 本次会话内完成的 Git 分支、导出脚本、`frontend/public/data` 目录约定与 `.gitignore` 更新、与 Phase 2.1–2.4 产物的行序契约说明；不含 `run_pipeline.py` 将 Phase 2 全步骤自动串联（对应计划中 Phase 2.6）

---

## 1. 摘要

本次工作落实了开发计划中 **Phase 2.5：Z 轴生成 + 派生 GPU 字段 + `galaxy_data.json` 导出（含 gzip）**。

在按用户要求 **新建 Git 分支** `phase-2-5-export-galaxy-json` 的前提下，新增 **`scripts/export/export_galaxy_json.py`**：以与 Phase 2.1–2.4 **行序完全一致** 的 **`data/output/cleaned.csv`** 与 **`data/output/umap_xy.npy`** 为输入，逐条计算 **小数年份 Z**（对 **`YYYY-01-01`** 占位日期施加以 **TMDB `id` 为种子** 的确定性 jitter）、**`size`**（`log10(vote_count+1)` 线性映射到 **[2.0, 25.0]**）、**`emissive`**（`vote_average` 线性映射到 **[0.1, 1.5]**）、**`genre_color`**（由 **`genres[0]`** 查 **`meta.genre_palette`**）；其中色板在 **OKLCH**（**L≈0.75、C≈0.14**，色相按流派数 **等间距** 分配）空间生成，经 **OKLab → 线性 sRGB → sRGB 传递函数** 转换后对 RGB **gamut clamp**，写入 **`meta.genre_palette`** 为 **hex**，写入每条影片的 **`genre_color`** 为 **[0,1] 浮点 RGB**。同时从 CSV 组装 Tech Spec §4.3 所要求的 **HUD / 逻辑层字段**（含 **`poster_url`** 拼接、**`cast` 截断至 20 人** 等），写出 **`frontend/public/data/galaxy_data.json`** 及同内容的 **`.json.gz`**。

仓库侧新增 **`frontend/public/data/.gitkeep`** 以保留空目录结构；将体积可能很大的 **`galaxy_data.json` / `galaxy_data.json.gz`** 加入 **`.gitignore`**，避免全量构建误提交大文件。实现代码已提交，提交哈希为 **`c417714`**。

---

## 2. 执行操作清单

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 创建 Git 分支 | 分支名：`phase-2-5-export-galaxy-json`（从当时主线检出） |
| 2 | 新增导出包 | `scripts/export/__init__.py`、`scripts/export/export_galaxy_json.py` |
| 3 | 前端静态目录约定 | `frontend/public/data/.gitkeep`（目录可被克隆保留） |
| 4 | 忽略管线大产物 | `.gitignore` 增加 `frontend/public/data/galaxy_data.json` 与 `.json.gz` |
| 5 | 本地联调验证 | 使用 `data/subsample/TMDB_all_movies_random20.csv` 经 Phase 1 清洗与 Phase 2.1–2.4 后得到 16 行对齐数据，成功导出 JSON / gzip；`meta.count == len(movies)` 与有限性断言通过 |
| 6 | Git 提交 | `c417714`，信息：`feat(pipeline): Phase 2.5 galaxy_data.json export with OKLCH palette and Z-axis jitter` |

---

## 3. 与 Tech Spec / 开发计划的对照

| 要求项 | 实现说明 |
| --- | --- |
| Z 轴：小数年份 | 按 `release_date` 解析年、月、日；非 1 月 1 日占位时，\(Z = \text{年} + (\text{年内序日}-1)/\text{当年总天数}\)（闰年 366 天） |
| Z 轴：Jan-1 Jitter | 识别 **`YYYY-01-01`**：`np.random.default_rng(int(id))`，`uniform(0, 0.9999)` 加到年份小数部分；与「确定性、可复现」一致 |
| Z 不归一化 | 导出原始小数年份量级（约 1900–2025），未与 X/Y 对齐量纲 |
| size | `log10(vote_count+1)` 在 **实际 min/max** 上线性映射到 **[2.0, 25.0]**（CLI `--size-min` / `--size-max` 可调） |
| emissive | `vote_average` 在 **实际 min/max** 上线性映射到 **[0.1, 1.5]**（CLI `--emissive-min` / `--emissive-max` 可调） |
| genre_palette | 流派集合与 Phase 2.2 一致：对全表 `genres` 去重后 **`sorted`** 得到顺序；色相 **\(360/N\times index\)**；OKLCH **L=0.75、C=0.14**；转 hex 并 clamp |
| genre_color | 取 **`genres[0]`** 对应 palette 条目的 **归一化 sRGB** \([0,1]^3\) |
| poster_url | `https://image.tmdb.org/t/p/w500` + `poster_path`；缺省或 null-like 时为 **`""`** |
| meta 块 | 含 `version`（UTC 日期 `YYYY.MM.DD`）、`generated_at`（ISO 8601）、`count`、`embedding_model`（默认 MiniLM HF ID 短名）、`umap_params`、`genre_weight_ratio`、`genre_palette`、`feature_weights`、`z_range`、`xy_range` |
| gzip | 默认写出 **`.json.gz`**（`compresslevel=9`）；`--skip-gzip` 可关闭 |
| 开发计划 Checkpoint | 终端打印 `[Z-axis]…`、`[Size]…`、`[Emissive]…`、`[Palette]…`、`[genre_color] sample…`；断言 **`meta.count == len(movies)`**；断言 **x/y/z/size/emissive 均 finite**；断言 **genre_color 分量 ∈ [0,1]**；打印 raw / gzip 文件大小（MB） |

---

## 4. 实现要点（便于复核）

### 4.1 行序契约（关键）

导出脚本 **不** 通过 `id` 再 join，而是 **假定**：

- `cleaned.csv` 第 \(i\) 行与 **`umap_xy.npy`** 第 \(i\) 行一一对应；
- 且二者均与 Phase 2.1–2.3 产出的 **`.npy` 行序**一致。

若中间任何步骤对 CSV 重排或删行而未同步更新坐标矩阵，将导致 **静默错位**。全量/增量流程中应把「同源、同序」作为管线不变量。

### 4.2 OKLCH → sRGB

实现路径遵循常见 **OKLCH → OKLab → LMS 立方 → 线性 sRGB** 系数（Björn Ottosson OKLab 族），再应用 **IEC 61966-2-1 sRGB 传递函数** 得到显示 RGB；对 **线性 RGB 与编码后 RGB** 均做 **[0,1] clamp**，以满足 Design Spec 中的 **gamut clamp** 要求并保证写入 JSON 的 `genre_color` 不越界。

### 4.3 多值 CSV 字段

`cast`、`director`、`writers`、`production_*`、`spoken_languages` 等与 Kaggle/TMDB 合并表一致，按 **逗号拆分** 并 **strip**（与 subsample 中观测格式一致）。**`cast`** 导出时 **仅保留前 20 人**，与 Tech Spec §4.4 体积建议一致。

### 4.4 `meta.umap_params` 与真实拟合的一致性

脚本通过 CLI 传入 **`--n-neighbors`、`--min-dist`、`--metric`、`--random-state`**，**默认与** `scripts/feature_engineering/umap_projection.py` **一致**。当前版本 **不会** 自动从 `umap_model.pkl` 读取已拟合参数；若 Phase 2.4 使用了非默认超参，导出时必须 **显式传入相同参数**，否则 `meta` 中的记录可能与实际 UMAP 不一致。

### 4.5 `meta.embedding_model` 与 `meta.genre_weight_ratio`

- **`embedding_model`**：默认字符串 **`paraphrase-multilingual-MiniLM-L12-v2`**，可通过 `--embedding-model` 覆盖。  
- **`genre_weight_ratio`**：默认 **`feature_engineering.genre_encoding.DEFAULT_GENRE_WEIGHT_RATIO`**（即 \(1/\varphi\)），可通过 `--genre-weight-ratio` 覆盖。

---

## 5. 交付文件与 CLI

### 5.1 仓库内路径

| 路径 | 作用 |
| --- | --- |
| `scripts/export/export_galaxy_json.py` | Phase 2.5 主入口（`argparse` + `main()`） |
| `scripts/export/__init__.py` | 导出阶段包标识 |
| `frontend/public/data/.gitkeep` | 保留 `public/data` 目录（JSON 本体被 gitignore） |

### 5.2 默认输入 / 输出

| 类型 | 默认路径 |
| --- | --- |
| 清洗表 | `data/output/cleaned.csv` |
| UMAP 坐标 | `data/output/umap_xy.npy` |
| JSON | `frontend/public/data/galaxy_data.json` |
| gzip | `frontend/public/data/galaxy_data.json.gz` |

### 5.3 常用命令

```bash
# 查看参数说明
python scripts/export/export_galaxy_json.py --help

# 使用默认路径导出（含 gzip）
python scripts/export/export_galaxy_json.py

# 仅写 JSON、不写 gzip
python scripts/export/export_galaxy_json.py --skip-gzip
```

---

## 6. 本地验证摘要（subsample）

在 **`data/subsample/TMDB_all_movies_random20.csv`** 上执行 Phase 1 清洗后，动态票仓阈值剔除 4 行，剩余 **16** 行写入 `cleaned.csv`；随后 Phase 2.1–2.4 产出对齐的 **16×384** 文本嵌入、**16×15** 流派向量、**16×4** 语言向量及 **UMAP (16,2)** 坐标；导出脚本成功生成 JSON，抽样校验：

- `meta.count == 16` 且与 `movies` 长度一致；
- 首条影片 `genre_color` 分量均在 **[0,1]**；
- `poster_url` 以 TMDB `w500` 基址 + `poster_path` 拼接正确。

**说明**：验证过程中产生的 **`data/output/*.npy` / `*.pkl`** 与 **`frontend/public/data/*.json*`** 受 `.gitignore` 策略影响，通常 **不进入 Git**；克隆仓库后需本地重跑管线再生。

---

## 7. 已知限制与后续建议

1. **`meta.umap_params` 手写同步**：建议后续从序列化模型读取 `get_params()`，或让 Phase 2.4 写出侧车 JSON 供本脚本消费。  
2. **`run_pipeline.py` 未纳入 Phase 2**：全链一键跑通仍属计划 **Phase 2.6**；当前各阶段仍为独立 CLI。  
3. **多值字段逗号拆分**：未实现 Dataset Report 中提及的 **smart_split**（`Inc.` / `Ltd.` 等回合拼回）；若后续发现 HUD 中公司/人名被误切，可在导出前引入与清洗阶段一致的拆分工具。  
4. **Windows 控制台编码**：含 `≈` 等 Unicode 的 print 在部分代码页下可能显示为乱码；不影响 JSON 内容。

---

## 8. Git 信息（便于溯源）

| 项 | 值 |
| --- | --- |
| 分支名 | `phase-2-5-export-galaxy-json` |
| 提交哈希 | `c417714` |
| 提交说明 | `feat(pipeline): Phase 2.5 galaxy_data.json export with OKLCH palette and Z-axis jitter` |

若本地 `git commit` 被钩子追加了额外脚注（如工具链标记），以 **`git log -1`** 为准。

---

## 9. 结论

Phase 2.5 所要求的 **Z 轴语义、粒子映射字段、OKLCH 流派色板、Tech Spec §4 JSON 契约、gzip 产物与验收断言** 已在 `scripts/export/export_galaxy_json.py` 中实现，并通过 subsample 端到端路径验证。下一步可按开发计划推进 **Phase 2.6**（subsample 冒烟与 `run_pipeline` 串联）或合并本分支后继续前端 Phase 3。
