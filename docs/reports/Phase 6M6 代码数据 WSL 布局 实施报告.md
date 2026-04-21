# Phase 6M6 — 代码/数据 WSL 布局 实施报告

## 文档信息

| 项目 | 内容 |
| --- | --- |
| 对应计划 | [`.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md`](../../.cursor/plans/phase_6_gpu_migration_202aac8f.plan.md) |
| 里程碑 | **M6（§8.3.7）** — WSL ext4 工作区、原始数据同步、产物回写、CRLF/忽略规则 |
| 计划 Todo | **`m6-code-layout`** → **`completed`** |
| 开发分支 | **`phase-6-m6-wsl-layout`**（合入 `main` 后以 `git log` 为准） |
| 报告日期 | 2026-04-21 |

---

## 1. 目标摘要

在 **WSL2 Ubuntu** 中优先使用 **家目录下的 ext4 克隆**（如 `~/chronicle_v3_3d_galaxy`）跑 GPU 管线，避免长期在 **`/mnt/e/...`** 上直接读写带来的 **NTFS/exFAT I/O 劣势**；通过 **rsync** 在 Windows 挂载树与 WSL 克隆之间同步 **`data/raw`** 与 **`data/output/*.npy`、`frontend/public/data/galaxy_data.json(.gz)`**；统一 **shell 脚本的 LF** 与 **`data/raw` 的 gitignore**（含 **符号链接** 场景）。

---

## 2. 交付清单

| 序号 | 交付项 | 说明 |
| --- | --- | --- |
| 1 | **`scripts/env/sync_raw_from_windows.sh`** | 从 **`CHRONICLE_WIN_REPO`**（默认 `/mnt/e/projects/chronicle_v3_3d_galaxy`）将 **`data/raw/`** 同步到当前仓库（由脚本位置解析 **`REPO_ROOT`**）；大文件友好 **`--partial --inplace`**；支持 **`--dry-run`**。 |
| 2 | **`scripts/env/sync_artifacts_to_windows.sh`** | 将 **`data/output/*.npy`** 与存在的 **`galaxy_data.json` / `.json.gz`** 推回 Windows 侧同名路径；缺省时跳过并提示；支持 **`--dry-run`**。 |
| 3 | **`scripts/env/link_raw_from_windows.sh`** | **可选**：将 **`data/raw`** 做成指向 Windows **`data/raw`** 的 **symlink**（省盘、读仍走 `/mnt`）；若 **`data/raw`** 已存在且非链接则 **报错退出**，避免误覆盖。 |
| 4 | **`.gitattributes`** | **`scripts/env/*.sh`** 强制 **`text eol=lf`**，避免 Windows 检出 **CRLF** 导致 WSL 下 bash/shebang 异常。 |
| 5 | **`.gitignore`** | 将 **`data/raw/`** 调整为 **`data/raw`**，使 **目录与指向 `/mnt/...` 的 symlink** 均被忽略，降低误提交风险。 |
| 6 | **引导脚本提示** | **`bootstrap_wsl.sh`**、**`install_chronicle_conda_env.sh`** 在结束日志中增加 **M6 脚本名** 提示，便于 M1/M2 完成后接续操作。 |

---

## 3. 推荐工作流（WSL）

1. **克隆到 ext4**：`git clone … ~/chronicle_v3_3d_galaxy`（路径可自定，与默认 **`CHRONICLE_WIN_REPO`** 无关）。
2. **拉取大 CSV**：在克隆根目录执行 **`bash scripts/env/sync_raw_from_windows.sh`**（若 Windows 仓库不在 E: 盘，设置 **`CHRONICLE_WIN_REPO`**）。
3. **激活 conda** 并跑管线（见 M2/M7 文档）。
4. **回写产物**：**`bash scripts/env/sync_artifacts_to_windows.sh`**，然后在 Windows 侧 **`npm run dev`** 验前端。

---

## 4. 限制与后续

- **本报告不代替 M7**：未在会话内于真实 WSL 上执行 rsync/全链路冒烟；用户需在 **`chronicle`** 环境中本机验证。
- **`CHRONICLE_WIN_REPO`** 必须与 **本机 Windows 仓库挂载路径** 一致（盘符、用户名、仓库目录名）。

---

## 5. Plan 状态

已将 **`phase_6_gpu_migration_202aac8f.plan.md`** 中 **`m6-code-layout`** 标为 **`completed`**。
