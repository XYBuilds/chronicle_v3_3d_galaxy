# Phase 1.0 归档旧脚本 实施报告

> **关联计划**: `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — Phase 1.0（`p1-archive-old`）  
> **规范依据**: 开发计划 §「1.0 归档旧脚本」  
> **报告日期**: 2026-04-11（以 Git 提交时间为准）  
> **范围**: 在独立 Git 分支上完成的脚本归档、文档与规则路径修正、开发计划 todo 状态更新，以及合并入主线（不含 Phase 1.1 及以后）

---

## 1. 摘要

本次工作落实了开发计划中 **Phase 1.0：将旧版独立过滤脚本从 `scripts/dataset_processing/` 归档至 `scripts/_archive/`**，共 **6 个** Python 文件，使用 **`git mv`** 保留历史。归档后统一管线将使用全新编排代码（见 Phase 1.1），旧脚本仅作逻辑参考。

同步更新了因路径变更而失效的 **Cursor 规则**、**Tech Spec 目录树**、**《TMDB 数据处理规则》** 中对动态 `vote_count` 阈值脚本的引用；并在开发计划 frontmatter 中将 **`p1-archive-old`** 标记为 **`completed`**。

上述变更已通过 **Pull Request #1**（`feat/phase-1-0-archive-scripts` → `main`）合并进仓库主线。

---

## 2. 执行操作清单

| 序号 | 操作 | 说明 |
| --- | --- | --- |
| 1 | 创建 Git 分支 | 分支名：`feat/phase-1-0-archive-scripts` |
| 2 | 归档 6 个脚本 | `git mv`：`scripts/dataset_processing/*.py` → `scripts/_archive/`（内容未改，仅换路径） |
| 3 | 更新 Cursor 规则 | `.cursor/rules/python-pipeline.mdc` — 脚本目录说明与动态阈值脚本路径指向 `_archive` |
| 4 | 更新项目文档 | `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` — `scripts/` 目录树：`dataset_processing` 改为 `_archive` 说明 |
| 5 | 更新数据处理规则 | `docs/project_docs/TMDB 数据处理规则.md` — 参数「以仓库脚本为准」的路径改为 `_archive` 下同名文件 |
| 6 | 更新开发计划 todo | `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md` — `p1-archive-old` → `status: completed` |
| 7 | Git 提交 | 见 §5（两次提交：归档 + 计划状态） |

---

## 3. 与开发计划的对照（Checkpoint 1.0）

| 计划检查项 | 结果 |
| --- | --- |
| `scripts/dataset_processing/` 应为空或仅含新文件 | 归档后该目录下 **无** `.py` 文件（空目录；Git 不跟踪空目录） |
| `scripts/_archive/` 应含 **6** 个 `.py` 文件 | **已满足**，文件列表见 §4.1 |

---

## 4. 交付文件与路径

### 4.1 归档后的脚本列表（`scripts/_archive/`）

| 文件名 | 原用途（简述） |
| --- | --- |
| `filter_dynamic_baseline_vote_count.py` | 按年度分位数等的动态 `vote_count` 阈值过滤 |
| `filter_genres_null.py` | `genres` 为空剔除 |
| `filter_release_date_null.py` | `release_date` 为空剔除 |
| `filter_vote_average_zero_or_null.py` | `vote_average` 为 0 或空剔除 |
| `filter_vote_count_zero_or_null.py` | `vote_count` 为 0 或空剔除 |
| `merge_by_tconst.py` | 历史合并逻辑（当前全量 CSV 已含 IMDb 字段，计划中标注为归档参考） |

### 4.2 本次修改的非脚本文件

- `.cursor/rules/python-pipeline.mdc`
- `docs/project_docs/TMDB 电影宇宙 Tech Spec.md`（仓库结构树中 `scripts/` 一节）
- `docs/project_docs/TMDB 数据处理规则.md`（动态阈值参数引用路径）
- `.cursor/plans/tmdb_galaxy_dev_plan_5ad6bea5.plan.md`（todo 状态）

### 4.3 刻意未改动的内容

- **开发计划正文**中关于「曾位于 `dataset_processing/`」的历史描述仍保留，便于对照 Phase 1.0 任务原文。
- **未**引入新的管线入口或清洗逻辑（归属 Phase 1.1–1.4）。

---

## 5. Git 记录

| 提交（短 SHA） | 时间（AuthorDate, +0800） | 说明 |
| --- | --- | --- |
| `d858dfa` | 2026-04-11 21:56:29 | `chore(pipeline): Phase 1.0 archive legacy filters to scripts/_archive` — 6 文件 rename + 3 份文档/规则路径修正 |
| `f1a5f8b` | 2026-04-11 22:00:38 | `docs(plan): mark Phase 1.0 archive todo as completed` — 计划 frontmatter 中 `p1-archive-old` 完成态 |

**合并**: `f9ef5ad` — `Merge pull request #1 from XYBuilds/feat/phase-1-0-archive-scripts`（将上述提交带入 `main`）。

---

## 6. 验证与复现方式

在仓库根目录执行（PowerShell 示例）：

```powershell
git log --oneline -1 f1a5f8b
Get-ChildItem scripts\_archive\*.py
Test-Path scripts\dataset_processing\*.py   # 预期：无匹配则 False；若目录不存在亦为预期
```

确认 `_archive` 下恰为 6 个 `.py`，且 `dataset_processing` 下不再有已归档脚本。

---

## 7. 后续工作（不在本报告范围）

- **Phase 1.1**：`scripts/run_pipeline.py` 单一入口与可配置参数（`--help`）。
- **Phase 1.2–1.4**：去重、强制剔除、动态阈值等写入新管线（逻辑可参考 `_archive` 内脚本，但实现为新代码路径）。

---

## 8. 附录：完整 `git show --stat`（主归档提交）

以下为 `d858dfa` 的统计摘要，便于审计与对照 PR diff：

```
9 files changed, 4 insertions(+), 4 deletions(-)
 .cursor/rules/python-pipeline.mdc
 docs/project_docs/TMDB 数据处理规则.md
 docs/project_docs/TMDB 电影宇宙 Tech Spec.md
 scripts/{dataset_processing => _archive}/filter_dynamic_baseline_vote_count.py
 scripts/{dataset_processing => _archive}/filter_genres_null.py
 scripts/{dataset_processing => _archive}/filter_release_date_null.py
 scripts/{dataset_processing => _archive}/filter_vote_average_zero_or_null.py
 scripts/{dataset_processing => _archive}/filter_vote_count_zero_or_null.py
 scripts/{dataset_processing => _archive}/merge_by_tconst.py
```
