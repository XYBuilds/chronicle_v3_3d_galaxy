# Phase 2.2 Genre 顺位权重编码 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 2.2  
> **规范依据**: `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` §2.1.2  
> **报告日期**: 2026-04-12  
> **范围**: 本次会话内完成的 Git 分支、脚本交付、算法与 CLI 说明、本地验证记录；不含 Phase 2.3 及以后

---

## 1. 摘要

本次工作落实了开发计划中 **Phase 2.2：Genre 顺位权重编码**。在独立脚本 `scripts/feature_engineering/genre_encoding.py` 中：从清洗后的 CSV 读取 `genres` 字段，按 **逗号拆分** 并 **保留 TMDB 原始顺位**；在全表上动态统计 **去重流派集合**，以 **字典序排序** 固定 `N_genre` 维列顺序；对第 \(k\) 顺位标签施加几何权重 \(w_k = q^{\,k-1}\)，默认 \(q = 1/\varphi\)（黄金比例衰减）；将各标签的 one-hot 方向按权重 **累加** 得到稠密向量后，对 **每一行做 L2 归一化**，输出 **`float32` 的 `.npy` 矩阵** `(n_rows, N_genre)`，行序与输入 CSV 一致，供后续与文本、语言特征融合及 UMAP 使用。

实施时在仓库中 **新建 Git 分支** `phase-2-2-genre-encoding` 并 **提交** 代码；大规模 `.npy` 若写入 `data/output/` 则通常被 `.gitignore` 忽略，不进入版本库。

---

## 2. 执行操作清单

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 创建 Git 分支 | 分支名：`phase-2-2-genre-encoding`（从 `main` 检出） |
| 2 | 新增脚本 | `scripts/feature_engineering/genre_encoding.py` |
| 3 | 本地验证 | 使用临时小 CSV（含 `Comedy, Drama, Romance` 顺位样例）跑通脚本并校验权重与 L2 范数（见 §5） |
| 4 | Git 提交 | 提交：`21528e7`，信息：`feat(pipeline): add Phase 2.2 genre rank-weighted encoding` |
| 5 | 控制台兼容性 | 日志字符串使用 ASCII 友好写法（如 `->`、`1/phi`），减轻 Windows 默认代码页下的乱码问题 |

---

## 3. 与 Tech Spec / 开发计划的对照

| 要求项 | 实现说明 |
| --- | --- |
| 动态 \(N_{genre}\) | 扫描输入 CSV 的 `genres` 列，收集所有拆分后的标签，`sorted(set(...))` 得到列名顺序；**禁止写死**流派维度 |
| 顺位与权重 | 拆分后列表下标 \(k=1,2,\ldots\) 对应 \(w_k = q^{k-1}\)；默认 \(q = 1/\varphi \approx 0.618034\) |
| 向量构造 | 对每个标签取该流派在 **排序后词表** 中的列索引，在对应分量上 **累加** \(w_k\)（同一行重复标签名时会多次累加，属保守行为） |
| L2 归一化 | 对加权求和后的每一行向量做 L2 归一化，满足 Tech Spec §2.1.3 中「流派组拼接前须 L2」的前提 |
| 可调公比 | CLI `--genre-weight-ratio`，须在 `(0, 1)` 内；默认等于 `1/phi` |
| 开发计划 Checkpoint | 打印 `[Genre] Unique genres: …`、`Output shape: (n, N_genre)`；演示行打印 raw 与归一化后非零分量；若存在「Comedy, Drama, Romance」前三顺位则打印与 1.0 / \(q\) / \(q^2\) 的对照；断言每行 L2 范数 \(\approx 1\)（`atol=1e-4`）；断言无 NaN |

---

## 4. 算法要点（便于复核）

设词表为 \(G = \{g_1,\ldots,g_{N_{genre}}\}\)（按名字升序排列的列）。对单条影片，TMDB 给出的流派序列为 \((h_1,\ldots,h_m)\)。令 \(e(h)\) 为 \(h\) 在词表中的标准基向量。编码为：

\[
v_{\mathrm{raw}} = \sum_{k=1}^{m} q^{k-1}\, e(h_k)
\]

输出 \(v = v_{\mathrm{raw}} / \|v_{\mathrm{raw}}\|_2\)（逐行）。**注意**：权重顺位来自 **CSV 中字符串先后**，列顺序来自 **全局排序词表**；二者与 Tech Spec「宏观色仍取 `genres[0]`」并不冲突，后者由导出 JSON 阶段处理。

---

## 5. 交付文件与接口

### 5.1 仓库内代码路径

