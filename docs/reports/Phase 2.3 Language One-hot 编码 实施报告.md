# Phase 2.3 Language One-hot 编码 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 2.3  
> **规范依据**: `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` §2.1（文化锚点 / `original_language`）、§2.1.3（语言组拼接前 L2）  
> **报告日期**: 2026-04-12  
> **范围**: Git 分支与提交、`language_encoding.py` 交付、算法与 CLI、断言与日志、本地验证记录；不含 Phase 2.4 及以后

---

## 1. 摘要

本次工作落实了开发计划中 **Phase 2.3：Language One-hot 编码**。在独立脚本 `scripts/feature_engineering/language_encoding.py` 中：从清洗后的 CSV 读取 **`original_language`** 列；在全表上动态统计 **去重语种代码集合**，列顺序为 **`sorted(set(...))`** 固定 **`N_lang`** 维（与 Phase 2.2 流派词表一致，保证可复现）；对每一行构造 **标准 one-hot**（恰有一个分量为 1.0，其余为 0），再对 **每一行做 L2 归一化**（one-hot 的 L2 范数已为 1，归一化后数值不变，但与文本 / 流派脚本保持同一套数值契约），输出 **`float32` 的 `.npy` 矩阵** `(n_rows, N_lang)`，行序与输入 CSV 一致，供 Phase 2.4 多模态融合与 UMAP 使用。

对 **空值 / 仅空白 / NaN / 字符串 `nan`·`none`** 的单元格，统一映射为占位码 **`__unknown__`**，使其仍对应词表中的单一维度，从而满足「每行恰有一个非零分量」的 one-hot 语义与后续距离度量的一致性。若某非空代码未出现在拟合词表中（本实现中不应发生，因词表由同一列扫描得到），脚本会以 `KeyError` 失败，避免静默错位。

实施时在仓库中 **新建 Git 分支** `phase-2.3-language-encoding` 并完成 **提交** `298446d`；大规模 `.npy` 若写入 `data/output/` 则通常被 `.gitignore` 忽略，不进入版本库。

---

## 2. 执行操作清单

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 创建 Git 分支 | 分支名：`phase-2.3-language-encoding`（从当时工作区 HEAD 检出，避免在默认分支上直接改 Phase 2.x 代码） |
| 2 | 新增脚本 | `scripts/feature_engineering/language_encoding.py` |
| 3 | 本地验证 | 使用临时小 CSV（含 `en` / `fr` / 空字符串）跑通脚本；校验输出形状、日志、`--meta-output` JSON（见 §6） |
| 4 | Git 提交 | 提交：`298446d`，信息：`feat(pipeline): add Phase 2.3 original_language one-hot encoding` |
| 5 | 控制台兼容性 | 日志使用 ASCII `->`，与 Phase 2.2 报告约定一致 |

---

## 3. 与 Tech Spec / 开发计划的对照

| 要求项 | 实现说明 |
| --- | --- |
| 动态 `N_lang` | 扫描 `original_language` 列，经 `normalize_language_code` 后收集唯一值，`sorted(...)` 得到列顺序；**禁止写死**语言维度 |
| 标准 One-hot | 每行在对应 ISO 639-1（或占位码）列置 **1.0**，其余为 **0** |
| L2 归一化 | 对 one-hot 行调用与 Phase 2.1 / 2.2 相同的 `l2_normalize_rows`，满足 Tech Spec §2.1.3「语言 One-hot 在拼接前须 L2」 |
| 开发计划 Checkpoint | 打印 `[Language] Unique languages: …`（**频次前 10** 便于阅读，完整词表仍为字典序）、`Output shape: (n, N_lang)`；**断言**每行 `np.count_nonzero == 1`；**断言**行 L2 范数 \(\approx 1\)（`atol=1e-4`）；**断言**无 NaN |

---

## 4. 算法要点（便于复核）

设词表为 \(L = \{\ell_1,\ldots,\ell_{N_{lang}}\}\)（按字符串升序的列）。对第 \(i\) 行，规范化后的语言代码为 \(c_i \in L\)。令 \(e(c)\) 为 \(c\) 在词表中的标准基向量。则：

\[
v_{\mathrm{raw},i} = e(c_i), \qquad v_i = v_{\mathrm{raw},i} / \|v_{\mathrm{raw},i}\|_2 = v_{\mathrm{raw},i}
\]

（后者因 \(\|e(c)\|_2 = 1\)。）**空单元格**：\(c_i = \texttt{\_\_unknown\_\_}\)，且该符号仅在列中至少出现一次空值时进入词表 \(L\)。

**列顺序 vs 日志顺序**：矩阵列顺序 **始终** 为 `sorted(L)`；终端中 `->` 后展示的列表为 **按出现频次降序、同频按代码升序** 的前 10 个代码，用于快速扫一眼主语种分布，**不等于** `.npy` 的列下标顺序。

---

## 5. 交付文件与接口

### 5.1 仓库内代码路径

- `scripts/feature_engineering/language_encoding.py` — 主入口（`argparse` + `main()`）

