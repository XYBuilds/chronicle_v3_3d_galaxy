# Phase 6M9 — GPU 迁移 **文档同步**（实施报告）

**关联计划：** [phase_6_gpu_migration_202aac8f.plan.md](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) — 里程碑 **M9（§8.3.10 + I6 联动）**  
**状态：** Plan 中 `m9-docs` 已标为 **completed**  
**日期：** 2026-04-22  
**代码提交（文档变更）：** `d62b40d`（根 `README` + Tech Spec）；其后的单提交为「**本报告** + `Phase 6M9 GPU 迁移 §8 总结报告.md` + plan 中 `m9-docs` 标完成」——在分支 `phase6-m9-docs-sync` 上执行 `git log --oneline d62b40d..HEAD` 可查看短哈希与说明。

---

## 1. 本次 M9 要解决什么

M1–M8 已把 UMAP 双后端（`umap-learn` / cuML）、管线 CLI、`meta.umap_params.densmap` 等**落地在代码与环境中**。M9 将上述事实**写回**对外/对内契约文档，使新协作者不读源码也能在 **Windows 回退路径** 与 **WSL + cuML 主路径** 间正确选路与排障，并保证 Tech Spec 与 `galaxy_data.json` schema 描述一致。

---

## 2. 对照 Plan 的完成项

| Plan 子项 | 内容 | 结果 |
|-----------|------|------|
| (a) | Tech Spec **§2**（数据管线/坐标生成）补充 **Backend：`umap-learn`（CPU, Windows）/ **RAPIDS cuML**（GPU, WSL）** | 已在 **§2.1** 增加两后端说明、与 `run_pipeline.py` 参数及版本 bump 约定；并收紧 **UMAP 随机种子** 表述（两栈 `random_state=42`；**同一后端**可比对；跨栈不保证同图） |
| (b) | 根 **README** 增加 **「运行管线」** 小节，含 WSL 首次 `bootstrap_wsl.sh` → conda `chronicle` → `run_pipeline.py` | 已新增仓库根目录 **`README.md`**，含 Windows / WSL2 / 前端三段 |
| (c) | `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` 更新 **`meta.umap_params.densmap` schema** | 已在 **§4.2** 表中将 `umap_params` 写为含 **`densmap` bool**，并与 `umap_projection.py` / 导出 **`--densmap`** 对齐 |
| (d) | 归档 **§8 总结**、为 Phase 6.0 I1–I6 下一份 plan 提供交接面 | 独立简页 [Phase 6M9 GPU 迁移 §8 总结报告.md](./Phase%206M9%20GPU%20%E8%BF%81%E7%A7%BB%20%C2%A7%38%20%E6%80%BB%E7%BB%93%E6%8A%A5%E5%91%8A.md)；详细交接仍见下文 **第 4 节** |

**说明：** 前端类型 **`frontend/src/types/galaxy.ts`** 在 M5 已增加 `UmapParams.densmap?`，M9 **未重复修改** 代码，仅与 Tech Spec 对齐。

---

## 3. 涉及文件清单

| 文件 | 变更性质 |
|------|----------|
| `docs/project_docs/TMDB 电影宇宙 Tech Spec.md` | §2.1 后端 + 可复现说明；§4.2 `umap_params` 与 `densmap` |
| `README.md`（新建于仓库根） | 项目简介 +「运行管线」（Windows / WSL / 前端） |
| `docs/reports/Phase 6M9 GPU 迁移 文档同步 实施报告.md` | 本文件：M9 完成项、交接摘要 |
| `docs/reports/Phase 6M9 GPU 迁移 §8 总结报告.md` | Plan (d) 简页，链回本文 + M1–M9 表 |
| `.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md` | `m9-docs` → **completed** |

---

## 4. Phase 6 §8 阶段交接摘要（供后续 I1–I6 / 新 plan 引用）

- **主路径（全量、DensMAP、大 `n_neighbors`）**：WSL2 Ubuntu、conda env **`chronicle`**（`scripts/env/rapids_env.yml` / `install_chronicle_conda_env.sh`）、`python scripts/run_pipeline.py --through-phase-2 --umap-backend cuml --densmap ...`；仓库在 WSL 家目录、产物可 **`sync_artifacts_to_windows.sh`** 回写 Windows 工作区。  
- **回退路径**：Windows **`.venv`** + `pip install -r requirements.txt` + **`umap-learn`**；`--cpu` 或 `--umap-backend umap` 显式锁 CPU。  
- **契约**：`meta.umap_params` 必含与导出一致的 **`densmap`**；换 UMAP 后端或不可比版本须 **bump 宇宙数据版本** 并记变更。  
- **更细的里程碑与命令**：见各 **`Phase 6M1`–`6M8`** 实施报告及 `docs/workflows/` 中相关流程说明。

---

## 5. 验证建议（轻量）

- 打开根 **`README.md`**，按「WSL2」小标题能否唯一映射到 `scripts/env/bootstrap_wsl.sh` 与 `rapids_env.yml`。  
- 在 **Tech Spec §2.1 / §4.2** 中检索 `densmap` 与 `umap-learn` / `cuml`，与当前 `export_galaxy_json.py` 的 `meta.umap_params` 结构一致即可。

---

## 6. 合入与分支

- 主分支合入时：合并分支 **`phase6-m9-docs-sync`**，或挑选提交 **`d62b40d`（根 README + Tech Spec）** 与**随后包含本报告、§8 总结、plan 完成的提交**即可。
