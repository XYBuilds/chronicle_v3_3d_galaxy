# Phase 2.4 多模态融合与 UMAP 投影 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 2.4  
> **规范依据**: `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` §2.1.3（特征融合）、项目概览与 `.cursor/rules/python-pipeline.mdc`（Feature Fusion）  
> **报告日期**: 2026-04-12  
> **范围**: 本次工作完成的 Git 分支、脚本交付、融合与 UMAP 行为说明、本地合成数据验证；不含 Phase 2.5 JSON 导出及 `run_pipeline.py` 全链串联

---

## 1. 摘要

本次工作落实了开发计划中 **Phase 2.4：多模态融合 + UMAP 投影**。新增独立脚本 `scripts/feature_engineering/umap_projection.py`：从磁盘加载 Phase 2.1–2.3 产出的三组 **`float32` 行对齐矩阵**（文本嵌入、流派向量、语言向量），对每一模态在拼接前施加 **块级标量缩放** \( \times (1/\sqrt{d}) \times w_{\mathrm{modal}} \)（默认三个 \(w\) 均为 **1.0**），将三块沿列轴 **`np.concatenate`** 后，使用 **`umap-learn`** 的 **`UMAP(n_components=2, random_state=42, …)`** 做 **`fit_transform`**，得到 **二维平面坐标**；同时将拟合后的估计器以 **`joblib`** 序列化为 **`.pkl`**，供日后对同分布拼接特征做 **`.transform()`**（增量或批处理场景）。

实施前按用户要求在仓库中 **新建 Git 分支** `phase-2.4-umap-fusion` 并完成代码 **提交**（`b6e71f5`）。默认输出路径位于 `data/output/`，与既有 Phase 2 脚本约定一致；大体积 `.npy` / `.pkl` 通常被 `.gitignore` 忽略，不进入版本库。

---

## 2. 执行操作清单

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 创建 Git 分支 | 分支名：`phase-2.4-umap-fusion`（从当时主线检出） |
| 2 | 新增脚本 | `scripts/feature_engineering/umap_projection.py` |
| 3 | 更新包说明 | `scripts/feature_engineering/__init__.py` 文案中纳入 UMAP 步骤 |
| 4 | 本地验证 | 使用合成随机矩阵（\(n=80\)，维度 384 / 22 / 40）跑通融合、UMAP、`np.save` 与 `joblib.dump`；另用 `joblib.load` + `fuse_modalities` + `transform` 抽样 5 行验证有限性（见 §6） |
| 5 | Git 提交 | 提交哈希：`b6e71f5`，信息：`feat(pipeline): Phase 2.4 multimodal fusion and UMAP projection` |

---

## 3. 与 Tech Spec / 开发计划的对照

| 要求项 | 实现说明 |
| --- | --- |
| 各组已 L2 归一化 | 输入假定来自 Phase 2.1–2.3 脚本输出（每行 L2≈1）；本步不再重复 L2 |
| 块级 \(1/\sqrt{d}\) 缩放 | 对文本、流派、语言三个矩阵分别乘以标量 \((1/\sqrt{d_{\mathrm{text}}})\,w_{\mathrm{text}}\) 等，整块元素同乘（见 §4） |
| 模态权重 | CLI：`--w-text`、`--w-genre`、`--w-lang`，默认 **1.0**，与 Tech Spec / `python-pipeline.mdc` 一致 |
| 拼接 | `np.concatenate([scaled_text, scaled_genre, scaled_lang], axis=1)` |
| UMAP | `n_components=2`，**`random_state=42`**（默认，可通过 CLI 覆盖以作消融，生产管线建议保持 42） |
| 保存模型 | **`joblib.dump(reducer, path, compress=3)`**，扩展名默认 **`.pkl`**，满足「供未来 `transform()`」 |
| 输出坐标 | **`np.save`** → 默认 `data/output/umap_xy.npy`，**`dtype=float32`**，形状 **`(n, 2)`** |
| 开发计划 Checkpoint | 打印 `[Fusion] text: (n, d_t) * … \| genre: … \| lang: …`、`Combined shape:`、`[UMAP] Output shape: (n, 2) \| X range: […] \| Y range: […]`；断言 **`np.isfinite(xy).all()`**；打印模型文件字节数 |

---

## 4. 算法与实现要点

### 4.1 融合公式

