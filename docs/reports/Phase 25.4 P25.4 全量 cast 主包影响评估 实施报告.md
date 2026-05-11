# Phase 25.4 — 全量 cast 进入 `galaxy_data.json.gz` 影响评估 实施报告

**范围**：`.cursor/plans/phase_25_core_experience_polish.plan.md` 子项 **P25.4**（仅评估，不替代 P25.5 的 Drawer 实装）。  
**分支**：`phase25/p25-4-cast-impact-assessment`  
**日期**：2026-05-12  
**状态**：评估完成；**结论：gzip 与解析增量可接受，建议进入 P25.5**（全量 cast + Drawer 布局/滚动）。  
**说明**：SSOT 文档（Data Pipeline / Tech Spec 中 cast 契约）的正式改写留在 **Phase 25.7**；本报告为量化依据与工程入口说明。

---

## 1. 目标（与计划对齐）

1. 对比 **cast 截断 20 人** 与 **CSV 全量 cast** 写入同一导出形状时，`galaxy_data.json` / `gzip -9` 体积与解压+解析耗时。
2. 统计源数据中 cast 长度分布与极端值，供 Drawer UI（P25.5）预估。
3. **再次确认**：cast 为展示字段，**不参与** embedding / UMAP / Procrustes；放宽截断**不改变**星系坐标。

---

## 2. 方法与复现

| 项 | 说明 |
|----|------|
| 数据源 | `data/output/cleaned.csv` + `data/output/umap_xy.npy`（与正式导出同序、同规模；本机样例 **59 341** 条影片） |
| 导出逻辑复用 | `scripts/export/export_galaxy_json.py` 中 `build_galaxy_payload`；新增 CLI **`--cast-max`**：`20`（默认）与 **`0`（全量，0 表示不截断）** |
| 评估脚本 | `scripts/analysis/evaluate_full_cast_impact.py`：两次构建 payload → `json.dumps(..., separators=(",", ":"))` → `gzip.compress(..., compresslevel=9)` |
| Python 基准 | 同进程 `gzip.decompress` + `json.loads`，重复 **N** 次取 **median**（消除冷启动抖动） |
| Node 基准（可选） | `zlib.gunzipSync` + `JSON.parse`，与浏览器栈更接近；需 `--write-temp-gz <dir>` 与 `--node-bench` |

**复现命令示例**（需已有 `cleaned.csv` / `umap_xy.npy`）：

```bash
python scripts/analysis/evaluate_full_cast_impact.py
python scripts/analysis/evaluate_full_cast_impact.py --write-temp-gz .tmp/p25_4_eval --node-bench --bench-iters 5
```

临时 `.gz` 已加入根目录 `.gitignore` 的 `.tmp/`。

---

## 3. 源数据 cast 分布（`cleaned.csv`）

| 指标 | 数值 |
|------|------|
| 影片条数 | 59 341 |
| cast 名字符串拆分后总条数（全库合计） | 1 398 732 |
| 单条影片 cast 个数 **min / max** | 0 / **463** |
| 均值 | ≈ 23.57 |
| **p95 / p99** | 61 / 96 |
| cast **> 20** 的影片数 | **26 179**（约 44.1%） |
| 相对「每人只保留前 20」多出的名字总量 | **500 506** |

**极端长 cast**：当前 Drawer 为短列表 + 序号；全量后必须在 P25.5 用 **可滚动区域 + 列布局** 承接（计划已覆盖）。

---

## 4. 体积对比（同一 `meta`+`movies` 形状，仅 `cast[]` 长度不同）

| 指标 | cap 20 | 全量 cast | 增量 |
|------|--------|-----------|------|
| UTF-8 JSON（紧凑序列化） | ≈ **92.07 MiB** | ≈ **99.95 MiB** | **+7.88 MiB**（≈ +8.6%） |
| **gzip level 9** | ≈ **31.19 MiB** | ≈ **35.00 MiB** | **+3.81 MiB**（相对 cap20 **+12.23%**） |

 gzip 增量比例高于裸 JSON，符合「重复人名字符串在 gzip 字典中仍主要体现为新增 literals」的预期；**绝对增量约 3.8 MiB**，对当前主包体量（约 31 MiB 级）仍属温和。

---

## 5. 解析性能（本机一次采样；median，**非**实验室隔离 CPU）

**Python**（`gzip.decompress` + `json.loads`，`--bench-iters 3` 一次运行）：

| 阶段 | cap 20 | 全量 | 差值 |
|------|--------|------|------|
| gunzip median | ≈ 163 ms | ≈ 183 ms | ≈ +20 ms |
| parse median | ≈ 833 ms | ≈ 919 ms | ≈ **+86 ms** |

另一次 7 次迭代采样中 parse 差值曾低至约 **+15 ms**，说明 **JSON.parse 主导项受 GC/调度噪声大**；全量相对 cap20 的解析成本为**同量级小幅上升**，未发现数量级退化。

**Node**（`gunzipSync` + `JSON.parse`，`iters=3`，与上表同机、同文件）：

|  | cap 20 | 全量 |
|--|--------|------|
| gunzip mean | ≈ 230 ms | ≈ 254 ms |
| parse mean | ≈ 488 ms | ≈ 521 ms |

Node 与 Python 绝对毫秒数不可横向对比（运行时与实现不同），仅作「V8 路径上增量趋势」参考。

**内存**：本评估未做 `RSS`/Chrome heap 剖面；**解压后 UTF-8 文本约 +7.9 MiB** 可作为解析峰值下界之一。若未来主包逼近托管上限，可再评估「cast 侧车 JSON」方案（计划 P25.4 验收中的备选）。

---

## 6. 结论与下游

| 问题 | 结论 |
|------|------|
| UMAP / 坐标 | **不变**；cast 不在特征与 `umap_xy` 管线中。 |
| gzip 主包 | **+约 3.8 MiB（+12.2%）**；可接受。 |
| 首屏解析 | **略增**（毫秒～百毫秒级，依机器与迭代次数波动）；无红线条。 |
| 极端 cast UI | **必须**在 P25.5 用滚动 + 多列/响应式列数承接（最长 463 人）。 |

**建议**：按 Phase 25 计划进入 **P25.5**（Drawer：去序号、三列/小屏降列、全量 cast、宽度与滚动）；导出端将默认 `cast_max` 从 20 改为全量时，在 **P25.7** 同步 Data Pipeline / Tech Spec §cast 契约。

---

## 7. 代码与文档变更清单（本项）

| 路径 | 说明 |
|------|------|
| `scripts/export/export_galaxy_json.py` | `--cast-max`（默认 20；**0 = 不截断全量 cast**）；`build_galaxy_payload(..., cast_max=...)` |
| `scripts/analysis/evaluate_full_cast_impact.py` | P25.4 量化脚本（体积 + Python/可选 Node 基准） |
| `.gitignore` | 忽略 `.tmp/`（评估临时 gzip） |
| `.cursor/plans/phase_25_core_experience_polish.plan.md` | **P25.4 todo** 标为 **completed** |
