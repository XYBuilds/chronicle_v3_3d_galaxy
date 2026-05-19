# Agent TODO 工作流自动化配置实施报告

## 任务目标

建立一套可条件触发的 Cursor Agent TODO 工作流，减少重复 Git/GitHub 收尾操作，同时保留人工验收门禁。

## 关键决策

- 将旧式根目录 `.cursorrules` 迁移为结构化 Cursor 规则：`.cursor/rules/agent-todo-workflow.mdc`。
- 规则保持 `alwaysApply: true`，但内容明确为条件触发，避免普通小改也被强制要求建分支和暂停验收。
- 工作流只在执行 plan 中的 TODO，或用户明确要求使用该流程时启用。
- 保留人工验收门禁：未收到 `Approved` 或 `通过` 前，不提交、不 push、不创建 PR、不 merge、不写最终报告、不运行收尾脚本。
- 自动收尾集中到 `finish_todo.sh`，由 GitHub CLI 创建 PR 并使用 auto-merge，尊重 required checks、required review 和 branch protection。

## 实施摘要

- 新增 `finish_todo.sh`：自动完成 add、commit、push、PR 创建、auto-merge、同步 base branch、删除本地任务分支。
- 新增 `.cursor/rules/agent-todo-workflow.mdc`：定义条件触发的 Agent SOP。
- 删除根目录 `.cursorrules`，避免旧规则入口与 `.cursor/rules` 规则重复维护。
- 新增 `docs/guides/Cursor Agent TODO 工作流指南.md`：记录工作流适用边界、执行步骤、脚本使用方式和前提条件。

## 验证

- 已确认 `finish_todo.sh` 已被赋予执行权限。
- 已读取确认 `.cursor/rules/agent-todo-workflow.mdc` 包含 frontmatter 和条件触发说明。
- 已读取确认 guide 中同步记录规则来源与适用边界。
- 已检查最近编辑的规则和 guide 文件诊断，未发现 linter 问题。

## 风险与后续

- 当前 Windows 环境中的 `bash` 指向 WSL，但 WSL2 未启用虚拟化，因此无法在该路径下用 `bash -n` 完成本机语法检查；脚本应在 Git Bash、可用 WSL、macOS 或 Linux shell 中运行。
- 如果 GitHub 仓库启用了 required checks 或 required review，`finish_todo.sh` 会等待或停住，不会绕过保护规则。