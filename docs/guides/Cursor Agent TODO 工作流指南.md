# Cursor Agent TODO 工作流指南

本指南定义本项目中使用 Cursor Agent 处理计划 TODO 的标准流程。目标是减少重复 Git/GitHub 操作，同时保留“一任务一 Agent”和人工验收门禁。

规则来源：`.cursor/rules/agent-todo-workflow.mdc`。根目录 `.cursorrules` 已不再作为本流程的维护入口。

适用边界：该工作流只在执行 plan 中的 TODO，或你明确要求使用该流程时启用。普通小改、临时修正、只读排查、解释类任务可以直接处理，不需要先建分支或暂停验收。

## 适用场景

当一个 Agent 被分配到 plan 中明确、可完成的 TODO，或你明确要求使用该工作流时，使用本流程。探索性讨论、方案评估、只读排查、解释类任务、普通小改不需要完整执行此流程。

## 决策门禁

如果在 TODO 执行前或执行过程中出现任何需要用户判断的产品、技术、工作流、Git、依赖、范围、命名、数据、安全、部署或评审决策，Agent 必须先停下来询问你，再继续执行。不得自行猜测、默认选择或静默推进。

## 标准流程

1. **新建任务分支**
   - Agent 开始具体实现前，先拉取最新远端状态，切回 base 分支并快进同步：`git fetch origin`、`git switch main`、`git pull --ff-only origin main`，除非仓库默认分支被明确指定为其他名称。
   - 必须从更新后的本地 `main` 创建任务分支；Git 图上应表现为任务分支从 `main` 分出，完成后通过 PR 3-way merge 回到 `main`。
   - 命名格式：`prefix/p#.#-short-task-name`，其中 `prefix` 根据任务类型选择，例如 `feat`、`fix`、`docs`、`chore`、`refactor`；`p#.#` 对应 plan TODO 编号。
   - 禁止直接在 `main` / `master` 上实现任务。

2. **执行任务**
   - Agent 只修改当前 TODO 所需内容。
   - 不回退无关文件，不处理无关脏变更。
   - 按项目现有规则完成必要验证。

3. **暂停并等待验收**
   - 实现完成后，Agent 必须停止。
   - Agent 需要说明：做了什么、如何验证、剩余风险。
   - 在你明确回复 `Approved` 或 `通过` 前，Agent 不得提交、push、创建 PR、merge、写最终报告或调用收尾脚本。

4. **验收通过后写报告**
   - 只有收到明确验收通过后，Agent 才能在 `docs/reports/` 写本次任务报告。
   - 报告建议包含：任务目标、关键决策、实现摘要、验证结果、风险与后续项。

5. **调用自动收尾脚本**
   - 报告写完后，Agent 从项目根目录调用：

```bash
./finish_todo.sh "<commit and PR message>"
```

   - Windows 环境下，如果默认 `bash` 指向不可用的 WSL，必须显式使用 Git Bash，并通过环境变量传完整标题，避免 PowerShell / `bash -lc` 引号截断：

```powershell
$env:FINISH_TODO_MESSAGE='<commit and PR message>'
& "C:\Program Files\Git\bin\bash.exe" -lc './finish_todo.sh'
```

   - 不得因为本机 WSL 不可用就跳过 `finish_todo.sh`，也不得声称“已按相同步骤手动完成”来替代脚本；应改用 Git Bash 或其他可用的 Bash 兼容 shell。
   - 脚本会自动完成：`git add`、commit、push、创建 PR、等待/执行 merge、同步 `main`、删除本地任务分支。
   - 如果 GitHub 分支保护、required checks 或 required review 阻止合并，脚本会停住；Agent 应报告阻塞原因，不得绕过。

## 收尾脚本使用说明

脚本路径：`finish_todo.sh`

首次使用前，在 Git Bash / WSL / macOS / Linux shell 中赋予执行权限：

```bash
chmod +x finish_todo.sh
```

运行示例：

```bash
./finish_todo.sh "Add workflow automation SOP"
```

默认配置：

- base branch：自动读取 GitHub 默认分支，失败时回退到 `main`
- merge method：`merge`（GitHub 3-way merge）
- merge 行为：使用 GitHub auto-merge，尊重 required checks / required review

可选环境变量：

```bash
FINISH_TODO_BASE_BRANCH=main \
FINISH_TODO_MERGE_METHOD=merge \
FINISH_TODO_MERGE_TIMEOUT_SEC=1800 \
./finish_todo.sh "Finish accepted task"
```

## 必要前提

- 已安装并配置 Git。
- 已安装 GitHub CLI：`gh`。
- 已登录 GitHub CLI：

```bash
gh auth login
```

- 当前仓库配置了 `origin` remote。
- 当前分支不是 `main` / `master`。

## 人工验收原则

自动化只负责“验收后的机械收尾”。是否进入提交、PR 和 merge 阶段，仍由你在对话中明确批准。