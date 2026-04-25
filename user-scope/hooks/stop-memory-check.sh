#!/bin/bash
# stop-memory-check.sh — lightweight stop gate for high-stakes signals only
# Blocks on unpushed commits (data loss risk). Advisory for everything else.
# Thorough reconciliation happens at SessionEnd, not here.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Skip if not in a git repo (no project state to protect)
if ! git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

INPUT=$(cat)

# Always allow on re-invocation (prevent infinite loop)
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_ACTIVE" = "true" ]; then
  exit 0
fi

REASONS=""

# 1. Unpushed commits? (high-stakes — data loss risk)
UNPUSHED=$(git -C "$PROJECT_DIR" log --oneline @{upstream}..HEAD 2>/dev/null | wc -l || echo "0")
if [ "$UNPUSHED" -gt 0 ]; then
  REASONS="${REASONS}- $UNPUSHED unpushed commits on current branch — push or confirm before stopping\n"
fi

# 2. Uncommitted changes in current dir or any worktree? (data loss risk)
# Bug fix: previously skipped PROJECT_DIR — the most-likely-dirty location.
DIRTY_WORKTREES=0
while IFS= read -r wt_line; do
  wt_path=$(echo "$wt_line" | awk '{print $1}')
  if git -C "$wt_path" diff --quiet 2>/dev/null && git -C "$wt_path" diff --cached --quiet 2>/dev/null; then
    : # clean
  else
    DIRTY_WORKTREES=$((DIRTY_WORKTREES + 1))
  fi
done < <(git -C "$PROJECT_DIR" worktree list 2>/dev/null)
if [ "$DIRTY_WORKTREES" -gt 0 ]; then
  REASONS="${REASONS}- $DIRTY_WORKTREES worktree(s) have uncommitted changes\n"
fi

# 3. Interrupted rebase/merge/cherry-pick? (data loss risk)
GIT_DIR=$(git -C "$PROJECT_DIR" rev-parse --git-dir 2>/dev/null)
if [ -n "$GIT_DIR" ]; then
  if [ -d "$GIT_DIR/rebase-merge" ] || [ -d "$GIT_DIR/rebase-apply" ]; then
    REASONS="${REASONS}- Rebase in progress — finish or abort before stopping\n"
  fi
  if [ -f "$GIT_DIR/MERGE_HEAD" ]; then
    REASONS="${REASONS}- Merge in progress — finish or abort before stopping\n"
  fi
  if [ -f "$GIT_DIR/CHERRY_PICK_HEAD" ]; then
    REASONS="${REASONS}- Cherry-pick in progress — finish or abort before stopping\n"
  fi
fi

# Only block on high-stakes signals
if [ -n "$REASONS" ]; then
  cat <<EOF
{
  "decision": "block",
  "reason": "Before finishing:\n${REASONS}\nConfirm these are handled, then stop."
}
EOF
  exit 0
fi

exit 0
