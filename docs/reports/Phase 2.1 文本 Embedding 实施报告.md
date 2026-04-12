# Phase 2.1 文本 Embedding 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 2.1  
> **规范依据**: `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` §2.1.1  
> **报告日期**: 2026-04-12  
> **范围**: 本次会话内完成的 Git 分支、代码交付、本地验证与产物说明（不含 Phase 2.2 及以后）

---

## 1. 摘要

本次工作落实了开发计划中 **Phase 2.1：文本 Embedding** 的独立可执行脚本：从清洗后的 CSV 读取 `tagline` 与 `overview`，按约定拼接与截断后，使用 **阶段 A** 多语言句向量模型 **`paraphrase-multilingual-MiniLM-L12-v2`**（384 维）在 **GPU（CUDA）** 上批量编码，对输出做 **L2 归一化**，并将结果写入 **`float32` 的 `.npy` 矩阵**（行序与输入 CSV 严格一致），供后续多模态融合与 UMAP 使用。

同时在仓库中 **新建 Git 分支** 并 **提交** 了脚本代码；大规模向量文件位于 `data/output/`（已被 `.gitignore` 忽略，不进入版本库）。

---

## 2. 执行操作清单

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 创建 Git 分支 | 分支名：`phase-2-1-text-embedding` |
| 2 | 新增 Python 包目录 | `scripts/feature_engineering/` |
| 3 | 新增脚本 | `scripts/feature_engineering/text_embedding.py` |
| 4 | 包初始化 | `scripts/feature_engineering/__init__.py`（模块标识） |
| 5 | 本地验证 | 小样本冒烟 + 全量 `cleaned.csv` 编码（见 §5） |
| 6 | Git 提交 | 提交信息：`feat(pipeline): Phase 2.1 text embeddings (MiniLM 384d, L2 norm, GPU)` |

---

## 3. 与 Tech Spec / 开发计划的对照

| 要求项 | 实现说明 |
| --- | --- |
| 模型（阶段 A） | `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`，输出维度 **384** |
| 输入形态 | 有 tagline：`Tagline: {tagline}\nOverview: {overview}`；无 tagline（空/空白）：`Overview: {overview}` |
| 截断 | 对拼接后的**整段字符串**单次截断，**保留开头 3000 字符**（从尾部截掉超出部分），与 Tech Spec 表述一致 |
| L2 归一化 | 对每条 embedding 按行 L2 归一化；脚本内对前 3 行打印 L2 范数并校验 ≈ 1.0（容差 1e-3） |
| GPU | 默认 `--device auto`：若 `torch.cuda.is_available()` 为真则使用 `cuda`；可显式指定 `cuda` / `cpu` |
| batch | CLI `--batch-size`，默认 **64**；全量验证时使用 **128**（显存允许时可提高，OOM 则应下调而非丢行） |
| 开发计划 Checkpoint | 终端行：`[Embedding] Device: … / Model: paraphrase-multilingual-MiniLM-L12-v2 / Input rows: {n} / Output shape: ({n}, 384)`；形状断言；前 3 条 L2 范数；无 NaN |

---

## 4. 交付文件与接口

### 4.1 仓库内代码路径

- `scripts/feature_engineering/text_embedding.py` — 主入口（`argparse` + `main()`）
- `scripts/feature_engineering/__init__.py` — 包说明

### 4.2 命令行参数

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `--input` | `data/output/cleaned.csv`（相对仓库根） | 清洗后的 CSV，**必须含 `overview`**；**推荐含 `tagline`** |
| `--output` | `data/output/text_embeddings.npy` | `numpy.save` 的数组路径，`shape = (n_rows, 384)`，`dtype=float32` |
| `--max-chars` | `3000` | 拼接后最大字符数 |
| `--batch-size` | `64` | `SentenceTransformer.encode` 的 batch |
| `--device` | `auto` | `auto` \| `cuda` \| `cpu` |

### 4.3 常用命令

