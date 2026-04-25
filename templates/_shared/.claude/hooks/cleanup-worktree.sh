#!/bin/bash
# WorktreeRemove hook: removes the worktree and its branch cleanly.
#
# Input JSON fields (from Claude Code):
#   name            — agent name (e.g. "agent-a2033a4d")
#   cwd             — project root
#   worktree_path   — path to the worktree (if provided)
#   session_id      — current session ID
#   hook_event_name — "WorktreeRemove"
set -euo pipefail

INPUT=$(cat)
WORKTREE_PATH=$(echo "$INPUT" | jq -r '.worktree_path // ""')
if [ -z "$WORKTREE_PATH" ]; then
  NAME=$(echo "$INPUT" | jq -r '.name // ""')
  CWD=$(echo "$INPUT" | jq -r '.cwd // ""')
  if [ -n "$NAME" ] && [ -n "$CWD" ]; then
    WORKTREE_PATH="${CWD}/.claude/worktrees/${NAME}"
  fi
fi

if [ -z "$WORKTREE_PATH" ] || [ ! -d "$WORKTREE_PATH" ]; then
  exit 0
fi

# Remove the worktree (force removes uncommitted changes too — caller's
# decision to invoke this hook implies the changes were merged or discarded).
git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || rm -rf "$WORKTREE_PATH"

# Prune stale worktree references from .git/worktrees/
git worktree prune 2>/dev/null || true