- `scripts/feature_engineering/genre_encoding.py` — 主入口（`argparse` + `main()`）

### 5.2 命令行参数

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `--input` | `data/output/cleaned.csv` | 清洗后 CSV，**必须含 `genres`** |
| `--output` | `data/output/genre_vectors.npy` | `numpy.save`，`shape = (n_rows, N_genre)`，`dtype=float32` |
| `--meta-output` | 无 | 若指定，写入 JSON：`genres`（列顺序）、`genre_weight_ratio`、`n_rows`、`n_genre`，便于 Phase 2.4 与导出脚本对齐 |
| `--genre-weight-ratio` | `1/phi` | 几何衰减底数 \(q\) |

### 5.3 常用命令

```bash
python scripts/feature_engineering/genre_encoding.py --help

python scripts/feature_engineering/genre_encoding.py

python scripts/feature_engineering/genre_encoding.py ^
  --input data/output/cleaned.csv ^
  --output data/output/genre_vectors.npy ^
  --meta-output data/output/genre_encoding_meta.json
```

（Windows 可将 `python` 换为 `.venv\Scripts\python`；上例第二段为 Bash 风格，第三段为 cmd 风格续行。）

---

## 6. 验证与运行记录（本次实施）

因仓库内 `data/output/cleaned.csv` 可能未纳入版本控制或受本地 `.cursorignore` 影响，**全量复跑**以用户本机实际数据为准。实施时在 **临时 CSV** 上完成逻辑验证：

| 项目 | 结果 |
| --- | --- |
| 样例行 | `Comedy, Drama, Romance` 顺位 |
| Raw 权重（相对 Comedy / Drama / Romance 列） | 约 **1.0**、**0.618034**、**0.381966**（即 \(1, q, q^2\)） |
| 归一化后各行 L2 范数 | **`[1.0, 1.0, 1.0]`**（`np.linalg.norm(..., axis=1)`） |
| 输出形状（3 行样例） | **`(3, 3)`** 词表为 `['Comedy','Drama','Romance']` |

建议在获得 `cleaned.csv` 后于项目根执行默认命令，确认终端出现计划要求的 `[Genre]` 日志块且断言通过。

---

## 7. 产出物与版本控制说明

| 产物 | 路径 / 形态 | 是否提交 Git |
| --- | --- | --- |
| 脚本 | `scripts/feature_engineering/genre_encoding.py` | **是**（分支 `phase-2-2-genre-encoding`，提交 `21528e7`） |
| 向量矩阵 | `data/output/genre_vectors.npy`（默认） | **通常否**（`data/output/` 在 `.gitignore` 中） |
| 可选元数据 | `--meta-output` 指定路径 | **通常否**（同上） |

**行序契约**：`genre_vectors.npy` 第 \(i\) 行与 `pandas.read_csv` 后 DataFrame 第 \(i\) 行一致；下游不得对 CSV 与矩阵分别排序后按行号硬拼。

---

## 8. 后续衔接建议

1. **Phase 2.3** `language_encoding.py`：同样保持行序与 `cleaned.csv` 一致，输出 L2 单位行。  
2. **Phase 2.4** 融合：三组分别 L2 后乘以 \(1/\sqrt{d}\) 及模态权重再 `concatenate`；本脚本输出已满足「流派组 L2」一步。  
3. **Phase 2.5** JSON：`meta.genre_palette` 与 `genre_color` 依赖流派集合时，建议与 **本脚本词表顺序或 `genre_encoding_meta.json` 中的 `genres` 列表** 对齐，避免维度漂移。  
4. **`run_pipeline.py`**：当前仍以 Phase 1 清洗为主；待 Phase 2 串联稳定后可将本步纳入编排（属后续迭代）。

---

## 9. 结论

Phase 2.2 所需的 **Genre 顺位权重编码脚本** 已落地，行为与 **Tech Spec §2.1.2** 及开发计划 **Checkpoint** 一致；已在可控小样本上验证权重与 L2 范数。全量运行依赖本地 `cleaned.csv`，产物为构建工件，宜由脚本生成而非手工提交 Git。

---

## 10. 附录：相关文档与计划索引

- 开发计划：`.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md`（Phase 2.2 节）  
- 技术规范：`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`（§2.1.2、§2.1.3）  
- 特征总表：`docs/project_docs/TMDB 数据特征工程与 3D 映射总表.md`（genres 行）  
- 管线约定：`.cursor/rules/python-pipeline.mdc`（特征融合小节）  
- 前序报告：`docs/reports/Phase 2.1 文本 Embedding 实施报告.md`