设文本矩阵为 \(X^{(t)} \in \mathbb{R}^{n \times d_t}\)，流派为 \(X^{(g)} \in \mathbb{R}^{n \times d_g}\)，语言为 \(X^{(l)} \in \mathbb{R}^{n \times d_l}\)。标量：

\[
s_t = \frac{w_{\mathrm{text}}}{\sqrt{d_t}},\quad
s_g = \frac{w_{\mathrm{genre}}}{\sqrt{d_g}},\quad
s_l = \frac{w_{\mathrm{lang}}}{\sqrt{d_l}}
\]

拼接输入为：

\[
Z = \big[\, s_t X^{(t)} \;\|\; s_g X^{(g)} \;\|\; s_l X^{(l)} \,\big] \in \mathbb{R}^{n \times (d_t+d_g+d_l)}
\]

脚本内部为数值稳定将块转为 **`float64`** 做缩放与拼接，再送入 UMAP；**写出坐标时降为 `float32`**。

### 4.2 UMAP 超参与小样本安全

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `metric` | `cosine` | 与高维稀疏语义组合常见实践一致；可通过 `--metric` 修改 |
| `n_neighbors` | `15` | 通过 **`_umap_n_neighbors(n, requested)`** 限制为 **`≤ n_samples - 1`** 且 **`≥ 2`**，避免小样本违反 UMAP 约束 |
| `min_dist` | `0.1` | UMAP 默认族内常用起点；CLI `--min-dist` |
| `random_state` | `42` | CLI `--random-state`，与项目约束一致 |
| `n_jobs` | `1` | 固定为 1，避免与 `random_state` 组合时在部分版本上产生并行相关告警 |
| `verbose` | `False` | 默认安静；需要 epoch 日志时加 **`--umap-verbose`** |

### 4.3 行序与形状校验

- 加载后断言三组矩阵 **行数相同**，否则 **`ValueError`**。  
- 断言均为 **二维**数组。  
- **不读取 CSV**：对齐责任在上游保证三个 `.npy` 来自同一版 `cleaned.csv` 且未各自重排；若中间有删行，必须先对齐键（如 `id`）再导出矩阵。

---

## 5. 交付文件与接口

### 5.1 仓库内代码路径

- `scripts/feature_engineering/umap_projection.py` — 主入口（`argparse` + `main()`）  
- `scripts/feature_engineering/__init__.py` — 包说明（一行更新）

### 5.2 命令行参数

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `--text-input` | `data/output/text_embeddings.npy` | Phase 2.1 输出，形状 `(n, 384)` |
| `--genre-input` | `data/output/genre_vectors.npy` | Phase 2.2 输出，形状 `(n, N_genre)` |
| `--lang-input` | `data/output/language_vectors.npy` | Phase 2.3 输出，形状 `(n, N_lang)` |
| `--output-xy` | `data/output/umap_xy.npy` | UMAP 坐标，`float32`，`(n, 2)` |
| `--model-output` | `data/output/umap_model.pkl` | `joblib` 序列化的拟合 `UMAP` 实例 |
| `--w-text` / `--w-genre` / `--w-lang` | `1.0` | 模态权重 |
| `--random-state` | `42` | UMAP 随机种子 |
| `--n-neighbors` | `15` | 请求值；实际会按样本数上限截断 |
| `--min-dist` | `0.1` | UMAP `min_dist` |
| `--metric` | `cosine` | UMAP 距离度量 |
| `--umap-verbose` | 关闭 | 打开 UMAP 内部进度日志 |

### 5.3 常用命令

```bash
python scripts/feature_engineering/umap_projection.py --help

# 默认路径（需已存在三个输入 npy）
python scripts/feature_engineering/umap_projection.py

# 显式指定 IO（示例）
python scripts/feature_engineering/umap_projection.py ^
  --text-input data/output/text_embeddings.npy ^
  --genre-input data/output/genre_vectors.npy ^
  --lang-input data/output/language_vectors.npy ^
  --output-xy data/output/umap_xy.npy ^
  --model-output data/output/umap_model.pkl
```

（Windows 可将 `python` 换为 `.venv\Scripts\python`；`^` 为 cmd 续行。）

### 5.4 下游加载示例（Python）

```python
import numpy as np
import joblib

xy = np.load("data/output/umap_xy.npy")  # (n, 2), float32
model = joblib.load("data/output/umap_model.pkl")
# 对新样本需先用相同词表与缩放构造 Z_new，再 model.transform(Z_new)
```

