# Phase 36.1 / P36.1 星球图像导出计划与跨仓库契约 实施报告

## Scope

本报告对应 Phase 36 的 TODO `p36-plan-contract`（36.1）。本 TODO 的交付是冻结后续执行使用的跨仓库计划与契约，不包含 Planet Core、无 UI 导出场景或 Playwright CLI 的实现。

唯一正式 SSOT 为 [`.cursor/plans/phase_36_planet_export_9a0362be.plan.md`](../../.cursor/plans/phase_36_planet_export_9a0362be.plan.md)。计划 frontmatter 将 `p36-plan-contract` 标记为 `complete`；正文中出现的早期重复文件名 `phase_36_planet_image_export.plan.md` 不构成独立交付物。

## Implementation

正式计划已冻结以下 36.1 契约，供后续 TODO 按职责实现：

- Chronicle 导出边界为 `planet:export` CLI；stdout 仅输出一条机器可读成功 JSON，进度与诊断写入 stderr，并以非零退出码报告失败。
- 产物为透明 PNG 与同名 `*.render.json` metadata；写入采用临时文件后原子重命名，避免半成品。
- 数据源优先级固定为 `--data-file` → `--data-url` → manifest 所指向的版本化 R2 gzip。
- 导出默认构图为 3000×3000、正交相机、居中、固定世界到像素比例与 8% 每边留白；Bloom 支持 on/off，实施初始默认 off，最终默认值留待 36.5 人工验收决定。
- Daily Stargazing 只通过 CLI、PNG 与 JSON metadata 调用 Chronicle，并通过 `MOVIE_COSMOS_GALAXY_ROOT` 定位仓库，不硬编码盘符；两个仓库各自维护分支、测试、报告和 PR。
- 前置检查要求 Chronicle focus mesh/defaults 可构建、Daily `main.py publish` 测试基线通过，并确认两仓库不存在直接冲突的未合并实现。

## Verification

| 检查项 | 可验证结果 |
| :--- | :--- |
| 正式计划与 TODO 状态 | Pass — `.cursor/plans/phase_36_planet_export_9a0362be.plan.md` 存在，`p36-plan-contract` 为 `complete`；36.2–36.8 均为 `pending`。 |
| 契约内容 | Pass — 上述 CLI、数据源、产物、跨仓库边界及前置检查均在正式计划正文中明确。 |
| 36.1 Git 提交 | 未发现 — 当前分支 `feat/p36.1-planet-export-contract` 的 HEAD 与 `main` 同为 `896719a`，以 `p36`、`Phase 36`、`planet export` 搜索所有提交未返回结果。 |
| 工作树边界 | 已核对 — 当前未提交的 36.2+ / 36.3+ / 36.4+ 文件不作为本 TODO 完成证据；本报告未修改它们。 |
| Chronicle 构建与 Daily 测试基线 | 未执行 — 本次仅完成契约/计划状态核对与报告，不把未执行的前置检查记为已通过。 |

## Technical Debt & Caveats

- 本 TODO 的可验证完成依据是正式计划的契约冻结与 `complete` 状态，不是后续实现代码或提交；Phase 36 当前尚未有相关 Git 提交。
- 36.2、36.3、36.4 的工作树改动均保持在本报告范围外，后续 TODO 必须各自验证、报告并提交，不能回溯作为 36.1 的实现证据。
- 正式计划列出的 Chronicle 构建和 Daily `main.py publish` 测试前置检查尚未在本次核对中实际运行，后续执行前应单独取得基线结果。