```bash
# 查看帮助
python scripts/feature_engineering/text_embedding.py --help

# 默认路径全量编码（设备自动）
python scripts/feature_engineering/text_embedding.py

# 显式指定输入输出与 batch
python scripts/feature_engineering/text_embedding.py --input data/output/cleaned.csv --output data/output/text_embeddings.npy --batch-size 128 --device auto
```

（Windows 下可将 `python` 换为 `.venv\Scripts\python`。）

---

## 5. 验证与运行记录（本次实施环境）

以下记录在 **实施当次** 的机器上执行成功；若在其他机器复现，行数与耗时可能因数据版本与硬件不同而变化。

### 5.1 冒烟测试（约 32 行）

- 从 `data/output/cleaned.csv` 截取前 32 行写入临时 CSV，对该文件运行脚本。
- 结果：**CUDA 可用**；输出形状 `(32, 384)`；前 3 行 L2 范数为 **1.0**；无 NaN。

### 5.2 全量运行（与当前 `cleaned.csv` 一致）

| 项目 | 数值 |
| --- | --- |
| 输入行数 `n` | **59,014** |
| 输出形状 | **(59014, 384)** |
| 设备 | **cuda** |
| `batch-size` | **128** |
| 输出文件（示例） | `data/output/text_embeddings.npy` |
| 输出文件大小（示例） | 约 **86.45 MB** |

### 5.3 环境与依赖提示

- **Hugging Face**：首次运行会从 Hub 拉取模型；未配置 `HF_TOKEN` 时可能出现速率相关提示，不影响单次全量完成。
- **Windows 缓存**：可能出现「不支持符号链接」类警告，属 Hub 缓存行为说明，不影响计算正确性。
- **sentence-transformers 加载日志**：可能出现 `BertModel LOAD REPORT` 中与 `position_ids` 相关的 **UNEXPECTED** 提示，属跨任务加载时的常见提示；与本管线「仅做句向量编码」的用法兼容。

---

## 6. 产出物与版本控制说明

| 产物 | 路径 / 形态 | 是否提交 Git |
| --- | --- | --- |
| 脚本与包文件 | `scripts/feature_engineering/*.py` | **是**（在分支 `phase-2-1-text-embedding` 上） |
| 向量矩阵 | `data/output/text_embeddings.npy` | **否**（目录 `data/output/` 在 `.gitignore` 中） |
| 临时冒烟文件（若仍存在） | 如 `data/output/_embed_smoke.csv`、`_embed_smoke.npy` | **否**（且建议本地删除） |

**行序契约**：`text_embeddings.npy` 的第 `i` 行与输入 CSV 经 `pandas.read_csv` 后的第 `i` 行一一对应；下游融合脚本应**禁止**对清洗表与向量各自独立排序后拼接。

---

## 7. 后续衔接建议

1. **Phase 2.2** `genre_encoding.py`、**2.3** `language_encoding.py`：保持与 `cleaned.csv` 相同行序，或统一以 `id` 为键做 join（若中间有行过滤则必须显式对齐策略）。
2. **Phase 2.4** 多模态融合：对三组特征分别 `× (1/√d) × w_modal` 后再拼接；文本向量应已 L2 归一化，与 Tech Spec §2.1.3 一致。
3. **`run_pipeline.py`**：当前仓库入口仍以 Phase 1 清洗为主；待 Phase 2 各步稳定后，可将 embedding 作为可选步骤或子命令串联（属后续迭代，不在本次交付范围）。

---

## 8. 结论

Phase 2.1 所需的 **独立文本 Embedding 脚本** 已落地并通过 **小样本 + 全量（59,014 行）** 验证；行为与 **Tech Spec §2.1.1** 及开发计划中的 **Checkpoint** 一致。向量产物为本地构建工件，需通过重新运行脚本或在 CI/发布流程中生成，不宜手工提交至 Git。

---

## 9. 附录：相关文档与计划索引

- 开发计划：`.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md`（Phase 2.1 节）  
- 技术规范：`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`（§2.1.1）  
- 特征总表：`docs/project_docs/TMDB 数据特征工程与 3D 映射总表.md`（文本 Embedding 约定）  
- 管线约定：`.cursor/rules/python-pipeline.mdc`（Embedding 小节）
