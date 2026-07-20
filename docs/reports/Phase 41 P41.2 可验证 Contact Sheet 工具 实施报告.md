# Phase 41 · P41.2 可验证 Contact Sheet 工具实施报告

## 结论

P41.2 已完成技术验收。planet exporter 现在提供独立 contact-sheet 库和 CLI，可从显式矩阵 manifest 生成带图内标签的 PNG，并输出可复现、可校验的机器 manifest。

## 实现

- 新增 `tools/planet-exporter/src/contactSheet.ts`：
  - 输入模型明确 `title`、有序 rows/columns 和完整 cells。
  - 快速拒绝重复/未知/缺失格、重复 axis key、缺失或无效 PNG、尺寸/宽高比不一致，以及 NaN、Infinity、循环或非 JSON 参数。
  - 输入 cell 顺序在输出前规范化为 rows × columns 的 row-major 顺序；逻辑等价矩阵产生 byte-identical PNG 和 manifest。
  - 使用 `sharp` 将源 PNG 与安全转义后的 SVG 标签合成；总标题、行标签、列标签和 caption 均进入图像。
  - 输出源图/结果 SHA-256、尺寸、参数、Git commit、相对路径和复现命令。
  - PNG 与 manifest 通过临时文件、备份和回滚成对替换；提交成功后的备份清理为 best-effort，不会破坏新 pair。
- 新增 `contactSheetCommand.ts`，分别按 PowerShell 和 POSIX 规则安全引用命令参数。
- 新增 CLI：`npm run contact-sheet -- --input FILE.json --output-dir DIRECTORY [--working-dir DIRECTORY]`。
- 新增 `contactSheet.test.ts` 与 `contactSheetCommand.test.ts`，并将模块纳入 `tsconfig.check.json`。

## 验证

在 `tools/planet-exporter` 执行：

- `npm test`：16 个测试文件、112 个测试通过。
- `npm run typecheck`：通过。
- `npm run lint`：通过。
- `git diff --check`：通过。

测试覆盖正常矩阵、图内标签、稳定排序与 byte stability、输入与参数失败分支、PNG/manifest hash 对齐、manifest commit 失败回滚、backup cleanup 失败后的新 pair 保留，以及含空格和引号的复现命令。

## 范围边界

未改写 P39 历史证据，未把 P41.1 基线生成器强行转换为视觉矩阵，也未实现 P41.3 的 diagnostic override/profile。两个独立文件无法抵抗进程在两次 rename 之间被强制终止的系统级中断；正常运行时失败分支已具备回滚保护。