#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  ./finish_todo.sh "commit and PR message"

Purpose:
  Finish an approved TODO branch by committing, pushing, opening a PR, merging it,
  syncing the base branch, and deleting the local work branch.

Environment overrides:
  FINISH_TODO_BASE_BRANCH=main        Base branch to merge into.
  FINISH_TODO_MERGE_METHOD=squash     One of: squash, merge, rebase.
  FINISH_TODO_MERGE_TIMEOUT_SEC=1800  Wait time for auto-merge completion.
  FINISH_TODO_MERGE_POLL_SEC=10       Poll interval while waiting for merge.
USAGE
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

run() {
  echo "+ $*"
  "$@"
}

MESSAGE="${*:-}"
[[ -n "$MESSAGE" ]] || {
  usage
  fail "A commit/PR message is required."
}

require_command git
require_command gh

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "Not inside a Git repository."
cd "$REPO_ROOT"

gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated. Run: gh auth login"

git remote get-url origin >/dev/null 2>&1 || fail "Git remote 'origin' is not configured."

BASE_BRANCH="${FINISH_TODO_BASE_BRANCH:-}"
if [[ -z "$BASE_BRANCH" ]]; then
  BASE_BRANCH="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || true)"
fi
BASE_BRANCH="${BASE_BRANCH:-main}"

CURRENT_BRANCH="$(git branch --show-current)"
[[ -n "$CURRENT_BRANCH" ]] || fail "Detached HEAD is not supported. Switch to a task branch first."

case "$CURRENT_BRANCH" in
  "$BASE_BRANCH"|main|master)
    fail "Refusing to run on protected/base branch: $CURRENT_BRANCH"
    ;;
esac

if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
  run git add -A
else
  fail "No working tree changes found to commit."
fi

if git diff --cached --quiet; then
  fail "No staged changes found after git add."
fi

run git commit -m "$MESSAGE"
run git push -u origin "$CURRENT_BRANCH"

PR_NUMBER="$(gh pr view --head "$CURRENT_BRANCH" --json number --jq '.number' 2>/dev/null || true)"
if [[ -z "$PR_NUMBER" ]]; then
  PR_URL="$(gh pr create --base "$BASE_BRANCH" --head "$CURRENT_BRANCH" --title "$MESSAGE" --body "Automated completion for approved task branch: $CURRENT_BRANCH")"
  echo "Created PR: $PR_URL"
  PR_NUMBER="$(gh pr view "$PR_URL" --json number --jq '.number')"
else
  PR_URL="$(gh pr view "$PR_NUMBER" --json url --jq '.url')"
  echo "Reusing existing PR: $PR_URL"
fi

MERGE_METHOD="${FINISH_TODO_MERGE_METHOD:-squash}"
case "$MERGE_METHOD" in
  squash) MERGE_FLAG="--squash" ;;
  merge) MERGE_FLAG="--merge" ;;
  rebase) MERGE_FLAG="--rebase" ;;
  *) fail "Invalid FINISH_TODO_MERGE_METHOD: $MERGE_METHOD" ;;
esac

# --auto respects branch protection and required checks/reviews. If requirements
# are already satisfied, GitHub may merge immediately; otherwise it queues merge.
run gh pr merge "$PR_NUMBER" "$MERGE_FLAG" --auto --delete-branch

TIMEOUT_SEC="${FINISH_TODO_MERGE_TIMEOUT_SEC:-1800}"
POLL_SEC="${FINISH_TODO_MERGE_POLL_SEC:-10}"
DEADLINE=$((SECONDS + TIMEOUT_SEC))

while true; do
  PR_STATE="$(gh pr view "$PR_NUMBER" --json state --jq '.state')"
  if [[ "$PR_STATE" == "MERGED" ]]; then
    echo "PR #$PR_NUMBER merged."
    break
  fi

  if (( SECONDS >= DEADLINE )); then
    fail "PR #$PR_NUMBER is not merged yet after ${TIMEOUT_SEC}s. Auto-merge may still be pending; local branch was not deleted."
  fi

  echo "Waiting for PR #$PR_NUMBER to merge; current state: $PR_STATE"
  sleep "$POLL_SEC"
done

run git fetch origin
run git switch "$BASE_BRANCH"
run git pull --ff-only origin "$BASE_BRANCH"
run git branch -d "$CURRENT_BRANCH"

echo "Finished task branch '$CURRENT_BRANCH' into '$BASE_BRANCH'."