### 5.2 命令行参数

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `--input` | `data/output/cleaned.csv` | 清洗后 CSV，**必须含 `original_language`** |
| `--output` | `data/output/language_vectors.npy` | `numpy.save`，`shape = (n_rows, N_lang)`，`dtype=float32` |
| `--meta-output` | 无 | 若指定，写入 JSON：`languages`（**列顺序**，与 `.npy` 列一致）、`unknown_token`（固定为 `__unknown__`）、`n_rows`、`n_lang` |

### 5.3 常用命令

```bash
python scripts/feature_engineering/language_encoding.py --help

python scripts/feature_engineering/language_encoding.py

python scripts/feature_engineering/language_encoding.py ^
  --input data/output/cleaned.csv ^
  --output data/output/language_vectors.npy ^
  --meta-output data/output/language_meta.json
```

（Windows 可将 `python` 换为 `.venv\Scripts\python`；续行符按 PowerShell / cmd 习惯调整。）

---

## 6. 验证与运行记录（本次实施）

因仓库内 `data/output/cleaned.csv` 可能未纳入版本控制或受本地忽略规则影响，**全量复跑**以用户本机实际数据为准。实施时在 **临时 CSV**（3 行：`en`、`fr`、空）上完成逻辑验证：

| 项目 | 结果 |
| --- | --- |
| 词表大小 | **3**（`__unknown__`、`en`、`fr` 字典序） |
| 终端 `Unique languages` 列表 | 频次统计下前 10 为 **`['__unknown__', 'en', 'fr']`**（三者出现次数均为 1 时，按实现 `sorted(..., key=lambda c: (-counts[c], c))` 在 **同频下按代码字符串升序** 排列）。**矩阵列序**仍以 **`languages` meta（字典序）** 为准：`['__unknown__', 'en', 'fr']`，与日志中本例恰好一致 |
| 输出形状 | **`(3, 3)`** |
| 退出码 | **0**；`language_vectors.npy` 与可选 `meta` JSON 均成功写入 |

建议在获得 `cleaned.csv` 后于项目根执行默认命令，确认终端出现 `[Language]` 日志块且所有断言通过；全量数据下应看到 `N_lang` 为数十量级（取决于数据集中出现的不同 `original_language` 代码数，含可能的 `__unknown__`）。

---

## 7. 产出物与版本控制说明

| 产物 | 路径 / 形态 | 是否提交 Git |
| --- | --- | --- |
| 脚本 | `scripts/feature_engineering/language_encoding.py` | **是**（分支 `phase-2.3-language-encoding`，提交 `298446d`） |
| 向量矩阵 | `data/output/language_vectors.npy`（默认） | **通常否**（`data/output/` 在 `.gitignore` 中） |
| 可选元数据 | `--meta-output` 指定路径 | **通常否**（同上） |

**行序契约**：`language_vectors.npy` 第 \(i\) 行与 `pandas.read_csv` 后 DataFrame 第 \(i\) 行一致；与 `text_embeddings.npy`、`genre_vectors.npy` 拼接时，必须使用 **同一次清洗得到的、行序未改动的** `cleaned.csv` 及其衍生矩阵。

---

## 8. 后续衔接建议

1. **Phase 2.4** `umap_projection.py`：三组特征分别 L2 后乘以 \(1/\sqrt{d}\) 及模态权重再 `concatenate`；本脚本输出已满足「语言组 L2」一步。融合时 **`N_lang` 以本脚本或 `language_meta.json` 为准**。  
2. **Phase 2.5** JSON 导出： per-movie 的展示字段仍来自 CSV 的 `original_language` 原值；本文件仅提供 **UMAP 输入空间** 中的语言锚点向量。  
3. **`run_pipeline.py`**：当前仍以 Phase 1 清洗为主；待 Phase 2 串联稳定后可将本步纳入编排（与 2.1、2.2 并列调用）。  
4. **空语言策略**：若业务上希望在清洗阶段就剔除 `original_language` 为空的行，可在 Phase 1 增加规则；当前 Phase 2.3 用 `__unknown__` 保留行数与矩阵形状，避免与 embedding 行数不一致。

---

## 9. 结论

Phase 2.3 所需的 **`original_language` 动态 one-hot + 行 L2 归一化** 脚本已落地，行为与 **Tech Spec §2.1 / §2.1.3** 及开发计划 **Checkpoint** 一致；已在可控小样本上验证形状、one-hot 稀疏性与范数断言。全量运行依赖本地 `cleaned.csv`，产物为构建工件，宜由脚本生成而非手工提交 Git。

---

## 10. 附录：相关文档与计划索引

- 开发计划：`.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md`（Phase 2.3 节）  
- 技术规范：`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`（§2.1、§2.1.3）  
- 数据集报告：`docs/reports/TMDB All Movies Dataset Report.md`（`original_language` 字段完整性）  
- 管线约定：`.cursor/rules/python-pipeline.mdc`（特征融合小节）  
- 前序报告：`docs/reports/Phase 2.1 文本 Embedding 实施报告.md`、`docs/reports/Phase 2.2 Genre 顺位权重编码 实施报告.md`
