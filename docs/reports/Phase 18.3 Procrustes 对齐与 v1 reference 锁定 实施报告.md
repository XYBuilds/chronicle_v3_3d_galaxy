# Phase 18.3 — Procrustes 对齐 helper、`galaxy_v1_reference` 锁定与最终决策（实施报告）

**范围：** 为 P18.5 月度全量 refit 提供 **按 movie id 对齐到 v1 参考系** 的纯函数 `align_to_reference`；在数据库层禁止 `service_role` 对 **`galaxy_v1_reference`** 的常规 **UPDATE/DELETE**；配套单测与脚本侧守卫模块。前端契约不变。

**状态：** 代码已合入仓库实现（提交 **`c2bfafa`**，分支 **`p18.3-procrustes-helper`**）；远程 Supabase 上 **P18.3 迁移 SQL 已由你在控制台执行成功**（`Success. No rows returned` 为预期表现）。

---

## 1. 与 Phase 18 总计划的对齐

依据仓库内计划 [.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md](../../.cursor/plans/phase_18_data_infrastructure_9ccb7a3f.plan.md) 中 **P18.3** 条目：

| 计划要求 | 本阶段落实 |
|----------|------------|
| 新增 `align_to_reference(new_xy, new_ids, ref_xy_by_id)`，用 v1 中共有的 id 求正交变换 + 平移 + 缩放，应用到全部点 | 已实现于 `scripts/feature_engineering/procrustes_align.py`；数学形式见 §2（与计划伪代码在 **缩放因子** 上做了必要修正） |
| 单测：相似变换后恢复；加噪声后误差远小于未对齐对比；边界条件 | `scripts/tests/test_procrustes_align.py`，`unittest` 驱动 |
| `galaxy_v1_reference` 不可变：RLS 或脚本 assert | **DB：`REVOKE UPDATE, DELETE … FROM service_role`**（§3）；**脚本：`assert_not_v1_reference_mutation`**（§4） |
| P18.2 已 `ENABLE RLS` 但未单独完成「reference 不可写」 | 本阶段用 **权限撤销** 补齐（因 `service_role` **绕过 RLS**，仅靠策略无法约束 service key） |

**本阶段未做（按计划在后续 Phase）：** P18.4 nightly vote 刷新与 `export_from_supabase`；P18.5 在 monthly job 中 **实际调用** `align_to_reference` 并写回 `movies`；将 P18.1b `phase18_core_refit_benchmark.py` 内 `scipy.spatial.procrustes` 与 P18.3 helper **收敛为同一实现**（可选技术债，见 §7）。

---

## 2. 算法与数值决策（最终）

1. **目标**  
   给定一次新的 UMAP 平面坐标 `new_xy`（与 `new_ids` 行对齐），以及从 **`galaxy_v1_reference`**（或等价导出）构建的 **`ref_xy_by_id: dict[int, (x, y)]`**，求一个 **全局** 二维相似变换，使「在 reference 中出现的 id」所对应的新坐标尽可能贴近 v1 的 \((x,y)\)，并对 **所有行**（含尚无 v1 条目的新片 id）施加同一变换，供月度 refit 写回 `movies.x/y`。

2. **仅用共有 id 拟合**  
   `common_mask = (id in ref_xy_by_id)`；若 `sum(common_mask) < 2`，抛出 `ValueError`（无法稳定定标二维相似变换）。

3. **正交部分：`scipy.linalg.orthogonal_procrustes`**  
   在共有子集上中心化：`a_c = A - mean(A)`，`b_c = B - mean(B)`，求 `R` 最小化 \(\|a_c R - b_c\|_F\)，约束 \(R^\top R = I\)（允许反射）。

4. **均匀缩放：不得使用 `orthogonal_procrustes` 的第二个返回值作为相似缩放**  
   SciPy 文档中该标量为 **奇异值之和**等业务量，**不是**「把新云均匀缩放到 reference 云」的乘子。  
   **最终决策：** 在固定 `R` 下，令 `X = a_c @ R`，用闭式标量  
   \[
   c = \frac{\langle X, b_c\rangle_F}{\|X\|_F^2}
   \]  
   最小化 \(\|cX - b_c\|_F\)。  
   对 **全体** `new_xy` 行：  
   `aligned = c * (new_xy - a_mean) @ R + b_mean`  
   其中 `a_mean`、`b_mean` 为 **共有子集**上的均值（与计划伪代码一致）。

5. **输出 dtype**  
   内部 `float64` 计算，返回 **`float32`**，与现有 `umap_xy.npy` / 导出链路习惯一致。

6. **断言与可观测性**  
   共有子集 `A.shape == B.shape == (n_common, 2)`；`denom > 1e-30`；对齐结果全有限。符合仓库「显式断言 / 快速失败」准则。

---

## 3. 数据库与权限决策（最终）

1. **为何不用「仅 RLS」完成锁定**  
   Supabase 的 **`service_role` JWT 绕过 RLS**。P18.2 已对 `galaxy_v1_reference` 启用 RLS，但 **无法** 单靠 RLS 阻止持有 service key 的应用误 `UPDATE/DELETE`。

2. **最终手段：`REVOKE UPDATE, DELETE`**  
   迁移文件 [`supabase/migrations/20260505120000_p18_3_galaxy_v1_reference_immutable.sql`](../../supabase/migrations/20260505120000_p18_3_galaxy_v1_reference_immutable.sql) 对 **`service_role`** 执行：  
   `REVOKE UPDATE, DELETE ON TABLE public.galaxy_v1_reference FROM service_role;`  
   **保留 `INSERT`（一次性引导）与 `SELECT`（读 anchor）**（与 P18.2 的 `GRANT` 组合后仅剩允许的操作）。

