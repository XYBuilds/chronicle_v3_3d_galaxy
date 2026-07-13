---
name: execute-plan-todo
description: Execute one TODO from an accepted/current plan using a task branch, project-specific verification, human approval gates, status update, report, and PR merge. Use only for plan-driven TODO work or when the user explicitly requests this workflow.
---

# Execute Plan TODO

Execute exactly one plan TODO at a time. Read the repository's `.cursor/rules/workflow-adapter.mdc` before choosing branch names, test commands, report paths, or finalization automation.

## 1. Establish the task contract

- Locate the accepted/current plan and the exact TODO identifier.
- Read its scope, dependencies, acceptance criteria, and human-approval marker.
- If any consequential decision remains unresolved, stop and ask the user.
- Do not expand the TODO or combine unrelated work.

## 2. Check dependency and repository state

- Inspect the current branch, working tree, remote, and recent history.
- Preserve unrelated changes; stop only when they conflict with the TODO.
- Determine the branch base from the plan and project adapter.
- Default to the latest base branch. Use a stacked predecessor branch only when the plan or user explicitly authorizes stacked development, and record that dependency in the final report.

## 3. Create the task branch

- Fetch the remote and fast-forward the chosen base branch.
- Create a task branch using the project adapter's naming convention.
- Never work directly on `main` or `master`.

## 4. Implement and verify

- Make only the changes required by the TODO.
- Follow project architecture and local rules.
- Run the narrow relevant checks first, then any broader checks required by the adapter or acceptance criteria.
- If an unexpected compile or test failure remains after two evidence-driven repair attempts, stop and report the blocker instead of broadening changes blindly.

## 5. Save the implementation

- Review staged and unstaged changes and exclude secrets or unrelated files.
- Create the implementation commit only when the user has authorized commits.
- Use the repository's commit convention from its adapter or recent history.

## 6. Apply the human gate

If the TODO requires human approval:

- stop after implementation, verification, and the authorized implementation commit;
- report what changed, exact verification performed, remaining risk, and what the user must inspect;
- wait for explicit approval;
- before approval, do not mark the TODO complete, write the final report, push, create or merge a PR, or delete the branch.

If the user requests changes, implement them on the same task branch and repeat verification.

## 7. Complete plan state and report

After the required approval, or immediately when the accepted plan has no human gate:

- update the TODO's canonical status field to complete;
- write the report at the project adapter's path;
- include goal, key decisions, implementation, verification, branch inheritance if any, and known risks;
- keep plan/report changes separate from the implementation commit when the adapter requires it.

## 8. Publish and merge

Only when explicitly authorized:

- push the task branch;
- create a PR against the correct base;
- use the repository's required merge strategy and automation;
- respect checks, reviews, and branch protection;
- after merge, update the local base and remove the task branch only when safe.

If checks, reviews, or protection block completion, preserve the branch and report the blocker.