---

## 6. 验证与运行记录（本次实施）

全量 **59k+** 行 UMAP 依赖本机已生成的三个特征矩阵与算力，**未在本次文档撰写时重复跑全量**；实施脚本当时已在 **合成数据** 上完成端到端验证，记录如下（数值随随机种子与 `umap-learn` 版本可能略有浮动，但流程与形状不变）。

| 项目 | 结果 |
| --- | --- |
| 合成样本量 \(n\) | **80** |
| 输入形状 | text **`(80, 384)`**，genre **`(80, 22)`**，lang **`(80, 40)`** |
| 终端 `[Fusion]` 行（示例） | `text: (80, 384) * 0.051031 \| genre: (80, 22) * 0.213201 \| lang: (80, 40) * 0.158114` |
| `Combined shape` | **`(80, 446)`**（384+22+40） |
| `[UMAP] Output shape` | **`(80, 2)`**；打印的 X/Y 范围均为有限区间 |
| 写出文件 | `umap_xy.npy`（约 KB 级）、`umap_model.pkl`（约 **0.14 MB** 量级，含压缩） |
| `transform` 抽查 | 对拼接矩阵前 **5** 行调用 **`model.transform`**，得到 **`(5, 2)`** 且 **`np.isfinite` 为 True** |

**说明**：首次在极小规模数据上调试时，若 `n_neighbors` 大于 `n-1` 会导致 UMAP 报错；脚本已通过自动截断规避。全量跑通后应再检查终端 **`[UMAP]`** 行与磁盘产物大小是否合理。

---

## 7. 产出物与版本控制说明

| 产物 | 路径 / 形态 | 是否提交 Git |
| --- | --- | --- |
| 脚本与包文案 | `scripts/feature_engineering/umap_projection.py`、`__init__.py` | **是**（提交 `b6e71f5`，分支 `phase-2.4-umap-fusion`） |
| 坐标矩阵 | `data/output/umap_xy.npy`（默认） | **通常否**（`data/output/` 在 `.gitignore` 中） |
| UMAP 模型 | `data/output/umap_model.pkl`（默认） | **通常否** |

**行序契约**：`umap_xy.npy` 第 \(i\) 行对应三个输入矩阵的第 \(i\) 行；Phase 2.5 导出 JSON 时应与同一索引下的影片元数据对齐。

---

## 8. 后续衔接建议

1. **Phase 2.5** `export_galaxy_json.py`：读取 `umap_xy.npy` 写入每条影片的 **`x` / `y`**；**`z`** 仍由发行日期与小数年份逻辑单独生成（不进入 UMAP）。  
2. **`run_pipeline.py`**：当前仍以 Phase 1 清洗为主；可在后续迭代中增加子命令或阶段，顺序调用 2.1→2.2→2.3→2.4→2.5，并统一 `--input` CSV 与输出目录。  
3. **增量数据**：新片需用**同一**流派/语言词表与同一 embedding 模型生成行向量，再使用已保存模型的 **`transform`**；若词表或模型变更，应重新 **fit** 并版本化模型文件。  
4. **随机性**：固定 `random_state=42` 保证可复现；更换 `metric` / `n_neighbors` / `min_dist` 会改变布局，属实验项，建议在 `meta` 或构建日志中记录。

---

## 9. 结论

Phase 2.4 所需的 **多模态融合 + UMAP 投影脚本** 已落地：实现 **`(1/\sqrt{d})\cdot w` 分块缩放**、**列拼接**、**`random_state=42` 的二维 UMAP**、**坐标 `npy` 与可 `transform` 的 `pkl` 模型** 及计划中的 **Checkpoint 日志与有限性断言**。全量管线验证待本地特征矩阵齐备后执行；JSON 导出见 Phase 2.5。

---

## 10. 附录：相关文档与计划索引

- 开发计划：`.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md`（Phase 2.4 节）  
- 技术规范：`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`（§2.1.3 及 UMAP 相关约定）  
- 项目概览：`.cursor/rules/project-overview.mdc`（UMAP `random_state=42`）  
- 管线约定：`.cursor/rules/python-pipeline.mdc`（Feature Fusion）  
- 前序报告：`docs/reports/Phase 2.1 文本 Embedding 实施报告.md`、`docs/reports/Phase 2.2 Genre 顺位权重编码 实施报告.md`、`docs/reports/Phase 2.3 Language One-hot 编码 实施报告.md`