3. **「宇宙重置」路径**  
   若将来必须重写 v1 anchor：**不得以应用 service key 走常规 UPDATE**，应使用 **表 owner / superuser** 在控制台或专用迁移中临时恢复权限或执行 DDL，并在文档中显式记录（与计划「专用脚本一次性重写」一致）。

4. **你在 Supabase 上的操作**  
   在 SQL Editor（或等价路径）中执行上述迁移全文，结果为 **`Success. No rows returned`** — **DDL 无行集返回属正常**，不代表未生效。

5. **建议自检（可选）**  
   用 **service role** 会话执行一条测试 `UPDATE`（勿在生产误改数据时可用 `WHERE false` 或只读副本）：应得到 **`permission denied for table galaxy_v1_reference`**。

---

## 4. 工程与仓库决策（最终）

1. **Git**  
   在分支 **`p18.3-procrustes-helper`** 上开发与提交；实现提交 **`c2bfafa`**（message：`feat(p18.3): Procrustes align_to_reference + lock galaxy_v1_reference`）。

2. **守卫模块路径**  
   最终文件为 [`scripts/galaxy_v1_reference_guard.py`](../../scripts/galaxy_v1_reference_guard.py)，**故意不放在 `scripts/supabase/` 包路径下**，避免与 PyPI 包 **`supabase`**（如 `from supabase import create_client`）在 `sys.path` 以 `scripts/` 为前缀时产生 **命名空间/导入歧义**。

3. **依赖**  
   [`requirements.cpu.txt`](../../requirements.cpu.txt) 增加显式 **`scipy>=1.11,<2`**（管线代码直接 `import scipy.linalg`；此前多由 `scikit-learn` 间接安装，现钉为直接依赖便于审计）。

4. **`initial_import` 文档**  
   [`scripts/supabase/initial_import.py`](../../scripts/supabase/initial_import.py) 模块 docstring 中增加对 P18.3 迁移与 `galaxy_v1_reference_guard` 的交叉引用，便于后续维护者理解「引导之后表即冻结」。

---

## 5. 交付物清单（路径）

| 路径 | 说明 |
|------|------|
| [`scripts/feature_engineering/procrustes_align.py`](../../scripts/feature_engineering/procrustes_align.py) | `align_to_reference` 实现 |
| [`scripts/tests/test_procrustes_align.py`](../../scripts/tests/test_procrustes_align.py) | 单测（相似变换恢复、噪声、部分锚点、锚点不足） |
| [`scripts/galaxy_v1_reference_guard.py`](../../scripts/galaxy_v1_reference_guard.py) | `assert_not_v1_reference_mutation(table, is_insert=…)` |
| [`supabase/migrations/20260505120000_p18_3_galaxy_v1_reference_immutable.sql`](../../supabase/migrations/20260505120000_p18_3_galaxy_v1_reference_immutable.sql) | `REVOKE` + `COMMENT ON TABLE` |
| [`requirements.cpu.txt`](../../requirements.cpu.txt) | `scipy` 显式版本范围 |
| [`scripts/supabase/initial_import.py`](../../scripts/supabase/initial_import.py) | docstring 补充 P18.3 说明 |

---

## 6. 本地验收操作（可复制）

```bash
# 单测（无需 Supabase）
python scripts/tests/test_procrustes_align.py -v
```

预期：四个用例全部 **ok**。

---

## 7. 与 P18.1b 的关系（记录，非本阶段阻塞）

[`scripts/experiments/phase18_core_refit_benchmark.py`](../../scripts/experiments/phase18_core_refit_benchmark.py) 当前仍使用 **`scipy.spatial.procrustes`** 做全点云形状对齐（与 P18.3 **按 id 子集 + 显式 dict reference** 的 API 不同）。  
**最终决策（本阶段）：** P18.3 交付 **独立、可单测的** `align_to_reference`，供 **P18.5** 正式接入；benchmark 与 monthly 路径的 **实现统一** 列为后续可选收敛项（与 Phase 18.1 实施报告中的说明方向一致）。

---

## 8. 出口验收对照（P18.3 子项）

- [x] `align_to_reference` 实现 + 形状 / 有限性断言  
- [x] 单测通过（本地 `unittest`）  
- [x] `galaxy_v1_reference` 对 `service_role` **UPDATE/DELETE** 已 **REVOKE**（远程已执行迁移）  
- [x] 脚本侧守卫模块与 `initial_import` 文档交叉引用  
- [ ] P18.5：monthly refit 实际调用本 helper 并写回 `movies`（后续 Phase）  
- [ ] （可选）P18.1b benchmark 与 P18.3 对齐逻辑统一（后续技术债）

---

## 9. 建议的下一步（产品 / 流水线）

1. **合并 Git 分支** `p18.3-procrustes-helper` → 默认开发分支，便于团队与 CI 一致。  
2. **P18.4**：nightly vote 刷新、`threshold_versions` 活跃行读取、pending 写入、导出 JSON。在任意通用「写表」封装处可调用 **`assert_not_v1_reference_mutation`**，防止误改 v1 表。  
3. **P18.5**：全量 refit 后从 Supabase 拉 `galaxy_v1_reference` 构建 `ref_xy_by_id`，调用 **`align_to_reference`**，将结果 **UPDATE** 到 **`movies`**（**不是** `galaxy_v1_reference`）。

---

*文档版本：与仓库 P18.3 实现及远程迁移执行结果一致；日期以提交与迁移文件时间戳为准。*
